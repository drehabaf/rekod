"use client";

import React, { useEffect, useMemo, useState } from "react";

const monthNames = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"];
const NEW_LINE = String.fromCharCode(10);
const STORAGE_KEY = "drehab_records";

const timeSlots = [
  { session: "SESI PAGI", times: ["10:30 AM", "11:30 AM", "12:30 PM", "01:30 PM"] },
  { session: "SESI PETANG", times: ["03:00 PM", "04:00 PM", "05:00 PM", "06:00 PM"] },
  { session: "SESI MALAM", times: ["08:00 PM", "09:00 PM", "10:00 PM", "11:00 PM"] },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function twoDigitMonth(value) {
  const numberValue = Number(value);
  return numberValue < 10 ? "0" + numberValue : String(numberValue);
}

// Format IC: ******-**-****
function formatIC(input) {
  const digits = String(input || "").replace(/\D/g, "").slice(0, 12);
  const p1 = digits.slice(0, 6);
  const p2 = digits.slice(6, 8);
  const p3 = digits.slice(8, 12);
  let out = p1;
  if (p2) out += "-" + p2;
  if (p3) out += "-" + p3;
  return out;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function getDefaultRecords() {
  return [];
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadRecordsFromStorage() {
  if (!canUseLocalStorage()) return getDefaultRecords();
  const savedRecords = window.localStorage.getItem(STORAGE_KEY);
  if (!savedRecords) return getDefaultRecords();

  try {
    const parsedRecords = JSON.parse(savedRecords);
    return Array.isArray(parsedRecords) ? parsedRecords : getDefaultRecords();
  } catch (error) {
    console.error("Gagal baca localStorage:", error);
    return getDefaultRecords();
  }
}

function saveRecordsToStorage(records) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function currency(value) {
  return new Intl.NumberFormat("ms-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function calculateCommission(amount, percent) {
  return (Number(amount || 0) * Number(percent || 0)) / 100;
}

function getSummary(records) {
  const totalPesakit = records.length;
  const totalBayaran = records.reduce((sum, item) => sum + Number(item.harga || 0), 0);
  const totalKomisen = records.reduce((sum, item) => sum + calculateCommission(item.harga, item.komisen), 0);
  const tunai = records.filter((item) => item.bayaran === "Tunai").reduce((sum, item) => sum + Number(item.harga || 0), 0);
  const fpx = records.filter((item) => item.bayaran === "FPX").reduce((sum, item) => sum + Number(item.harga || 0), 0);
  return { totalPesakit, totalBayaran, totalKomisen, tunai, fpx };
}

function getTherapistCommissionSummary(records) {
  const grouped = {};
  records.forEach((item) => {
    const therapistName = String(item.juruterapi || "TIDAK DINYATAKAN").trim() || "TIDAK DINYATAKAN";
    if (!grouped[therapistName]) {
      grouped[therapistName] = {
        name: therapistName,
        totalPesakit: 0,
        totalSales: 0,
        totalCommission: 0,
      };
    }
    grouped[therapistName].totalPesakit += 1;
    grouped[therapistName].totalSales += Number(item.harga || 0);
    grouped[therapistName].totalCommission += calculateCommission(item.harga, item.komisen);
  });

  return Object.keys(grouped)
    .map((key) => grouped[key])
    .sort((a, b) => b.totalCommission - a.totalCommission);
}

function filterPatientRecords(records, search, filterDate) {
  return records.filter((item) => {
    const searchableText = [item.nama, item.noKadPengenalan, item.bayaran, item.pakej, item.juruterapi]
      .join(" ")
      .toLowerCase();
    const matchSearch = searchableText.indexOf(String(search || "").toLowerCase()) !== -1;
    const matchDate = filterDate ? item.tarikh === filterDate : true;
    return matchSearch && matchDate;
  });
}

function getMonthKey(dateText) {
  return String(dateText || "").slice(0, 7);
}

function filterMonthlyRecords(records, monthKey) {
  return records.filter((item) => getMonthKey(item.tarikh) === monthKey);
}

function escapeCSVCell(cell) {
  return '"' + String(cell == null ? "" : cell).replace(/"/g, '""') + '"';
}

function buildCSV(headers, rows) {
  return [headers]
    .concat(rows)
    .map((row) => row.map(escapeCSVCell).join(","))
    .join(NEW_LINE);
}

function getProgressPercent(current, target) {
  const safeTarget = Number(target || 0);
  if (safeTarget <= 0) return 0;
  return Math.min(100, Math.round((Number(current || 0) / safeTarget) * 100));
}

function getYearlyMonthlyProgress(records, year, monthlyTarget) {
  return monthNames.map((monthName, index) => {
    const monthKey = String(year) + "-" + twoDigitMonth(index + 1);
    const count = records.filter((item) => getMonthKey(item.tarikh) === monthKey).length;
    return {
      month: monthName,
      monthKey,
      count,
      target: Number(monthlyTarget || 0),
      percent: getProgressPercent(count, monthlyTarget),
    };
  });
}

function getYearlyTarget(monthlyTarget) {
  return Number(monthlyTarget || 0) * 12;
}

function getPackageSessionCount(packageText) {
  const text = String(packageText || "");
  let digits = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char >= "0" && char <= "9") {
      digits += char;
    } else if (digits) {
      break;
    }
  }
  return digits ? Number(digits) : 0;
}

function getPackageKey(record) {
  return [record.nama, record.noKadPengenalan || "", record.pakej].join("__");
}

function getPackageGroups(records) {
  const grouped = {};
  records.forEach((record) => {
    const totalSessions = getPackageSessionCount(record.pakej);
    if (!record.pakej || totalSessions <= 1) return;
    const key = getPackageKey(record);
    if (!grouped[key]) {
      grouped[key] = {
        key,
        nama: record.nama,
        noKadPengenalan: record.noKadPengenalan || "",
        pakej: record.pakej,
        totalSessions,
        records: [],
      };
    }
    grouped[key].records.push(record);
  });

  return Object.keys(grouped).map((key) => {
    const group = grouped[key];
    group.records.sort((a, b) => String(a.tarikh + a.masa).localeCompare(String(b.tarikh + b.masa)));
    group.completedSessions = Math.min(group.records.length, group.totalSessions);
    group.remainingSessions = Math.max(0, group.totalSessions - group.completedSessions);
    group.percent = getProgressPercent(group.completedSessions, group.totalSessions);
    return group;
  });
}

function runTests() {
  const testRecords = [
    { nama: "A", noKadPengenalan: "", tarikh: "2026-04-25", masa: "10:30 AM", harga: 100, komisen: 5, bayaran: "Tunai", pakej: "3 Sesi", juruterapi: "Ali" },
    { nama: "A", noKadPengenalan: "", tarikh: "2026-04-26", masa: "11:30 AM", harga: 100, komisen: 5, bayaran: "Tunai", pakej: "3 Sesi", juruterapi: "Ali" },
    { nama: "B", noKadPengenalan: "", tarikh: "2026-04-25", masa: "03:00 PM", harga: 200, komisen: 15, bayaran: "FPX", pakej: "Platinum", juruterapi: "Hanis" },
    { nama: "C", noKadPengenalan: "", tarikh: "2026-05-26", masa: "04:00 PM", harga: "50", komisen: "2.50", bayaran: "Tunai", pakej: "", juruterapi: "Mumtazah" },
  ];
  console.assert(calculateCommission(100, 5) === 5, "Komisen 5% dari RM100 perlu jadi RM5");
  console.assert(getSummary(testRecords).totalPesakit === 4, "Jumlah pesakit perlu jadi 4");
  console.assert(getSummary(testRecords).totalBayaran === 450, "Jumlah bayaran perlu jadi RM450");
  console.assert(getTherapistCommissionSummary(testRecords).length === 3, "Ringkasan komisen perlu group ikut 3 juruterapi");
  console.assert(getTherapistCommissionSummary(testRecords)[0].name === "Hanis", "Hanis perlu paling tinggi komisen dalam test");
  console.assert(filterPatientRecords(testRecords, "Hanis", "2026-04-25").length === 1, "Carian Hanis perlu jumpa 1 rekod");
  console.assert(escapeCSVCell('Ali "Test"') === '"Ali ""Test"""', "CSV perlu escape double quote");
  console.assert(buildCSV(["Nama"], [["Ali"]]) === '"Nama"' + NEW_LINE + '"Ali"', "CSV ringkas perlu betul");
  console.assert(twoDigitMonth(4) === "04", "Bulan 4 perlu jadi 04");
  console.assert(getProgressPercent(120, 100) === 100, "Progress maksimum 100%");
  console.assert(getYearlyMonthlyProgress(testRecords, 2026, 100)[3].count === 3, "April 2026 perlu ada 3 pesakit");
  console.assert(getYearlyTarget(100) === 1200, "Sasaran tahunan perlu jadi 1200");
  console.assert(getPackageSessionCount("3 Sesi") === 3, "Pakej 3 Sesi perlu detect 3");
  console.assert(getPackageSessionCount("10x Rawatan") === 10, "Pakej 10x perlu detect 10");
  console.assert(getPackageGroups(testRecords).length === 1, "Hanya pakej bernombor lebih 1 perlu dipaparkan");
  console.assert(getPackageGroups(testRecords)[0].completedSessions === 2, "A perlu ada 2 sesi selesai");
  console.assert(getDefaultRecords().length === 0, "Default records perlu kosong tanpa contoh pesakit");
}

runTests();

export default function SenaraiPesakitHarianApp() {
  const [records, setRecords] = useState(() => loadRecordsFromStorage());
  const [form, setForm] = useState({
    nama: "",
    noKadPengenalan: "",
    tarikh: today(),
    masa: "10:30 AM",
    bayaran: "Tunai",
    pakej: "",
    harga: "",
    komisen: "",
    juruterapi: "",
  });
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState(today());
  const [selectedYear, setSelectedYear] = useState(getCurrentYear());
  const [monthlyTarget, setMonthlyTarget] = useState(100);
  const [activeTab, setActiveTab] = useState("form");

  useEffect(() => {
    saveRecordsToStorage(records);
  }, [records]);

  function updateForm(key, value) {
    const upperCaseFields = ["nama", "pakej", "juruterapi"];
    setForm((prev) => ({
      ...prev,
      [key]: upperCaseFields.includes(key) ? String(value || "").toUpperCase() : value,
    }));
  }

  function addRecord(e) {
    e.preventDefault();
    if (!form.nama.trim()) return;
    const newRecord = {
      id: createId(),
      nama: form.nama.trim(),
      noKadPengenalan: form.noKadPengenalan ? form.noKadPengenalan.trim() : "",
      tarikh: form.tarikh,
      masa: form.masa,
      bayaran: form.bayaran,
      pakej: form.pakej.trim(),
      harga: Number(form.harga || 0),
      komisen: Number(form.komisen || 0),
      juruterapi: form.juruterapi.trim(),
    };
    setRecords((prev) => [newRecord].concat(prev));
    setForm((prev) => ({
      ...prev,
      nama: "",
      noKadPengenalan: "",
      masa: "10:30 AM",
      pakej: "",
      harga: "",
      komisen: "",
      juruterapi: "",
    }));
  }

  function deleteRecord(id) {
    setRecords((prev) => prev.filter((item) => item.id !== id));
  }

  function resetLocalData() {
    const confirmed = window.confirm("Padam semua rekod dalam localStorage? Tindakan ini tidak boleh undo.");
    if (!confirmed) return;
    if (canUseLocalStorage()) window.localStorage.removeItem(STORAGE_KEY);
    setRecords(getDefaultRecords());
  }

  function openGoogleSheet() {
    window.open("https://docs.google.com/spreadsheets/u/0/?authuser=drehabaf@gmail.com", "_blank", "noopener,noreferrer");
  }

  const filteredRecords = useMemo(() => filterPatientRecords(records, search, filterDate), [records, search, filterDate]);
  const summaryMonthKey = getMonthKey(filterDate || today());
  const monthlySummaryRecords = useMemo(() => filterMonthlyRecords(records, summaryMonthKey), [records, summaryMonthKey]);
  const summary = useMemo(() => getSummary(monthlySummaryRecords), [monthlySummaryRecords]);
  const yearlyProgress = useMemo(() => getYearlyMonthlyProgress(records, selectedYear, monthlyTarget), [records, selectedYear, monthlyTarget]);
  const yearlyTotal = useMemo(() => yearlyProgress.reduce((sum, item) => sum + item.count, 0), [yearlyProgress]);
  const yearlyTarget = getYearlyTarget(monthlyTarget);
  const yearlyPercent = getProgressPercent(yearlyTotal, yearlyTarget);

  function exportCSV() {
    const headers = ["Nama", "No Kad Pengenalan", "Tarikh", "Masa", "Bayaran", "Pakej", "Jumlah Bayaran", "Komisen %", "Komisen (RM)", "Juruterapi"];
    const rows = filteredRecords.map((item) => [
      item.nama,
      item.noKadPengenalan || "",
      item.tarikh,
      item.masa,
      item.bayaran,
      item.pakej,
      item.harga,
      item.komisen,
      calculateCommission(item.harga, item.komisen).toFixed(2),
      item.juruterapi,
    ]);
    const csv = buildCSV(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "senarai-pesakit-" + (filterDate || "semua") + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const dashboardProps = {
    summary,
    monthlySummaryRecords,
    selectedYear,
    setSelectedYear,
    monthlyTarget,
    setMonthlyTarget,
    yearlyTotal,
    yearlyTarget,
    yearlyPercent,
    yearlyProgress,
    search,
    setSearch,
    filterDate,
    setFilterDate,
    filteredRecords,
    deleteRecord,
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] p-3 text-slate-900 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <Header exportCSV={exportCSV} openGoogleSheet={openGoogleSheet} resetLocalData={resetLocalData} />
        <div className="flex w-full flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/80 md:w-fit">
          <TabButton label="Borang" active={activeTab === "form"} onClick={() => setActiveTab("form")} color="bg-blue-600" />
          <TabButton label="Statistik" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} color="bg-emerald-500" />
          <TabButton label="Pakej" active={activeTab === "packages"} onClick={() => setActiveTab("packages")} color="bg-violet-500" />
        </div>
        {activeTab === "form" ? <PatientForm form={form} onSubmit={addRecord} onUpdate={updateForm} /> : null}
        {activeTab === "dashboard" ? <DashboardContent {...dashboardProps} /> : null}
        {activeTab === "packages" ? <PackageContent records={records} /> : null}
      </div>
      <style>{`
        .input{
          text-transform: uppercase;
          width: 100%;
          border-radius: 0.85rem;
          border: 1px solid #d6dde8;
          background: #ffffff;
          padding: 0.72rem 0.9rem;
          font-weight: 600;
          outline: none;
          transition: 0.18s ease;
        }
        .input:focus{
          border-color: #06b6d4;
          box-shadow: 0 0 0 4px rgba(6, 182, 212, 0.14);
        }
      `}</style>
    </div>
  );
}

function Header({ exportCSV, openGoogleSheet, resetLocalData }) {
  return (
    <header className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
      <div className="h-2 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500" />
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Pusat Kesihatan Drehab AF</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 md:text-4xl">Senarai Data Pesakit</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500 md:text-base">Rekod Senarai Pesakit, Juruterapi Bertugas, Komisen & Pakej Rawatan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCSV} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-md"><Icon label="download" /> Export CSV</button>
          <button type="button" onClick={openGoogleSheet} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:shadow-md"><Icon label="sheet" /> Google Sheet</button>
          <button type="button" onClick={resetLocalData} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:shadow-md"><Icon label="reset" /> Reset</button>
        </div>
      </div>
    </header>
  );
}

function PatientForm({ form, onSubmit, onUpdate }) {
  return (
    <section className="w-full max-w-2xl">
      <form onSubmit={onSubmit} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 md:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><Icon label="plus" /></div>
          <div><h2 className="text-lg font-bold text-slate-950">Tambah Rekod Pesakit</h2><p className="text-sm font-medium text-slate-500">Isi maklumat rawatan harian.</p></div>
        </div>
        <div className="space-y-3">
          <Field label="Nama Pesakit"><input className="input" value={form.nama} onChange={(e) => onUpdate("nama", e.target.value)} placeholder="Contoh: Ahmad bin Ali" /></Field>
          <Field label="No Kad Pengenalan (Optional)"><input className="input" inputMode="numeric" maxLength={14} value={form.noKadPengenalan || ""} onChange={(e) => onUpdate("noKadPengenalan", formatIC(e.target.value))} placeholder="Contoh: 900101-01-1234" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarikh"><input className="input" type="date" value={form.tarikh} onChange={(e) => onUpdate("tarikh", e.target.value)} /></Field>
            <Field label="Masa"><select className="input" value={form.masa} onChange={(e) => onUpdate("masa", e.target.value)}>{timeSlots.map((group) => <optgroup key={group.session} label={group.session}>{group.times.map((time) => <option key={time} value={time}>{time}</option>)}</optgroup>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bayaran"><select className="input" value={form.bayaran} onChange={(e) => onUpdate("bayaran", e.target.value)}><option>Tunai</option><option>FPX</option></select></Field>
            <Field label="Pakej"><input className="input" value={form.pakej} onChange={(e) => onUpdate("pakej", e.target.value)} placeholder="Contoh: 3 Sesi" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jumlah Bayaran (RM)"><input className="input" type="number" min="0" step="0.01" value={form.harga} onChange={(e) => onUpdate("harga", e.target.value)} placeholder="Contoh: 139" /></Field>
            <Field label="Komisen %"><input className="input" type="number" min="0" max="100" step="0.01" value={form.komisen} onChange={(e) => onUpdate("komisen", e.target.value)} placeholder="Contoh: 5" /></Field>
          </div>
          <Field label="Juruterapi"><input className="input" value={form.juruterapi} onChange={(e) => onUpdate("juruterapi", e.target.value)} placeholder="Isi nama juruterapi" /></Field>
          <div className="rounded-xl bg-cyan-50 p-4 text-sm font-semibold text-cyan-900">Komisen (RM): {currency(calculateCommission(form.harga, form.komisen))}</div>
          <button type="submit" className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-95">Simpan Rekod</button>
        </div>
      </form>
    </section>
  );
}

function DashboardContent(props) {
  const [showYearlyPopup, setShowYearlyPopup] = useState(false);
  const maxMonthCount = Math.max.apply(null, props.yearlyProgress.map((item) => item.count).concat([1]));
  const therapistCommission = getTherapistCommissionSummary(props.monthlySummaryRecords || []);
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5"><SummaryCard icon="👥" label="Pesakit" value={props.summary.totalPesakit} /><SummaryCard icon="💳" label="Jumlah Bayaran" value={currency(props.summary.totalBayaran)} /><SummaryCard icon="%" label="Komisen" value={currency(props.summary.totalKomisen)} /><SummaryCard icon="💵" label="Tunai" value={currency(props.summary.tunai)} /><SummaryCard icon="🏦" label="FPX" value={currency(props.summary.fpx)} /></section>
      <CommissionSection data={therapistCommission} />
      <YearlyCard props={props} maxMonthCount={maxMonthCount} onOpen={() => setShowYearlyPopup(true)} />
      {showYearlyPopup ? <YearlyPopup {...props} onClose={() => setShowYearlyPopup(false)} /> : null}
      <RecordsTable search={props.search} setSearch={props.setSearch} filterDate={props.filterDate} setFilterDate={props.setFilterDate} records={props.filteredRecords} deleteRecord={props.deleteRecord} />
    </>
  );
}

function YearlyCard({ props, maxMonthCount, onOpen }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 md:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Statistik Tahunan</p><h2 className="mt-1 text-xl font-bold text-slate-950 md:text-2xl">Ringkasan Pesakit Bulanan</h2><p className="mt-1 text-sm font-medium text-slate-500">Tahun {props.selectedYear} • {props.yearlyTotal} pesakit setahun • sasaran {props.yearlyTarget} pesakit setahun</p></div><div className="grid w-full gap-3 md:w-[360px] md:grid-cols-2"><Field label="Tahun"><input className="input" type="number" min="2020" value={props.selectedYear} onChange={(e) => props.setSelectedYear(e.target.value)} /></Field><Field label="Sasaran / Bulan"><input className="input" type="number" min="1" value={props.monthlyTarget} onChange={(e) => props.setMonthlyTarget(e.target.value)} /></Field></div></div>
      <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-slate-200 bg-[#f7f8fa] p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-sm"><div className="mb-3 flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-slate-950">Bulanan 12 Bulan</p><p className="mt-0.5 text-[11px] font-semibold text-slate-500">Tekan untuk lihat progress penuh</p></div><div className="text-right"><p className="text-xl font-bold leading-none text-blue-600">{props.yearlyTotal}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">pesakit</p></div></div><div className="rounded-2xl bg-white px-2 py-3 ring-1 ring-slate-200"><div className="grid h-24 grid-cols-12 items-end gap-1">{props.yearlyProgress.map((item, index) => { const barPercent = Math.max(4, Math.round((item.count / maxMonthCount) * 100)); return <div key={item.monthKey} className="flex h-full min-w-0 flex-col items-center justify-end gap-1"><div className="text-[8px] font-bold leading-none text-slate-500">{item.count}</div><div className="flex h-14 w-full max-w-[10px] items-end overflow-hidden rounded-full bg-slate-100"><div className="w-full rounded-full bg-gradient-to-t from-blue-600 to-emerald-400 transition-all" style={{ height: barPercent + "%" }} /></div><div className="text-[8px] font-bold leading-none text-slate-500">{index + 1}</div></div>; })}</div><div className="mt-2 grid grid-cols-4 gap-1 text-center text-[9px] font-bold text-slate-400"><span>1-3</span><span>4-6</span><span>7-9</span><span>10-12</span></div></div><div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-slate-200"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-950">Progress Tahunan</p><p className="text-xs font-bold text-blue-600">{props.yearlyPercent}%</p></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500" style={{ width: props.yearlyPercent + "%" }} /></div></div></button>
    </section>
  );
}

function CommissionSection({ data = [] }) {
  const [showCommissionPopup, setShowCommissionPopup] = useState(false);
  const totalTherapist = data.length;
  const totalPatients = data.reduce((sum, item) => sum + item.totalPesakit, 0);
  const totalSales = data.reduce((sum, item) => sum + item.totalSales, 0);
  const totalCommission = data.reduce((sum, item) => sum + item.totalCommission, 0);
  return (
    <>
      <button type="button" onClick={() => setShowCommissionPopup(true)} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:border-emerald-200 hover:bg-emerald-50/40 md:p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">Komisen Juruterapi</p><h2 className="mt-0.5 text-base font-bold text-slate-950">Ringkasan Bulanan</h2><p className="mt-1 text-[11px] font-medium text-slate-500">Tekan untuk lihat pecahan komisen setiap juruterapi.</p></div><div className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-right ring-1 ring-emerald-100"><p className="text-sm font-black leading-none text-emerald-700">{currency(totalCommission)}</p><p className="mt-1 text-[9px] font-bold leading-none text-emerald-500">TOTAL</p></div></div><div className="mt-3 grid grid-cols-3 gap-2"><MiniStat value={totalTherapist} label="Juruterapi" /><MiniStat value={totalPatients} label="Pesakit" /><MiniStat value={currency(totalSales)} label="Sales" blue /></div></button>
      {showCommissionPopup ? <CommissionPopup data={data} totalTherapist={totalTherapist} totalPatients={totalPatients} totalCommission={totalCommission} onClose={() => setShowCommissionPopup(false)} /> : null}
    </>
  );
}

function MiniStat({ value, label, blue }) {
  return <div className="rounded-xl bg-[#f8fafc] p-2 text-center ring-1 ring-slate-200"><p className={"truncate text-sm font-black " + (blue ? "text-blue-600" : "text-slate-950")}>{value}</p><p className="text-[9px] font-bold text-slate-400">{label}</p></div>;
}

function CommissionPopup({ data, totalTherapist, totalPatients, totalCommission, onClose }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 md:items-center"><div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-200 md:p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Komisen Juruterapi</p><h3 className="mt-1 text-xl font-bold text-slate-950">Pecahan Komisen Bulanan</h3><p className="mt-1 text-sm font-medium text-slate-500">Rekod bulanan Komisen Juruterapi</p></div><button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">Tutup</button></div><div className="mb-3 grid grid-cols-3 gap-2"><MiniStat value={totalTherapist} label="Juruterapi" /><MiniStat value={totalPatients} label="Pesakit" /><div className="rounded-xl bg-emerald-50 p-3 text-center ring-1 ring-emerald-100"><p className="text-base font-black text-emerald-700">{currency(totalCommission)}</p><p className="text-[10px] font-bold text-emerald-500">Komisen</p></div></div>{data.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-[#f8fafc] p-4 text-center"><p className="text-xs font-bold text-slate-500">Belum ada komisen untuk bulan ini.</p></div> : <div className="space-y-1.5">{data.map((item) => <div key={item.name} className="rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5"><div className="flex items-center justify-between gap-2"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold leading-tight text-slate-950">{item.name}</p><p className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-500">{item.totalPesakit} pesakit • Sales {currency(item.totalSales)}</p></div><div className="shrink-0 rounded-lg bg-white px-2 py-1 text-right ring-1 ring-slate-200"><p className="text-xs font-black leading-none text-emerald-600">{currency(item.totalCommission)}</p><p className="mt-0.5 text-[8px] font-bold leading-none text-slate-400">KOMISEN</p></div></div></div>)}</div>}</div></div>;
}

function YearlyPopup(props) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 md:items-center"><div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl md:p-6"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Progress Bulanan</p><h3 className="mt-1 text-xl font-bold text-slate-950">Bulan 1 Hingga 12 — {props.selectedYear}</h3><p className="mt-1 text-sm font-medium text-slate-500">Sasaran {props.monthlyTarget} pesakit setiap bulan.</p></div><button type="button" onClick={props.onClose} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">Tutup</button></div><div className="space-y-3">{props.yearlyProgress.map((item, index) => <div key={item.monthKey} className="rounded-2xl border border-slate-200 bg-[#f7f8fa] p-4"><div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-950">Bulan {index + 1} • {item.month}</p><p className="text-xs font-semibold text-slate-500">{item.count} / {item.target} pesakit</p></div><p className="text-lg font-bold text-blue-600">{item.percent}%</p></div><div className="h-4 overflow-hidden rounded-full bg-white ring-1 ring-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all" style={{ width: item.percent + "%" }} /></div></div>)}</div></div></div>;
}

function RecordsTable(props) {
  return (
    <main className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 md:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Rekod Rawatan</h2>
          <p className="text-sm font-medium text-slate-500">Paparan mengikut tarikh dan carian.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <input className="input" value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="Cari nama/pakej" />
          <input className="input" type="date" value={props.filterDate} onChange={(e) => props.setFilterDate(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#f7f8fa] text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Tarikh</th>
              <th className="px-4 py-3">Masa</th>
              <th className="px-4 py-3">Bayaran</th>
              <th className="px-4 py-3">Pakej</th>
              <th className="px-4 py-3">Jumlah</th>
              <th className="px-4 py-3">Komisen %</th>
              <th className="px-4 py-3">Komisen (RM)</th>
              <th className="px-4 py-3">Juruterapi</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {props.records.length === 0 ? (
              <tr>
                <td colSpan="10" className="px-4 py-10 text-center font-semibold text-slate-400">Tiada rekod untuk paparan ini.</td>
              </tr>
            ) : (
              props.records.map((item) => (
                <tr key={item.id} className="hover:bg-cyan-50/50">
                  <td className="px-4 py-4 font-bold text-slate-950">{item.nama}</td>
                  <td className="px-4 py-4 text-slate-600">{item.tarikh}</td>
                  <td className="px-4 py-4 text-slate-600">{item.masa}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{item.bayaran}</span></td>
                  <td className="px-4 py-4 font-semibold text-slate-700">{item.pakej || "-"}</td>
                  <td className="px-4 py-4 font-bold text-blue-600">{currency(item.harga)}</td>
                  <td className="px-4 py-4 font-bold text-emerald-600">{Number(item.komisen || 0)}%</td>
                  <td className="px-4 py-4 font-bold text-emerald-600">{currency(calculateCommission(item.harga, item.komisen))}</td>
                  <td className="px-4 py-4 text-slate-700">{item.juruterapi || "-"}</td>
                  <td className="px-4 py-4 text-right"><button type="button" onClick={() => props.deleteRecord(item.id)} className="rounded-lg p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Padam">🗑️</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function PackageContent({ records }) {
  const packageGroups = getPackageGroups(records);
  return <main className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80 md:p-5"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">Pakej Rawatan</p><h2 className="mt-0.5 text-base font-bold text-slate-950">Jadual Pesakit (Pakej)</h2><p className="mt-1 text-[11px] font-medium leading-4 text-slate-500">Tick sesi akan bertambah bila pesakit sama daftar rawatan dengan pakej sama.</p></div>{packageGroups.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-[#f8fafc] p-4 text-center"><p className="text-xs font-bold text-slate-500">Belum ada rekod pakej.</p><p className="mt-1 text-[10px] font-medium text-slate-400">Contoh: 3 Sesi, 5 Sesi atau 10 Sesi.</p></div> : <div className="space-y-1.5">{packageGroups.map((group) => <div key={group.key} className="rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5"><div className="flex items-center justify-between gap-2"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold leading-tight text-slate-950">{group.nama}</p><p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-slate-500">{group.pakej} • Baki {group.remainingSessions}</p></div><div className="shrink-0 rounded-lg bg-white px-2 py-1 text-center ring-1 ring-slate-200"><p className="text-[11px] font-black leading-none text-violet-600">{group.completedSessions}/{group.totalSessions}</p><p className="mt-0.5 text-[8px] font-bold leading-none text-slate-400">SESI</p></div></div><div className="mt-2 flex flex-wrap gap-1">{Array.from({ length: group.totalSessions }).map((_, index) => { const done = index < group.completedSessions; return <span key={index} className={"inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ring-1 " + (done ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-white text-slate-300 ring-slate-200")} title={"Sesi " + (index + 1)}>{done ? "✓" : index + 1}</span>; })}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500" style={{ width: group.percent + "%" }} /></div></div>)}</div>}</main>;
}

function TabButton({ label, active, onClick, color }) {
  return <button type="button" onClick={onClick} className={"flex-1 rounded-xl px-4 py-2 text-sm font-bold transition md:flex-none " + (active ? color + " text-white" : "bg-transparent text-slate-600 hover:bg-slate-100")}>{label}</button>;
}

function Icon({ label }) {
  const icons = { plus: "+", download: "⬇️", sheet: "📊", reset: "♻️" };
  return <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center text-lg font-bold leading-none">{icons[label] || "•"}</span>;
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}

function SummaryCard({ icon, label, value }) {
  return (
    <div className="rounded-xl bg-white p-2 text-center shadow-sm ring-1 ring-slate-200/80">
      <div className="mb-1 flex justify-center">
        <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-xs font-bold text-cyan-700">
          {icon}
        </div>
      </div>
      <p className="text-[9px] font-bold tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black leading-tight text-slate-950">{value}</p>
    </div>
  );
}
