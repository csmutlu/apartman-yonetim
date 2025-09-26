import React, { useState, useEffect, useContext, useCallback } from "react";
import "./AdminReports.css";
import { UserContext } from "../contexts/UserContext";
import ExcelJS from "exceljs";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

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

const styles = {
  titleFont: { bold: true, size: 16, color: { argb: "FF003366" } },
  titleFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE6F0FF" },
  },
  titleAlignment: { horizontal: "center", vertical: "middle" },
  subtitleAlignment: { horizontal: "center", vertical: "middle" },
  headerFont: { bold: true, color: { argb: "FF000000" }, size: 11 },
  headerFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD0D0D0" },
  },
  headerAlignment: { horizontal: "center", vertical: "middle" },
  totalRowFont: { bold: true },
  totalRowFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  },
  paidCellFont: { color: { argb: "FF006100" }, bold: true },
  paidCellFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFC6EFCE" },
  },
  unpaidCellFont: { color: { argb: "FF9C0006" }, bold: true },
  unpaidCellFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFC7CE" },
  },
  currencyFormat: "#,##0.00₺",
  percentFormat: "0.00%",
  thinBorder: { style: "thin" },
  mediumBorder: { style: "medium" },
  doubleBorder: { style: "double" },
  fullThinBorder: {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  },
  headerBorder: {
    top: { style: "medium" },
    left: { style: "thin" },
    bottom: { style: "medium" },
    right: { style: "thin" },
  },
  totalRowBorder: {
    top: { style: "double" },
    left: { style: "thin" },
    bottom: { style: "double" },
    right: { style: "thin" },
  },
  alignRight: { horizontal: "right" },
  alignLeft: { horizontal: "left" },
  alignCenter: { horizontal: "center" },
};

const applyCellStyle = (cell, customStyles = {}) => {
  cell.border = styles.fullThinBorder;

  if (customStyles.font) cell.font = { ...cell.font, ...customStyles.font };
  if (customStyles.fill) cell.fill = { ...cell.fill, ...customStyles.fill };
  if (customStyles.alignment)
    cell.alignment = { ...cell.alignment, ...customStyles.alignment };
  if (customStyles.numFmt) cell.numFmt = customStyles.numFmt;
  if (customStyles.border)
    cell.border = { ...cell.border, ...customStyles.border };
};

const applyHeaderRowStyle = (row) => {
  row.font = styles.headerFont;
  row.fill = styles.headerFill;
  row.height = 25;
  row.eachCell((cell) => {
    applyCellStyle(cell, {
      alignment: styles.headerAlignment,
      border: styles.headerBorder,
    });
  });
};

const addSheetTitle = (sheet, title, mergeRange) => {
  sheet.mergeCells(mergeRange);
  const titleCell = sheet.getCell(mergeRange.split(":")[0]);
  titleCell.value = title;
  titleCell.font = styles.titleFont;
  titleCell.fill = styles.titleFill;
  titleCell.alignment = styles.titleAlignment;
  sheet.getRow(titleCell.row).height = 30;
};

const addSheetSubtitle = (sheet, text, mergeRange) => {
  sheet.mergeCells(mergeRange);
  const subtitleCell = sheet.getCell(mergeRange.split(":")[0]);
  subtitleCell.value = text;
  subtitleCell.font = { italic: true };
  subtitleCell.alignment = styles.subtitleAlignment;
};

const AdminReports = () => {
  const { user } = useContext(UserContext);
  const [data, setData] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ userId: "" });
  const [reportType, setReportType] = useState("payments");

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

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const fetchUsers = useCallback(async () => {
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, orderBy("apartment_number", "asc"));
      const usersSnapshot = await getDocs(q);
      const usersList = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setUsers(usersList);
    } catch (err) {
      console.error("Kullanıcılar yüklenirken hata:", err);
      setError("Kullanıcı listesi yüklenemedi.");
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    setData([]);

    try {
      const collectionName =
        reportType === "payments" ? "payments" : "expenses";
      const dateField =
        reportType === "payments" ? "created_date" : "expense_date";
      const collectionRef = collection(db, collectionName);

      const constraints = [];

      if (reportType === "payments" && filters.userId) {
        constraints.push(where("user_id", "==", filters.userId));
      }

      let startFilterDate, endFilterDate;

      if (filterType === "month") {
        startFilterDate = Timestamp.fromDate(
          new Date(selectedYear, selectedMonth - 1, 1)
        );

        const lastDayOfMonth = new Date(selectedYear, selectedMonth, 0);
        lastDayOfMonth.setHours(23, 59, 59, 999);
        endFilterDate = Timestamp.fromDate(lastDayOfMonth);
      } else if (filterType === "year") {
        startFilterDate = Timestamp.fromDate(new Date(selectedYear, 0, 1));

        const lastDayOfYear = new Date(selectedYear, 11, 31);
        lastDayOfYear.setHours(23, 59, 59, 999);
        endFilterDate = Timestamp.fromDate(lastDayOfYear);
      } else if (filterType === "range" && startDate && endDate) {
        const startDateObj = new Date(startDate);
        startDateObj.setHours(0, 0, 0, 0);
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        startFilterDate = Timestamp.fromDate(startDateObj);
        endFilterDate = Timestamp.fromDate(endDateObj);
      }

      if (startFilterDate && endFilterDate) {
        constraints.push(where(dateField, ">=", startFilterDate));
        constraints.push(where(dateField, "<=", endFilterDate));
      } else if (filterType !== "range" && (!startDate || !endDate)) {
        console.warn(
          "Tarih filtresi tam olarak belirlenmedi, tüm veriler çekiliyor olabilir."
        );
      }

      const q = query(collectionRef, ...constraints);
      const snapshot = await getDocs(q);

      let itemsList = snapshot.docs.map((doc) => {
        const docData = doc.data();
        const itemBase = { id: doc.id, ...docData };

        if (reportType === "payments") {
          itemBase.created_date = docData.created_date?.toDate();
          itemBase.payment_date = docData.payment_date?.toDate() || null;
          itemBase.is_paid = docData.is_paid === 1;
        } else {
          itemBase.expense_date = docData.expense_date?.toDate();
        }
        return itemBase;
      });

      itemsList.sort((a, b) => {
        const dateA =
          (reportType === "payments" ? a.created_date : a.expense_date) || 0;
        const dateB =
          (reportType === "payments" ? b.created_date : b.expense_date) || 0;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB.getTime() - dateA.getTime();
      });

      setData(itemsList);
    } catch (err) {
      console.error("Veriler yüklenirken hata:", err);
      setError(`Veri yüklenirken bir hata oluştu: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [
    user,
    reportType,
    filterType,
    selectedYear,
    selectedMonth,
    startDate,
    endDate,
    filters.userId,
  ]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createPaymentSheets = (workbook, paymentsData, reportPeriod) => {
    const userTotals = {};
    let totalAmount = 0;
    let paidAmount = 0;
    let paidCount = 0;

    paymentsData.forEach((payment) => {
      const userId = payment.user_id;
      const amount = Number(payment.amount || 0);

      if (!userTotals[userId]) {
        userTotals[userId] = {
          user_id: userId,
          user_name: payment.user_name,
          apartment_number: payment.apartment_number,
          total_amount: 0,
          total_paid: 0,
          total_unpaid: 0,
        };
      }

      userTotals[userId].total_amount += amount;
      totalAmount += amount;

      if (payment.is_paid) {
        userTotals[userId].total_paid += amount;
        paidAmount += amount;
        paidCount++;
      } else {
        userTotals[userId].total_unpaid += amount;
      }
    });

    const unpaidAmount = totalAmount - paidAmount;
    const unpaidCount = paymentsData.length - paidCount;
    const uniqueUserDebt = Object.values(userTotals).reduce(
      (sum, user) => sum + user.total_unpaid,
      0
    );

    const sortedUserTotals = Object.values(userTotals).sort(
      (a, b) => (a.apartment_number || 0) - (b.apartment_number || 0)
    );

    createMainPaymentSheet(
      workbook.addWorksheet("Ödemeler"),
      paymentsData,
      userTotals,
      reportPeriod,
      totalAmount,
      paidAmount,
      unpaidAmount,
      paidCount,
      unpaidCount,
      uniqueUserDebt
    );
    createPaymentSummarySheet(
      workbook.addWorksheet("Kullanıcı Özeti"),
      sortedUserTotals,
      reportPeriod
    );
    createPaymentStatsSheet(
      workbook.addWorksheet("İstatistikler"),
      reportPeriod,
      totalAmount,
      paidAmount,
      unpaidAmount,
      paymentsData.length,
      paidCount,
      unpaidCount
    );
    createMonthlySummarySheet(
      workbook.addWorksheet("Aylık Özet"),
      paymentsData
    );
  };

  const createMainPaymentSheet = (
    sheet,
    paymentsData,
    userTotals,
    reportPeriod,
    totalAmount,
    paidAmount,
    unpaidAmount,
    paidCount,
    unpaidCount,
    uniqueUserDebt
  ) => {
    sheet.columns = [
      { key: "apartmentNo", header: "Daire No", width: 10 },
      { key: "name", header: "Ad Soyad", width: 25 },
      { key: "type", header: "Ödeme Türü", width: 15 },
      { key: "amount", header: "Tutar (₺)", width: 15 },
      { key: "createdDate", header: "Atama Tarihi", width: 15 },
      { key: "paymentDate", header: "Ödeme Tarihi", width: 15 },
      { key: "note", header: "Açıklama", width: 35 },
      { key: "status", header: "Durum", width: 12 },
      { key: "totalDebt", header: "Daire Kalan Borç (₺)", width: 18 },
    ];

    addSheetTitle(sheet, `ÖDEME RAPORU (${reportPeriod})`, "A1:I1");
    addSheetSubtitle(
      sheet,
      `Oluşturulma Tarihi: ${new Date().toLocaleDateString("tr-TR")}`,
      "A2:I2"
    );
    sheet.addRow([]);

    const headerRowIndex = 4;
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = sheet.columns.map((col) => col.header);
    applyHeaderRowStyle(headerRow);

    paymentsData.forEach((item) => {
      const userTotal = userTotals[item.user_id] || { total_unpaid: 0 };
      const row = sheet.addRow({
        apartmentNo: item.apartment_number || "-",
        name: item.user_name || "-",
        type: item.type || "-",
        amount: Number(item.amount || 0),
        createdDate:
          item.created_date?.toLocaleDateString("tr-TR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }) || "-",
        paymentDate:
          item.payment_date?.toLocaleDateString("tr-TR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }) || "-",
        note: item.note || "-",
        status: item.is_paid ? "Ödendi" : "Ödenmedi",
        totalDebt: Number(userTotal.total_unpaid || 0),
      });

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const columnKey = sheet.columns[colNumber - 1].key;
        let cellStyle = { alignment: styles.alignLeft };

        if (columnKey === "amount" || columnKey === "totalDebt") {
          cellStyle = {
            ...cellStyle,
            numFmt: styles.currencyFormat,
            alignment: styles.alignRight,
          };
        } else if (columnKey === "status") {
          cellStyle = {
            ...cellStyle,
            ...(item.is_paid
              ? { font: styles.paidCellFont, fill: styles.paidCellFill }
              : { font: styles.unpaidCellFont, fill: styles.unpaidCellFill }),
            alignment: styles.alignCenter,
          };
        } else if (columnKey === "apartmentNo") {
          cellStyle = { ...cellStyle, alignment: styles.alignCenter };
        } else if (columnKey === "createdDate" || columnKey === "paymentDate") {
          cellStyle = { ...cellStyle, alignment: styles.alignCenter };
        }

        applyCellStyle(cell, cellStyle);
      });
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow([
      "TOPLAM",
      "",
      "",
      totalAmount,
      "",
      "",
      "",
      "",
      uniqueUserDebt,
    ]);
    totalRow.fill = styles.totalRowFill;
    totalRow.font = styles.totalRowFont;
    applyCellStyle(totalRow.getCell(1));
    applyCellStyle(totalRow.getCell(4), {
      numFmt: styles.currencyFormat,
      alignment: styles.alignRight,
    });
    applyCellStyle(totalRow.getCell(9), {
      numFmt: styles.currencyFormat,
      alignment: styles.alignRight,
    });

    [2, 3, 5, 6, 7, 8].forEach((colNum) =>
      applyCellStyle(totalRow.getCell(colNum))
    );

    const paidRow = sheet.addRow([
      "ÖDENEN",
      "",
      "",
      paidAmount,
      "",
      "",
      "",
      `${paidCount} adet`,
      "",
    ]);
    paidRow.fill = styles.paidCellFill;
    paidRow.font = { ...styles.paidCellFont, bold: true };
    applyCellStyle(paidRow.getCell(1));
    applyCellStyle(paidRow.getCell(4), {
      numFmt: styles.currencyFormat,
      alignment: styles.alignRight,
    });
    applyCellStyle(paidRow.getCell(8), { alignment: styles.alignCenter });
    [2, 3, 5, 6, 7, 9].forEach((colNum) =>
      applyCellStyle(paidRow.getCell(colNum))
    );

    const unpaidRow = sheet.addRow([
      "KALAN",
      "",
      "",
      unpaidAmount,
      "",
      "",
      "",
      `${unpaidCount} adet`,
      uniqueUserDebt,
    ]);
    unpaidRow.fill = styles.unpaidCellFill;
    unpaidRow.font = { ...styles.unpaidCellFont, bold: true };
    applyCellStyle(unpaidRow.getCell(1));
    applyCellStyle(unpaidRow.getCell(4), {
      numFmt: styles.currencyFormat,
      alignment: styles.alignRight,
    });
    applyCellStyle(unpaidRow.getCell(8), { alignment: styles.alignCenter });
    applyCellStyle(unpaidRow.getCell(9), {
      numFmt: styles.currencyFormat,
      alignment: styles.alignRight,
    });
    [2, 3, 5, 6, 7].forEach((colNum) =>
      applyCellStyle(unpaidRow.getCell(colNum))
    );
  };

  const createPaymentSummarySheet = (sheet, sortedUserTotals, reportPeriod) => {
    sheet.columns = [
      { key: "apartmentNo", header: "Daire No", width: 10 },
      { key: "name", header: "Ad Soyad", width: 25 },
      { key: "totalAmount", header: "Toplam Tutar", width: 16 },
      { key: "paid", header: "Ödenen", width: 16 },
      { key: "unpaid", header: "Kalan Borç", width: 16 },
      { key: "paidRatio", header: "Ödenme Oranı", width: 16 },
    ];

    addSheetTitle(
      sheet,
      `KULLANICI BAZLI ÖDEME ÖZETİ (${reportPeriod})`,
      "A1:F1"
    );
    sheet.addRow([]);

    const headerRowIndex = 3;
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = sheet.columns.map((col) => col.header);
    applyHeaderRowStyle(headerRow);

    let grandTotalAmount = 0;
    let grandTotalPaid = 0;
    let grandTotalUnpaid = 0;

    sortedUserTotals.forEach((user) => {
      grandTotalAmount += user.total_amount;
      grandTotalPaid += user.total_paid;
      grandTotalUnpaid += user.total_unpaid;
      const paidRatio =
        user.total_amount > 0 ? user.total_paid / user.total_amount : 0;

      const row = sheet.addRow({
        apartmentNo: user.apartment_number || "-",
        name: user.user_name || "-",
        totalAmount: user.total_amount,
        paid: user.total_paid,
        unpaid: user.total_unpaid,
        paidRatio: paidRatio,
      });

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const columnKey = sheet.columns[colNumber - 1].key;
        let cellStyle = { alignment: styles.alignLeft };

        if (["totalAmount", "paid", "unpaid"].includes(columnKey)) {
          cellStyle = {
            ...cellStyle,
            numFmt: styles.currencyFormat,
            alignment: styles.alignRight,
          };
          if (columnKey === "unpaid" && user.total_unpaid > 0) {
            cellStyle.font = { ...styles.unpaidCellFont, bold: false };
          }
        } else if (columnKey === "paidRatio") {
          cellStyle = {
            ...cellStyle,
            numFmt: styles.percentFormat,
            alignment: styles.alignRight,
          };
        } else if (columnKey === "apartmentNo") {
          cellStyle.alignment = styles.alignCenter;
        }
        applyCellStyle(cell, cellStyle);
      });
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow([
      "TOPLAM",
      "",
      grandTotalAmount,
      grandTotalPaid,
      grandTotalUnpaid,
      grandTotalAmount > 0 ? grandTotalPaid / grandTotalAmount : 0,
    ]);
    totalRow.fill = styles.totalRowFill;
    totalRow.font = styles.totalRowFont;
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const columnKey = sheet.columns[colNumber - 1].key;
      let cellStyle = {
        border: styles.totalRowBorder,
        alignment: styles.alignLeft,
      };
      if (["totalAmount", "paid", "unpaid"].includes(columnKey)) {
        cellStyle = {
          ...cellStyle,
          numFmt: styles.currencyFormat,
          alignment: styles.alignRight,
        };
      } else if (columnKey === "paidRatio") {
        cellStyle = {
          ...cellStyle,
          numFmt: styles.percentFormat,
          alignment: styles.alignRight,
        };
      }

      applyCellStyle(cell, {
        border: styles.totalRowBorder,
        alignment: cellStyle.alignment,
        numFmt: cellStyle.numFmt,
      });
    });
  };

  const createPaymentStatsSheet = (
    sheet,
    reportPeriod,
    totalAmount,
    paidAmount,
    unpaidAmount,
    totalCount,
    paidCount,
    unpaidCount
  ) => {
    sheet.columns = [
      { key: "stat", header: "İstatistik", width: 30 },
      { key: "value", header: "Değer", width: 20 },
      { key: "percentage", header: "Yüzde", width: 15 },
    ];

    addSheetTitle(sheet, `ÖDEME İSTATİSTİKLERİ (${reportPeriod})`, "A1:C1");
    sheet.addRow([]);

    const headerRowIndex = 3;
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = sheet.columns.map((col) => col.header);
    applyHeaderRowStyle(headerRow);

    const statsData = [
      { stat: "Toplam Ödeme Tutarı", value: totalAmount, percentage: 1 },
      {
        stat: "Ödenen Toplam Tutar",
        value: paidAmount,
        percentage: totalAmount > 0 ? paidAmount / totalAmount : 0,
      },
      {
        stat: "Kalan Toplam Borç",
        value: unpaidAmount,
        percentage: totalAmount > 0 ? unpaidAmount / totalAmount : 0,
      },
      { stat: "Toplam Ödeme Adedi", value: totalCount, percentage: 1 },
      {
        stat: "Ödenmiş Ödeme Adedi",
        value: paidCount,
        percentage: totalCount > 0 ? paidCount / totalCount : 0,
      },
      {
        stat: "Ödenmemiş Ödeme Adedi",
        value: unpaidCount,
        percentage: totalCount > 0 ? unpaidCount / totalCount : 0,
      },
    ];

    statsData.forEach((item, index) => {
      const row = sheet.addRow(item);
      let valueFormat = index < 3 ? styles.currencyFormat : "#,##0";
      let percentageFormat = styles.percentFormat;

      if (index === 3) percentageFormat = undefined;

      applyCellStyle(row.getCell(1), { alignment: styles.alignLeft });
      applyCellStyle(row.getCell(2), {
        numFmt: valueFormat,
        alignment: styles.alignRight,
      });
      applyCellStyle(row.getCell(3), {
        numFmt: percentageFormat,
        alignment: styles.alignRight,
      });

      if (item.stat.includes("Ödenen")) {
        row.eachCell(
          (cell) => (cell.font = { ...cell.font, ...styles.paidCellFont })
        );
      } else if (
        item.stat.includes("Kalan") ||
        item.stat.includes("Ödenmemiş")
      ) {
        row.eachCell(
          (cell) => (cell.font = { ...cell.font, ...styles.unpaidCellFont })
        );
      }
    });
  };

  const createMonthlySummarySheet = (sheet, paymentsData) => {
    sheet.columns = [
      { key: "period", header: "Dönem", width: 20 },
      { key: "total", header: "Toplam Tutar", width: 16 },
      { key: "paid", header: "Ödenen", width: 16 },
      { key: "unpaid", header: "Kalan", width: 16 },
      { key: "paidRatio", header: "Ödenme Oranı", width: 16 },
    ];

    addSheetTitle(sheet, "AYLIK ÖDEME ÖZETİ", "A1:E1");
    sheet.addRow([]);

    const headerRowIndex = 3;
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = sheet.columns.map((col) => col.header);
    applyHeaderRowStyle(headerRow);

    const monthlyStats = {};
    paymentsData.forEach((payment) => {
      const date = payment.created_date;
      if (!date) return;

      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      const monthName = `${months[date.getMonth()]} ${date.getFullYear()}`;

      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = {
          period: monthName,
          total: 0,
          paid: 0,
          unpaid: 0,
        };
      }
      const amount = Number(payment.amount || 0);
      monthlyStats[monthKey].total += amount;
      if (payment.is_paid) {
        monthlyStats[monthKey].paid += amount;
      } else {
        monthlyStats[monthKey].unpaid += amount;
      }
    });

    const sortedKeys = Object.keys(monthlyStats).sort().reverse();

    sortedKeys.forEach((key) => {
      const stat = monthlyStats[key];
      const paidRatio = stat.total > 0 ? stat.paid / stat.total : 0;
      const row = sheet.addRow({
        period: stat.period,
        total: stat.total,
        paid: stat.paid,
        unpaid: stat.unpaid,
        paidRatio: paidRatio,
      });

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const columnKey = sheet.columns[colNumber - 1].key;
        let cellStyle = { alignment: styles.alignLeft };

        if (["total", "paid", "unpaid"].includes(columnKey)) {
          cellStyle = {
            ...cellStyle,
            numFmt: styles.currencyFormat,
            alignment: styles.alignRight,
          };
          if (columnKey === "unpaid" && stat.unpaid > 0) {
            cellStyle.font = { ...styles.unpaidCellFont, bold: false };
          }
        } else if (columnKey === "paidRatio") {
          cellStyle = {
            ...cellStyle,
            numFmt: styles.percentFormat,
            alignment: styles.alignRight,
          };
        }
        applyCellStyle(cell, cellStyle);
      });
    });
  };

  const createExpenseSheets = (workbook, expensesData, reportPeriod) => {
    let totalAmount = 0;
    const expensesByType = {};

    expensesData.forEach((expense) => {
      const amount = Number(expense.amount || 0);
      totalAmount += amount;
      const type = expense.type || "Diğer";
      expensesByType[type] = (expensesByType[type] || 0) + amount;
    });

    const sortedExpenseTypes = Object.entries(expensesByType).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    createMainExpenseSheet(
      workbook.addWorksheet("Giderler"),
      expensesData,
      reportPeriod,
      totalAmount
    );
    createExpenseSummarySheet(
      workbook.addWorksheet("Gider Özeti"),
      sortedExpenseTypes,
      reportPeriod,
      totalAmount
    );
  };

  const createMainExpenseSheet = (
    sheet,
    expensesData,
    reportPeriod,
    totalAmount
  ) => {
    sheet.columns = [
      { key: "type", header: "Gider Türü", width: 25 },
      { key: "amount", header: "Tutar (₺)", width: 18 },
      { key: "date", header: "Tarih", width: 15 },
      { key: "invoice", header: "Fatura No", width: 18 },
      { key: "description", header: "Açıklama", width: 40 },
    ];

    addSheetTitle(sheet, `GİDER RAPORU (${reportPeriod})`, "A1:E1");
    addSheetSubtitle(
      sheet,
      `Oluşturulma Tarihi: ${new Date().toLocaleDateString("tr-TR")}`,
      "A2:E2"
    );
    sheet.addRow([]);

    const headerRowIndex = 4;
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = sheet.columns.map((col) => col.header);
    applyHeaderRowStyle(headerRow);

    expensesData.forEach((item) => {
      const row = sheet.addRow({
        type: item.type || "-",
        amount: Number(item.amount || 0),
        date:
          item.expense_date?.toLocaleDateString("tr-TR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }) || "-",
        invoice: item.invoice_number || "-",
        description: item.description || "-",
      });

      applyCellStyle(row.getCell(1), { alignment: styles.alignLeft });
      applyCellStyle(row.getCell(2), {
        numFmt: styles.currencyFormat,
        alignment: styles.alignRight,
      });
      applyCellStyle(row.getCell(3), { alignment: styles.alignCenter });
      applyCellStyle(row.getCell(4), { alignment: styles.alignLeft });
      applyCellStyle(row.getCell(5), { alignment: styles.alignLeft });
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(["TOPLAM", totalAmount, "", "", ""]);
    totalRow.fill = styles.totalRowFill;
    totalRow.font = styles.totalRowFont;
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let cellStyle = {
        border: styles.totalRowBorder,
        alignment: styles.alignLeft,
      };
      if (colNumber === 2) {
        cellStyle = {
          ...cellStyle,
          numFmt: styles.currencyFormat,
          alignment: styles.alignRight,
        };
      }

      applyCellStyle(cell, {
        border: styles.totalRowBorder,
        alignment: cellStyle.alignment,
        numFmt: cellStyle.numFmt,
      });
    });
  };

  const createExpenseSummarySheet = (
    sheet,
    sortedExpenseTypes,
    reportPeriod,
    totalAmount
  ) => {
    sheet.columns = [
      { key: "type", header: "Gider Türü", width: 25 },
      { key: "amount", header: "Tutar", width: 20 },
      { key: "percentage", header: "Yüzde", width: 15 },
    ];

    addSheetTitle(sheet, `GİDER TÜRLERİ ÖZETİ (${reportPeriod})`, "A1:C1");
    sheet.addRow([]);

    const headerRowIndex = 3;
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = sheet.columns.map((col) => col.header);
    applyHeaderRowStyle(headerRow);

    sortedExpenseTypes.forEach(([type, amount]) => {
      const percentage = totalAmount > 0 ? amount / totalAmount : 0;
      const row = sheet.addRow({ type, amount, percentage });

      applyCellStyle(row.getCell(1), { alignment: styles.alignLeft });
      applyCellStyle(row.getCell(2), {
        numFmt: styles.currencyFormat,
        alignment: styles.alignRight,
      });
      applyCellStyle(row.getCell(3), {
        numFmt: styles.percentFormat,
        alignment: styles.alignRight,
      });
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(["TOPLAM", totalAmount, 1]);
    totalRow.fill = styles.totalRowFill;
    totalRow.font = styles.totalRowFont;
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let cellStyle = {
        border: styles.totalRowBorder,
        alignment: styles.alignLeft,
      };
      if (colNumber === 2) {
        cellStyle = {
          ...cellStyle,
          numFmt: styles.currencyFormat,
          alignment: styles.alignRight,
        };
      } else if (colNumber === 3) {
        cellStyle = {
          ...cellStyle,
          numFmt: styles.percentFormat,
          alignment: styles.alignRight,
        };
      }

      applyCellStyle(cell, {
        border: styles.totalRowBorder,
        alignment: cellStyle.alignment,
        numFmt: cellStyle.numFmt,
      });
    });
  };

  const exportToExcel = async () => {
    if (data.length === 0) {
      alert("Dışa aktarılacak veri bulunmamaktadır.");
      return;
    }

    setLoading(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Apartman Yönetim Sistemi";
      workbook.created = new Date();
      workbook.modified = new Date();

      let reportPeriod = "";
      if (filterType === "month") {
        reportPeriod = `${months[selectedMonth - 1]} ${selectedYear}`;
      } else if (filterType === "year") {
        reportPeriod = selectedYear.toString();
      } else if (filterType === "range" && startDate && endDate) {
        const formatDate = (dateString) => {
          if (!dateString) return "";
          try {
            const [year, month, day] = dateString.split("-");
            return `${day}.${month}.${year}`;
          } catch (e) {
            return dateString;
          }
        };
        reportPeriod = `${formatDate(startDate)} - ${formatDate(endDate)}`;
      } else {
        reportPeriod = "Tüm Zamanlar";
      }

      if (reportType === "payments") {
        createPaymentSheets(workbook, data, reportPeriod);
      } else {
        createExpenseSheets(workbook, data, reportPeriod);
      }

      const today = new Date();

      const dateStr = today
        .toLocaleDateString("tr-TR")
        .replace(/\./g, "-")
        .replace(/\//g, "-");

      const safePeriod = reportPeriod
        .replace(/[^a-zA-Z0-9_ŞşİıĞğÜüÖöÇç\-\s]/g, "")
        .replace(/\s+/g, "_");
      const safeReportType =
        reportType === "payments" ? "Odemeler" : "Giderler";
      const fileName = `Apartman_${safeReportType}_${safePeriod}_${dateStr}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("Excel export hatası:", err);
      setError(`Excel dosyası oluşturulurken hata: ${err.message}`);
      alert(
        `Excel dosyası oluşturulurken bir hata oluştu. Lütfen tekrar deneyin veya yöneticiye bildirin.\nHata: ${err.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-reports">
      <div className="filters">
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          className="report-type-select"
          disabled={loading}
        >
          <option value="payments">Ödemeler</option>
          <option value="expenses">Giderler</option>
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          disabled={loading}
        >
          <option value="month">Aylık</option>
          <option value="year">Yıllık</option>
          <option value="range">Tarih Aralığı</option>
        </select>

        {filterType === "month" && (
          <>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              disabled={loading}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              disabled={loading}
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
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            disabled={loading}
          >
            {yearOptions.map((year) => (
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
              placeholder="Başlangıç Tarihi"
              disabled={loading}
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="Bitiş Tarihi"
              disabled={loading}
            />
          </>
        )}

        {reportType === "payments" && (
          <select
            value={filters.userId}
            onChange={(e) => {
              setFilters((prev) => ({ ...prev, userId: e.target.value }));
            }}
            className="user-select"
            disabled={loading}
          >
            <option value="">Tüm Kullanıcılar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.apartment_number || "?"} - {u.first_name || ""}{" "}
                {u.last_name || ""}
              </option>
            ))}
          </select>
        )}

        <button onClick={exportToExcel} disabled={loading || data.length === 0}>
          {loading ? "Oluşturuluyor..." : "Excel'e Aktar"}
        </button>
      </div>

      {loading && (
        <div className="loading">
          Rapor verileri yükleniyor, lütfen bekleyin...
        </div>
      )}
      {error && <div className="error">Hata: {error}</div>}
      {!loading && !error && data.length === 0 && (
        <div className="no-data">
          Seçili kriterlere uygun kayıt bulunmamaktadır.
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <div className="table-container">
          {" "}
          <table className="payments-table">
            <thead>
              <tr>
                {reportType === "payments" ? (
                  <>
                    <th>Daire No</th>
                    <th>Ad Soyad</th>
                    <th>Ödeme Türü</th>
                    <th>Tutar</th>
                    <th>Atama Tarihi</th>
                    <th>Ödeme Tarihi</th>
                    <th>Açıklama</th>
                    <th>Durum</th>
                  </>
                ) : (
                  <>
                    <th>Gider Türü</th>
                    <th>Tutar</th>
                    <th>Tarih</th>
                    <th>Fatura No</th>
                    <th>Açıklama</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr
                  key={item.id}
                  className={reportType === "expenses" ? "expense-row" : ""}
                >
                  {reportType === "payments" ? (
                    <>
                      <td>{item.apartment_number || "-"}</td>
                      <td>{item.user_name || "-"}</td>
                      <td>{item.type || "-"}</td>
                      <td>{formatCurrency(item.amount)}</td>
                      <td>
                        {item.created_date
                          ? item.created_date.toLocaleDateString("tr-TR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })
                          : "-"}
                      </td>
                      <td>
                        {item.payment_date
                          ? item.payment_date.toLocaleDateString("tr-TR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })
                          : "-"}
                      </td>
                      <td className="description-cell">{item.note || "-"}</td>

                      <td>
                        <span
                          className={`status-badge ${
                            item.is_paid ? "paid" : "unpaid"
                          }`}
                        >
                          {item.is_paid ? "Ödendi" : "Ödenmedi"}
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{item.type || "-"}</td>
                      <td>{formatCurrency(item.amount)}</td>
                      <td>
                        {item.expense_date
                          ? item.expense_date.toLocaleDateString("tr-TR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })
                          : "-"}
                      </td>
                      <td>{item.invoice_number || "-"}</td>
                      <td className="description-cell">
                        {item.description || "-"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminReports;
