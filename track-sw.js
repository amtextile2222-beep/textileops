// 🔔 Service Worker של דף המעקב ללקוח (23/10/2026) — נפרד מ-firebase-messaging-sw.js של האפליקציה:
// נרשם עם scope צר ('./track') כדי לא להחליף את הרישום של האפליקציה באותו דפדפן.
// השרת (customerNotify) שולח הודעות data בלבד {title, body, link} — ההצגה והלחיצה כאן.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCN9AlUZFX6tODyClzopC9BrRi-Oj7oSv8",
  projectId: "textileops-aef4a",
  appId: "1:570030273525:web:ff4a7d125a40066a4826bc",
  authDomain: "textileops-aef4a.firebaseapp.com",
  messagingSenderId: "570030273525",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  return self.registration.showNotification(d.title || 'מעקב הזמנות', {
    body: d.body || '',
    icon: '/textileops/icon-192.png',
    badge: '/textileops/icon-192.png',
    dir: 'rtl', lang: 'he',
    tag: 'track-update',
    renotify: true,
    data: { link: d.link || '/textileops/track.html' },
  });
});

// לחיצה ⇒ דף המעקב: לשונית פתוחה מקבלת פוקוס (ומתרעננת לבד), אחרת נפתחת חדשה
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '/textileops/track.html';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.includes('/textileops/track.html'));
    return w ? w.focus() : clients.openWindow(link);
  }));
});
