'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { TabNav, TabItem } from '@/components/ui/TabNav'
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

type ReportTab = 'financial' | 'breakdown' | 'fleet' | 'expenses'

export default function ReportsExecutiveCenterPage() {
  const [loading, setLoading] = useState(true)
  const [shiftsList, setShiftsList] = useState<ShiftListItem[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string>('')
  const [report, setReport] = useState<CanonicalReportData | null>(null)
  const [activeTab, setActiveTab] = useState<ReportTab>('financial')

  const [isSendingTelegram, setIsSendingTelegram] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Load shifts list and active report
  const fetchShiftsAndReport = useCallback(async (shiftIdToLoad?: string, isBackground = false) => {
    if (!isBackground) setLoading(true)
    setActionError(null)

    try {
      const { data: shiftsData, error: shiftsErr } = await supabase
        .from('daily_shifts')
        .select('id, shift_number, status, opened_by, opened_at, closed_at')
        .order('opened_at', { ascending: false })

      if (shiftsErr) {
        setActionError('تعذر جلب سجل الورديات')
        return
      }

      if (shiftsData && shiftsData.length > 0) {
        setShiftsList(shiftsData)
        const targetId = shiftIdToLoad || selectedShiftId || shiftsData[0].id
        if (!selectedShiftId || shiftIdToLoad) {
          setSelectedShiftId(targetId)
        }

        const res = await fetch(`/api/admin/daily-report?shift_id=${targetId}`)
        if (res.ok) {
          const reportJson = await res.json()
          setReport(reportJson)
        } else {
          setActionError('تعذر جلب بيانات تقرير الوردية')
        }
      } else {
        setShiftsList([])
        setReport(null)
      }
    } catch {
      if (!isBackground) {
        setActionError('تعذر الاتصال بالسيرفر لتحميل التقرير')
      }
    } finally {
      setLoading(false)
    }
  }, [selectedShiftId])

  const scheduleBackgroundSync = useCallback(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current)
    }
    syncDebounceRef.current = setTimeout(() => {
      fetchShiftsAndReport(selectedShiftId, true)
    }, 300)
  }, [fetchShiftsAndReport, selectedShiftId])

  useEffect(() => {
    fetchShiftsAndReport()

    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_expenses' }, () => {
        scheduleBackgroundSync()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchShiftsAndReport, scheduleBackgroundSync])

  const handleShiftSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value
    setSelectedShiftId(newId)
    fetchShiftsAndReport(newId, false)
  }

  const handleSendTelegram = async () => {
    if (!report) return
    setIsSendingTelegram(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/admin/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: report.shiftId }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess('تم إرسال تقرير Z-Report إلى تليجرام بنجاح')
      } else {
        setActionError(data.error || 'فشل إرسال التقرير لتليجرام')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر لإرسال التقرير')
    } finally {
      setIsSendingTelegram(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const tabs: TabItem[] = [
    { id: 'financial', label: 'الخزينة وطرق الدفع', icon: '💵' },
    { id: 'breakdown', label: 'تفصيل المبيعات', icon: '📊' },
    { id: 'fleet', label: 'مستحقات الطيارين', icon: '🛵' },
    { id: 'expenses', label: 'المصروفات والسلف', icon: '💸' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none pb-20 md:pb-8 print:bg-white print:text-black print:p-0">
      {/* Ops Header & Shift Bar (Hidden when printing) */}
      <div className="print:hidden">
        <OpsNavbar title="التقرير التنفيذي Z-Report" />
        <GlobalShiftBar />
      </div>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 w-full space-y-4 print:max-w-full print:p-2 print:space-y-3">
        {/* Action Banners */}
        {actionError && (
          <div className="bg-red-950/80 border border-red-700 text-red-200 p-3 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs print:hidden">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 p-1 cursor-pointer">✕</button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-emerald-950/80 border border-emerald-700 text-emerald-200 p-3 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs print:hidden">
            <span>✅ {actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-400 p-1 cursor-pointer">✕</button>
          </div>
        )}

        {/* Top Control Strip: Shift Selector & Print / Telegram Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-sm print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-bold whitespace-nowrap">الوردية:</span>
            <select
              value={selectedShiftId}
              onChange={handleShiftSelect}
              className="bg-zinc-950 border border-zinc-750 text-xs text-white px-3 py-2 rounded-xl focus:outline-hidden focus:border-zinc-500 font-mono"
            >
              {shiftsList.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.shift_number} ({s.status === 'open' ? '🟢 مفتوحة' : '🔒 مغلقة'}) - {s.opened_by} ({new Date(s.opened_at).toLocaleDateString('ar-EG')})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrint}
              className="font-bold whitespace-nowrap"
            >
              🖨️ طباعة تقرير Z
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSendTelegram}
              loading={isSendingTelegram}
              className="font-bold whitespace-nowrap"
            >
              📱 إرسال لتليجرام
            </Button>
          </div>
        </div>

        {/* Print-Only Header */}
        <div className="hidden print:block text-center border-b border-zinc-300 pb-3 mb-3">
          <h1 className="text-xl font-black text-black">مطعم مصطفى - التقرير المالي اليومي (Z-Report)</h1>
          {report && (
            <p className="text-xs text-zinc-600 mt-1">
              وردية #{report.shiftNumber} · المسؤول: {report.openedBy} · {new Date(report.openedAt).toLocaleString('ar-EG')}
            </p>
          )}
        </div>

        {loading && !report ? (
          <div className="py-24 text-center text-xs text-zinc-500 animate-pulse print:hidden">
            جاري تحميل التقرير التنفيذي...
          </div>
        ) : !report ? (
          <Card variant="flat" className="py-20 text-center space-y-3">
            <span className="text-4xl block">📊</span>
            <span className="font-bold text-sm text-zinc-300">لا توجد بيانات تقرير للوردية المحددة</span>
          </Card>
        ) : (
          <div className="space-y-4 print:space-y-3">
            {/* Top 4 Executive KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5 print:grid-cols-4 print:gap-2">
              <Card variant="default" className="p-3 sm:p-4 print:border-zinc-300 print:bg-transparent print:p-2">
                <div className="text-[11px] font-bold text-zinc-400 print:text-zinc-600">إجمالي المبيعات المحققة</div>
                <div className="mt-1">
                  <MoneyDisplay amount={report.totalSales} size="lg" variant="white" className="print:text-black" />
                </div>
                <div className="text-[10px] text-zinc-500 print:text-zinc-600 mt-0.5">{report.totalOrdersCount} طلب مكتمل</div>
              </Card>

              <Card variant="default" className="p-3 sm:p-4 print:border-zinc-300 print:bg-transparent print:p-2">
                <div className="text-[11px] font-bold text-zinc-400 print:text-zinc-600">الرصيد المحسوب بالدرج</div>
                <div className="mt-1">
                  <MoneyDisplay amount={report.expectedCash} size="lg" variant="emerald" className="print:text-black" />
                </div>
                <div className="text-[10px] text-zinc-500 print:text-zinc-600 mt-0.5">النقد الفعلي المستحق بالخزينة</div>
              </Card>

              <Card variant="default" className="p-3 sm:p-4 print:border-zinc-300 print:bg-transparent print:p-2">
                <div className="text-[11px] font-bold text-zinc-400 print:text-zinc-600">إجمالي المصروفات والسلف</div>
                <div className="mt-1">
                  <MoneyDisplay amount={report.totalExpenses} size="lg" variant="red" className="print:text-black" />
                </div>
                <div className="text-[10px] text-zinc-500 print:text-zinc-600 mt-0.5">مسحوبات من الدرج أثناء الوردية</div>
              </Card>

              <Card variant="default" className="p-3 sm:p-4 print:border-zinc-300 print:bg-transparent print:p-2">
                <div className="text-[11px] font-bold text-zinc-400 print:text-zinc-600">صافي مستحقات الأسطول</div>
                <div className="mt-1">
                  <MoneyDisplay amount={report.fleetAccounting?.totalNetPayout || 0} size="lg" variant="amber" className="print:text-black" />
                </div>
                <div className="text-[10px] text-zinc-500 print:text-zinc-600 mt-0.5">{report.activeDriversCount} طيارين مسجلين</div>
              </Card>
            </div>

            {/* Shift Status Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl text-xs print:bg-zinc-100 print:border-zinc-300 print:text-black">
              <div className="flex items-center gap-2">
                <Badge variant={report.shiftStatus === 'open' ? 'open' : 'closed'}>
                  {report.shiftStatus === 'open' ? '🟢 وردية جارية' : '🔒 وردية مغلقة'}
                </Badge>
                <span className="font-bold text-zinc-300 print:text-black">وردية #{report.shiftNumber}</span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-400 print:text-zinc-700">المسؤول: {report.openedBy}</span>
              </div>

              <div className="text-zinc-400 font-mono text-[11px] print:text-zinc-700">
                افتتاح: {new Date(report.openedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                {report.closedAt && (
                  <span> · إغلاق: {new Date(report.closedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} ({report.closedBy || 'المشرف'})</span>
                )}
              </div>
            </div>

            {/* Navigation Tabs (Hidden when printing) */}
            <div className="print:hidden">
              <TabNav
                tabs={tabs}
                activeTab={activeTab}
                onChange={(tabId) => setActiveTab(tabId as ReportTab)}
              />
            </div>

            {/* TAB 1: FINANCIAL & CASH RECONCILIATION */}
            {(activeTab === 'financial' || typeof window !== 'undefined') && (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${activeTab !== 'financial' ? 'print:grid hidden print:grid' : ''}`}>
                {/* Payment Methods Breakdown */}
                <Card variant="default" className="p-4 sm:p-5 space-y-3 print:border-zinc-300 print:bg-transparent">
                  <h3 className="font-bold text-sm text-white print:text-black flex items-center gap-2">
                    <span>💳</span>
                    <span>تفصيل الإيرادات حسب طريقة الدفع</span>
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">💵 مبيعات كاش موردة للدرج:</span>
                      <MoneyDisplay amount={report.cashSales} size="sm" variant="white" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">⚡ إنستاباي (InstaPay):</span>
                      <MoneyDisplay amount={report.instapaySales} size="sm" variant="white" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">📱 محافظ إلكترونية (فودافون/غيرها):</span>
                      <MoneyDisplay amount={report.walletSales} size="sm" variant="white" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">🛵 عهدة كاش معلقة مع الطيارين:</span>
                      <MoneyDisplay amount={report.driverCustodyCash} size="sm" variant="amber" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2.5 font-bold pt-2 border-t border-zinc-800 print:border-zinc-300">
                      <span className="text-zinc-200 print:text-black">إجمالي الإيرادات:</span>
                      <MoneyDisplay amount={report.totalSales} size="md" variant="emerald" className="print:text-black" />
                    </div>
                  </div>
                </Card>

                {/* Cash Drawer Reconciliation Equation */}
                <Card variant="default" className="p-4 sm:p-5 space-y-3 print:border-zinc-300 print:bg-transparent">
                  <h3 className="font-bold text-sm text-white print:text-black flex items-center gap-2">
                    <span>🧮</span>
                    <span>معادلة جرد الخزينة (SSoT)</span>
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">عهدة الدرج الافتتاحية:</span>
                      <span className="font-mono text-zinc-300 print:text-black">+{report.initialCash} ج.م</span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">+ مبيعات كاش موردة للدرج:</span>
                      <span className="font-mono text-emerald-400 print:text-black">+{report.cashSales} ج.م</span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">- إجمالي المصروفات والسلف:</span>
                      <span className="font-mono text-red-400 print:text-black">-{report.totalExpenses} ج.م</span>
                    </div>

                    <div className="flex justify-between py-2.5 font-bold pt-2 border-t border-zinc-800 print:border-zinc-300">
                      <span className="text-zinc-200 print:text-black">= الرصيد المتوقع بالدرج:</span>
                      <MoneyDisplay amount={report.expectedCash} size="md" variant="emerald" className="print:text-black" />
                    </div>

                    {typeof report.actualCash === 'number' && (
                      <div className="flex justify-between py-2 border-t border-zinc-800 print:border-zinc-200 font-bold">
                        <span className="text-zinc-400 print:text-zinc-600">المبلغ الفعلي المجرود:</span>
                        <span className="font-mono text-white print:text-black">{report.actualCash} ج.م</span>
                      </div>
                    )}

                    {typeof report.discrepancy === 'number' && (
                      <div className="flex justify-between py-1 font-bold">
                        <span className="text-zinc-400 print:text-zinc-600">الفارق (عجز/زيادة):</span>
                        <span className={`font-mono ${report.discrepancy === 0 ? 'text-emerald-400' : report.discrepancy < 0 ? 'text-red-400' : 'text-amber-400'} print:text-black`}>
                          {report.discrepancy === 0 ? 'مطابق (0 ج.م)' : report.discrepancy < 0 ? `عجز ${Math.abs(report.discrepancy)} ج.م` : `زيادة +${report.discrepancy} ج.م`}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* TAB 2: SALES BREAKDOWN */}
            {(activeTab === 'breakdown' || typeof window !== 'undefined') && (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${activeTab !== 'breakdown' ? 'print:grid hidden print:grid' : ''}`}>
                <Card variant="default" className="p-4 sm:p-5 space-y-3 print:border-zinc-300 print:bg-transparent">
                  <h3 className="font-bold text-sm text-white print:text-black flex items-center gap-2">
                    <span>🥡</span>
                    <span>تصنيف مبيعات الأقسام والخدمات</span>
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">🥡 مبيعات التيك أواي ({report.takeawayOrdersCount} طلب):</span>
                      <MoneyDisplay amount={report.takeawaySales} size="sm" variant="white" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">🛵 مبيعات الدليفري ({report.deliveryOrdersCount} طلب):</span>
                      <MoneyDisplay amount={report.deliverySales} size="sm" variant="white" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">🍔 صافي مبيعات الوجبات (الأطعمة):</span>
                      <MoneyDisplay amount={report.productSales || (report.totalSales - (report.deliveryFeesTotal || 0))} size="sm" variant="white" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">🛵 إجمالي رسوم التوصيل المحصلة:</span>
                      <MoneyDisplay amount={report.deliveryFeesTotal || 0} size="sm" variant="white" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2.5 font-bold pt-2 border-t border-zinc-800 print:border-zinc-300">
                      <span className="text-zinc-200 print:text-black">متوسط قيمة الطلب (AOV):</span>
                      <span className="font-mono text-amber-400 print:text-black">{report.averageOrderValue} ج.م</span>
                    </div>
                  </div>
                </Card>

                <Card variant="default" className="p-4 sm:p-5 space-y-3 print:border-zinc-300 print:bg-transparent">
                  <h3 className="font-bold text-sm text-white print:text-black flex items-center gap-2">
                    <span>⚠️</span>
                    <span>الطلبات الملغاة والفاقد</span>
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">عدد الطلبات الملغاة:</span>
                      <span className="font-mono text-red-400 print:text-black">{report.cancelledOrdersCount} طلب</span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">قيمة المبيعات المهدرة/الملغاة:</span>
                      <MoneyDisplay amount={report.cancelledAmount} size="sm" variant="red" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">الطلبات الفاشلة بالتوصيل:</span>
                      <span className="font-mono text-amber-400 print:text-black">{report.failedOrdersCount} طلب</span>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* TAB 3: FLEET & WAGES SSoT */}
            {(activeTab === 'fleet' || typeof window !== 'undefined') && (
              <div className={`space-y-4 ${activeTab !== 'fleet' ? 'print:block hidden print:block' : ''}`}>
                <Card variant="default" className="p-4 sm:p-5 space-y-3 print:border-zinc-300 print:bg-transparent">
                  <h3 className="font-bold text-sm text-white print:text-black flex items-center gap-2">
                    <span>🛵</span>
                    <span>مستحقات أسطول التوصيل (SSoT)</span>
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 print:border-zinc-200 print:bg-transparent">
                      <div className="text-[11px] text-zinc-400 print:text-zinc-600">أجور ساعات العمل</div>
                      <div className="font-mono font-bold text-white print:text-black text-sm mt-1">
                        {report.fleetAccounting?.totalHoursWage || 0} ج.م
                      </div>
                      <div className="text-[10px] text-zinc-500 print:text-zinc-600">{report.fleetAccounting?.totalHours || 0} ساعة</div>
                    </div>

                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 print:border-zinc-200 print:bg-transparent">
                      <div className="text-[11px] text-zinc-400 print:text-zinc-600">عمولات التوصيل</div>
                      <div className="font-mono font-bold text-white print:text-black text-sm mt-1">
                        {report.fleetAccounting?.totalDeliveryCommissions || 0} ج.م
                      </div>
                      <div className="text-[10px] text-zinc-500 print:text-zinc-600">{report.fleetAccounting?.totalDeliveredOrders || 0} طلب مسلّم</div>
                    </div>

                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 print:border-zinc-200 print:bg-transparent">
                      <div className="text-[11px] text-zinc-400 print:text-zinc-600">سلف طيارين مخصومة</div>
                      <div className="font-mono font-bold text-red-400 print:text-black text-sm mt-1">
                        -{report.fleetAccounting?.totalDriverAdvances || 0} ج.م
                      </div>
                      <div className="text-[10px] text-zinc-500 print:text-zinc-600">خصم من المستحق</div>
                    </div>

                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 print:border-zinc-200 print:bg-transparent">
                      <div className="text-[11px] text-zinc-400 print:text-zinc-600">صافي المستحق النهائي</div>
                      <div className="font-mono font-black text-emerald-400 print:text-black text-sm mt-1">
                        {report.fleetAccounting?.totalNetPayout || 0} ج.م
                      </div>
                      <div className="text-[10px] text-zinc-500 print:text-zinc-600">واجب الصرف</div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* TAB 4: EXPENSES BREAKDOWN */}
            {(activeTab === 'expenses' || typeof window !== 'undefined') && (
              <div className={`space-y-4 ${activeTab !== 'expenses' ? 'print:block hidden print:block' : ''}`}>
                <Card variant="default" className="p-4 sm:p-5 space-y-3 print:border-zinc-300 print:bg-transparent">
                  <h3 className="font-bold text-sm text-white print:text-black flex items-center gap-2">
                    <span>💸</span>
                    <span>تفصيل المصروفات والسلف المسحوبة من الدرج</span>
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">🛒 مصروفات تشغيل عامة ومشتريات:</span>
                      <MoneyDisplay amount={report.generalExpenses} size="sm" variant="red" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">🛵 سلف طيارين مسحوبة:</span>
                      <MoneyDisplay amount={report.driverAdvances} size="sm" variant="red" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2 border-b border-zinc-800 print:border-zinc-200">
                      <span className="text-zinc-400 print:text-zinc-600">👤 سلف موظفين مسحوبة:</span>
                      <MoneyDisplay amount={report.staffAdvances} size="sm" variant="red" className="print:text-black" />
                    </div>

                    <div className="flex justify-between py-2.5 font-bold pt-2 border-t border-zinc-800 print:border-zinc-300">
                      <span className="text-zinc-200 print:text-black">إجمالي المصروفات والسلف:</span>
                      <MoneyDisplay amount={report.totalExpenses} size="md" variant="red" className="print:text-black" />
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
