'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Driver } from '@/types/drivers'
import Link from 'next/link'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'

interface DriverExtended extends Driver {
  started_at?: string | null
  current_order_number?: number | null
  current_trip_id?: string | null
  current_trip_number?: number | null
}

interface ActiveTripSnapshot {
  id: string
  trip_number: number
  driver_id: string
  driver_name: string
  status: string
  expected_amount: number
  collected_amount: number
  order_count: number
}

interface DailyShiftContext {
  id: string
  shift_number: number
  opened_by: string
  driverCustodyCash?: number
  fleetAccounting?: {
    driversCount: number
    totalHoursWage: number
    totalDeliveryCommissions: number
    totalDriverAdvances: number
    totalNetPayout: number
  } | null
}

type DriverFilterTab = 'all' | 'available' | 'busy' | 'active_shift' | 'offline'

const DRIVER_STATUS_MAP: Record<string, { label: string; badgeClass: string; dotColor: string }> = {
  offline: {
    label: 'خارج الدوام',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-300',
    dotColor: 'bg-gray-400',
  },
  available: {
    label: 'متاح بالفرع',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    dotColor: 'bg-emerald-500',
  },
  busy: {
    label: 'في مشوار توصيل',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    dotColor: 'bg-amber-500',
  },
}

export default function DriversFleetCenterPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Core Data
  const [drivers, setDrivers] = useState<DriverExtended[]>([])
  const [trips, setTrips] = useState<ActiveTripSnapshot[]>([])
  const [dailyShift, setDailyShift] = useState<DailyShiftContext | null>(null)

  // UI State
  const [loading, setLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<DriverFilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Add Driver State
  const [showAddDriverModal, setShowAddDriverModal] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  // Debounce ref for Realtime synchronization
  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // ==========================================
  // FAST DATA LOADER (Coordinated Single Cycle)
  // ==========================================
  const loadFleetData = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    } else {
      setIsSyncing(true)
    }
    setActionError(null)

    try {
      const [driversRes, shiftRes, tripsRes] = await Promise.all([
        fetch('/api/admin/drivers'),
        fetch('/api/admin/daily-shift'),
        fetch('/api/admin/trips'),
      ])

      if (driversRes.status === 401 || shiftRes.status === 401 || tripsRes.status === 401) {
        setIsAuthenticated(false)
        setLoading(false)
        setIsSyncing(false)
        return
      }

      const [driversData, shiftData, tripsData] = await Promise.all([
        driversRes.json(),
        shiftRes.json(),
        tripsRes.json(),
      ])

      if (driversRes.ok) {
        setIsAuthenticated(true)

        if (shiftData.hasActiveShift && shiftData.activeShift) {
          setDailyShift(shiftData.activeShift)
        } else {
          setDailyShift(null)
        }

        const rawDrivers: Driver[] = driversData.drivers || []
        const rawTrips: ActiveTripSnapshot[] = tripsData.trips || []
        setTrips(rawTrips)

        // Map active trips to drivers
        const activeTripMap = new Map<string, { tripId: string; tripNumber: number }>()
        for (const t of rawTrips) {
          if (t.status !== 'completed' && t.status !== 'cancelled') {
            activeTripMap.set(t.driver_id, { tripId: t.id, tripNumber: t.trip_number })
          }
        }

        const extended: DriverExtended[] = rawDrivers.map((d) => {
          const tripInfo = activeTripMap.get(d.id)
          return {
            ...d,
            started_at: d.accounting?.started_at || null,
            current_trip_id: tripInfo?.tripId || null,
            current_trip_number: tripInfo?.tripNumber || null,
          }
        })

        setDrivers(extended)
      } else if (!isBackground) {
        setActionError(driversData.error || 'تعذر تحميل قائمة الطيارين')
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
      loadFleetData(true)
    }, 300)
  }, [loadFleetData])

  useEffect(() => {
    loadFleetData(false)

    const channel = supabase
      .channel('drivers-fleet-center-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_driver_assignments' }, () => scheduleBackgroundSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => scheduleBackgroundSync())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
    }
  }, [loadFleetData, scheduleBackgroundSync])

  // Close open dropdowns when clicking outside
  useEffect(() => {
    const handleDocumentClick = () => setOpenDropdownId(null)
    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleDocumentClick)
      return () => window.removeEventListener('click', handleDocumentClick)
    }
  }, [])

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
        loadFleetData(false)
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
  // DRIVER ACTIONS (Shift Toggle & Driver Creation)
  // ==========================================
  const handleShiftAction = async (driverId: string, action: 'start' | 'end', allowReopen = false) => {
    setBusyDriverId(driverId)
    setOpenDropdownId(null)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: driverId,
          action,
          allow_reopen: allowReopen,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess(data.message)
        loadFleetData(true)
      } else if (res.status === 409 && data.requires_override) {
        const confirmReopen = window.confirm(
          `⚠️ تنبيه رقابي:\n${data.error}\n\nهل أنت متأكد من فتح وردية ثانية استثنائية لهذا الطيار الآن؟`
        )
        if (confirmReopen) {
          await handleShiftAction(driverId, 'start', true)
        }
      } else {
        setActionError(data.error || 'فشل تنفيذ إجراء الوردية')
      }
    } catch {
      setActionError('حدث خطأ في الاتصال بالسيرفر')
    } finally {
      setBusyDriverId(null)
    }
  }

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsAdding(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      })

      const data = await res.json()
      if (res.ok) {
        setName('')
        setPhone('')
        setShowAddDriverModal(false)
        setActionSuccess('تمت إضافة الطيار بنجاح')
        loadFleetData(true)
      } else {
        setActionError(data.error || 'فشل إضافة الطيار')
      }
    } catch {
      setActionError('تعذر إضافة الطيار')
    } finally {
      setIsAdding(false)
    }
  }

  // ==========================================
  // FAST CLIENT-SIDE FILTERING (0ms Latency)
  // ==========================================
  const filteredDrivers = useMemo(() => {
    let list = drivers

    if (activeTab === 'available') {
      list = list.filter((d) => d.status === 'available')
    } else if (activeTab === 'busy') {
      list = list.filter((d) => d.status === 'busy')
    } else if (activeTab === 'active_shift') {
      list = list.filter((d) => !!d.active_shift_id)
    } else if (activeTab === 'offline') {
      list = list.filter((d) => d.status === 'offline')
    }

    const query = searchQuery.trim().toLowerCase()
    if (query) {
      list = list.filter((d) => {
        const nameStr = (d.name || '').toLowerCase()
        const phoneStr = (d.phone || '').toLowerCase()
        return nameStr.includes(query) || phoneStr.includes(query)
      })
    }

    return list
  }, [drivers, activeTab, searchQuery])

  // Fleet Overview Numbers (Canonical Backend SSoT)
  const availableCount = drivers.filter((d) => d.status === 'available').length
  const busyCount = drivers.filter((d) => d.status === 'busy').length
  const activeShiftCount = drivers.filter((d) => !!d.active_shift_id).length
  const offlineCount = drivers.filter((d) => d.status === 'offline').length
  const activeTripsCount = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length
  // SSoT: Outstanding custody read directly from dailyShiftContext without client reduce
  const pendingCustodyAmount = dailyShift ? Number(dailyShift.driverCustodyCash || 0) : 0

  // ==========================================
  // UNAUTHENTICATED STATE
  // ==========================================
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl border border-zinc-200">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-2">🛵</span>
            <h1 className="text-xl font-black text-gray-900">دخول إدارة أسطول الطيارين</h1>
            <p className="text-xs text-gray-500 mt-1">أدخل رمز المرور للوصول إلى مركز القيادة الميداني</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">كود الإدارة / الكاشير</label>
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
              {isLoggingIn ? 'جاري التحقق...' : 'دخول مركز الطيارين ✓'}
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
        title="مركز قيادة أسطول الطيارين"
        subtitle="متابعة فورية للورديات، خطوط السير، والعهد النقدية"
      />
      <GlobalShiftBar />

      <main className="max-w-7xl mx-auto px-4 py-5 flex-1 w-full space-y-5">
        {/* Global Notifications */}
        {!dailyShift && !loading && (
          <div className="bg-red-50 border border-red-300 text-red-950 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs font-bold shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-sm font-black text-red-900">الوردية اليومية للمطعم مغلقة حالياً</p>
                <p className="text-xs text-red-700 font-medium">
                  يجب فتح الوردية العامة للمطعم أولاً لبدء ورديات الطيارين وتسجيل إسناد الطلبات.
                </p>
              </div>
            </div>
            <Link
              href="/shift-control"
              className="bg-red-600 hover:bg-red-700 text-white font-black px-4 py-2 rounded-xl transition-all shadow-xs whitespace-nowrap"
            >
              الانتقال لفتح الوردية 🔓
            </Link>
          </div>
        )}

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
        {/* SECTION 1: FLEET OVERVIEW KPI BAR */}
        {/* ========================================== */}
        <section aria-label="ملخص حالة الأسطول" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Card 1: Available */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">متاح بالفرع</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h3 className="text-2xl font-black text-emerald-700 mt-1.5">{availableCount}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">جاهز للاستلام الفوري</p>
          </div>

          {/* Card 2: Busy in Trips */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">في مشاوير</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            </div>
            <h3 className="text-2xl font-black text-amber-700 mt-1.5">{busyCount}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">{activeTripsCount} رحلة نشطة بالميدان</p>
          </div>

          {/* Card 3: Active Shifts */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">في الخدمة اليوم</span>
              <span className="text-sm font-bold text-indigo-600">📋</span>
            </div>
            <h3 className="text-2xl font-black text-indigo-700 mt-1.5">{activeShiftCount}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">من إجمالي {drivers.length} طيار مسجل</p>
          </div>

          {/* Card 4: Offline */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">خارج الدوام</span>
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
            </div>
            <h3 className="text-2xl font-black text-gray-700 mt-1.5">{offlineCount}</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">ورديات مغلقة</p>
          </div>

          {/* Card 5: Outstanding Custody (Canonical Backend SSoT) */}
          <div className={`p-4 rounded-2xl border shadow-xs col-span-2 sm:col-span-1 ${
            pendingCustodyAmount > 0
              ? 'bg-amber-50/80 border-amber-300 text-amber-950'
              : 'bg-white border-gray-200 text-gray-900'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600">عهدة كاش معلقة</span>
              <span className="text-sm">💰</span>
            </div>
            <h3 className="text-xl font-black mt-1.5 tabular-nums text-amber-800">
              {pendingCustodyAmount.toLocaleString()} <span className="text-xs font-bold">ج.م</span>
            </h3>
            <p className="text-[10px] opacity-80 mt-0.5 font-medium">بانتظار التوريد للخزينة</p>
          </div>
        </section>

        {/* ========================================== */}
        {/* SECTION 2: SEARCH & FILTER CONTROLS */}
        {/* ========================================== */}
        <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="flex-1 max-w-md relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 ابحث باسم الطيار أو رقم الموبايل..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              {isSyncing && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  مزامنة...
                </span>
              )}

              <Link
                href="/assignments"
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-black py-2 px-3.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <span>📦</span>
                <span>إسناد وتوجيه الرحلات</span>
              </Link>

              <button
                onClick={() => setShowAddDriverModal(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black py-2 px-3.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <span>➕</span>
                <span>إضافة طيار</span>
              </button>

              <button
                onClick={() => loadFleetData(false)}
                disabled={loading}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold p-2 rounded-xl transition-all cursor-pointer"
                title="تحديث البيانات"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5 scrollbar-thin border-t border-gray-100">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'all'
                  ? 'bg-zinc-900 text-white shadow-xs font-black'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span>📋 الكل</span>
              <span className="text-[10px] bg-white/20 text-current px-1.5 py-0.2 rounded-full font-mono">{drivers.length}</span>
            </button>

            <button
              onClick={() => setActiveTab('available')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'available'
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <span>🟢 متاح بالفرع</span>
              <span className="text-[10px] bg-white/20 text-current px-1.5 py-0.2 rounded-full font-mono">{availableCount}</span>
            </button>

            <button
              onClick={() => setActiveTab('busy')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'busy'
                  ? 'bg-amber-600 text-white shadow-xs font-black'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span>🟡 في مشوار</span>
              <span className="text-[10px] bg-white/20 text-current px-1.5 py-0.2 rounded-full font-mono">{busyCount}</span>
            </button>

            <button
              onClick={() => setActiveTab('active_shift')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'active_shift'
                  ? 'bg-indigo-600 text-white shadow-xs font-black'
                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'
              }`}
            >
              <span>⏱️ ورديات نشطة</span>
              <span className="text-[10px] bg-white/20 text-current px-1.5 py-0.2 rounded-full font-mono">{activeShiftCount}</span>
            </button>

            <button
              onClick={() => setActiveTab('offline')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'offline'
                  ? 'bg-gray-700 text-white shadow-xs font-black'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>⚪ خارج الدوام</span>
              <span className="text-[10px] bg-white/20 text-current px-1.5 py-0.2 rounded-full font-mono">{offlineCount}</span>
            </button>
          </div>
        </div>

        {/* ========================================== */}
        {/* SECTION 3: DRIVER FLEET CARDS GRID */}
        {/* ========================================== */}
        {loading && drivers.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div key={idx} className="bg-white rounded-3xl border border-gray-200 p-5 space-y-3 animate-pulse">
                <div className="flex justify-between items-center">
                  <div className="h-6 w-28 bg-gray-200 rounded-lg" />
                  <div className="h-5 w-20 bg-gray-200 rounded-full" />
                </div>
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-20 bg-gray-100 rounded-2xl" />
                <div className="h-9 bg-gray-200 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 shadow-xs max-w-md mx-auto space-y-2">
            <span className="text-4xl block">🛵</span>
            <h3 className="font-black text-sm text-gray-800">لا يوجد طيارون في هذا القسم</h3>
            <p className="text-xs text-gray-400">جرب تغيير التبويب أو إضافة طيار جديد</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDrivers.map((driver) => {
              const statusCfg = DRIVER_STATUS_MAP[driver.status] || DRIVER_STATUS_MAP.offline
              const isWorking = busyDriverId === driver.id
              const isDropdownOpen = openDropdownId === driver.id
              const acc = driver.accounting

              return (
                <div
                  key={driver.id}
                  className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden flex flex-col justify-between hover:border-gray-300 transition-all"
                >
                  {/* Driver Header */}
                  <div className="p-4 border-b border-gray-100 bg-gray-50/70 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                        <span>{driver.name}</span>
                        {driver.active_shift_id && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded font-bold">
                            وردية نشطة
                          </span>
                        )}
                      </h3>
                      {driver.phone && (
                        <a
                          href={`tel:${driver.phone}`}
                          className="text-amber-700 hover:underline text-[11px] font-bold block mt-0.5 dir-ltr text-right"
                        >
                          📞 {driver.phone}
                        </a>
                      )}
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border shrink-0 ${statusCfg.badgeClass}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor}`} />
                      <span>{statusCfg.label}</span>
                    </span>
                  </div>

                  {/* Active Mission & Trip Banner */}
                  <div className="p-4 space-y-3 flex-1">
                    {driver.current_trip_number ? (
                      <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-2xl flex items-center justify-between text-xs text-amber-950 font-bold">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🛵</span>
                          <span>الرحلة الحالية #{driver.current_trip_number}</span>
                        </div>
                        <Link
                          href="/assignments"
                          className="text-[10px] bg-white border border-amber-300 text-amber-800 px-2 py-1 rounded-lg hover:bg-amber-100"
                        >
                          عرض الخط ↗
                        </Link>
                      </div>
                    ) : driver.status === 'available' ? (
                      <div className="bg-emerald-50/60 border border-emerald-200 p-2.5 rounded-2xl flex items-center justify-between text-xs text-emerald-900 font-medium">
                        <span>🟢 متواجد بالفرع وجاهز لاستلام طلبات جديدة</span>
                        <Link
                          href="/assignments"
                          className="text-[10px] bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-emerald-700"
                        >
                          إسناد ⬅️
                        </Link>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-dashed border-gray-200 p-2.5 rounded-2xl text-center text-[11px] text-gray-400 font-medium">
                        الطيار خارج أوقات العمل حالياً
                      </div>
                    )}

                    {/* Canonical Driver Accounting Snapshot */}
                    {acc ? (
                      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3 space-y-2 text-xs">
                        <div className="flex justify-between items-center text-[11px] border-b border-zinc-200/80 pb-1.5">
                          <span className="font-bold text-gray-700">⏱️ ساعات الدوام:</span>
                          <span className="font-black text-gray-900 tabular-nums">{acc.duration_hours} س</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="bg-white p-2 rounded-xl border border-zinc-200">
                            <span className="text-gray-500 block text-[10px]">أجر الساعات:</span>
                            <span className="font-black text-gray-900 tabular-nums">{acc.hours_wage} ج.م</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-zinc-200">
                            <span className="text-gray-500 block text-[10px]">طلبات ({acc.delivered_orders_count}):</span>
                            <span className="font-black text-emerald-600 tabular-nums">+{acc.delivery_commission_total} ج.م</span>
                          </div>
                        </div>

                        {acc.advances_total > 0 && (
                          <div className="flex justify-between items-center text-[11px] bg-rose-50 border border-rose-200 px-2 py-1 rounded-xl text-rose-900">
                            <span className="font-bold">سلف مسحوبة:</span>
                            <span className="font-black tabular-nums">-{acc.advances_total} ج.م</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center bg-zinc-900 text-white p-2 rounded-xl text-[11px]">
                          <span className="font-bold">صافي مستحق الطيار:</span>
                          <span className="text-xs font-black text-emerald-400 tabular-nums">{acc.net_payout} ج.م</span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Smart Actions Footer */}
                  <div className="p-4 bg-gray-50 border-t border-gray-100 mt-auto">
                    <div className="flex items-center gap-2 relative">
                      {/* Primary Action Button */}
                      {!driver.active_shift_id ? (
                        <button
                          onClick={() => handleShiftAction(driver.id, 'start')}
                          disabled={isWorking || !driver.is_active || !dailyShift}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                          title={!dailyShift ? 'يجب فتح الوردية العامة للمطعم أولاً' : ''}
                        >
                          <span>▶️</span>
                          <span>{isWorking ? 'جاري الفتح...' : 'بدء وردية الطيار'}</span>
                        </button>
                      ) : driver.status === 'available' ? (
                        <Link
                          href="/assignments"
                          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-black py-2.5 rounded-xl text-xs transition-all shadow-xs text-center flex items-center justify-center gap-1.5"
                        >
                          <span>📦</span>
                          <span>إسناد طلبات للطيار</span>
                        </Link>
                      ) : (
                        <Link
                          href="/assignments"
                          className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-black py-2.5 rounded-xl text-xs transition-all shadow-xs text-center flex items-center justify-center gap-1.5"
                        >
                          <span>🛵</span>
                          <span>متابعة خط السير والتسوية</span>
                        </Link>
                      )}

                      {/* Secondary Action Dropdown (⋮) */}
                      {driver.active_shift_id && (
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setOpenDropdownId(isDropdownOpen ? null : driver.id)}
                            className="p-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-black transition-colors"
                            title="خيارات إضافية"
                          >
                            ⋮
                          </button>

                          {isDropdownOpen && (
                            <div className="absolute left-0 bottom-full mb-1.5 w-44 bg-zinc-900 text-white rounded-2xl shadow-2xl border border-zinc-700 p-1.5 z-30 text-xs space-y-1">
                              <Link
                                href="/shift-control"
                                className="block w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-amber-300 font-bold"
                              >
                                💸 صرف سلفة نقدية
                              </Link>

                              <button
                                onClick={() => handleShiftAction(driver.id, 'end')}
                                disabled={isWorking}
                                className="w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-red-950 text-rose-400 font-bold"
                              >
                                ⏹️ إنهاء وردية الطيار
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* MODAL: ADD DRIVER */}
      {showAddDriverModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <span>➕ إضافة طيار جديد لأسطول المطعم</span>
              </h3>
              <button
                onClick={() => setShowAddDriverModal(false)}
                className="text-xs font-bold text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDriver} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">اسم الطيار:</label>
                <input
                  type="text"
                  placeholder="مثال: أحمد عبد الله..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">رقم الموبايل (11 رقم):</label>
                <input
                  type="tel"
                  placeholder="010XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50 text-left"
                  dir="ltr"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddDriverModal(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isAdding || !name || !phone}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs transition-all disabled:opacity-50"
                >
                  {isAdding ? 'جاري الحفظ...' : 'حفظ الطيار ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
