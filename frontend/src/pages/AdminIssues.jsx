import React, { useState, useEffect, useContext } from "react";
import {
  FiEdit,
  FiAlertCircle,
  FiCalendar,
  FiHome,
  FiUser,
  FiFileText,
  FiInfo,
  FiCheck,
  FiX,
  FiTool,
} from "react-icons/fi";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import "./AdminIssues.css";
import { UserContext } from "../contexts/UserContext";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  addDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const sanitizeDescription = (text) => {
  let cleaned = text.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/\n+/g, "\n");
  return cleaned.trim();
};

const AdminIssues = () => {
  const { user } = useContext(UserContext);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [updateForm, setUpdateForm] = useState({ status: "", adminNotes: "" });

  useEffect(() => {
    fetchIssues();
  }, [statusFilter]);

  const fetchIssues = async () => {
    setLoading(true);
    setError("");
    try {
      const issuesRef = collection(db, "issues");
      let issuesQuery;
      if (statusFilter !== "all") {
        issuesQuery = query(
          issuesRef,
          where("status", "==", statusFilter),
          orderBy("created_at", "desc")
        );
      } else {
        issuesQuery = query(issuesRef, orderBy("created_at", "desc"));
      }
      const querySnapshot = await getDocs(issuesQuery);
      const issuesList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data().created_at?.toDate() || new Date(),
        updated_at: doc.data().updated_at?.toDate() || null,
        resolved_at: doc.data().resolved_at?.toDate() || null,
        status: doc.data().status || "beklemede",
      }));
      setIssues(issuesList);
    } catch (err) {
      console.error("Arızalar yüklenirken hata:", err);
      setError("Arıza listesi yüklenirken sorun oluştu.");
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredIssues = Array.isArray(issues) ? issues : [];

  const handleEditClick = (issue) => {
    setSelectedIssue(issue);
    setUpdateForm({
      status: issue.status || "",
      adminNotes: issue.admin_note || "",
    });
    setIsModalOpen(true);
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!updateForm.status) {
      alert("Lütfen bir durum seçin.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const issueRef = doc(db, "issues", selectedIssue.id);
      const updateData = {
        status: updateForm.status,
        admin_note: updateForm.adminNotes || "",
        updated_at: Timestamp.now(),
        resolved_at:
          updateForm.status === "tamamlandi"
            ? Timestamp.now()
            : selectedIssue.resolved_at || null,
      };

      await updateDoc(issueRef, updateData);
      console.log("Arıza güncellendi:", selectedIssue.id);

      alert("✅ Arıza başarıyla güncellendi.");
      setIssues((prevIssues) =>
        prevIssues.map((issue) =>
          issue.id === selectedIssue.id
            ? {
                ...issue,
                ...updateData,
                updated_at: new Date(),
                resolved_at: updateData.resolved_at
                  ? new Date(updateData.resolved_at.seconds * 1000)
                  : null,
              }
            : issue
        )
      );
      setIsModalOpen(false);
      setSelectedIssue(null);
      setUpdateForm({ status: "", adminNotes: "" });
    } catch (err) {
      console.error("Arıza güncellenirken hata:", err);
      setError("Arıza güncellenirken bir sorun oluştu.");
      alert("❌ Arıza güncellenemedi: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status) => {
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
        return "Bekliyor";
      case "ilgileniliyor":
        return "İşleme Alındı";
      case "tamamlandi":
        return "Tamamlandı";
      default:
        return "Bilinmiyor";
    }
  };
  const formatDate = (date) => {
    if (!date) return "-";
    try {
      const dateObj =
        date instanceof Timestamp ? date.toDate() : new Date(date);
      if (isNaN(dateObj.getTime())) return "Geçersiz Tarih";
      return format(dateObj, "d MMMM yyyy", { locale: tr });
    } catch (error) {
      console.error("Tarih formatlama hatası:", date, error);
      return "Hata";
    }
  };

  return (
    <div className="ai-admin-issues">
      <div className="ai-page-header">
        <div className="ai-page-title">
          <div className="ai-page-title-icon">
            <svg
              stroke="currentColor"
              fill="currentColor"
              strokeWidth="0"
              viewBox="0 0 16 16"
              height="1em"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M1 0 0 1l2.2 3.081a1 1 0 0 0 .815.419h.07a1 1 0 0 1 .708.293l2.675 2.675-2.617 2.654A3.003 3.003 0 0 0 0 13a3 3 0 1 0 5.878-.851l2.654-2.617.968.968-.305.914a1 1 0 0 0 .242 1.023l3.27 3.27a.997.997 0 0 0 1.414 0l1.586-1.586a.997.997 0 0 0 0-1.414l-3.27-3.27a1 1 0 0 0-1.023-.242L10.5 9.5l-.96-.96 2.68-2.643A3.005 3.005 0 0 0 16 3q0-.405-.102-.777l-2.14 2.141L12 4l-.364-1.757L13.777.102a3 3 0 0 0-3.675 3.68L7.462 6.46 4.793 3.793a1 1 0 0 1-.293-.707v-.071a1 1 0 0 0-.419-.814zm9.646 10.646a.5.5 0 0 1 .708 0l2.914 2.915a.5.5 0 0 1-.707.707l-2.915-2.914a.5.5 0 0 1 0-.708M3 11l.471.242.529.026.287.445.445.287.026.529L5 13l-.242.471-.026.529-.445.287-.287.445-.529-.026L3 15l-.471-.242L2 14.732l-.287-.445L1.268 14l-.026-.529L1 13l.242-.471.026-.529.445-.287.287-.445.529-.026z"></path>
            </svg>
          </div>
          <h1>Arıza / Bakım Talepleri</h1>
        </div>
        <div className="ai-filter-section">
          <select
            className="ai-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tüm Talepler</option>
            <option value="beklemede">Bekleyen</option>
            <option value="ilgileniliyor">İşleme Alınan</option>
            <option value="tamamlandi">Tamamlanan</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="ai-error-message">
          <FiAlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="ai-issues-table-container">
        {loading ? (
          <div className="ai-loading">
            <div className="ai-loading-spinner"></div>
            <p>Talepler Yükleniyor...</p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="ai-no-data">
            <p>Gösterilecek talep bulunamadı.</p>
          </div>
        ) : (
          <table className="ai-issues-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Daire No</th>
                <th>Ad Soyad</th>
                <th>Başlık</th>
                <th>Açıklama</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.map((issue) => (
                <tr key={issue.id}>
                  <td>{formatDate(issue.created_at)}</td>
                  <td>{issue.apartment_number || "?"}</td>
                  <td>{issue.user_name || "Bilinmiyor"}</td>
                  <td>{issue.title}</td>
                  <td className="ai-description-cell">
                    <div className="ai-description-content">
                      {issue.description}
                    </div>
                  </td>
                  <td>
                    <span className={`ai-${getStatusBadgeClass(issue.status)}`}>
                      {getStatusText(issue.status)}
                    </span>
                  </td>
                  <td>
                    <button
                      className="ai-edit-button"
                      onClick={() => handleEditClick(issue)}
                    >
                      <FiEdit size={18} />
                      <span>Düzenle</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && selectedIssue && (
        <div className="ai-modal" onClick={() => setIsModalOpen(false)}>
          <div
            className="ai-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ai-modal-header">
              <h3
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <FiFileText
                  size={20}
                  style={{
                    color:
                      document.documentElement.getAttribute("data-theme") ===
                      "dark"
                        ? "#38bdf8"
                        : "#0284c7",
                  }}
                />
                Arıza/Talep Detayı
              </h3>
              <button
                className="ai-close-button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Kapat"
              >
                &times;
              </button>
            </div>
            <div className="ai-modal-body">
              <div className="ai-issue-details">
                <p className="ai-detail-item">
                  <FiCalendar className="ai-detail-icon" />
                  <strong className="ai-detail-label">Tarih:</strong>
                  <span>{formatDate(selectedIssue.created_at)}</span>
                </p>
                <p className="ai-detail-item">
                  <FiHome className="ai-detail-icon" />
                  <strong className="ai-detail-label">Daire:</strong>
                  <span>{selectedIssue.apartment_number}</span>
                </p>
                <p className="ai-detail-item">
                  <FiUser className="ai-detail-icon" />
                  <strong className="ai-detail-label">Sakin:</strong>
                  <span>{selectedIssue.user_name || "Bilinmiyor"}</span>
                </p>
                <p className="ai-detail-item">
                  <FiFileText className="ai-detail-icon" />
                  <strong className="ai-detail-label">Başlık:</strong>
                  <span>{selectedIssue.title}</span>
                </p>
                <p className="ai-detail-item">
                  <FiInfo className="ai-detail-icon" />
                  <strong className="ai-detail-label">Açıklama:</strong>
                  <span className="ai-description-text">
                    {selectedIssue.description}
                  </span>
                </p>
              </div>

              <form onSubmit={handleUpdateSubmit} className="ai-update-form">
                <div className="ai-form-group">
                  <label htmlFor="status" className="ai-form-label">
                    <span className="ai-label-with-icon">
                      <FiCheck className="ai-label-icon" /> Durum
                    </span>
                  </label>
                  <select
                    id="status"
                    value={updateForm.status}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, status: e.target.value })
                    }
                    required
                    className="ai-form-select"
                  >
                    <option value="">Durum Seçin</option>
                    <option value="beklemede">Bekliyor</option>
                    <option value="ilgileniliyor">İşleme Alındı</option>
                    <option value="tamamlandi">Tamamlandı</option>
                  </select>
                </div>
                <div className="ai-form-group">
                  <label htmlFor="adminNotes" className="ai-form-label">
                    <span className="ai-label-with-icon">
                      <FiFileText className="ai-label-icon" /> Yönetici Notları
                    </span>
                  </label>
                  <textarea
                    id="adminNotes"
                    value={updateForm.adminNotes}
                    onChange={(e) =>
                      setUpdateForm({
                        ...updateForm,
                        adminNotes: e.target.value,
                      })
                    }
                    placeholder="Arıza/talep hakkında notlar ekleyin..."
                    className="ai-form-textarea"
                  />
                </div>
                <div className="ai-form-actions">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="ai-cancel-button"
                  >
                    <FiX size={18} /> İptal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="ai-submit-button"
                  >
                    <FiCheck size={18} />
                    {loading ? "Güncelleniyor..." : "Güncelle"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminIssues;
