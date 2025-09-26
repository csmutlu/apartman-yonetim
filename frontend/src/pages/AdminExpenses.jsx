import React, { useState, useEffect, useContext } from "react";
import "./AdminExpenses.css";
import {
  FaTable,
  FaChartBar,
  FaRegCalendarAlt,
  FaChartLine,
  FaFilter,
  FaPlus,
  FaFileInvoice,
  FaPaperclip,
  FaReceipt,
  FaAlignLeft,
  FaMoneyBillWave,
  FaHashtag,
  FaCalendarAlt,
  FaTimes,
  FaEdit,
  FaTrash,
  FaDownload,
  FaCheck,
} from "react-icons/fa";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { UserContext } from "../contexts/UserContext";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { db, storage } from "../firebase";
import { getStorage, ref as storageRef, getBlob } from "firebase/storage";

const MONTHS_FULL = [
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
const MONTHS_SHORT = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];
const MAX_FILE_SIZE_MB = 5;
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const NUM_YEARS_TO_SHOW = 10;
const CHART_COLORS = {
  primary: "#3498db",
  secondary: "#2980b9",
  third: "#1abc9c",
  fourth: "#16a085",
};

const AdminExpenses = () => {
  const { user } = useContext(UserContext);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: NUM_YEARS_TO_SHOW },
    (_, i) => currentYear - i
  );

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    type: "",
    description: "",
    amount: "",
    invoice_number: "",
    expense_date: new Date().toISOString().split("T")[0],
    attachment: null,
  });
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [filters, setFilters] = useState({
    year: currentYear,
    month: new Date().getMonth() + 1,
  });
  const [viewMode, setViewMode] = useState("table");
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(null);
  const [chartType, setChartType] = useState("yearly");
  const [chartFilters, setChartFilters] = useState({
    year: currentYear,
    compareYear: currentYear - 1,
  });
  const [editingExpense, setEditingExpense] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [currentDocumentUrl, setCurrentDocumentUrl] = useState(null);
  const [urlCleanupFunction, setUrlCleanupFunction] = useState(null);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const expensesRef = collection(db, "expenses");
      let constraints = [];

      if (filters.year) {
        const yearNum = parseInt(filters.year, 10);
        const startOfYear = new Date(yearNum, 0, 1);
        const endOfYear = new Date(yearNum, 11, 31, 23, 59, 59);
        constraints.push(
          where("expense_date", ">=", Timestamp.fromDate(startOfYear))
        );
        constraints.push(
          where("expense_date", "<=", Timestamp.fromDate(endOfYear))
        );
      }

      const baseQuery =
        constraints.length > 0
          ? query(expensesRef, ...constraints, orderBy("expense_date", "desc"))
          : query(expensesRef, orderBy("expense_date", "desc"));

      const querySnapshot = await getDocs(baseQuery);
      let expensesList = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const expenseDate = data.expense_date?.toDate();

        if (!expenseDate) return;

        if (filters.month && filters.month !== "") {
          const expenseMonth = expenseDate.getMonth() + 1;
          if (expenseMonth !== parseInt(filters.month, 10)) {
            return;
          }
        }

        expensesList.push({
          id: doc.id,
          ...data,
          expense_date: expenseDate,
          amount: parseFloat(data.amount) || 0,
        });
      });

      setExpenses(expensesList);
      setError("");
    } catch (error) {
      console.error("Giderler yüklenirken hata:", error);
      setError("Giderler yüklenirken bir hata oluştu: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async () => {
    setChartLoading(true);
    setChartError(null);
    try {
      if (chartType === "yearly") {
        await fetchYearlyData(chartFilters.year);
      } else if (chartType === "monthly") {
        await fetchMonthlyTrend();
      } else if (chartType === "compare") {
        if (chartFilters.year === chartFilters.compareYear) {
          throw new Error("Karşılaştırma için farklı yıllar seçmelisiniz.");
        }
        await fetchComparisonData(chartFilters.year, chartFilters.compareYear);
      }
    } catch (error) {
      console.error("Grafik verileri yüklenirken hata:", error);
      setChartError(
        "Grafik verileri yüklenirken bir hata oluştu: " + error.message
      );
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  };

  const fetchDataForYear = async (year) => {
    const yearNum = parseInt(year, 10);
    const startOfYear = new Date(yearNum, 0, 1);
    const endOfYear = new Date(yearNum, 11, 31, 23, 59, 59);
    const expensesRef = collection(db, "expenses");
    const q = query(
      expensesRef,
      where("expense_date", ">=", Timestamp.fromDate(startOfYear)),
      where("expense_date", "<=", Timestamp.fromDate(endOfYear)),
      orderBy("expense_date")
    );
    const querySnapshot = await getDocs(q);
    let data = [];
    querySnapshot.forEach((doc) => {
      const expense = doc.data();
      const expenseDate = expense.expense_date?.toDate();
      if (expenseDate) {
        data.push({
          id: doc.id,
          ...expense,
          expense_date: expenseDate,
          amount: parseFloat(expense.amount) || 0,
        });
      }
    });
    return data;
  };

  const fetchYearlyData = async (year) => {
    const data = await fetchDataForYear(year);
    const monthlyData = prepareMonthlyData(data);
    setChartData(monthlyData);
  };

  const fetchMonthlyTrend = async () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 11);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const expensesRef = collection(db, "expenses");
    const q = query(
      expensesRef,
      where("expense_date", ">=", Timestamp.fromDate(startDate)),
      where("expense_date", "<=", Timestamp.fromDate(endDate)),
      orderBy("expense_date")
    );
    const querySnapshot = await getDocs(q);
    let data = [];
    querySnapshot.forEach((doc) => {
      const expense = doc.data();
      const expenseDate = expense.expense_date?.toDate();
      if (expenseDate) {
        data.push({
          id: doc.id,
          ...expense,
          expense_date: expenseDate,
          amount: parseFloat(expense.amount) || 0,
        });
      }
    });
    const trendData = prepareTrendData(data, startDate, endDate);
    setChartData(trendData);
  };

  const fetchComparisonData = async (year1, year2) => {
    const [year1Data, year2Data] = await Promise.all([
      fetchDataForYear(year1),
      fetchDataForYear(year2),
    ]);
    const comparisonData = prepareComparisonData(
      year1Data,
      year2Data,
      year1,
      year2
    );
    setChartData(comparisonData);
  };

  const prepareMonthlyData = (data) => {
    const monthlyData = Array(12)
      .fill()
      .map((_, idx) => ({
        month: MONTHS_SHORT[idx],
        monthName: MONTHS_FULL[idx],
        total: 0,
        expenseCount: 0,
      }));
    data.forEach((expense) => {
      const expenseMonth = expense.expense_date.getMonth();
      if (monthlyData[expenseMonth]) {
        monthlyData[expenseMonth].total += expense.amount;
        monthlyData[expenseMonth].expenseCount += 1;
      }
    });
    return monthlyData;
  };

  const prepareTrendData = (data, startDate, endDate) => {
    const monthsData = [];
    let currentDate = new Date(startDate);
    let loopEndDate = new Date(endDate);
    loopEndDate.setMonth(loopEndDate.getMonth() + 1);
    loopEndDate.setDate(1);
    loopEndDate.setHours(0, 0, 0, 0);

    while (currentDate < loopEndDate) {
      const monthIndex = currentDate.getMonth();
      monthsData.push({
        month: MONTHS_SHORT[monthIndex],
        monthName: `${MONTHS_FULL[monthIndex]} ${currentDate.getFullYear()}`,
        monthKey: `${currentDate.getFullYear()}-${(monthIndex + 1)
          .toString()
          .padStart(2, "0")}`,
        year: currentDate.getFullYear(),
        monthIndex: monthIndex,
        total: 0,
        expenseCount: 0,
      });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    data.forEach((expense) => {
      const expenseDate = expense.expense_date;
      const expenseMonthKey = `${expenseDate.getFullYear()}-${(
        expenseDate.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}`;
      const monthData = monthsData.find((m) => m.monthKey === expenseMonthKey);
      if (monthData) {
        monthData.total += expense.amount;
        monthData.expenseCount += 1;
      }
    });

    return monthsData.slice(-12);
  };

  const prepareComparisonData = (year1Data, year2Data, year1, year2) => {
    const year1Monthly = prepareMonthlyData(year1Data);
    const year2Monthly = prepareMonthlyData(year2Data);
    return year1Monthly.map((monthData, index) => ({
      month: monthData.month,
      monthName: monthData.monthName,
      [`${year1}`]: monthData.total,
      [`${year2}`]: year2Monthly[index]?.total || 0,
    }));
  };

  useEffect(() => {
    fetchExpenses();
  }, [filters]);

  useEffect(() => {
    if (viewMode === "chart") {
      fetchChartData();
    }
  }, [viewMode, chartType, chartFilters]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormError("");

    if (file) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setFormError(`Dosya boyutu ${MAX_FILE_SIZE_MB}MB'dan büyük olamaz.`);
        setFormData((prev) => ({ ...prev, attachment: null }));
        e.target.value = null;
        return;
      }
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        setFormError(
          `Sadece ${ALLOWED_FILE_TYPES.map((t) =>
            t.split("/")[1].toUpperCase()
          ).join(", ")} dosyaları kabul edilir.`
        );
        setFormData((prev) => ({ ...prev, attachment: null }));
        e.target.value = null;
        return;
      }
      setFormData((prev) => ({ ...prev, attachment: file }));
    } else {
      setFormData((prev) => ({ ...prev, attachment: null }));
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleChartFilterChange = (e) => {
    const { name, value } = e.target;
    setChartFilters((prev) => ({
      ...prev,
      [name]:
        name === "year" || name === "compareYear" ? parseInt(value, 10) : value,
    }));
  };

  const handleChartTypeChange = (type) => {
    setChartType(type);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
  };

  const uploadFile = async (file) => {
    const uniqueId =
      Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

    const timestamp = Date.now();
    const fileExtension = file.name.split(".").pop().toLowerCase();

    const safeFileName = `file_${timestamp}_${uniqueId}.${fileExtension}`;
    const storagePath = `secure_expenses/${safeFileName}`;

    const storageRef = ref(storage, storagePath);

    try {
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error("Firebase Storage Yükleme Hatası:", error);
      throw new Error("Dosya yüklenirken bir hata oluştu: " + error.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError("");
    setError("");

    let attachmentURL = null;

    try {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Lütfen geçerli bir tutar girin (0'dan büyük).");
      }
      if (!formData.type.trim()) {
        throw new Error("Gider türü boş olamaz.");
      }
      if (!formData.description.trim()) {
        throw new Error("Açıklama boş olamaz.");
      }
      const expenseDate = new Date(formData.expense_date);
      if (isNaN(expenseDate.getTime())) {
        throw new Error("Lütfen geçerli bir gider tarihi seçin.");
      }
      if (expenseDate > new Date()) {
        throw new Error("Gider tarihi gelecek bir tarih olamaz.");
      }

      if (formData.attachment) {
        attachmentURL = await uploadFile(formData.attachment);
      }

      const expenseData = {
        type: formData.type.trim(),
        description: formData.description.trim(),
        amount: amount,
        invoice_number: formData.invoice_number?.trim() || null,
        expense_date: Timestamp.fromDate(expenseDate),
        updated_at: Timestamp.now(),
      };

      if (attachmentURL) {
        expenseData.attachment_url = attachmentURL;
      }

      if (isEditMode && editingExpense) {
        await updateDoc(doc(db, "expenses", editingExpense.id), expenseData);
        alert("Gider başarıyla güncellendi!");
      } else {
        expenseData.created_at = Timestamp.now();
        expenseData.created_by = user?.uid || null;
        expenseData.created_by_email = user?.email || null;

        if (!attachmentURL && !isEditMode) {
          expenseData.attachment_url = null;
        }

        await addDoc(collection(db, "expenses"), expenseData);
        alert("Gider başarıyla eklendi!");
      }

      setFormData({
        type: "",
        description: "",
        amount: "",
        invoice_number: "",
        expense_date: new Date().toISOString().split("T")[0],
        attachment: null,
      });

      const fileInput = document.getElementById("attachment");
      if (fileInput) fileInput.value = null;

      setShowModal(false);
      setIsEditMode(false);
      setEditingExpense(null);

      fetchExpenses();
      if (viewMode === "chart") {
        fetchChartData();
      }
    } catch (error) {
      console.error("Gider işlemi hatası:", error);
      setFormError("İşlem sırasında bir hata oluştu: " + error.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditClick = (expense) => {
    setEditingExpense(expense);
    setFormData({
      type: expense.type,
      description: expense.description,
      amount: expense.amount.toString(),
      invoice_number: expense.invoice_number || "",
      expense_date: expense.expense_date.toISOString().split("T")[0],
      attachment: null,
    });
    setIsEditMode(true);
    setShowModal(true);
  };

  const handleDeleteClick = (expenseId) => {
    setDeletingExpenseId(expenseId);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, "expenses", deletingExpenseId));
      alert("Gider başarıyla silindi!");
      fetchExpenses();
      if (viewMode === "chart") {
        fetchChartData();
      }
      setIsDeleteModalOpen(false);
    } catch (error) {
      console.error("Gider silme hatası:", error);
      setError("Gider silinirken bir hata oluştu: " + error.message);
    }
  };

  const openDocumentInModal = async (url) => {
    try {
      setLoading(true);

      const response = await fetch(url);
      const blob = await response.blob();

      const isImage = blob.type.startsWith("image/");
      const isPdf = blob.type === "application/pdf";

      const secureUrl = URL.createObjectURL(blob);

      setCurrentDocumentUrl({
        url: secureUrl,
        type: blob.type,
        isImage,
        isPdf,
      });
      setIsDocumentModalOpen(true);

      const cleanupUrl = () => {
        URL.revokeObjectURL(secureUrl);
      };

      setUrlCleanupFunction(() => cleanupUrl);
    } catch (error) {
      console.error("Belge gösterme hatası:", error);
      alert("Belge görüntülenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const closeDocumentModal = () => {
    if (urlCleanupFunction) {
      urlCleanupFunction();
      setUrlCleanupFunction(null);
    }
    setIsDocumentModalOpen(false);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const YearlyTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="tooltip-label">{`${data.monthName} Ayı`}</p>
          <p className="tooltip-total">{`Toplam: ${formatCurrency(
            data.total
          )}`}</p>
          <p
            style={{ color: "#8884d8", marginTop: "5px" }}
          >{`İşlem: ${data.expenseCount}`}</p>
        </div>
      );
    }
    return null;
  };

  const ComparisonTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length >= 2) {
      const dataPoint = payload[0].payload;
      const year1 = chartFilters.year;
      const year2 = chartFilters.compareYear;
      const payloadYear1 = payload.find((p) => p.dataKey == year1);
      const payloadYear2 = payload.find((p) => p.dataKey == year2);
      const value1 = payloadYear1?.value || 0;
      const value2 = payloadYear2?.value || 0;

      return (
        <div className="chart-tooltip">
          <p className="tooltip-label">{`${dataPoint.monthName} Ayı`}</p>
          {payloadYear1 && (
            <div className="tooltip-year">
              <span
                className="tooltip-year-label"
                style={{ color: payloadYear1.color || "#ff5722" }}
              >
                {year1}:
              </span>
              <span className="tooltip-year-value">
                {formatCurrency(value1)}
              </span>
            </div>
          )}
          {payloadYear2 && (
            <div className="tooltip-year">
              <span
                className="tooltip-year-label"
                style={{ color: payloadYear2.color || "#ff9800" }}
              >
                {year2}:
              </span>
              <span className="tooltip-year-value">
                {formatCurrency(value2)}
              </span>
            </div>
          )}
          <div className="tooltip-difference">
            <span className="tooltip-diff-label">Fark:</span>
            <span
              className={
                value1 < value2 ? "positive" : value1 > value2 ? "negative" : ""
              }
            >
              {formatCurrency(Math.abs(value1 - value2))}
              {value1 < value2 ? " ↓" : value1 > value2 ? " ↑" : ""}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const TrendTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="tooltip-label">{`${data.monthName}`}</p>
          <p className="tooltip-total">{`Toplam: ${formatCurrency(
            data.total
          )}`}</p>
          <p
            style={{ color: "#8884d8", marginTop: "5px" }}
          >{`İşlem: ${data.expenseCount}`}</p>
        </div>
      );
    }
    return null;
  };

  const hideUserIdInUrl = (url) => {
    if (!url) return null;

    try {
      return {
        originalUrl: url,
        displayText: "Belge Görüntüle",
      };
    } catch (error) {
      console.error("URL işleme hatası:", error);
      return { originalUrl: url, displayText: "Belge" };
    }
  };

  const handleViewDocument = (e, url) => {
    e.preventDefault();
    if (window.confirm("Belgeyi yeni sekmede açmak istiyor musunuz?")) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const secureDownloadFile = async (url, fileName = "belge") => {
    try {
      const storage = getStorage();
      const fileRef = storageRef(storage, url);

      const blob = await getBlob(fileRef);

      if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(blob, fileName);
      } else {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Dosya indirme hatası:", error);
      alert("Dosya indirilirken bir hata oluştu: " + error.message);
    }
  };

  const downloadDocument = async (url, type = "fatura") => {
    try {
      setLoading(true);

      const generateSecureFileName = (type) => {
        const date = new Date();
        const datePart = `${date.getDate()}-${
          date.getMonth() + 1
        }-${date.getFullYear()}`;
        const randomPart = Math.random().toString(36).substring(2, 8);
        return `${type}_${datePart}_${randomPart}.pdf`;
      };

      const secureFileName = generateSecureFileName(type);

      const response = await fetch(url);
      const blob = await response.blob();

      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = secureFileName;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
      }, 100);
    } catch (error) {
      console.error("Dosya indirme hatası:", error);
      alert("Dosya indirilirken bir hata oluştu: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-expenses">
      <div className="page-header">
        <h2>Gider Yönetimi</h2>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${
              viewMode === "table" ? "active" : ""
            }`}
            onClick={() => handleViewModeChange("table")}
            type="button"
          >
            <FaTable /> Tablo
          </button>
          <button
            className={`view-toggle-btn ${
              viewMode === "chart" ? "active" : ""
            }`}
            onClick={() => handleViewModeChange("chart")}
            type="button"
          >
            <FaChartBar /> Grafik
          </button>
        </div>
        <div className="filter-section">
          {viewMode === "table" && (
            <>
              <select
                name="year"
                value={filters.year}
                onChange={handleFilterChange}
                className="filter-select"
                aria-label="Yıl Filtresi"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <select
                name="month"
                value={filters.month}
                onChange={handleFilterChange}
                className="filter-select"
                aria-label="Ay Filtresi"
              >
                <option value="">Tüm Aylar</option>
                {MONTHS_FULL.map((monthName, i) => (
                  <option key={i + 1} value={i + 1}>
                    {monthName}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            className="add-button"
            onClick={() => {
              setShowModal(true);
              setFormError("");
              setIsEditMode(false);
              setEditingExpense(null);
              setFormData({
                type: "",
                description: "",
                amount: "",
                invoice_number: "",
                expense_date: new Date().toISOString().split("T")[0],
                attachment: null,
              });
            }}
            disabled={loading}
          >
            <FaPlus /> Yeni Gider Ekle
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {viewMode === "table" && (
        <>
          {loading ? (
            <div className="loading">Yükleniyor...</div>
          ) : (
            <div className="table-responsive">
              <table className="expenses-table">
                <thead>
                  <tr>
                    <th>Gider Türü</th>
                    <th>Açıklama</th>
                    <th>Tutar</th>
                    <th>Fatura No</th>
                    <th>Tarih</th>
                    <th>Belge</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.type}</td>
                      <td>{expense.description}</td>
                      <td>{formatCurrency(expense.amount)}</td>
                      <td>{expense.invoice_number || "-"}</td>
                      <td>
                        {expense.expense_date.toLocaleDateString("tr-TR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </td>
                      <td>
                        {expense.attachment_url ? (
                          <div className="document-actions">
                            <button
                              onClick={() =>
                                openDocumentInModal(expense.attachment_url)
                              }
                              className="document-link"
                            >
                              <FaPaperclip /> Görüntüle
                            </button>
                            <button
                              onClick={() =>
                                downloadDocument(
                                  expense.attachment_url,
                                  expense.type
                                )
                              }
                              className="document-link download"
                            >
                              <FaDownload /> İndir
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="edit-button"
                            onClick={() => handleEditClick(expense)}
                            title="Düzenle"
                            data-tooltip="Düzenle"
                          >
                            <FaEdit />
                          </button>
                          <button
                            className="delete-button"
                            onClick={() => handleDeleteClick(expense.id)}
                            title="Sil"
                            data-tooltip="Sil"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && !loading && (
                    <tr>
                      <td colSpan="7" className="no-data">
                        Gösterilecek gider kaydı bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {viewMode === "chart" && (
        <div className="payment-charts">
          <div className="chart-header">
            <h2>Gider Grafikleri</h2>
            <div className="chart-type-buttons">
              <button
                className={`chart-type-button ${
                  chartType === "yearly" ? "active" : ""
                }`}
                onClick={() => handleChartTypeChange("yearly")}
              >
                <FaChartBar /> Yıllık
              </button>
              <button
                className={`chart-type-button ${
                  chartType === "monthly" ? "active" : ""
                }`}
                onClick={() => handleChartTypeChange("monthly")}
              >
                <FaChartLine /> Aylık Trend
              </button>
              <button
                className={`chart-type-button ${
                  chartType === "compare" ? "active" : ""
                }`}
                onClick={() => handleChartTypeChange("compare")}
              >
                <FaRegCalendarAlt /> Karşılaştır
              </button>
            </div>
          </div>

          <div className="chart-filters">
            {chartType === "yearly" && (
              <div className="filter-row">
                <div className="chart-filter-group">
                  <label htmlFor="chartYearSelect">
                    <FaRegCalendarAlt /> Yıl Seçin
                  </label>
                  <select
                    id="chartYearSelect"
                    name="year"
                    value={chartFilters.year}
                    onChange={handleChartFilterChange}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {chartType === "compare" && (
              <div className="filter-row">
                <div className="chart-filter-group">
                  <label htmlFor="chartYear1Select">
                    <FaRegCalendarAlt /> İlk Yıl
                  </label>
                  <select
                    id="chartYear1Select"
                    name="year"
                    value={chartFilters.year}
                    onChange={handleChartFilterChange}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="chart-filter-group">
                  <label htmlFor="chartYear2Select">
                    <FaRegCalendarAlt /> İkinci Yıl
                  </label>
                  <select
                    id="chartYear2Select"
                    name="compareYear"
                    value={chartFilters.compareYear}
                    onChange={handleChartFilterChange}
                  >
                    {yearOptions
                      .filter((year) => year !== chartFilters.year)
                      .map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div
            className="chart-container"
            style={{ backgroundColor: "var(--card-bg)" }}
          >
            {chartLoading ? (
              <div className="chart-loading">Grafik yükleniyor...</div>
            ) : chartError ? (
              <div className="chart-error">{chartError}</div>
            ) : chartData.length === 0 && !chartLoading ? (
              <div className="chart-no-data">
                Seçili dönem için grafik verisi bulunamadı.
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={400}
                minHeight={300}
                debounce={50}
              >
                {chartType === "yearly" && (
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-color)"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                    />
                    <YAxis
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value)}
                      width={80}
                    />
                    <Tooltip
                      content={<YearlyTooltip />}
                      cursor={{ fill: "rgba(206, 206, 206, 0.2)" }}
                    />
                    <Legend wrapperStyle={{ paddingTop: "20px" }} />
                    <Bar
                      dataKey="total"
                      name="Toplam Harcama"
                      fill={CHART_COLORS.primary}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                )}
                {chartType === "monthly" && (
                  <LineChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-color)"
                    />
                    <XAxis
                      dataKey="monthName"
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                      interval="preserveStartEnd"
                      angle={-10}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value)}
                      width={80}
                    />
                    <Tooltip
                      content={<TrendTooltip />}
                      cursor={{ stroke: CHART_COLORS.third, strokeWidth: 1 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: "20px" }} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Toplam Harcama"
                      stroke={CHART_COLORS.third}
                      strokeWidth={2}
                      dot={{ r: 4, fill: CHART_COLORS.third }}
                      activeDot={{
                        r: 6,
                        strokeWidth: 2,
                        fill: "#fff",
                        stroke: CHART_COLORS.third,
                      }}
                    />
                  </LineChart>
                )}
                {chartType === "compare" && (
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-color)"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                    />
                    <YAxis
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value)}
                      width={80}
                    />
                    <Tooltip
                      content={<ComparisonTooltip />}
                      cursor={{ fill: "rgba(206, 206, 206, 0.2)" }}
                    />
                    <Legend wrapperStyle={{ paddingTop: "20px" }} />
                    <Bar
                      dataKey={`${chartFilters.year}`}
                      name={`${chartFilters.year} Yılı`}
                      fill={CHART_COLORS.primary}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey={`${chartFilters.compareYear}`}
                      name={`${chartFilters.compareYear} Yılı`}
                      fill={CHART_COLORS.third}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
            <div className="chart-info">
              {chartType === "yearly" && (
                <p className="chart-description">
                  {chartFilters.year} yılı aylık gider toplamları.
                </p>
              )}
              {chartType === "monthly" && (
                <p className="chart-description">Son 12 ayın gider trendi.</p>
              )}
              {chartType === "compare" && (
                <p className="chart-description">
                  {chartFilters.year} ve {chartFilters.compareYear} yıllarının
                  aylık karşılaştırması.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal" onClick={() => setShowModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "600px",
              width: "90%",
              padding: "0",
            }}
          >
            <div
              className="modal-header"
              style={{
                padding: "1rem 1.5rem",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  fontSize: "1.25rem",
                }}
              >
                <FaFileInvoice
                  style={{
                    color:
                      document.documentElement.getAttribute("data-theme") ===
                      "dark"
                        ? "#38bdf8"
                        : "#0284c7",
                  }}
                />
                {isEditMode ? "Gider Düzenle" : "Yeni Gider Ekle"}
              </h3>
              <button
                type="button"
                className="close-button"
                onClick={() => {
                  setShowModal(false);
                  setIsEditMode(false);
                  setEditingExpense(null);
                }}
                aria-label="Kapat"
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ padding: "1.5rem" }}>
              {formError && (
                <div
                  className="error-message"
                  style={{
                    margin: "0 0 1rem 0",
                    padding: "0.75rem",
                    borderRadius: "0.5rem",
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                  }}
                >
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="expense-form" noValidate>
                <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                  <label
                    htmlFor="type"
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      fontWeight: "500",
                      color: "var(--text-primary)",
                    }}
                  >
                    <FaReceipt style={{ marginRight: "0.5rem" }} /> Gider Türü*
                  </label>
                  <input
                    type="text"
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    required
                    placeholder="Örn: Elektrik, Su, Kira"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text-primary)",
                      fontSize: "1rem",
                    }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                  <label
                    htmlFor="description"
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      fontWeight: "500",
                      color: "var(--text-primary)",
                    }}
                  >
                    <FaAlignLeft style={{ marginRight: "0.5rem" }} /> Açıklama*
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    required
                    placeholder="Giderle ilgili detaylı açıklama"
                    rows="5"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text-primary)",
                      fontSize: "1rem",
                      resize: "vertical",
                      minHeight: "120px",
                    }}
                  ></textarea>
                </div>

                <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                  <label
                    htmlFor="amount"
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      fontWeight: "500",
                      color: "var(--text-primary)",
                    }}
                  >
                    <FaMoneyBillWave style={{ marginRight: "0.5rem" }} /> Tutar
                    (₺)*
                  </label>
                  <input
                    type="number"
                    id="amount"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text-primary)",
                      fontSize: "1rem",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    flexWrap: "wrap",
                    marginBottom: "1.25rem",
                  }}
                >
                  <div
                    className="form-group"
                    style={{ flex: "1", minWidth: "200px" }}
                  >
                    <label
                      htmlFor="invoice_number"
                      style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        fontWeight: "500",
                        color: "var(--text-primary)",
                      }}
                    >
                      <FaHashtag style={{ marginRight: "0.5rem" }} /> Fatura No
                    </label>
                    <input
                      type="text"
                      id="invoice_number"
                      name="invoice_number"
                      value={formData.invoice_number || ""}
                      onChange={handleChange}
                      placeholder="Opsiyonel"
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        borderRadius: "0.5rem",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "var(--input-bg)",
                        color: "var(--text-primary)",
                        fontSize: "1rem",
                      }}
                    />
                  </div>
                  <div
                    className="form-group"
                    style={{ flex: "1", minWidth: "200px" }}
                  >
                    <label
                      htmlFor="expense_date"
                      style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        fontWeight: "500",
                        color: "var(--text-primary)",
                      }}
                    >
                      <FaCalendarAlt style={{ marginRight: "0.5rem" }} /> Tarih*
                    </label>
                    <input
                      type="date"
                      id="expense_date"
                      name="expense_date"
                      value={formData.expense_date}
                      onChange={handleChange}
                      required
                      max={new Date().toISOString().split("T")[0]}
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        borderRadius: "0.5rem",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "var(--input-bg)",
                        color: "var(--text-primary)",
                        fontSize: "1rem",
                      }}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      fontWeight: "500",
                      color: "var(--text-primary)",
                    }}
                  >
                    <FaFileInvoice style={{ marginRight: "0.5rem" }} /> Fatura /
                    Belge Ekle
                  </label>
                  <div
                    className="file-upload-container"
                    style={{
                      border: "1px dashed var(--border-color)",
                      borderRadius: "0.5rem",
                      padding: "1rem",
                      backgroundColor: "var(--input-bg)",
                      transition: "all 0.3s ease",
                    }}
                  >
                    <input
                      type="file"
                      id="attachment"
                      name="attachment"
                      className="file-input"
                      onChange={handleFileChange}
                      accept={ALLOWED_FILE_TYPES.join(",")}
                      style={{ display: "none" }}
                    />
                    <div
                      className="file-info"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        document.getElementById("attachment").click()
                      }
                    >
                      <FaPaperclip
                        style={{
                          marginRight: "12px",
                          color: "var(--primary)",
                          fontSize: "1.25rem",
                        }}
                      />
                      {formData.attachment ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                          }}
                        >
                          <span>
                            {formData.attachment.name.length > 30
                              ? `${formData.attachment.name.substring(
                                  0,
                                  27
                                )}...`
                              : formData.attachment.name}
                            (
                            {(formData.attachment.size / 1024 / 1024).toFixed(
                              2
                            )}
                            MB)
                          </span>
                          <button
                            type="button"
                            className="remove-file"
                            title="Dosyayı Kaldır"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData({ ...formData, attachment: null });
                              const fileInput =
                                document.getElementById("attachment");
                              if (fileInput) fileInput.value = null;
                              setFormError("");
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-secondary)",
                              cursor: "pointer",
                              fontSize: "1rem",
                              marginLeft: "10px",
                            }}
                          >
                            <FaTimes />
                          </button>
                        </div>
                      ) : (
                        <span
                          className="placeholder"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Dosya seçmek için tıklayın (Max {MAX_FILE_SIZE_MB}MB -
                          PDF, JPG, PNG)
                        </span>
                      )}
                    </div>
                  </div>
                  {isEditMode &&
                    editingExpense?.attachment_url &&
                    !formData.attachment && (
                      <div
                        style={{
                          marginTop: "0.75rem",
                          fontSize: "0.9rem",
                          color: "var(--text-secondary)",
                          backgroundColor: "var(--primary-light)",
                          padding: "0.75rem",
                          borderRadius: "0.5rem",
                          border: "1px solid var(--primary-lighter)",
                        }}
                      >
                        <p>
                          Mevcut bir belge var. Yeni belge seçerseniz mevcut
                          belge değiştirilecektir.
                        </p>
                        <p style={{ marginTop: "0.5rem" }}>
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              openDocumentInModal(
                                editingExpense.attachment_url
                              );
                            }}
                            style={{
                              color: "var(--primary)",
                              display: "inline-flex",
                              alignItems: "center",
                              fontWeight: "500",
                            }}
                          >
                            <FaPaperclip style={{ marginRight: "0.5rem" }} />
                            Mevcut belgeyi görüntüle
                          </a>
                        </p>
                      </div>
                    )}
                </div>
              </form>
            </div>

            <div
              className="modal-footer"
              style={{
                padding: "1rem 1.5rem",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "flex-end",
                gap: "1rem",
              }}
            >
              <button
                type="button"
                className="cancel-button"
                onClick={() => {
                  setShowModal(false);
                  setIsEditMode(false);
                  setEditingExpense(null);
                }}
                disabled={formSubmitting}
                style={{
                  padding: "0.75rem 1.5rem",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  fontSize: "0.9rem",
                  fontWeight: "500",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                <FaTimes size={16} /> İptal
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                className="submit-button"
                disabled={formSubmitting}
                style={{
                  padding: "0.75rem 1.5rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  backgroundColor: "var(--primary)",
                  color: "white",
                  fontSize: "0.9rem",
                  fontWeight: "500",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                {formSubmitting ? (
                  <span>
                    <span
                      className="loading-spinner"
                      style={{
                        display: "inline-block",
                        width: "16px",
                        height: "16px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderRadius: "50%",
                        borderTopColor: "white",
                        animation: "spin 1s linear infinite",
                        marginRight: "8px",
                      }}
                    ></span>
                    {isEditMode ? "Güncelleniyor..." : "Ekleniyor..."}
                  </span>
                ) : (
                  <>
                    <FaCheck size={16} />
                    {isEditMode ? "Gider Güncelle" : "Gider Ekle"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsDeleteModalOpen(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "400px" }}
          >
            <div className="modal-header">
              <h3>Gider Silme Onayı</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setIsDeleteModalOpen(false)}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: "1rem", textAlign: "center" }}>
              <p>Bu gider kaydını silmek istediğinizden emin misiniz?</p>
              <p
                style={{
                  fontSize: "0.9rem",
                  color: "var(--text-secondary)",
                  marginTop: "0.5rem",
                }}
              >
                Bu işlem geri alınamaz.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setIsDeleteModalOpen(false)}
              >
                İptal
              </button>
              <button
                type="button"
                className="submit-button"
                onClick={confirmDelete}
                style={{ backgroundColor: "#e74c3c" }}
              >
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {isDocumentModalOpen && (
        <div className="document-modal-overlay" onClick={closeDocumentModal}>
          <div
            className="document-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90vw",
              maxHeight: "95vh",
              width: "90vw",
              height: "95vh",
              display: "flex",
              flexDirection: "column",
              margin: "auto",
            }}
          >
            <div
              className="document-modal-header"
              style={{
                padding: "4px 8px",
                height: "30px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--border-color, #ddd)",
                position: "relative",
              }}
            >
              <h3
                style={{
                  fontSize: "14px",
                  margin: 0,
                  fontWeight: "normal",
                  whiteSpace: "nowrap",
                  display: "inline-block",
                  lineHeight: "1",
                }}
              >
                Belge Görüntüleyici
              </h3>
              <button
                className="document-modal-close"
                onClick={closeDocumentModal}
                style={{
                  fontSize: "14px",
                  lineHeight: "1",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 4px",
                  position: "absolute",
                  right: "4px",
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              >
                &times;
              </button>
            </div>

            <div
              className="document-modal-body"
              style={{
                flex: "1 1 auto",
                padding: 0,
                overflow: "hidden",
                height: "calc(95vh - 70px)",
              }}
            >
              {currentDocumentUrl &&
                (currentDocumentUrl.isImage ? (
                  <img
                    src={currentDocumentUrl.url}
                    alt="Belge"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      margin: "0 auto",
                      display: "block",
                    }}
                  />
                ) : currentDocumentUrl.isPdf ? (
                  <object
                    data={currentDocumentUrl.url}
                    type="application/pdf"
                    width="100%"
                    height="100%"
                    className="pdf-viewer"
                    style={{ border: "none" }}
                  >
                    <div className="pdf-fallback">
                      <p>Tarayıcınız PDF görüntülemeyi desteklemiyor.</p>
                      <button
                        onClick={() => downloadDocument(currentDocumentUrl.url)}
                        className="document-download-button"
                      >
                        <FaDownload /> İndir
                      </button>
                    </div>
                  </object>
                ) : (
                  <div className="unsupported-file">
                    <p>Bu dosya formatı tarayıcıda görüntülenemedi.</p>
                    <button
                      onClick={() => downloadDocument(currentDocumentUrl.url)}
                      className="document-download-button"
                    >
                      <FaDownload /> İndir
                    </button>
                  </div>
                ))}
            </div>

            <div
              className="document-modal-footer"
              style={{
                padding: "4px 8px",
                borderTop: "1px solid var(--border-color, #ddd)",
                display: "flex",
                justifyContent: "flex-end",
                minHeight: "40px",
                alignItems: "center",
              }}
            >
              <button
                className="document-download-button"
                onClick={() => downloadDocument(currentDocumentUrl?.url)}
                style={{ marginRight: "8px" }}
              >
                <FaDownload /> İndir
              </button>
              <button
                className="document-close-button"
                onClick={closeDocumentModal}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminExpenses;
