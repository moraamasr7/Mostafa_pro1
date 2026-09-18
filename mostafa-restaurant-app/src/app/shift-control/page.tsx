'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { OperatingHoursResult } from '@/lib/schedule'
import { STATUS_UI_CONFIG, OrderStatus } from '@/types/orders'
import Link from 'next/link'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { TabNav, TabItem } from '@/components/ui/TabNav'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'

interface ShiftOrder {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  delivery_address?: string
  order_type: 'takeaway' | 'delivery' | 'dine_in'
  status: OrderStatus
  payment_method?: string
  total_amount: number
  created_at: string
}

interface ActiveDailyShift {
  id: string
  shift_number: number
  opened_at: string
  opened_by: string
  initial_cash: number
  status: 'open' | 'closed'
  notes?: string
  totalSales: number
  cashSales?: number
  nonCashSales?: number
  takeawaySales: number
  deliverySales: number
  totalExpenses: number
  generalExpenses?: number
  driverAdvances?: number
  staffAdvances?: number
  systemExpectedCash: number
  driverCustodyCash?: number
  uncollectedCash?: number
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
}

interface ShiftExpenseItem {
  id: string
  category: string
  amount: number
  description: string
  recipient_name?: string
  recorded_by?: string
  created_at: string
}

interface StaffProfileItem {
  id: string
  full_name: string
  role: string
}

interface DriverItem {
  id: string
  name: string
  status: string
  is_active: boolean
}

type ShiftHubTab = 'reconciliation' | 'expenses' | 'orders' | 'readiness'

const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1] as const

export default function ShiftControlPage() {
  const [loading, setLoading] = useState(true)
  const [activeShift, setActiveShift] = useState<ActiveDailyShift | null>(null)
  const [lastClosedShift, setLastClosedShift] = useState<any | null>(null)
  const [currentStaff, setCurrentStaff] = useState<StaffProfileItem | null>(null)
  const [activeTab, setActiveTab] = useState<ShiftHubTab>('reconciliation')

  // Orders & Expenses State
  const [shiftOrders, setShiftOrders] = useState<ShiftOrder[]>([])
  const [shiftExpenses, setShiftExpenses] = useState<ShiftExpenseItem[]>([])
  const [staffList, setStaffList] = useState<StaffProfileItem[]>([])
  const [driverList, setDriverList] = useState<DriverItem[]>([])
  const [operatingHours, setOperatingHours] = useState<OperatingHoursResult | null>(null)

  // Feedback & Action states
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Open Shift Form
  const [initialCashInput, setInitialCashInput] = useState<string>('0')
  const [openShiftNotes, setOpenShiftNotes] = useState<string>('')

  // Cash Reconciliation State
  const [cashCounts, setCashCounts] = useState<Record<number, number>>({
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    1: 0,
  })
  const [manualCountOverride, setManualCountOverride] = useState<string>('')
  const [useManualCount, setUseManualCount] = useState<boolean>(false)

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false)
  const [expenseCategory, setExpenseCategory] = useState<string>('مصروف عام')
  const [expenseAmount, setExpenseAmount] = useState<string>('')
  const [expenseRecipient, setExpenseRecipient] = useState<string>('')
  const [expenseSelectedDriverId, setExpenseSelectedDriverId] = useState<string>('')
  const [expenseSelectedStaffId, setExpenseSelectedStaffId] = useState<string>('')
  const [expenseDescription, setExpenseDescription] = useState<string>('')

  const [showCloseShiftModal, setShowCloseShiftModal] = useState<boolean>(false)
  const [closeShiftNotes, setCloseShiftNotes] = useState<string>('')

  // Search in orders
  const [orderSearchQuery, setOrderSearchQuery] = useState('')

  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate counted cash
  const countedCash = useMemo(() => {
    if (useManualCount) {
      return Math.max(0, Number(manualCountOverride) || 0)
    }
    return DENOMINATIONS.reduce((sum, denom) => {
      return sum + denom * (cashCounts[denom] || 0)
    }, 0)
  }, [useManualCount, manualCountOverride, cashCounts])

  // System expected cash & variance
  const systemExpected = activeShift?.systemExpectedCash ?? 0
  const cashVariance = Math.round((countedCash - systemExpected) * 100) / 100

  // Load Shift Data
  const loadShiftData = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true)
      setActionError(null)

      const [shiftRes, scheduleRes, staffRes, driversRes] = await Promise.all([
        fetch('/api/admin/daily-shift'),
        fetch('/api/schedule'),
        fetch('/api/admin/staff'),
        fetch('/api/admin/drivers'),
      ])

      const [shiftData, schedData, staffData, driversData] = await Promise.all([
        shiftRes.json(),
        scheduleRes.json(),
        staffRes.json(),
        driversRes.json(),
      ])

      if (shiftRes.ok) {
        if (shiftData.hasActiveShift && shiftData.activeShift) {
          setActiveShift(shiftData.activeShift)
          setLastClosedShift(null)

          // Fetch expenses & orders for this shift
          const [expRes, ordersRes] = await Promise.all([
            fetch(`/api/admin/expenses?shift_id=${shiftData.activeShift.id}`),
            supabase
              .from('orders')
              .select('id, order_number, customer_name, customer_phone, delivery_address, order_type, status, payment_method, total_amount, created_at')
              .eq('daily_shift_id', shiftData.activeShift.id)
              .order('created_at', { ascending: false }),
          ])

          if (expRes.ok) {
            const expJson = await expRes.json()
            setShiftExpenses(expJson.expenses || [])
          }

          if (ordersRes.data) {
            setShiftOrders(ordersRes.data as ShiftOrder[])
          }
        } else {
          setActiveShift(null)
          setLastClosedShift(shiftData.lastClosedShift || null)
          setShiftExpenses([])
          setShiftOrders([])
        }

        if (shiftData.currentStaff) {
          setCurrentStaff(shiftData.currentStaff)
        }
      }

      if (scheduleRes.ok) {
        setOperatingHours(schedData)
      }

      if (staffRes.ok && Array.isArray(staffData.staff)) {
        setStaffList(staffData.staff)
      }

      if (driversRes.ok && Array.isArray(driversData.drivers)) {
        setDriverList(driversData.drivers)
      }
    } catch {
      if (!isBackground) {
        setActionError('تعذر الاتصال بالسيرفر لتحديث بيانات الوردية')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const scheduleBackgroundSync = useCallback(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current)
    }
    syncDebounceRef.current = setTimeout(() => {
      loadShiftData(true)
    }, 300)
  }, [loadShiftData])

  useEffect(() => {
    loadShiftData(false)

    const channel = supabase
      .channel('shift-control-realtime')
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
  }, [loadShiftData, scheduleBackgroundSync])

  // Open Shift Action
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/daily-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          initial_cash: Number(initialCashInput) || 0,
          notes: openShiftNotes.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess('تم فتح الوردية بنجاح')
        setInitialCashInput('0')
        setOpenShiftNotes('')
        loadShiftData(false)
      } else {
        setActionError(data.error || 'فشل فتح الوردية')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Record Expense / Advance Action
  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountNum = Number(expenseAmount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setActionError('يرجى إدخال مبلغ صحيح أكبر من صفر')
      return
    }

    setIsSubmitting(true)
    setActionError(null)

    try {
      let recipient = expenseRecipient.trim()
      let driverId: string | undefined = undefined
      let staffId: string | undefined = undefined

      if (expenseCategory === 'سلف طيارين') {
        const found = driverList.find((d) => d.id === expenseSelectedDriverId)
        if (found) {
          recipient = found.name
          driverId = found.id
        }
      } else if (expenseCategory === 'سلف موظفين') {
        const found = staffList.find((s) => s.id === expenseSelectedStaffId)
        if (found) {
          recipient = found.full_name
          staffId = found.id
        }
      }

      const res = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: expenseCategory,
          amount: amountNum,
          description: expenseDescription.trim() || 'بدون تفاصيل',
          recipient_name: recipient || undefined,
          driver_id: driverId,
          staff_id: staffId,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess('تم تسجيل المصروف/السلفة بنجاح')
        setShowExpenseModal(false)
        setExpenseAmount('')
        setExpenseDescription('')
        setExpenseRecipient('')
        setExpenseSelectedDriverId('')
        setExpenseSelectedStaffId('')
        loadShiftData(true)
      } else {
        setActionError(data.error || 'فشل تسجيل المصروف')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Close Shift Action
  const handleCloseShift = async () => {
    if (!activeShift) return

    setIsSubmitting(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/daily-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          shift_id: activeShift.id,
          final_cash: countedCash,
          notes: closeShiftNotes.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess('تم إغلاق الوردية وترحيل الحسابات بنجاح')
        setShowCloseShiftModal(false)
        setCloseShiftNotes('')
        loadShiftData(false)
      } else {
        setActionError(data.error || 'فشل إغلاق الوردية')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر لإغلاق الوردية')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Readiness checklist calculations
  const unresolvedOrders = useMemo(() => {
    return shiftOrders.filter((o) =>
      ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
    )
  }, [shiftOrders])

  const canClose = useMemo(() => {
    if (!currentStaff) return false
    return ['owner', 'manager', 'cashier'].includes(currentStaff.role)
  }, [currentStaff])

  const isStoreClosed = operatingHours ? !operatingHours.isOpen : true

  const filteredOrders = useMemo(() => {
    if (!orderSearchQuery.trim()) return shiftOrders
    const q = orderSearchQuery.trim().toLowerCase()
    return shiftOrders.filter(
      (o) =>
        String(o.order_number).includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.includes(q)
    )
  }, [shiftOrders, orderSearchQuery])

  // Tab definitions
  const tabs: TabItem[] = [
    { id: 'reconciliation', label: 'مطابقة وجرد الدرج', icon: '💵' },
    { id: 'expenses', label: 'المصروفات والسلف', count: shiftExpenses.length, icon: '💸' },
    { id: 'orders', label: 'طلبات الوردية', count: shiftOrders.length, icon: '📦' },
    { id: 'readiness', label: 'جاهزية الإغلاق', icon: '🔒' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none pb-20 md:pb-8">
      {/* Global Header & Shift Status Bar */}
      <OpsNavbar title="الخزينة والوردية" />
      <GlobalShiftBar />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 w-full space-y-4">
        {/* Action Banners */}
        {actionError && (
          <div className="bg-red-950/80 border border-red-700 text-red-200 p-3 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 p-1 cursor-pointer">✕</button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-emerald-950/80 border border-emerald-700 text-emerald-200 p-3 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs">
            <span>✅ {actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-400 p-1 cursor-pointer">✕</button>
          </div>
        )}

        {loading && !activeShift && !lastClosedShift ? (
          <div className="py-24 text-center text-xs text-zinc-500 animate-pulse">
            جاري تحميل بيانات الوردية والخزينة...
          </div>
        ) : !activeShift ? (
          /* =========================================================
             NO ACTIVE SHIFT: OPEN NEW SHIFT PANEL
             ========================================================= */
          <div className="max-w-xl mx-auto py-8 space-y-6">
            <Card variant="default" className="p-6 text-center space-y-4 border-dashed border-zinc-700">
              <span className="text-5xl block">🔒</span>
              <div>
                <h2 className="text-lg font-black text-white">لا توجد وردية مفتوحة حالياً</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  يجب فتح وردية جديدة لبدء تسجيل الطلبات واستقبال الكاش
                </p>
              </div>

              {lastClosedShift && (
                <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-right text-xs text-zinc-400 space-y-1">
                  <div className="font-bold text-zinc-300">آخر وردية مغلقة: #{lastClosedShift.shift_number}</div>
                  <div>المسؤول: {lastClosedShift.opened_by}</div>
                  <div>تاريخ الإغلاق: {new Date(lastClosedShift.closed_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              )}

              <form onSubmit={handleOpenShift} className="text-right space-y-4 pt-4 border-t border-zinc-800">
                <Input
                  type="number"
                  label="عهدة الدرج الافتتاحية (كاش بداية الوردية)"
                  value={initialCashInput}
                  onChange={(e) => setInitialCashInput(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="any"
                  required
                />

                <Input
                  type="text"
                  label="ملاحظات افتتاح الوردية (اختياري)"
                  value={openShiftNotes}
                  onChange={(e) => setOpenShiftNotes(e.target.value)}
                  placeholder="مثال: استلام الدرج مع عهدة الفكة"
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={isSubmitting}
                  className="w-full text-base font-black py-4 bg-emerald-600 hover:bg-emerald-500 border-emerald-500"
                >
                  🟢 فتح الوردية وبدء التشغيل
                </Button>
              </form>
            </Card>
          </div>
        ) : (
          /* =========================================================
             ACTIVE SHIFT CONTROL HUB
             ========================================================= */
          <div className="space-y-4">
            {/* Top 4 Industrial KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5">
              <Card variant="default" className="p-3 sm:p-4">
                <div className="text-[11px] font-bold text-zinc-400">النقد الفعلي المتوقع بالدرج</div>
                <div className="mt-1">
                  <MoneyDisplay amount={activeShift.systemExpectedCash} size="lg" variant="emerald" />
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">شامل الافتتاحي والمبيعات - المصروفات</div>
              </Card>

              <Card variant="default" className="p-3 sm:p-4">
                <div className="text-[11px] font-bold text-zinc-400">مبيعات كاش موردة للدرج</div>
                <div className="mt-1">
                  <MoneyDisplay amount={activeShift.cashSales || 0} size="lg" variant="white" />
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">كاش تم تحصيله وتوريده للخزينة</div>
              </Card>

              <Card variant="default" className="p-3 sm:p-4">
                <div className="text-[11px] font-bold text-zinc-400">إجمالي المصروفات والسلف</div>
                <div className="mt-1">
                  <MoneyDisplay amount={activeShift.totalExpenses || 0} size="lg" variant="red" />
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{shiftExpenses.length} بنود مسجلة</div>
              </Card>

              <Card variant="default" className="p-3 sm:p-4">
                <div className="text-[11px] font-bold text-zinc-400">عهدة معلقة مع الطيارين</div>
                <div className="mt-1">
                  <MoneyDisplay amount={activeShift.driverCustodyCash || 0} size="lg" variant="amber" />
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">تحصيلات طلبات لم تورد للكاشير</div>
              </Card>
            </div>

            {/* Navigation Tabs & Fast Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-sm">
              <TabNav
                tabs={tabs}
                activeTab={activeTab}
                onChange={(tabId) => setActiveTab(tabId as ShiftHubTab)}
              />

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowExpenseModal(true)}
                  className="font-bold whitespace-nowrap"
                >
                  ➕ سلفة / مصروف
                </Button>

                <Link href="/reports">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="font-bold text-zinc-300 whitespace-nowrap"
                  >
                    📄 تقرير Z
                  </Button>
                </Link>
              </div>
            </div>

            {/* TAB CONTENT 1: CASH RECONCILIATION */}
            {activeTab === 'reconciliation' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left 2 Cols: Cash Denomination Calculator */}
                <div className="lg:col-span-2 space-y-4">
                  <Card variant="default" className="p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-white flex items-center gap-2">
                        <span>🧮</span>
                        <span>حاسبة جرد فئات النقدية بالدرج</span>
                      </h3>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setUseManualCount(!useManualCount)}
                        className="text-xs text-zinc-400"
                      >
                        {useManualCount ? 'التبديل إلى جرد الفئات' : 'إدخال رقم إجمالي مباشر'}
                      </Button>
                    </div>

                    {useManualCount ? (
                      <div className="pt-2">
                        <Input
                          type="number"
                          label="إجمالي النقد الفعلي بالدرج (ج.م)"
                          value={manualCountOverride}
                          onChange={(e) => setManualCountOverride(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="any"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                        {DENOMINATIONS.map((denom) => {
                          const count = cashCounts[denom] || 0
                          const sub = denom * count
                          return (
                            <div
                              key={denom}
                              className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl space-y-1.5 focus-within:border-zinc-600 transition-all"
                            >
                              <div className="flex items-center justify-between text-[11px] font-bold">
                                <span className="text-zinc-400">فئة {denom} ج.م</span>
                                <span className="text-emerald-400 font-mono">{sub} ج.م</span>
                              </div>
                              <input
                                type="number"
                                min="0"
                                value={count === 0 ? '' : count}
                                onChange={(e) => {
                                  const val = Math.max(0, parseInt(e.target.value) || 0)
                                  setCashCounts((prev) => ({ ...prev, [denom]: val }))
                                }}
                                placeholder="0"
                                className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono font-bold text-center text-sm py-1.5 rounded-lg focus:outline-hidden focus:border-emerald-500"
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCashCounts({ 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0 })
                          setManualCountOverride('')
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        تفريغ العداد ↺
                      </Button>
                    </div>
                  </Card>
                </div>

                {/* Right Col: Reconciliation Summary & Primary Close Action */}
                <div className="space-y-4">
                  <Card variant="default" className="p-4 sm:p-5 space-y-4">
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <span>⚖️</span>
                      <span>نتيجة المطابقة الفورية</span>
                    </h3>

                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between py-2 border-b border-zinc-800">
                        <span className="text-zinc-400">الرصيد المحسوب نظامياً:</span>
                        <MoneyDisplay amount={systemExpected} size="sm" variant="white" />
                      </div>

                      <div className="flex justify-between py-2 border-b border-zinc-800">
                        <span className="text-zinc-400">المبلغ الفعلي المج رود:</span>
                        <div>
                          <MoneyDisplay amount={countedCash} size="sm" variant="emerald" />
                        </div>
                      </div>

                      <div className="flex justify-between py-2.5 items-center font-bold">
                        <span className="text-zinc-300">الفرق (عجز / زيادة):</span>
                        <div className="flex items-center gap-1.5">
                          {cashVariance === 0 ? (
                            <Badge variant="open">مطابق تماماً (0 ج.م)</Badge>
                          ) : cashVariance < 0 ? (
                            <Badge variant="danger">عجز {Math.abs(cashVariance)} ج.م</Badge>
                          ) : (
                            <Badge variant="processing">زيادة +{cashVariance} ج.م</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Primary Close Shift CTA */}
                    <div className="pt-3 border-t border-zinc-800 space-y-2">
                      <Button
                        variant="danger"
                        size="lg"
                        onClick={() => setShowCloseShiftModal(true)}
                        className="w-full font-black py-3 text-sm shadow-md"
                      >
                        🔒 إغلاق الوردية وترحيل الحسابات
                      </Button>
                      <p className="text-[10px] text-zinc-500 text-center">
                        المسؤول الحالي: {currentStaff?.full_name} ({currentStaff?.role})
                      </p>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: EXPENSES & ADVANCES */}
            {activeTab === 'expenses' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-400">
                    إجمالي المصروفات والسلف: <span className="font-bold text-white font-mono">{activeShift.totalExpenses || 0} ج.م</span>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowExpenseModal(true)}
                    className="font-bold"
                  >
                    ➕ إضافة سلفة / مصروف جديد
                  </Button>
                </div>

                {shiftExpenses.length === 0 ? (
                  <Card variant="flat" className="py-16 text-center text-xs text-zinc-400">
                    <span className="text-3xl block mb-2">💸</span>
                    <span className="font-bold text-sm text-zinc-300">لا توجد مصروفات أو سلف مسجلة في هذه الوردية</span>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {shiftExpenses.map((item) => {
                      const isAdvance = item.category.includes('سلف')
                      return (
                        <Card key={item.id} variant="default" className="p-3.5 space-y-2">
                          <div className="flex items-start justify-between">
                            <Badge variant={isAdvance ? 'processing' : 'neutral'}>
                              {item.category}
                            </Badge>
                            <div className="text-red-400 font-bold font-mono text-sm">
                              -{item.amount} ج.م
                            </div>
                          </div>

                          <div className="text-xs text-zinc-200 font-bold">
                            {item.description}
                          </div>

                          {item.recipient_name && (
                            <div className="text-[11px] text-zinc-400">
                              المستلم: <span className="text-zinc-300 font-bold">{item.recipient_name}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-800">
                            <span>مسجل بواسطة: {item.recorded_by || 'الكاشير'}</span>
                            <span>{new Date(item.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT 3: SHIFT ORDERS */}
            {activeTab === 'orders' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="🔍 بحث برقم الطلب أو اسم العميل أو الهاتف..."
                    className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 px-3.5 py-2.5 rounded-xl focus:outline-hidden focus:border-zinc-700"
                  />
                  <div className="text-xs text-zinc-400 whitespace-nowrap">
                    العدد: <span className="font-bold text-white font-mono">{filteredOrders.length}</span>
                  </div>
                </div>

                {filteredOrders.length === 0 ? (
                  <Card variant="flat" className="py-16 text-center text-xs text-zinc-400">
                    <span className="text-3xl block mb-2">📦</span>
                    <span className="font-bold text-sm text-zinc-300">لا توجد طلبات مطابقة</span>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredOrders.map((ord) => {
                      const uiConfig = STATUS_UI_CONFIG[ord.status] || {
                        label: ord.status,
                        bgColor: 'bg-zinc-800',
                        color: 'text-zinc-400',
                        borderColor: 'border-zinc-700',
                      }

                      return (
                        <Card key={ord.id} variant="default" className="p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-sm text-white">#{ord.order_number}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${uiConfig.bgColor} ${uiConfig.color} ${uiConfig.borderColor}`}>
                              {uiConfig.label}
                            </span>
                          </div>

                          <div className="text-xs text-zinc-300 font-bold">
                            {ord.customer_name} · <span className="font-mono text-zinc-400">{ord.customer_phone}</span>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800">
                            <span className="text-zinc-500 font-mono">
                              {ord.order_type === 'delivery' ? '🛵 دليفري' : '🥡 تيك أواي'} · {ord.payment_method || 'كاش'}
                            </span>
                            <MoneyDisplay amount={ord.total_amount} size="sm" variant="white" />
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT 4: READINESS & CLOSURE GUARD */}
            {activeTab === 'readiness' && (
              <div className="max-w-2xl mx-auto space-y-4">
                <Card variant="default" className="p-5 space-y-4">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <span>🛡️</span>
                    <span>قائمة التحقق الأمني والتشغيلي قبل الإغلاق</span>
                  </h3>

                  <div className="space-y-3 text-xs">
                    {/* Check 1: Operating Hours */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                      <div>
                        <div className="font-bold text-zinc-200">مواعيد العمل الرسمية للمطعم</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {isStoreClosed ? 'المطعم في فترة الإغلاق الرسمي' : 'المطعم مفتوح حالياً لاستقبال الطلبات'}
                        </div>
                      </div>
                      <Badge variant={isStoreClosed ? 'open' : 'processing'}>
                        {isStoreClosed ? 'جاهز للإغلاق' : 'مفتوح للعمل'}
                      </Badge>
                    </div>

                    {/* Check 2: Unresolved Orders */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                      <div>
                        <div className="font-bold text-zinc-200">حسم جميع طلبات الوردية</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {unresolvedOrders.length === 0
                            ? 'تم تسليم أو حسم كافة الطلبات'
                            : `يوجد ${unresolvedOrders.length} طلبات قيد التجهيز أو في الطريق`}
                        </div>
                      </div>
                      <Badge variant={unresolvedOrders.length === 0 ? 'open' : 'danger'}>
                        {unresolvedOrders.length === 0 ? 'مكتمل' : `${unresolvedOrders.length} معلق`}
                      </Badge>
                    </div>

                    {/* Check 3: Staff Role Permission */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                      <div>
                        <div className="font-bold text-zinc-200">صلاحية الموظف المسؤول</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {currentStaff?.full_name} ({currentStaff?.role})
                        </div>
                      </div>
                      <Badge variant={canClose ? 'open' : 'danger'}>
                        {canClose ? 'مصرّح له' : 'غير مصرّح'}
                      </Badge>
                    </div>
                  </div>

                  {/* Z-Report Link & Close Shift Button */}
                  <div className="pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center gap-3">
                    <Link href="/reports" className="w-full sm:w-1/2">
                      <Button variant="secondary" size="md" className="w-full font-bold">
                        📄 معاينة تقرير Z-Report
                      </Button>
                    </Link>

                    <Button
                      variant="danger"
                      size="md"
                      onClick={() => setShowCloseShiftModal(true)}
                      className="w-full sm:w-1/2 font-bold"
                    >
                      🔒 إغلاق الوردية الآن
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>

      {/* =========================================================
          MODAL: RECORD EXPENSE / ADVANCE
          ========================================================= */}
      <Modal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        title="➕ تسجيل مصروف أو سلفة من الدرج"
        maxWidth="md"
      >
        <form onSubmit={handleRecordExpense} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">فئة المصروف</label>
            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white px-3.5 py-2.5 rounded-xl focus:outline-hidden focus:border-zinc-700"
            >
              <option value="مصروف عام">مصروف عام / مشتريات تشغيل</option>
              <option value="سلف طيارين">سلفة طيار</option>
              <option value="سلف موظفين">سلفة موظف</option>
            </select>
          </div>

          <Input
            type="number"
            label="المبلغ المسحوب من الدرج (ج.م)"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            placeholder="0.00"
            min="1"
            step="any"
            required
          />

          {expenseCategory === 'سلف طيارين' && (
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">اختر الطيار</label>
              <select
                value={expenseSelectedDriverId}
                onChange={(e) => setExpenseSelectedDriverId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white px-3.5 py-2.5 rounded-xl focus:outline-hidden focus:border-zinc-700"
                required
              >
                <option value="">-- اختر الطيار من القائمة --</option>
                {driverList.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {expenseCategory === 'سلف موظفين' && (
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">اختر الموظف</label>
              <select
                value={expenseSelectedStaffId}
                onChange={(e) => setExpenseSelectedStaffId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white px-3.5 py-2.5 rounded-xl focus:outline-hidden focus:border-zinc-700"
                required
              >
                <option value="">-- اختر الموظف من القائمة --</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                ))}
              </select>
            </div>
          )}

          {expenseCategory === 'مصروف عام' && (
            <Input
              type="text"
              label="اسم المستلم / المورد (اختياري)"
              value={expenseRecipient}
              onChange={(e) => setExpenseRecipient(e.target.value)}
              placeholder="مثال: مورد الخضار / كهربائي"
            />
          )}

          <Input
            type="text"
            label="البيان / سبب الصرف"
            value={expenseDescription}
            onChange={(e) => setExpenseDescription(e.target.value)}
            placeholder="مثال: شراء أكياس تعبئة وورق فويل"
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowExpenseModal(false)}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              className="font-bold"
            >
              حفظ وخصم من الدرج
            </Button>
          </div>
        </form>
      </Modal>

      {/* =========================================================
          MODAL: CLOSE SHIFT CONFIRMATION
          ========================================================= */}
      <Modal
        isOpen={showCloseShiftModal}
        onClose={() => setShowCloseShiftModal(false)}
        title="🔒 تأكيد إغلاق الوردية وترحيل الحسابات"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div className="bg-zinc-900 border border-zinc-800 p-3.5 rounded-xl space-y-2">
            <div className="flex justify-between">
              <span className="text-zinc-400">الرصيد المحسوب نظامياً:</span>
              <MoneyDisplay amount={systemExpected} size="sm" variant="white" />
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">النقد الفعلي المج رود:</span>
              <div>
                <MoneyDisplay amount={countedCash} size="sm" variant="emerald" />
              </div>
            </div>
            <div className="flex justify-between font-bold pt-1 border-t border-zinc-800">
              <span className="text-zinc-300">الفرق المالي:</span>
              <span>
                {cashVariance === 0
                  ? 'مطابق (0 ج.م)'
                  : cashVariance < 0
                  ? `عجز ${Math.abs(cashVariance)} ج.م`
                  : `زيادة +${cashVariance} ج.م`}
              </span>
            </div>
          </div>

          <Input
            type="text"
            label="ملاحظات الإغلاق أو سبب العجز/الزيادة (إن وجد)"
            value={closeShiftNotes}
            onChange={(e) => setCloseShiftNotes(e.target.value)}
            placeholder="مثال: تم تسليم الكاش للمشرف ومطابقة العدادات"
          />

          <div className="bg-amber-950/40 border border-amber-800/80 p-3 rounded-xl text-amber-200 text-[11px]">
            ⚠️ تنبيه: إغلاق الوردية هو إجراء نهائي يقوم بترحيل حسابات اليومية وإرسال تقرير Z-Report إلى تليجرام وقفل استقبال الطلبات لهذه الوردية.
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCloseShiftModal(false)}
            >
              تراجع
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              loading={isSubmitting}
              onClick={handleCloseShift}
              className="font-black"
            >
              تأكيد إغلاق الوردية
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
