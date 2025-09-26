import React, { useState, useEffect, useContext } from "react";
import "./UserPayments.css";
import { UserContext } from "../contexts/UserContext";
import {
  FaCheck,
  FaTimes,
  FaTable,
  FaChartBar,
  FaRegCalendarAlt,
  FaChartLine,
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
const NUM_YEARS_TO_SHOW = 5;

const CHART_COLORS = {
  primary: "#3498db",
  secondary: "#2980b9",
  third: "#1abc9c",
  fourth: "#16a085",
};

const UserPayments = () => {
  const { user } = useContext(UserContext);

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("yearly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filters, setFilters] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    isPaid: "",
  });
  const [viewMode, setViewMode] = useState("table");
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(null);
  const [chartType, setChartType] = useState("yearly");
  const [chartFilters, setChartFilters] = useState({
    year: new Date().getFullYear(),
    compareYear: new Date().getFullYear() - 1,
  });

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: NUM_YEARS_TO_SHOW },
    (_, i) => currentYear - (NUM_YEARS_TO_SHOW - 1) + i
  ).reverse();

  const fetchPayments = async () => {
    const userId = user?.id || user?.uid;
    if (!userId) {
      setError("Ödemeleri görmek için giriş yapmalısınız.");
      setPayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`UserPayments: Fetching payments for user ID: ${userId}`);
      const paymentsRef = collection(db, "payments");
      let queryConstraints = [where("user_id", "==", userId)];

      if (filters.isPaid !== "") {
        const isPaidValue = filters.isPaid === "true" ? 1 : 0;
        queryConstraints.push(where("is_paid", "==", isPaidValue));
      }

      if (filterType === "yearly") {
        const startOfYear = Timestamp.fromDate(new Date(filters.year, 0, 1));
        const endOfYear = Timestamp.fromDate(
          new Date(filters.year, 11, 31, 23, 59, 59)
        );
        queryConstraints.push(where("created_date", ">=", startOfYear));
        queryConstraints.push(where("created_date", "<=", endOfYear));
      } else if (filterType === "monthly") {
        const startOfMonth = Timestamp.fromDate(
          new Date(filters.year, filters.month - 1, 1)
        );
        const endOfMonth = Timestamp.fromDate(
          new Date(filters.year, filters.month, 0, 23, 59, 59)
        );
        queryConstraints.push(where("created_date", ">=", startOfMonth));
        queryConstraints.push(where("created_date", "<=", endOfMonth));
      } else if (filterType === "date") {
        if (startDate) {
          const startDateTime = new Date(startDate);
          startDateTime.setHours(0, 0, 0, 0);
          queryConstraints.push(
            where("created_date", ">=", Timestamp.fromDate(startDateTime))
          );
        }
        if (endDate) {
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          queryConstraints.push(
            where("created_date", "<=", Timestamp.fromDate(endDateTime))
          );
        }
        if (!startDate && !endDate) {
          console.warn(
            "UserPayments: Date range filter selected but no dates provided."
          );
        }
      }

      queryConstraints.push(orderBy("created_date", "desc"));

      const finalQuery = query(paymentsRef, ...queryConstraints);
      const querySnapshot = await getDocs(finalQuery);

      console.log(`UserPayments: Found ${querySnapshot.size} payment records.`);

      const paymentsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        created_date: doc.data().created_date?.toDate(),
        payment_date: doc.data().payment_date?.toDate(),
        is_paid: doc.data().is_paid === 1,
      }));

      setPayments(paymentsData);
    } catch (error) {
      console.error("UserPayments: Error fetching payments:", error);
      setError("Ödeme verileri yüklenirken bir hata oluştu.");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartDataInternal = async (fetchFunction, ...args) => {
    const userId = user?.id || user?.uid;
    if (!userId) {
      setChartError("Grafikleri görmek için giriş yapmalısınız.");
      setChartData([]);
      return;
    }
    setChartLoading(true);
    setChartError(null);
    try {
      await fetchFunction(userId, ...args);
    } catch (error) {
      console.error("UserPayments: Error fetching chart data:", error);
      setChartError("Grafik verileri yüklenirken bir hata oluştu.");
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  };

  const fetchYearlyChartData = async (userId, year) => {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year, 11, 31, 23, 59, 59));
    const q = query(
      collection(db, "payments"),
      where("user_id", "==", userId),
      where("created_date", ">=", startOfYear),
      where("created_date", "<=", endOfYear)
    );
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((doc) => ({
      created_date: doc.data().created_date.toDate(),
      amount: Number(doc.data().amount || 0),
      is_paid: doc.data().is_paid === 1,
    }));
    setChartData(prepareMonthlyData(data));
  };

  const fetchMonthlyTrendChartData = async (userId) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 11);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const q = query(
      collection(db, "payments"),
      where("user_id", "==", userId),
      where("created_date", ">=", startTimestamp),
      where("created_date", "<=", endTimestamp),
      orderBy("created_date")
    );
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((doc) => ({
      created_date: doc.data().created_date.toDate(),
      amount: Number(doc.data().amount || 0),
      is_paid: doc.data().is_paid === 1,
    }));
    setChartData(prepareTrendData(data, startDate, endDate));
  };

  const fetchComparisonChartData = async (userId, year1, year2) => {
    if (year1 === year2) {
      throw new Error("Karşılaştırma için farklı yıllar seçmelisiniz.");
    }
    const fetchDataForYear = async (year) => {
      const start = Timestamp.fromDate(new Date(year, 0, 1));
      const end = Timestamp.fromDate(new Date(year, 11, 31, 23, 59, 59));
      const q = query(
        collection(db, "payments"),
        where("user_id", "==", userId),
        where("created_date", ">=", start),
        where("created_date", "<=", end)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        created_date: doc.data().created_date.toDate(),
        amount: Number(doc.data().amount || 0),
        is_paid: doc.data().is_paid === 1,
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
      .fill()
      .map((_, idx) => ({
        month: monthsShort[idx],
        monthName: months[idx],
        total: 0,
        paid: 0,
        unpaid: 0,
      }));
    data.forEach((payment) => {
      const monthIndex = payment.created_date.getMonth();
      if (monthIndex >= 0 && monthIndex < 12) {
        monthlyData[monthIndex].total += payment.amount;
        if (payment.is_paid) monthlyData[monthIndex].paid += payment.amount;
        else monthlyData[monthIndex].unpaid += payment.amount;
      }
    });
    return monthlyData;
  };

  const prepareTrendData = (data, startDate, endDate) => {
    const monthlyMap = {};
    let currentDate = new Date(startDate);
    let loopEndDate = new Date(endDate);
    loopEndDate.setMonth(loopEndDate.getMonth() + 1);
    loopEndDate.setDate(1);
    loopEndDate.setHours(0, 0, 0, 0);

    while (currentDate < loopEndDate) {
      const monthKey = `${currentDate.getFullYear()}-${(
        currentDate.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}`;
      monthlyMap[monthKey] = {
        month: monthsShort[currentDate.getMonth()],
        monthName: `${
          months[currentDate.getMonth()]
        } ${currentDate.getFullYear()}`,
        monthKey: monthKey,
        year: currentDate.getFullYear(),
        monthIndex: currentDate.getMonth(),
        total: 0,
        paid: 0,
        unpaid: 0,
      };
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    data.forEach((payment) => {
      const paymentDate = payment.created_date;
      const paymentMonthKey = `${paymentDate.getFullYear()}-${(
        paymentDate.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}`;
      if (monthlyMap[paymentMonthKey]) {
        monthlyMap[paymentMonthKey].total += payment.amount;
        if (payment.is_paid) monthlyMap[paymentMonthKey].paid += payment.amount;
        else monthlyMap[paymentMonthKey].unpaid += payment.amount;
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
    if (user) {
      fetchPayments();
    }
  }, [user, filterType, filters, startDate, endDate]);

  useEffect(() => {
    if (viewMode === "chart" && user) {
      let fetchFunction;
      let args = [];
      if (chartType === "yearly") {
        fetchFunction = fetchYearlyChartData;
        args = [chartFilters.year];
      } else if (chartType === "monthly") {
        fetchFunction = fetchMonthlyTrendChartData;
      } else if (chartType === "compare") {
        fetchFunction = fetchComparisonChartData;
        args = [chartFilters.year, chartFilters.compareYear];
      }
      if (fetchFunction) {
        fetchChartDataInternal(fetchFunction, ...args);
      }
    }
  }, [viewMode, chartType, chartFilters, user]);

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
  const handleChartTypeChange = (type) => setChartType(type);
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
    const valueToFormat = isNaN(num) ? 0 : num;
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
    }).format(valueToFormat);
  };

  const YearlyTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="tooltip-label">{`${label} Ayı Toplamı`}</p>
          <p className="tooltip-total" style={{ color: "#4caf50" }}>
            {`Ödenen: ${formatCurrency(data.paid)}`}
          </p>
          <p className="tooltip-total" style={{ color: "#f44336" }}>
            {`Ödenmemiş: ${formatCurrency(data.unpaid)}`}
          </p>
          <p
            className="tooltip-total"
            style={{
              borderTop: "1px solid var(--border-color)",
              paddingTop: "5px",
              marginTop: "5px",
            }}
          >
            {`Toplam: ${formatCurrency(data.total)}`}
          </p>
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
          <p
            className="tooltip-total"
            style={{ color: "#2196f3" }}
          >{`Toplam: ${formatCurrency(data.total)}`}</p>
          <p
            className="tooltip-total"
            style={{ color: "#4caf50" }}
          >{`Ödenen: ${formatCurrency(data.paid)}`}</p>
          <p
            className="tooltip-total"
            style={{ color: "#f44336" }}
          >{`Ödenmemiş: ${formatCurrency(data.unpaid)}`}</p>
        </div>
      );
    }
    return null;
  };

  const ComparisonTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length >= 1) {
      const dataPoint = payload[0].payload;
      const year1 = chartFilters.year;
      const year2 = chartFilters.compareYear;
      const payloadYear1 = payload.find((p) => p.dataKey == year1);
      const payloadYear2 = payload.find((p) => p.dataKey == year2);
      const value1 = payloadYear1?.value ?? 0;
      const value2 = payloadYear2?.value ?? 0;

      return (
        <div className="chart-tooltip">
          <p className="tooltip-label">{`${label} Ayı Karşılaştırması`}</p>
          {payloadYear1 && (
            <div className="tooltip-year">
              <span
                className="tooltip-year-label"
                style={{ color: payloadYear1.color || "#2196f3" }}
              >
                {year1}:
              </span>
              <span className="tooltip-year-value">
                {" "}
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
                {" "}
                {formatCurrency(value2)}
              </span>
            </div>
          )}
          {payloadYear1 && payloadYear2 && (
            <div className="tooltip-difference">
              <span className="tooltip-diff-label">Fark:</span>
              <span
                className={
                  value1 > value2
                    ? "positive"
                    : value1 < value2
                    ? "negative"
                    : ""
                }
              >
                {formatCurrency(value1 - value2)}
                {value1 > value2 ? " ↑" : value1 < value2 ? " ↓" : ""}
              </span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="user-payments">
      <div className="payments-header">
        <h1>Ödemelerim</h1>
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
                  {months.map((month, index) => (
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
            <div className="filter-group">
              <label htmlFor="isPaidSelect">Durum</label>
              <select
                id="isPaidSelect"
                name="isPaid"
                value={filters.isPaid}
                onChange={handleTableFilterChange}
              >
                <option value="">Tümü</option>
                <option value="true">Ödendi</option>
                <option value="false">Ödenmedi</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="loading">Yükleniyor...</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : !user ? (
            <div className="no-data">
              Ödemeleri görmek için lütfen giriş yapın.
            </div>
          ) : payments.length === 0 ? (
            <div className="no-data">Kayıt bulunamadı.</div>
          ) : (
            <div className="payments-table-container">
              <table className="payments-table">
                <thead>
                  <tr>
                    <th>Atama Tarihi</th>
                    <th>Tür</th>
                    <th>Tutar</th>
                    <th>Açıklama</th>
                    <th>Ödeme Tarihi</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        {payment.created_date?.toLocaleDateString("tr-TR") ??
                          "-"}
                      </td>
                      <td>{payment.type}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                      <td>{payment.note || "-"}</td>
                      <td>
                        {payment.payment_date?.toLocaleDateString("tr-TR") ??
                          "-"}
                      </td>
                      <td>
                        <span
                          className={
                            payment.is_paid ? "status-paid" : "status-unpaid"
                          }
                        >
                          {payment.is_paid ? (
                            <>
                              <FaCheck /> Ödendi
                            </>
                          ) : (
                            <>
                              <FaTimes /> Ödenmedi
                            </>
                          )}
                        </span>
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
            <h2>Ödeme Grafikleri</h2>
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
              <div className="chart-loading">Grafik yükleniyor...</div>
            ) : chartError ? (
              <div className="error">{chartError}</div>
            ) : !user ? (
              <div className="no-data">
                Grafikleri görmek için giriş yapmalısınız.
              </div>
            ) : chartData.length === 0 ? (
              <div className="chart-no-data">Grafik için veri bulunamadı.</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                {chartType === "yearly" && (
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-color)"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)" }}
                    />
                    <YAxis
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)" }}
                      tickFormatter={(value) =>
                        `${value.toLocaleString("tr-TR")} ₺`
                      }
                    />
                    <Tooltip content={<YearlyTooltip />} />
                    <Legend />
                    <Bar
                      dataKey="paid"
                      name="Ödenen"
                      fill="#4caf50"
                      stackId="a"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="unpaid"
                      name="Ödenmemiş"
                      fill="#f44336"
                      stackId="a"
                      radius={[0, 0, 4, 4]}
                    />
                  </BarChart>
                )}
                {chartType === "monthly" && (
                  <LineChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
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
                      tick={{ fill: "var(--text-secondary)" }}
                      tickFormatter={(value) =>
                        `${value.toLocaleString("tr-TR")} ₺`
                      }
                    />
                    <Tooltip content={<TrendTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Toplam"
                      stroke="#2196f3"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="paid"
                      name="Ödenen"
                      stroke="#4caf50"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="unpaid"
                      name="Ödenmemiş"
                      stroke="#f44336"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                )}
                {chartType === "compare" && (
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-color)"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)" }}
                    />
                    <YAxis
                      stroke="var(--text-primary)"
                      tick={{ fill: "var(--text-secondary)" }}
                      tickFormatter={(value) =>
                        `${value.toLocaleString("tr-TR")} ₺`
                      }
                    />
                    <Tooltip content={<ComparisonTooltip />} />
                    <Legend />
                    <Bar
                      dataKey={`${chartFilters.year}`}
                      name={`${chartFilters.year} Toplam`}
                      fill="#2196f3"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey={`${chartFilters.compareYear}`}
                      name={`${chartFilters.compareYear} Toplam`}
                      fill="#ff9800"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
            <div className="chart-info">
              {chartType === "yearly" && (
                <p className="chart-description">
                  {chartFilters.year} yılı aylık ödeme durumu.
                </p>
              )}
              {chartType === "monthly" && (
                <p className="chart-description">Son 12 aylık ödeme trendi.</p>
              )}
              {chartType === "compare" && (
                <p className="chart-description">
                  {chartFilters.year} ve {chartFilters.compareYear} yılları
                  aylık toplam tutar karşılaştırması.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserPayments;
