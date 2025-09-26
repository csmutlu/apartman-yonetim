import React, { useState, useEffect, useContext } from "react";
import "./UserExpenses.css";
import { UserContext } from "../contexts/UserContext";
import {
  FaTable,
  FaChartBar,
  FaRegCalendarAlt,
  FaChartLine,
  FaPaperclip,
  FaDownload,
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
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

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
const NUM_YEARS_TO_SHOW = 10;

const CHART_COLORS = {
  primary: "#3498db",
  secondary: "#2980b9",
  third: "#1abc9c",
  fourth: "#16a085",
};

const UserExpenses = () => {
  const { user, loading: userContextLoading } = useContext(UserContext);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: NUM_YEARS_TO_SHOW },
    (_, i) => currentYear - i
  );

  const [expenses, setExpenses] = useState([]);
  const [mainLoading, setMainLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("yearly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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

  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [currentDocument, setCurrentDocument] = useState({
    url: null,
    isImage: false,
    isPdf: false,
    error: null,
  });
  const [documentLoading, setDocumentLoading] = useState(false);
  const [urlCleanupFunction, setUrlCleanupFunction] = useState(null);

  const fetchExpenses = async () => {
    if (!user && !userContextLoading) {
      setError("Giderleri görmek için giriş yapmalısınız.");
      setExpenses([]);
      setMainLoading(false);
      return;
    }
    if (!user) {
      setMainLoading(false);
      return;
    }

    setMainLoading(true);
    setError(null);

    try {
      const expensesRef = collection(db, "expenses");
      let queryConstraints = [];

      if (filterType === "yearly") {
        const startOfYear = Timestamp.fromDate(new Date(filters.year, 0, 1));
        const endOfYear = Timestamp.fromDate(
          new Date(filters.year, 11, 31, 23, 59, 59)
        );
        queryConstraints.push(where("expense_date", ">=", startOfYear));
        queryConstraints.push(where("expense_date", "<=", endOfYear));
      } else if (filterType === "monthly") {
        const startOfMonth = Timestamp.fromDate(
          new Date(filters.year, filters.month - 1, 1)
        );
        const endOfMonth = Timestamp.fromDate(
          new Date(filters.year, filters.month, 0, 23, 59, 59)
        );
        queryConstraints.push(where("expense_date", ">=", startOfMonth));
        queryConstraints.push(where("expense_date", "<=", endOfMonth));
      } else if (filterType === "date") {
        if (startDate) {
          const startDateTime = new Date(startDate);
          startDateTime.setHours(0, 0, 0, 0);
          queryConstraints.push(
            where("expense_date", ">=", Timestamp.fromDate(startDateTime))
          );
        }
        if (endDate) {
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          queryConstraints.push(
            where("expense_date", "<=", Timestamp.fromDate(endDateTime))
          );
        }
      }

      queryConstraints.push(orderBy("expense_date", "desc"));
      const finalQuery = query(expensesRef, ...queryConstraints);
      const querySnapshot = await getDocs(finalQuery);

      const expensesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        expense_date: doc.data().expense_date?.toDate(),
        amount: Number(doc.data().amount || 0),
      }));
      setExpenses(expensesData);
    } catch (err) {
      console.error("UserExpenses: Error fetching expenses:", err);
      setError("Gider verileri yüklenirken bir hata oluştu.");
      setExpenses([]);
    } finally {
      setMainLoading(false);
    }
  };

  const fetchChartDataInternal = async (fetchFunction, ...args) => {
    if (!user && !userContextLoading) {
      setChartError("Grafikleri görmek için giriş yapmalısınız.");
      setChartData([]);
      setChartLoading(false);
      return;
    }
    if (!user) {
      setChartLoading(false);
      return;
    }

    setChartLoading(true);
    setChartError(null);
    try {
      await fetchFunction(...args);
    } catch (error) {
      console.error("UserExpenses: Error fetching chart data:", error);
      setChartError(
        `Grafik verileri yüklenirken bir hata oluştu: ${error.message}`
      );
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  };

  const fetchYearlyChartData = async (year) => {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year, 11, 31, 23, 59, 59));
    const q = query(
      collection(db, "expenses"),
      where("expense_date", ">=", startOfYear),
      where("expense_date", "<=", endOfYear)
    );
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((doc) => ({
      expense_date: doc.data().expense_date?.toDate(),
      amount: Number(doc.data().amount || 0),
    }));
    setChartData(prepareMonthlyData(data));
  };

  const fetchMonthlyTrendChartData = async () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 11);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const q = query(
      collection(db, "expenses"),
      where("expense_date", ">=", startTimestamp),
      where("expense_date", "<=", endTimestamp),
      orderBy("expense_date")
    );
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((doc) => ({
      expense_date: doc.data().expense_date?.toDate(),
      amount: Number(doc.data().amount || 0),
    }));
    setChartData(prepareTrendData(data, startDate, endDate));
  };

  const fetchComparisonChartData = async (year1, year2) => {
    if (year1 === year2) {
      setChartError("Karşılaştırma için farklı yıllar seçmelisiniz.");
      setChartData([]);

      return;
    }
    const fetchDataForYear = async (year) => {
      const start = Timestamp.fromDate(new Date(year, 0, 1));
      const end = Timestamp.fromDate(new Date(year, 11, 31, 23, 59, 59));
      const q = query(
        collection(db, "expenses"),
        where("expense_date", ">=", start),
        where("expense_date", "<=", end)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        expense_date: doc.data().expense_date?.toDate(),
        amount: Number(doc.data().amount || 0),
      }));
    };
    const [data1, data2] = await Promise.all([
      fetchDataForYear(year1),
      fetchDataForYear(year2),
    ]);
    setChartData(prepareComparisonData(data1, data2, year1, year2));
  };

  const prepareMonthlyData = (data) => {
    const monthlyData = Array(12)
      .fill(null)
      .map((_, idx) => ({
        month: MONTHS_SHORT[idx],
        monthName: MONTHS_FULL[idx],
        total: 0,
        expenseCount: 0,
      }));
    data.forEach((expense) => {
      if (
        expense.expense_date instanceof Date &&
        !isNaN(expense.expense_date)
      ) {
        const monthIndex = expense.expense_date.getMonth();
        if (monthIndex >= 0 && monthIndex < 12) {
          monthlyData[monthIndex].total += expense.amount;
          monthlyData[monthIndex].expenseCount += 1;
        }
      }
    });
    return monthlyData;
  };

  const prepareTrendData = (data, startDate, endDate) => {
    const monthlyMap = {};
    let currentDateIter = new Date(startDate);
    let loopEndDate = new Date(endDate);
    loopEndDate.setMonth(loopEndDate.getMonth() + 1);
    loopEndDate.setDate(1);
    loopEndDate.setHours(0, 0, 0, 0);

    while (currentDateIter < loopEndDate) {
      const monthKey = `${currentDateIter.getFullYear()}-${(
        currentDateIter.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}`;
      monthlyMap[monthKey] = {
        month: MONTHS_SHORT[currentDateIter.getMonth()],
        monthName: `${
          MONTHS_FULL[currentDateIter.getMonth()]
        } ${currentDateIter.getFullYear()}`,
        monthKey: monthKey,
        total: 0,
        expenseCount: 0,
      };
      currentDateIter.setMonth(currentDateIter.getMonth() + 1);
    }

    data.forEach((expense) => {
      if (
        expense.expense_date instanceof Date &&
        !isNaN(expense.expense_date)
      ) {
        const expenseDate = expense.expense_date;
        const expenseMonthKey = `${expenseDate.getFullYear()}-${(
          expenseDate.getMonth() + 1
        )
          .toString()
          .padStart(2, "0")}`;
        if (monthlyMap[expenseMonthKey]) {
          monthlyMap[expenseMonthKey].total += expense.amount;
          monthlyMap[expenseMonthKey].expenseCount += 1;
        }
      }
    });
    return Object.values(monthlyMap)
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .slice(-12);
  };

  const prepareComparisonData = (year1Data, year2Data, year1, year2) => {
    const year1Monthly = prepareMonthlyData(year1Data);
    const year2Monthly = prepareMonthlyData(year2Data);
    return year1Monthly.map((monthData, index) => ({
      month: monthData.month,
      monthName: monthData.monthName,
      [`${year1}`]: monthData.total,
      [`${year2}`]: year2Monthly[index]?.total ?? 0,
    }));
  };

  useEffect(() => {
    if (!userContextLoading) {
      if (user) {
        fetchExpenses();
      } else {
        setError("Giderleri görmek için giriş yapmalısınız.");
        setExpenses([]);
        setMainLoading(false);
      }
    }
  }, [user, userContextLoading, filterType, filters, startDate, endDate]);

  useEffect(() => {
    if (viewMode === "chart" && !userContextLoading) {
      if (user) {
        let fetchFunction;
        let args = [];
        if (chartType === "yearly") {
          fetchFunction = fetchYearlyChartData;
          args = [chartFilters.year];
        } else if (chartType === "monthly") {
          fetchFunction = fetchMonthlyTrendChartData;
        } else if (chartType === "compare") {
          if (chartFilters.year === chartFilters.compareYear) {
            setChartError("Karşılaştırma için farklı yıllar seçmelisiniz.");
            setChartData([]);
            setChartLoading(false);
            return;
          }
          fetchFunction = fetchComparisonChartData;
          args = [chartFilters.year, chartFilters.compareYear];
        }
        if (fetchFunction) {
          fetchChartDataInternal(fetchFunction, ...args);
        }
      } else {
        setChartError("Grafikleri görmek için giriş yapmalısınız.");
        setChartData([]);
        setChartLoading(false);
      }
    }
  }, [viewMode, chartType, chartFilters, user, userContextLoading]);

  const handleFilterTypeChange = (type) => {
    setFilterType(type);
    if (type !== "date") {
      setStartDate("");
      setEndDate("");
    }
  };
  const handleTableFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: name === "year" || name === "month" ? parseInt(value, 10) : value,
    }));
  };
  const handleChartTypeChange = (type) => {
    setChartError(null);
    setChartType(type);
  };
  const handleChartFilterChange = (e) => {
    const { name, value } = e.target;
    setChartFilters((prev) => ({
      ...prev,
      [name]:
        name === "year" || name === "compareYear" ? parseInt(value, 10) : value,
    }));
  };

  const formatCurrency = (amount) => {
    const num = Number(amount);
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
    }).format(isNaN(num) ? 0 : num);
  };
  const formatDate = (date) => {
    if (!date) return "-";
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      if (isNaN(dateObj.getTime())) return "-";
      return dateObj.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch (e) {
      return "-";
    }
  };

  const openDocumentInModal = async (url) => {
    if (!url) {
      alert("Geçersiz belge URL'si");
      return;
    }

    setIsDocumentModalOpen(true);
    setDocumentLoading(true);
    setCurrentDocument({
      url: null,
      isImage: false,
      isPdf: false,
      error: null,
    });

    if (urlCleanupFunction) {
      urlCleanupFunction();
      setUrlCleanupFunction(null);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Belge indirilemedi (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const isImage = blob.type.startsWith("image/");
      const isPdf = blob.type === "application/pdf";

      if (!isImage && !isPdf) {
        console.warn("Desteklenmeyen dosya tipi:", blob.type);
      }

      const secureUrl = URL.createObjectURL(blob);

      setCurrentDocument({
        url: secureUrl,
        isImage,
        isPdf,
        error: null,
      });

      const cleanup = () => URL.revokeObjectURL(secureUrl);
      setUrlCleanupFunction(() => cleanup);
    } catch (error) {
      console.error("Belge modalında hata:", error);
      setCurrentDocument({
        url: null,
        isImage: false,
        isPdf: false,
        error: error.message,
      });
    } finally {
      setDocumentLoading(false);
    }
  };

  const closeDocumentModal = () => {
    if (urlCleanupFunction) {
      urlCleanupFunction();
      setUrlCleanupFunction(null);
    }
    setIsDocumentModalOpen(false);
    setCurrentDocument({
      url: null,
      isImage: false,
      isPdf: false,
      error: null,
    });
    setDocumentLoading(false);
  };

  const downloadDocument = async (url, type = "belge") => {
    if (!url) {
      alert("İndirilecek belge URL'si bulunamadı.");
      return;
    }
    setDocumentLoading(true);
    try {
      const generateSecureFileName = (originalType) => {
        const date = new Date();
        const datePart = `${date.getDate()}-${
          date.getMonth() + 1
        }-${date.getFullYear()}`;
        const randomPart = Math.random().toString(36).substring(2, 8);
        const extension = currentDocument.isPdf
          ? "pdf"
          : currentDocument.isImage
          ? currentDocument.url?.split(".").pop() || "jpg"
          : "dosya";
        return `${originalType}_${datePart}_${randomPart}.${extension}`;
      };

      const secureFileName = generateSecureFileName(type);
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrlToDownload = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrlToDownload;
      a.download = secureFileName;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        URL.revokeObjectURL(blobUrlToDownload);
        document.body.removeChild(a);
      }, 100);
    } catch (error) {
      console.error("Dosya indirme hatası:", error);
      alert("Dosya indirilirken bir hata oluştu: " + error.message);
    } finally {
      setDocumentLoading(false);
    }
  };

  if (userContextLoading) {
    return (
      <div className="user-expenses">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-expenses">
      <div className="page-header">
        <h2>Apartman Giderleri</h2>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${
              viewMode === "table" ? "active" : ""
            }`}
            onClick={() => setViewMode("table")}
          >
            <FaTable /> Tablo
          </button>
          <button
            className={`view-toggle-btn ${
              viewMode === "chart" ? "active" : ""
            }`}
            onClick={() => setViewMode("chart")}
          >
            <FaChartBar /> Grafik
          </button>
        </div>
      </div>

      {viewMode === "table" && (
        <>
          <div className="filters">
            <div className="filter-group">
              <label>Filtrele</label>
              <div className="filter-buttons">
                <button
                  className={`filter-button ${
                    filterType === "yearly" ? "active" : ""
                  }`}
                  onClick={() => handleFilterTypeChange("yearly")}
                >
                  Yıllık
                </button>
                <button
                  className={`filter-button ${
                    filterType === "monthly" ? "active" : ""
                  }`}
                  onClick={() => handleFilterTypeChange("monthly")}
                >
                  Aylık
                </button>
                <button
                  className={`filter-button ${
                    filterType === "date" ? "active" : ""
                  }`}
                  onClick={() => handleFilterTypeChange("date")}
                >
                  Tarih Aralığı
                </button>
              </div>
            </div>
            {(filterType === "yearly" || filterType === "monthly") && (
              <div className="filter-group">
                <label htmlFor="tableYearSelect">Yıl</label>
                <select
                  id="tableYearSelect"
                  name="year"
                  value={filters.year}
                  onChange={handleTableFilterChange}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {filterType === "monthly" && (
              <div className="filter-group">
                <label htmlFor="tableMonthSelect">Ay</label>
                <select
                  id="tableMonthSelect"
                  name="month"
                  value={filters.month}
                  onChange={handleTableFilterChange}
                >
                  {MONTHS_FULL.map((month, index) => (
                    <option key={index + 1} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {filterType === "date" && (
              <div className="date-range">
                <div className="filter-group">
                  <label htmlFor="startDate">Başlangıç</label>
                  <input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <span>-</span>
                <div className="filter-group">
                  <label htmlFor="endDate">Bitiş</label>
                  <input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || ""}
                  />
                </div>
              </div>
            )}
          </div>

          {mainLoading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Giderler Yükleniyor...</p>
            </div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : !user ? (
            <div className="no-data">
              Giderleri görmek için giriş yapmalısınız.
            </div>
          ) : expenses.length === 0 ? (
            <div className="no-data">
              Seçili kriterlere uygun gider kaydı bulunamadı.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="expenses-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Gider Türü</th>
                    <th>Tutar</th>
                    <th>Fatura No</th>
                    <th>Açıklama</th>
                    <th>Belge</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{formatDate(expense.expense_date)}</td>
                      <td>{expense.type}</td>
                      <td>{formatCurrency(expense.amount)}</td>
                      <td>{expense.invoice_number || "-"}</td>
                      <td>{expense.description || "-"}</td>
                      <td>
                        {expense.attachment_url ? (
                          <div className="document-actions">
                            <button
                              onClick={() =>
                                openDocumentInModal(expense.attachment_url)
                              }
                              className="document-link"
                              title="Belgeyi Görüntüle"
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
                              title="Belgeyi İndir"
                            >
                              <FaDownload /> İndir
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
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
                    <FaRegCalendarAlt /> Yıl
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
                      .filter((y) => y !== chartFilters.year)
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
          <div className="chart-container">
            {chartLoading ? (
              <div className="chart-loading">
                <div className="loading-spinner"></div>Grafik yükleniyor...
              </div>
            ) : chartError ? (
              <div className="error">{chartError}</div>
            ) : !user ? (
              <div className="no-data">
                Grafikleri görmek için giriş yapmalısınız.
              </div>
            ) : chartData.length === 0 ? (
              <div className="chart-no-data">Grafik için veri bulunamadı.</div>
            ) : (
              <ResponsiveContainer width="100%" height={400} debounce={50}>
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
                      width={90}
                    />
                    <Tooltip
                      content={
                        <CustomTooltip
                          formatter={formatCurrency}
                          payloadMap={{ total: "Toplam Harcama" }}
                        />
                      }
                      cursor={{ fill: "rgba(var(--primary-rgb), 0.1)" }}
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
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
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
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value)}
                      width={90}
                    />
                    <Tooltip
                      content={
                        <CustomTooltip
                          formatter={formatCurrency}
                          payloadMap={{ total: "Toplam Harcama" }}
                        />
                      }
                      cursor={{ stroke: CHART_COLORS.third, strokeWidth: 1 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: "20px" }} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Toplam Harcama"
                      stroke={CHART_COLORS.third}
                      strokeWidth={2.5}
                      dot={{
                        r: 4.5,
                        fill: CHART_COLORS.third,
                        strokeWidth: 1,
                        stroke: "var(--card-bg)",
                      }}
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
                      width={90}
                    />
                    <Tooltip
                      content={
                        <CustomTooltip
                          formatter={formatCurrency}
                          payloadMap={{
                            [`${chartFilters.year}`]: `${chartFilters.year} Yılı`,
                            [`${chartFilters.compareYear}`]: `${chartFilters.compareYear} Yılı`,
                          }}
                        />
                      }
                      cursor={{ fill: "rgba(var(--primary-rgb), 0.1)" }}
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

      {isDocumentModalOpen && (
        <div
          className={`document-modal-overlay ${
            isDocumentModalOpen ? "open" : ""
          }`}
          onClick={closeDocumentModal}
        >
          <div
            className="document-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: currentDocument.isImage ? "80vw" : "90vw",
              maxHeight: currentDocument.isImage ? "85vh" : "95vh",
              width: currentDocument.isImage ? "auto" : "90vw",
              height: currentDocument.isImage ? "auto" : "95vh",
              minWidth: currentDocument.isImage ? "300px" : "min(70vw, 600px)",
              minHeight: currentDocument.isImage ? "300px" : "min(70vh, 500px)",
            }}
          >
            <div
              className="document-modal-header"
              style={{
                padding: "8px 12px",
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--border-color)",
                position: "relative",
              }}
            >
              <h3 style={{ fontSize: "1rem", margin: 0, fontWeight: "600" }}>
                Belge Görüntüleyici
              </h3>
              <button
                className="document-modal-close"
                onClick={closeDocumentModal}
                style={{
                  fontSize: "1.5rem",
                  lineHeight: "1",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0.25rem 0.5rem",
                  position: "absolute",
                  right: "8px",
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
                padding: "0",
                overflow: "auto",
                height: `calc(${
                  currentDocument.isImage ? "auto" : "95vh"
                } - 80px)`,
              }}
            >
              {documentLoading && (
                <div className="loading-spinner-modal">
                  <span>Belge Yükleniyor...</span>
                </div>
              )}
              {!documentLoading && currentDocument.error && (
                <div className="pdf-fallback">
                  {" "}
                  <p style={{ color: "var(--danger)" }}>
                    Hata: {currentDocument.error}
                  </p>
                  <p>Belge yüklenirken bir sorun oluştu.</p>
                </div>
              )}
              {!documentLoading &&
                !currentDocument.error &&
                currentDocument.url &&
                (currentDocument.isImage ? (
                  <img src={currentDocument.url} alt="Belge" />
                ) : currentDocument.isPdf ? (
                  <object
                    data={currentDocument.url}
                    type="application/pdf"
                    width="100%"
                    height="100%"
                    className="pdf-viewer"
                  >
                    <div className="pdf-fallback">
                      <p>
                        Tarayıcınız PDF görüntülemeyi desteklemiyor veya PDF
                        yüklenemedi.
                      </p>
                      <button
                        onClick={() => downloadDocument(currentDocument.url)}
                        className="document-download-button"
                      >
                        <FaDownload /> PDF İndir
                      </button>
                    </div>
                  </object>
                ) : (
                  <div className="unsupported-file">
                    <p>Bu dosya formatı tarayıcıda görüntülenemedi.</p>
                    <button
                      onClick={() => downloadDocument(currentDocument.url)}
                      className="document-download-button"
                    >
                      <FaDownload /> Dosyayı İndir
                    </button>
                  </div>
                ))}
            </div>

            <div
              className="document-modal-footer"
              style={{
                padding: "8px 12px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                minHeight: "50px",
              }}
            >
              <button
                className="document-download-button"
                onClick={() =>
                  downloadDocument(
                    currentDocument.url,
                    expenses.find(
                      (ex) => ex.attachment_url === currentDocument.url
                    )?.type
                  )
                }
                style={{ marginRight: "10px" }}
                disabled={
                  documentLoading ||
                  !currentDocument.url ||
                  !!currentDocument.error
                }
              >
                <FaDownload /> İndir
              </button>
              <button
                className="document-close-button"
                onClick={closeDocumentModal}
                disabled={documentLoading && !currentDocument.error}
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

const CustomTooltip = ({ active, payload, label, formatter, payloadMap }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <p className="tooltip-label">{label || data.monthName || data.month}</p>
        {payload.map((pld, index) => (
          <div
            key={index}
            className="tooltip-item"
            style={{ color: pld.color || "inherit" }}
          >
            <span className="tooltip-item-label">
              {payloadMap[pld.dataKey] || pld.name}:
            </span>
            <span className="tooltip-item-value">{formatter(pld.value)}</span>
          </div>
        ))}
        {data.expenseCount > 0 && (
          <div className="tooltip-item">
            <span className="tooltip-item-label">İşlem Sayısı:</span>
            <span className="tooltip-item-value">{data.expenseCount}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default UserExpenses;
