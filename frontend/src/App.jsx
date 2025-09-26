import React, { useState, useEffect, useContext } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { getToken, onMessage } from "firebase/messaging";
import {
  db,
  FCM_VAPID_KEY,
  initializeFirebaseServices,
  saveTokenToFirestore,
} from "./firebase";
import { UserContext, UserProvider } from "./contexts/UserContext";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Sidebar from "./components/Sidebar";
import AIChatBot from "./components/AIChatBot";
import {
  NotificationProvider,
  useNotifications,
} from "./contexts/NotificationContext";
import Login from "./pages/Login";
import "./App.css";
import {
  FaBell,
  FaCheckCircle,
  FaFileInvoiceDollar,
  FaBullhorn,
  FaToolbox,
  FaArrowRight,
} from "react-icons/fa";
import { Bounce } from "react-toastify";

import AdminHome from "./pages/AdminHome";
import AdminUsers from "./pages/AdminUsers";
import AdminPayments from "./pages/AdminPayments";
import AdminPaymentRequests from "./pages/AdminPaymentRequests";
import AdminReports from "./pages/AdminReports";
import AdminAnnouncements from "./pages/AdminAnnouncements";
import AdminExpenses from "./pages/AdminExpenses";
import AdminIssues from "./pages/AdminIssues";
import UserHome from "./pages/UserHome";
import UserPayments from "./pages/UserPayments";
import UserAnnouncements from "./pages/UserAnnouncements";
import UserExpenses from "./pages/UserExpenses";
import UserIssues from "./pages/UserIssues";

const LoadingSpinner = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      background: "var(--bg-primary)",
    }}
  >
    <div
      style={{
        width: "50px",
        height: "50px",
        border: "5px solid #ccc",
        borderTopColor: "var(--primary, #3498db)",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
      }}
    ></div>
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

function AppContent() {
  const { user, loading: userLoading } = useContext(UserContext);
  const { addForegroundNotification } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light"
  );
  const [fcmInitialized, setFcmInitialized] = useState(false);
  const [appError, setAppError] = useState(null);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    let unsubscribeOnMessage = () => {};
    let currentMessagingInstance = null;
    let fcmInitializeAttempted = false;

    const initializeAndManageFcm = async () => {
      if (fcmInitializeAttempted || fcmInitialized) {
        return;
      }

      fcmInitializeAttempted = true;

      if (!user) {
        return;
      }

      let isFirstTokenRequest = true;

      console.log("[FCM Setup] Başlatılıyor (Kullanıcı:", user.uid, ")");
      setAppError(null);

      try {
        console.log("[FCM Setup] initializeFirebaseServices çağrılıyor...");
        currentMessagingInstance = await initializeFirebaseServices();

        if (!currentMessagingInstance) {
          console.warn(
            "[FCM Setup] Messaging desteklenmiyor veya başlatılamadı."
          );
          setFcmInitialized(false);
          return;
        }
        console.log("[FCM Setup] Messaging başarıyla başlatıldı/alındı.");

        if (Notification.permission !== "granted") {
          console.log("[FCM Setup] Bildirim izni isteniyor...");
          const permission = await Notification.requestPermission();
          console.log("[FCM Setup] Bildirim İzin Sonucu:", permission);
          if (permission !== "granted") {
            console.warn("[FCM Setup] Bildirim izni reddedildi!");
            toast.warn(
              "Bildirimleri almak için lütfen tarayıcı ayarlarından izin verin.",
              { autoClose: 10000 }
            );
            setFcmInitialized(false);
            return;
          }
        }
        console.log("[FCM Setup] Bildirim izni mevcut.");

        try {
          console.log("[FCM Setup] FCM token işlemi başlıyor...");

          const lastToken = sessionStorage.getItem("last_fcm_token");
          const lastTokenTime = parseInt(
            sessionStorage.getItem("last_fcm_token_time") || "0"
          );
          const now = Date.now();
          const timeDiff = now - lastTokenTime;

          if (lastToken && timeDiff < 600000 && !isFirstTokenRequest) {
            console.log(
              `[FCM Setup] Son ${Math.round(
                timeDiff / 1000
              )} saniye içinde token alındı, işlem atlanıyor.`
            );
            return;
          }

          isFirstTokenRequest = false;

          await navigator.serviceWorker.ready;

          const swRegistration = await navigator.serviceWorker.getRegistration(
            "/firebase-messaging-sw.js"
          );
          if (!swRegistration) {
            throw new Error("Service Worker kaydı bulunamadı");
          }

          console.log(
            "[FCM Setup] Geçerli SW kaydı bulundu:",
            swRegistration.scope
          );

          const fcmToken = await getToken(currentMessagingInstance, {
            vapidKey: FCM_VAPID_KEY,
            serviceWorkerRegistration: swRegistration,
          }).catch((err) => {
            console.error("[FCM Setup] Token alma hatası:", err);
            throw new Error(`FCM token alınamadı: ${err.message}`);
          });

          if (!fcmToken) {
            console.warn(
              "[FCM Setup] FCM token alınamadı (getToken null döndü)"
            );
            setFcmInitialized(false);
            return;
          }

          console.log(
            `[FCM Setup] Token başarıyla alındı: ...${fcmToken.slice(-10)}`
          );

          await saveTokenToFirestore(user.uid, fcmToken, "web");
          console.log(
            "[FCM Setup] Token başarıyla Firestore'a kaydedildi/güncellendi."
          );

          sessionStorage.setItem("last_fcm_token", fcmToken);
          sessionStorage.setItem("last_fcm_token_time", Date.now().toString());
        } catch (tokenError) {
          console.error("[FCM Setup] Token işlemi hatası:", tokenError);
          toast.error(`Bildirim token işlemi başarısız: ${tokenError.message}`);
          setFcmInitialized(false);
          return;
        }

        console.log("[FCM Setup] Ön plan mesaj dinleyicisi kuruluyor...");
        unsubscribeOnMessage = onMessage(
          currentMessagingInstance,
          (payload) => {
            console.log(
              "%c[App] ÖN PLANDA MESAJ ALINDI!",
              "color: green; font-size: 16px; font-weight: bold;"
            );
            console.log("Payload:", payload);

            try {
              const title = payload.notification?.title || "Yeni Bildirim";
              const body =
                payload.notification?.body || "Yeni bir mesajınız var.";
              const clickAction = payload.data?.click_action || "/";

              const notification = addForegroundNotification(payload);
              console.log("Bildirim context'e eklendi:", notification);

              toast.info(
                <div style={{ cursor: "pointer" }}>
                  <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                    {title}
                  </div>
                  <div>{body}</div>
                </div>,
                {
                  position: "top-right",
                  autoClose: 7000,
                  hideProgressBar: false,
                  closeOnClick: true,
                  pauseOnHover: true,
                  draggable: true,
                  onClick: () => {
                    console.log(
                      "Toast tıklandı, yönlendiriliyor:",
                      clickAction
                    );
                    navigate(clickAction);
                  },
                }
              );

              try {
                const audio = new Audio("/notification-sound.mp3");
                audio.volume = 0.3;
                audio.play().catch((e) => console.log("Ses çalma hatası:", e));
              } catch (audioError) {
                console.log("Ses dosyası çalınırken hata:", audioError);
              }
            } catch (error) {
              console.error("Bildirim işleme hatası:", error);

              toast.info(
                `${payload.notification?.title || "Yeni Bildirim"}: ${
                  payload.notification?.body || ""
                }`,
                {
                  position: "top-right",
                  autoClose: 5000,
                }
              );
            }
          }
        );

        console.log("[FCM Setup] Ön plan mesaj dinleyicisi başarıyla kuruldu.");
        setFcmInitialized(true);
        console.log(
          "%c[FCM Setup] Kurulum başarıyla tamamlandı!",
          "color: blue; font-weight: bold;"
        );
      } catch (error) {
        console.error("❌ [FCM Setup] Genel Hata:", error);
        toast.error(`Bildirim sistemi hatası: ${error.message}`, {
          autoClose: 10000,
        });
        setFcmInitialized(false);
      }
    };

    if (user && !fcmInitialized && !fcmInitializeAttempted) {
      const timer = setTimeout(() => {
        initializeAndManageFcm();
      }, 2000);

      return () => {
        clearTimeout(timer);
      };
    }

    return () => {
      if (typeof unsubscribeOnMessage === "function") {
        console.log("[FCM Cleanup] Ön plan mesaj dinleyicisi kaldırılıyor.");
        unsubscribeOnMessage();
      }
    };
  }, [user, fcmInitialized]);

  useEffect(() => {
    const checkNotificationStatus = async () => {
      console.group("📱 Bildirim Durum Kontrolü (Debug)");
      console.log(
        "1) User:",
        user?.uid ? `Giriş Yapılmış (${user.uid})` : "Giriş YAPILMAMIŞ"
      );
      console.log(
        "2) Notification API:",
        "Notification" in window ? "DESTEKLENIYOR ✅" : "DESTEKLENMİYOR ❌"
      );
      console.log(
        "3) Service Worker API:",
        "serviceWorker" in navigator ? "DESTEKLENIYOR ✅" : "DESTEKLENMİYOR ❌"
      );
      console.log("4) İzin Durumu:", Notification.permission);

      console.log(
        "5) FCM Başlatıldı mı? (fcmInitialized):",
        fcmInitialized ? "EVET ✅" : "HAYIR/BEKLENİYOR ❌"
      );

      if ("Notification" in window && fcmInitialized && user) {
        try {
          await navigator.serviceWorker.ready;
          console.log("Debug: Service Worker hazır.");

          const tempMessaging = await initializeFirebaseServices();
          if (tempMessaging) {
            const swRegistration =
              await navigator.serviceWorker.getRegistration(
                "/firebase-messaging-sw.js"
              );
            if (!swRegistration) {
              console.error("Debug: SW Registration bulunamadı!");
              return;
            }
            const token = await getToken(tempMessaging, {
              vapidKey: FCM_VAPID_KEY,
              serviceWorkerRegistration: swRegistration,
            }).catch((err) => {
              console.error("Debug getToken Hatası:", err.message);
              return null;
            });
            console.log(
              "6) FCM Token:",
              token
                ? `ALINMIŞ (${token.substring(0, 10)}...) ✅`
                : "ALINAMAMIŞ ❌"
            );
          } else {
            console.log("6) FCM Token: Messaging instance alınamadı (debug).");
          }
        } catch (e) {
          console.log("6) FCM Token: HATA! ❌", e.message);
        }
      } else if (!user) {
        console.log("6) FCM Token: Kullanıcı girişi bekleniyor...");
      } else if (!fcmInitialized) {
        console.log("6) FCM Token: FCM başlatılması bekleniyor...");
      }
      console.groupEnd();
    };

    if (!userLoading) {
      const timer = setTimeout(checkNotificationStatus, 3500);
      return () => clearTimeout(timer);
    }
  }, [user, userLoading, fcmInitialized]);

  function AdminRoutes() {
    return (
      <Routes>
        <Route path="home" element={<AdminHome />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="payment-requests" element={<AdminPaymentRequests />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="expenses" element={<AdminExpenses />} />
        <Route path="issues" element={<AdminIssues />} />
        <Route path="*" element={<Navigate to="home" replace />} />
      </Routes>
    );
  }
  function UserRoutes() {
    return (
      <Routes>
        <Route path="home" element={<UserHome />} />
        <Route path="payments" element={<UserPayments />} />
        <Route path="announcements" element={<UserAnnouncements />} />
        <Route path="expenses" element={<UserExpenses />} />
        <Route path="issues" element={<UserIssues />} />
        <Route path="*" element={<Navigate to="home" replace />} />
      </Routes>
    );
  }

  if (userLoading) {
    return <LoadingSpinner />;
  }
  const isLoginPage = location.pathname === "/login";

  return (
    <div
      className={`app ${isLoginPage ? "login-page" : ""}`}
      data-theme={theme}
    >
      {appError && (
        <div
          style={{
            position: "fixed",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(255, 0, 0, 0.8)",
            color: "white",
            padding: "10px 20px",
            borderRadius: "5px",
            zIndex: 10000,
            boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
          }}
        >
          Hata: {appError}
        </div>
      )}
      <ToastContainer
        position="top-right"
        autoClose={7000}
        newestOnTop
        closeOnClick={false}
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme={theme === "dark" ? "dark" : "light"}
        style={{ zIndex: 9999999 }}
        limit={3}
        closeButton={true}
        className="mamma-mia-toasts"
      />
      <AIChatBot />
      {user && !isLoginPage && (
        <Sidebar role={user.role} onThemeChange={toggleTheme} theme={theme} />
      )}
      <div
        className={`main-content ${
          user && !isLoginPage ? "" : "sidebar-closed"
        }`}
      >
        <Routes>
          <Route
            path="/"
            element={
              user ? (
                <Navigate
                  to={user.role === "admin" ? "/admin/home" : "/user/home"}
                  replace
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/login"
            element={
              user ? (
                <Navigate
                  to={user.role === "admin" ? "/admin/home" : "/user/home"}
                  replace
                />
              ) : (
                <Login onThemeChange={toggleTheme} theme={theme} />
              )
            }
          />
          <Route
            path="/admin/*"
            element={
              user?.role === "admin" ? (
                <AdminRoutes />
              ) : user ? (
                <Navigate to="/user/home" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/user/*"
            element={
              user?.role === "user" ? (
                <UserRoutes />
              ) : user ? (
                <Navigate to="/admin/home" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="*"
            element={
              user ? (
                <Navigate
                  to={user.role === "admin" ? "/admin/home" : "/user/home"}
                  replace
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <UserProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </UserProvider>
    </Router>
  );
}

export default App;
