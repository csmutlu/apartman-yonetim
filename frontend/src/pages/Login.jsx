import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { FiSun, FiMoon, FiEye, FiEyeOff } from "react-icons/fi";
import "./Login.css";

import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { UserContext } from "../contexts/UserContext";

const Login = ({ onThemeChange, theme }) => {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();

  const cleanPhoneNumber = (phoneNumber) => {
    let cleanedPhone = phoneNumber.replace(/\s+/g, "").replace(/[()-]/g, "");

    if (cleanedPhone.startsWith("+90")) {
      cleanedPhone = cleanedPhone.substring(3);
    } else if (cleanedPhone.startsWith("0")) {
      cleanedPhone = cleanedPhone.substring(1);
    }
    return cleanedPhone.length === 10 ? cleanedPhone : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const cleanedPhone = cleanPhoneNumber(phone);

    if (!cleanedPhone) {
      setError(
        "Lütfen geçerli bir telefon numarası girin (Örn: 5XX XXX XX XX)."
      );
      setLoading(false);
      return;
    }

    try {
      const email = `${cleanedPhone}@apartman-yonetim.com`;
      console.log("Firebase Auth için oluşturulan email:", email);

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const firebaseUser = userCredential.user;
      console.log("Firebase Authentication başarılı, UID:", firebaseUser.uid);

      try {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();

          const appUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            phone: cleanedPhone,
            first_name: userData.first_name || "",
            last_name: userData.last_name || "",
            role: userData.role || "user",
            apartment_number: userData.apartment_number || "",
          };

          console.log(
            "Firestore verisi alındı, Context güncelleniyor:",
            appUser
          );

          setUser(appUser);
          localStorage.setItem("user", JSON.stringify(appUser));

          const token = await firebaseUser.getIdToken();
          localStorage.setItem("token", token);

          if (appUser.role === "admin") {
            navigate("/admin/home", { replace: true });
          } else {
            navigate("/user/home", { replace: true });
          }
        } else {
          console.warn(
            "Kullanıcı Firestore'da bulunamadı! UID:",
            firebaseUser.uid
          );
          setError("Kullanıcı doğrulanmış olsa da, ek bilgiler bulunamadı.");

          auth.signOut();
          setUser(null);
          localStorage.clear();
        }
      } catch (firestoreError) {
        console.error(
          "Firestore'dan kullanıcı verisi alınırken hata:",
          firestoreError
        );
        setError("Kullanıcı bilgileri yüklenirken bir sorun oluştu.");
        auth.signOut();
        setUser(null);
        localStorage.clear();
      }
    } catch (authError) {
      console.error(
        "Firebase Authentication hatası:",
        authError.code,
        authError.message
      );

      if (
        authError.code === "auth/invalid-credential" ||
        authError.code === "auth/user-not-found" ||
        authError.code === "auth/wrong-password"
      ) {
        setError(
          "Telefon numarası veya şifre hatalı. Lütfen bilgilerinizi kontrol edin."
        );
      } else if (authError.code === "auth/too-many-requests") {
        setError(
          "Çok fazla başarısız giriş denemesi yaptınız. Lütfen birkaç dakika bekleyip tekrar deneyin."
        );
      } else if (authError.code === "auth/invalid-email") {
        setError("Telefon numarası formatı geçersiz. Örnek: 5XX XXX XX XX");
      } else if (authError.code === "auth/network-request-failed") {
        setError(
          "İnternet bağlantısı sorunu. Lütfen bağlantınızı kontrol edip tekrar deneyin."
        );
      } else {
        setError(`Giriş yapılırken bir hata oluştu: ${authError.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const LoadingOverlay = () => (
    <div className="loading-overlay">
      <div className="loading-spinner"></div>
      <p>Giriş yapılıyor...</p>
    </div>
  );

  return (
    <div className="login-container">
      {loading && <LoadingOverlay />}

      <div className="login-content">
        <div className="login-box">
          <div className="login-header">
            <h1>Apartman Yönetim Sistemi</h1>
            <p>Devam etmek için lütfen giriş yapın</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            {" "}
            <div className="input-group">
              <label htmlFor="phone">Telefon Numarası</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5XX XXX XX XX"
                required
                disabled={loading}
              />
            </div>
            <div className="input-group">
              <label htmlFor="password">Şifre</label>
              <div className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  title={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  disabled={loading}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="login-button"
              disabled={loading || !phone || !password}
            >
              {loading ? "Giriş Yapılıyor..." : "Giriş Yap"}
            </button>
          </form>
        </div>
      </div>

      <button
        type="button"
        className="theme-toggle-login"
        onClick={onThemeChange}
        aria-label="Tema değiştir"
        title="Tema değiştir"
      >
        {theme === "dark" ? <FiSun /> : <FiMoon />}
      </button>
    </div>
  );
};

export default Login;
