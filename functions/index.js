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
    const tokenList = Object.values(tokens).filter(Boolean);
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
