// C:\Users\Süleyman\Desktop\apartman_yonetim\frontend\src\firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, getDoc, setDoc, serverTimestamp, query, where, getDocs, orderBy, writeBatch, updateDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// --- Firebase Configuration from Environment Variables ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// --- FCM VAPID Key from Environment Variables ---
const FCM_VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY;

// --- Initialize Firebase App ---
const app = initializeApp(firebaseConfig);

// --- Get Firebase Services ---
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'europe-west1');

// --- Messaging Initialization ---
let messaging = null;
let isSavingToken = false;
let isInitializingFirebase = false;

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');

    if (existingRegistration) {
      console.log(`[firebase.js] Mevcut SW bulundu: ${existingRegistration.scope}`);

      existingRegistration.update().catch(err => {
        console.warn("[firebase.js] SW güncelleme hatası:", err);
      });

      return existingRegistration;
    }

    console.log('[firebase.js] Service Worker kaydediliyor...');
    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
      updateViaCache: 'none'
    });

    console.log('[firebase.js] Service Worker kaydedildi:', swRegistration.scope);
    return swRegistration;
  } catch (error) {
    console.error('[firebase.js] Service Worker kayıt hatası:', error);
    return null;
  }
};

const initializeFirebaseServices = async () => {
  console.log("[firebase.js] initializeFirebaseServices ÇAĞRILDI");

  if (isInitializingFirebase) {
    console.log("[firebase.js] Başka bir başlatma işlemi devam ediyor, bekletiliyor...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (messaging) return messaging;
    return null;
  }

  isInitializingFirebase = true;

  try {
    const swRegistration = await registerServiceWorker();

    if (!swRegistration) {
      console.warn("[firebase.js] Service Worker kaydedilemedi");
      isInitializingFirebase = false;
      return null;
    }

    console.log("[firebase.js] FCM Desteği kontrol ediliyor...");
    const supported = await isSupported();

    if (supported) {
      console.log("[firebase.js] Firebase Messaging destekleniyor, başlatılıyor...");
      messaging = getMessaging(app);
      console.log("✅ [firebase.js] Firebase Messaging başarıyla başlatıldı.");
      return messaging;
    } else {
      console.warn("⚠️ [firebase.js] Firebase Messaging bu tarayıcı/cihaz tarafından desteklenmiyor.");
      messaging = null;
      return null;
    }
  } catch (error) {
    console.error("[firebase.js] initializeFirebaseServices hata:", error);
    return null;
  } finally {
    isInitializingFirebase = false;
  }
};

const saveTokenToFirestore = async (userId, fcmToken, platform = 'web') => {
  if (!userId || !fcmToken) {
    console.error('[firebase.js] saveTokenToFirestore: Geçersiz parametre - userId veya fcmToken eksik');
    return null;
  }

  if (isSavingToken) {
    console.log('[firebase.js] Başka bir token kayıt işlemi devam ediyor, işlem atlanıyor');
    return null;
  }

  isSavingToken = true;

  try {
    const tokensRef = collection(db, "users", userId, "fcmTokens");
    const q = query(tokensRef, where("token", "==", fcmToken), where("active", "==", true));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const existingTokenDoc = snapshot.docs[0];
      console.log(`[firebase.js] FCM token zaten kayıtlı (${existingTokenDoc.id}), güncelleniyor...`);

      await updateDoc(doc(db, "users", userId, "fcmTokens", existingTokenDoc.id), {
        refreshed_at: serverTimestamp(),
        last_used_client: new Date().toISOString(),
        device: navigator.userAgent,
        active: true
      });

      return existingTokenDoc.id;
    }

    const generateRandomId = (length = 8) => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    const timestamp = Date.now();
    const randomId = generateRandomId();
    const tokenId = `${platform}_${timestamp}_${randomId}`;

    const appVersion = "1.0.0";

    const isoTimestamp = new Date().toISOString();

    const tokenRef = doc(db, "users", userId, "fcmTokens", tokenId);

    await setDoc(tokenRef, {
      token: fcmToken,
      device: navigator.userAgent,
      platform: platform,
      app_version: appVersion,
      created_at: serverTimestamp(),
      refreshed_at: serverTimestamp(),
      login_at: serverTimestamp(),
      last_used_client: isoTimestamp,
      active: true
    });

    console.log(`[firebase.js] Yeni FCM token kaydedildi: ${tokenId}`);

    await cleanupOldTokens(userId, fcmToken);

    try {
      sessionStorage.setItem('last_fcm_token', fcmToken);
      sessionStorage.setItem('last_fcm_token_time', Date.now().toString());
    } catch (e) {
      console.error('[firebase.js] Session storage erişim hatası:', e);
    }

    return tokenId;
  } catch (error) {
    console.error('[firebase.js] FCM token kayıt hatası:', error);
    return null;
  } finally {
    isSavingToken = false;
  }
};

const cleanupOldTokens = async (userId, currentToken) => {
  try {
    const tokensRef = collection(db, "users", userId, "fcmTokens");
    const q = query(
      tokensRef,
      where("token", "!=", currentToken),
      orderBy("token"),
      orderBy("refreshed_at", "desc")
    );

    const snapshot = await getDocs(q);

    if (snapshot.size > 2) {
      console.log(`[firebase.js] ${snapshot.size - 2} eski token temizlenecek`);

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc, index) => {
        if (index >= 2) {
          batch.update(doc.ref, { active: false });
        }
      });

      await batch.commit();
      console.log('[firebase.js] Eski tokenlar temizlendi');
    }
  } catch (error) {
    console.error('[firebase.js] Token temizleme hatası:', error);
  }
};

export {
  auth,
  db,
  storage,
  messaging,
  FCM_VAPID_KEY,
  functions,
  initializeFirebaseServices,
  saveTokenToFirestore,
  cleanupOldTokens
};
