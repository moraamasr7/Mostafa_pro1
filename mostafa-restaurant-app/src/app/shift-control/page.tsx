'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { OperatingHoursResult } from '@/lib/schedule'
import { STATUS_UI_CONFIG, OrderStatus } from '@/types/orders'
import Link from 'next/link'
import OpsNavbar from '@/components/OpsNavbar'

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
  shift_date: string
  opened_at: string
  opened_by: string
  initial_cash: number
  status: 'open' | 'closed'
  notes?: string
  totalSales: number
  takeawaySales: number
  deliverySales: number
  totalExpenses: number
  systemExpectedCash: number
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

export default function ShiftControlCenterPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [operatingStatus, setOperatingStatus] = useState<OperatingHoursResult | null>(null)
  const [orders, setOrders] = useState<ShiftOrder[]>([])
  const [drivers, setDrivers] = useState<DriverRoster[]>([])
  const [trips, setTrips] = useState<DeliveryTripOverview[]>([])
  const [dailyShift, setDailyShift] = useState<ActiveDailyShift | null>(null)
  const [expenses, setExpenses] = useState<ShiftExpenseItem[]>([])
  
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'kitchen' | 'ready' | 'delivery' | 'takeaway'>('all')
  const [isOnline, setIsOnline] = useState(true)

  // Modals state
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false)
  const [openShiftStaff, setOpenShiftStaff] = useState('مصطفى الجزار')
  const [customStaffName, setCustomStaffName] = useState('')
  const [initialCashInput, setInitialCashInput] = useState('500')
  const [openShiftNotes, setOpenShiftNotes] = useState('')
  const [isSubmittingShift, setIsSubmittingShift] = useState(false)

  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [closeShiftStaff, setCloseShiftStaff] = useState('')
  const [actualCashInput, setActualCashInput] = useState('')
  const [closeShiftNotes, setCloseShiftNotes] = useState('')

  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseCategory, setExpenseCategory] = useState('سلف طيارين')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseRecipient, setExpenseRecipient] = useState('')
  const [expenseRecordedBy, setExpenseRecordedBy] = useState('')
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false)

  const fetchControlCenterData = useCallback(async () => {
    setActionError(null)

    try {
      const [scheduleRes, ordersRes, driversRes, tripsRes, dailyShiftRes] = await Promise.all([
        fetch('/api/admin/schedule'),
        fetch('/api/admin/orders?status=all'),
        fetch('/api/admin/drivers'),
        fetch('/api/admin/trips'),
        fetch('/api/admin/daily-shift'),
      ])

      if (ordersRes.status === 401 || driversRes.status === 401 || tripsRes.status === 401) {
        setIsAuthenticated(false)
        setLoading(false)
        return
      }

      const scheduleData = await scheduleRes.json()
      const ordersData = await ordersRes.json()
      const driversData = await driversRes.json()
      const tripsData = await tripsRes.json()
      const dailyShiftData = await dailyShiftRes.json()

      if (ordersRes.ok && driversRes.ok && tripsRes.ok) {
        setIsAuthenticated(true)
        setOperatingStatus(scheduleData.status)

        const rawOrders = ordersData.orders || []
        setOrders(rawOrders)

        // Process Daily Shift
        if (dailyShiftData.hasActiveShift && dailyShiftData.activeShift) {
          setDailyShift(dailyShiftData.activeShift)
          // Fetch expenses for this shift
          const expRes = await fetch(`/api/admin/expenses?shift_id=${dailyShiftData.activeShift.id}`)
          if (expRes.ok) {
            const expData = await expRes.json()
            setExpenses(expData.expenses || [])
          }
        } else {
          setDailyShift(null)
          setExpenses([])
        }

        interface TripAssignmentItem {
          id: string
          orders?: { status: string }
        }
        interface TripQueryItem {
          id: string
          trip_number: number
          driver_id: string
          status: string
          expected_amount?: number
          collected_amount?: number
          created_at: string
          drivers?: { name?: string }
          order_driver_assignments?: TripAssignmentItem[]
        }
        interface DriverQueryItem {
          id: string
          name: string
          is_active: boolean
          status: 'offline' | 'available' | 'busy'
          active_shift_id?: string
        }

        const rawTrips = (tripsData.trips || []) as TripQueryItem[]
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

        const rawDrivers = (driversData.drivers || []) as DriverQueryItem[]
        const tripMapByDriver = new Map<string, { trip_number: number; count: number }>()
        for (const t of formattedTrips) {
          if (t.status !== 'completed' && t.status !== 'cancelled') {
            const driverId = rawTrips.find((rt) => rt.id === t.id)?.driver_id
            if (driverId) {
              tripMapByDriver.set(driverId, { trip_number: t.trip_number, count: t.order_count })
            }
          }
        }

        const formattedDrivers: DriverRoster[] = rawDrivers.map((d) => {
          const activeTripInfo = tripMapByDriver.get(d.id)
          return {
            ...d,
            current_trip_number: activeTripInfo?.trip_number || null,
            current_trip_count: activeTripInfo?.count || 0,
          }
        })
        setDrivers(formattedDrivers)
      } else {
        setActionError('تعذر تحميل بيانات مركز التحكم بالوردية')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchControlCenterData()

    // Network status listeners
    const handleOnline = () => {
      setIsOnline(true)
      fetchControlCenterData()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)

    // Supabase Realtime Channel
    const channel = supabase
      .channel('shift-control-center-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_driver_assignments' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_expenses' }, () => fetchControlCenterData())
      .subscribe()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      supabase.removeChannel(channel)
    }
  }, [fetchControlCenterData])

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
        fetchControlCenterData()
      } else {
        setLoginError(data.error || 'رمز الدخول غير صحيح')
      }
    } catch {
      setLoginError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsLoggingIn(false)
    }
  }

  // Open daily shift handler
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
        setTimeout(() => setActionSuccess(null), 6000)
        fetchControlCenterData()
      } else {
        setActionError(data.error || 'تعذر فتح الوردية')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر لفتح الوردية')
    } finally {
      setIsSubmittingShift(false)
    }
  }

  // Close daily shift handler (Z-Report)
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault()
    const staff = closeShiftStaff.trim()
    if (!staff) {
      setActionError('يرجى كتابة اسم المسؤول عن تقفيل الوردية')
      return
    }

    if (actualCashInput === '' || isNaN(parseFloat(actualCashInput))) {
      setActionError('يرجى إدخال المبلغ الفعلي الموجود بالدرج')
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
          closed_by: staff,
          final_cash: parseFloat(actualCashInput),
          notes: closeShiftNotes.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setShowCloseShiftModal(false)
        setActionSuccess('تم إغلاق الوردية والتقفيل المالي بنجاح وإرسال تقرير Z-Report إلى تلجرام ✓')
        setTimeout(() => setActionSuccess(null), 6000)
        fetchControlCenterData()
      } else {
        setActionError(data.error || 'تعذر إغلاق الوردية')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر لإغلاق الوردية')
    } finally {
      setIsSubmittingShift(false)
    }
  }

  // Add expense handler
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(expenseAmount)
    if (isNaN(amt) || amt <= 0) {
      setActionError('يرجى إدخال مبلغ صحيح')
      return
    }
    if (!expenseDesc.trim()) {
      setActionError('يرجى كتابة تفاصيل وبند المصروف')
      return
    }

    setIsSubmittingExpense(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: expenseCategory,
          amount: amt,
          description: expenseDesc.trim(),
          recipient_name: expenseRecipient.trim() || undefined,
          recorded_by: expenseRecordedBy.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setShowExpenseModal(false)
        setExpenseAmount('')
        setExpenseDesc('')
        setExpenseRecipient('')
        setActionSuccess('تم تسجيل المصروف بنجاح وإرسال تنبيه تلجرام ✓')
        setTimeout(() => setActionSuccess(null), 5000)
        fetchControlCenterData()
      } else {
        setActionError(data.error || 'تعذر تسجيل المصروف')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر لتسجيل المصروف')
    } finally {
      setIsSubmittingExpense(false)
    }
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-900 via-zinc-900 to-black flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20 animate-fade-in-up">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-2">🏬</span>
            <h1 className="text-xl font-extrabold text-gray-900">
              دخول مركز التحكم في الوردية
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              لوحة التشغيل المركزية لإدارة المطعم والكول سنتر
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                كود الإدارة / المدير
              </label>
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
              className="w-full bg-gradient-to-l from-amber-700 to-amber-600 hover:from-amber-800 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-md shadow-amber-900/30 disabled:opacity-50"
            >
              {isLoggingIn ? 'جاري التحقق...' : 'دخول مركز التحكم ✓'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const totalOrdersCount = orders.length
  const kitchenOrdersCount = orders.filter((o) => o.status === 'processing').length
  const readyOrdersCount = orders.filter((o) => o.status === 'ready').length
  const activeDriversCount = drivers.filter((d) => d.active_shift_id).length
  const availableDriversCount = drivers.filter((d) => d.status === 'available').length
  const activeTripsCount = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length
  const totalCollectedCash = trips.reduce((acc, t) => acc + Number(t.collected_amount || 0), 0)

  const filteredOrders = orders.filter((o) => {
    if (activeFilter === 'kitchen') return o.status === 'processing'
    if (activeFilter === 'ready') return o.status === 'ready'
    if (activeFilter === 'delivery') return o.order_type === 'delivery'
    if (activeFilter === 'takeaway') return o.order_type === 'takeaway'
    return true
  })

  // Discrepancy calculation for close shift
  const parsedActualCash = parseFloat(actualCashInput) || 0
  const expectedCashForModal = dailyShift ? Number(dailyShift.systemExpectedCash) : 0
  const discrepancy = parsedActualCash - expectedCashForModal

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans">
      <OpsNavbar title="مركز التحكم في وردية المطعم" subtitle="متابعة التشغيل اللحظي: الطلبات، المطبخ، الورديات، خطوط السير، والتحصيل" />

      {/* Connectivity Alert */}
      {!isOnline && (
        <div className="bg-red-600 text-white text-xs font-bold py-2 px-4 text-center shadow-inner flex items-center justify-center gap-2">
          <span>⚠️ لقد انقطع الاتصال بالإنترنت. البيانات المعروضة قد لا تكون لحظية، جاري إعادة الاتصال تلقائياً...</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl flex items-center justify-between text-xs font-bold shadow-sm">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-500 font-extrabold px-2">
              ✕
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center justify-between text-xs font-bold shadow-sm">
            <span>{actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-500 font-extrabold px-2">
              ✕
            </button>
          </div>
        )}

        {/* 1. Daily Shift Gatekeeper & Financial Control Banner */}
        {!dailyShift ? (
          <div className="bg-gradient-to-r from-red-950 via-zinc-900 to-red-950 text-white rounded-3xl p-6 shadow-xl border border-red-800/60 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-right">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                الوردية اليومية مغلقة حالياً
              </div>
              <h2 className="text-xl font-black text-white">
                ⚠️ لا توجد وردية يومية مفتوحة لتسجيل الحسابات والطلبات
              </h2>
              <p className="text-xs text-zinc-300 max-w-xl">
                لبدء يوم عمل جديد بدقة وحساب مالي منضبط، يجب فتح وردية وتحديد المسؤول (الكاشير) وإدخال عهدة الدرج الافتتاحية. سيتم إرسال إشعار فوري لصاحب المطعم عبر تلجرام.
              </p>
            </div>

            <button
              onClick={() => {
                setOpenShiftStaff('مصطفى الجزار')
                setCustomStaffName('')
                setInitialCashInput('500')
                setOpenShiftNotes('')
                setShowOpenShiftModal(true)
              }}
              className="bg-gradient-to-l from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-black px-6 py-4 rounded-2xl shadow-lg shadow-green-900/40 transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
            >
              <span className="text-lg">🔓</span>
              <span>فتح وردية يومية جديدة</span>
            </button>
          </div>
        ) : (
          <div className="bg-gradient-to-l from-zinc-950 via-amber-950 to-zinc-900 text-white rounded-3xl p-6 shadow-xl border border-amber-800/40 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    الوردية اليومية مفتوحة
                  </span>
                  <span className="text-xs font-bold text-amber-200/80">
                    تاريخ اليوم: {new Date(dailyShift.opened_at).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <h2 className="text-lg font-black text-white">
                  المسؤول الحالي: <span className="text-amber-400">{dailyShift.opened_by}</span>
                  <span className="text-xs font-normal text-zinc-400 mr-3">
                    (فتحت الساعة {new Date(dailyShift.opened_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})
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
                  className="bg-amber-600/90 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-amber-500/40 transition-all flex items-center gap-2"
                >
                  <span>💸</span>
                  <span>تسجيل مصروف / سلفة</span>
                </button>

                <button
                  onClick={() => {
                    setCloseShiftStaff(dailyShift.opened_by)
                    setActualCashInput('')
                    setCloseShiftNotes('')
                    setShowCloseShiftModal(true)
                  }}
                  className="bg-red-700 hover:bg-red-800 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <span>🔒</span>
                  <span>تقفيل الوردية والدرج (Z-Report)</span>
                </button>
              </div>
            </div>

            {/* Financial Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
              <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                <span className="text-[11px] text-zinc-400 font-bold block">العهدة الافتتاحية</span>
                <span className="text-xl font-black tabular-nums text-white">
                  {Number(dailyShift.initial_cash || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-emerald-950/40 p-3 rounded-2xl border border-emerald-800/40">
                <span className="text-[11px] text-emerald-300 font-bold block">مبيعات صالة واستلام</span>
                <span className="text-xl font-black tabular-nums text-emerald-300">
                  {Number(dailyShift.takeawaySales || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-purple-950/40 p-3 rounded-2xl border border-purple-800/40">
                <span className="text-[11px] text-purple-300 font-bold block">مبيعات الدليفري</span>
                <span className="text-xl font-black tabular-nums text-purple-300">
                  {Number(dailyShift.deliverySales || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-blue-950/40 p-3 rounded-2xl border border-blue-800/40">
                <span className="text-[11px] text-blue-300 font-bold block">إجمالي المبيعات</span>
                <span className="text-xl font-black tabular-nums text-blue-200">
                  {Number(dailyShift.totalSales || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-red-950/40 p-3 rounded-2xl border border-red-800/40">
                <span className="text-[11px] text-red-300 font-bold block">المصروفات والسلف ({expenses.length})</span>
                <span className="text-xl font-black tabular-nums text-red-300">
                  {Number(dailyShift.totalExpenses || 0).toFixed(0)} ج.م
                </span>
              </div>
              <div className="bg-amber-500/20 p-3 rounded-2xl border border-amber-500/50">
                <span className="text-[11px] text-amber-300 font-black block">نقدية الدرج المتوقعة</span>
                <span className="text-2xl font-black tabular-nums text-amber-300">
                  {Number(dailyShift.systemExpectedCash || 0).toFixed(0)} ج.م
                </span>
              </div>
            </div>

            {/* 🛵 Driver Fleet Accounting Snapshot (Single Source of Truth) */}
            {dailyShift.fleetAccounting && (
              <div className="bg-emerald-950/40 rounded-2xl border border-emerald-700/50 p-3.5 text-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🛵</span>
                  <div>
                    <span className="font-extrabold text-emerald-300 text-xs block">
                      محاسبة أسطول الطيارين للوردية ({dailyShift.fleetAccounting.driversCount} طيارين)
                    </span>
                    <span className="text-[11px] text-emerald-200/80">
                      إجمالي الساعات: {dailyShift.fleetAccounting.totalHours} س ({dailyShift.fleetAccounting.totalHoursWage} ج.م) • طلبات مسلّمة: {dailyShift.fleetAccounting.totalDeliveredOrders} (عمولات: {dailyShift.fleetAccounting.totalDeliveryCommissions} ج.م) • سلف مسحوبة: -{dailyShift.fleetAccounting.totalDriverAdvances} ج.م
                    </span>
                  </div>
                </div>
                <div className="bg-emerald-600/90 text-white px-4 py-2 rounded-xl text-center shadow-sm">
                  <span className="text-[10px] block font-bold text-emerald-100">إجمالي صافي مستحقات الأسطول</span>
                  <span className="text-base font-black tabular-nums">{dailyShift.fleetAccounting.totalNetPayout} ج.م</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Operations Live Summary */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3">
            <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
              <span>📊</span>
              <span>مؤشرات التشغيل اللحظية للطلبات والأسطول</span>
            </h3>

            {operatingStatus && (
              <div
                className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 border ${
                  operatingStatus.isOpen
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                <span>{operatingStatus.isOpen ? '🟢 المطعم مفتوح لاستقبال الطلبات' : '🔴 المطعم مغلق تشغيلياً'}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200">
              <span className="text-xs text-gray-500 font-bold block">إجمالي طلبات اليوم</span>
              <span className="text-2xl font-black tabular-nums text-gray-900">{totalOrdersCount}</span>
            </div>
            <div className="bg-blue-50 p-3 rounded-2xl border border-blue-200">
              <span className="text-xs text-blue-700 font-bold block">🔥 قيد التحضير</span>
              <span className="text-2xl font-black tabular-nums text-blue-900">{kitchenOrdersCount}</span>
            </div>
            <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200">
              <span className="text-xs text-emerald-700 font-bold block">📦 جاهز بالمطبخ</span>
              <span className="text-2xl font-black tabular-nums text-emerald-900">{readyOrdersCount}</span>
            </div>
            <div className="bg-green-50 p-3 rounded-2xl border border-green-200">
              <span className="text-xs text-green-700 font-bold block">🛵 طيارون متاحون</span>
              <span className="text-2xl font-black tabular-nums text-green-900">
                {availableDriversCount} <span className="text-xs font-medium text-gray-500">/ {activeDriversCount}</span>
              </span>
            </div>
            <div className="bg-purple-50 p-3 rounded-2xl border border-purple-200">
              <span className="text-xs text-purple-700 font-bold block">🚚 رحلات نشطة</span>
              <span className="text-2xl font-black tabular-nums text-purple-900">{activeTripsCount}</span>
            </div>
            <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200">
              <span className="text-xs text-amber-800 font-bold block">💵 المحصل بالرحلات</span>
              <span className="text-xl font-black tabular-nums text-amber-900">
                {totalCollectedCash.toFixed(0)} ج.م
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-xs font-bold text-gray-500">جاري تحميل بيانات مركز التحكم في الوردية...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Orders Column */}
            <div className="lg:col-span-7 bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-gray-100">
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  📋 طلبات الوردية ({filteredOrders.length})
                </h3>

                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold overflow-x-auto">
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      activeFilter === 'all' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-600'
                    }`}
                  >
                    الكل
                  </button>
                  <button
                    onClick={() => setActiveFilter('kitchen')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      activeFilter === 'kitchen' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600'
                    }`}
                  >
                    🔥 المطبخ
                  </button>
                  <button
                    onClick={() => setActiveFilter('ready')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      activeFilter === 'ready' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600'
                    }`}
                  >
                    📦 الجاهز
                  </button>
                  <button
                    onClick={() => setActiveFilter('delivery')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      activeFilter === 'delivery' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600'
                    }`}
                  >
                    🛵 دليفري
                  </button>
                  <button
                    onClick={() => setActiveFilter('takeaway')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      activeFilter === 'takeaway' ? 'bg-amber-700 text-white shadow-sm' : 'text-gray-600'
                    }`}
                  >
                    🏪 صالة
                  </button>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-12 text-xs font-bold text-gray-400">
                  لا توجد طلبات تطابق التصفية في الوقت الحالي
                </div>
              ) : (
                <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
                  {filteredOrders.map((o) => {
                    const statusCfg = STATUS_UI_CONFIG[o.status] || STATUS_UI_CONFIG.pending

                    return (
                      <div
                        key={o.id}
                        className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs hover:border-amber-300 transition-all"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-gray-900">
                              #{o.order_number}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                o.order_type === 'delivery'
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {o.order_type === 'delivery' ? '🛵 دليفري' : '🏪 استلام فرع'}
                            </span>
                            <span className="font-extrabold text-amber-700 tabular-nums">
                              {Number(o.total_amount).toFixed(0)} ج.م
                            </span>
                          </div>

                          <p className="text-gray-700 font-semibold">
                            👤 {o.customer_name} ({o.customer_phone})
                          </p>

                          {o.assigned_driver && (
                            <p className="text-indigo-800 font-bold text-[11px]">
                              🛵 الطيار المكلف: {o.assigned_driver.driver_name}
                            </p>
                          )}
                        </div>

                        <div className="text-left space-y-1">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border ${statusCfg.bgColor} ${statusCfg.color} ${statusCfg.borderColor}`}
                          >
                            {statusCfg.label}
                          </span>
                          <p className="text-[10px] font-medium text-gray-400 dir-ltr">
                            {new Date(o.created_at).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Sidebar: Drivers + Trips + Expenses */}
            <div className="lg:col-span-5 space-y-6">
              {/* Expenses Table */}
              <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    💸 مصروفات وسلف الوردية ({expenses.length})
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
                      className="text-xs font-bold text-amber-700 hover:text-amber-800"
                    >
                      + إضافة مصروف
                    </button>
                  )}
                </div>

                {expenses.length === 0 ? (
                  <div className="text-center py-5 text-xs text-gray-400 font-semibold">
                    لا توجد مصروفات أو سلف مسجلة خلال هذه الوردية
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {expenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 flex justify-between items-center text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{exp.description}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                              {exp.category}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {exp.recipient_name && <span>المستلم: {exp.recipient_name} • </span>}
                            <span>المسؤول: {exp.recorded_by || 'الإدارة'}</span>
                          </div>
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

              {/* Drivers roster */}
              <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    🛵 طاقم الطيارين بالوردية ({drivers.length})
                  </h3>
                  <Link href="/drivers" className="text-xs font-bold text-amber-700 hover:underline">
                    إدارة الورديات ➔
                  </Link>
                </div>

                <div className="space-y-2.5 max-h-48 overflow-y-auto">
                  {drivers.map((d) => (
                    <div
                      key={d.id}
                      className="p-3 rounded-2xl bg-gray-50 border border-gray-200 flex justify-between items-center text-xs"
                    >
                      <div>
                        <span className="font-extrabold text-gray-900 block">{d.name}</span>
                      </div>

                      <div className="text-left space-y-1">
                        <span
                          className={`inline-block text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                            d.status === 'available'
                              ? 'bg-green-100 text-green-800 border-green-300'
                              : d.status === 'busy'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-gray-200 text-gray-700 border-gray-300'
                          }`}
                        >
                          {d.status === 'available'
                            ? '🟢 متاح'
                            : d.status === 'busy'
                            ? '🟡 مشغول'
                            : '⚪ أوفلاين'}
                        </span>

                        {d.current_trip_number && (
                          <span className="block text-[10px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200">
                            رحلة #{d.current_trip_number} ({d.current_trip_count}/5)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Trips */}
              <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    🚚 خطوط السير والتحصيل المالي ({trips.length})
                  </h3>
                  <Link href="/assignments" className="text-xs font-bold text-purple-700 hover:underline">
                    تعيين طلبات ➔
                  </Link>
                </div>

                {trips.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400 font-semibold">
                    لا توجد خطوط سير نشطة حالياً بالوردية
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-56 overflow-y-auto">
                    {trips.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 rounded-2xl bg-zinc-900 text-white space-y-2 text-xs shadow-sm"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-amber-400 font-black text-sm">
                              رحلة #{t.trip_number}
                            </span>
                            <span className="text-gray-300 mr-2 font-bold">
                              ({t.driver_name})
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                              t.status === 'completed'
                                ? 'bg-green-950 text-green-400 border-green-800'
                                : 'bg-amber-950 text-amber-300 border-amber-800'
                            }`}
                          >
                            {t.status === 'completed' ? '✓ مكتملة' : 'نشطة'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[11px] bg-zinc-800/80 p-2 rounded-xl">
                          <span className="text-gray-300 font-bold">
                            السعة: {t.order_count}/5 طلبات
                          </span>
                          <span className="text-green-400 font-bold">
                            {t.delivered_count} تسليم | {t.failed_count} تعذر
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[11px] pt-1 text-amber-200 font-bold">
                          <span>المتوقع: {Number(t.expected_amount).toFixed(0)} ج.م</span>
                          <span>المحصل: {Number(t.collected_amount).toFixed(0)} ج.م</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: Open Daily Shift */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <span>🔓</span>
                <span>فتح وردية يومية للمطعم</span>
              </h3>
              <button onClick={() => setShowOpenShiftModal(false)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  اسم المسؤول عن الوردية (الكاشير)
                </label>
                <select
                  value={openShiftStaff}
                  onChange={(e) => setOpenShiftStaff(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs font-bold bg-white text-gray-900 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="مصطفى الجزار">مصطفى الجزار (المدير العام)</option>
                  <option value="أحمد مصطفى">أحمد مصطفى</option>
                  <option value="كاشير 1 (الصباح)">كاشير 1 (الصباح)</option>
                  <option value="كاشير 2 (المساء)">كاشير 2 (المساء)</option>
                  <option value="other">اسم آخر...</option>
                </select>

                {openShiftStaff === 'other' && (
                  <input
                    type="text"
                    placeholder="اكتب اسم المسؤول هنا..."
                    value={customStaffName}
                    onChange={(e) => setCustomStaffName(e.target.value)}
                    required
                    className="w-full mt-2 px-3.5 py-2 border border-amber-300 rounded-xl text-xs font-bold bg-amber-50 text-gray-900 focus:outline-none"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  العهدة النقدية الافتتاحية في الدرج (ج.م)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={initialCashInput}
                  onChange={(e) => setInitialCashInput(e.target.value)}
                  placeholder="مثال: 500"
                  required
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-black text-center text-gray-900 focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">مبلغ الفكة الأساسي الموجود بالدرج في بداية اليوم</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  ملاحظات افتتاح الوردية (اختياري)
                </label>
                <textarea
                  value={openShiftNotes}
                  onChange={(e) => setOpenShiftNotes(e.target.value)}
                  placeholder="أي ملاحظات تشغيلية تخص اليوم..."
                  rows={2}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-[11px] text-amber-900 font-semibold flex items-center gap-2">
                <span>📢</span>
                <span>سيتم إرسال إشعار لحظي عبر بوت تلجرام للإدارة بفتح الوردية وقيمة العهدة.</span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenShiftModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShift}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md disabled:opacity-50"
                >
                  {isSubmittingShift ? 'جاري الفتح...' : 'تأكيد فتح الوردية ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Close Daily Shift (Z-Report) */}
      {showCloseShiftModal && dailyShift && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <span>🔒</span>
                <span>تقفيل الوردية اليومية (Z-Report)</span>
              </h3>
              <button onClick={() => setShowCloseShiftModal(false)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">
                ✕
              </button>
            </div>

            {/* Financial Reconciliation Summary */}
            <div className="bg-zinc-900 text-white p-4 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between text-zinc-300">
                <span>العهدة الافتتاحية:</span>
                <span className="font-bold tabular-nums">+{Number(dailyShift.initial_cash || 0).toFixed(0)} ج.م</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>مبيعات الصالة والاستلام:</span>
                <span className="font-bold tabular-nums">+{Number(dailyShift.takeawaySales || 0).toFixed(0)} ج.م</span>
              </div>
              <div className="flex justify-between text-purple-400">
                <span>مبيعات الدليفري:</span>
                <span className="font-bold tabular-nums">+{Number(dailyShift.deliverySales || 0).toFixed(0)} ج.م</span>
              </div>
              <div className="flex justify-between text-red-400 border-b border-zinc-800 pb-1.5">
                <span>إجمالي المصروفات والسلف:</span>
                <span className="font-bold tabular-nums">-{Number(dailyShift.totalExpenses || 0).toFixed(0)} ج.م</span>
              </div>
              <div className="flex justify-between text-amber-300 font-black text-sm pt-1">
                <span>النقدية المتوقعة بالدرج (سيستم):</span>
                <span className="tabular-nums">{expectedCashForModal.toFixed(0)} ج.م</span>
              </div>
            </div>

            <form onSubmit={handleCloseShift} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  اسم المسؤول عن تقفيل الوردية
                </label>
                <input
                  type="text"
                  value={closeShiftStaff}
                  onChange={(e) => setCloseShiftStaff(e.target.value)}
                  placeholder="اسم الشخص الذي قام بعدّ النقدية..."
                  required
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  المبلغ الفعلي الموجود بالدرج بعد العدّ (ج.م) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={actualCashInput}
                  onChange={(e) => setActualCashInput(e.target.value)}
                  placeholder="أدخل المبلغ بعد العد اليدوي..."
                  required
                  className="w-full px-3.5 py-2.5 border-2 border-amber-500 rounded-xl text-base font-black text-center text-gray-900 focus:outline-none"
                />
              </div>

              {/* Live Discrepancy Indicator */}
              {actualCashInput !== '' && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold border flex items-center justify-between ${
                    discrepancy === 0
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : discrepancy > 0
                      ? 'bg-blue-50 text-blue-800 border-blue-300'
                      : 'bg-red-50 text-red-800 border-red-300'
                  }`}
                >
                  <span>
                    {discrepancy === 0
                      ? '✓ الدرج مطابق تماماً للحسابات'
                      : discrepancy > 0
                      ? '📈 زيادة في الدرج عن المتوقع'
                      : '📉 عجز في الدرج عن المتوقع'}
                  </span>
                  <span className="text-sm font-black tabular-nums dir-ltr">
                    {discrepancy > 0 ? `+${discrepancy.toFixed(0)}` : discrepancy.toFixed(0)} ج.م
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  ملاحظات التقفيل والوردية
                </label>
                <textarea
                  value={closeShiftNotes}
                  onChange={(e) => setCloseShiftNotes(e.target.value)}
                  placeholder="أي مبررات للعجز أو الزيادة أو تفاصيل هامة..."
                  rows={2}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="p-3 bg-red-50 rounded-2xl border border-red-200 text-[11px] text-red-900 font-semibold flex items-center gap-2">
                <span>📢</span>
                <span>سيتم إرسال تقرير Z-Report شامل فورياً لبوت تلجرام الإدارة مع الفارق المالي.</span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseShiftModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShift}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-md disabled:opacity-50"
                >
                  {isSubmittingShift ? 'جاري التقفيل...' : 'تأكيد التقفيل والإغلاق ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Add Expense / Advance */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <span>💸</span>
                <span>تسجيل مصروف / سلفة من درج الوردية</span>
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  تصنيف المصروف
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-bold bg-white text-gray-900 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="سلف طيارين">سلف طيارين (بنزين / عهدة طيار)</option>
                  <option value="مشتريات خضار ومستلزمات">مشتريات خضار ومستلزمات مطبخ</option>
                  <option value="عيش ومخبوزات">عيش ومخبوزات</option>
                  <option value="نظافة وصيانة">نظافة وصيانة سريعة</option>
                  <option value="مصاريف تشغيلية">مصاريف تشغيلية ونثريات</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  المبلغ المنصرف (ج.م) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.5"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="مثال: 150"
                  required
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-black text-center text-gray-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  بيان وتفاصيل الصرف *
                </label>
                <input
                  type="text"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  placeholder="مثال: شراء كراتين تغليف / بنزين للطيار كريم..."
                  required
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    المستلم (لمن سُلّم المبلغ)
                  </label>
                  <input
                    type="text"
                    value={expenseRecipient}
                    onChange={(e) => setExpenseRecipient(e.target.value)}
                    placeholder="مثال: الطيار محمد"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    المسؤول بالدرج
                  </label>
                  <input
                    type="text"
                    value={expenseRecordedBy}
                    onChange={(e) => setExpenseRecordedBy(e.target.value)}
                    placeholder="الكاشير"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 font-semibold flex items-center gap-1.5">
                <span>📢</span>
                <span>سيصل إشعار فوري لتلجرام الإدارة ببيان المصروف وخصمه من الدرج.</span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense}
                  className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-md disabled:opacity-50"
                >
                  {isSubmittingExpense ? 'جاري التسجيل...' : 'تسجيل وخصم من الدرج ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
