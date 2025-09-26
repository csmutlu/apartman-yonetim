import React, { useEffect, useState, useContext } from "react";
import "./UserAnnouncements.css";
import { UserContext } from "../contexts/UserContext";
import { FaRegCalendarAlt, FaClock } from "react-icons/fa";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../firebase";

const UserAnnouncements = () => {
  const { user } = useContext(UserContext);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnnouncements = async () => {
    const userId = user?.id || user?.uid;
    if (!userId) {
      setError("Duyuruları görmek için giriş yapmalısınız.");
      setLoading(false);
      setAnnouncements([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log("UserAnnouncements: Duyurular getiriliyor...");

      const announcementsQuery = query(
        collection(db, "announcements"),
        where("is_active", "==", 1),
        orderBy("created_at", "desc")
      );

      const announcementsSnapshot = await getDocs(announcementsQuery);
      const announcementsList = [];
      const now = new Date();

      announcementsSnapshot.forEach((doc) => {
        const data = doc.data();
        const expiryDate = data.expiry_date?.toDate();

        if (expiryDate && expiryDate >= now) {
          announcementsList.push({
            id: doc.id,
            content: data.content || "",
            created_at: data.created_at?.toDate() || new Date(),
            expiry_date: expiryDate,
          });
        }
      });

      console.log(
        `UserAnnouncements: ${announcementsList.length} aktif duyuru bulundu.`
      );
      setAnnouncements(announcementsList);
    } catch (err) {
      console.error("UserAnnouncements: Duyurular getirilirken hata:", err);
      setError("Duyurular yüklenirken bir hata oluştu.");
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [user]);

  const calculateRemainingDays = (expiryDate) => {
    if (!expiryDate) return 0;
    const now = new Date();
    const diffTime = expiryDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Duyurular yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!user) {
    return (
      <div className="announcements-page">
        <div className="no-announcements">
          <p>Duyuruları görmek için lütfen giriş yapın.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="announcements-page">
      <div className="announcements-header">
        <h1>Duyurular</h1>
        <p className="announcement-count">
          Toplam {announcements.length} aktif duyuru bulunmaktadır
        </p>
      </div>

      <div className="announcements-container">
        {announcements.length > 0 ? (
          announcements.map((announcement) => {
            const remainingDays = calculateRemainingDays(
              announcement.expiry_date
            );
            return (
              <div key={announcement.id} className="announcement-card">
                <div className="announcement-content">
                  {announcement.content}
                </div>
                <div className="announcement-footer">
                  <div className="announcement-date">
                    <FaRegCalendarAlt style={{ marginRight: "5px" }} />
                    <strong>Oluşturulma:</strong>{" "}
                    {announcement.created_at.toLocaleDateString("tr-TR")}
                  </div>
                  <div className="announcement-expiry">
                    <FaClock style={{ marginRight: "5px" }} />
                    <strong>Kalan Süre:</strong>{" "}
                    {remainingDays === 1 ? "Son 1 gün" : `${remainingDays} gün`}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="no-announcements">
            <p>Gösterilecek aktif duyuru bulunmamaktadır.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserAnnouncements;
