importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCN9AlUZFX6tODyClzopC9BrRi-Oj7oSv8",
  projectId: "textileops-aef4a",
  appId: "1:570030273525:web:ff4a7d125a40066a4826bc",
  authDomain: "textileops-aef4a.firebaseapp.com",
  storageBucket: "textileops-aef4a.firebasestorage.app",
  messagingSenderId: "570030273525",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || 'TextileOps';
  const body  = payload.notification?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon:  '/textileops/icon-192.png',
    badge: '/textileops/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'textileops-alert',
  });
});
