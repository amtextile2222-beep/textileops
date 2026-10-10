// firebase-functions 6: הייבוא הרגיל מפנה ל-API של הדור השני — כל הפונקציות כאן דור ראשון.
// ⚠️ לא לשדרג ל-7: הוא מסיר את functions.config() שבו יושבים כל הסודות (טלגרם/חירום/AI).
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const https = require('https');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function hashPass(p) { return '$h:' + crypto.createHash('sha256').update(String(p), 'utf8').digest('hex'); }
function ilTime() { return new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }); }
function ilTimeOfIso(iso) { try { const d = new Date(iso); if (isNaN(d)) return ''; return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }); } catch (e) { return ''; } }
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
// קלט: {user, pass?} | {user, faceDescriptor?} | {user, registerDescriptors?} | {user, empBarcode?} | {emergencyCode} | {user, faceFailAlert, photoB64?}
// פלט הצלחה: {token, worker, needFaceRegister?} | {needFace:true, name, faceUpdateAllowed}
// קודי שגיאה (ב-message): wrong | disabled | locked | ip | device | device-unknown | face-mismatch | no-face-update | emergency-wrong
//                          | barcode-wrong | barcode-not-allowed | barcode-needs-setup
async function regFail(credRef, creds) {
  try { await credRef.set({ failCount: (creds.failCount || 0) + 1, lastFail: Date.now() }, { merge: true }); } catch (e) {}
}
function sanitizeWorker(w) {
  const out = { ...w };
  delete out.pass; delete out.faceDescriptor; delete out.faceDescriptors; delete out.deviceId;
  return out;
}

// ─── מצב גיבוי לבדיקת IP המפעל ───────────────────────────────
// בנפילת אינטרנט (מעבר לקו גיבוי/סים) ה-IP הציבורי משתנה, וכל עובד עם
// requireFactoryIP נחסם + מנטר ה-WiFi מציף התראות שווא. המתג משהה את הבדיקה
// לחלון קצוב במקום למחוק את factoryIP — הערך נשאר שמור וההגנה חוזרת לבד.
// החלון נמדד מול שעון השרת בלבד (ipBypassStart הוא serverTimestamp), כדי ששעון
// מכשיר סוטה לא יוכל להאריך או לקצר אותו. מחזיר מילישניות שנותרו, 0 = לא פעיל.
function ipBypassMsLeft(s) {
  const mins = Number((s || {}).ipBypassMin) || 0;
  const st = (s || {}).ipBypassStart;
  if (!mins || !st) return 0;
  const startMs = typeof st.toMillis === 'function' ? st.toMillis() : Number(st) || 0;
  if (!startMs) return 0;
  return Math.max(0, startMs + mins * 60000 - Date.now());
}
exports.login = functions.https.onCall(async (data, context) => {
  const d = data || {};
  // ── ping לחימום הפונקציה (keepLoginWarm) — חוזר מיד, לפני כל לוגיקת אימות/נעילה/Firestore ──
  if (d.ping) return { pong: true };
  const { token: tgToken, chatId: tgChatId } = tgCfg();
  const tg = text => (tgToken && tgChatId) ? sendTelegram(tgToken, tgChatId, text).catch(() => {}) : Promise.resolve();

  // ── התראה על פתיחת פאנל החירום (5 לחיצות על הלוגו) ──
  // נשלחת מכאן ולא דרך tgSend: הפאנל נפתח במסך הכניסה, לפני שיש משתמש מחובר,
  // ו-tgSend דוחה קריאה לא מאומתת — ההתראה נבלעה בשקט. מוגבל להתראה אחת בדקה.
  if (d.emergencyPanel) {
    const emRef = db.collection('credentials').doc('_emergency');
    const emSnap = await emRef.get();
    const em = emSnap.exists ? emSnap.data() : {};
    if (Date.now() - (em.lastPanelAlert || 0) < 60 * 1000) return { ok: true, throttled: true };
    await emRef.set({ lastPanelAlert: Date.now() }, { merge: true });
    await tg('⚠️ TextileOps — נפתח פאנל כניסת חירום\n🕐 שעה: ' + ilTime() + '\n🌐 IP: ' + (callerIp(context) || '?') + '\nמישהו לחץ על הלוגו 5 פעמים ופתח את פאנל החירום.');
    return { ok: true };
  }

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
    const token = await admin.auth().createCustomToken(mgr.id, { role: 'manager', sat: Date.now() });
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
    const tgData = (tgSet.exists && tgSet.data()) || {};
    const factoryIP = tgData.factoryIP || '';
    const ip = callerIp(context);
    if (factoryIP && ip && ip !== factoryIP && !ipBypassMsLeft(tgData)) {
      await tg('⛔ TextileOps — ניסיון כניסה מחוץ למפעל\n👤 עובד: ' + w.name + '\n🌐 IP: ' + ip + '\n🕐 שעה: ' + ilTime() + '\nהעובד ניסה להיכנס מרשת שאינה רשת המפעל.');
      throw new functions.https.HttpsError('permission-denied', 'ip');
    }
  }

  // ── חלון גישה מוקצב (ימים בשבוע + שעות) — פר-עובד, מנהל פטור ──
  // days: מערך 0-6 (0=ראשון ... 6=שבת, כמו getDay). fail-open אם התצורה חסרה
  // כדי למנוע נעילה בטעות — חסימה מלאה נעשית דרך disabled.
  {
    const aw = w.accessWindow;
    if (w.role !== 'manager' && aw && aw.enabled
        && Array.isArray(aw.days) && aw.days.length && aw.from && aw.to) {
      const ilNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
      const day = ilNow.getDay();
      const mins = ilNow.getHours() * 60 + ilNow.getMinutes();
      const toMin = s => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
      const dayOk = aw.days.map(Number).includes(day);
      const timeOk = mins >= toMin(aw.from) && mins <= toMin(aw.to);
      if (!dayOk || !timeOk) {
        await tg('⛔ TextileOps — כניסה מחוץ לחלון הזמן המותר\n👤 עובד: ' + w.name + '\n🕐 שעה: ' + ilTime() + '\nהעובד ניסה להיכנס מחוץ לימים/שעות שהוגדרו לו.');
        throw new functions.https.HttpsError('permission-denied', 'time-window');
      }
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
    if (!(dist < 0.6)) {
      await regFail(credRef, creds);
      throw new functions.https.HttpsError('permission-denied', 'face-mismatch');
    }
  } else if (Array.isArray(d.registerDescriptors) && d.registerDescriptors.length) {
    // ── רישום פנים מחדש בכניסה — רק אם המנהל אישר מראש ──
    if (!w.faceUpdateAllowed) throw new functions.https.HttpsError('permission-denied', 'no-face-update');
    // 🔒 אישור המנהל לבדו אינו הזדהות: בלי סיסמה, כל מי שידע את שם המשתמש של עובד מאושר
    // היה רושם את פניו שלו ונכנס בשמו (נסגר 25/09/2026). אותה בדיקה כמו במסלול הסיסמה למטה.
    const rp = String(d.pass || '');
    const rStored = creds.pass !== undefined ? creds.pass : (w.pass || '');
    if (!rp || !(rStored === hashPass(rp) || (rStored && !String(rStored).startsWith('$h:') && rStored === rp))) {
      await regFail(credRef, creds);
      throw new functions.https.HttpsError('permission-denied', 'wrong');
    }
    await credRef.set({ faceDescriptors: Object.fromEntries(d.registerDescriptors.map((s, i) => [i, s.map(Number)])), faceDescriptor: FieldValue.delete() }, { merge: true });
    await wDoc.ref.set({ faceUpdateAllowed: false, faceRegistered: true, faceDescriptor: FieldValue.delete(), faceDescriptors: FieldValue.delete() }, { merge: true });
  } else if (d.empBarcode !== undefined) {
    // ── כניסה בסריקת ברקוד העובד (EMP:{id}) — מסלול חלופי לעובד בלי זיהוי פנים ──
    // הברקוד מודבק בתחנה וגלוי לכולם, ולכן הוא *לא* סוד: הוא רק אומר "מי אני".
    // הזיהוי האמיתי = נעילת מכשיר. לכן המסלול פתוח רק לעובד עם deviceBinding
    // ומכשיר שכבר נרשם — ובמכוון בלי רישום-מכשיר-אוטומטי (בניגוד לסיסמה למטה),
    // אחרת הראשון שיסרוק מדבקה של חבר היה כובל את הטלפון שלו לחשבון הזר.
    if (w.faceAuth && hasFace) {
      // למי שמוגדר זיהוי פנים — הפנים נשארות חובה, אין עקיפה בברקוד
      return { needFace: true, name: w.name, faceUpdateAllowed: !!w.faceUpdateAllowed };
    }
    if (!w.deviceBinding || w.role === 'manager') {
      throw new functions.https.HttpsError('failed-precondition', 'barcode-not-allowed');
    }
    const bdev = String(d.deviceId || '');
    if (!bdev) throw new functions.https.HttpsError('failed-precondition', 'device-unknown');
    if (!creds.deviceId) {
      // כניסה ראשונה חייבת להיות בסיסמה — שם המכשיר נרשם תחת אימות אמיתי
      throw new functions.https.HttpsError('failed-precondition', 'barcode-needs-setup');
    }
    if (creds.deviceId !== bdev) {
      await tg('⛔ TextileOps — סריקת ברקוד עובד ממכשיר לא מורשה\n👤 עובד: ' + w.name + '\n🕐 שעה: ' + ilTime());
      throw new functions.https.HttpsError('permission-denied', 'device');
    }
    // הברקוד חייב להתאים בדיוק לעובד שהוזן/נשמר בשם המשתמש
    if (String(d.empBarcode).trim() !== 'EMP:' + w.id) {
      await regFail(credRef, creds);
      throw new functions.https.HttpsError('permission-denied', 'barcode-wrong');
    }
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
  const token = await admin.auth().createCustomToken(w.id, { role, sat: Date.now() });
  return { token, worker: sanitizeWorker(w), needFaceRegister };
});

// ─── שחזור session אחרי טעינה מחדש ───────────────────────────────────────────
// הדפדפן ו-iOS הורגים את הטאב ברקע, ו-S.user חי בזיכרון בלבד ⇒ כל טעינה מחדש
// החזירה את העובדת למסך כניסה (נמדד: עד 5 פתיחות ביום לאותו עובד). ה-session של
// Firebase דווקא שורד את הטעינה (IndexedDB); מה שחסר היה שמישהו יאמת שהעובדת
// עדיין *רשאית* להיכנס עכשיו, מהמקום הזה — ורק אז יכניס אותה.
//
// הקלט אינו מכיל שום פרט הזדהות ⇒ אין מה לנחש כאן. מה ש*לא* נבדק מחדש: סיסמה,
// פנים, ברקוד — העובדת כבר עברה אחד מהם כדי לייצר את ה-session. מה ש*כן* נבדק
// מחדש: כל מה שיכול היה להשתנות מאז, ובדיוק בסדר של exports.login.
//
// מנפיק טוקן חדש במקום להישען על הישן: התפקיד נלקח מכרטיס העובד בכל שחזור
// (מנהל שהוריד אחראית לעובדת מתעדכן כבר בשחזור הבא), ואין תלות בשאלה אם ה-claim
// שרד את רענון הטוקן בדפדפן.
exports.resumeSession = functions.https.onCall(async (data, context) => {
  const d = data || {};
  const { token: tgToken, chatId: tgChatId } = tgCfg();
  const tg = text => (tgToken && tgChatId) ? sendTelegram(tgToken, tgChatId, text).catch(() => {}) : Promise.resolve();

  // ── שער 0: יש בכלל session? ──
  if (!context.auth || !context.auth.uid) throw new functions.https.HttpsError('unauthenticated', 'no-session');
  const uid = String(context.auth.uid);
  const claims = context.auth.token || {};

  const wSnap = await db.collection('workers').doc(uid).get();
  // העובד נמחק מאז — ה-session מצביע לכלום
  if (!wSnap.exists) throw new functions.https.HttpsError('permission-denied', 'no-session');
  const w = { id: wSnap.id, ...wSnap.data() };

  // ── שער 1: גיל ה-session ──
  // אין כאן הגדרה חדשה. accessWindow שבכרטיס העובד (שער 4) הוא הכלל הראשי, ולכן
  // מי שיש לו חלון שעות ממילא מוגבל לפיו — ושינוי שעות בכרטיס משפיע מיד, בלי קוד.
  // תקרת 12 השעות היא רשת ביטחון *רק* למי שאין לו חלון (וגם למנהל, שפטור משער 4).
  //
  // sat = רגע ההזדהות המקורי, נחתם בשרת בהנפקת הטוקן ב-login ומועבר הלאה בכל
  // שחזור. אי אפשר לסמוך כאן על auth_time: השחזור מנפיק טוקן חדש, ולכן auth_time
  // מתאפס בכל שחזור והתקרה לא הייתה נאכפת אף פעם. הנפילה חזרה ל-auth_time היא
  // בשביל session שנוצר לפני הפריסה הזאת ואין לו עדיין sat.
  const aw = w.accessWindow;
  const hasWindow = w.role !== 'manager' && aw && aw.enabled
    && Array.isArray(aw.days) && aw.days.length && aw.from && aw.to;
  const sat = Number(claims.sat) || (Number(claims.auth_time) || 0) * 1000;
  if (!hasWindow) {
    if (!sat || Date.now() - sat > 12 * 60 * 60 * 1000) {
      throw new functions.https.HttpsError('permission-denied', 'session-expired');
    }
  }

  // ── שער 2: השעיה ──
  if (w.disabled) throw new functions.https.HttpsError('permission-denied', 'disabled');

  // ── שער 3: רשת המפעל ──
  if (w.requireFactoryIP) {
    const tgSet = await db.collection('appSettings').doc('telegramSettings').get();
    const tgData = (tgSet.exists && tgSet.data()) || {};
    const factoryIP = tgData.factoryIP || '';
    const ip = callerIp(context);
    if (factoryIP && ip && ip !== factoryIP && !ipBypassMsLeft(tgData)) {
      await tg('⛔ TextileOps — שחזור session מחוץ למפעל\n👤 עובד: ' + w.name + '\n🌐 IP: ' + ip + '\n🕐 שעה: ' + ilTime() + '\nהאפליקציה נטענה מחדש מרשת שאינה רשת המפעל. הגישה נדחתה.');
      throw new functions.https.HttpsError('permission-denied', 'ip');
    }
  }

  // ── שער 4: חלון ימים/שעות — מנהל פטור, fail-open כשהתצורה חסרה ──
  if (hasWindow) {
    const ilNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const day = ilNow.getDay();
    const mins = ilNow.getHours() * 60 + ilNow.getMinutes();
    const toMin = s => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const dayOk = aw.days.map(Number).includes(day);
    const timeOk = mins >= toMin(aw.from) && mins <= toMin(aw.to);
    if (!dayOk || !timeOk) {
      await tg('⛔ TextileOps — שחזור session מחוץ לחלון הזמן\n👤 עובד: ' + w.name + '\n🕐 שעה: ' + ilTime() + '\nהאפליקציה נטענה מחדש מחוץ לימים/שעות שהוגדרו לו.');
      throw new functions.https.HttpsError('permission-denied', 'time-window');
    }
  }

  // ── שער 5: נעילת מכשיר ──
  // בניגוד ל-login, כאן *אין* רישום מכשיר אוטומטי. מכשיר שהמנהל אִפס חייב לעבור
  // כניסה מלאה, שבה הרישום נעשה תחת אימות אמיתי — אחרת שחזור היה מקבע מכשיר
  // בלי שאף אחד הזדהה.
  if (w.deviceBinding && w.role !== 'manager') {
    const credSnap = await db.collection('credentials').doc(w.id).get();
    const creds = credSnap.exists ? credSnap.data() : {};
    const dev = String(d.deviceId || '');
    if (!dev) throw new functions.https.HttpsError('failed-precondition', 'device-unknown');
    if (!creds.deviceId) throw new functions.https.HttpsError('permission-denied', 'device');
    if (creds.deviceId !== dev) {
      await tg('⛔ TextileOps — שחזור session ממכשיר לא מורשה\n👤 עובד: ' + w.name + '\n🕐 שעה: ' + ilTime());
      throw new functions.https.HttpsError('permission-denied', 'device');
    }
  }

  const role = w.role || 'worker';
  const token = await admin.auth().createCustomToken(w.id, { role, sat });
  return { token, worker: sanitizeWorker(w) };
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

// ─── תמחור: שעה עמוסה + תקורה בצד שרת (שיקוף loadedHourBreakdown/overheadBreakdown מהלקוח) ───
// נדרש כאן כי workerRates ב-adminSettings שאחראי לא רשאי לקרוא — השרת מחזיר דקות בלבד.
function loadedRateServer(costs, nWorkers, wid) {
  const daily = (costs.workerRates || {})[wid] || 0;
  if (!daily) return 0;
  const wdy = costs.workDaysYear || 250;
  const base = daily / 8;
  const transport = ((costs.workerTransport || {})[wid] || 0) / 8;
  const sev = daily * ((costs.severancePct != null ? costs.severancePct : 8.33) / 100) / 8;
  const hol = daily * ((costs.holidayDays != null ? costs.holidayDays : 4) / wdy) / 8;
  const gifts = (costs.giftsAnnual || 0) / wdy / 8;
  const trip = (costs.tripAnnual || 0) / (nWorkers || 1) / wdy / 8;
  const ins = ((costs.workerInsurance || {})[wid] || 0) / wdy / 8;
  return base + transport + sev + hol + gifts + trip + ins;
}
function overheadPerHourServer(costs, nWorkers) {
  const fixedMonthly = (costs.fixedDaily || 0) * (costs.workDaysMonth || 22) + (costs.fixedMonthly || 0) + (costs.fixedAnnual || 0) / 12;
  // ⚠️ חלון החודשים הוא הגדרה של המשתמש (בורר "חודשים לממוצע" במסך העלויות). עד 11/08/2026
  // היה כאן 3 קשיח בעוד הלקוח כיבד את ההגדרה, ולכן פאנל התמחור הראה תקורה אחת והצפי של
  // העובדות חושב מאחרת: 4.10 מול 3.52 ₪/שעה = פער 3.6% בכל צפי במערכת.
  // חייב להישאר זהה ל-overheadPerHour בלקוח (index.html) — אותה נוסחה, אותו clamp.
  const win = Math.max(1, Math.min(3, parseInt(costs.overheadMonthsWindow) || 3));
  const months = (costs.costMonths || []).slice().sort((a, b) => String(b.month).localeCompare(String(a.month))).slice(0, win);
  const varAvg = months.length ? months.reduce((s, m) => s + (m.variableTotal || 0), 0) / months.length : 0;
  const varEst = varAvg * (1 + ((costs.overheadBufferPct != null ? costs.overheadBufferPct : 10) / 100));
  const hours = (nWorkers || 0) * (costs.workDaysMonth || 22) * 8;
  return hours ? (fixedMonthly + varEst) / hours : 0;
}

// צפי זמן למשימה — לפי תקציב ₪ של השלבים (מתמחור המוצר) ÷ עלות שעת העובד הספציפי.
// קלט: {cust, prod, workerId, qty, stepNames[]} — פלט: {ok, perStep:{שם:דקות}, totalMin}
exports.calcTaskExpected = functions.https.onCall(async (data, context) => {
  const role = callerRole(context);
  // מחזיר דקות בלבד (לא שכר) — בטוח לכל תפקיד מחובר: עובד/עוזר/אחראי/מנהל רואים צפי לסריקה שלהם
  if (!role) throw new functions.https.HttpsError('unauthenticated', 'יש להתחבר תחילה');
  const d = data || {};
  const cust = String(d.cust || ''), prod = String(d.prod || ''), workerId = String(d.workerId || '');
  const qty = Math.max(0, parseInt(d.qty) || 0);
  const stepNames = Array.isArray(d.stepNames) ? d.stepNames.map(String).slice(0, 60) : [];
  if (!cust || !prod || !workerId || !qty || !stepNames.length) return { ok: false, reason: 'missing' };
  const pq = await db.collection('products').where('cust', '==', cust).where('prod', '==', prod).get();
  if (pq.empty) return { ok: false, reason: 'no-product' };
  // כמו findProd בלקוח: בכפילות (מוצר ישן+חדש עם אותו cust/prod) בחר את הרשומה העדכנית ביותר
  // (createdAt מקסימלי, fallback למספר ב-id) — אחרת הצפי מחושב מרשומה ישנה עם שלבים/תמחור שונים ולא מופיע
  let p = null, mx = -1, pId = null;
  for (const doc of pq.docs) {
    const x = doc.data();
    const c = +x.createdAt || parseInt(String(x.id || doc.id).replace(/\D/g, '')) || 0;
    if (c > mx) { mx = c; p = x; pId = doc.id; }
  }
  if (!p) return { ok: false, reason: 'no-product' };
  // 💲 התמחור עבר ל-productPricing/{id} (25/09/2026) — מוסתר מטלפוני העובדות. ערך שם גובר;
  // מוצר שעוד לא עבר מיגרציה נושא את השדות במסמך עצמו ⇒ נופלים אליו.
  const prSnap = await db.collection('productPricing').doc(pId).get();
  if (prSnap.exists) p = { ...p, ...prSnap.data() };
  const price = +p.unitPrice || 0, profit = +p.targetProfitPct || 0, mats = +p.directMaterialsCost || 0;
  if (!price) return { ok: false, reason: 'no-pricing' };
  const budget = price * (1 - profit / 100) - mats;
  if (budget <= 0) return { ok: false, reason: 'negative-budget' };
  // ✂ הגזירה מתומחרת בנפרד: `cutPrice` עם אחוז רווח משלו (`cutProfitPct`), וכשהוא ריק —
  // נופל לאחוז התפירה, בדיוק כמו cutProfitPctOf בלקוח. חייב להישאר תואם: אחוז שונה כאן
  // מייצר צפי שהעובדת רואה ושהדוח לא מכיר. ראה gotcha_client_server_formula_drift.
  const cutPrice = +p.cutPrice || 0;
  const _cpv = p.cutProfitPct;
  const cutProfit = (_cpv != null && _cpv !== '' && isFinite(+_cpv)) ? +_cpv : profit;
  const cutBudget = cutPrice > 0 ? cutPrice * (1 - cutProfit / 100) : 0;
  const costsSnap = await db.collection('adminSettings').doc('costs').get();
  if (!costsSnap.exists) return { ok: false, reason: 'no-costs' };
  const costs = costsSnap.data();
  const workersSnap = await db.collection('workers').get();
  const active = workersSnap.docs.map(x => ({ id: x.id, ...x.data() })).filter(w => w.role !== 'manager' && !w.disabled);
  const nW = active.length || 1;
  const oh = overheadPerHourServer(costs, nW);
  let rate = loadedRateServer(costs, nW, workerId);
  if (!rate) { // אין שכר לעובד — ממוצע כל העובדים עם שכר (כמו fallback בלקוח)
    const rated = active.filter(w => (costs.workerRates || {})[w.id]);
    rate = rated.length ? rated.reduce((s, w) => s + loadedRateServer(costs, nW, w.id), 0) / rated.length : 0;
  }
  const hourCost = rate + oh;
  if (!(hourCost > 0)) return { ok: false, reason: 'no-rate' };
  const weights = costs.difficultyWeights || { 1: 1, 2: 1.5, 3: 2, 4: 2.5, 5: 3.5 };
  // שלב שמיש = יש לו רמת קושי או דקות ידניות (manualMin > 0 = override)
  const priced = (p.workSteps || []).filter(s => s && typeof s === 'object' && (+s.level > 0 || +s.manualMin > 0));
  if (!priced.length) return { ok: false, reason: 'no-levels' };
  // ✂ שלבי הגזירה יוצאים מתקציב התפירה (30/08) — עד כה קיבלו נתח ממנו **וגם** תקציב
  // גזירה משלהם = כפל תשלום. חייב להישאר תואם ל-_prodBudget בלקוח.
  // ⚠️ הצפי של שלבי התפירה עולה ב-~3.3%: אותו תקציב, פחות שלבים שמתחלקים בו.
  const usable = priced.filter(s => !s.cut);
  const cutUsable = priced.filter(s => !!s.cut);
  // רק שלבים אוטומטיים (קושי בלי override ידני) מתחלקים את התקציב לפי משקל
  const totW = usable.filter(s => +s.level > 0 && !(+s.manualMin > 0)).reduce((s, x) => s + (+weights[+x.level] || 1), 0);
  // ✂ תקציב הגזירה מתחלק בין שלבי ה-✂ **לפי הדקות שהוזנו** (החלטת המשתמש 30/08)
  const cutTotMin = cutUsable.reduce((s, x) => s + (+x.manualMin > 0 ? +x.manualMin : 0), 0);
  // ⚠️ כשכל השלבים המתומחרים ידניים, הדקות שהוזנו הן **משקל יחסי ולא תקן מוחלט**:
  // כל שלב מקבל `תקציב × (דקותיו ÷ סה"כ הדקות)`, והכסף מומר חזרה לדקות לפי עלות השעה
  // של **העובד הספציפי** — ולכן עובד יקר מקבל פחות זמן וזול מקבל יותר, בדיוק כמו במסלול
  // האוטומטי. חייב להישאר תואם ל-splitStepBudget בלקוח; שינוי כאן בלי שינוי שם = דוח
  // היעילות ישווה "בפועל" מול מוקצב שהעובדת מעולם לא ראתה.
  // ערבוב ידני+אוטומטי נשאר בהתנהגות הישנה (דקות×כמות) — אין כלל מובן מאליו לשילוב.
  const allManual = totW === 0;
  const totManualMin = usable.reduce((s, x) => s + (+x.manualMin > 0 ? +x.manualMin : 0), 0);
  const perStep = {};
  let total = 0;
  for (const name of stepNames) {
    // ✂ שלב גזירה נמדד מול תקציב הגזירה ולא מול תקציב התפירה. בפועל הגזירה נסרקת
    // בברקוד ספירה ללא כמות, והקריאה נופלת קודם על `!qty` ⇒ הענף הזה יורה רק כשיש כמות.
    const cst = cutUsable.find(s => s.name === name);
    if (cst) {
      if (!(cutBudget > 0) || !(cutTotMin > 0) || !(+cst.manualMin > 0)) continue;
      const cmin = cutBudget * (+cst.manualMin / cutTotMin) * qty / hourCost * 60;
      perStep[name] = Math.round(cmin * 10) / 10;
      total += cmin;
      continue;
    }
    const st = usable.find(s => s.name === name);
    if (!st) continue;
    let min;
    if (+st.manualMin > 0) {
      min = (allManual && totManualMin > 0 && budget > 0)
        ? budget * (+st.manualMin / totManualMin) * qty / hourCost * 60
        : +st.manualMin * qty;
    }
    else if (totW > 0) { min = budget * (+weights[+st.level] || 1) / totW * qty / hourCost * 60; }
    else continue;
    perStep[name] = Math.round(min * 10) / 10;
    total += min;
  }
  if (!Object.keys(perStep).length) return { ok: false, reason: 'no-steps' };
  return { ok: true, perStep, totalMin: Math.round(total * 10) / 10, qty };
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

    const alertPrefs = settings.alertPrefs || {};
    const tokens = settings.tokens || {};
    const entries = Object.values(tokens)
      .map(t => typeof t === 'string' ? { token: t } : t)
      .filter(e => e && e.token);
    if (!entries.length) return { sent: false, reason: 'no tokens' };

    // העדפות פיקוח לכל אחראי — נשלפות מסמך העובד שלו (oversightPrefs)
    const supIds = [...new Set(entries.filter(e => e.role === 'supervisor' && e.workerId).map(e => e.workerId))];
    const supPrefs = {};
    await Promise.all(supIds.map(async id => {
      const s = await db.collection('workers').doc(id).get();
      supPrefs[id] = s.exists ? (s.data().oversightPrefs || {}) : {};
    }));

    // סנן לכל נמען בנפרד: אחראי לפי oversightPrefs, מנהל/טוקן ישן לפי alertPrefs הגלובלי
    const tokenList = entries.filter(e => {
      if (!alertType) return true;
      if (e.role === 'supervisor') return supPrefs[e.workerId] ? supPrefs[e.workerId][alertType] !== false : true;
      return alertPrefs[alertType] !== false;
    }).map(e => e.token);
    if (!tokenList.length) return { sent: false, reason: 'filtered out' };

    // שלח לכל הטוקנים שעברו סינון
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

// קודי FCM שמשמעותם "הרישום הזה מת לתמיד" (טלפון הוחלף / דפדפן נוקה / התראות בוטלו) —
// לא תקלה זמנית, ולכן מוחקים את הרישום במקום לנסות שוב כל 5 דקות
const DEAD_FCM_CODES = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];

// Push לאחראים שרשמו טלפון (appSettings/pushSettings.tokens, role=supervisor). סדר העדפה:
// 1) האחראי שפתח את המשימה (scannedBy — מי שעומד ליד העובדת ומכיר אותה)
// 2) מי שסומן "אחראי על" מחלקת המשימה/העובדת (מסך העלויות)  3) אחראי שרשום באותה מחלקה
// 4) כל האחראים. dept = שם מחלקה או מערך שמות. מחזיר את שמות האחראים שקיבלו.
// opts.exclude = מזהים שלא יקבלו (מי שלחץ) · opts.onlyOpeners = בלי נפילה לשאר האחראים
async function pushSupervisors(pushSnap, dept, title, body, openerIds, opts = {}) {
  const tokens = (pushSnap && pushSnap.exists && pushSnap.data().tokens) || {};
  const entries = Object.entries(tokens)
    .map(([key, t]) => ({ key, ...(typeof t === 'string' ? { token: t } : (t || {})) }))
    .filter(e => e.token && e.role === 'supervisor' && e.workerId);
  if (!entries.length) return [];
  const sups = {};
  await Promise.all([...new Set(entries.map(e => e.workerId))].map(async id => {
    const s = await db.collection('workers').doc(id).get();
    sups[id] = s.exists ? s.data() : null;
  }));
  const live = entries.filter(e => sups[e.workerId] && !sups[e.workerId].disabled && !(opts.exclude || []).includes(e.workerId));
  const depts = (Array.isArray(dept) ? dept : [dept]).filter(Boolean);
  const openers = (openerIds || []).length ? live.filter(e => openerIds.includes(e.workerId)) : [];
  // "אחראי על מחלקות" במסך העלויות (adminSettings/costs.oversightDepts: {workerId: [שמות מחלקות]})
  // קובע על מה האחראי ממונה — לא המחלקה שבה הוא עצמו רשום. נופל למחלקה שלו רק אם אין הגדרה.
  let responsible = [];
  if (depts.length) {
    const cs = await db.collection('adminSettings').doc('costs').get();
    const ov = (cs.exists && cs.data().oversightDepts) || {};
    responsible = live.filter(e => (ov[e.workerId] || []).some(d => depts.includes(d)));
  }
  const sameDept = depts.length ? live.filter(e => depts.includes(sups[e.workerId].dept)) : [];
  const targets = (openers.length || opts.onlyOpeners) ? openers : responsible.length ? responsible : (sameDept.length ? sameDept : live);
  const reached = new Set();
  await Promise.all(targets.map(async e => {
    try {
      // title/body יכולים להיות פונקציה של שפת האחראי (workers.lang) — כמו בתזכורת הידנית
      const lg = sups[e.workerId].lang;
      await admin.messaging().send({
        token: e.token,
        notification: { title: typeof title === 'function' ? title(lg) : title, body: typeof body === 'function' ? body(lg) : body },
        android: { priority: 'high', notification: { sound: 'default', channelId: 'textileops' } },
        webpush: { notification: { icon: 'https://amtextile2222-beep.github.io/textileops/icon-192.png', requireInteraction: true } }
      });
      reached.add(sups[e.workerId].name || e.workerId);
    } catch (err) {
      if (DEAD_FCM_CODES.includes(err.code)) {
        // FieldPath — מפתח המכשיר עלול להכיל נקודות
        await pushSnap.ref.update(new admin.firestore.FieldPath('tokens', e.key), FieldValue.delete()).catch(() => {});
      }
    }
  }));
  return [...reached];
}

// 🔔 תזכורת ידנית על משימה שחרגה מהצפי — כפתור בכרטיס המשימה (מנהל).
// ההתראה האוטומטית (longTaskMonitor) נשלחת פעם אחת בלבד, ולא תמיד שמים לב אליה.
// נשלח לעובדת (אם יש לה טלפון) + לאחראית שפתחה את המשימה; מנהל — גם לפי סדר ההעדפה הרגיל.
// הגבלת קצב: תזכורת אחת לדקה לכל קבוצת משימות (taskAlerts/remind_<id>, בטרנזקציה).
const REMIND_COOLDOWN_MS = 60 * 1000;
exports.remindLateTask = functions.https.onCall(async (data, context) => {
  const role = callerRole(context);
  // בינתיים מנהל בלבד (27/09/2026). פתיחה לאחראים = להוסיף כאן 'supervisor' ובלקוח (remindBtn) —
  // הלוגיקה של "אחראי שלוחץ" למטה כבר קיימת ונבדקה
  if (role !== 'manager') throw new functions.https.HttpsError('permission-denied', 'למנהל בלבד');
  const ids = [...new Set((Array.isArray(data && data.taskIds) ? data.taskIds : []).map(String).filter(Boolean))].slice(0, 20);
  if (!ids.length) throw new functions.https.HttpsError('invalid-argument', 'לא נבחרה משימה');
  const snaps = await Promise.all(ids.map(id => db.collection('activeTasks').doc(id).get()));
  const tasks = snaps.filter(s => s.exists).map(s => s.data());
  if (!tasks.length) return { ok: false, reason: 'gone' };
  const lead = tasks[0];
  const now = Date.now();
  const lockRef = db.collection('taskAlerts').doc('remind_' + ids.slice().sort()[0]);
  const waitMs = await db.runTransaction(async tx => {
    const l = await tx.get(lockRef);
    const last = l.exists ? (l.data().ts || 0) : 0;
    if (now - last < REMIND_COOLDOWN_MS) return REMIND_COOLDOWN_MS - (now - last);
    tx.set(lockRef, { ts: now, by: context.auth.uid, taskIds: ids });
    return 0;
  });
  if (waitMs > 0) return { ok: false, reason: 'cooldown', waitSec: Math.ceil(waitMs / 1000) };

  const workerSnap = await db.collection('workers').doc(lead.workerId).get();
  const workerData = workerSnap.exists ? workerSnap.data() : {};
  const who = lead.workerName || workerData.name || lead.workerId;
  const expSum = tasks.reduce((s, t) => s + ((typeof t.expectedMin === 'number' && t.expectedMin > 0) ? t.expectedMin : 0), 0);
  // הדקות מגיעות מהטיימר שעל מסך המנהל (בלי ההפסקה — כמו שהוא רואה). שעון קיר רק כגיבוי:
  // הוא כולל את ההפסקה ולכן הראה עד 30 דק' יותר מהמסך.
  const cm = data && data.elapsedMin;
  const mins = (typeof cm === 'number' && isFinite(cm) && cm >= 0 && cm < 24 * 60) ? Math.round(cm)
    : Math.round(Math.max(...tasks.map(t => (t.accumulatedSec || 0) * 1000 + (t.startTime && !t.paused ? now - new Date(t.startTime).getTime() : 0))) / 60000);
  const stepsTxt = [...new Set(tasks.map(t => t.taskType).filter(Boolean))].join(', ');
  const prodsTxt = [...new Set(tasks.map(t => t.prod || ''))].join(', ');
  // טקסט לפי שפת הממשק של הנמען (workers.lang, נשמר מהלקוח); בלי שדה — עברית.
  // נוסח ניטרלי (בלי "חורגת") — מתאים לעובד ולעובדת.
  const RT = {
    he: { wTitle: '⏰ תזכורת — חריגה מהזמן המוקצב', sTitle: n => '⏰ תזכורת — ' + n + ': חריגה מהזמן', exp: x => 'הוקצבו ' + x + ' דק\'', el: x => 'עברו ' + x + ' דק\'' },
    ar: { wTitle: '⏰ تذكير — تجاوز الوقت المحدد', sTitle: n => '⏰ تذكير — ' + n + ': تجاوز الوقت', exp: x => 'الوقت المحدد ' + x + ' د', el: x => 'مضى ' + x + ' د' }
  };
  const rt = lg => RT[lg] || RT.he;
  const bodyOf = lg => (stepsTxt ? stepsTxt + ' · ' : '') + prodsTxt + ' · ' +
    (expSum > 0 ? rt(lg).exp(Math.round(expSum)) + (lg === 'ar' ? '، ' : ', ') : '') + rt(lg).el(mins);

  let worker = false;
  if (workerData.fcmToken) {
    try {
      await admin.messaging().send({
        token: workerData.fcmToken,
        notification: { title: rt(workerData.lang).wTitle, body: bodyOf(workerData.lang) },
        android: { priority: 'high', notification: { sound: 'default', channelId: 'textileops' } },
        apns: { payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } }, headers: { 'apns-priority': '10', 'apns-push-type': 'alert' } },
        webpush: { notification: { icon: 'https://amtextile2222-beep.github.io/textileops/icon-192.png', requireInteraction: true, vibrate: [200, 100, 200] } }
      });
      worker = true;
    } catch (e) {
      console.warn('remindLateTask: push לעובד נכשל', lead.workerId, e.code || e.message);
      if (DEAD_FCM_CODES.includes(e.code)) await workerSnap.ref.set({ fcmToken: FieldValue.delete() }, { merge: true }).catch(() => {});
    }
  }
  // אחראים: מי שלחץ לא מקבל על עצמו. אחראי שלוחץ — רק לאחראית אחרת שפתחה (אם יש),
  // כדי לא להציף את כל האחראים; מנהל — לפי סדר ההעדפה המלא של pushSupervisors.
  const openerIds = [...new Set(tasks.map(t => t.scannedBy).filter(id => id && id !== lead.workerId && id !== context.auth.uid))];
  let sups = [];
  if (role === 'manager' || openerIds.length) {
    const pushSnap = await db.collection('appSettings').doc('pushSettings').get();
    sups = await pushSupervisors(pushSnap, [...new Set([lead.dept, workerData.dept].filter(Boolean))],
      lg => rt(lg).sTitle(who), bodyOf,
      openerIds, { exclude: [context.auth.uid], onlyOpeners: role !== 'manager' }
    ).catch(e => { console.warn('remindLateTask: push לאחראים נכשל', e.message); return []; });
  }
  // אף אחד לא קיבל — משחררים את הנעילה כדי שאפשר יהיה לנסות שוב מיד
  if (!worker && !sups.length) await lockRef.delete().catch(() => {});
  console.log('remindLateTask:', ids.join(','), 'by', context.auth.uid, 'worker:', worker, 'sups:', sups.join(','));
  return { ok: true, worker, sups };
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
    // קיבוץ לפי batchId: משימות שנפתחו יחד רצות על טיימר שעון-קיר אחד, ולכן הסף הקובע
    // הוא סכום הצפי של כל הקבוצה (כמו הכרטיס הקבוצתי בלקוח) — לא צפי פר-משימה
    const units = {};
    for (const doc of tasksSnap.docs) {
      const t = doc.data();
      if (!t.startTime || !t.workerId || t.paused) continue;
      const key = t.batchId ? ('B_' + t.workerId + '_' + t.batchId) : ('S_' + doc.id);
      if (!units[key]) units[key] = { docId: doc.id, tasks: [] };
      units[key].tasks.push(t);
    }
    for (const unit of Object.values(units)) {
      try {
      const tasks = unit.tasks;
      const lead = tasks[0];
      const start = Math.min(...tasks.map(t => new Date(t.startTime).getTime()));
      const elapsed = now - start;
      // סף לקבוצה: סכום הצפי מהתמחור של כל המשימות; בלי צפי — הסף הקבוע
      const expSum = tasks.reduce((s, t) => s + ((typeof t.expectedMin === 'number' && t.expectedMin > 0) ? t.expectedMin : 0), 0);
      const hasExpected = expSum > 0;
      const limitMs = hasExpected ? expSum * 60000 : threshMs;
      if (elapsed < limitMs) continue;

      // שלח רק פעם אחת — לקבוצה מפתח לפי ה-batch (לא פר-משימה)
      const alertKey = 'longAlert_' + (tasks.length > 1 ? lead.workerId + '_' + lead.batchId : unit.docId);
      const alertSnap = await db.collection('taskAlerts').doc(alertKey).get();
      if (alertSnap.exists) continue;

      const workerSnap = await db.collection('workers').doc(lead.workerId).get();
      if (!workerSnap.exists) continue;
      const workerData = workerSnap.data();
      const mins = Math.round(elapsed / 60000);
      const stepsTxt = tasks.map(t => t.taskType).filter(Boolean).join(', ');
      const prodsTxt = [...new Set(tasks.map(t => t.prod || ''))].join(', ');
      const qtySum = tasks.reduce((s, t) => s + (t.qty || 0), 0);

      // חריגה מצפי התמחור — גם טלגרם למנהל (לא רק push לעובד)
      if (hasExpected) {
        const { token: tgT, chatId: tgC } = tgCfg();
        if (tgT && tgC) {
          // תחנת העבודה של העובד + ערוץ המצלמה ב-DVR — קפיצה ישירה בהקלטה
          let stationTxt = '';
          try {
            const cs = workerData.currentStation;
            if (cs && cs.id) {
              const stSnap = await db.collection('stations').doc(cs.id).get();
              const st = stSnap.exists ? stSnap.data() : null;
              const nm = (st && st.name) || cs.name || cs.id;
              const ch = st && st.dvrChannel ? ' · 📹 ערוץ ' + st.dvrChannel : '';
              const since = cs.since ? ' (מ-' + ilTimeOfIso(cs.since) + ')' : '';
              stationTxt = '\n📍 תחנה: ' + nm + ch + since;
            }
          } catch (e) {}
          await sendTelegram(tgT, tgC,
            '⏱ TextileOps — חריגה מזמן מתוקצב\n👤 עובד: ' + (lead.workerName || lead.workerId) +
            stationTxt +
            (stepsTxt ? '\n🔧 שלב: ' + stepsTxt : '') +
            '\n📦 מוצר: ' + prodsTxt + ' · ' + qtySum + " יח'" +
            (tasks.length > 1 ? '\n🧺 ' + tasks.length + ' משימות במקביל — צפי מסוכם' : '') +
            '\n🎯 מוקצב: ' + Math.round(expSum) + ' דק\' · בפועל: ' + mins + ' דק\'' +
            '\n▶️ התחלה: ' + ilTimeOfIso(lead.startTime) +
            '\n🕐 שעה: ' + ilTime()).catch(() => {});
        }
      }

      // 🔔 Push לעובד. ⚠️ עד 26/09/2026 כשל כאן (טלפון שהרישום שלו פג) זרק מחוץ ללולאה:
      // הבדיקה נעצרה על המשימה הזו, taskAlerts לא נכתב — ולכן הטלגרם שלמעלה נשלח שוב כל 5 דק'
      // ושאר המשימות שחרגו לא נבדקו כלל. עכשיו הכשל נבלע, והרישום המת נמחק מכרטיס העובד.
      const fcmToken = workerData.fcmToken;
      const pushPrefs = workerData.pushPrefs || {};
      let workerReached = false;
      if (fcmToken && pushPrefs.task_long !== false) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            notification: {
              title: hasExpected ? '⏱ חריגה מהזמן המוקצב' : '⚠️ משימה ארוכה',
              body: hasExpected
                ? 'הוקצבו ' + Math.round(expSum) + ' דקות' + (tasks.length > 1 ? ' ל-' + tasks.length + ' המשימות' : ' למשימה') + ' — עברו כבר ' + mins + ' דקות'
                : 'המשימה שלך פעילה כבר ' + mins + ' דקות'
            },
            android: { priority: 'high', notification: { sound: 'default', channelId: 'textileops' } },
            webpush: { notification: { icon: 'https://amtextile2222-beep.github.io/textileops/icon-192.png', requireInteraction: true } }
          });
          workerReached = true;
        } catch (e) {
          console.warn('longTaskMonitor: push לעובד נכשל', lead.workerId, e.code || e.message);
          if (DEAD_FCM_CODES.includes(e.code)) {
            await workerSnap.ref.set({ fcmToken: FieldValue.delete() }, { merge: true }).catch(() => {});
          }
        }
      }
      // 👔 חלק גדול מהעובדות בלי טלפון — האחראי פותח להן משימות בסורק. מי שלא קיבלה Push,
      // ההתראה עוברת לאחראים (מעדיפים את אחראי המחלקה של העובדת; אם אין — לכל האחראים).
      if (!workerReached) {
        const who = lead.workerName || workerData.name || lead.workerId;
        // מי פתח את המשימות (סורק המשימות שומר scannedBy) — בלי העובדת עצמה
        const openerIds = [...new Set(tasks.map(t => t.scannedBy).filter(id => id && id !== lead.workerId))];
        // מחלקת המשימה (איפה העבודה נעשית) וגם מחלקת העובדת
        await pushSupervisors(pushSnap, [...new Set([lead.dept, workerData.dept].filter(Boolean))],
          hasExpected ? '⏱ חריגה מהזמן — ' + who : '⚠️ משימה ארוכה — ' + who,
          (stepsTxt ? stepsTxt + ' · ' : '') + prodsTxt +
            (hasExpected ? ' · הוקצבו ' + Math.round(expSum) + ' דק\', עברו ' + mins : ' · פעילה ' + mins + ' דק\''),
          openerIds
        ).catch(e => console.warn('longTaskMonitor: push לאחראים נכשל', e.message));
      }
      await db.collection('taskAlerts').doc(alertKey).set({ sent: true, ts: now, taskId: unit.docId, batchId: lead.batchId || null, expected: hasExpected ? expSum : null, workerReached });
      console.log('longTaskMonitor: sent alert for', alertKey, workerReached ? '(worker)' : '(supervisors)');
      } catch (e) {
        // משימה אחת שנכשלה לא עוצרת את בדיקת האחרות
        console.error('longTaskMonitor unit error:', unit.docId, e);
      }
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

    // ── מצב גיבוי: בזמן failover ה-IP הציבורי אינו זה של המפעל, וכל התראה כאן
    // היא שווא. כשהחלון נסגר מודיעים פעם אחת שההגנה חזרה — כדי שלא יישאר ספק. ──
    if (ipBypassMsLeft(settings)) {
      if (settings.ipBypassEnded) await settingsSnap.ref.update({ ipBypassEnded: false });
      return null;
    }
    if (settings.ipBypassMin && !settings.ipBypassEnded) {
      await settingsSnap.ref.update({ ipBypassEnded: true });
      await sendTelegram(waToken, waChatId,
        `🔒 TextileOps — מצב גיבוי הסתיים\n🏭 בדיקת IP המפעל חזרה לפעול (${factoryIP})\n🕐 שעה: ${ilTime()}`
      );
    }

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
// חלון חי בלקוח = 14 יום; שמירה ב-Firestore עד 365 יום; מעבר לכך — בקבצי CSV אצל המנהל.
// ⚠️ היה 60 עד 25/09/2026: הארכוב של 01/10 היה מוחק את כל יולי (~2,400 משימות, ~1,960 שע')
// ודוחות הרווח של הזמנות יולי-אוגוסט היו מאבדים את השעות = רווח מנופח בשקט.
const ARCHIVE_AFTER_DAYS = 365;
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
    // checkout = היציאה האחרונה בפועל. עד 04/10/2026 נכתב תמיד סוף המשמרת — גם לעובדת שכבר
    // יצאה ב-10:09 — ודוח הנוכחות הראה 15:00 לכולן (ה-netMs עצמו היה נכון).
    const closedSessions = baseSessions.map(s => s.out ? s : { ...s, out: cutISO });
    const lastOut = closedSessions.map(s => s.out).sort().pop() || cutISO;
    const rec = {
      workerId: w.id, workerName: w.name || '', dept: w.dept || '', date: day,
      sessions: closedSessions,
      checkin: baseSessions[0].in, checkout: lastOut,
      breakStart: w.breakStart || '', breakEnd: w.breakEnd || '', breakActive: !!w.breakActive,
      autoClosed: baseSessions.some(s => s.in && !s.out),
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

  // 2.5) רישומי תחנה (stationLog) שנשארו פתוחים — סגירה בשעת סוף המשמרת של יום ההתחלה
  // 🔑 **וגם ניקוי `workers.currentStation`** — סגירת הרישום לבדה לא מספיקה. עד 21/09
  // השיוך על מסמך העובד נשאר, ולכן הוא נכנס למחרת עם התחנה של אתמול: `stationGate`
  // מאשר לו להתחיל משימה בלי שסרק כלום, והמשימה נחתמת במכונה שלא ישב עליה.
  // נמדד אצל ابوزكي — אפס רשומות stationLog ב-21/09, ומשימה מ-06:30 עם station:"درزه 1".
  let stationsCleared = 0;
  try {
    const clearWorkerStation = async (workerId, logId) => {
      if (!workerId) return;
      // ⚠️ מנקים **רק** אם זה עדיין הרישום הפעיל של העובד. בלי הבדיקה, סגירת רישום
      // ישן הייתה מוחקת שיוך חדש ותקף שנסרק אחריו.
      const wRef = db.collection('workers').doc(workerId);
      const wSnap = await wRef.get();
      if (!wSnap.exists || wSnap.data().stationLogId !== logId) return;
      await wRef.set({ currentStation: null, stationLogId: null }, { merge: true });
      stationsCleared++;
    };
    const openLogs = await db.collection('stationLog').where('to', '==', null).get();
    for (const doc of openLogs.docs) {
      const r = doc.data();
      if (!r.from) {
        await doc.ref.set({ to: new Date().toISOString() }, { merge: true });
        await clearWorkerStation(r.workerId, doc.id).catch(() => {});
        continue;
      }
      const day = ilDateOf(r.from);
      const cutISO = ilDateTime(day, shiftEnd).toISOString();
      if (Date.now() < new Date(cutISO).getTime()) continue; // המשמרת עוד לא נגמרה
      await doc.ref.set({ to: cutISO, autoClosed: true }, { merge: true });
      await clearWorkerStation(r.workerId, doc.id).catch(() => {});
    }
  } catch (e) { console.error('attendanceCloser stationLog:', e); }

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
    // משימה שחודשה מיום קודם (origStart) שוברת את ההנחה "מעל 8 שעות בלתי אפשרי במשמרת" —
    // היא באמת נמשכה כמה ימים. הענף שחותך לפי סוף המשמרת של יום ההתחלה היה מוחק
    // את הימים הקודמים, כי startTime הוא יום החידוש. ראה סעיף 5 ו-9eddc2d בלקוח.
    if (t.origStart) continue;
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

  // 5) ריפוי זמן batch מנופח — משימות שחולקות batchId ונשמרו עם הזמן המלא על כל אחת
  // (במקום חלוקה יחסית לכמות). מזוהה לפי סכום duration >> הזמן המשותף של ה-batch. לעולם רק מקטין.
  let fixedBatch = 0;
  try {
    const sinceISO = new Date(Date.now() - 65 * 86400000).toISOString();
    const bSnap = await db.collection('histTasks').where('startTime', '>=', sinceISO).get();
    const groups = {};
    bSnap.docs.forEach(d => {
      const t = d.data();
      if (!t.batchId) return;
      const k = String(t.workerId) + '|' + t.batchId;
      (groups[k] = groups[k] || []).push({ ref: d.ref, t });
    });
    for (const g of Object.values(groups)) {
      if (g.length < 2) continue;
      // משימה שחודשה מיום קודם (origStart): ה-duration כולל בכוונה זמן שנצבר בימים
      // קודמים, בעוד clock מודד רק את חלון היום — ולכן sumDur>clock*1.5 תמיד מתקיים
      // וההשוואה חסרת משמעות. בלי הדילוג הזה החיתוך מוחק את עבודת אתמול
      // (ندوه 03/08: 56.2 דק' → 2.5). מקביל לתיקון 9eddc2d ב-normalizeBatchDurations בלקוח.
      if (g.some(x => x.t.origStart)) continue;
      const starts = g.map(x => new Date(x.t.startTime).getTime()).filter(n => !isNaN(n));
      const ends = g.map(x => x.t.endTime ? new Date(x.t.endTime).getTime() : NaN).filter(n => !isNaN(n));
      if (!starts.length || !ends.length) continue;
      const clock = Math.max(0, Math.round((Math.max(...ends) - Math.min(...starts)) / 1000));
      const sumDur = g.reduce((s, x) => s + (x.t.duration || 0), 0);
      if (!(clock > 0 && sumDur > clock * 1.5)) continue; // כבר חולק נכון
      const totQ = g.reduce((s, x) => s + (x.t.qty || 0), 0);
      for (const x of g) {
        const nd = totQ > 0 ? Math.round(clock * (x.t.qty || 0) / totQ) : Math.round(clock / g.length);
        if (nd >= 0 && nd < (x.t.duration || 0)) {
          await x.ref.set({ duration: nd, batchFixed: true }, { merge: true });
          fixedBatch++;
        }
      }
    }
  } catch (e) { console.error('batch heal error:', e); }

  // דיווח לטלגרם — רק אם היה מה לסגור
  if (closed.length || repaired || pausedNames.length || fixedDur || fixedBatch) {
    const { token, chatId } = tgCfg();
    if (token && chatId) {
      let msg = '🌙 TextileOps — סגירה אוטומטית מהשרת';
      if (closed.length) msg += '\n📋 נוכחות נסגרה ב-' + shiftEnd + ' (' + closed.length + '): ' + closed.join(', ');
      if (repaired) msg += '\n🛠 תוקנו ' + repaired + ' רשומות נוכחות מנופחות';
      if (pausedNames.length) msg += '\n⏸ משימות הושהו (' + pausedNames.length + '): ' + pausedNames.join(', ');
      if (fixedDur) msg += '\n⏱ תוקן משך מנופח ב-' + fixedDur + ' משימות בהיסטוריה';
      if (fixedBatch) msg += '\n🧮 תוקן זמן batch מנופח ב-' + fixedBatch + ' משימות';
      if (stationsCleared) msg += '\n📍 נוקו ' + stationsCleared + ' שיוכי תחנה שנשארו פתוחים';
      await sendTelegram(token, chatId, msg).catch(() => {});
    }
  }
  return { closed: closed.length, repaired, paused: pausedNames.length, fixedDur, fixedBatch, stationsCleared };
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

// ─── 📦 מעקב הזמנות ללקוח (10/10/2026) ─────────────────────────────
// דף track.html — הלקוח נכנס עם קישור במייל (Firebase Email Link, פעם אחת למכשיר) ורואה רק את ההזמנות שלו.
// 🔐 הזיהוי = המייל המאומת שב-ID token. המיילים המורשים נשמרים ע"י מנהל ב-adminSettings/custLinks.emails =
// {קוד לקוח: [מיילים]} — מסמך שעובד לא קורא ולא כותב (בפרטי הלקוח ב-appSettings כל עובד יכול לכתוב,
// והיה מכניס את המייל של עצמו). הסרת מייל = חסימה מיידית, גם במכשיר שכבר מחובר (נבדק בכל בקשה).
// משתמש מייל אין לו role ⇒ ה-Rules וכל ה-callables חוסמים אותו; הלקוח לא נוגע במסד בכלל.
// מוחזרים **רק** שדות תצוגה: מס' הזמנה, שם, כמות, תאריכים, שלב ואחוזים. בלי מחירים/עובדים/ברקודים.
//
// ⚠️ חייב להישאר זהה ל-pipeStateOf / taskOrderStamp / taskUnits / coverKey ב-index.html —
// הלקוח צריך לראות בדיוק את מה שהמנהל רואה ב"לוח מצב הזמנות". שינוי שם ⇒ שינוי כאן.
const TRACK_LISTS = ['intake', 'countcut', 'ready_sew', 'sewing', 'ready_pack', 'packing', 'ready_ship', 'shipped'];
const TRACK_SHIP_DAYS = 30;
const _trackCache = new Map(); // קוד לקוח → {at, body}, 3 דק' — מגן מפני רענון חוזר שקורא שוב את כל ההיסטוריה
function trackFamOfDept(d) {
  const s = String(d || '').toLowerCase();
  if (/استقبال|قص|קבל|חית|גזיר/.test(s)) return 'recv';
  if (/خياط|خيط|תפיר/.test(s)) return 'sew';
  if (/اريز|تغليف|كوي|فحص|אריז|גיהו|ניקו|ביקור/.test(s)) return 'pack';
  return '';
}
const trackStepName = s => typeof s === 'string' ? s : (s && s.name) || '';
const trackStepStation = s => (s && typeof s === 'object' && s.station) ? s.station : '';
const trackStamp = p => +p.createdAt || parseInt(String(p.id).replace(/\D/g, '')) || 0;
const trackOrderNoOf = raw => { const s = String(raw || ''); return s.length >= 16 ? (parseInt(s.slice(13, 16), 10) || 0) : 0; };
const trackQty = p => (p.quantities || []).reduce((s, q) => s + (parseInt(q.qty) || 0), 0);
const trackBc = t => t.bc || String(t.cust) + String(t.prod) + String(t.size || '0') + String(t.qty).padStart(3, '0') + String(t.col);
const trackCoverKey = t => trackBc(t) + '|' + String(t.taskType || '').trim().toLowerCase() + (t.splitId ? '|' + t.splitId : '');
function trackShipDate(p) {
  const s = (p.stageLog || []).find(e => e.id === 'shipped');
  if (s && s.date) return s.date;
  return p.shippedAt ? String(p.shippedAt).slice(0, 10) : '';
}
function trackEntryDate(p) {
  if (+p.createdAt) return new Date(+p.createdAt).toISOString().slice(0, 10);
  const r = (p.stageLog || []).find(e => e.id === 'receive');
  return (r && r.date) || '';
}
// prods = כל רשומות המוצר של הלקוח (prodByOrderNo/findProd/prodStampOldest מסננים ממילא לפי לקוח)
function trackStates(prods, tasks) {
  const byNo = (prod, no) => no ? prods.find(p => p.prod === prod && (parseInt(p.orderNo, 10) || 0) === no) || null : null;
  const newest = prod => { let b = null, mx = -1; for (const p of prods) { if (p.prod !== prod) continue; const c = trackStamp(p); if (c > mx) { mx = c; b = p; } } return b; };
  const oldest = prod => { let mn = Infinity; for (const p of prods) { if (p.prod !== prod) continue; const c = trackStamp(p); if (c < mn) mn = c; } return isFinite(mn) ? mn : 0; };
  const orderStamp = t => {
    const no = trackOrderNoOf(t.bc);
    if (no) { const r = byNo(t.prod, no); if (r) return trackStamp(r); }
    if (t.prodStamp != null) return t.prodStamp;
    return oldest(t.prod);
  };
  const units = t => {
    const q = +t.qty || 0;
    if (q > 0) return q;
    if (!t.isTotal) return 0;
    const r = byNo(t.prod, trackOrderNoOf(t.bc)) || newest(t.prod);
    return r ? trackQty(r) : 0;
  };
  const byOrder = {};
  for (const t of tasks) { const k = t.prod + '|' + orderStamp(t); (byOrder[k] || (byOrder[k] = [])).push(t); }
  return prods.map(p => {
    const ts = byOrder[p.prod + '|' + trackStamp(p)] || [];
    const qty = trackQty(p);
    const scans = { recv: 0, sew: 0, pack: 0 };
    for (const t of ts) { const f = trackFamOfDept(t.dept); if (f) scans[f]++; }
    const steps = { recv: [], sew: [], pack: [], none: [] };
    for (const s of (p.workSteps || [])) { const nm = trackStepName(s); if (!nm) continue; steps[trackFamOfDept(String(trackStepStation(s)).split('::')[0]) || 'none'].push(nm); }
    const seen = new Set(), done = {};
    for (const t of ts) {
      if (!(t.duration > 0)) continue;
      const k = trackCoverKey(t); if (seen.has(k)) continue; seen.add(k);
      const nm = String(t.taskType || '').trim(); done[nm] = (done[nm] || 0) + units(t);
    }
    // full/of כמו בלוח (קובע את המצב) + pct = יחידות שבוצעו מתוך כמות×שלבים (לתצוגת הלקוח בלבד)
    const fam = f => {
      const ss = steps[f]; if (!ss.length) return null;
      return { full: ss.filter(nm => qty > 0 && (done[nm] || 0) >= qty).length, of: ss.length,
        pct: qty > 0 ? Math.round(100 * ss.reduce((s, nm) => s + Math.min(done[nm] || 0, qty), 0) / (qty * ss.length)) : 0 };
    };
    const sew = fam('sew'), pack = fam('pack');
    const shipped = (p.stageLog || []).some(e => e.id === 'shipped') || +p.shippedQty > 0;
    let id;
    if (shipped) id = 'shipped';
    else if (pack && pack.of > 0 && pack.full === pack.of) id = 'ready_ship';
    else if (scans.pack > 0) id = 'packing';
    else if (sew && sew.of > 0 && sew.full === sew.of) id = 'ready_pack';
    else if (scans.sew > 0) id = 'sewing';
    else if (qty > 0 && scans.recv > 0) id = 'ready_sew';
    else if (scans.recv > 0) id = 'countcut';
    else id = 'intake';
    // דחיפה ידנית של מנהל — קדימה בלבד, כמו בלוח
    const ov = p.pipeOverride && TRACK_LISTS.indexOf(p.pipeOverride.list) >= 0 ? p.pipeOverride.list : null;
    if (ov && id !== 'shipped' && TRACK_LISTS.indexOf(ov) > TRACK_LISTS.indexOf(id)) id = ov;
    const st = TRACK_LISTS.indexOf(id);
    // אחוז בשלב הנוכחי בלבד; שלב שכבר עבר = 100
    const sewPct = st > 3 ? 100 : (st === 3 && sew ? sew.pct : null);
    const packPct = st > 5 ? 100 : (st === 5 && pack ? pack.pct : null);
    return { no: parseInt(p.orderNo, 10) || 0, prod: p.prod, name: p.name || '', qty, entry: trackEntryDate(p),
      ship: shipped ? trackShipDate(p) : '', stage: st, sewPct, packPct };
  });
}
// רשומת מייל מורשה: {e, at} — at = מתי נוסף (ms). מחרוזת = רשומה מלפני 10/10/2026 בלי at
const trackEmailEnt = x => typeof x === 'string' ? { e: x.toLowerCase(), at: 0 } : { e: String((x && x.e) || '').toLowerCase(), at: +(x && x.at) || 0 };
function trackDevice(ua) {
  ua = String(ua || '');
  const os = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'לא ידוע';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return os + (br ? ' · ' + br : '');
}
const escTg = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 🕘 יומן כניסות + טלגרם. כניסה = session חדש (uid + auth_time) — רענונים של אותו מכשיר לא נרשמים.
// adminSettings/custTrackLog.entries = {uid_authTime: {cust, email, at, dev, ip, ok}} — מנהל בלבד ב-Rules
// (מסמך ב-adminSettings ⇒ אין שינוי ב-Rules). נשמרות 300 האחרונות. cust='' ⇒ מייל לא מורשה (ok:false).
const _trackSeen = new Set();
async function trackLogSignIn(tok, email, cust, req) {
  const key = tok.uid + '_' + (Number(tok.auth_time) || 0);
  if (_trackSeen.has(key)) return;
  try {
    const ref = db.doc('adminSettings/custTrackLog');
    const rec = { cust, email, at: Date.now(), dev: trackDevice(req.get('user-agent')), ip: callerIp({ rawRequest: req }), ok: !!cust };
    const isNew = await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      const ent = (s.data() || {}).entries || {};
      if (ent[key]) return false;
      const upd = { ['entries.' + key]: rec };
      const old = Object.keys(ent).sort((a, b) => (ent[a].at || 0) - (ent[b].at || 0));
      for (const k of old.slice(0, Math.max(0, old.length - 299))) upd['entries.' + k] = FieldValue.delete();
      if (s.exists) tx.update(ref, upd); else tx.set(ref, { entries: { [key]: rec } });
      return true;
    });
    _trackSeen.add(key);
    if (!isNew) return;
    const { token: tgT, chatId: tgC } = tgCfg();
    if (!tgT || !tgC) return;
    const nm = cust ? (((await db.doc('appSettings/customerNames').get()).data() || {})[cust] || cust) : '';
    const txt = cust
      ? `🔐 <b>כניסה למעקב הזמנות</b>\nלקוח: ${escTg(nm)}\nמייל: ${escTg(email)}\nמכשיר: ${escTg(rec.dev)}\nשעה: ${ilTime()}`
      : `⚠️ <b>ניסיון כניסה למעקב הזמנות — מייל לא מורשה</b>\nמייל: ${escTg(email)}\nמכשיר: ${escTg(rec.dev)}\nשעה: ${ilTime()}`;
    await sendTelegram(tgT, tgC, txt).catch(() => {});
  } catch (e) { console.error('trackLogSignIn error:', e); } // היומן לא מפיל את הצגת ההזמנות
}

// ⚡ 1GB: בדור הראשון המעבד גדל עם הזיכרון — עיבוד אלפי משימות על ברירת המחדל (256MB) לקח 11 שנ'
// (נמדד 10/10/2026). רק לפונקציה הזו; נקראת לעיתים רחוקות, כך שהעלות זניחה
exports.customerTrack = functions.runWith({ memory: '1GB' }).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Authorization');
    res.status(204).send(''); return;
  }
  const m = /^Bearer (.+)$/.exec(String(req.get('Authorization') || ''));
  if (!m) { res.status(401).json({ error: 'auth' }); return; }
  let email, tok;
  try {
    tok = await admin.auth().verifyIdToken(m[1]);
    if (!tok.email || !tok.email_verified) { res.status(401).json({ error: 'auth' }); return; }
    email = String(tok.email).toLowerCase();
  } catch (e) { res.status(401).json({ error: 'auth' }); return; }
  try {
    // נקרא בכל בקשה (גם כשיש מטמון) — כך הסרת מייל חוסמת מיד
    const map = ((await db.doc('adminSettings/custLinks').get()).data() || {}).emails || {};
    let cust = '', ent = null;
    for (const c of Object.keys(map)) {
      const x = (map[c] || []).map(trackEmailEnt).find(x => x.e === email);
      if (x) { cust = c; ent = x; break; }
    }
    if (!cust) { await trackLogSignIn(tok, email, '', req); res.status(403).json({ error: 'denied', email }); return; }
    // 🔐 הוספה מחדש של מייל מנתקת כל מכשיר שנכנס לפניה: auth_time = רגע הכניסה עם הקישור (לא מתאפס
    // ברענון טוקן). 2 דק' סובלנות לשעון של מחשב המנהל (at נחתם בלקוח). 401 ⇒ הדף מתנתק ומבקש קישור חדש
    if (ent.at && (Number(tok.auth_time) || 0) * 1000 < ent.at - 120000) { res.status(401).json({ error: 'reauth' }); return; }
    await trackLogSignIn(tok, email, cust, req);
    const t0 = Date.now();
    const hit = _trackCache.get(cust);
    if (hit && Date.now() - hit.at < 180000) { res.json(hit.body); return; }
    const [pS, aS, nS] = await Promise.all([
      db.collection('products').where('cust', '==', cust).get(),
      db.collection('activeTasks').where('cust', '==', cust).get(),
      db.doc('appSettings/customerNames').get()
    ]);
    const prods = pS.docs.map(d => ({ id: d.id, ...d.data() }));
    const from = new Date(Date.now() - TRACK_SHIP_DAYS * 86400000).toISOString().slice(0, 10);
    // ⚡ היסטוריה רק של הדגמים שמוצגים (פתוחים / נשלחו ב-30 יום) — "נשלח" נקבע מהמוצר בלבד, ולכן
    // הסינון לא משנה אף מצב שמוצג. כל ההיסטוריה של הלקוח לקחה 17-25 שנ' (נמדד 10/10/2026).
    // where('prod','in') בלבד (בלי cust) — לא דורש אינדקס מורכב; הלקוח מסונן בזיכרון
    const shipOf = p => ((p.stageLog || []).some(e => e.id === 'shipped') || +p.shippedQty > 0) ? (trackShipDate(p) || '0') : '';
    const codes = [...new Set(prods.filter(p => { const s = shipOf(p); return !s || s >= from; }).map(p => p.prod))];
    const chunks = [];
    for (let i = 0; i < codes.length; i += 30) chunks.push(codes.slice(i, i + 30));
    const hSs = await Promise.all(chunks.map(c => db.collection('histTasks').where('prod', 'in', c).get()));
    const tasks = [...hSs.flatMap(s => s.docs), ...aS.docs].map(d => d.data()).filter(t => t.cust === cust);
    // פעילות לפי סדר כניסה (הוותיקה ראשונה), ואחריהן שנשלחו — החדשה ראשונה
    const orders = trackStates(prods, tasks)
      .filter(o => o.stage < 7 || (o.ship && o.ship >= from))
      .sort((a, b) => ((a.stage === 7) - (b.stage === 7)) ||
        (a.stage === 7 ? String(b.ship).localeCompare(String(a.ship)) : String(a.entry || '9999').localeCompare(String(b.entry || '9999'))));
    const body = { name: (nS.data() || {})[cust] || '', at: new Date().toISOString(), orders };
    console.log(`customerTrack ${cust}: ${tasks.length} tasks, ${codes.length} models, ${Date.now() - t0} ms`);
    _trackCache.set(cust, { at: Date.now(), body });
    res.json(body);
  } catch (e) {
    console.error('customerTrack error:', e);
    res.status(500).json({ error: 'server' });
  }
});
