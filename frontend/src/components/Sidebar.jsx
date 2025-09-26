import React, { useState, useEffect, useRef, useContext } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserContext } from "../contexts/UserContext";
import "./Sidebar.css";

const Sidebar = ({ role, onThemeChange, theme }) => {
  const { user, setUser, logout } = useContext(UserContext);
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const sidebarRef = useRef(null);

  const toggleTheme = () => {
    onThemeChange();
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) setIsOpen(false);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogout = async () => {
    console.log("Sidebar: Logout button clicked.");
    try {
      await logout();
      console.log("Sidebar: Logout successful via context.");

      navigate("/login");
    } catch (error) {
      console.error("Sidebar: Çıkış hatası:", error);

      alert("Çıkış yaparken bir sorun oluştu. Lütfen tekrar deneyin.");

      localStorage.removeItem("user");
      localStorage.removeItem("token");
      sessionStorage.clear();
    }
  };

  const handleDragStart = (e) => {
    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    setIsDragging(true);
    setStartX(clientX);
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();

    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    const deltaX = clientX - startX;

    if (isOpen && deltaX < -50) {
      setIsOpen(false);
      setIsDragging(false);
    } else if (!isOpen && deltaX > 50) {
      setIsOpen(true);
      setIsDragging(false);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleHandleClick = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) {
      const handleGlobalDragStart = (e) => {
        const clientX = e.type.includes("touch")
          ? e.touches[0].clientX
          : e.clientX;
        if (clientX < 30) {
          setIsDragging(true);
          setStartX(clientX);
          e.preventDefault();
        }
      };

      const handleGlobalDragMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const clientX = e.type.includes("touch")
          ? e.touches[0].clientX
          : e.clientX;
        const deltaX = clientX - startX;

        if (deltaX > 50) {
          setIsOpen(true);
          setIsDragging(false);
        }
      };

      const handleGlobalDragEnd = () => {
        setIsDragging(false);
      };

      document.addEventListener("mousedown", handleGlobalDragStart);
      document.addEventListener("mousemove", handleGlobalDragMove);
      document.addEventListener("mouseup", handleGlobalDragEnd);
      document.addEventListener("touchstart", handleGlobalDragStart, {
        passive: false,
      });
      document.addEventListener("touchmove", handleGlobalDragMove, {
        passive: false,
      });
      document.addEventListener("touchend", handleGlobalDragEnd);

      return () => {
        document.removeEventListener("mousedown", handleGlobalDragStart);
        document.removeEventListener("mousemove", handleGlobalDragMove);
        document.removeEventListener("mouseup", handleGlobalDragEnd);
        document.removeEventListener("touchstart", handleGlobalDragStart);
        document.removeEventListener("touchmove", handleGlobalDragMove);
        document.removeEventListener("touchend", handleGlobalDragEnd);
      };
    }
  }, [isOpen, isDragging, startX]);

  return (
    <>
      <div
        ref={sidebarRef}
        className={`sidebar ${isOpen ? "open" : "closed"}`}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
      >
        <div className="sidebar-handle" onClick={handleHandleClick}></div>
        <h2>{role === "admin" ? "Yönetici Paneli" : "Kullanıcı Paneli"}</h2>
        <nav className="menu-items">
          <ul>
            {role === "admin" ? (
              <>
                <li>
                  <NavLink to="/admin/home">Ana Sayfa</NavLink>
                </li>
                <li>
                  <NavLink to="/admin/users">Kullanıcılar</NavLink>
                </li>
                <li>
                  <NavLink to="/admin/payment-requests">
                    Ödeme İşlemleri
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/admin/payments">Ödeme Geçmişi</NavLink>
                </li>
                <li>
                  <NavLink to="/admin/reports">Raporlar</NavLink>
                </li>
                <li>
                  <NavLink to="/admin/announcements">Duyurular</NavLink>
                </li>
                <li>
                  <NavLink to="/admin/expenses">Giderler</NavLink>
                </li>
                <li>
                  <NavLink to="/admin/issues">Arıza Yönetimi</NavLink>
                </li>
              </>
            ) : (
              <>
                <li>
                  <NavLink to="/user/home">Ana Sayfa</NavLink>
                </li>
                <li>
                  <NavLink to="/user/payments">Ödemelerim</NavLink>
                </li>
                <li>
                  <NavLink to="/user/announcements">Duyurular</NavLink>
                </li>
                <li>
                  <NavLink to="/user/expenses">Giderler</NavLink>
                </li>
                <li>
                  <NavLink to="/user/issues">Arıza Bildirimi</NavLink>
                </li>
              </>
            )}
          </ul>
        </nav>
        <div className="bottom-buttons">
          <div className="theme-switch-wrapper">
            <label className="theme-switch">
              <input
                type="checkbox"
                checked={theme === "dark"}
                onChange={toggleTheme}
              />
              <div className="slider">
                <div className="slider-circle">
                  {theme === "dark" ? "🌙" : "☀️"}
                </div>
              </div>
            </label>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            Çıkış Yap
          </button>
        </div>
      </div>
      {isOpen && window.innerWidth <= 768 && (
        <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />
      )}
    </>
  );
};

export default Sidebar;
