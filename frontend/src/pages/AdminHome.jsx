// src/pages/AdminHome.jsx

import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminHome.css";
import {
  MdTrendingUp,
  MdTrendingDown,
  MdAnnouncement,
  MdWarning,
  MdPayment,
  MdOutlineHome,
  MdAdd,
} from "react-icons/md";
import {
  FaMoneyBillWave,
  FaUserTie,
  FaUsers,
  FaBell,
  FaBullhorn,
} from "react-icons/fa";
import {
  BsCashCoin,
  BsHouseDoor,
  BsFileEarmarkText,
  BsTools,
  BsCashStack,
  BsCash,
} from "react-icons/bs";
import { IoWallet, IoClose } from "react-icons/io5";
import { FiAlertCircle, FiDollarSign, FiCalendar } from "react-icons/fi";
import { GiMoneyStack, GiCash, GiLockedChest } from "react-icons/gi";
import {
  RiMoneyDollarCircleLine,
  RiSafeLine,
  RiSafe2Line,
} from "react-icons/ri";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import tr from "date-fns/locale/tr";
import { UserContext } from "../contexts/UserContext";

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

registerLocale("tr", tr);

const AdminHome = () => {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();

  const initialLoadDone = useRef(false);
  const componentMounted = useRef(true);

  const [userData, setUserData] = useState(null);
  const [cashStatus, setCashStatus] = useState({
    total_income: 0,
    total_expenses: 0,
    net_amount: 0,
  });
  const [users, setUsers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [unpaidPayments, setUnpaidPayments] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [stats, setStats] = useState({
    totalApartments: 0,
    totalResidents: 0,
    totalActiveAnnouncements: 0,
    totalUnpaidAmount: 0,
    pendingIssuesCount: 0,
  });
  const [announcementForm, setAnnouncementForm] = useState({
    content: "",
    days_active: 30,
  });
  const [paymentForm, setPaymentForm] = useState({
    paymentType: "aidat",
    amount: "",
    description: "",
    isAllUsers: true,
    selectedUsers: [],
    payment_date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (user.role !== "admin") {
      navigate("/user/home");
      return;
    }

    componentMounted.current = true;

    if (!initialLoadDone.current) {
      console.log("AdminHome: İlk kez veriler yükleniyor");
      initialLoadDone.current = true;
      fetchAllData();
    } else {
      console.log("AdminHome: Tekrar render - veri çekimi atlanıyor");
    }

    return () => {
      componentMounted.current = false;
    };
  }, [user, navigate]);

  const fetchAllData = async () => {
    if (!componentMounted.current) return;

    setLoading(true);
    setError(null);
    setUserData(user);

    try {
      console.log("Dashboard verileri yükleniyor...");

      try {
        let loadedUsers = [];
        let loadedAnnouncements = [];
        let loadedPayments = [];
        let loadedIssues = [];
        let cashData = { total_income: 0, total_expenses: 0, net_amount: 0 };

        loadedUsers = await fetchUsersWithoutStateUpdate();
        loadedAnnouncements = await fetchAnnouncementsWithoutStateUpdate();
        loadedPayments = await fetchPaymentsWithoutStateUpdate();
        loadedIssues = await fetchIssuesWithoutStateUpdate();
        cashData = await calculateCashStatusWithoutStateUpdate();

        if (componentMounted.current) {
          setUsers(loadedUsers);
          setAnnouncements(loadedAnnouncements);
          setUnpaidPayments(loadedPayments);
          setIssues(loadedIssues);
          setCashStatus(cashData);

          calculateAndUpdateStats(
            loadedUsers,
            loadedAnnouncements,
            loadedPayments,
            loadedIssues
          );

          console.log("Tüm veriler başarıyla yüklendi ve state güncellendi");
        }
      } catch (dataError) {
        if (componentMounted.current) {
          console.error("Veri yükleme hatası:", dataError);
          setError(`Veriler yüklenirken hata: ${dataError.message}`);
        }
      }
    } finally {
      if (componentMounted.current) {
        setLoading(false);
      }
    }
  };

  const fetchUsersWithoutStateUpdate = async () => {
    try {
      const usersRef = collection(db, "users");
      const usersSnapshot = await getDocs(usersRef);
      const usersList = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      return usersList;
    } catch (error) {
      console.error("Kullanıcılar yüklenirken hata:", error);
      throw error;
    }
  };

  const fetchAnnouncementsWithoutStateUpdate = async () => {
    try {
      const now = new Date();
      const announcementsRef = collection(db, "announcements");
      const q = query(
        announcementsRef,
        where("is_active", "==", 1),
        orderBy("created_at", "desc")
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
          created_at: doc.data().created_at?.toDate(),
          expiry_date: doc.data().expiry_date?.toDate(),
        }))
        .filter((a) => a.expiry_date && a.expiry_date >= now);
      return list;
    } catch (error) {
      console.error("Duyurular yüklenirken hata:", error);
      throw error;
    }
  };

  const fetchPaymentsWithoutStateUpdate = async () => {
    try {
      const paymentsRef = collection(db, "payments");
      const q = query(
        paymentsRef,
        where("is_paid", "==", 0),
        orderBy("created_date", "desc")
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        created_date: doc.data().created_date?.toDate(),
        payment_date: doc.data().payment_date?.toDate(),
      }));
      return list;
    } catch (error) {
      console.error("Ödemeler yüklenirken hata:", error);
      throw error;
    }
  };

  const fetchIssuesWithoutStateUpdate = async () => {
    try {
      const issuesRef = collection(db, "issues");
      const q = query(
        issuesRef,
        orderBy("status"),
        orderBy("created_at", "desc")
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data().created_at?.toDate(),
        updated_at: doc.data().updated_at?.toDate(),
        resolved_at: doc.data().resolved_at?.toDate(),
      }));
      return list;
    } catch (error) {
      console.error("Arızalar yüklenirken hata:", error);
      throw error;
    }
  };

  const calculateCashStatusWithoutStateUpdate = async () => {
    try {
      let totalIncome = 0;
      let totalExpenses = 0;
      const paymentsRef = collection(db, "payments");
      const incomeQuery = query(paymentsRef, where("is_paid", "==", 1));
      const incomeSnapshot = await getDocs(incomeQuery);
      incomeSnapshot.forEach((doc) => {
        totalIncome += parseFloat(doc.data().amount || 0);
      });

      const expensesRef = collection(db, "expenses");
      const expensesSnapshot = await getDocs(expensesRef);
      expensesSnapshot.forEach((doc) => {
        totalExpenses += parseFloat(doc.data().amount || 0);
      });

      const netAmount = totalIncome - totalExpenses;
      const cashData = {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_amount: netAmount,
      };
      return cashData;
    } catch (error) {
      console.error("Kasa durumu hesaplanırken hata:", error);
      throw error;
    }
  };

  const calculateAndUpdateStats = (
    usersList,
    announcementsList,
    paymentsList,
    issuesList
  ) => {
    try {
      console.log("Kullanıcı listesi:", usersList);

      const apartmentNumbers = usersList
        .map((user) => user.apartment_number)
        .filter(
          (aptNum) => aptNum !== undefined && aptNum !== null && aptNum !== ""
        );

      console.log("Daire numaraları:", apartmentNumbers);

      const uniqueApartments = [...new Set(apartmentNumbers)];
      console.log("Benzersiz daire numaraları:", uniqueApartments);

      const totalApartments = uniqueApartments.length;

      const validResidents = usersList.filter(
        (user) =>
          user.apartment_number &&
          user.apartment_number !== "" &&
          user.apartment_number !== null
      );

      console.log("Geçerli sakinler:", validResidents);
      const totalResidents = validResidents.length;

      const totalActiveAnnouncements = announcementsList.filter(
        (a) => a.is_active === true || a.is_active === 1
      ).length;

      const totalUnpaidAmount = paymentsList.reduce(
        (sum, p) => sum + parseFloat(p.amount || 0),
        0
      );

      const pendingIssuesCount = issuesList.filter(
        (i) => i.status === "beklemede" || i.status === "ilgileniliyor"
      ).length;

      setStats({
        totalApartments,
        totalResidents,
        totalActiveAnnouncements,
        totalUnpaidAmount,
        pendingIssuesCount,
      });

      console.log("Hesaplanan istatistikler:", {
        totalApartments,
        totalResidents,
        totalActiveAnnouncements,
        totalUnpaidAmount,
        pendingIssuesCount,
      });
    } catch (error) {
      console.error("İstatistik hesaplama hatası:", error);
    }
  };

  const fetchUsers = async () => {
    const users = await fetchUsersWithoutStateUpdate();
    setUsers(users);
    return users;
  };

  const formatCurrency = (amount) => {
    const number = Number(amount);
    return isNaN(number)
      ? "0,00 ₺"
      : number.toLocaleString("tr-TR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + " ₺";
  };

  const calculateRemainingDays = (expiryDate) => {
    if (!expiryDate) return 0;
    const diffDays = Math.ceil(
      (new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24)
    );
    return Math.max(0, diffDays);
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "beklemede":
        return "status-waiting";
      case "ilgileniliyor":
        return "status-in-progress";
      case "tamamlandi":
        return "status-completed";
      default:
        return "status-waiting";
    }
  };
  const getStatusText = (status) => {
    switch (status) {
      case "beklemede":
        return "Beklemede";
      case "ilgileniliyor":
        return "İlgileniliyor";
      case "tamamlandi":
        return "Tamamlandı";
      default:
        return "Beklemede";
    }
  };

  const showNotification = (message, type = "success") => {
    alert((type === "success" ? "✅ " : "❌ ") + message);
  };

  const handleAddAnnouncement = async (e) => {
    e.preventDefault();
    if (!user) {
      showNotification("İşlem yapmak için yetkiniz yok.", "error");
      return;
    }
    if (!announcementForm.content.trim()) {
      showNotification("Duyuru içeriği boş olamaz.", "error");
      return;
    }

    try {
      const daysActive = parseInt(announcementForm.days_active) || 30;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + daysActive);

      const announcementDocRef = await addDoc(collection(db, "announcements"), {
        content: announcementForm.content,
        created_at: Timestamp.now(),
        expiry_date: Timestamp.fromDate(expiryDate),
        is_active: 1,
      });
      console.log("Duyuru eklendi:", announcementDocRef.id);

      setAnnouncementForm({ content: "", days_active: 30 });
      setShowAnnouncementModal(false);
      const newAnnouncements = await fetchAnnouncements();
      calculateAndUpdateStats(users, newAnnouncements, unpaidPayments, issues);
      showNotification("Duyuru başarıyla eklendi", "success");
    } catch (error) {
      console.error("Duyuru eklenirken hata:", error);
      showNotification("Duyuru eklenirken hata: " + error.message, "error");
    } finally {
    }
  };

  const handlePaymentRequest = async (e) => {
    e.preventDefault();
    if (!user) {
      showNotification("İşlem yapmak için yetkiniz yok.", "error");
      return;
    }
    if (!paymentForm.amount || !paymentForm.paymentType) {
      showNotification("Tutar ve Ödeme Tipi boş olamaz.", "error");
      return;
    }
    if (!paymentForm.isAllUsers && paymentForm.selectedUsers.length === 0) {
      showNotification("Lütfen kullanıcı seçin.", "error");
      return;
    }

    try {
      const paymentAmount = parseFloat(paymentForm.amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        alert("Geçerli bir tutar giriniz.");
        return;
      }
      const paymentDate = paymentForm.payment_date
        ? new Date(paymentForm.payment_date)
        : null;

      const targetUsers = paymentForm.isAllUsers
        ? users.filter((u) => u.role === "user")
        : users.filter((u) => paymentForm.selectedUsers.includes(u.id));

      if (targetUsers.length === 0) {
        throw new Error("Hedef kullanıcı bulunamadı.");
      }

      let successCount = 0;

      for (const targetUser of targetUsers) {
        try {
          const paymentData = {
            user_id: targetUser.id,
            user_name: `${targetUser.first_name || ""} ${
              targetUser.last_name || ""
            }`.trim(),
            apartment_number: targetUser.apartment_number || "?",
            amount: paymentAmount,
            type: paymentForm.paymentType,
            description: paymentForm.description || "",
            created_date: Timestamp.now(),
            payment_date: paymentDate ? Timestamp.fromDate(paymentDate) : null,
            is_paid: 0,
          };
          await addDoc(collection(db, "payments"), paymentData);
          successCount++;
        } catch (error) {
          console.error(`${targetUser.id} için ödeme talebi hatası:`, error);
        }
      }

      if (successCount > 0) {
        showNotification(
          `${successCount} kullanıcı için ödeme talebi oluşturuldu`
        );

        setPaymentForm({
          paymentType: "aidat",
          amount: "",
          description: "",
          isAllUsers: true,
          selectedUsers: [],
          payment_date: new Date().toISOString().split("T")[0],
        });
        setShowPaymentModal(false);
        const newPayments = await fetchPayments();
        calculateAndUpdateStats(users, announcements, newPayments, issues);
      } else {
        throw new Error("Hiçbir kullanıcı için ödeme talebi oluşturulamadı.");
      }
    } catch (error) {
      console.error("Ödeme talebi hatası:", error);
      showNotification(
        "Ödeme talebi oluşturulurken hata: " + error.message,
        "error"
      );
    } finally {
    }
  };

  const toggleUserSelection = (userId) => {
    if (paymentForm.selectedUsers.includes(userId)) {
      setPaymentForm((prev) => ({
        ...prev,
        selectedUsers: prev.selectedUsers.filter((id) => id !== userId),
      }));
    } else {
      setPaymentForm((prev) => ({
        ...prev,
        selectedUsers: [...prev.selectedUsers, userId],
      }));
    }
  };

  if (loading) {
    return (
      <div className="admin-home-loading">
        <div className="loader-container">
          <div className="loader"></div>
          <p>Dashboard yükleniyor...</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="admin-home full-width">
        <div
          className="error-message"
          style={{ margin: "2rem", textAlign: "center" }}
        >
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-home full-width">
      <div className="dashboard-header">
        <div className="admin-welcome-header">
          <FaUserTie className="admin-icon" />
          <div className="welcome-content">
            {userData && (
              <div className="welcome-text">
                <span className="welcome-prefix">Hoşgeldiniz,</span>
                <span className="user-name">
                  {userData.first_name} {userData.last_name}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="quick-actions">
          <button
            className="action-button"
            onClick={() => setShowAnnouncementModal(true)}
          >
            <FaBell className="action-icon" />
            <span>Yeni Duyuru</span>
          </button>
          <button
            className="action-button"
            onClick={() => setShowPaymentModal(true)}
          >
            <FiDollarSign className="action-icon" />
            <span>Ödeme İste</span>
          </button>
        </div>
      </div>

      {cashStatus && (
        <div className="cash-status-container">
          <div
            className={`cash-status-card ${
              cashStatus.net_amount < 0 ? "negative" : "positive"
            }`}
          >
            <div className="cash-icon">
              <IoWallet
                size={64}
                className="money-icon"
                style={{ color: "#ffffff", fill: "#ffffff", stroke: "#ffffff" }}
              />
            </div>
            <div className="cash-details">
              <h2>Kasa Durumu</h2>
              <div className="net-amount-display">
                <span className="net-amount-label">Kasadaki Tutar:</span>
                <span className="net-amount">
                  {formatCurrency(cashStatus.net_amount)}
                </span>
              </div>
              <div className="cash-summary">
                <div className="summary-item">
                  <div className="summary-label">
                    <MdTrendingUp className="summary-icon positive" />
                    <span>Toplam Gelir</span>
                  </div>
                  <span className="income">
                    {formatCurrency(cashStatus.total_income)}
                  </span>
                </div>
                <div className="summary-item">
                  <div className="summary-label">
                    <MdTrendingDown className="summary-icon negative" />
                    <span>Toplam Gider</span>
                  </div>
                  <span className="expense">
                    {formatCurrency(cashStatus.total_expenses)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card combined-stats">
          <div className="stat-icon-group">
            <div className="stat-icon apartment-icon">
              <BsHouseDoor />
            </div>
            <div className="stat-icon resident-icon">
              <FaUsers />
            </div>
          </div>
          <div className="stat-content">
            <span className="stat-title">Apartman Bilgisi</span>
            <div className="combined-values">
              <div className="combined-value-item">
                <span className="combined-value">{stats.totalApartments}</span>
                <span className="combined-label">Daire</span>
              </div>
              <div className="combined-divider"></div>
              <div className="combined-value-item">
                <span className="combined-value">{stats.totalResidents}</span>
                <span className="combined-label">Sakin</span>
              </div>
            </div>
            <span className="stat-description">Apartman istatistikleri</span>
          </div>
        </div>
        <div className="stat-card announcements">
          <div className="stat-icon">
            <FaBullhorn />
          </div>
          <div className="stat-content">
            <span className="stat-title">Aktif Duyuru</span>
            <span className="stat-value">{stats.totalActiveAnnouncements}</span>
            <span className="stat-description">Yayında olan duyurular</span>
          </div>
        </div>
        <div className="stat-card pending-issues">
          <div className="stat-icon">
            <BsTools />
          </div>
          <div className="stat-content">
            <span className="stat-title">Bekleyen Arızalar</span>
            <span className="stat-value">{stats.pendingIssuesCount || 0}</span>
            <span className="stat-description">
              Çözülmemiş arıza bildirimleri
            </span>
          </div>
        </div>
        <div className="stat-card unpaid warning">
          <div className="stat-icon">
            <MdWarning />
          </div>
          <div className="stat-content">
            <span className="stat-title">Ödenmemiş Borçlar</span>
            <span className="stat-value">
              {formatCurrency(stats.totalUnpaidAmount)}
            </span>
            <span className="stat-description">
              {unpaidPayments.length} ödenmemiş borç
            </span>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-card issues-card">
          <div className="card-header">
            <h3>
              <BsTools className="header-icon" /> Son Arızalar
            </h3>
            <a
              href="/admin/issues"
              className="view-all-btn"
              style={{
                backgroundColor:
                  document.documentElement.getAttribute("data-theme") === "dark"
                    ? "#3b82f6"
                    : "#0956e3",
                color: "white",
                padding: "8px 16px",
                borderRadius: "6px",
                fontWeight: "600",
                fontSize: "14px",
                textDecoration: "none",
                display: "inline-block",
                boxShadow:
                  document.documentElement.getAttribute("data-theme") === "dark"
                    ? "0 2px 8px rgba(59, 130, 246, 0.4)"
                    : "0 2px 8px rgba(9, 86, 227, 0.4)",
              }}
            >
              Tümünü Gör
            </a>
          </div>
          <div className="card-content">
            {issues && issues.length > 0 ? (
              (() => {
                const filteredIssues = issues.filter(
                  (issue) =>
                    issue.status === "beklemede" ||
                    issue.status === "ilgileniliyor"
                );
                return filteredIssues.length > 0 ? (
                  <div className="issues-list">
                    {filteredIssues.slice(0, 3).map((issue) => (
                      <div key={issue.id} className="issue-item">
                        <div className="issue-header">
                          <div className="issue-apartment">
                            <MdOutlineHome className="home-icon" />{" "}
                            <span className="apartment-number">
                              Daire {issue.apartment_number}
                            </span>{" "}
                            <span className="user-name">{issue.user_name}</span>
                          </div>
                          <span
                            className={`issue-status ${getStatusClass(
                              issue.status
                            )}`}
                          >
                            {getStatusText(issue.status)}
                          </span>
                        </div>
                        <h4 className="issue-title">{issue.title}</h4>
                        <p className="issue-description">{issue.description}</p>
                        <div className="issue-meta">
                          <span className="issue-date">
                            {issue.created_at
                              ? new Date(issue.created_at).toLocaleDateString(
                                  "tr-TR"
                                )
                              : "-"}
                          </span>
                          {issue.admin_note && (
                            <span className="admin-note">
                              Not: {issue.admin_note}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <BsTools size={64} className="empty-icon" />
                    <p>Çözüm bekleyen arıza yok</p>
                  </div>
                );
              })()
            ) : (
              <div className="empty-state">
                <BsTools size={64} className="empty-icon" />
                <p>Arıza kaydı yok</p>
              </div>
            )}
          </div>
        </div>
        <div className="dashboard-card payments-card">
          <div className="card-header">
            <h3>
              <MdPayment className="header-icon" /> Son Ödenmemiş Borçlar
            </h3>
            <a
              href="/admin/payments"
              className="view-all-btn"
              style={{
                backgroundColor:
                  document.documentElement.getAttribute("data-theme") === "dark"
                    ? "#3b82f6"
                    : "#0956e3",
                color: "white",
                padding: "8px 16px",
                borderRadius: "6px",
                fontWeight: "600",
                fontSize: "14px",
                textDecoration: "none",
                display: "inline-block",
                boxShadow:
                  document.documentElement.getAttribute("data-theme") === "dark"
                    ? "0 2px 8px rgba(8, 60, 144, 0.4)"
                    : "0 2px 8px rgba(9, 86, 227, 0.4)",
              }}
            >
              Tümünü Gör
            </a>
          </div>
          <div className="card-content">
            {unpaidPayments.length > 0 ? (
              <div className="payments-list">
                {unpaidPayments.slice(0, 5).map((payment) => (
                  <div key={payment.id} className="payment-item">
                    <div className="payment-info">
                      <div className="payment-user">
                        <MdOutlineHome className="home-icon" />
                        <span className="apartment-number">
                          Daire {payment.apartment_number}
                        </span>
                        <span className="user-name">{payment.user_name}</span>
                      </div>
                      <div className="payment-amount">
                        {formatCurrency(payment.amount)}
                      </div>
                    </div>
                    <div className="payment-meta">
                      <span className="payment-type">{payment.type}</span>
                      <span className="payment-status unpaid">Ödenmedi</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <BsCashCoin size={64} className="empty-icon" />
                <p>Ödenmemiş borç kaydı yok</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAnnouncementModal && (
        <div
          className="admin-modal-overlay"
          onClick={() => setShowAnnouncementModal(false)}
        >
          <div
            className="admin-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h3>
                <MdAnnouncement className="admin-modal-icon" /> Yeni Duyuru Ekle
              </h3>
              <button
                className="admin-close-button"
                onClick={() => setShowAnnouncementModal(false)}
              >
                <IoClose />
              </button>
            </div>
            <form onSubmit={handleAddAnnouncement} className="admin-modal-form">
              <div className="admin-form-group">
                <label>Duyuru İçeriği</label>
                <textarea
                  value={announcementForm.content}
                  onChange={(e) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      content: e.target.value,
                    })
                  }
                  placeholder="Duyuru içeriğini giriniz..."
                  required
                  className="admin-styled-textarea"
                />
              </div>
              <div className="admin-form-group">
                <label>Geçerlilik Süresi (Gün)</label>
                <input
                  type="number"
                  value={announcementForm.days_active}
                  onChange={(e) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      days_active: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="365"
                  required
                  className="admin-styled-input"
                />
              </div>
              <div className="admin-form-actions">
                <button
                  type="button"
                  className="admin-cancel-btn"
                  onClick={() => setShowAnnouncementModal(false)}
                >
                  İptal
                </button>
                <button type="submit" className="admin-submit-btn">
                  <MdAdd className="admin-btn-icon" /> Duyuru Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div
          className="admin-modal-overlay"
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="admin-modal-container payment-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h3>
                <FiDollarSign className="admin-modal-icon" /> Ödeme Talebi
                Oluştur
              </h3>
              <button
                className="admin-close-button"
                onClick={() => setShowPaymentModal(false)}
              >
                <IoClose />
              </button>
            </div>
            <form onSubmit={handlePaymentRequest} className="admin-modal-form">
              <div className="admin-form-group">
                <label>Ödeme Tipi</label>
                <select
                  value={paymentForm.paymentType}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      paymentType: e.target.value,
                    })
                  }
                  className="admin-styled-select"
                >
                  <option value="aidat">Aidat</option>
                  <option value="demirbas">Demirbaş</option>
                  <option value="diger">Diğer</option>
                </select>
              </div>
              <div className="admin-form-group">
                <label>Tutar (₺)</label>
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, amount: e.target.value })
                  }
                  placeholder="Örn: 1000"
                  required
                  className="admin-styled-input"
                />
              </div>
              <div className="admin-form-group">
                <label>Açıklama</label>
                <textarea
                  value={paymentForm.description}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Ödeme açıklaması..."
                  className="admin-styled-textarea"
                />
              </div>
              <div className="admin-form-group">
                <label>Son Ödeme Tarihi</label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_date: e.target.value,
                    })
                  }
                  className="admin-styled-input"
                />
              </div>
              <div className="admin-form-group">
                <div className="admin-checkbox-group">
                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={paymentForm.isAllUsers}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          isAllUsers: e.target.checked,
                          selectedUsers: e.target.checked
                            ? []
                            : paymentForm.selectedUsers,
                        })
                      }
                    />
                    <span className="admin-checkbox-text">
                      Tüm kullanıcılara uygula
                    </span>
                  </label>
                </div>
              </div>
              {!paymentForm.isAllUsers && (
                <div className="admin-form-group">
                  <label>Kullanıcı Seçimi</label>
                  <div className="admin-users-select">
                    <div className="admin-users-list">
                      {users
                        .filter((u) => u.role === "user")
                        .map((userItem) => (
                          <div
                            key={userItem.id}
                            className={`admin-user-card ${
                              paymentForm.selectedUsers.includes(userItem.id)
                                ? "admin-selected"
                                : ""
                            }`}
                            onClick={() => toggleUserSelection(userItem.id)}
                          >
                            <input
                              type="checkbox"
                              checked={paymentForm.selectedUsers.includes(
                                userItem.id
                              )}
                              readOnly
                            />
                            <span className="admin-user-info">
                              <span className="admin-apartment-number">
                                {userItem.apartment_number}
                              </span>
                              <span className="admin-user-name">
                                {userItem.first_name} {userItem.last_name}
                              </span>
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="admin-form-actions">
                <button
                  type="button"
                  className="admin-cancel-btn"
                  onClick={() => setShowPaymentModal(false)}
                >
                  İptal
                </button>
                <button type="submit" className="admin-submit-btn">
                  <MdAdd className="admin-btn-icon" /> Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminHome;
