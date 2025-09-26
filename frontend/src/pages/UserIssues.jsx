import React, { useEffect, useState, useContext } from "react";
import "./UserIssues.css";
import { UserContext } from "../contexts/UserContext";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";

const sanitizeDescription = (text) => {
  let cleaned = text.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/\n+/g, "\n");
  return cleaned.trim();
};

const UserIssues = () => {
  const { user } = useContext(UserContext);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ title: "", description: "" });

  const fetchIssues = async () => {
    const userId = user?.id || user?.uid;
    if (!userId) {
      setError("Arıza taleplerini görmek için giriş yapmalısınız.");
      setLoading(false);
      setIssues([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      console.log(`UserIssues: Fetching issues for user ID: ${userId}`);
      const issuesRef = collection(db, "issues");
      const issuesQuery = query(
        issuesRef,
        where("user_id", "==", userId),
        orderBy("created_at", "desc")
      );

      const querySnapshot = await getDocs(issuesQuery);
      const issuesList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data().created_at?.toDate() || new Date(),
        updated_at: doc.data().updated_at?.toDate(),
        status: doc.data().status || "beklemede",
        admin_note: doc.data().admin_note || "",
        resolved_at: doc.data().resolved_at?.toDate(),
      }));

      console.log(`UserIssues: Found ${issuesList.length} issues.`);
      setIssues(issuesList);
    } catch (err) {
      console.error("UserIssues: Error fetching issues:", err);
      setError("Arıza talepleri yüklenirken bir hata oluştu.");
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchIssues();
    } else {
      setLoading(false);
      setIssues([]);
      setError("Arıza taleplerini görmek için giriş yapmalısınız.");
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userId = user?.id || user?.uid;
    const userFullName = `${user?.first_name || ""} ${
      user?.last_name || ""
    }`.trim();
    const userAptNo = user?.apartment_number || "";

    if (!userId) {
      setError("İşlem yapmak için giriş yapmalısınız.");
      return;
    }
    if (!formData.title || !formData.description) {
      setError("Lütfen başlık ve açıklama alanlarını doldurun.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const newIssueData = {
        user_id: userId,
        user_name: userFullName || "Bilinmeyen Kullanıcı",
        apartment_number: userAptNo || "?",
        title: formData.title,
        description: formData.description,
        status: "beklemede",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        admin_note: "",
        resolved_at: null,
      };

      await addDoc(collection(db, "issues"), newIssueData);
      console.log("UserIssues: New issue added successfully.");

      setFormData({ title: "", description: "" });
      setShowModal(false);
      fetchIssues();
      alert("Arıza talebiniz başarıyla gönderildi.");
    } catch (err) {
      console.error("UserIssues: Error adding issue:", err);
      setError("Arıza talebi gönderilirken bir hata oluştu.");
      alert("Arıza talebi gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDelete = async (issueId) => {
    const issueToDelete = issues.find((issue) => issue.id === issueId);

    if (issueToDelete && issueToDelete.status === "tamamlandi") {
      alert("Tamamlanmış arıza talepleri silinemez.");
      return;
    }

    if (
      !window.confirm(
        "Bu arıza kaydını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz."
      )
    ) {
      return;
    }

    const userId = user?.id || user?.uid;
    if (!userId) {
      setError("İşlem yapmak için giriş yapmalısınız.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const issueDocRef = doc(db, "issues", issueId);

      await deleteDoc(issueDocRef);
      console.log(`UserIssues: Issue ${issueId} deleted successfully.`);
      fetchIssues();
      alert("Arıza talebi başarıyla silindi.");
    } catch (err) {
      console.error(`UserIssues: Error deleting issue ${issueId}:`, err);
      setError("Arıza talebi silinirken bir hata oluştu.");
      alert("Arıza talebi silinemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
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
        return "Bilinmiyor";
    }
  };
  const formatDate = (date) => {
    if (!date) return "-";
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      return dateObj.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch (e) {
      console.error("Tarih formatlama hatası:", e);
      return "-";
    }
  };

  return (
    <div className="user-issues">
      <div className="page-header">
        <h1>Arıza / Bakım Taleplerim</h1>
        <button
          className="add-button"
          onClick={() => {
            setShowModal(true);
            setError("");
          }}
          disabled={loading || !user}
        >
          Yeni Arıza Bildir
        </button>
      </div>

      {error && (
        <div
          className="error-message"
          style={{ color: "red", marginBottom: "1rem" }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading">Yükleniyor...</div>
      ) : !user ? (
        <div className="no-data">
          Arıza taleplerini görmek için lütfen giriş yapın.
        </div>
      ) : issues.length === 0 ? (
        <div className="no-data">
          Henüz oluşturulmuş bir arıza talebiniz bulunmuyor.
        </div>
      ) : (
        <div className="issues-table-container">
          <table className="issues-table">
            <thead>
              <tr>
                <th>Bildirim Tarihi</th>
                <th>Başlık</th>
                <th>Açıklama</th>
                <th>Durum</th>
                <th>Yönetici Notu</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td>{formatDate(issue.created_at)}</td>
                  <td>{issue.title}</td>
                  <td>{issue.description}</td>
                  <td>
                    <span className={getStatusClass(issue.status)}>
                      {getStatusText(issue.status)}
                    </span>
                  </td>
                  <td>{issue.admin_note || "-"}</td>
                  <td>
                    {issue.status !== "tamamlandi" && (
                      <button
                        className="delete-button"
                        onClick={() => handleDelete(issue.id)}
                        disabled={loading}
                      >
                        Sil
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div
          className="issues-custom-modal"
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100000,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(5px)",
            padding: "20px",
          }}
        >
          <div
            className="issues-custom-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "550px",
              borderRadius: "16px",
              padding: "20px",
              backgroundColor: "var(--card-bg)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
              position: "relative",
              zIndex: 100001,
            }}
          >
            <div className="issues-custom-header">
              <h3
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginTop: "0",
                  color: "var(--text-primary)",
                }}
              >
                <svg
                  stroke="currentColor"
                  fill="currentColor"
                  strokeWidth="0"
                  viewBox="0 0 16 16"
                  height="1em"
                  width="1em"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ color: "#0284c7" }}
                >
                  <path d="M1 0 0 1l2.2 3.081a1 1 0 0 0 .815.419h.07a1 1 0 0 1 .708.293l2.675 2.675-2.617 2.654A3.003 3.003 0 0 0 0 13a3 3 0 1 0 5.878-.851l2.654-2.617.968.968-.305.914a1 1 0 0 0 .242 1.023l3.27 3.27a.997.997 0 0 0 1.414 0l1.586-1.586a.997.997 0 0 0 0-1.414l-3.27-3.27a1 1 0 0 0-1.023-.242L10.5 9.5l-.96-.96 2.68-2.643A3.005 3.005 0 0 0 16 3q0-.405-.102-.777l-2.14 2.141L12 4l-.364-1.757L13.777.102a3 3 0 0 0-3.675 3.68L7.462 6.46 4.793 3.793a1 1 0 0 1-.293-.707v-.071a1 1 0 0 0-.419-.814zm9.646 10.646a.5.5 0 0 1 .708 0l2.914 2.915a.5.5 0 0 1-.707.707l-2.915-2.914a.5.5 0 0 1 0-.708M3 11l.471.242.529.026.287.445.445.287.026.529L5 13l-.242.471-.026.529-.445.287-.287.445-.529-.026L3 15l-.471-.242L2 14.732l-.287-.445L1.268 14l-.026-.529L1 13l.242-.471.026-.529.445-.287.287-.445.529-.026z"></path>
                </svg>
                Yeni Arıza Bildirimi
              </h3>
              <button
                className="issues-close-button"
                onClick={() => setShowModal(false)}
                style={{
                  position: "absolute",
                  top: "15px",
                  right: "15px",
                  background: "rgba(0,0,0,0.1)",
                  border: "none",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                }}
              >
                &times;
              </button>
            </div>
            <div className="issues-custom-body" style={{ marginTop: "20px" }}>
              {error && (
                <div
                  className="issues-error-message"
                  style={{
                    color: "var(--ui-cancel, #ef4444)",
                    margin: "0 0 15px 0",
                    padding: "10px",
                    backgroundColor: "var(--ui-cancel-light, #fee2e2)",
                    borderRadius: "8px",
                    fontSize: "14px",
                  }}
                >
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <div
                  className="issues-form-group"
                  style={{ marginBottom: "15px" }}
                >
                  <label
                    htmlFor="title"
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "600",
                      color: "var(--text-primary)",
                    }}
                  >
                    Başlık *
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    placeholder="Örn: Musluk damlatıyor"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text-primary)",
                      fontSize: "14px",
                    }}
                  />
                </div>
                <div
                  className="issues-form-group"
                  style={{ marginBottom: "20px" }}
                >
                  <label
                    htmlFor="description"
                    style={{
                      display: "block",
                      marginBottom: "5px",
                      fontWeight: "600",
                      color: "var(--text-primary)",
                    }}
                  >
                    Açıklama *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    required
                    rows="5"
                    placeholder="Arızanın detaylarını açıklayınız..."
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text-primary)",
                      fontSize: "14px",
                      resize: "vertical",
                      minHeight: "100px",
                    }}
                  />
                </div>
                <div
                  className="issues-form-actions"
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                    marginTop: "20px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      padding: "8px 20px",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: "var(--ui-primary, #3498db)",
                      color: "white",
                      cursor: loading ? "wait" : "pointer",
                      fontSize: "14px",
                      fontWeight: "600",
                      opacity: loading ? "0.7" : "1",
                      transition: "all 0.2s ease",
                      boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                    }}
                  >
                    {loading ? "Gönderiliyor..." : "Gönder"}
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

export default UserIssues;
