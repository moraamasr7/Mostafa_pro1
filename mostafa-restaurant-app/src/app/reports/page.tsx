'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'
import Link from 'next/link'

interface CanonicalReportData {
  shiftId: string
  shiftNumber: number
  shiftStatus: 'open' | 'closed'
  openedBy: string
  openedAt: string
  closedBy?: string | null
  closedAt?: string | null
  totalSales: number
  cashSales: number
  instapaySales: number
  walletSales: number
  otherElectronicSales: number
  nonCashSales: number
  driverCustodyCash: number
  uncollectedCash: number
  totalOrdersCount: number
  averageOrderValue: number
  deliverySales: number
  deliveryOrdersCount: number
  takeawaySales: number
  takeawayOrdersCount: number
  productSales?: number
  deliveryFeesTotal?: number
  initialCash: number
  totalExpenses: number
  generalExpenses: number
  driverAdvances: number
  staffAdvances: number
  expectedCash: number
  actualCash?: number | null
  discrepancy?: number | null
  activeDriversCount: number
  deliveryTripsCount: number
  fleetAccounting?: {
    hourlyRate: number
    driversCount: number
    totalHours: number
    totalHoursWage: number
    totalDeliveredOrders: number
    totalDeliveryCommissions: number
    totalDriverAdvances: number
    totalNetPayout: number
  } | null
  cancelledOrdersCount: number
  cancelledAmount: number
  failedOrdersCount: number
  notes?: string | null
}

interface ShiftListItem {
  id: string
  shift_number: number
  status: string
  opened_by: string
  opened_at: string
  closed_at?: string | null
}

type ReportTab = 'overview' | 'financial' | 'orders_fleet' | 'expenses'

export default function ReportsExecutiveCenterPage() {
  const [loading, setLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [shiftsList, setShiftsList] = useState<ShiftListItem[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string>('')
  const [report, setReport] = useState<CanonicalReportData | null>(null)
  const [activeTab, setActiveTab] = useState<ReportTab>('overview')

  const [isSendingTelegram, setIsSendingTelegram] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // ==========================================
  // FETCH SHIFTS LIST & ACTIVE REPORT
  // ==========================================
  const fetchShiftsAndReport = useCallback(async (shiftIdToLoad?: string, isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    } else {
      setIsSyncing(true)
    }
    setActionError(null)

    try {
      // 1. Fetch available shifts
      const { data: shiftsData, error: shiftsErr } = await supabase
        .from('daily_shifts')
        .select('id, shift_number, status, opened_by, opened_at, closed_at')
        .order('opened_at', { ascending: false })
        .limit(15)

      if (shiftsErr || !shiftsData || shiftsData.length === 0) {
        setShiftsList([])
        setReport(null)
        setLoading(false)
        setIsSyncing(false)
        return
      }

      setShiftsList(shiftsData as ShiftListItem[])

      // Target shift ID: requested > current selected > latest shift
      const targetId = shiftIdToLoad || selectedShiftId || shiftsData[0].id
      setSelectedShiftId(targetId)

      // 2. Fetch canonical report for target shift
      const reportRes = await fetch(`/api/admin/daily-report?shift_id=${targetId}`)
      const reportJson = await reportRes.json()

      if (reportRes.ok && reportJson.success && reportJson.report) {
        setReport(reportJson.report)
      } else {
        setReport(null)
        if (!isBackground) {
          setActionError(reportJson.error || 'تعذر استخراج بيانات التقرير لهذه الوردية')
        }
      }
    } catch {
      if (!isBackground) {
        setActionError('حدث خطأ في الاتصال أثناء جلب التقرير')
      }
    } finally {
      setLoading(false)
      setIsSyncing(false)
    }
  }, [selectedShiftId])

  // Debounced realtime trigger
  const scheduleBackgroundSync = useCallback(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current)
    }
    syncDebounceRef.current = setTimeout(() => {
      fetchShiftsAndReport(selectedShiftId, true)
    }, 300)
  }, [fetchShiftsAndReport, selectedShiftId])

  useEffect(() => {
    fetchShiftsAndReport(undefined, false)

    const channel = supabase
      .channel('reports-center-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_expenses' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => scheduleBackgroundSync())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
    }
  }, [fetchShiftsAndReport, scheduleBackgroundSync])

  // Handle shift selection switch
  const handleSelectShift = (shiftId: string) => {
    setSelectedShiftId(shiftId)
    fetchShiftsAndReport(shiftId, false)
  }

  // Handle Telegram dispatch (Existing Backend Endpoint)
  const handleSendTelegram = async () => {
    if (!report?.shiftId) return
    setIsSendingTelegram(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch(`/api/admin/daily-report?shift_id=${report.shiftId}`, {
        method: 'POST',
      })
      const data = await res.json()

      if (res.ok && data.success) {
        if (data.telegram_sent) {
          setActionSuccess('تم إرسال التقرير التنفيذي للوردية إلى تليجرام المالك بنجاح ✓')
        } else {
          setActionError(data.warning || 'تم إنشاء التقرير ولكن تعذر وصوله لتليجرام')
        }
      } else {
        setActionError(data.error || 'تعذر إرسال التقرير')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر لإرسال التقرير')
    } finally {
      setIsSendingTelegram(false)
    }
  }

  // Calculate elapsed duration (Presentation helper)
  const shiftDurationLabel = useMemo(() => {
    if (!report?.openedAt) return '—'
    const start = new Date(report.openedAt).getTime()
    const end = report.closedAt ? new Date(report.closedAt).getTime() : Date.now()
    const mins = Math.max(0, Math.floor((end - start) / 60000))
    const hours = Math.floor(mins / 60)
    const rem = mins % 60
    return hours > 0 ? `${hours} س و ${rem} د` : `${rem} دقيقة`
  }, [report?.openedAt, report?.closedAt])

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans pb-20 md:pb-6">
      {/* Global Shell Header & Shift Bar */}
      <OpsNavbar
        title="مركز التقارير التنفيذية واليومية"
        subtitle="مراجعة واعتماد الحسابات الختامية وتقارير الورديات (Z-Reports)"
      />
      <GlobalShiftBar />

      <main className="max-w-7xl mx-auto px-4 py-5 flex-1 w-full space-y-5">
        {/* Action Alerts */}
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-3.5 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-500 font-extrabold px-1">
              ✕
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs">
            <span>✅ {actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-500 font-extrabold px-1">
              ✕
            </button>
          </div>
        )}

        {/* ========================================== */}
        {/* 1. EXECUTIVE HEADER & SHIFT PICKER */}
        {/* ========================================== */}
        <section aria-label="رأس التقرير التنفيذي" className="bg-gradient-to-l from-zinc-950 via-zinc-900 to-zinc-950 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-zinc-800 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
            {/* Shift Identity & Status */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${
                  report?.shiftStatus === 'open'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${report?.shiftStatus === 'open' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                  <span>{report?.shiftStatus === 'open' ? 'الوردية مفتوحة حالياً' : 'وردية مغلقة ومقفلة (Z-Report)'}</span>
                </span>

                {report && (
                  <span className="text-xs font-bold text-amber-300">
                    الوردية رقم #{report.shiftNumber}
                  </span>
                )}
              </div>

              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2 flex-wrap">
                <span>المسؤول: <strong className="text-amber-400">{report?.openedBy || '—'}</strong></span>
                {report?.closedBy && (
                  <span className="text-xs font-normal text-zinc-400 mr-2">
                    (أُغلقت بواسطة: {report.closedBy})
                  </span>
                )}
              </h2>

              <p className="text-[11px] text-zinc-400 font-medium">
                تاريخ الفتح:{' '}
                {report?.openedAt
                  ? new Date(report.openedAt).toLocaleDateString('ar-EG', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Africa/Cairo',
                    })
                  : '—'}{' '}
                • المدة: <strong className="text-zinc-200">{shiftDurationLabel}</strong>
              </p>
            </div>

            {/* Shift Selector Dropdown & Actions */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {shiftsList.length > 0 && (
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 px-3 py-1.5 rounded-xl">
                  <span className="text-[11px] text-zinc-400 font-bold whitespace-nowrap">عرض وردية:</span>
                  <select
                    value={selectedShiftId}
                    onChange={(e) => handleSelectShift(e.target.value)}
                    className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    {shiftsList.map((s) => (
                      <option key={s.id} value={s.id} className="bg-zinc-900 text-white">
                        #{s.shift_number} ({s.status === 'open' ? 'مفتوحة 🟢' : 'مغلقة 🔒'}) - {s.opened_by}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={handleSendTelegram}
                disabled={isSendingTelegram || !report}
                className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-black px-3.5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                title="إرسال التقرير لتليجرام المالك"
              >
                <span>{isSendingTelegram ? '⏳' : '📲'}</span>
                <span>إرسال لتليجرام</span>
              </button>

              <button
                onClick={() => fetchShiftsAndReport(selectedShiftId, false)}
                disabled={loading}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold p-2.5 rounded-xl transition-all cursor-pointer"
                title="تحديث البيانات"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Quick Notice if active custody or discrepancies */}
          {report && report.driverCustodyCash > 0 && (
            <div className="bg-amber-950/80 border border-amber-600/70 p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 text-amber-200">
              <span className="font-bold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>توجد عهدة كاش معلقة مع الطيارين لم تُورّد للخزينة بعد:</span>
              </span>
              <span className="font-black text-amber-300 font-mono text-sm tabular-nums">
                {report.driverCustodyCash.toLocaleString()} ج.م
              </span>
            </div>
          )}
        </section>

        {/* ========================================== */}
        {/* 2. EXECUTIVE KPI GRID (SSoT Backend Data) */}
        {/* ========================================== */}
        {loading && !report ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white p-4 rounded-2xl border border-gray-200 h-24" />
            ))}
          </div>
        ) : report ? (
          <section aria-label="المؤشرات المالية للتقرير" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
            {/* KPI 1: Total Sales */}
            <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-[10px] text-gray-500 font-bold block">إجمالي المبيعات</span>
              <span className="text-xl sm:text-2xl font-black tabular-nums text-emerald-700 mt-1 block">
                {Number(report.totalSales || 0).toLocaleString()} <span className="text-[10px]">ج.م</span>
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">{report.totalOrdersCount} طلب مكتمل</span>
            </div>

            {/* KPI 2: Cash Sales */}
            <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-[10px] text-gray-500 font-bold block">مبيعات نقدية (كاش)</span>
              <span className="text-xl sm:text-2xl font-black tabular-nums text-gray-900 mt-1 block">
                {Number(report.cashSales || 0).toLocaleString()} <span className="text-[10px]">ج.م</span>
              </span>
              <span className="text-[10px] text-gray-400 font-medium">داخل الدرج</span>
            </div>

            {/* KPI 3: Non-Cash Sales */}
            <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-[10px] text-gray-500 font-bold block">مبيعات إلكترونية</span>
              <span className="text-xl sm:text-2xl font-black tabular-nums text-blue-700 mt-1 block">
                {Number(report.nonCashSales || 0).toLocaleString()} <span className="text-[10px]">ج.م</span>
              </span>
              <span className="text-[10px] text-blue-600 font-medium">إنستا باي / محافظ</span>
            </div>

            {/* KPI 4: Total Expenses */}
            <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-[10px] text-gray-500 font-bold block">المصروفات والسلف</span>
              <span className="text-xl sm:text-2xl font-black tabular-nums text-red-600 mt-1 block">
                -{Number(report.totalExpenses || 0).toLocaleString()} <span className="text-[10px]">ج.م</span>
              </span>
              <span className="text-[10px] text-red-500 font-medium">سلف ومشتريات</span>
            </div>

            {/* KPI 5: Expected Cash in Drawer */}
            <div className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-300 shadow-xs">
              <span className="text-[10px] text-amber-900 font-black block">نقدية الدرج المتوقعة</span>
              <span className="text-xl sm:text-2xl font-black tabular-nums text-amber-800 mt-1 block">
                {Number(report.expectedCash || 0).toLocaleString()} <span className="text-[10px]">ج.م</span>
              </span>
              <span className="text-[10px] text-amber-700 font-medium">المطابقة النظرية</span>
            </div>

            {/* KPI 6: Fleet Net Payout */}
            <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-[10px] text-gray-500 font-bold block">مستحقات الأسطول</span>
              <span className="text-xl sm:text-2xl font-black tabular-nums text-indigo-700 mt-1 block">
                {Number(report.fleetAccounting?.totalNetPayout || 0).toLocaleString()} <span className="text-[10px]">ج.م</span>
              </span>
              <span className="text-[10px] text-indigo-600 font-medium">{report.activeDriversCount} طيارين</span>
            </div>
          </section>
        ) : null}

        {/* ========================================== */}
        {/* 3. REPORT DETAIL TABS (0ms Memory Views) */}
        {/* ========================================== */}
        {report && (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
            {/* Tabs Header */}
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-2 overflow-x-auto scrollbar-thin">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeTab === 'overview'
                    ? 'bg-zinc-900 text-white shadow-xs font-black'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>📊</span>
                <span>الملخص التنفيذي الشامل</span>
              </button>

              <button
                onClick={() => setActiveTab('financial')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeTab === 'financial'
                    ? 'bg-zinc-900 text-white shadow-xs font-black'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>💰</span>
                <span>الخزينة والمطابقة المالية</span>
              </button>

              <button
                onClick={() => setActiveTab('orders_fleet')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeTab === 'orders_fleet'
                    ? 'bg-zinc-900 text-white shadow-xs font-black'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>📦</span>
                <span>تفاصيل المبيعات والأسطول</span>
              </button>

              <button
                onClick={() => setActiveTab('expenses')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeTab === 'expenses'
                    ? 'bg-zinc-900 text-white shadow-xs font-black'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>💸</span>
                <span>المصروفات والسلف</span>
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Financial Summary Box */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3 text-xs">
                    <h4 className="font-black text-gray-900 border-b border-gray-200 pb-2 flex items-center justify-between">
                      <span>💵 ملخص الإيرادات والنقدية</span>
                      <span className="text-emerald-700 font-bold">{Number(report.totalSales).toLocaleString()} ج.م</span>
                    </h4>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">العهدة الافتتاحية:</span>
                        <span className="font-black tabular-nums">{Number(report.initialCash).toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">مبيعات نقدية (كاش الفرع):</span>
                        <span className="font-black text-emerald-700 tabular-nums">+{Number(report.cashSales).toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">مبيعات إلكترونية (إنستا باي/محافظ):</span>
                        <span className="font-black text-blue-700 tabular-nums">{Number(report.nonCashSales).toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">إجمالي المصروفات والسلف:</span>
                        <span className="font-black text-red-600 tabular-nums">-{Number(report.totalExpenses).toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-gray-200 font-black">
                        <span>نقدية الدرج المتوقعة:</span>
                        <span className="text-amber-700 tabular-nums text-sm">{Number(report.expectedCash).toLocaleString()} ج.م</span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Summary Box */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3 text-xs">
                    <h4 className="font-black text-gray-900 border-b border-gray-200 pb-2 flex items-center justify-between">
                      <span>🛵 ملخص العمليات والطلبات</span>
                      <span className="text-indigo-700 font-bold">{report.totalOrdersCount} طلب</span>
                    </h4>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">طلبات الصالة والاستلام:</span>
                        <span className="font-black tabular-nums">{report.takeawayOrdersCount} طلب ({Number(report.takeawaySales).toLocaleString()} ج.م)</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">طلبات الدليفري والتوصيل:</span>
                        <span className="font-black tabular-nums">{report.deliveryOrdersCount} طلب ({Number(report.deliverySales).toLocaleString()} ج.م)</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">متوسط قيمة الطلب (AOV):</span>
                        <span className="font-black tabular-nums text-gray-900">{Number(report.averageOrderValue || 0).toFixed(1)} ج.م</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">الطلبات الملغاة أو الفاشلة:</span>
                        <span className="font-black text-rose-600 tabular-nums">{report.cancelledOrdersCount + report.failedOrdersCount} طلب</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-gray-200 font-black">
                        <span>صافي مستحقات أسطول الطيارين:</span>
                        <span className="text-indigo-700 tabular-nums text-sm">{Number(report.fleetAccounting?.totalNetPayout || 0).toLocaleString()} ج.م</span>
                      </div>
                    </div>
                  </div>
                </div>

                {report.notes && (
                  <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-xs text-amber-950">
                    <span className="font-black block mb-0.5">📌 ملاحظات الوردية المسجلة:</span>
                    <p className="font-medium">{report.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: FINANCIAL RECONCILIATION */}
            {activeTab === 'financial' && (
              <div className="p-5 space-y-4 text-xs">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                  <h4 className="font-black text-gray-900 border-b border-gray-200 pb-2">
                    معادلة الجرد والمطابقة الفعلية:
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                    <div className="bg-white p-3 rounded-xl border border-gray-200">
                      <span className="text-gray-500 font-bold block text-[10px]">نقدية الدرج المتوقعة</span>
                      <span className="text-lg font-black text-amber-700 tabular-nums">{Number(report.expectedCash).toLocaleString()} ج.م</span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-gray-200">
                      <span className="text-gray-500 font-bold block text-[10px]">النقدية الفعلية بالجرد</span>
                      <span className="text-lg font-black text-gray-900 tabular-nums">
                        {report.actualCash !== null && report.actualCash !== undefined
                          ? `${Number(report.actualCash).toLocaleString()} ج.م`
                          : 'لم تُقفل بعد'}
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-gray-200">
                      <span className="text-gray-500 font-bold block text-[10px]">المطابقة (الفارق)</span>
                      <span className={`text-lg font-black tabular-nums ${
                        (report.discrepancy || 0) === 0 ? 'text-emerald-600' : (report.discrepancy || 0) > 0 ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {report.discrepancy !== null && report.discrepancy !== undefined
                          ? report.discrepancy === 0
                            ? 'مطابق تماماً ✓'
                            : `${report.discrepancy > 0 ? '+' : ''}${report.discrepancy} ج.م`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Electronic Breakdown */}
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-2">
                  <h4 className="font-black text-gray-900 border-b border-gray-200 pb-1.5">
                    تفاصيل المدفوعات الإلكترونية:
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-200">
                      <span className="text-gray-600 font-bold">إنستا باي (InstaPay):</span>
                      <span className="font-black tabular-nums text-blue-700">{Number(report.instapaySales || 0).toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-200">
                      <span className="text-gray-600 font-bold">محافظ إلكترونية (Vodafone Cash):</span>
                      <span className="font-black tabular-nums text-blue-700">{Number(report.walletSales || 0).toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-200">
                      <span className="text-gray-600 font-bold">بطاقات وفيزا:</span>
                      <span className="font-black tabular-nums text-blue-700">{Number(report.otherElectronicSales || 0).toLocaleString()} ج.م</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: ORDERS & FLEET */}
            {activeTab === 'orders_fleet' && (
              <div className="p-5 space-y-4 text-xs">
                {/* Fleet Details */}
                {report.fleetAccounting && (
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                    <h4 className="font-black text-gray-900 border-b border-gray-200 pb-2 flex justify-between items-center">
                      <span>🛵 حسابات أسطول الطيارين الميداني</span>
                      <span className="text-indigo-700 font-bold">{report.fleetAccounting.driversCount} طيارين في الخدمة</span>
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="bg-white p-2.5 rounded-xl border border-gray-200">
                        <span className="text-gray-500 text-[10px] block font-bold">إجمالي ساعات العمل</span>
                        <span className="font-black text-gray-900">{report.fleetAccounting.totalHours} ساعة ({report.fleetAccounting.totalHoursWage} ج.م)</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-gray-200">
                        <span className="text-gray-500 text-[10px] block font-bold">طلبات مسلّمة بنجاح</span>
                        <span className="font-black text-emerald-700">{report.fleetAccounting.totalDeliveredOrders} (عمولات: {report.fleetAccounting.totalDeliveryCommissions} ج.م)</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-gray-200">
                        <span className="text-gray-500 text-[10px] block font-bold">سلف مسحوبة</span>
                        <span className="font-black text-rose-600">-{report.fleetAccounting.totalDriverAdvances} ج.م</span>
                      </div>
                      <div className="bg-zinc-900 text-white p-2.5 rounded-xl">
                        <span className="text-zinc-400 text-[10px] block font-bold">صافي مستحقات الأسطول</span>
                        <span className="font-black text-emerald-400 text-sm">{report.fleetAccounting.totalNetPayout} ج.م</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sales by Channel & Breakdown */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-2">
                      <h5 className="font-black text-gray-900">🏪 مبيعات الصالة والاستلام (Takeaway & Dine-in)</h5>
                      <p className="text-gray-600">إجمالي الطلبات: <strong className="text-gray-900">{report.takeawayOrdersCount}</strong></p>
                      <p className="text-gray-600">قيمة المبيعات: <strong className="text-emerald-700">{Number(report.takeawaySales).toLocaleString()} ج.م</strong></p>
                    </div>

                    <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-2">
                      <h5 className="font-black text-gray-900">🛵 مبيعات الدليفري والتوصيل (Home Delivery)</h5>
                      <p className="text-gray-600">إجمالي الطلبات: <strong className="text-gray-900">{report.deliveryOrdersCount}</strong></p>
                      <p className="text-gray-600">إجمالي مبيعات الدليفري: <strong className="text-purple-700">{Number(report.deliverySales).toLocaleString()} ج.م</strong></p>
                    </div>
                  </div>

                  {/* Food Subtotal vs Delivery Fees Decomposition */}
                  <div className="bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <span className="font-black text-emerald-950 block">💡 تفصيل مبيعات الأصناف وخدمات التوصيل:</span>
                      <p className="text-emerald-800 text-[11px]">
                        صافي مبيعات الوجبات والأطعمة (Food Subtotal): <strong className="font-mono text-emerald-900 font-black">{Number(report.productSales || (report.totalSales - (report.deliveryFeesTotal || 0))).toLocaleString()} ج.م</strong>
                        {(report.deliveryFeesTotal || 0) > 0 && (
                          <span> • رسوم التوصيل المحصلة (Delivery Fees): <strong className="font-mono text-purple-900 font-black">{Number(report.deliveryFeesTotal).toLocaleString()} ج.م</strong></span>
                        )}
                      </p>
                    </div>
                    <div className="text-left font-black text-xs text-emerald-900 bg-white px-3 py-1.5 rounded-xl border border-emerald-300">
                      <span>إجمالي المبيعات (Gross): </span>
                      <span className="tabular-nums font-mono">{Number(report.totalSales).toLocaleString()} ج.م</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: EXPENSES BREAKDOWN */}
            {activeTab === 'expenses' && (
              <div className="p-5 space-y-4 text-xs">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                  <h4 className="font-black text-gray-900 border-b border-gray-200 pb-2 flex justify-between items-center">
                    <span>💸 تفاصيل بنود المصروفات والسلف</span>
                    <span className="text-red-600 font-black">-{Number(report.totalExpenses).toLocaleString()} ج.م</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                    <div className="bg-white p-3 rounded-xl border border-gray-200">
                      <span className="text-gray-500 font-bold block text-[10px]">مصروفات تشغيلية ومشتريات</span>
                      <span className="text-base font-black text-red-600 tabular-nums">-{Number(report.generalExpenses || 0).toLocaleString()} ج.م</span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-gray-200">
                      <span className="text-gray-500 font-bold block text-[10px]">سلف طيارين مسحوبة</span>
                      <span className="text-base font-black text-amber-700 tabular-nums">-{Number(report.driverAdvances || 0).toLocaleString()} ج.م</span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-gray-200">
                      <span className="text-gray-500 font-bold block text-[10px]">سلف موظفين وإدارة</span>
                      <span className="text-base font-black text-purple-700 tabular-nums">-{Number(report.staffAdvances || 0).toLocaleString()} ج.م</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
