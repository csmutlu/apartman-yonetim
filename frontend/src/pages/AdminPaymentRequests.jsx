import React, { useState, useEffect, useContext } from "react";
import {
  FiDollarSign,
  FiUsers,
  FiCalendar,
  FiEdit,
  FiPlus,
  FiFileText,
  FiCreditCard,
  FiToggleLeft,
  FiToggleRight,
} from "react-icons/fi";
import "./AdminPaymentRequests.css";
import { UserContext } from "../contexts/UserContext";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  limit,
  writeBatch, // Batch işlemleri için eklendi
} from "firebase/firestore";
import { db } from "../firebase";

const AdminPaymentRequests = () => {
  const { user: currentUser } = useContext(UserContext);
  const [activeCard, setActiveCard] = useState("payment");
  const [paymentType, setPaymentType] = useState("aidat");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [currentFee, setCurrentFee] = useState("");
  const [users, setUsers] = useState([]);
  const [isAllUsers, setIsAllUsers] = useState(true);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(true);
  const [isUpdatingFee, setIsUpdatingFee] = useState(false);
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    fetchData();
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("role", "==", "user"),
        orderBy("apartment_number", "asc")
      );
      const usersSnapshot = await getDocs(q);
      const usersData = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setUsers(usersData);
      return usersData;
    } catch (error) {
      console.error("Kullanıcılar yüklenirken hata:", error);
      throw error;
    }
  };
  const fetchCurrentFee = async () => {
    try {
      const settingsRef = doc(db, "settings", "fee");
      const settingsSnapshot = await getDoc(settingsRef);
      if (settingsSnapshot.exists()) {
        const feeData = settingsSnapshot.data();
        const currentAmount = feeData.amount || 100;
        setCurrentFee(currentAmount);
        setFeeAmount(currentAmount);
        return currentAmount;
      } else {
        setCurrentFee(100);
        setFeeAmount(100);

        return 100;
      }
    } catch (error) {
      console.error("Aidat yüklenirken hata:", error);
      throw error;
    }
  };
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!currentUser) throw new Error("Oturum bilgisi yok");
      await Promise.all([fetchUsers(), fetchCurrentFee()]);
    } catch (err) {
      console.error("Veri yükleme hatası:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFeeUpdate = async () => {
    if (isUpdatingFee) return;
    if (!currentUser) {
      alert("İşlem için admin yetkisi gerekli.");
      return;
    }
    if (!feeAmount) {
      alert("Yeni aidat tutarını giriniz");
      return;
    }
    const newFee = parseFloat(feeAmount);
    if (isNaN(newFee) || newFee <= 0) {
      alert("Geçerli bir tutar giriniz.");
      return;
    }

    setIsUpdatingFee(true);
    try {
      // Settings'deki fee dokümanını güncelle
      const settingsRef = doc(db, "settings", "fee");
      await updateDoc(settingsRef, {
        amount: newFee,
        updated_at: Timestamp.now(),
        updated_by: currentUser.uid,
      });

      // Tüm kullanıcıların fee alanlarını güncelle
      const usersRef = collection(db, "users");
      const usersSnapshot = await getDocs(usersRef);

      // Batch işlemi başlat (toplu güncelleme için)
      const batch = writeBatch(db);

      usersSnapshot.forEach((userDoc) => {
        const userRef = doc(db, "users", userDoc.id);
        batch.update(userRef, {
          fee: newFee,
          updated_at: Timestamp.now(),
        });
      });

      // Batch işlemini commit et
      await batch.commit();

      alert("Aidat tutarı tüm kullanıcılar için başarıyla güncellendi");
      setCurrentFee(newFee);
    } catch (error) {
      console.error("Aidat güncelleme hatası:", error);
      alert("Hata: " + error.message);
    } finally {
      setIsUpdatingFee(false);
    }
  };

  const handlePaymentRequest = async () => {
    if (isCreatingRequest) return;
    if (!currentUser) {
      alert("İşlem için admin yetkisi gerekli.");
      return;
    }
    if (!amount || !paymentType) {
      alert("Tutar ve Ödeme Tipi giriniz");
      return;
    }
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      alert("Geçerli bir tutar giriniz.");
      return;
    }
    if (!isAllUsers && selectedUsers.length === 0) {
      alert("Kullanıcı seçin veya tümüne gönderin.");
      return;
    }

    setIsCreatingRequest(true);

    try {
      const paymentDateObj = paymentDate ? new Date(paymentDate) : null;

      const targetUsers = isAllUsers
        ? users.filter((u) => u.role === "user")
        : users.filter((u) => selectedUsers.includes(u.id));

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
            type: paymentType,
            note: description || "",
            created_date: Timestamp.now(),
            payment_date: paymentDateObj
              ? Timestamp.fromDate(paymentDateObj)
              : null,
            is_paid: 0,
          };
          await addDoc(collection(db, "payments"), paymentData);

          successCount++;
        } catch (error) {
          console.error(`${targetUser.id} için ödeme talebi hatası:`, error);
        }
      }

      if (successCount > 0) {
        alert(`${successCount} kullanıcı için ödeme talebi oluşturuldu`);

        setAmount("");
        setDescription("");
        setSelectedUsers([]);
        setIsAllUsers(true);
        setPaymentDate(new Date().toISOString().split("T")[0]);
      } else {
        throw new Error("Ödeme talepleri oluşturulamadı.");
      }
    } catch (error) {
      console.error("Ödeme talebi hatası:", error);
      alert("Hata: " + error.message);
    } finally {
      setIsCreatingRequest(false);
    }
  };

  const toggleUserSelection = (userId) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };

  const toggleCard = (mode) => {
    setActiveCard(mode);
  };

  if (loading) {
  }
  if (error) {
  }

  return (
    <div className="admin-payment-requests">
      <div className="view-toggle-container">
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${
              activeCard === "payment" ? "active" : ""
            }`}
            onClick={() => toggleCard("payment")}
            type="button"
          >
            <FiPlus className="toggle-icon-small" /> Ödeme Talebi
          </button>
          <button
            className={`view-toggle-btn ${
              activeCard === "fee" ? "active" : ""
            }`}
            onClick={() => toggleCard("fee")}
            type="button"
          >
            <FiEdit className="toggle-icon-small" /> Aidat Güncelleme
          </button>
        </div>
      </div>

      <div
        className={`payment-card ${
          activeCard === "payment" ? "active" : "inactive"
        }`}
      >
        <div className="card-header">
          <div className="card-header-icon">
            <FiPlus />
          </div>
          <h2>Ödeme Talebi Oluştur</h2>
        </div>
        <div className="card-content">
          <div className="payment-request-form horizontal-inputs">
            <div className="form-group">
              <label htmlFor="payment-type">
                <FiFileText className="label-icon" /> Ödeme Tipi
              </label>
              <select
                id="payment-type"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="form-select"
              >
                <option value="aidat">Aidat</option>
                <option value="demirbas">Demirbaş</option>
                <option value="diger">Diğer</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="payment-amount">
                <FiDollarSign className="label-icon" /> Tutar (₺)
              </label>
              <input
                id="payment-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Örn: 3000"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="payment-date">
                <FiCalendar className="label-icon" /> Son Ödeme Tarihi
              </label>
              <input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group description-field">
              <label htmlFor="payment-description">
                <FiFileText className="label-icon" /> Açıklama
              </label>
              <textarea
                id="payment-description"
                placeholder="Ödeme talebine ilişkin kısa bir açıklama ekleyin"
                className="form-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              ></textarea>
            </div>

            <div className="form-group checkbox-field">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={isAllUsers}
                  onChange={(e) => setIsAllUsers(e.target.checked)}
                />
                <span className="checkbox-label">
                  Talebi tüm kullanıcılara gönder
                </span>
              </label>
            </div>

            {!isAllUsers && (
              <div className="users-selection full-width">
                <div className="users-selection-header">
                  <FiUsers />
                  <h3>Kullanıcı Seçimi</h3>
                </div>
                <div className="users-list">
                  {users.map((userItem) => (
                    <div
                      key={userItem.id}
                      className={`user-card ${
                        selectedUsers.includes(userItem.id) ? "selected" : ""
                      }`}
                      onClick={() => toggleUserSelection(userItem.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(userItem.id)}
                        readOnly
                      />
                      <div className="user-info">
                        <span className="apartment-number">
                          {userItem.apartment_number}
                        </span>
                        <span className="user-name">
                          {userItem.first_name} {userItem.last_name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="form-actions">
              <button
                onClick={handlePaymentRequest}
                disabled={isCreatingRequest}
                className="btn btn-primary large-button"
              >
                <FiPlus className="btn-icon" />{" "}
                {isCreatingRequest
                  ? "Oluşturuluyor..."
                  : "Ödeme Talebi Oluştur"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`payment-card ${
          activeCard === "fee" ? "active" : "inactive"
        }`}
      >
        <div className="card-header">
          <div className="card-header-icon">
            <FiEdit />
          </div>
          <h2>Aidat Tutarı Güncelleme</h2>
        </div>
        <div className="card-content">
          <div className="fee-update-compact">
            <div className="fee-input-container">
              <label htmlFor="fee-amount" className="fee-label">
                <FiDollarSign className="label-icon" /> Yeni Aidat Tutarı (₺)
                {currentFee && (
                  <span className="current-fee-info">
                    {" "}
                    (Mevcut: {currentFee}₺)
                  </span>
                )}
              </label>
              <input
                id="fee-amount"
                type="number"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder={`Örn: ${currentFee || 1500}`}
                className="form-input fee-input"
              />
            </div>
            <button
              onClick={handleFeeUpdate}
              disabled={isUpdatingFee}
              className="btn btn-primary fee-button"
            >
              <FiEdit className="btn-icon" />{" "}
              {isUpdatingFee ? "Güncelleniyor..." : "Güncelle"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPaymentRequests;
