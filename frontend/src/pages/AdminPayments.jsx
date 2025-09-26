import React, { useState, useEffect, useContext } from "react";
import "./AdminPayments.css";
import {
  FiCalendar,
  FiFilter,
  FiDollarSign,
  FiTrash2,
  FiCheck,
  FiX,
  FiEdit,
} from "react-icons/fi";
import { UserContext } from "../contexts/UserContext";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

const AdminPayments = () => {
  const { user: adminUser } = useContext(UserContext);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filters, setFilters] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    paymentType: "",
    isPaid: "",
    userId: "",
  });
  const [users, setUsers] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editFormData, setEditFormData] = useState({
    amount: "",
    type: "",
    created_date: "",
  });

  const [tooltip, setTooltip] = useState({
    visible: false,
    text: "",
    x: 0,
    y: 0,
    type: "",
  });

  const months = [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
  ];

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (adminUser) {
      fetchPayments();
    }
  }, [filters, filterType, startDate, endDate, adminUser]);

  useEffect(() => {
    return () => {
      setTooltip({ visible: false, text: "", x: 0, y: 0, type: "" });
    };
  }, []);

  const showTooltip = (e, text, type = "") => {
    if (!text || text.trim() === "") return;

    const x = e.clientX + 10;
    const y = e.clientY - 30;

    setTooltip({
      visible: true,
      text: text.trim(),
      x,
      y,
      type,
    });
  };

  const hideTooltip = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const fetchUsers = async () => {
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, orderBy("apartment_number", "asc"));
      const usersSnapshot = await getDocs(q);
      const usersList = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setUsers(usersList);
    } catch (error) {
      console.error("Kullanıcılar yüklenirken hata:", error);
    }
  };

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const paymentsRef = collection(db, "payments");
      const constraints = [];

      if (filters.userId) {
        constraints.push(where("user_id", "==", filters.userId));
      }
      if (filters.isPaid !== "") {
        constraints.push(
          where("is_paid", "==", filters.isPaid === "true" ? 1 : 0)
        );
      }
      if (filters.paymentType) {
        constraints.push(where("type", "==", filters.paymentType));
      }

      let startFilterDate, endFilterDate;
      if (filterType === "month") {
        startFilterDate = Timestamp.fromDate(
          new Date(filters.year, filters.month - 1, 1)
        );
        endFilterDate = Timestamp.fromDate(
          new Date(filters.year, filters.month, 0, 23, 59, 59)
        );
      } else if (filterType === "year") {
        startFilterDate = Timestamp.fromDate(new Date(filters.year, 0, 1));
        endFilterDate = Timestamp.fromDate(
          new Date(filters.year, 11, 31, 23, 59, 59)
        );
      } else if (filterType === "range" && startDate && endDate) {
        const startDateObj = new Date(startDate);
        startDateObj.setHours(0, 0, 0, 0);
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        startFilterDate = Timestamp.fromDate(startDateObj);
        endFilterDate = Timestamp.fromDate(endDateObj);
      }

      if (startFilterDate && endFilterDate) {
        constraints.push(where("created_date", ">=", startFilterDate));
        constraints.push(where("created_date", "<=", endFilterDate));
      } else if (
        filterType !== "range" &&
        (!startFilterDate || !endFilterDate)
      ) {
        console.warn(
          "Ay/Yıl filtresi için geçerli tarih aralığı oluşturulamadı."
        );
      }

      constraints.push(orderBy("created_date", "desc"));

      const q = query(paymentsRef, ...constraints);
      const paymentsSnapshot = await getDocs(q);
      let paymentsList = paymentsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        created_date: doc.data().created_date?.toDate() || new Date(),
        payment_date: doc.data().payment_date?.toDate() || null,
        is_paid: doc.data().is_paid === 1,
      }));

      setPayments(paymentsList);
    } catch (error) {
      console.error("Ödemeler yüklenirken hata:", error);
      setError("Ödemeler yüklenirken bir hata oluştu: " + error.message);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentStatusUpdate = async (paymentId) => {
    try {
      const paymentRef = doc(db, "payments", paymentId);
      const paymentDoc = await getDoc(paymentRef);
      if (!paymentDoc.exists()) {
        throw new Error("Ödeme kaydı bulunamadı");
      }

      const paymentData = paymentDoc.data();
      const newIsPaidStatus = paymentData.is_paid === 1 ? 0 : 1;

      await updateDoc(paymentRef, {
        is_paid: newIsPaidStatus,
        payment_date: newIsPaidStatus === 1 ? Timestamp.now() : null,
      });

      alert(
        newIsPaidStatus === 1
          ? "Ödeme yapıldı olarak işaretlendi"
          : "Ödeme yapılmadı olarak işaretlendi"
      );
      fetchPayments();
    } catch (error) {
      console.error("Ödeme durumu güncelleme hatası:", error);
      alert("Hata: " + error.message);
    }
  };

  const handleDeletePayment = async (paymentId, userName, amount) => {
    if (
      !window.confirm(
        `${userName} kullanıcısının ${amount}₺ tutarındaki ödeme kaydını silmek istediğinizden emin misiniz?`
      )
    ) {
      return;
    }

    try {
      const paymentRef = doc(db, "payments", paymentId);
      await deleteDoc(paymentRef);

      alert("Ödeme kaydı başarıyla silindi");
      fetchPayments();
    } catch (error) {
      console.error("Ödeme silme hatası:", error);
      alert("Hata: " + error.message);
    }
  };

  const handleEditClick = (payment) => {
    setEditingPayment(payment);
    setEditFormData({
      amount: payment.amount,
      type: payment.type,
      created_date: payment.created_date
        ? payment.created_date.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
    });
    setIsEditModalOpen(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData({
      ...editFormData,
      [name]: name === "amount" ? parseFloat(value) || 0 : value,
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();

    if (editFormData.amount <= 0) {
      alert("Ödeme tutarı 0'dan büyük olmalıdır");
      return;
    }

    try {
      const paymentRef = doc(db, "payments", editingPayment.id);

      const createdDate = new Date(editFormData.created_date);
      createdDate.setHours(12, 0, 0, 0);

      await updateDoc(paymentRef, {
        amount: parseFloat(editFormData.amount),
        type: editFormData.type,
        created_date: Timestamp.fromDate(createdDate),
        updated_at: Timestamp.now(),
        updated_by: adminUser?.uid || null,
      });

      alert("Ödeme başarıyla güncellendi");
      setIsEditModalOpen(false);
      fetchPayments();
    } catch (error) {
      console.error("Ödeme güncelleme hatası:", error);
      alert("Hata: " + error.message);
    }
  };

  const formatCurrency = (amount) => {
    const number = Number(amount);
    if (isNaN(number)) {
      return "-";
    }
    return (
      number.toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " ₺"
    );
  };

  return (
    <div className="admin-payments">
      <div className="filters">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="month">Aylık</option>
          <option value="year">Yıllık</option>
          <option value="range">Tarih Aralığı</option>
        </select>

        {filterType === "month" && (
          <>
            <select
              value={filters.year}
              onChange={(e) =>
                setFilters({ ...filters, year: Number(e.target.value) })
              }
            >
              {[2023, 2024, 2025].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={filters.month}
              onChange={(e) =>
                setFilters({ ...filters, month: Number(e.target.value) })
              }
            >
              {months.map((month, index) => (
                <option key={index + 1} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>
          </>
        )}

        {filterType === "year" && (
          <select
            value={filters.year}
            onChange={(e) =>
              setFilters({ ...filters, year: Number(e.target.value) })
            }
          >
            {[2023, 2024, 2025].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        )}

        {filterType === "range" && (
          <>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </>
        )}

        <select
          value={filters.isPaid}
          onChange={(e) => setFilters({ ...filters, isPaid: e.target.value })}
        >
          <option value="">Tüm Durumlar</option>
          <option value="true">Ödendi</option>
          <option value="false">Ödenmedi</option>
        </select>

        <select
          value={filters.userId}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, userId: e.target.value }))
          }
          className="user-select"
        >
          <option value="">Tüm Kullanıcılar</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.apartment_number || "?"} - {u.first_name || ""}{" "}
              {u.last_name || ""}
            </option>
          ))}
        </select>
      </div>

      {tooltip.visible && (
        <div
          className={`tooltip ${tooltip.type}`}
          style={{
            left: tooltip.x + "px",
            top: tooltip.y + "px",
            opacity: 1,
            visibility: "visible",
          }}
        >
          {tooltip.text}
        </div>
      )}

      {loading ? (
        <div className="loading">Ödemeler yükleniyor, lütfen bekleyin...</div>
      ) : error ? (
        <div className="error">Hata: {error}</div>
      ) : payments.length === 0 ? (
        <div className="no-data">
          Seçili kriterlere uygun ödeme kaydı bulunmamaktadır.
        </div>
      ) : (
        <table className="payments-table">
          <thead>
            <tr>
              <th
                onMouseEnter={(e) => showTooltip(e, "Daire numarası")}
                onMouseLeave={hideTooltip}
              >
                Daire No
              </th>
              <th
                onMouseEnter={(e) => showTooltip(e, "Ödeme sahibi")}
                onMouseLeave={hideTooltip}
              >
                Ad Soyad
              </th>
              <th
                onMouseEnter={(e) => showTooltip(e, "Ödemenin kategorisi")}
                onMouseLeave={hideTooltip}
              >
                Ödeme Türü
              </th>
              <th
                onMouseEnter={(e) => showTooltip(e, "Ödeme tutarı")}
                onMouseLeave={hideTooltip}
              >
                Tutar
              </th>
              <th
                onMouseEnter={(e) => showTooltip(e, "Ödemenin eklendiği tarih")}
                onMouseLeave={hideTooltip}
              >
                Atama Tarihi
              </th>
              <th
                onMouseEnter={(e) => showTooltip(e, "Ödemenin yapıldığı tarih")}
                onMouseLeave={hideTooltip}
              >
                Ödeme Tarihi
              </th>
              <th
                onMouseEnter={(e) => showTooltip(e, "Ödeme hakkında notlar")}
                onMouseLeave={hideTooltip}
              >
                Açıklama
              </th>
              <th
                onMouseEnter={(e) => showTooltip(e, "Ödeme durumu")}
                onMouseLeave={hideTooltip}
              >
                Durum
              </th>
              <th
                onMouseEnter={(e) => showTooltip(e, "İşlem seçenekleri")}
                onMouseLeave={hideTooltip}
              >
                İşlemler
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="apartment-number-cell">
                  {payment.apartment_number || "-"}
                </td>
                <td>{payment.user_name || "-"}</td>
                <td>{payment.type || "-"}</td>
                <td>{formatCurrency(payment.amount)}</td>
                <td>
                  {payment.created_date
                    ? payment.created_date.toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : "-"}
                </td>
                <td>
                  {payment.payment_date
                    ? payment.payment_date.toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : "-"}
                </td>
                <td className="description-cell">
                  <div className="description-content">
                    {payment.note ? (
                      payment.note
                    ) : (
                      <span className="no-description">Açıklama yok</span>
                    )}
                  </div>
                </td>
                <td>
                  <span
                    className={`status-badge ${
                      payment.is_paid ? "paid" : "unpaid"
                    }`}
                    onClick={() => handlePaymentStatusUpdate(payment.id)}
                    onMouseEnter={(e) =>
                      showTooltip(
                        e,
                        payment.is_paid
                          ? "Ödenmedi olarak işaretle"
                          : "Ödendi olarak işaretle",
                        payment.is_paid ? "unpaid" : "paid"
                      )
                    }
                    onMouseLeave={hideTooltip}
                  >
                    {payment.is_paid ? "Ödendi" : "Ödenmedi"}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      onClick={() => handleEditClick(payment)}
                      className="edit-button"
                      onMouseEnter={(e) => showTooltip(e, "Düzenle", "default")}
                      onMouseLeave={hideTooltip}
                      aria-label="Düzenle"
                    >
                      <FiEdit aria-hidden="true" />
                    </button>
                    <button
                      onClick={() =>
                        handleDeletePayment(
                          payment.id,
                          payment.user_name,
                          payment.amount
                        )
                      }
                      className="delete-button"
                      onMouseEnter={(e) => showTooltip(e, "Sil", "default")}
                      onMouseLeave={hideTooltip}
                      aria-label="Sil"
                    >
                      <FiTrash2 aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isEditModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsEditModalOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Ödeme Düzenle</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setIsEditModalOpen(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>
                  <FiDollarSign /> Tutar (₺)
                </label>
                <input
                  type="number"
                  name="amount"
                  value={editFormData.amount}
                  onChange={handleEditChange}
                  required
                  min="0.01"
                  step="0.01"
                />
              </div>
              <div className="form-group">
                <label>Ödeme Türü</label>
                <select
                  name="type"
                  value={editFormData.type}
                  onChange={handleEditChange}
                  required
                >
                  <option value="">Seçiniz</option>
                  <option value="Aidat">Aidat</option>
                  <option value="Demirbaş">Demirbaş</option>
                  <option value="Tadilat">Tadilat</option>
                  <option value="Diğer">Diğer</option>
                </select>
              </div>
              <div className="form-group">
                <label>
                  <FiCalendar /> Atama Tarihi
                </label>
                <input
                  type="date"
                  name="created_date"
                  value={editFormData.created_date}
                  onChange={handleEditChange}
                  required
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  İptal
                </button>
                <button type="submit" className="submit-button">
                  Güncelle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;
