import React, { useState, useEffect, useContext } from "react";
import {
  FiUserPlus,
  FiSearch,
  FiEdit,
  FiTrash2,
  FiShield,
  FiLock,
  FiAlertCircle,
  FiUser,
  FiInfo,
} from "react-icons/fi";
import "./AdminUsers.css";
import { UserContext } from "../contexts/UserContext";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  updateEmail,
} from "firebase/auth";
import { auth, db, functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

const cleanPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return null;

  let cleanedPhone = phoneNumber.replace(/\s+/g, "").replace(/[()-]/g, "");

  if (cleanedPhone.startsWith("+90")) {
    cleanedPhone = cleanedPhone.substring(3);
  } else if (cleanedPhone.startsWith("0")) {
    cleanedPhone = cleanedPhone.substring(1);
  }
  return cleanedPhone.length === 10 ? cleanedPhone : null;
};

const phoneToEmail = (phone) => {
  return `${phone}@apartman-yonetim.com`;
};

const formatDate = (dateObj) => {
  try {
    if (!dateObj) return "-";

    if (typeof dateObj.toDate === "function") {
      dateObj = dateObj.toDate();
    }

    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dateObj);
  } catch (error) {
    console.error("❌ Tarih formatlanırken hata:", error);
    return "-";
  }
};

const AdminUsers = () => {
  const { user: currentUser } = useContext(UserContext);

  const [users, setUsers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState(null);
  const [error, setError] = useState(null);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    text: "",
    x: 0,
    y: 0,
    type: "",
  });

  const [newUser, setNewUser] = useState({
    phone: "",
    first_name: "",
    last_name: "",
    password: "",
    apartment_number: "",
    is_renting: false,
  });

  useEffect(() => {
    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  useEffect(() => {
    if (users.length > 0) {
      const filtered = users.filter((user) => {
        const searchLower = searchTerm.toLowerCase().trim();
        const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
        const apartmentStr = String(user.apartment_number);
        const phone = user.phone || "";

        return (
          fullName.includes(searchLower) ||
          user.first_name.toLowerCase().includes(searchLower) ||
          user.last_name.toLowerCase().includes(searchLower) ||
          apartmentStr.includes(searchLower) ||
          phone.includes(searchLower)
        );
      });
      setFilteredUsers(filtered);
    }
  }, [searchTerm, users]);

  const showTooltip = (e, text, type = "default") => {
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
      setIsLoading(true);

      if (!currentUser) {
        throw new Error("Kullanıcı bilgisi bulunamadı!");
      }

      const usersRef = collection(db, "users");
      const q = query(usersRef, orderBy("apartment_number", "asc"));
      const usersSnapshot = await getDocs(q);

      const usersList = [];
      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        usersList.push({
          id: doc.id,
          ...userData,
          displayRole: userData.role === "admin" ? "Yönetici" : "Kullanıcı",
        });
      });

      setUsers(usersList);

      const admin = usersList.find((user) => user.role === "admin");
      if (admin) setCurrentAdminId(admin.id);

      setError(null);
    } catch (error) {
      setError(error.message);
      console.error("Kullanıcılar yüklenirken hata:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      const cleanedPhone = cleanPhoneNumber(newUser.phone);

      if (!cleanedPhone) {
        throw new Error(
          "Geçerli bir telefon numarası girin (Örn: 5XX XXX XX XX)"
        );
      }

      if (!newUser.password || newUser.password.length < 6) {
        throw new Error("Şifre en az 6 karakter olmalıdır");
      }

      const usersRef = collection(db, "users");
      const phoneQuery = query(usersRef, where("phone", "==", cleanedPhone));
      const phoneSnapshot = await getDocs(phoneQuery);

      if (!phoneSnapshot.empty) {
        throw new Error("Bu telefon numarası zaten kullanılıyor");
      }

      const apartmentQuery = query(
        usersRef,
        where("apartment_number", "==", newUser.apartment_number)
      );
      const apartmentSnapshot = await getDocs(apartmentQuery);

      if (!apartmentSnapshot.empty) {
        throw new Error("Bu daire numarası zaten bir kullanıcıya atanmış");
      }

      const newUserData = {
        phone: cleanedPhone,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        apartment_number: newUser.apartment_number,
        is_renting: newUser.is_renting ? true : false,
        role: "user",
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        last_login: null,
        fee: 100,
      };

      const email = phoneToEmail(cleanedPhone);
      console.log("Firebase Authentication için email:", email);

      try {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          newUser.password
        );
        const firebaseUser = userCredential.user;
        console.log("Firebase Authentication UID:", firebaseUser.uid);

        await setDoc(doc(db, "users", firebaseUser.uid), {
          ...newUserData,
          uid: firebaseUser.uid,
          email: email,
        });

        alert("Kullanıcı başarıyla eklendi");
        fetchUsers();
        setShowAddForm(false);
        setNewUser({
          phone: "",
          first_name: "",
          last_name: "",
          password: "",
          apartment_number: "",
          is_renting: false,
        });
      } catch (authError) {
        console.error("Firebase Authentication hatası:", authError);

        if (authError.code === "auth/email-already-in-use") {
          throw new Error("Bu telefon numarası ile daha önce kayıt yapılmış");
        } else if (authError.code === "auth/invalid-email") {
          throw new Error("Geçersiz telefon numarası formatı");
        } else if (authError.code === "auth/weak-password") {
          throw new Error("Şifre çok zayıf, lütfen daha güçlü bir şifre seçin");
        } else {
          throw new Error(`Authentication hatası: ${authError.message}`);
        }
      }
    } catch (error) {
      console.error("Kullanıcı eklenirken hata:", error);
      alert("Hata: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEdit = (userId) => {
    const userToEdit = users.find((user) => user.id === userId);
    if (userToEdit) {
      setEditingUser({
        id: userToEdit.id,
        first_name: userToEdit.first_name || "",
        last_name: userToEdit.last_name || "",
        phone: userToEdit.phone || "",
        original_phone: userToEdit.phone || "",
        apartment_number: userToEdit.apartment_number || "",
        is_renting: userToEdit.is_renting || false,
        password: "",
        currentPassword: "",
        changePassword: false,
        changePhone: false,
      });
      setShowEditForm(true);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      const updates = {
        first_name: editingUser.first_name,
        last_name: editingUser.last_name,
        apartment_number: editingUser.apartment_number,
        is_renting: editingUser.is_renting,
        updated_at: Timestamp.now(),
      };

      const userRef = doc(db, "users", editingUser.id);

      if (
        editingUser.changePhone &&
        editingUser.phone !== editingUser.original_phone
      ) {
        const cleanedPhone = cleanPhoneNumber(editingUser.phone);

        if (!cleanedPhone) {
          throw new Error(
            "Geçerli bir telefon numarası girin (Örn: 5XX XXX XX XX)"
          );
        }

        const usersRef = collection(db, "users");
        const phoneQuery = query(usersRef, where("phone", "==", cleanedPhone));
        const phoneSnapshot = await getDocs(phoneQuery);

        if (!phoneSnapshot.empty) {
          const isOwnPhone = phoneSnapshot.docs.some(
            (doc) => doc.id === editingUser.id
          );
          if (!isOwnPhone) {
            throw new Error(
              "Bu telefon numarası başka bir kullanıcı tarafından kullanılıyor"
            );
          }
        }

        if (!editingUser.currentPassword) {
          throw new Error(
            "Telefon numarasını değiştirmek için mevcut şifrenizi girmelisiniz"
          );
        }

        try {
          const updateUserEmail = httpsCallable(functions, "updateUserEmail");
          const result = await updateUserEmail({
            userId: editingUser.id,
            newPhone: cleanedPhone,
            currentPassword: editingUser.currentPassword,
          });

          if (result.data.success) {
            updates.phone = cleanedPhone;
            updates.email = phoneToEmail(cleanedPhone);
            console.log("Telefon numarası değiştirildi:", cleanedPhone);
          } else {
            throw new Error(
              result.data.error || "Telefon numarası değiştirilemedi"
            );
          }
        } catch (error) {
          console.error("Telefon değiştirme hatası:", error);
          throw new Error(
            "Telefon değiştirme işlemi başarısız: " + error.message
          );
        }
      }

      if (
        editingUser.changePassword &&
        editingUser.password &&
        editingUser.currentPassword
      ) {
        if (editingUser.password.length < 6) {
          throw new Error("Yeni şifre en az 6 karakter olmalıdır");
        }

        try {
          const updateUserPassword = httpsCallable(
            functions,
            "updateUserPassword"
          );
          const result = await updateUserPassword({
            userId: editingUser.id,
            newPassword: editingUser.password,
            currentPassword: editingUser.currentPassword,
          });

          if (!result.data.success) {
            throw new Error(result.data.error || "Şifre değiştirme başarısız");
          }

          console.log("Şifre başarıyla değiştirildi");
        } catch (error) {
          console.error("Şifre değiştirme hatası:", error);
          throw new Error(
            "Şifre değiştirme işlemi başarısız: " + error.message
          );
        }
      }

      await updateDoc(userRef, updates);

      alert("Kullanıcı bilgileri başarıyla güncellendi!");
      fetchUsers();
      setShowEditForm(false);
      setEditingUser(null);
    } catch (error) {
      console.error("Güncelleme hatası:", error);
      alert("Hata: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMakeAdmin = async (userId) => {
    if (
      !window.confirm(
        "Bu kullanıcıyı yönetici yapmak istediğinize emin misiniz? Mevcut yönetici yetkisi kaldırılacaktır."
      )
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      if (currentAdminId) {
        const currentAdminRef = doc(db, "users", currentAdminId);
        await updateDoc(currentAdminRef, {
          role: "user",
          updated_at: Timestamp.now(),
        });
        console.log("Eski yönetici yetkisi kaldırıldı:", currentAdminId);
      }

      const newAdminRef = doc(db, "users", userId);
      await updateDoc(newAdminRef, {
        role: "admin",
        updated_at: Timestamp.now(),
      });
      console.log("Yeni yönetici atandı:", userId);

      try {
        const setAdminRole = httpsCallable(functions, "setAdminRole");
        const result = await setAdminRole({ userId: userId });
        console.log("Admin role sonucu:", result.data);
      } catch (cloudFnError) {
        console.error("Admin rolü ayarlanamadı: ", cloudFnError);
      }

      await fetchUsers();
      alert("Yönetici değişikliği başarıyla yapıldı!");
    } catch (error) {
      console.error("Yönetici yapma hatası:", error);
      alert("Hata: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (
      !window.confirm(
        "Bu kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz!"
      )
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error("Kullanıcı bulunamadı!");
      }

      await deleteDoc(userRef);
      console.log("Firestore kullanıcı kaydı silindi:", userId);

      try {
        const deleteAuthUser = httpsCallable(functions, "deleteAuthUser");
        const result = await deleteAuthUser({ userId: userId });

        if (result.data.success) {
          console.log("Authentication kullanıcısı silindi:", userId);
        } else {
          console.warn(
            "Authentication kullanıcısı silinemedi:",
            result.data.error
          );
        }
      } catch (cloudFnError) {
        console.error("Auth kullanıcısı silme hatası:", cloudFnError);
      }

      setUsers(users.filter((user) => user.id !== userId));
      alert("Kullanıcı başarıyla silindi!");
    } catch (error) {
      console.error("Kullanıcı silme hatası:", error);
      alert("Hata: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="admin-users-container">
        <div className="loading">Yükleniyor...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-users-container">
        <div className="error">Hata: {error}</div>
      </div>
    );
  }

  return (
    <div className="admin-users-container">
      <h1 className="admin-users-title">Kullanıcı Yönetimi</h1>

      <div className="search-add-container">
        <div className="search-box">
          <FiSearch className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Kullanıcı ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button
          className="add-user-btn"
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={isProcessing}
        >
          <FiUserPlus />
          <span>Yeni Kullanıcı</span>
        </button>
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

      {showAddForm && (
        <div className="add-user-form-container">
          <form onSubmit={handleAddUser} className="add-user-form">
            <div className="form-group">
              <label>Telefon</label>
              <input
                type="tel"
                name="phone"
                placeholder="5XX XXX XX XX"
                value={newUser.phone}
                onChange={(e) =>
                  setNewUser({ ...newUser, phone: e.target.value })
                }
                required
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label>Ad</label>
              <input
                type="text"
                name="firstName"
                placeholder="Kullanıcının adı"
                value={newUser.first_name}
                onChange={(e) =>
                  setNewUser({ ...newUser, first_name: e.target.value })
                }
                required
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label>Soyad</label>
              <input
                type="text"
                name="lastName"
                placeholder="Kullanıcının soyadı"
                value={newUser.last_name}
                onChange={(e) =>
                  setNewUser({ ...newUser, last_name: e.target.value })
                }
                required
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label>Daire No</label>
              <input
                type="text"
                name="apartmentNumber"
                placeholder="Daire numarası"
                value={newUser.apartment_number}
                onChange={(e) =>
                  setNewUser({ ...newUser, apartment_number: e.target.value })
                }
                required
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label>Şifre</label>
              <input
                type="password"
                name="password"
                placeholder="Şifre (en az 6 karakter)"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
                required
                disabled={isProcessing}
                minLength={6}
              />
            </div>

            <div className="checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="isRenting"
                  checked={newUser.is_renting}
                  onChange={(e) =>
                    setNewUser({ ...newUser, is_renting: e.target.checked })
                  }
                  disabled={isProcessing}
                />
                Kiracı
              </label>
            </div>

            <div className="form-buttons">
              <button
                type="submit"
                className="submit-btn"
                disabled={isProcessing}
              >
                {isProcessing ? "İşleniyor..." : "Kullanıcı Ekle"}
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setShowAddForm(false)}
                disabled={isProcessing}
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {showEditForm && editingUser && (
        <div className="edit-user-form-container">
          <form onSubmit={handleUpdate} className="edit-user-form">
            <div className="form-group">
              <label>Ad</label>
              <input
                type="text"
                value={editingUser.first_name}
                onChange={(e) =>
                  setEditingUser({ ...editingUser, first_name: e.target.value })
                }
                required
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label>Soyad</label>
              <input
                type="text"
                value={editingUser.last_name}
                onChange={(e) =>
                  setEditingUser({ ...editingUser, last_name: e.target.value })
                }
                required
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label>Daire No</label>
              <input
                type="text"
                value={editingUser.apartment_number}
                onChange={(e) =>
                  setEditingUser({
                    ...editingUser,
                    apartment_number: e.target.value,
                  })
                }
                required
                disabled={isProcessing}
              />
            </div>

            <div className="checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={editingUser.is_renting}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      is_renting: e.target.checked,
                    })
                  }
                  disabled={isProcessing}
                />
                Kiracı
              </label>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={editingUser.changePhone}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      changePhone: e.target.checked,
                    })
                  }
                  disabled={isProcessing}
                />
                Telefon Numarası Değiştir
              </label>
            </div>

            {editingUser.changePhone && (
              <div className="form-group">
                <label>Yeni Telefon</label>
                <input
                  type="tel"
                  value={editingUser.phone}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, phone: e.target.value })
                  }
                  placeholder="5XX XXX XX XX"
                  required={editingUser.changePhone}
                  disabled={isProcessing}
                />
                <small className="form-info">
                  <FiInfo /> Telefon değiştirmek, giriş bilgilerini de
                  değiştirir
                </small>
              </div>
            )}

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={editingUser.changePassword}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      changePassword: e.target.checked,
                    })
                  }
                  disabled={isProcessing}
                />
                Şifre Değiştir
              </label>
            </div>

            {(editingUser.changePassword || editingUser.changePhone) && (
              <div className="form-group">
                <label>Mevcut Şifre</label>
                <input
                  type="password"
                  placeholder="Mevcut şifrenizi girin"
                  value={editingUser.currentPassword || ""}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      currentPassword: e.target.value,
                    })
                  }
                  required={
                    editingUser.changePassword || editingUser.changePhone
                  }
                  disabled={isProcessing}
                />
                <small className="form-info">
                  <FiAlertCircle /> Güvenlik nedeniyle gereklidir
                </small>
              </div>
            )}

            {editingUser.changePassword && (
              <div className="form-group">
                <label>Yeni Şifre</label>
                <input
                  type="password"
                  placeholder="Yeni şifre (en az 6 karakter)"
                  value={editingUser.password || ""}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, password: e.target.value })
                  }
                  required={editingUser.changePassword}
                  disabled={isProcessing}
                  minLength={6}
                />
              </div>
            )}

            <div className="form-buttons">
              <button
                type="submit"
                className="submit-btn"
                disabled={isProcessing}
              >
                {isProcessing ? "İşleniyor..." : "Güncelle"}
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setShowEditForm(false);
                  setEditingUser(null);
                }}
                disabled={isProcessing}
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Daire No</th>
              <th>Ad Soyad</th>
              <th>Telefon</th>
              <th>Durum</th>
              <th>Son Giriş</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-data">
                  {searchTerm
                    ? "Aranan kriterlere uygun kullanıcı bulunamadı."
                    : "Henüz kullanıcı eklenmemiş."}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.apartment_number}</td>
                  <td>{`${user.first_name} ${user.last_name}`}</td>
                  <td>{user.phone}</td>
                  <td>
                    <span
                      className={`status ${
                        user.role === "admin"
                          ? "admin"
                          : user.is_renting
                          ? "renting"
                          : "owner"
                      }`}
                    >
                      {user.role === "admin"
                        ? "Yönetici"
                        : user.is_renting
                        ? "Kiracı"
                        : "Kat Maliki"}
                    </span>

                    {user.role === "admin" && (
                      <div
                        className={`user-subtype ${
                          user.is_renting ? "renting" : "owner"
                        }`}
                      >
                        {user.is_renting ? "Kiracı" : "Kat Maliki"}
                      </div>
                    )}
                  </td>
                  <td>{user.last_login ? formatDate(user.last_login) : "-"}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="edit-btn"
                        onClick={() => handleEdit(user.id)}
                        onMouseEnter={(e) =>
                          showTooltip(e, "Kullanıcıyı düzenle", "default")
                        }
                        onMouseLeave={hideTooltip}
                        aria-label="Düzenle"
                        disabled={isProcessing}
                      >
                        <FiEdit aria-hidden="true" />
                      </button>
                      {user.role !== "admin" && (
                        <>
                          <button
                            className="make-admin-btn"
                            onClick={() => handleMakeAdmin(user.id)}
                            onMouseEnter={(e) =>
                              showTooltip(e, "Yönetici yap", "admin")
                            }
                            onMouseLeave={hideTooltip}
                            aria-label="Yönetici Yap"
                            disabled={isProcessing}
                          >
                            <FiShield aria-hidden="true" />
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleDeleteUser(user.id)}
                            onMouseEnter={(e) =>
                              showTooltip(e, "Kullanıcıyı sil", "default")
                            }
                            onMouseLeave={hideTooltip}
                            aria-label="Sil"
                            disabled={isProcessing}
                          >
                            <FiTrash2 aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminUsers;
