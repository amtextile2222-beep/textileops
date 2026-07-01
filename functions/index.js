const functions = require('firebase-functions');
const admin = require('firebase-admin');
const https = require('https');

admin.initializeApp();
const db = admin.firestore();

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

// שליחת Push Notification
exports.sendPush = functions.https.onCall(async (data) => {
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
exports.sendPushToWorker = functions.https.onCall(async (data) => {
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

// עוזר AI — proxy מאובטח ל-AnythingLLM (רץ עכשיו על שרת Railway קבוע, לא על Tunnel מקומי)
// כתובת/מפתח/slug מגיעים מ-`firebase functions:config:set anythingllm.*` — לא מקודדים בקובץ הזה
exports.aiChat = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'יש להתחבר תחילה');
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
    const { waToken, waChatId, factoryIP, waEnabled } = settings;
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
