'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { OperatingHoursResult } from '@/lib/schedule'
import { STATUS_UI_CONFIG, OrderStatus } from '@/types/orders'
import Link from 'next/link'

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

export default function ShiftControlCenterPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [operatingStatus, setOperatingStatus] = useState<OperatingHoursResult | null>(null)
  const [orders, setOrders] = useState<ShiftOrder[]>([])
  const [drivers, setDrivers] = useState<DriverRoster[]>([])
  const [trips, setTrips] = useState<DeliveryTripOverview[]>([])
  
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'kitchen' | 'ready' | 'delivery' | 'takeaway'>('all')

  const fetchControlCenterData = async () => {
    setLoading(true)
    setActionError(null)

    try {
      const [scheduleRes, ordersRes, driversRes, tripsRes] = await Promise.all([
        fetch('/api/admin/schedule'),
        fetch('/api/admin/orders?status=all'),
        fetch('/api/admin/drivers'),
        fetch('/api/admin/trips'),
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

      if (ordersRes.ok && driversRes.ok && tripsRes.ok) {
        setIsAuthenticated(true)
        setOperatingStatus(scheduleData.status)

        const rawOrders = ordersData.orders || []
        setOrders(rawOrders)

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
  }

  useEffect(() => {
    const load = async () => {
      await fetchControlCenterData()
    }
    load()

    const channel = supabase
      .channel('shift-control-center-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_driver_assignments' }, () => fetchControlCenterData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_outcomes' }, () => fetchControlCenterData())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

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

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    setIsAuthenticated(false)
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

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans">
      <header className="bg-gradient-to-l from-zinc-950 via-zinc-900 to-amber-950 text-white shadow-md sticky top-0 z-30 border-b border-amber-900/40">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏬</span>
            <div>
              <h1 className="text-lg font-black tracking-tight text-amber-400">
                مركز التحكم في وردية المطعم — SHIFT CONTROL CENTER
              </h1>
              <p className="text-amber-200/80 text-xs">
                متابعة التشغيل اللحظي: الطلبات، المطبخ، الورديات، خطوط السير، والتحصيل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold">
            <Link
              href="/admin/orders"
              className="bg-zinc-800 hover:bg-zinc-700 text-gray-200 px-3 py-2 rounded-xl border border-zinc-700"
            >
              🥩 الطلبات
            </Link>
            <Link
              href="/admin/drivers"
              className="bg-zinc-800 hover:bg-zinc-700 text-gray-200 px-3 py-2 rounded-xl border border-zinc-700"
            >
              🛵 الورديات
            </Link>
            <Link
              href="/admin/assignments"
              className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 px-3 py-2 rounded-xl border border-purple-700/50"
            >
              📦 التعيين
            </Link>
            <Link
              href="/admin/schedule"
              className="bg-amber-900/60 hover:bg-amber-800 text-amber-200 px-3 py-2 rounded-xl border border-amber-700/50"
            >
              📅 المواعيد
            </Link>
            <button
              onClick={handleLogout}
              className="bg-red-900/40 hover:bg-red-800 text-red-200 px-3 py-2 rounded-xl border border-red-700/50"
            >
              خروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl flex items-center justify-between text-xs font-bold">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-500 font-extrabold">
              ✕
            </button>
          </div>
        )}

        <div className="bg-gradient-to-l from-zinc-900 via-amber-950 to-zinc-900 text-white rounded-3xl p-6 shadow-xl border border-amber-900/30 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <span className="text-xs font-bold text-amber-300/90 block">
                تاريخ الوردية التشغيلية
              </span>
              <h2 className="text-xl font-black tracking-wide">
                {new Date().toLocaleDateString('ar-EG', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                — Africa/Cairo
              </h2>
            </div>

            {operatingStatus && (
              <div
                className={`px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2 border ${
                  operatingStatus.isOpen
                    ? 'bg-green-950 text-green-300 border-green-700'
                    : 'bg-red-950 text-red-300 border-red-800'
                }`}
              >
                <span>{operatingStatus.isOpen ? '🟢 المطعم مفتوح تشغيلياً' : '🔴 المطعم مغلق'}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
            <div className="bg-white/10 p-3.5 rounded-2xl border border-white/10">
              <span className="text-xs text-amber-200 font-bold block">إجمالي الطلبات</span>
              <span className="text-2xl font-black tabular-nums text-white">{totalOrdersCount}</span>
            </div>
            <div className="bg-blue-950/60 p-3.5 rounded-2xl border border-blue-800/60">
              <span className="text-xs text-blue-300 font-bold block">🔥 قيد التحضير</span>
              <span className="text-2xl font-black tabular-nums text-blue-200">{kitchenOrdersCount}</span>
            </div>
            <div className="bg-emerald-950/60 p-3.5 rounded-2xl border border-emerald-800/60">
              <span className="text-xs text-emerald-300 font-bold block">📦 جاهز بالمطبخ</span>
              <span className="text-2xl font-black tabular-nums text-emerald-200">{readyOrdersCount}</span>
            </div>
            <div className="bg-green-950/60 p-3.5 rounded-2xl border border-green-800/60">
              <span className="text-xs text-green-300 font-bold block">🛵 طيارون بالوردية</span>
              <span className="text-2xl font-black tabular-nums text-green-200">
                {activeDriversCount} <span className="text-xs font-normal">({availableDriversCount} متاح)</span>
              </span>
            </div>
            <div className="bg-purple-950/60 p-3.5 rounded-2xl border border-purple-800/60">
              <span className="text-xs text-purple-300 font-bold block">🚚 رحلات دليفري نشطة</span>
              <span className="text-2xl font-black tabular-nums text-purple-200">{activeTripsCount}</span>
            </div>
            <div className="bg-amber-950/80 p-3.5 rounded-2xl border border-amber-700">
              <span className="text-xs text-amber-300 font-bold block">💵 المحصل بالرحلات</span>
              <span className="text-xl font-black tabular-nums text-amber-200">
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
            <div className="lg:col-span-7 bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-gray-100">
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  📋 طلبات الوردية الحالية ({filteredOrders.length})
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
                        className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs"
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

            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    🛵 طاقم الطيارين بالوردية ({drivers.length})
                  </h3>
                  <Link href="/admin/drivers" className="text-xs font-bold text-amber-700 hover:underline">
                    إدارة الورديات ➔
                  </Link>
                </div>

                <div className="space-y-2.5 max-h-56 overflow-y-auto">
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

              <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    🚚 خطوط السير والتحصيل المالي ({trips.length})
                  </h3>
                  <Link href="/admin/assignments" className="text-xs font-bold text-purple-700 hover:underline">
                    تعيين طلبات ➔
                  </Link>
                </div>

                {trips.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400 font-semibold">
                    لا توجد خطوط سير نشطة حالياً بالوردية
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto">
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
                          <span>الموقع المتوقع: {Number(t.expected_amount).toFixed(0)} ج.م</span>
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
    </div>
  )
}
