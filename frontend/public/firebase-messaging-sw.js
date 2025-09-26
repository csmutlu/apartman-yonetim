try {
  importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');
  console.log('[SW Basic] Firebase SDK yüklendi.');
} catch (e) {
  console.error('[SW Basic] Firebase SDK yüklenemedi:', e);
}

const firebaseConfig = {
  apiKey: "AIzaSyCETrjFmvJgWWjU-UNIzaasAo4b5QXJIKU",
  projectId: "apartman-yonetim-11ff2",
  messagingSenderId: "761379436404",
  appId: "1:761379436404:web:aba76c5fb4838c1b45de21"
};

self.addEventListener('install', (event) => {
  console.log('[SW Basic] Yüklendi, aktifleşiyor...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW Basic] Aktifleşti, kontrol alınıyor...');
  event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PING') {
    console.log('[SW Basic] PING mesajı alındı:', event.data);
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        type: 'PONG',
        timestamp: new Date().toISOString(),
        received: event.data
      });
    }
  }
});

try {
  if (firebase.apps.length === 0) { 
    firebase.initializeApp(firebaseConfig);
    console.log('[SW Basic] Firebase App başlatıldı.');
  } else {
    firebase.app(); 
    console.log('[SW Basic] Mevcut Firebase App kullanılıyor.');
  }

  const messaging = firebase.messaging();
  console.log('[SW Basic] Firebase Messaging alındı.');

  messaging.onBackgroundMessage((payload) => {
    console.log('[SW Basic] Arka plan mesajı alındı: ', payload);

    const notificationTitle = payload.notification?.title || 'Yeni Bildirim';
    const notificationOptions = {
      body: payload.notification?.body || 'Yeni bir mesajınız var.',
      icon: payload.notification?.icon || '/favicon.ico', 
      data: { 
        click_action: payload.data?.click_action || payload.fcmOptions?.link || '/'
      }
    };

    console.log('[SW Basic] Bildirim gösteriliyor:', notificationTitle, notificationOptions);

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });

  console.log('[SW Basic] Arka plan mesaj dinleyicisi ayarlandı.');

} catch (error) {
  console.error('[SW Basic] Firebase başlatma veya mesaj dinleyici ayarlama hatası:', error);
}

self.addEventListener('notificationclick', (event) => {
  console.log('[SW Basic] Bildirime tıklandı:', event.notification);
  event.notification.close(); 

  const urlToOpen = event.notification.data?.click_action || '/';
  console.log('[SW Basic] Açılacak URL:', urlToOpen);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      let matchingClient = null;
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        const clientUrl = client.url.endsWith('/') ? client.url : client.url + '/';
        const targetUrl = urlToOpen.endsWith('/') ? urlToOpen : urlToOpen + '/';
        if (clientUrl === targetUrl) {
          matchingClient = client;
          break;
        }
      }

      if (matchingClient) {
        console.log('[SW Basic] Eşleşen pencereye odaklanılıyor:', matchingClient.url);
        return matchingClient.focus();
      } else {
        console.log('[SW Basic] Yeni pencere açılıyor:', urlToOpen);
        return clients.openWindow(urlToOpen);
      }
    }).catch(err => {
      console.error("[SW Basic] Pencere açma/odaklanma hatası:", err);
      return clients.openWindow('/');
    })
  );
});

console.log('[SW Basic] Service Worker hazır.');