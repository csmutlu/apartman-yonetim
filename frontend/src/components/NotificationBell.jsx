import React, { useState, useRef, useEffect } from "react";
import { FiBell } from "react-icons/fi";
import "./NotificationBell.css";
import { useNotifications } from "../contexts/NotificationContext";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAllNotifications,
    loading,
    error,
  } = useNotifications();

  const notificationRef = useRef(null);
  const navigate = useNavigate();

  const toggleNotifications = () => {
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    if (notification.click_action) {
      navigate(notification.click_action);
    }

    setIsOpen(false);
  };

  const handleMarkAllAsRead = (e) => {
    e.stopPropagation();
    markAllAsRead();
  };

  const handleClickOutside = (event) => {
    if (
      notificationRef.current &&
      !notificationRef.current.contains(event.target)
    ) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const formatNotificationTime = (date) => {
    try {
      if (!date) return "";
      const dateObj =
        date instanceof Date && !isNaN(date) ? date : new Date(date);
      if (isNaN(dateObj)) return "";

      return formatDistanceToNow(dateObj, {
        addSuffix: true,
        locale: tr,
      });
    } catch (e) {
      console.error("Tarih formatlanırken hata:", e, "Gelen Değer:", date);
      return "";
    }
  };

  const getNotificationType = (notification) => {
    if (!notification) return "";

    if (notification.notification_type) {
      return notification.notification_type;
    }

    const title = notification.title?.toLowerCase() || "";
    if (title.includes("ödeme") && title.includes("onay"))
      return "payment_confirmation";
    if (title.includes("ödeme") && title.includes("talep"))
      return "payment_request";
    if (title.includes("arıza")) return "issue_update";
    if (title.includes("duyuru")) return "announcement";

    const content = notification.content?.toLowerCase() || "";
    if (content.includes("ödeme") && content.includes("alındı"))
      return "payment_confirmation";
    if (content.includes("ödeme") && content.includes("talep"))
      return "payment_request";
    if (content.includes("arıza") || content.includes("bakım"))
      return "issue_update";
    if (content.includes("duyuru")) return "announcement";

    return "";
  };

  return (
    <div className="notification-bell-container" ref={notificationRef}>
      <div
        className="bell-icon"
        onClick={toggleNotifications}
        title="Bildirimler"
      >
        <FiBell size={24} />
        {unreadCount > 0 && <span className="unread-count">{unreadCount}</span>}
      </div>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>Bildirimler</h3>
            {unreadCount > 0 && (
              <button className="mark-all-read" onClick={handleMarkAllAsRead}>
                Tümünü Okundu İşaretle
              </button>
            )}
          </div>

          <div className="notification-list">
            {loading ? (
              <div className="notification-loading">
                Bildirimler yükleniyor...
              </div>
            ) : error ? (
              <div className="notification-error">
                Bildirimler yüklenirken bir sorun oluştu.
              </div>
            ) : notifications.length === 0 ? (
              <div className="empty-notifications">
                Henüz yeni bildiriminiz bulunmuyor.
              </div>
            ) : (
              notifications.map((notification) => {
                const notificationType = getNotificationType(notification);

                return (
                  <div
                    key={notification.id}
                    className={`notification-item ${
                      notification.is_read ? "" : "unread"
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                    data-type={notificationType}
                  >
                    <div className="notification-content">
                      <div className="notification-title">
                        {notification.title || "Bildirim"}
                      </div>
                      <div className="notification-message">
                        {notification.content}
                      </div>
                      <div className="notification-time">
                        {formatNotificationTime(notification.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="notification-footer">
            <button
              className="footer-button mark-all-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                markAllAsRead();
              }}
              disabled={unreadCount === 0}
            >
              <span className="button-icon">✓</span>
              Tümünü Okundu İşaretle
            </button>

            <button
              className="footer-button clear-all-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (
                  window.confirm(
                    "Tüm bildirimleri silmek istediğinize emin misiniz?"
                  )
                ) {
                  clearAllNotifications();
                }
              }}
              disabled={notifications.length === 0}
            >
              <span className="button-icon">🗑️</span>
              Tümünü Sil
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
