const functions = require('firebase-functions');
const admin = require('firebase-admin');
const https = require('https');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function hashPass(p) { return '$h:' + crypto.createHash('sha256').update(String(p), 'utf8').digest('hex'); }
function ilTime() { return new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }); }
function callerRole(context) { return (context.auth && context.auth.token && context.auth.token.role) || ''; }

// כתובת ה-IP האמיתית של הלקוח — האיבר הלפני-אחרון ב-x-forwarded-for
// (הראשונים ניתנים לזיוף ע"י הלקוח; האחרון הוא ה-LB של גוגל)
function callerIp(context) {
  try {
    const req = context.rawRequest;
    const xff = String(req.headers['x-forwarded-for'] || '');
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2];
    if (parts.length === 1) return parts[0];
    return (req.socket && req.socket.remoteAddress) || '';
  } catch (e) { return ''; }
}

function euclidean(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

// רשימת תבניות הפנים השמורות — faceDescriptors (מפת דגימות) או faceDescriptor בודד ישן
function storedDescriptors(src) {
  if (!src) return [];
  const raw = src.faceDescriptors ? Object.values(src.faceDescriptors) : (src.faceDescriptor ? [src.faceDescriptor] : []);
  return raw.filter(Boolean).map(d => Object.values(d).map(Number));
}

// הגדרות טלגרם — מ-functions:config:set telegram.token/chatid (לא ב-Firestore, לא בקוד לקוח)
function tgCfg() {
  const c = functions.config().telegram || {};
  return { token: c.token || '', chatId: c.chatid || '' };
}

// שולח הודעה לטלגרם
function sendTelegram(token, chatId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// שולח קובץ (CSV) לטלגרם כמסמך. מחזיר true רק אם Telegram אישר ok — משמש את הארכוב
// כדי לוודא שהנתונים נשמרו בהצלחה לפני שמוחקים אותם מ-Firestore.
async function sendTelegramDocument(token, chatId, filename, buffer, caption) {
  const fd = new FormData();
  fd.append('chat_id', chatId);
  if (caption) fd.append('caption', String(caption).slice(0, 1000));
  fd.append('document', new Blob([buffer], { type: 'text/csv' }), filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
  const j = await res.json().catch(() => ({}));
  return !!j.ok;
}

// ─── LOGIN — אימות בצד שרת + Custom Token עם role claim (שלב 2 אבטחה) ───
// קלט: {user, pass?} | {user, faceDescriptor?} | {user, registerDescriptors?} | {emergencyCode} | {user, faceFailAlert, photoB64?}
// פלט הצלחה: {token, worker, needFaceRegister?} | {needFace:true, name, faceUpdateAllowed}
// קודי שגיאה (ב-message): wrong | disabled | locked | ip | device | device-unknown | face-mismatch | no-face-update | emergency-wrong
async function regFail(credRef, creds) {
  try { await credRef.set({ failCount: (creds.failCount || 0) + 1, lastFail: Date.now() }, { merge: true }); } catch (e) {}
}
function sanitizeWorker(w) {
  const out = { ...w };
  delete out.pass; delete out.faceDescriptor; delete out.faceDescriptors; delete out.deviceId;
  return out;
}
exports.login = functions.https.onCall(async (data, context) => {
  const d = data || {};
  // ── ping לחימום הפונקציה (keepLoginWarm) — חוזר מיד, לפני כל לוגיקת אימות/נעילה/Firestore ──
  if (d.ping) return { pong: true };
  const { token: tgToken, chatId: tgChatId } = tgCfg();
  const tg = text => (tgToken && tgChatId) ? sendTelegram(tgToken, tgChatId, text).catch(() => {}) : Promise.resolve();

  // ── כניסת חירום ──
  if (d.emergencyCode !== undefined) {
    const cfgHash = (functions.config().app || {}).emergencyhash || '';
    const emRef = db.collection('credentials').doc('_emergency');
    const emSnap = await emRef.get();
    const em = emSnap.exists ? emSnap.data() : {};
    if ((em.failCount || 0) >= 5 && Date.now() - (em.lastFail || 0) < 10 * 60 * 1000) {
      throw new functions.https.HttpsError('resource-exhausted', 'locked');
    }
    if (!cfgHash || hashPass(String(d.emergencyCode)) !== cfgHash) {
      await regFail(emRef, em);
      await tg('🚨 TextileOps — קוד חירום שגוי!\n🕐 שעה: ' + ilTime() + '\nמישהו הזין קוד חירום לא נכון. ייתכן ניסיון פריצה!');
      throw new functions.https.HttpsError('permission-denied', 'emergency-wrong');
    }
    await emRef.set({ failCount: 0 }, { merge: true });
    const mq = await db.collection('workers').where('role', '==', 'manager').limit(1).get();
    const mgr = mq.empty ? { id: 'emergency', name: 'מנהל חירום', role: 'manager' } : { id: mq.docs[0].id, ...mq.docs[0].data() };
    const token = await admin.auth().createCustomToken(mgr.id, { role: 'manager' });
    await tg('✅ TextileOps — כניסת חירום בוצעה\n🕐 שעה: ' + ilTime() + '\nנכנס דרך קוד חירום כמנהל.');
    return { token, worker: sanitizeWorker({ ...mgr, role: 'manager' }) };
  }

  const user = String(d.user || '').trim();
  if (!user) throw new functions.https.HttpsError('invalid-argument', 'wrong');
  const q = await db.collection('workers').where('user', '==', user).limit(1).get();
  if (q.empty) throw new functions.https.HttpsError('permission-denied', 'wrong');
  const wDoc = q.docs[0];
  const w = { id: wDoc.id, ...wDoc.data() };
  const credRef = db.collection('credentials').doc(w.id);
  const credSnap = await credRef.get();
  const creds = credSnap.exists ? credSnap.data() : {};

  // ── התראת כשל זיהוי פנים (לא מחזירה טוקן; נשלחת אחרי 3 כשלונות) ──
  if (d.faceFailAlert) {
    const caption = '⚠️ TextileOps — זיהוי פנים נכשל\n👤 עובד: ' + (w.name || user) + '\n🕐 שעה: ' + ilTime() + '\nהעובד ניסה להיכנס 3 פעמים ולא זוהה.\nבדוק ואשר כניסה ידנית אם נדרש.';
    const b64 = String(d.photoB64 || '');
    if (b64 && b64.length < 9000000 && tgToken && tgChatId) {
      try {
        const fd = new FormData();
        fd.append('chat_id', tgChatId);
        fd.append('caption', caption);
        fd.append('photo', new Blob([Buffer.from(b64, 'base64')], { type: 'image/jpeg' }), 'face.jpg');
        await fetch(`https://api.telegram.org/bot${tgToken}/sendPhoto`, { method: 'POST', body: fd });
      } catch (e) { await tg(caption); }
    } else { await tg(caption); }
    return { ok: true };
  }

  // ── נעילה זמנית אחרי 5 כשלונות (חלון 60 שנ') ──
  if ((creds.failCount || 0) >= 5) {
    if (Date.now() - (creds.lastFail || 0) < 60 * 1000) {
      throw new functions.https.HttpsError('resource-exhausted', 'locked');
    }
    // חלון הנעילה עבר — איפוס המונה. בלי זה המונה נשאר גבוה לתמיד
    // וכל כישלון בודד חדש (טעות הקלדה אחת) נועל שוב מיד — מלכודת בלי יציאה.
    creds.failCount = 0;
    try { await credRef.set({ failCount: 0 }, { merge: true }); } catch (e) {}
  }
  if (w.disabled) throw new functions.https.HttpsError('permission-denied', 'disabled');

  // ── בדיקת רשת המפעל (IP בצד שרת — לא ניתן לעקיפה מהלקוח) ──
  if (w.requireFactoryIP) {
    const tgSet = await db.collection('appSettings').doc('telegramSettings').get();
    const factoryIP = (tgSet.exists && tgSet.data().factoryIP) || '';
    const ip = callerIp(context);
    if (factoryIP && ip && ip !== factoryIP) {
      await tg('⛔ TextileOps — ניסיון כניסה מחוץ למפעל\n👤 עובד: ' + w.name + '\n🌐 IP: ' + ip + '\n🕐 שעה: ' + ilTime() + '\nהעובד ניסה להיכנס מרשת שאינה רשת המפעל.');
      throw new functions.https.HttpsError('permission-denied', 'ip');
    }
  }

  // תבניות פנים: קודם credentials, אחרת שדות ישנים בworkers (טרום-מיגרציה)
  const faceSrc = storedDescriptors(creds).length ? creds : w;
  const hasFace = !!w.faceAuth && storedDescriptors(faceSrc).length > 0;
  let needFaceRegister = false;

  if (Array.isArray(d.faceDescriptor) && d.faceDescriptor.length >= 64) {
    // ── אימות פנים בצד שרת ──
    if (!hasFace) throw new functions.https.HttpsError('failed-precondition', 'wrong');
    const live = d.faceDescriptor.map(Number);
    const dist = Math.min(...storedDescriptors(faceSrc).map(s => euclidean(live, s)));
    if (!(dist < 0.55)) {
      await regFail(credRef, creds);
      throw new functions.https.HttpsError('permission-denied', 'face-mismatch');
    }
  } else if (Array.isArray(d.registerDescriptors) && d.registerDescriptors.length) {
    // ── רישום פנים מחדש בכניסה — רק אם המנהל אישר מראש ──
    if (!w.faceUpdateAllowed) throw new functions.https.HttpsError('permission-denied', 'no-face-update');
    await credRef.set({ faceDescriptors: Object.fromEntries(d.registerDescriptors.map((s, i) => [i, s.map(Number)])), faceDescriptor: FieldValue.delete() }, { merge: true });
    await wDoc.ref.set({ faceUpdateAllowed: false, faceRegistered: true, faceDescriptor: FieldValue.delete(), faceDescriptors: FieldValue.delete() }, { merge: true });
  } else if (d.pass !== undefined && String(d.pass).length) {
    // ── אימות סיסמה ──
    const stored = creds.pass !== undefined ? creds.pass : (w.pass || '');
    const p = String(d.pass);
    if (stored === hashPass(p)) { /* ok */ }
    else if (stored && !String(stored).startsWith('$h:') && stored === p) {
      // סיסמה ישנה בטקסט רגיל — שדרוג ל-hash
      await credRef.set({ pass: hashPass(p) }, { merge: true });
    } else {
      await regFail(credRef, creds);
      throw new functions.https.HttpsError('permission-denied', 'wrong');
    }
    // עובד עם פנים רשומות — סיסמה לבדה לא מספיקה, נדרש זיהוי פנים
    if (w.faceAuth && hasFace) return { needFace: true, name: w.name, faceUpdateAllowed: !!w.faceUpdateAllowed };
    if (w.faceAuth && !hasFace) needFaceRegister = true;
  } else {
    // אין סיסמה — אם יש זיהוי פנים רשום, הלקוח יפתח מצלמה
    if (hasFace) return { needFace: true, name: w.name, faceUpdateAllowed: !!w.faceUpdateAllowed };
    throw new functions.https.HttpsError('invalid-argument', 'missing-pass');
  }

  // ── נעילת מכשיר (בצד שרת) ──
  if (w.deviceBinding && w.role !== 'manager') {
    const dev = String(d.deviceId || '');
    if (!dev) throw new functions.https.HttpsError('failed-precondition', 'device-unknown');
    if (!creds.deviceId) {
      await credRef.set({ deviceId: dev }, { merge: true });
      await wDoc.ref.set({ deviceRegistered: true }, { merge: true });
    } else if (creds.deviceId !== dev) {
      await tg('⛔ TextileOps — ניסיון כניסה ממכשיר לא מורשה\n👤 עובד: ' + w.name + '\n🕐 שעה: ' + ilTime());
      throw new functions.https.HttpsError('permission-denied', 'device');
    }
  }

  await credRef.set({ failCount: 0 }, { merge: true });
  const role = w.role || 'worker';
  const token = await admin.auth().createCustomToken(w.id, { role });
  return { token, worker: sanitizeWorker(w), needFaceRegister };
});

// ─── ניהול סודות כניסה — סיסמה/מכשיר/פנים (credentials חסומה לגמרי ללקוח) ───
exports.updateCredentials = functions.https.onCall(async (data, context) => {
  const role = callerRole(context);
  if (!role) throw new functions.https.HttpsError('unauthenticated', 'יש להתחבר תחילה');
  const d = data || {};
  const targetId = String(d.targetId || '');
  if (!targetId || targetId === '_emergency') throw new functions.https.HttpsError('invalid-argument', 'עובד לא תקין');
  if (d.action === 'setPassword') {
    if (role !== 'manager') throw new functions.https.HttpsError('permission-denied', 'מנהל בלבד');
    const p = String(d.newPass || '').trim();
    if (!p) throw new functions.https.HttpsError('invalid-argument', 'סיסמה ריקה');
    await db.collection('credentials').doc(targetId).set({ pass: hashPass(p) }, { merge: true });
    return { ok: true };
  }
  if (d.action === 'resetDevice') {
    if (role !== 'manager') throw new functions.https.HttpsError('permission-denied', 'מנהל בלבד');
    await db.collection('credentials').doc(targetId).set({ deviceId: FieldValue.delete() }, { merge: true });
    await db.collection('workers').doc(targetId).set({ deviceRegistered: false }, { merge: true });
    return { ok: true };
  }
  if (d.action === 'registerFace') {
    if (role !== 'manager' && context.auth.uid !== targetId) throw new functions.https.HttpsError('permission-denied', 'אין הרשאה');
    const samples = d.descriptors;
    if (!Array.isArray(samples) || !samples.length || !samples.every(s => Array.isArray(s))) throw new functions.https.HttpsError('invalid-argument', 'דגימות חסרות');
    await db.collection('credentials').doc(targetId).set({ faceDescriptors: Object.fromEntries(samples.map((s, i) => [i, s.map(Number)])), faceDescriptor: FieldValue.delete() }, { merge: true });
    await db.collection('workers').doc(targetId).set({ faceRegistered: true, faceUpdateAllowed: false, faceDescriptor: FieldValue.delete(), faceDescriptors: FieldValue.delete() }, { merge: true });
    return { ok: true };
  }
  throw new functions.https.HttpsError('invalid-argument', 'פעולה לא מוכרת');
});

// ─── מיגרציה חד-פעמית לשלב 2 — מוגנת במפתח מ-config (app.migratekey) ───
// מעביר hashes/תבניות פנים ל-credentials, מאפס deviceId (מעבר לזיהוי UUID),
// מוסיף שדות מירור (faceRegistered/deviceRegistered), ומעביר costs ל-adminSettings
exports.migratePhase2 = functions.https.onCall(async (data, context) => {
  const key = (functions.config().app || {}).migratekey || '';
  if (!key || String(data && data.key) !== key) throw new functions.https.HttpsError('permission-denied', 'מפתח שגוי');
  const snap = await db.collection('workers').get();
  let migrated = 0;
  for (const doc of snap.docs) {
    const w = doc.data();
    const creds = {};
    if (w.pass !== undefined) creds.pass = w.pass;
    if (w.faceDescriptor !== undefined) creds.faceDescriptor = w.faceDescriptor;
    if (w.faceDescriptors !== undefined) creds.faceDescriptors = w.faceDescriptors;
    if (Object.keys(creds).length) await db.collection('credentials').doc(doc.id).set(creds, { merge: true });
    await doc.ref.update({
      pass: FieldValue.delete(), faceDescriptor: FieldValue.delete(), faceDescriptors: FieldValue.delete(), deviceId: FieldValue.delete(),
      faceRegistered: !!(w.faceDescriptor || (w.faceDescriptors && Object.keys(w.faceDescriptors).length)),
      deviceRegistered: false
    });
    migrated++;
  }
  const costs = await db.collection('appSettings').doc('costs').get();
  let costsMoved = false;
  if (costs.exists) {
    await db.collection('adminSettings').doc('costs').set(costs.data());
    await costs.ref.delete();
    costsMoved = true;
  }
  return { ok: true, workers: migrated, costsMoved };
});

// שליחת Push Notification
exports.sendPush = functions.https.onCall(async (data, context) => {
  if (!callerRole(context)) throw new functions.https.HttpsError('unauthenticated', 'יש להתחבר תחילה');
  const { title, body, alertType } = data;
  try {
    const settingsSnap = await db.collection('appSettings').doc('pushSettings').get();
    if (!settingsSnap.exists) return { sent: false, reason: 'no settings' };
    const settings = settingsSnap.data();
    if (!settings.enabled) return { sent: false, reason: 'disabled' };

    // בדוק אם סוג ההתראה מופעל
    const alertPrefs = settings.alertPrefs || {};
    if (alertType && alertPrefs[alertType] === false) return { sent: false, reason: 'alert type disabled' };

    const tokens = settings.tokens || {};
    const tokenList = Object.values(tokens).map(t=>typeof t==='string'?t:t?.token).filter(Boolean);
    if (!tokenList.length) return { sent: false, reason: 'no tokens' };

    // שלח לכל הטוקנים הרשומים
    const results = await Promise.allSettled(tokenList.map(token =>
      admin.messaging().send({
        token,
        notification: { title, body },
        android: { priority: 'high', notification: { sound: 'default', channelId: 'textileops' } },
        webpush: { notification: { icon: 'https://amtextile2222-beep.github.io/textileops/icon-192.png', requireInteraction: false, vibrate: [200, 100, 200] } }
      })
    ));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return { sent: sent > 0, count: sent };
  } catch (e) {
    console.error('sendPush error:', e);
    return { sent: false, error: e.message };
  }
});

// שליחת Push לעובד ספציפי
exports.sendPushToWorker = functions.https.onCall(async (data, context) => {
  if (!callerRole(context)) throw new functions.https.HttpsError('unauthenticated', 'יש להתחבר תחילה');
  const { workerId, title, body } = data;
  try {
    const workerSnap = await db.collection('workers').doc(workerId).get();
    if (!workerSnap.exists) return { sent: false, reason: 'worker not found' };
    const token = workerSnap.data().fcmToken;
    if (!token) return { sent: false, reason: 'no fcm token' };
    await admin.messaging().send({
      token,
      notification: { title, body },
      android: { priority: 'high', notification: { sound: 'default', channelId: 'textileops' } },
      apns: { payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } }, headers: { 'apns-priority': '10', 'apns-push-type': 'alert' } },
      webpush: { notification: { icon: 'https://amtextile2222-beep.github.io/textileops/icon-192.png', requireInteraction: true, vibrate: [200, 100, 200] } }
    });
    return { sent: true };
  } catch (e) {
    console.error('sendPushToWorker error:', e);
    return { sent: false, error: e.message };
  }
});

// שליחת טלגרם מהלקוח — ה-token נשאר בצד השרת בלבד
// kind: 'message' {text} | 'photo' {dataB64, caption} | 'document' {dataB64, filename, caption}
exports.tgSend = functions.https.onCall(async (data, context) => {
  if (!callerRole(context)) throw new functions.https.HttpsError('unauthenticated', 'יש להתחבר תחילה');
  const { token, chatId } = tgCfg();
  if (!token || !chatId) throw new functions.https.HttpsError('failed-precondition', 'הגדרות טלגרם חסרות בשרת');
  const kind = data && data.kind;
  try {
    if (kind === 'message') {
      const text = String(data.text || '').slice(0, 4000);
      if (!text) throw new functions.https.HttpsError('invalid-argument', 'טקסט ריק');
      await sendTelegram(token, chatId, text);
      return { ok: true };
    }
    if (kind === 'photo' || kind === 'document') {
      const b64 = String(data.dataB64 || '');
      if (!b64 || b64.length > 9000000) throw new functions.https.HttpsError('invalid-argument', 'קובץ חסר או גדול מדי');
      const buf = Buffer.from(b64, 'base64');
      const fd = new FormData();
      fd.append('chat_id', chatId);
      if (data.caption) fd.append('caption', String(data.caption).slice(0, 1000));
      if (kind === 'photo') {
        fd.append('photo', new Blob([buf], { type: 'image/jpeg' }), 'image.jpg');
      } else {
        fd.append('document', new Blob([buf]), String(data.filename || 'file.csv'));
      }
      const res = await fetch(`https://api.telegram.org/bot${token}/send${kind === 'photo' ? 'Photo' : 'Document'}`, { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      return { ok: !!j.ok };
    }
    throw new functions.https.HttpsError('invalid-argument', 'סוג שליחה לא מוכר');
  } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error('tgSend error:', e);
    throw new functions.https.HttpsError('internal', e.message || 'שגיאת טלגרם');
  }
});

// עוזר AI — proxy מאובטח ל-AnythingLLM (רץ עכשיו על שרת Railway קבוע, לא על Tunnel מקומי)
// כתובת/מפתח/slug מגיעים מ-`firebase functions:config:set anythingllm.*` — לא מקודדים בקובץ הזה
exports.aiChat = functions.https.onCall(async (data, context) => {
  const role = callerRole(context);
  if (!role) throw new functions.https.HttpsError('unauthenticated', 'יש להתחבר תחילה');
  if (role !== 'manager') {
    // אחראי מורשה רק אם המנהל הפעיל זאת בהגדרות
    let supervisorAllowed = false;
    if (role === 'supervisor') {
      try {
        const ai = await db.collection('appSettings').doc('aiSettings').get();
        supervisorAllowed = !!(ai.exists && ai.data().supervisorAccess);
      } catch (e) {}
    }
    if (!supervisorAllowed) throw new functions.https.HttpsError('permission-denied', 'עוזר AI זמין למנהל בלבד');
  }
  const message = String(data && data.message || '').slice(0, 8000);
  if (!message) throw new functions.https.HttpsError('invalid-argument', 'הודעה ריקה');
  try {
    const cfg = functions.config().anythingllm || {};
    const aiUrl = cfg.url || '';
    const aiKey = cfg.key || '';
    const aiSlug = cfg.slug || '';
    if (!aiUrl || !aiKey || !aiSlug) throw new functions.https.HttpsError('failed-precondition', 'הגדרות שרת AI חסרות');
    // /chat (לא-סטרימינג) מחזיר textResponse ריק בהתקנה הזו — משתמשים ב-/stream-chat
    // ומרכיבים את הטקסט מה-chunks בצד השרת (בלי לחשוף streaming ללקוח)
    const res = await fetch(`${aiUrl.replace(/\/$/, '')}/api/v1/workspace/${aiSlug}/stream-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiKey },
      body: JSON.stringify({ message, mode: 'chat' })
    });
    const raw = await res.text();
    let full = '';
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try {
        const obj = JSON.parse(line.slice(5).trim());
        if (obj.textResponse && obj.type === 'textResponseChunk') full += obj.textResponse;
      } catch (e) {}
    }
    return { textResponse: full || 'לא התקבלה תשובה' };
  } catch (e) {
    console.error('aiChat error:', e);
    throw new functions.https.HttpsError('internal', e.message || 'שגיאת AI');
  }
});

// ─── שמירת פונקציית login "חמה" בשעות העבודה (מונע cold-start / "מאמת..." ארוך) ───
// רץ כל 2 דקות בין 06:00-15:59 שעון ישראל (מכסה 6:10-15:20). מחוץ לחלון login מתקררת כרגיל.
// שולח ping ל-login עצמה כדי להשאיר מופע חי; ה-ping מזוהה בתחילת login וחוזר מיד.
exports.keepLoginWarm = functions.pubsub.schedule('*/2 6-15 * * *').timeZone('Asia/Jerusalem').onRun(() => {
  return new Promise(resolve => {
    const body = JSON.stringify({ data: { ping: true } });
    const req = https.request({
      hostname: 'us-central1-textileops-aef4a.cloudfunctions.net',
      path: '/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.on('data', () => {}); res.on('end', () => resolve(null)); });
    req.on('error', e => { console.error('keepLoginWarm ping error:', e.message); resolve(null); });
    req.write(body);
    req.end();
  });
});

// בדיקת משימות ארוכות כל 5 דקות
exports.longTaskMonitor = functions.pubsub.schedule('every 5 minutes').onRun(async () => {
  try {
    const settingsSnap = await db.collection('appSettings').doc('telegramSettings').get();
    const thresh = settingsSnap.exists ? (settingsSnap.data().thresh || 60) : 60;
    const threshMs = thresh * 60 * 1000;

    const pushSnap = await db.collection('appSettings').doc('pushSettings').get();
    const pushEnabled = pushSnap.exists && pushSnap.data().enabled;
    const alertPrefs = pushSnap.exists ? (pushSnap.data().alertPrefs || {}) : {};
    if (!pushEnabled || alertPrefs['task_long'] === false) return null;

    const tasksSnap = await db.collection('activeTasks').get();
    const now = Date.now();
    for (const doc of tasksSnap.docs) {
      const t = doc.data();
      if (!t.startTime || !t.workerId) continue;
      const start = new Date(t.startTime).getTime();
      const elapsed = now - start;
      if (elapsed < threshMs) continue;

      // שלח רק פעם אחת — בדוק אם כבר שלחנו התראה
      const alertKey = 'longAlert_' + doc.id;
      const alertSnap = await db.collection('taskAlerts').doc(alertKey).get();
      if (alertSnap.exists) continue;

      const workerSnap = await db.collection('workers').doc(t.workerId).get();
      if (!workerSnap.exists) continue;
      const workerData = workerSnap.data();
      const fcmToken = workerData.fcmToken;
      if (!fcmToken) continue;
      const pushPrefs = workerData.pushPrefs || {};
      if (pushPrefs.task_long === false) continue;

      const mins = Math.round(elapsed / 60000);
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: '⚠️ משימה ארוכה',
          body: 'המשימה שלך פעילה כבר ' + mins + ' דקות'
        },
        android: { priority: 'high', notification: { sound: 'default', channelId: 'textileops' } },
        webpush: { notification: { icon: 'https://amtextile2222-beep.github.io/textileops/icon-192.png', requireInteraction: true } }
      });
      await db.collection('taskAlerts').doc(alertKey).set({ sent: true, ts: now, taskId: doc.id });
      console.log('longTaskMonitor: sent alert for task', doc.id);
    }
  } catch (e) {
    console.error('longTaskMonitor error:', e);
  }
  return null;
});

// בדיקת WiFi כל 5 דקות
exports.wifiMonitor = functions.pubsub.schedule('every 5 minutes').onRun(async () => {
  try {
    // קרא הגדרות טלגרם
    const settingsSnap = await db.collection('appSettings').doc('telegramSettings').get();
    if (!settingsSnap.exists) return null;
    const settings = settingsSnap.data();
    const { factoryIP, waEnabled } = settings;
    const { token: waToken, chatId: waChatId } = tgCfg();
    if (!waEnabled || !waToken || !waChatId || !factoryIP) return null;

    // קרא את כל העובדים שבפנים
    const workersSnap = await db.collection('workers').where('status', '==', 'in').get();
    if (workersSnap.empty) return null;

    const now = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

    for (const doc of workersSnap.docs) {
      const w = doc.data();
      if (!w.requireFactoryIP) continue;

      // קרא IP אחרון של העובד
      const wifiSnap = await db.collection('workerWifi').doc(w.id).get();
      if (!wifiSnap.exists) continue;
      const wifi = wifiSnap.data();

      // אם לא עדכן ב-15 דקות — לא ידוע, דלג (הטלפון ישן)
      if (!wifi.lastSeen || Date.now() - wifi.lastSeen > 15 * 60 * 1000) continue;

      const wifiAlertDoc = db.collection('wifiAlerts').doc(w.id);
      const alertSnap = await wifiAlertDoc.get();
      const alertSent = alertSnap.exists ? alertSnap.data().sent : false;

      if (wifi.ip !== factoryIP) {
        // IP שונה מהמפעל — יצא מהרשת
        if (!alertSent) {
          await sendTelegram(waToken, waChatId,
            `📡 TextileOps — עובד יצא מרשת המפעל\n👤 עובד: ${w.name}\n🏭 מחלקה: ${w.dept}\n🌐 IP נוכחי: ${wifi.ip}\n🕐 שעה: ${now}`
          );
          await wifiAlertDoc.set({ sent: true });
        }
      } else {
        // חזר לרשת המפעל — אפס התראה
        if (alertSent) {
          await sendTelegram(waToken, waChatId,
            `✅ TextileOps — עובד חזר לרשת המפעל\n👤 עובד: ${w.name}\n🕐 שעה: ${now}`
          );
          await wifiAlertDoc.set({ sent: false });
        }
      }
    }
  } catch (e) {
    console.error('wifiMonitor error:', e);
  }
  return null;
});

// ─── ארכוב היסטוריית משימות ישנה — חודשי (1 בחודש, 03:00) ───
// שולף משימות מעל ARCHIVE_AFTER_DAYS יום, שולח CSV לטלגרם, ומוחק רק אחרי אישור שליחה.
// חלון חי בלקוח = 14 יום; שמירה ב-Firestore עד 60 יום; מעבר לכך — בקבצי CSV אצל המנהל.
const ARCHIVE_AFTER_DAYS = 60;
const ARCHIVE_MAX_DOCS = 8000;
async function runArchive() {
  const { token, chatId } = tgCfg();
  if (!token || !chatId) return { ok: false, reason: 'telegram config missing' };
  const cutoffISO = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 86400000).toISOString();

  // שליפת המשימות הישנות (הישנות ביותר קודם), בעימוד
  const docs = [];
  let last = null;
  while (docs.length < ARCHIVE_MAX_DOCS) {
    let qy = db.collection('histTasks').where('endTime', '<', cutoffISO).orderBy('endTime').limit(500);
    if (last) qy = qy.startAfter(last);
    const snap = await qy.get();
    if (snap.empty) break;
    snap.docs.forEach(d => docs.push(d));
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
  if (!docs.length) return { ok: true, archived: 0 };

  // בניית CSV (זמנים/תאריכים בשעון ישראל)
  const q = v => {
    const s = (v == null ? '' : String(v)).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const ilDate = x => x ? x.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' }) : '';
  const ilTime = x => x ? x.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }) : '';
  const header = ['תאריך', 'עובד', 'מחלקה', 'לקוח', 'מוצר', 'מידה', 'כמות', 'צבע', 'סוג משימה', 'התחלה', 'סיום', 'משך (דק)', 'ברקוד'];
  const lines = [header.join(',')];
  for (const d of docs) {
    const t = d.data();
    const st = t.startTime ? new Date(t.startTime) : null;
    const et = t.endTime ? new Date(t.endTime) : null;
    lines.push([
      q(ilDate(et || st)), q(t.workerName), q(t.dept), q(t.cust), q(t.prod), q(t.size),
      t.qty || 0, q(t.col), q(t.taskType), q(ilTime(st)), q(ilTime(et)),
      Math.round((t.duration || 0) / 60), q(t.bc)
    ].join(','));
  }
  const csv = '﻿' + 'sep=,\n' + lines.join('\n');
  const buffer = Buffer.from(csv, 'utf8');

  const monthLabel = new Date().toISOString().slice(0, 7);
  const filename = `TextileOps_archive_${monthLabel}.csv`;
  const caption = `🗄️ TextileOps — ארכוב היסטוריית משימות\n${docs.length} משימות מעל ${ARCHIVE_AFTER_DAYS} יום\n⚠️ שמור קובץ זה — הנתונים נמחקים מהמערכת החיה.`;

  // שליחה לטלגרם — מחיקה מתבצעת אך ורק אם השליחה אושרה
  const sent = await sendTelegramDocument(token, chatId, filename, buffer, caption);
  if (!sent) return { ok: false, reason: 'telegram send failed', found: docs.length };

  // מחיקה באצוות של 500
  let deleted = 0;
  for (let i = 0; i < docs.length; i += 500) {
    const batch = db.batch();
    docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(500, docs.length - i);
  }
  return { ok: true, archived: deleted, filename };
}
exports.archiveOldTasks = functions.pubsub.schedule('0 3 1 * *').timeZone('Asia/Jerusalem').onRun(async () => {
  try {
    const r = await runArchive();
    console.log('archiveOldTasks:', JSON.stringify(r));
  } catch (e) {
    console.error('archiveOldTasks error:', e);
  }
  return null;
});
// טריגר ידני למנהל — ארכוב מיידי (גם לבדיקה)
exports.archiveOldTasksNow = functions.https.onCall(async (data, context) => {
  if (callerRole(context) !== 'manager') throw new functions.https.HttpsError('permission-denied', 'מנהל בלבד');
  try {
    return await runArchive();
  } catch (e) {
    console.error('archiveOldTasksNow error:', e);
    throw new functions.https.HttpsError('internal', e.message || 'שגיאת ארכוב');
  }
});

// ─── סגירת נוכחות ומשימות מהשרת — "נתוני נוכחות אמינים" ─────────────
// הבעיה: רשומת נוכחות בלי חתימת יציאה חושבה עד "עכשיו" של הבוקר שאחרי (22-30 שעות),
// ומשימות שנשארו רצות נעצרו רק ע"י "רשת ביטחון" בדפדפן פתוח (משימת 18 שעות של 30/06).
// הפתרון: ריצה יומית מהשרת ב-23:30 שסוגרת הכל בשעת סוף המשמרת + מתקנת רשומות מנופחות.

// תאריך IL (YYYY-MM-DD) של רגע נתון
function ilDateOf(iso) { return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' }); }
// Date של "תאריך+שעה" בשעון ישראל (מטפל בקיץ/חורף)
function ilDateTime(dateStr, timeStr) {
  const guess = new Date(`${dateStr}T${timeStr}:00+03:00`);
  const back = guess.toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  if (back.startsWith(`${dateStr} ${timeStr}`)) return guess;
  return new Date(`${dateStr}T${timeStr}:00+02:00`);
}
// נטו שעות עבודה: sessions פתוחות נחתכות ב-cutoff, בניכוי חלון ההפסקה
function calcNetCapped(rec, cutoffMs) {
  const sessions = (rec.sessions && rec.sessions.length) ? rec.sessions : (rec.checkin ? [{ in: rec.checkin, out: rec.checkout || null }] : []);
  let total = 0;
  for (const s of sessions) {
    if (!s.in) continue;
    const ci = new Date(s.in).getTime();
    const co = s.out ? new Date(s.out).getTime() : cutoffMs;
    let dur = co - ci;
    if (rec.breakActive && rec.breakStart && rec.breakEnd) {
      const dStr = ilDateOf(s.in);
      const bs = ilDateTime(dStr, rec.breakStart).getTime();
      const be = ilDateTime(dStr, rec.breakEnd).getTime();
      if (be > bs) { const os = Math.max(ci, bs); const oe = Math.min(co, be); if (oe > os) dur -= (oe - os); }
    }
    total += Math.max(0, dur);
  }
  return total;
}

async function runAttendanceCloser() {
  const setSnap = await db.collection('appSettings').doc('telegramSettings').get();
  const shiftEnd = (setSnap.exists && setSnap.data().shiftEnd) || '15:00';
  const closed = [], pausedNames = [];
  let repaired = 0;

  // 1) עובדים שלא חתמו יציאה — סגירת רשומת הנוכחות בשעת סוף המשמרת
  const workersSnap = await db.collection('workers').where('status', '==', 'in').get();
  for (const doc of workersSnap.docs) {
    const w = doc.data();
    const firstIn = (w.sessions && w.sessions[0] && w.sessions[0].in) || w.checkin;
    if (!firstIn) continue;
    const day = ilDateOf(firstIn);
    const cutISO = ilDateTime(day, shiftEnd).toISOString();
    const cutMs = new Date(cutISO).getTime();
    if (Date.now() < cutMs) continue; // המשמרת עוד לא נגמרה — לא נוגעים
    const histRef = db.collection('attHistory').doc(w.id + '_' + day);
    const histSnap = await histRef.get();
    if (histSnap.exists && histSnap.data().checkout) continue; // יש יציאה אמיתית
    const baseSessions = (w.sessions && w.sessions.length) ? w.sessions : [{ in: firstIn, out: null }];
    const rec = {
      workerId: w.id, workerName: w.name || '', dept: w.dept || '', date: day,
      sessions: baseSessions.map(s => s.out ? s : { ...s, out: cutISO }),
      checkin: baseSessions[0].in, checkout: cutISO,
      breakStart: w.breakStart || '', breakEnd: w.breakEnd || '', breakActive: !!w.breakActive,
      autoClosed: true,
      netMs: calcNetCapped({ ...w, sessions: baseSessions }, cutMs)
    };
    await histRef.set(rec);
    closed.push(w.name || w.id);
    // לא נוגעים במסמך העובד — האיפוס היומי בלקוח מנקה אותו בבוקר
  }

  // 2) ריפוי-עצמי: רשומות היסטוריות מנופחות (מעל 12 שעות נטו) — חיתוך בסוף המשמרת של אותו יום
  const inflSnap = await db.collection('attHistory').where('netMs', '>', 12 * 3600000).get();
  for (const doc of inflSnap.docs) {
    const r = doc.data();
    if (!r.date) continue;
    const cutISO = ilDateTime(r.date, shiftEnd).toISOString();
    const cutMs = new Date(cutISO).getTime();
    const baseSessions = (r.sessions && r.sessions.length) ? r.sessions : (r.checkin ? [{ in: r.checkin, out: r.checkout || null }] : []);
    const netMs = calcNetCapped({ ...r, sessions: baseSessions }, cutMs);
    await doc.ref.set({
      ...r,
      sessions: baseSessions.map(s => s.out ? s : { ...s, out: cutISO }),
      checkout: r.checkout || cutISO,
      autoClosed: true,
      netMs
    });
    repaired++;
  }

  // 3) משימות שנשארו רצות — השהיה מהשרת (רשת הביטחון בלקוח רצה רק בדפדפן פתוח)
  const tasksSnap = await db.collection('activeTasks').get();
  for (const doc of tasksSnap.docs) {
    const t = doc.data();
    if (t.paused || !t.startTime) continue;
    const st = new Date(t.startTime).getTime();
    if (isNaN(st)) continue;
    const day = ilDateOf(t.startTime);
    // עדיפות לשעת היציאה האמיתית של העובד באותו יום; אחרת סוף משמרת
    let cutMs = ilDateTime(day, shiftEnd).getTime();
    try {
      const hSnap = await db.collection('attHistory').doc(String(t.workerId) + '_' + day).get();
      const co = hSnap.exists && hSnap.data().checkout;
      if (co) cutMs = new Date(co).getTime();
    } catch (e) {}
    const pauseAt = Math.max(st, cutMs);
    if (Date.now() < pauseAt) continue; // המשימה עוד בתוך שעות העבודה של היום
    let workedMs = pauseAt - st;
    try {
      const wSnap = await db.collection('workers').doc(String(t.workerId)).get();
      const w = wSnap.exists ? wSnap.data() : null;
      if (w && w.breakActive && w.breakStart && w.breakEnd) {
        const bs = ilDateTime(day, w.breakStart).getTime(), be = ilDateTime(day, w.breakEnd).getTime();
        if (be > bs) { const os = Math.max(st, bs); const oe = Math.min(pauseAt, be); if (oe > os) workedMs -= (oe - os); }
      }
    } catch (e) {}
    const totalSec = (t.accumulatedSec || 0) + Math.max(0, Math.round(workedMs / 1000));
    await doc.ref.set({
      paused: true, pausedAt: new Date(pauseAt).toISOString(),
      accumulatedSec: totalSec, elapsed: totalSec,
      autoPausedByServer: true
    }, { merge: true });
    pausedNames.push((t.workerName || t.workerId || '?') + (t.taskType ? ' (' + t.taskType + ')' : ''));
  }

  // 4) ריפוי duration מנופח בהיסטוריית משימות — מעל 8 שעות נטו בלתי אפשרי במשמרת.
  // נגרם מסגירות ישנות שחישבו endTime-startTime (כולל לילה/השהיות). לעולם רק מקטין, אף פעם לא מגדיל.
  let fixedDur = 0;
  const workersAll = await db.collection('workers').get();
  const wMap = {};
  workersAll.docs.forEach(d => { wMap[d.id] = d.data(); });
  const histSnap = await db.collection('histTasks').where('duration', '>', 8 * 3600).get();
  for (const doc of histSnap.docs) {
    const t = doc.data();
    let newDur = null;
    if (typeof t.accumulatedSec === 'number' && (t.paused || !t.elapsed)) {
      // הושהתה ולא חודשה — הזמן האמיתי הוא מה שנצבר
      newDur = t.accumulatedSec;
    } else if (typeof t.elapsed === 'number' && t.elapsed > 0 && t.elapsed < t.duration) {
      // יש מדידת טיימר אמיתית קטנה מה-duration — היא הנכונה
      newDur = t.elapsed;
    } else if (t.startTime) {
      // אין מדידה שמישה — חיתוך בסוף המשמרת של יום ההתחלה, בניכוי הפסקת העובד
      const st = new Date(t.startTime).getTime();
      if (!isNaN(st)) {
        const day = ilDateOf(t.startTime);
        const cut = ilDateTime(day, shiftEnd).getTime();
        let end = t.endTime ? new Date(t.endTime).getTime() : cut;
        if (isNaN(end)) end = cut;
        end = Math.min(end, cut);
        let dur = Math.max(0, end - st);
        const w = wMap[String(t.workerId)] || {};
        if (w.breakActive && w.breakStart && w.breakEnd) {
          const bs = ilDateTime(day, w.breakStart).getTime(), be = ilDateTime(day, w.breakEnd).getTime();
          const os = Math.max(st, bs), oe = Math.min(end, be);
          if (oe > os) dur -= (oe - os);
        }
        newDur = Math.round(dur / 1000);
      }
    }
    if (newDur !== null && newDur >= 0 && newDur < t.duration) {
      await doc.ref.set({ duration: newDur, durationFixed: true }, { merge: true });
      fixedDur++;
    }
  }

  // דיווח לטלגרם — רק אם היה מה לסגור
  if (closed.length || repaired || pausedNames.length || fixedDur) {
    const { token, chatId } = tgCfg();
    if (token && chatId) {
      let msg = '🌙 TextileOps — סגירה אוטומטית מהשרת';
      if (closed.length) msg += '\n📋 נוכחות נסגרה ב-' + shiftEnd + ' (' + closed.length + '): ' + closed.join(', ');
      if (repaired) msg += '\n🛠 תוקנו ' + repaired + ' רשומות נוכחות מנופחות';
      if (pausedNames.length) msg += '\n⏸ משימות הושהו (' + pausedNames.length + '): ' + pausedNames.join(', ');
      if (fixedDur) msg += '\n⏱ תוקן משך מנופח ב-' + fixedDur + ' משימות בהיסטוריה';
      await sendTelegram(token, chatId, msg).catch(() => {});
    }
  }
  return { closed: closed.length, repaired, paused: pausedNames.length, fixedDur };
}

exports.attendanceCloser = functions.pubsub.schedule('30 23 * * *').timeZone('Asia/Jerusalem').onRun(async () => {
  try {
    const r = await runAttendanceCloser();
    console.log('attendanceCloser:', JSON.stringify(r));
  } catch (e) {
    console.error('attendanceCloser error:', e);
  }
  return null;
});
// טריגר ידני מוגן במפתח (לתיקון מיידי של רשומות קיימות; אותה הגנה כמו migratePhase2)
exports.attendanceCloserNow = functions.https.onRequest(async (req, res) => {
  const key = (functions.config().app || {}).migratekey || '';
  if (!key || String(req.query.key || '') !== key) { res.status(403).send('forbidden'); return; }
  try {
    res.json(await runAttendanceCloser());
  } catch (e) {
    console.error('attendanceCloserNow error:', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});
