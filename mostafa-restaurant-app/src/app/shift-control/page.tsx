'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { OperatingHoursResult } from '@/lib/schedule'
import { STATUS_UI_CONFIG, OrderStatus } from '@/types/orders'
import Link from 'next/link'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'

interface OrderItem {
  id: string
  quantity: number
  unit_price: number
  subtotal: number
  item_variants?: {
    variant_name: string
    menu_items?: {
      name: string
    }
  }
}

interface ShiftOrder {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  delivery_address?: string
  order_type: 'takeaway' | 'delivery' | 'dine_in'
  status: OrderStatus
  total_amount: number
  notes?: string
  created_at: string
  order_items?: OrderItem[]
  assigned_driver?: {
    driver_name: string
    assignment_status: string
  } | null
  trip_number?: number | null
}

interface DriverRoster {
  id: string
  name: string
  is_active: boolean
  status: 'offline' | 'available' | 'busy'
  active_shift_id?: string
  current_trip_number?: number | null
  current_trip_count?: number
}

interface DeliveryTripOverview {
  id: string
  trip_number: number
  driver_name: string
  status: string
  expected_amount: number
  collected_amount: number
  order_count: number
  delivered_count: number
  failed_count: number
  in_progress_count: number
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

type ShiftHubTab = 'reconciliation' | 'expenses' | 'orders' | 'fleet' | 'readiness'

const STAFF_ROLE_LABELS: Record<string, string> = {
  owner: 'مالك المطعم',
  manager: 'مشرف / مدير',
  cashier: 'كاشير',
  kitchen: 'شيف / مطبخ',
  driver: 'طيار',
}

export default function ShiftControlAndCashPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Core Data
  const [dailyShift, setDailyShift] = useState<ActiveDailyShift | null>(null)
  const [expenses, setExpenses] = useState<ShiftExpenseItem[]>([])
  const [orders, setOrders] = useState<ShiftOrder[]>([])
  const [drivers, setDrivers] = useState<DriverRoster[]>([])
  const [trips, setTrips] = useState<DeliveryTripOverview[]>([])
  const [staffList, setStaffList] = useState<StaffProfileItem[]>([])
  const [currentStaff, setCurrentStaff] = useState<StaffProfileItem | null>(null)
  const [operatingStatus, setOperatingStatus] = useState<OperatingHoursResult | null>(null)

  // UI State
  const [loading, setLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [activeTab, setActiveTab] = useState<ShiftHubTab>('reconciliation')
  const [orderFilter, setOrderFilter] = useState<'all' | 'kitchen' | 'ready' | 'delivery' | 'takeaway'>('all')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Modals state
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false)
  const [openShiftStaff, setOpenShiftStaff] = useState('')
  const [customStaffName, setCustomStaffName] = useState('')
  const [initialCashInput, setInitialCashInput] = useState('500')
  const [openShiftNotes, setOpenShiftNotes] = useState('')
  const [isSubmittingShift, setIsSubmittingShift] = useState(false)

  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [actualCashInput, setActualCashInput] = useState('')
  const [closeShiftNotes, setCloseShiftNotes] = useState('')

  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseType, setExpenseType] = useState<'advance' | 'operational'>('advance')
  const [selectedPersonKey, setSelectedPersonKey] = useState<string>('')
  const [advanceCustomName, setAdvanceCustomName] = useState('')
  const [advanceReason, setAdvanceReason] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('مشتريات خضار ومستلزمات')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseRecipient, setExpenseRecipient] = useState('')
  const [expenseRecordedBy, setExpenseRecordedBy] = useState('')
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false)

  // Debounce ref for Realtime synchronization
  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // ==========================================
  // FAST DATA LOADER (Coordinated Single Cycle)
  // ==========================================
  const loadShiftControlData = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    } else {
      setIsSyncing(true)
    }
    setActionError(null)

    try {
      const [scheduleRes, ordersRes, driversRes, tripsRes, dailyShiftRes, staffRes] = await Promise.all([
        fetch('/api/admin/schedule'),
        fetch('/api/admin/orders?status=all'),
        fetch('/api/admin/drivers'),
        fetch('/api/admin/trips'),
        fetch('/api/admin/daily-shift'),
        fetch('/api/admin/staff'),
      ])

      if (ordersRes.status === 401 || driversRes.status === 401 || tripsRes.status === 401 || dailyShiftRes.status === 401) {
        setIsAuthenticated(false)
        setLoading(false)
        setIsSyncing(false)
        return
      }

      const [scheduleData, ordersData, driversData, tripsData, dailyShiftData, staffData] = await Promise.all([
        scheduleRes.json(),
        ordersRes.json(),
        driversRes.json(),
        tripsRes.json(),
        dailyShiftRes.json(),
        staffRes.json(),
      ])

      if (ordersRes.ok && driversRes.ok && tripsRes.ok) {
        setIsAuthenticated(true)
        setOperatingStatus(scheduleData.status || null)
        setOrders(ordersData.orders || [])
        setStaffList(staffData.staff || [])

        if (staffData.currentStaff) {
          setCurrentStaff(staffData.currentStaff)
        } else if (dailyShiftData.currentStaff) {
          setCurrentStaff(dailyShiftData.currentStaff)
        }

        // Process Daily Shift & Expenses
        if (dailyShiftData.hasActiveShift && dailyShiftData.activeShift) {
          setDailyShift(dailyShiftData.activeShift)
          const expRes = await fetch(`/api/admin/expenses?shift_id=${dailyShiftData.activeShift.id}`)
          if (expRes.ok) {
            const expData = await expRes.json()
            setExpenses(expData.expenses || [])
          }
        } else {
          setDailyShift(null)
          setExpenses([])
        }

        // Process Trips and Driver Workloads
        interface RawTripItem {
          id: string
          trip_number: number
          driver_id: string
          status: string
          expected_amount?: number
          collected_amount?: number
          created_at: string
          drivers?: { name?: string }
          order_driver_assignments?: { id: string; orders?: { status: string } }[]
        }

        const rawTrips = (tripsData.trips || []) as RawTripItem[]
        const formattedTrips: DeliveryTripOverview[] = rawTrips.map((t) => {
          const assignments = t.order_driver_assignments || []
          const delivered = assignments.filter((a) => a.orders?.status === 'delivered').length
          const failed = assignments.filter((a) => a.orders?.status === 'failed').length
          const inProgress = assignments.length - delivered - failed

          return {
            id: t.id,
            trip_number: t.trip_number,
            driver_name: t.drivers?.name || 'غير معروف',
            status: t.status,
            expected_amount: t.expected_amount || 0,
            collected_amount: t.collected_amount || 0,
            order_count: assignments.length,
            delivered_count: delivered,
            failed_count: failed,
            in_progress_count: inProgress,
            created_at: t.created_at,
          }
        })
        setTrips(formattedTrips)

        interface RawDriverItem {
          id: string
          name: string
          is_active: boolean
          status: 'offline' | 'available' | 'busy'
          active_shift_id?: string
        }

        const rawDrivers = (driversData.drivers || []) as RawDriverItem[]
        const activeTripMapByDriver = new Map<string, { trip_number: number; count: number }>()
        for (const t of formattedTrips) {
          if (t.status !== 'completed' && t.status !== 'cancelled') {
            const driverId = rawTrips.find((rt) => rt.id === t.id)?.driver_id
            if (driverId) {
              activeTripMapByDriver.set(driverId, { trip_number: t.trip_number, count: t.order_count })
            }
          }
        }

        const formattedDrivers: DriverRoster[] = rawDrivers.map((d) => {
          const activeTripInfo = activeTripMapByDriver.get(d.id)
          return {
            ...d,
            current_trip_number: activeTripInfo?.trip_number || null,
            current_trip_count: activeTripInfo?.count || 0,
          }
        })
        setDrivers(formattedDrivers)
      } else if (!isBackground) {
        setActionError('تعذر تحميل بيانات مركز التحكم بالوردية')
      }
    } catch {
      if (!isBackground) {
        setActionError('تعذر الاتصال بالسيرفر')
      }
    } finally {
      setLoading(false)
      setIsSyncing(false)
    }
  }, [])

  // Debounced realtime trigger
  const scheduleBackgroundSync = useCallback(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current)
    }
    syncDebounceRef.current = setTimeout(() => {
      loadShiftControlData(true)
    }, 300)
  }, [loadShiftControlData])

  useEffect(() => {
    loadShiftControlData(false)

    const handleOnline = () => {
      setIsOnline(true)
      loadShiftControlData(true)
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
    }

    const channel = supabase
      .channel('shift-control-optimized-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_expenses' }, () => scheduleBackgroundSync())
      .subscribe()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      supabase.removeChannel(channel)
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
    }
  }, [loadShiftControlData, scheduleBackgroundSync])

  // ==========================================
  // AUTHENTICATION
  // ==========================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setIsLoggingIn(true)

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })

      const data = await res.json()
      if (res.ok) {
        setIsAuthenticated(true)
        setPasscode('')
        loadShiftControlData(false)
      } else {
        setLoginError(data.error || 'رمز الدخول غير صحيح')
      }
    } catch {
      setLoginError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsLoggingIn(false)
    }
  }

  // ==========================================
  // SHIFT MANAGEMENT HANDLERS (Open / Close)
  // ==========================================
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault()
    const staff = openShiftStaff === 'other' ? customStaffName.trim() : openShiftStaff.trim()
    if (!staff) {
      setActionError('يرجى تحديد اسم المسؤول عن فتح الوردية')
      return
    }

    setIsSubmittingShift(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/daily-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          opened_by: staff,
          initial_cash: parseFloat(initialCashInput) || 0,
          notes: openShiftNotes.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setShowOpenShiftModal(false)
        setActionSuccess('تم فتح الوردية اليومية بنجاح وإرسال إشعار تلجرام ✓')
        loadShiftControlData(true)
      } else {
        setActionError(data.error || 'تعذر فتح الوردية')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر لفتح الوردية')
    } finally {
      setIsSubmittingShift(false)
    }
  }

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault()
    if (actualCashInput === '' || isNaN(parseFloat(actualCashInput))) {
      setActionError('يرجى إدخال المبلغ الفعلي الموجود بالدرج')
      return
    }

    if (!dailyShift) {
      setActionError('لا توجد وردية نشطة لإغلاقها')
      return
    }

    setIsSubmittingShift(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/daily-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          shift_id: dailyShift.id,
          final_cash: parseFloat(actualCashInput),
          notes: closeShiftNotes.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setShowCloseShiftModal(false)
        const rec = data.reconciliation
        const statusBadge =
          rec?.reconciliation_status === 'balanced'
            ? '✓ الدرج مطابق تماماً'
            : rec?.reconciliation_status === 'surplus'
            ? `📈 زيادة بالدرج (+${rec.discrepancy} ج.م)`
            : `📉 عجز بالدرج (${rec?.discrepancy} ج.م)`
        setActionSuccess(`تم إغلاق الوردية والتقفيل المالي بنجاح [${statusBadge}] وإرسال تقرير Z-Report إلى تليجرام ✓`)
        loadShiftControlData(true)
      } else {
        setActionError(data.error || 'تعذر إغلاق الوردية')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر لإغلاق الوردية')
    } finally {
      setIsSubmittingShift(false)
    }
  }

  // ==========================================
  // EXPENSE / ADVANCE RECORDING
  // ==========================================
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(expenseAmount)
    if (isNaN(amt) || amt <= 0) {
      setActionError('يرجى إدخال مبلغ صحيح أكبر من صفر')
      return
    }

    let payload: {
      category: string
      amount: number
      description: string
      recipient_name?: string
      recorded_by?: string
      driver_id?: string
      staff_id?: string
    }

    if (expenseType === 'advance') {
      if (!selectedPersonKey) {
        setActionError('يرجى اختيار الشخص المستلم للسلفة أو تحديد "أخرى"')
        return
      }

      if (selectedPersonKey === 'other') {
        if (!advanceCustomName.trim()) {
          setActionError('يرجى كتابة اسم المستلم للسلفة')
          return
        }
        if (!advanceReason.trim()) {
          setActionError('يرجى كتابة سبب وبيان السلفة')
          return
        }
        payload = {
          category: 'سلف موظفين',
          amount: amt,
          description: advanceReason.trim(),
          recipient_name: advanceCustomName.trim(),
          recorded_by: expenseRecordedBy.trim() || undefined,
        }
      } else if (selectedPersonKey.startsWith('driver_')) {
        const driverId = selectedPersonKey.replace('driver_', '')
        const driver = drivers.find((d) => d.id === driverId)
        payload = {
          category: 'سلف طيارين',
          amount: amt,
          description: advanceReason.trim() || `سلفة طيار: ${driver?.name || 'طيار'}`,
          recipient_name: driver?.name || undefined,
          driver_id: driverId,
          recorded_by: expenseRecordedBy.trim() || undefined,
        }
      } else if (selectedPersonKey.startsWith('staff_')) {
        const staffId = selectedPersonKey.replace('staff_', '')
        const staff = staffList.find((s) => s.id === staffId)
        const roleLabel = STAFF_ROLE_LABELS[staff?.role || ''] || staff?.role || 'موظف'
        payload = {
          category: 'سلف موظفين',
          amount: amt,
          description: advanceReason.trim() || `سلفة موظف: ${staff?.full_name || ''} (${roleLabel})`,
          recipient_name: staff?.full_name || undefined,
          staff_id: staffId,
          recorded_by: expenseRecordedBy.trim() || undefined,
        }
      } else {
        setActionError('اختيار المستلم غير صحيح')
        return
      }
    } else {
      if (!expenseDesc.trim()) {
        setActionError('يرجى كتابة تفاصيل وبيان المصروف')
        return
      }
      payload = {
        category: expenseCategory,
        amount: amt,
        description: expenseDesc.trim(),
        recipient_name: expenseRecipient.trim() || undefined,
        recorded_by: expenseRecordedBy.trim() || undefined,
      }
    }

    setIsSubmittingExpense(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (res.ok) {
        setShowExpenseModal(false)
        setExpenseAmount('')
        setExpenseDesc('')
        setExpenseRecipient('')
        setSelectedPersonKey('')
        setAdvanceCustomName('')
        setAdvanceReason('')
        setActionSuccess('تم تسجيل العملية بنجاح وخصمها من تقرير الوردية ✓')
        loadShiftControlData(true)
      } else {
        setActionError(data.error || 'تعذر تسجيل المصروف / السلفة')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر لتسجيل المصروف')
    } finally {
      setIsSubmittingExpense(false)
    }
  }

  // ==========================================
  // OPERATIONAL CLOSURE READINESS CHECKLIST (Guard Check)
  // ==========================================
  const activeUnresolvedOrders = useMemo(
    () => orders.filter((o) => ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)),
    [orders]
  )

  const activeUnclosedTrips = useMemo(
    () => trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled'),
    [trips]
  )

  const activeDriverShifts = useMemo(
    () => drivers.filter((d) => d.active_shift_id || d.status === 'available' || d.status === 'busy'),
    [drivers]
  )

  const pendingCustodyCash = dailyShift ? Number(dailyShift.driverCustodyCash || 0) : 0
  const isShiftOpen = !!dailyShift

  const closureIssues: string[] = []
  if (!isShiftOpen) {
    closureIssues.push('لا توجد وردية مفتوحة حالياً.')
  } else {
    if (activeUnresolvedOrders.length > 0) {
      closureIssues.push(`يوجد ${activeUnresolvedOrders.length} طلب نشط لم يحسم بعد بالمطبخ أو التوصيل.`)
    }
    if (activeUnclosedTrips.length > 0) {
      closureIssues.push(`يوجد ${activeUnclosedTrips.length} رحلة دليفري نشطة في الميدان لم تغلق.`)
    }
    if (activeDriverShifts.length > 0) {
      closureIssues.push(`يوجد ${activeDriverShifts.length} طيار في حالة دوام نشط — يجب إنهاء وردياتهم.`)
    }
    if (pendingCustodyCash > 0) {
      closureIssues.push(`توجد عهدة كاش معلقة مع الطيارين بقيمة ${pendingCustodyCash.toLocaleString()} ج.م.`)
    }
  }

  const isReadyToClose = isShiftOpen && closureIssues.length === 0

  // Filtered Orders View
  const filteredOrders = useMemo(() => {
    if (orderFilter === 'kitchen') return orders.filter((o) => o.status === 'processing')
    if (orderFilter === 'ready') return orders.filter((o) => o.status === 'ready')
    if (orderFilter === 'delivery') return orders.filter((o) => o.order_type === 'delivery')
    if (orderFilter === 'takeaway') return orders.filter((o) => o.order_type === 'takeaway' || o.order_type === 'dine_in')
    return orders
  }, [orders, orderFilter])

  // Discrepancy calculation for close shift modal
  const parsedActualCash = parseFloat(actualCashInput) || 0
  const expectedCashForModal = dailyShift ? Number(dailyShift.systemExpectedCash || 0) : 0
  const discrepancy = parsedActualCash - expectedCashForModal

  // ==========================================
  // UNAUTHENTICATED STATE
  // ==========================================
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl border border-zinc-200">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-2">🏬</span>
            <h1 className="text-xl font-black text-gray-900">دخول مركز التحكم في الوردية</h1>
            <p className="text-xs text-gray-500 mt-1">لوحة الإدارة والتحكم المالي والتقفيل اليومي (Z-Report)</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">كود الإدارة / المدير</label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="أدخل رمز المرور..."
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-center font-bold tracking-widest text-lg bg-gray-50 text-gray-900"
              />
            </div>

            {loginError && (
              <p className="text-red-600 text-xs font-semibold text-center bg-red-50 p-2 rounded-xl border border-red-100">
                ⚠️ {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn || !passcode}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-md disabled:opacity-50"
            >
              {isLoggingIn ? 'جاري التحقق...' : 'دخول مركز التحكم ✓'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans pb-20 md:pb-6">
      {/* Global Shell Header & Shift Bar */}
      <OpsNavbar
        title="مركز التحكم في الوردية والخزينة"
        subtitle="المطابقة المالية للدرج، تسجيل المصروفات، وإغلاق الوردية المعتمد (Z-Report)"
      />
      <GlobalShiftBar />

      {/* Connectivity Alert */}
      {!isOnline && (
        <div className="bg-red-600 text-white text-xs font-bold py-2 px-4 text-center shadow-inner flex items-center justify-center gap-2">
          <span>⚠️ لقد انقطع الاتصال بالإنترنت. البيانات المعروضة قد لا تكون لحظية...</span>
        </div>
      )}

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
        {/* 1. SHIFT GATEKEEPER & FINANCIAL CONTROL BANNER */}
        {/* ========================================== */}
        {!dailyShift ? (
          <div className="bg-gradient-to-r from-red-950 via-zinc-900 to-red-950 text-white rounded-3xl p-6 shadow-md border border-red-800/60 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-right">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                الوردية اليومية مغلقة حالياً
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white">
                ⚠️ لا توجد وردية يومية مفتوحة لتسجيل الحسابات والطلبات
              </h2>
              <p className="text-xs text-zinc-300 max-w-xl leading-relaxed">
                لبدء يوم عمل جديد بدقة وحساب مالي منضبط، يجب فتح وردية وتحديد المسؤول (الكاشير) وإدخال عهدة الدرج الافتتاحية.
              </p>
            </div>

            <button
              onClick={() => {
                setOpenShiftStaff(currentStaff?.full_name || staffList[0]?.full_name || '')
                setCustomStaffName('')
                setInitialCashInput('500')
                setOpenShiftNotes('')
                setShowOpenShiftModal(true)
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black px-6 py-3.5 rounded-2xl shadow-lg transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
            >
              <span className="text-lg">🔓</span>
              <span>فتح وردية يومية جديدة</span>
            </button>
          </div>
        ) : (
          <div className="bg-gradient-to-l from-zinc-950 via-zinc-900 to-zinc-950 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-zinc-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    الوردية #{dailyShift.shift_number} مفتوحة
                  </span>
                  <span className="text-xs font-bold text-amber-200/80">
                    {new Date(dailyShift.opened_at).toLocaleDateString('ar-EG', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <h2 className="text-sm sm:text-base font-black text-white">
                  المسؤول الحالي: <span className="text-amber-400">{dailyShift.opened_by}</span>
                  <span className="text-xs font-normal text-zinc-400 mr-2">
                    (فتحت الساعة{' '}
                    {new Date(dailyShift.opened_at).toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    )
                  </span>
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => {
                    setExpenseCategory('سلف طيارين')
                    setExpenseAmount('')
                    setExpenseDesc('')
                    setExpenseRecipient('')
                    setExpenseRecordedBy(dailyShift.opened_by)
                    setShowExpenseModal(true)
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>💸</span>
                  <span>تسجيل مصروف / سلفة</span>
                </button>

                <button
                  onClick={() => {
                    setActualCashInput('')
                    setCloseShiftNotes('')
                    setShowCloseShiftModal(true)
                  }}
                  className="bg-red-700 hover:bg-red-800 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>🔒</span>
                  <span>تقفيل الوردية والدرج (Z-Report)</span>
                </button>
              </div>
            </div>

            {/* Financial Summary Grid (Canonical SSoT) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-center">
              <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                <span className="text-[10px] text-zinc-400 font-bold block">العهدة الافتتاحية</span>
                <span className="text-lg sm:text-xl font-black tabular-nums text-white">
                  {Number(dailyShift.initial_cash || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-emerald-950/40 p-3 rounded-2xl border border-emerald-800/40">
                <span className="text-[10px] text-emerald-300 font-bold block">مبيعات الصالة والاستلام</span>
                <span className="text-lg sm:text-xl font-black tabular-nums text-emerald-300">
                  {Number(dailyShift.takeawaySales || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-purple-950/40 p-3 rounded-2xl border border-purple-800/40">
                <span className="text-[10px] text-purple-300 font-bold block">مبيعات الدليفري</span>
                <span className="text-lg sm:text-xl font-black tabular-nums text-purple-300">
                  {Number(dailyShift.deliverySales || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-blue-950/40 p-3 rounded-2xl border border-blue-800/40">
                <span className="text-[10px] text-blue-300 font-bold block">إجمالي المبيعات</span>
                <span className="text-lg sm:text-xl font-black tabular-nums text-blue-200">
                  {Number(dailyShift.totalSales || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-red-950/40 p-3 rounded-2xl border border-red-800/40">
                <span className="text-[10px] text-red-300 font-bold block">المصروفات والسلف ({expenses.length})</span>
                <span className="text-lg sm:text-xl font-black tabular-nums text-red-300">
                  -{Number(dailyShift.totalExpenses || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-amber-500/20 p-3 rounded-2xl border border-amber-500/50">
                <span className="text-[10px] text-amber-300 font-black block">نقدية الدرج المتوقعة</span>
                <span className="text-xl sm:text-2xl font-black tabular-nums text-amber-300">
                  {Number(dailyShift.systemExpectedCash || 0).toFixed(0)} ج.م
                </span>
              </div>
            </div>

            {/* Driver Custody Alert */}
            {pendingCustodyCash > 0 && (
              <div className="bg-amber-950/90 rounded-2xl border border-amber-600/70 p-3 text-xs flex flex-wrap items-center justify-between gap-3 text-amber-200">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛵</span>
                  <div>
                    <span className="font-extrabold text-amber-300 block text-xs">تنبيه عهدة كاش معلقة مع الطيارين</span>
                    <span className="text-[11px] text-zinc-300">
                      توجد مبالغ محصلة في الميدان لم تُورّد للخزينة بعد. يجب تسوية الرحلات قبل تقفيل الوردية.
                    </span>
                  </div>
                </div>
                <div className="bg-amber-600 text-white px-3 py-1 rounded-xl font-black text-xs">
                  {pendingCustodyCash.toLocaleString()} ج.م مع الطيارين
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* 2. SHIFT OPERATIONS HUB (Tabbed 0ms View) */}
        {/* ========================================== */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
          {/* Tabs Navigation Header */}
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-2 overflow-x-auto scrollbar-thin">
            <button
              onClick={() => setActiveTab('reconciliation')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'reconciliation'
                  ? 'bg-zinc-900 text-white shadow-xs font-black'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <span>💰</span>
              <span>مطابقة الخزينة والدرج</span>
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
              <span>المصروفات والسلف ({expenses.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('readiness')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'readiness'
                  ? 'bg-zinc-900 text-white shadow-xs font-black'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <span>🛡️</span>
              <span>تدقيق جاهزية التقفيل ({closureIssues.length === 0 ? 'جاهز ✓' : `${closureIssues.length} مانع`})</span>
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'orders'
                  ? 'bg-zinc-900 text-white shadow-xs font-black'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <span>📋</span>
              <span>طلبات الوردية ({orders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('fleet')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'fleet'
                  ? 'bg-zinc-900 text-white shadow-xs font-black'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <span>🛵</span>
              <span>الأسطول والرحلات ({drivers.length})</span>
            </button>
          </div>

          {/* TAB 1: RECONCILIATION */}
          {activeTab === 'reconciliation' && (
            <div className="p-5 space-y-5">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    <span>💵 معادلة النقدية ومطابقة الدرج (Cash Equation)</span>
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    النقدية المحسوبة بواسطة محرك المحاسبة المعتمد (SSoT)
                  </p>
                </div>

                {isSyncing && (
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                    مزامنة حية...
                  </span>
                )}
              </div>

              {dailyShift ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Cash In / Out Breakdown */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3 text-xs">
                    <h4 className="font-black text-gray-900 border-b border-gray-200 pb-2">
                      تفاصيل الحركات النقدية للوردية:
                    </h4>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">العهدة الافتتاحية (+):</span>
                        <span className="font-black tabular-nums text-gray-900">
                          {Number(dailyShift.initial_cash || 0).toLocaleString()} ج.م
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-emerald-700 font-bold">مبيعات نقدية محصلة بالفرع (+):</span>
                        <span className="font-black tabular-nums text-emerald-700">
                          +{Number(dailyShift.cashSales || 0).toLocaleString()} ج.م
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-red-700 font-bold">إجمالي المصروفات والسلف (-):</span>
                        <span className="font-black tabular-nums text-red-700">
                          -{Number(dailyShift.totalExpenses || 0).toLocaleString()} ج.م
                        </span>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span className="font-black text-gray-900">نقدية الدرج المتوقعة (=):</span>
                        <span className="font-black text-sm text-amber-700 tabular-nums">
                          {Number(dailyShift.systemExpectedCash || 0).toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Electronic & Fleet Snapshot */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3 text-xs">
                    <h4 className="font-black text-gray-900 border-b border-gray-200 pb-2">
                      المبيعات الإلكترونية وحسابات الأسطول:
                    </h4>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">مبيعات إلكترونية (إنستا باي/محافظ):</span>
                        <span className="font-black tabular-nums text-blue-700">
                          {Number(dailyShift.nonCashSales || 0).toLocaleString()} ج.م
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">كاش عهدة طيارين معلقة:</span>
                        <span className="font-black tabular-nums text-amber-700">
                          {Number(dailyShift.driverCustodyCash || 0).toLocaleString()} ج.م
                        </span>
                      </div>

                      {dailyShift.fleetAccounting && (
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                          <span className="font-bold text-gray-700">صافي مستحقات الأسطول:</span>
                          <span className="font-black text-emerald-700 tabular-nums">
                            {Number(dailyShift.fleetAccounting.totalNetPayout || 0).toLocaleString()} ج.م
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400 text-xs font-bold">
                  لا توجد وردية مفتوحة لعرض معادلة النقدية
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXPENSES */}
          {activeTab === 'expenses' && (
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <h3 className="text-sm font-black text-gray-900">
                  سجل المصروفات والسلف للوردية الحالية ({expenses.length})
                </h3>
                {dailyShift && (
                  <button
                    onClick={() => {
                      setExpenseCategory('سلف طيارين')
                      setExpenseAmount('')
                      setExpenseDesc('')
                      setExpenseRecipient('')
                      setExpenseRecordedBy(dailyShift.opened_by)
                      setShowExpenseModal(true)
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black px-3.5 py-1.5 rounded-xl shadow-xs transition-all"
                  >
                    + تسجيل جديد
                  </button>
                )}
              </div>

              {expenses.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-xs font-bold">
                  لا توجد مصروفات أو سلف مسجلة خلال هذه الوردية
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {expenses.map((exp) => (
                    <div key={exp.id} className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-gray-900">{exp.description}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                            {exp.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {exp.recipient_name && <span>المستلم: {exp.recipient_name} • </span>}
                          <span>المسؤول: {exp.recorded_by || 'الإدارة'}</span>
                        </p>
                      </div>

                      <div className="text-left">
                        <span className="font-black text-red-600 text-sm block tabular-nums">
                          -{Number(exp.amount).toFixed(0)} ج.م
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(exp.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CLOSURE READINESS CHECKLIST */}
          {activeTab === 'readiness' && (
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <span>🛡️ فحص معايير أمان إغلاق الوردية (Shift Close Guards)</span>
                  <span
                    className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                      isReadyToClose
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}
                  >
                    {isReadyToClose ? 'جاهز للإغلاق المالي ✓' : 'توجد موانع تشغيلية ⚠️'}
                  </span>
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                {/* Check 1 */}
                <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                  activeUnresolvedOrders.length === 0 ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}>
                  <div className="flex items-center gap-2">
                    <span>{activeUnresolvedOrders.length === 0 ? '✅' : '❌'}</span>
                    <span className="font-bold">حسم كافة طلبات الوردية (0 طلب معلق)</span>
                  </div>
                  <span className="font-bold">{activeUnresolvedOrders.length} طلب نشط</span>
                </div>

                {/* Check 2 */}
                <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                  activeUnclosedTrips.length === 0 ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}>
                  <div className="flex items-center gap-2">
                    <span>{activeUnclosedTrips.length === 0 ? '✅' : '❌'}</span>
                    <span className="font-bold">إغلاق وتسوية رحلات الدليفري (0 رحلة نشطة)</span>
                  </div>
                  <span className="font-bold">{activeUnclosedTrips.length} رحلة مفتوحة</span>
                </div>

                {/* Check 3 */}
                <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                  activeDriverShifts.length === 0 ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}>
                  <div className="flex items-center gap-2">
                    <span>{activeDriverShifts.length === 0 ? '✅' : '❌'}</span>
                    <span className="font-bold">إنهاء ورديات الطيارين النشطة</span>
                  </div>
                  <span className="font-bold">{activeDriverShifts.length} طيار في الخدمة</span>
                </div>

                {/* Check 4 */}
                <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                  pendingCustodyCash === 0 ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}>
                  <div className="flex items-center gap-2">
                    <span>{pendingCustodyCash === 0 ? '✅' : '❌'}</span>
                    <span className="font-bold">توريد عهدة كاش الطيارين للخزينة (0 ج.م)</span>
                  </div>
                  <span className="font-bold">{pendingCustodyCash.toLocaleString()} ج.م معلقة</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ORDERS */}
          {activeTab === 'orders' && (
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <h3 className="text-sm font-black text-gray-900">طلبات الوردية ({filteredOrders.length})</h3>

                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                  {(['all', 'kitchen', 'ready', 'delivery', 'takeaway'] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      onClick={() => setOrderFilter(filterKey)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        orderFilter === filterKey ? 'bg-zinc-900 text-white shadow-xs font-black' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {filterKey === 'all'
                        ? 'الكل'
                        : filterKey === 'kitchen'
                        ? '🔥 المطبخ'
                        : filterKey === 'ready'
                        ? '📦 الجاهز'
                        : filterKey === 'delivery'
                        ? '🛵 دليفري'
                        : '🏪 صالة'}
                    </button>
                  ))}
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-xs font-bold">لا توجد طلبات مطابقة</div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {filteredOrders.map((o) => {
                    const statusCfg = STATUS_UI_CONFIG[o.status] || STATUS_UI_CONFIG.pending
                    return (
                      <div
                        key={o.id}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-gray-900">#{o.order_number}</span>
                            <span className="text-gray-600 font-bold">{o.customer_name}</span>
                            <span className="text-amber-700 font-black tabular-nums">{o.total_amount} ج.م</span>
                          </div>
                          {o.assigned_driver && (
                            <span className="text-[10px] text-indigo-700 font-bold block mt-0.5">
                              الطيار: {o.assigned_driver.driver_name}
                            </span>
                          )}
                        </div>

                        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${statusCfg.bgColor} ${statusCfg.color} ${statusCfg.borderColor}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: FLEET */}
          {activeTab === 'fleet' && (
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <h3 className="text-sm font-black text-gray-900">حالة طاقم الطيارين ({drivers.length})</h3>
                <Link href="/drivers" className="text-xs font-bold text-amber-700 hover:underline">
                  مركز الطيارين ➔
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {drivers.map((d) => (
                  <div key={d.id} className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-gray-900">{d.name}</span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                          d.status === 'available'
                            ? 'bg-green-100 text-green-800'
                            : d.status === 'busy'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {d.status === 'available' ? '🟢 متاح' : d.status === 'busy' ? '🟡 في رحلة' : '⚪ أوفلاين'}
                      </span>
                    </div>

                    <div className="text-[11px] text-gray-500">
                      الوردية: {d.active_shift_id ? '🟢 مفتوحة' : '🔴 مغلقة'}
                      {d.current_trip_number && <span className="text-amber-700 font-bold mr-2">• رحلة #{d.current_trip_number}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL 1: Open Daily Shift */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-900">🔓 فتح وردية يومية جديدة للمطعم</h3>
              <button onClick={() => setShowOpenShiftModal(false)} className="text-xs font-bold text-gray-400 hover:text-gray-700">
                ✕
              </button>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">المسؤول عن فتح الوردية (الكاشير):</label>
                <select
                  value={openShiftStaff}
                  onChange={(e) => setOpenShiftStaff(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-bold bg-gray-50 mb-2"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.full_name}>
                      {s.full_name} ({STAFF_ROLE_LABELS[s.role] || s.role})
                    </option>
                  ))}
                  <option value="other">اسم آخر (يدوي)...</option>
                </select>

                {openShiftStaff === 'other' && (
                  <input
                    type="text"
                    placeholder="اكتب اسم المسؤول..."
                    value={customStaffName}
                    onChange={(e) => setCustomStaffName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-bold bg-white"
                  />
                )}
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">العهدة الافتتاحية بالدرج (ج.م):</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={initialCashInput}
                  onChange={(e) => setInitialCashInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-black bg-gray-50 tabular-nums"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ملاحظات افتتاحية (اختياري):</label>
                <textarea
                  rows={2}
                  placeholder="أي ملاحظات حول الوردية أو الخزينة..."
                  value={openShiftNotes}
                  onChange={(e) => setOpenShiftNotes(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-medium bg-gray-50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenShiftModal(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShift}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs disabled:opacity-50"
                >
                  {isSubmittingShift ? 'جاري الفتح...' : 'تأكيد فتح الوردية ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Close Daily Shift (Z-Report) */}
      {showCloseShiftModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-red-700">🔒 تقفيل الوردية اليومية (Z-Report)</h3>
              <button onClick={() => setShowCloseShiftModal(false)} className="text-xs font-bold text-gray-400 hover:text-gray-700">
                ✕
              </button>
            </div>

            {closureIssues.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl text-xs text-rose-900 space-y-1">
                <span className="font-bold block">⚠️ تنبيهات أمان قبل الإغلاق:</span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {closureIssues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleCloseShift} className="space-y-3.5 text-xs">
              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">المبلغ المتوقع بالدرج:</span>
                  <span className="font-black text-amber-700 tabular-nums">{expectedCashForModal.toLocaleString()} ج.م</span>
                </div>
                {actualCashInput !== '' && (
                  <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                    <span className="font-bold">المطابقة (الفارق):</span>
                    <span
                      className={`font-black tabular-nums ${
                        discrepancy === 0 ? 'text-emerald-600' : discrepancy > 0 ? 'text-blue-600' : 'text-red-600'
                      }`}
                    >
                      {discrepancy === 0 ? 'مطابق تماماً ✓' : discrepancy > 0 ? `+${discrepancy} ج.م (زيادة)` : `${discrepancy} ج.م (عجز)`}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">المبلغ الفعلي الموجود بالدرج بعد الجرد (ج.م):</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={actualCashInput}
                  onChange={(e) => setActualCashInput(e.target.value)}
                  placeholder="أدخل نقدية الدرج الفعلية..."
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-black bg-gray-50 tabular-nums focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ملاحظات التقفيل النهائي:</label>
                <textarea
                  rows={2}
                  placeholder="سبب أي عجز أو زيادة أو ملاحظات..."
                  value={closeShiftNotes}
                  onChange={(e) => setCloseShiftNotes(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-medium bg-gray-50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseShiftModal(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShift || actualCashInput === ''}
                  className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-black shadow-xs disabled:opacity-50"
                >
                  {isSubmittingShift ? 'جاري التقفيل...' : 'تأكيد إغلاق الوردية ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Record Expense / Advance */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-900">💸 تسجيل مصروف أو سلفة بالوردية</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-xs font-bold text-gray-400 hover:text-gray-700">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
              <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setExpenseType('advance')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                    expenseType === 'advance' ? 'bg-amber-600 text-white shadow-xs' : 'text-gray-600'
                  }`}
                >
                  سلفة موظف / طيار
                </button>
                <button
                  type="button"
                  onClick={() => setExpenseType('operational')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                    expenseType === 'operational' ? 'bg-amber-600 text-white shadow-xs' : 'text-gray-600'
                  }`}
                >
                  مصروف تشغيلي / مشتريات
                </button>
              </div>

              {expenseType === 'advance' ? (
                <>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">المستلم للسلفة:</label>
                    <select
                      value={selectedPersonKey}
                      onChange={(e) => setSelectedPersonKey(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-bold bg-gray-50"
                    >
                      <option value="">-- اختر من طاقم العمل أو الطيارين --</option>
                      <optgroup label="🛵 الطيارون">
                        {drivers.map((d) => (
                          <option key={`driver_${d.id}`} value={`driver_${d.id}`}>
                            {d.name} (طيار)
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="👤 طاقم المطعم">
                        {staffList.map((s) => (
                          <option key={`staff_${s.id}`} value={`staff_${s.id}`}>
                            {s.full_name} ({STAFF_ROLE_LABELS[s.role] || s.role})
                          </option>
                        ))}
                      </optgroup>
                      <option value="other">شخص آخر...</option>
                    </select>
                  </div>

                  {selectedPersonKey === 'other' && (
                    <input
                      type="text"
                      placeholder="اسم المستلم..."
                      value={advanceCustomName}
                      onChange={(e) => setAdvanceCustomName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-bold bg-white"
                    />
                  )}

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">بيان / سبب السلفة:</label>
                    <input
                      type="text"
                      placeholder="سبب السلفة (اختياري)..."
                      value={advanceReason}
                      onChange={(e) => setAdvanceReason(e.target.value)}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-medium bg-gray-50"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">تصنيف المصروف:</label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-bold bg-gray-50"
                    >
                      <option value="مشتريات خضار ومستلزمات">مشتريات خضار ومستلزمات</option>
                      <option value="نثريات وضيافة">نثريات وضيافة</option>
                      <option value="صيانة ومعدات">صيانة ومعدات</option>
                      <option value="وقود ومواصلات">وقود ومواصلات</option>
                      <option value="مصروفات إدارية">مصروفات إدارية</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">تفاصيل وبيان المصروف:</label>
                    <input
                      type="text"
                      placeholder="تفاصيل المشتريات..."
                      value={expenseDesc}
                      onChange={(e) => setExpenseDesc(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-medium bg-gray-50"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block font-bold text-gray-700 mb-1">المبلغ (ج.م):</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="المبلغ المدفوع كاش..."
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-black bg-gray-50 tabular-nums focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense || !expenseAmount}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs disabled:opacity-50"
                >
                  {isSubmittingExpense ? 'جاري الحفظ...' : 'تسجيل وخصم من الدرج ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
