import React, { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { MdAdd } from "react-icons/md";
import { HiOutlineSpeakerphone } from "react-icons/hi";
import "./AdminAnnouncements.css";
import { UserContext } from "../contexts/UserContext";

import {
  collection,
  getDocs,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

const AdminAnnouncements = () => {
  const { user } = useContext(UserContext);
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [error, setError] = useState(null);
  const [daysActive, setDaysActive] = useState(30);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (user.role !== "admin") {
      navigate("/");
      return;
    }

    fetchAnnouncements();
  }, [user, navigate]);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);

      const announcementsRef = collection(db, "announcements");

      const q = query(announcementsRef, orderBy("created_at", "desc"));

      const querySnapshot = await getDocs(q);
      const announcementsList = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        announcementsList.push({
          id: doc.id,
          content: data.content,
          created_at: data.created_at?.toDate() || new Date(),
          expiry_date: data.expiry_date?.toDate() || new Date(),
          is_active: data.is_active === 1,
        });
      });

      setAnnouncements(announcementsList);
      setError(null);
    } catch (error) {
      console.error("Duyurular getirilirken hata oluştu:", error);
      setError("Duyurular yüklenirken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAnnouncement = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);

      const days = parseInt(daysActive);
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      await addDoc(collection(db, "announcements"), {
        content: newAnnouncement,
        created_at: Timestamp.now(),
        expiry_date: Timestamp.fromDate(expiryDate),
        is_active: 1,
      });

      await sendNotificationsToUsers(newAnnouncement);

      setNewAnnouncement("");
      setDaysActive(30);

      fetchAnnouncements();

      showNotification("Duyuru başarıyla eklendi", "success");
    } catch (error) {
      console.error("Duyuru eklenirken hata:", error);
      setError("Duyuru eklenirken bir hata oluştu: " + error.message);
      showNotification("Duyuru eklenemedi", "error");
    } finally {
      setLoading(false);
    }
  };

  const sendNotificationsToUsers = async (content) => {
    try {
      const usersRef = collection(db, "users");
      const usersSnapshot = await getDocs(usersRef);

      const batch = [];
      usersSnapshot.forEach((userDoc) => {
        const userData = userDoc.data();
        if (userData.role === "user") {
          batch.push(
            addDoc(collection(db, "notifications"), {
              user_id: userDoc.id,
              title: "Yeni Duyuru",
              content:
                content.length > 50
                  ? content.substring(0, 50) + "..."
                  : content,
              notification_type: "announcement",
              is_read: 0,
              created_at: Timestamp.now(),
            })
          );
        }
      });

      await Promise.all(batch);
      console.log("Bildirimler başarıyla gönderildi");
    } catch (error) {
      console.error("Bildirimler gönderilirken hata:", error);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!window.confirm("Bu duyuruyu silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      setLoading(true);

      const announcementRef = doc(db, "announcements", id);
      await deleteDoc(announcementRef);

      fetchAnnouncements();

      showNotification("Duyuru başarıyla silindi", "success");
    } catch (error) {
      console.error("Duyuru silinirken hata:", error);
      setError("Duyuru silinirken bir hata oluştu: " + error.message);
      showNotification("Duyuru silinemedi", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (id, currentStatus) => {
    try {
      setLoading(true);

      const announcementRef = doc(db, "announcements", id);
      await updateDoc(announcementRef, {
        is_active: currentStatus ? 0 : 1,
      });

      fetchAnnouncements();

      showNotification(
        currentStatus
          ? "Duyuru devre dışı bırakıldı. Kullanıcılar artık bu duyuruyu göremeyecek."
          : "Duyuru aktifleştirildi. Kullanıcılar artık bu duyuruyu görebilecek.",
        currentStatus ? "warning" : "success"
      );
    } catch (error) {
      console.error("Duyuru durumu değiştirilirken hata:", error);
      setError(
        "Duyuru durumu değiştirilirken bir hata oluştu: " + error.message
      );
      showNotification("Duyuru durumu değiştirilemedi", "error");
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message, type = "success") => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const calculateRemainingDays = (expiryDate) => {
    const now = new Date();
    const diffTime = expiryDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading && announcements.length === 0) {
    return <div className="loading">Yükleniyor...</div>;
  }

  return (
    <div className="admin-announcements">
      <h1>
        <HiOutlineSpeakerphone
          style={{
            color: "#0ea5e9",
            fontSize: "2.5rem",
            marginRight: "12px",
            verticalAlign: "middle",
            backgroundColor: "var(--card-bg, #f8f9fa)",
            padding: "12px",
            borderRadius: "50%",
            boxShadow: "0 4px 10px rgba(14, 165, 233, 0.25)",
            stroke: "currentColor",
            strokeWidth: "1.75px",
          }}
        />
        Duyurular
      </h1>

      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.type === "warning" && "🔕 "}
          {notification.type === "success" && "🔔 "}
          {notification.type === "error" && "❌ "}
          {notification.message}
        </div>
      )}

      <form onSubmit={handleAddAnnouncement} className="announcement-form">
        <textarea
          value={newAnnouncement}
          onChange={(e) => setNewAnnouncement(e.target.value)}
          placeholder="Yeni bir duyuru yazın..."
          required
        />
        <div className="form-actions">
          <div className="form-group">
            <label htmlFor="daysActive">Geçerlilik Süresi (Gün)</label>
            <input
              type="number"
              id="daysActive"
              value={daysActive}
              onChange={(e) => setDaysActive(e.target.value)}
              min="1"
              max="365"
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            <MdAdd style={{ marginRight: "8px" }} />
            Duyuru Ekle
          </button>
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      <div className="announcements-list">
        {announcements.length === 0 && !loading ? (
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              color: "#666",
            }}
          >
            Henüz duyuru bulunmamaktadır.
          </div>
        ) : (
          announcements.map((announcement) => (
            <div
              key={announcement.id}
              className={`announcement-item ${
                !announcement.is_active ? "inactive" : ""
              }`}
            >
              <div className="announcement-content">
                <p>{announcement.content}</p>
                <div className="announcement-dates">
                  <small>
                    Oluşturulma:{" "}
                    {announcement.created_at.toLocaleString("tr-TR")}
                  </small>
                  <small>
                    {(() => {
                      const remainingDays = calculateRemainingDays(
                        announcement.expiry_date
                      );
                      if (remainingDays > 0) {
                        return `Son Geçerlilik: ${announcement.expiry_date.toLocaleString(
                          "tr-TR"
                        )} (${remainingDays} gün kaldı)`;
                      } else {
                        return <span className="expired">Süresi Doldu</span>;
                      }
                    })()}
                  </small>
                </div>
              </div>
              <div className="announcement-actions">
                <button
                  onClick={() =>
                    handleToggleActive(announcement.id, announcement.is_active)
                  }
                  className={`toggle-button ${
                    announcement.is_active ? "deactivate" : "activate"
                  }`}
                  disabled={loading}
                >
                  {announcement.is_active ? "Devre Dışı Bırak" : "Aktifleştir"}
                </button>
                <button
                  onClick={() => handleDeleteAnnouncement(announcement.id)}
                  className="delete-button"
                  disabled={loading}
                >
                  Sil
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminAnnouncements;
