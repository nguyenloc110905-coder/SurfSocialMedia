importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBZHa66RZZlUIsSoW3WNpPRoseA3bLpvm8",
  authDomain: "surf-7ce71.firebaseapp.com",
  projectId: "surf-7ce71",
  storageBucket: "surf-7ce71.firebasestorage.app",
  messagingSenderId: "755301113435",
  appId: "1:755301113435:web:9ad94c63b137898e2aa97e",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Surf Notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: payload.notification?.image || '/SurfLogo.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
