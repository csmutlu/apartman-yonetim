import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useEffect,
} from "react";
import { UserContext } from "./UserContext";
import { collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { toast } from "react-toastify";

export const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useContext(UserContext);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadNotificationsFromStorage = useCallback(() => {
    if (!user) return [];
    try {
      const storageKey = `fcm_notifications_${user.uid}`;
      const storedNotifications = localStorage.getItem(storageKey);
      if (storedNotifications) {
        const parsedNotifications = JSON.parse(storedNotifications);
        const fixedNotifications = parsedNotifications.map((n) => ({
          ...n,
          created_at: n.created_at ? new Date(n.created_at) : new Date(),
        }));
        return fixedNotifications;
      }
    } catch (error) {
      console.error("Bildirimler depodan yüklenirken hata:", error);
    }
    return [];
  }, [user]);

  const saveNotificationsToStorage = useCallback(
    (notificationsList) => {
      if (!user) return;
      try {
        const storageKey = `fcm_notifications_${user.uid}`;
        localStorage.setItem(storageKey, JSON.stringify(notificationsList));
      } catch (error) {
        console.error("Bildirimler depoya kaydedilirken hata:", error);
      }
    },
    [user]
  );

  useEffect(() => {
    if (user) {
      console.log(
        "NotificationContext: User logged in, loading notifications from storage."
      );
      const storedNotifications = loadNotificationsFromStorage();
      setNotifications(storedNotifications);
      setUnreadCount(storedNotifications.filter((n) => !n.is_read).length);
    } else {
      console.log(
        "NotificationContext: User logged out, clearing notifications."
      );
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user, loadNotificationsFromStorage]);

  const addForegroundNotification = useCallback(
    (payload) => {
      if (!user) return null;

      const notificationTitle = payload.notification?.title || "Yeni Bildirim";
      const notificationBody =
        payload.notification?.body || "Yeni bir mesajınız var.";

      const notificationData = {
        id: payload.messageId || `fcm-${Date.now()}`,
        title: notificationTitle,
        content: notificationBody,
        created_at: new Date(),
        is_read: false,
        type: payload.data?.notification_type || "general",
        related_id: payload.data?.related_id || null,
        click_action: payload.data?.click_action || null,
      };

      setNotifications((prev) => {
        const updatedList = [notificationData, ...prev].slice(0, 50);
        saveNotificationsToStorage(updatedList);
        return updatedList;
      });

      setUnreadCount((prev) => prev + 1);
      console.log(
        "NotificationContext: Foreground notification added.",
        notificationData
      );
      return notificationData;
    },
    [user, saveNotificationsToStorage]
  );

  const markAsRead = useCallback(
    (notificationId) => {
      if (!user) return;
      setNotifications((prev) => {
        let marked = false;
        const updatedList = prev.map((n) => {
          if (n.id === notificationId && !n.is_read) {
            marked = true;
            return { ...n, is_read: true };
          }
          return n;
        });

        if (marked) {
          saveNotificationsToStorage(updatedList);
          setUnreadCount((prevCount) => Math.max(0, prevCount - 1));
        }
        return updatedList;
      });
    },
    [user, saveNotificationsToStorage]
  );

  const markAllAsRead = useCallback(() => {
    if (!user) return;
    let changed = false;
    setNotifications((prev) => {
      const updatedList = prev.map((n) => {
        if (!n.is_read) {
          changed = true;
          return { ...n, is_read: true };
        }
        return n;
      });
      if (changed) {
        saveNotificationsToStorage(updatedList);
      }
      return updatedList;
    });
    if (changed) {
      setUnreadCount(0);
    }
  }, [user, saveNotificationsToStorage]);

  const clearAllNotifications = useCallback(async () => {
    try {
      setLoading(true);

      if (!user || !user.uid) {
        console.error("Kullanıcı oturumu bulunamadı");
        return;
      }

      const storageKey = `fcm_notifications_${user.uid}`;
      localStorage.removeItem(storageKey);

      setNotifications([]);
      setUnreadCount(0);

      console.log("Tüm bildirimler silindi");
    } catch (error) {
      console.error("Bildirimler silinirken hata:", error);
      setError("Bildirimler silinemedi");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const addManualNotification = useCallback(
    (notification) => {
      if (!user) return null;
      const notificationData = {
        id: `manual-${Date.now()}`,
        title: notification.title || "Bildirim",
        content: notification.content || notification.body || "",
        created_at: new Date(),
        is_read: false,
        type: notification.type || "general",
        related_id: notification.related_id || null,
        click_action: notification.click_action || null,
      };
      setNotifications((prev) => {
        const updatedList = [notificationData, ...prev].slice(0, 50);
        saveNotificationsToStorage(updatedList);
        return updatedList;
      });
      setUnreadCount((prev) => prev + 1);
      return notificationData;
    },
    [user, saveNotificationsToStorage]
  );

  const value = {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAllNotifications,
    loading,
    error,
    addForegroundNotification,
    addManualNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
