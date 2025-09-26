import React, { useEffect, useState, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./UserHome.css";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import NotificationBell from "../components/NotificationBell";
import { useNotifications } from "../contexts/NotificationContext";
import { UserContext } from "../contexts/UserContext";

import {
  collection,
  query,
  where,
  getDocs,
  limit,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";

import {
  FaRegBell,
  FaMoneyBillWave,
  FaTools,
  FaRegCalendarAlt,
  FaHome,
  FaUser,
  FaPhone,
  FaCheckCircle,
  FaArrowRight,
  FaExclamationTriangle,
  FaShieldAlt,
  FaClipboardList,
  FaHistory,
  FaClock,
  FaBullhorn,
} from "react-icons/fa";

const UserHome = () => {
  const { user, loading } = useContext(UserContext);
  const navigate = useNavigate();

  const initialLoadDone = useRef(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const componentMounted = useRef(true);

  const [totalDebt, setTotalDebt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [stats, setStats] = useState({
    pendingIssues: 0,
    completedIssues: 0,
    totalExpenses: 0,
  });
  const { notifications, unreadCount } = useNotifications();

  useEffect(() => {
    componentMounted.current = true;

    return () => {
      componentMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login");
      return;
    }

    const loadKey = `userHome_loaded_${user?.uid}`;
    const sessionDataLoaded = sessionStorage.getItem(loadKey) === "true";

    const attemptLoadFromSession = () => {
      try {
        const cachedUserData = JSON.parse(
          sessionStorage.getItem(`userHome_userData_${user?.uid}`) || "null"
        );
        const cachedTotalDebt = parseFloat(
          sessionStorage.getItem(`userHome_totalDebt_${user?.uid}`) || "0"
        );
        const cachedAnnouncements = JSON.parse(
          sessionStorage.getItem(`userHome_announcements_${user?.uid}`) || "[]"
        );
        const cachedStats = JSON.parse(
          sessionStorage.getItem(`userHome_stats_${user?.uid}`) || "null"
        );

        const hasValidData =
          cachedUserData &&
          typeof cachedTotalDebt === "number" &&
          Array.isArray(cachedAnnouncements) &&
          cachedStats;

        if (hasValidData) {
          setUserData(cachedUserData);
          setTotalDebt(cachedTotalDebt);
          setAnnouncements(cachedAnnouncements);
          setStats(cachedStats);
          setDataLoaded(true);
          setIsLoading(false);
          console.log("UserHome: Veriler session'dan başarıyla yüklendi");
          return true;
        }
        return false;
      } catch (error) {
        console.error("Session verilerini yüklerken hata:", error);
        return false;
      }
    };

    if (sessionDataLoaded && !dataLoaded) {
      const loadedFromSession = attemptLoadFromSession();
      if (!loadedFromSession) {
        sessionStorage.removeItem(loadKey);
        initialLoadDone.current = false;
      }
    }

    if (!dataLoaded && !initialLoadDone.current) {
      initialLoadDone.current = true;
      setIsLoading(true);

      const fetchTimeout = setTimeout(() => {
        if (isLoading && !dataLoaded) {
          console.warn(
            "Veri yükleme zaman aşımı, kullanıcı arayüzünü gösteriyoruz"
          );
          setIsLoading(false);
          setError(
            "Veriler yüklenirken zaman aşımı oluştu. Sayfayı yenileyebilirsiniz."
          );
        }
      }, 15000);

      fetchAllData()
        .then(() => {
          clearTimeout(fetchTimeout);
          if (componentMounted.current) {
            saveDataToSession();
            setDataLoaded(true);
            setIsLoading(false);
          }
        })
        .catch((error) => {
          clearTimeout(fetchTimeout);
          if (componentMounted.current) {
            console.error("Veri yükleme hatası:", error);
            setError(`Veriler yüklenirken bir sorun oluştu: ${error.message}`);
            setIsLoading(false);

            const hasPartialData = userData || announcements.length > 0;
            if (hasPartialData) {
              setDataLoaded(true);
            }
          }
        });
    }
  }, [user, loading, dataLoaded, navigate, isLoading, userData, announcements]);

  const saveDataToSession = () => {
    if (!user?.uid) return;

    try {
      const loadKey = `userHome_loaded_${user.uid}`;

      if (userData) {
        sessionStorage.setItem(
          `userHome_userData_${user.uid}`,
          JSON.stringify(userData)
        );
      }

      sessionStorage.setItem(
        `userHome_totalDebt_${user.uid}`,
        totalDebt.toString()
      );
      sessionStorage.setItem(
        `userHome_announcements_${user.uid}`,
        JSON.stringify(announcements)
      );

      if (stats) {
        sessionStorage.setItem(
          `userHome_stats_${user.uid}`,
          JSON.stringify(stats)
        );
      }

      sessionStorage.setItem(loadKey, "true");
      console.log("UserHome: Veriler başarıyla session'a kaydedildi");
    } catch (error) {
      console.error("Session'a veri kaydederken hata:", error);
    }
  };

  const fetchAllData = async () => {
    if (!componentMounted.current) return;

    try {
      setError(null);

      const userId = user?.id || user?.uid;
      if (!userId) {
        throw new Error(
          "Kullanıcı bilgisi bulunamadı. Lütfen tekrar giriş yapın."
        );
      }

      console.log("Veri yükleniyor: Kullanıcı ID =", userId);

      const userData = await fetchUserData(userId);
      console.log("Tüm veriler başarıyla yüklendi");

      return userData;
    } catch (error) {
      console.error("Ana hata:", error);
      throw error;
    }
  };

  const fetchUserData = async (userId) => {
    if (!componentMounted.current) return;

    try {
      console.log("Kullanıcı bilgileri getiriliyor...");
      if (!userId) {
        throw new Error("Kullanıcı ID'si bulunamadı");
      }

      const userDoc = await getDoc(doc(db, "users", userId));

      if (!userDoc.exists()) {
        throw new Error("Kullanıcı verisi bulunamadı");
      }

      const userData = userDoc.data();

      if (componentMounted.current) {
        setUserData({
          user: {
            id: userId,
            first_name: userData.first_name || "",
            last_name: userData.last_name || "",
            apartment_number: userData.apartment_number || "",
            role: userData.role || "user",
          },
        });
      }

      console.log("Kullanıcı bilgileri alındı:", userId);

      await fetchAdminInfo();
      await fetchUserDebt(userId);
      await fetchAnnouncements();
      await fetchUserIssues(userId);

      if (componentMounted.current) {
        saveDataToSession();
      }

      return userData;
    } catch (error) {
      console.error("Kullanıcı bilgileri alınamadı:", error);
      throw error;
    }
  };

  const fetchAdminInfo = async () => {
    if (!componentMounted.current) return;

    try {
      console.log("Yönetici bilgisi getiriliyor...");

      const adminQuery = query(
        collection(db, "users"),
        where("role", "==", "admin"),
        limit(1)
      );

      try {
        const adminSnapshot = await getDocs(adminQuery);

        if (!adminSnapshot.empty) {
          const adminDoc = adminSnapshot.docs[0];
          const adminData = adminDoc.data();

          if (componentMounted.current) {
            setUserData((prevData) => ({
              ...prevData,
              admin: {
                id: adminDoc.id,
                first_name: adminData.first_name || "",
                last_name: adminData.last_name || "",
                phone: adminData.phone || "",
                email: adminData.email || "",
              },
            }));
          }

          console.log("Yönetici bilgisi alındı:", adminDoc.id);
          return true;
        }
      } catch (error) {
        console.error(
          "Yönetici role sorgusu başarısız, tekil sorgu deneniyor:",
          error
        );
      }

      console.log(
        "Yönetici bilgisine erişilemiyor, varsayılan bilgi kullanılıyor"
      );

      if (componentMounted.current) {
        setUserData((prevData) => ({
          ...prevData,
          admin: {
            id: "admin-default",
            first_name: "Site",
            last_name: "Yöneticisi",
            phone: "555-555-5555",
            email: "yonetici@apartman.com",
          },
        }));
      }

      return false;
    } catch (error) {
      console.error("Yönetici bilgisi alınamadı:", error);

      if (componentMounted.current) {
        setUserData((prevData) => ({
          ...prevData,
          admin: {
            id: "admin-default",
            first_name: "Site",
            last_name: "Yöneticisi",
            phone: "555-555-5555",
            email: "yonetici@apartman.com",
          },
        }));
      }

      return false;
    }
  };

  const fetchUserDebt = async (userId) => {
    if (!componentMounted.current) return 0;

    try {
      console.log("Borç bilgisi getiriliyor...");
      if (!userId) {
        console.error("Kullanıcı ID'si bulunamadı");
        return 0;
      }

      const paymentsQuery = query(
        collection(db, "payments"),
        where("user_id", "==", userId),
        where("is_paid", "==", 0)
      );

      const paymentsSnapshot = await getDocs(paymentsQuery);
      console.log("Ödeme belgeleri sayısı:", paymentsSnapshot.size);

      let totalAmount = 0;

      paymentsSnapshot.forEach((doc) => {
        const payment = doc.data();
        if (payment && payment.amount) {
          const amount = parseFloat(payment.amount) || 0;
          totalAmount += amount;
        }
      });

      console.log(`Toplam borç: ${totalAmount} TL`);

      if (componentMounted.current) {
        setTotalDebt(totalAmount);
        setUserData((prevData) => ({
          ...prevData,
          total_debt: totalAmount,
        }));
      }

      return totalAmount;
    } catch (error) {
      console.error("Kullanıcı borç bilgisi alınamadı:", error);
      return 0;
    }
  };

  const fetchAnnouncements = async () => {
    if (!componentMounted.current) return [];

    try {
      console.log("Duyurular getiriliyor...");
      const announcementsQuery = query(
        collection(db, "announcements"),
        where("is_active", "==", 1)
      );

      const announcementsSnapshot = await getDocs(announcementsQuery);
      const announcementsList = [];

      announcementsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data) {
          announcementsList.push({
            id: doc.id,
            content: data.content || "",
            created_at: data.created_at?.toDate() || new Date(),
            expiry_date: data.expiry_date?.toDate() || new Date(),
            is_active: data.is_active === 1,
          });
        }
      });

      announcementsList.sort((a, b) => b.created_at - a.created_at);

      console.log(`${announcementsList.length} duyuru bulundu`);

      if (componentMounted.current) {
        setAnnouncements(announcementsList);
      }

      return announcementsList;
    } catch (error) {
      console.error("Duyurular alınamadı:", error);

      if (componentMounted.current) {
        setAnnouncements([]);
      }

      return [];
    }
  };

  const fetchUserIssues = async (userId) => {
    if (!componentMounted.current) return [];

    try {
      console.log("Kullanıcı arıza talepleri getiriliyor...");
      if (!userId) {
        console.error("Kullanıcı ID'si bulunamadı");

        if (componentMounted.current) {
          setStats({
            pendingIssues: 0,
            completedIssues: 0,
            totalExpenses: 0,
          });
        }

        return [];
      }

      const issuesQuery = query(
        collection(db, "issues"),
        where("user_id", "==", userId)
      );

      const issuesSnapshot = await getDocs(issuesQuery);
      console.log("Arıza belgeleri sayısı:", issuesSnapshot.size);

      const issuesList = [];
      let pendingCount = 0;
      let completedCount = 0;

      issuesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data) {
          const issue = {
            id: doc.id,
            ...data,
            created_at: data.created_at?.toDate() || new Date(),
            updated_at: data.updated_at?.toDate() || null,
            status: data.status || "beklemede",
          };

          issuesList.push(issue);

          if (issue.status === "tamamlandi") {
            completedCount++;
          } else {
            pendingCount++;
          }
        }
      });

      issuesList.sort((a, b) => b.created_at - a.createdAt);

      console.log(
        `${issuesList.length} arıza talebi bulundu (${pendingCount} bekleyen, ${completedCount} tamamlanmış)`
      );

      if (componentMounted.current) {
        setStats({
          pendingIssues: pendingCount,
          completedIssues: completedCount,
          totalExpenses: 0,
        });
      }

      return issuesList;
    } catch (error) {
      console.error("Kullanıcı arıza talepleri alınamadı:", error);

      if (componentMounted.current) {
        setStats({
          pendingIssues: 0,
          completedIssues: 0,
          totalExpenses: 0,
        });
      }

      return [];
    }
  };

  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), "d MMMM chestnuts", { locale: tr });
    } catch (error) {
      return "Geçersiz Tarih";
    }
  };

  const calculateRemainingDays = (expiryDate) => {
    if (!expiryDate) return 0;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const sortedAnnouncements = [...announcements].sort((a, b) => {
    const daysA = calculateRemainingDays(a.expiry_date);
    const daysB = calculateRemainingDays(b.expiry_date);

    if (daysA > 0 && daysB <= 0) return -1;
    if (daysA <= 0 && daysB > 0) return 1;

    if (daysA > 0 && daysB > 0) return daysA - daysB;

    return new Date(b.created_at) - new Date(a.created_at);
  });

  const latestAnnouncements = sortedAnnouncements.slice(0, 5);

  if (error) {
    return (
      <div className="user-home">
        <div className="error-message">
          <div className="error-message-icon">
            <FaExclamationTriangle />
          </div>
          {error}
        </div>
      </div>
    );
  }

  if (isLoading || !userData) {
    return (
      <div className="user-home">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Bilgiler yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="user-home">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Kullanıcı bilgileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-home">
      <header className="welcome-section">
        <div className="hero-content">
          <div className="user-welcome">
            <h2>
              Hoşgeldiniz, {userData.user.first_name} {userData.user.last_name}
            </h2>
            <div className="welcome-info">
              <span className="apartment-info">
                <FaHome style={{ marginRight: "6px" }} />{" "}
                {userData.user.apartment_number}
              </span>
              <span className="welcome-date">
                <FaRegCalendarAlt style={{ marginRight: "6px" }} />
                {format(new Date(), "dd.MM.yyyy", { locale: tr })}
              </span>
            </div>
          </div>

          <div className="notifications-area">
            <NotificationBell />
          </div>

          {userData.admin && (
            <div className="admin-info">
              <div className="admin-title">Yönetici</div>
              <strong>
                <FaUser style={{ marginRight: "6px" }} />
                {userData.admin.first_name} {userData.admin.last_name}
              </strong>
              <a href={`tel:+9${userData.admin.phone}`}>
                <FaPhone /> {userData.admin.phone}
              </a>
            </div>
          )}
        </div>
      </header>

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Borç Durumu</h3>
            <div
              className={`card-icon debt-status-icon ${
                totalDebt === 0 ? "no-debt" : ""
              }`}
              style={{
                backgroundColor:
                  totalDebt > 0
                    ? "rgba(245, 81, 95, 0.1)"
                    : "rgba(67, 233, 123, 0.1)",
                color: totalDebt > 0 ? "#f5515f" : "#43e97b",
              }}
            >
              <FaMoneyBillWave />
            </div>
          </div>
          <div
            className="card-value"
            style={{
              color: totalDebt > 0 ? "#f5515f" : "var(--text-primary)",
            }}
          >
            {totalDebt > 0
              ? `${totalDebt.toLocaleString("tr-TR")} ₺`
              : "0,00 ₺"}
          </div>
          <div
            className="card-label"
            style={{
              color: totalDebt > 0 ? "#f5515f" : "var(--text-secondary)",
            }}
          >
            {totalDebt > 0
              ? "Ödenmemiş borç mevcut"
              : "Borcunuz bulunmamaktadır"}
          </div>
          <div className="card-action">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate("/user/payments");
              }}
              style={{
                background: "#3498db",
                color: "white",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                width: "100%",
                justifyContent: "center",
              }}
            >
              Ödemeleri görüntüle <FaArrowRight />
            </a>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header">
            <h3>Arıza/Bakım Talepleri</h3>
            <div
              className={`card-icon issue-status-icon ${
                stats.pendingIssues === 0 ? "no-issues" : ""
              }`}
              style={{
                backgroundColor:
                  stats.pendingIssues > 0
                    ? "rgba(249, 212, 35, 0.1)"
                    : "rgba(67, 233, 123, 0.1)",
                color: stats.pendingIssues > 0 ? "#f9d423" : "#43e97b",
              }}
            >
              <FaTools />
            </div>
          </div>
          <div className="card-stats">
            <div className="stat-item">
              <div className="stat-value">{stats.pendingIssues}</div>
              <div className="stat-label">Bekleyen</div>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <div className="stat-value">{stats.completedIssues}</div>
              <div className="stat-label">Tamamlanan</div>
            </div>
          </div>
          <div className="card-label" style={{ marginTop: "0.5rem" }}>
            {stats.pendingIssues === 0
              ? "Bekleyen talebiniz bulunmuyor"
              : stats.pendingIssues === 1
              ? "1 adet bekleyen talebiniz var"
              : `${stats.pendingIssues} adet bekleyen talebiniz var`}
          </div>
          <div className="card-action">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate("/user/issues");
              }}
              style={{
                background: "#3498db",
                color: "white",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                width: "100%",
                justifyContent: "center",
              }}
            >
              Talepleri görüntüle <FaArrowRight />
            </a>
          </div>
        </div>
      </div>

      <div className="content-grid">
        <div className="announcements-section">
          <div className="section-header">
            <h3>
              <FaBullhorn /> Son Duyurular
            </h3>
            <div className="section-badge">
              {latestAnnouncements.length} Duyuru
            </div>
          </div>

          {latestAnnouncements.length === 0 ? (
            <div className="no-announcements">
              <p>Henüz duyuru bulunmamaktadır.</p>
            </div>
          ) : (
            latestAnnouncements.map((announcement) => {
              const remainingDays = calculateRemainingDays(
                announcement.expiry_date
              );
              const isExpired = remainingDays <= 0;

              return (
                <div className="announcement-card" key={announcement.id}>
                  <div className="announcement-header">
                    <div className="announcement-date">
                      <FaRegCalendarAlt style={{ marginRight: "5px" }} />
                      {formatDate(announcement.created_at)}
                    </div>
                    <div
                      className={`announcement-expiry ${
                        isExpired ? "expired" : ""
                      }`}
                    >
                      <FaClock style={{ marginRight: "5px" }} />
                      {isExpired
                        ? "Süresi doldu"
                        : remainingDays === 1
                        ? "Son 1 gün"
                        : `${remainingDays} gün kaldı`}
                    </div>
                  </div>
                  <div className="announcement-content">
                    {announcement.content}
                  </div>
                </div>
              );
            })
          )}

          <div className="card-action" style={{ marginTop: "1rem" }}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate("/user/announcements");
              }}
              style={{
                background: "#3498db",
                color: "white",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                width: "100%",
                justifyContent: "center",
              }}
            >
              Tüm duyuruları görüntüle <FaArrowRight />
            </a>
          </div>
        </div>

        <div className="debt-section">
          <div className="section-header">
            <h3>
              <FaClipboardList /> Borç Durumu
            </h3>
          </div>

          <div className="debt-info">
            {totalDebt > 0 ? (
              <div className="debt-warning">
                <h3 style={{ color: "#f5515f" }}>
                  Ödenmemiş borcunuz bulunmaktadır
                </h3>
                <div className="debt-amount" style={{ borderColor: "#f5515f" }}>
                  <span style={{ color: "#f5515f" }}>
                    {totalDebt.toLocaleString("tr-TR")} ₺
                  </span>
                  <small style={{ color: "#f5515f", opacity: 0.8 }}>
                    Toplam borç
                  </small>
                </div>
                <div className="card-action">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/user/payments");
                    }}
                    style={{
                      background: "#3498db",
                      color: "white",
                      padding: "0.75rem 1rem",
                      borderRadius: "var(--radius-sm)",
                      width: "100%",
                      justifyContent: "center",
                    }}
                  >
                    Ödemeleri görüntüle <FaArrowRight />
                  </a>
                </div>
                <small>
                  * Ödemelerinizi zamanında yaparak site yönetiminin daha
                  düzenli çalışmasına katkıda bulunabilirsiniz.
                </small>
              </div>
            ) : (
              <div className="no-debt">
                <div className="no-debt-icon">
                  <FaCheckCircle />
                </div>
                <h3>Ödenmeyen Borcunuz Bulunmamaktadır</h3>
                <p>Tüm ödemeleriniz tamamlanmıştır</p>
                <div className="thank-you">
                  Düzenli ödeme için teşekkür ederiz!
                </div>

                <div className="card-action" style={{ marginTop: "2rem" }}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/user/payments");
                    }}
                    style={{
                      background: "#3498db",
                      color: "white",
                      padding: "0.75rem 1rem",
                      borderRadius: "var(--radius-sm)",
                      width: "100%",
                      justifyContent: "center",
                    }}
                  >
                    Ödeme geçmişinizi görüntüleyin <FaArrowRight />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserHome;
