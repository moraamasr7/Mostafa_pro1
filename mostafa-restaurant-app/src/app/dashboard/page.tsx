'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'
import Link from 'next/link'
import { playAlertSound } from '@/lib/audioAlert'

interface CurrentStaffInfo {
  id: string
  full_name: string
  role: string
}

interface ActiveShiftData {
  id: string
  shift_number: number
  opened_by: string
  opened_at: string
  totalSales: number
  cashSales: number
  systemExpectedCash: number
  driverCustodyCash: number
  uncollectedCash?: number
  fleetAccounting?: {
    driversCount: number
    totalDeliveredOrders: number
    totalNetPayout: number
  } | null
}

interface OrderItemSummary {
  id: string
  order_number: number
  customer_name: string
  customer_phone?: string
  order_type: 'takeaway' | 'delivery' | 'dine_in'
  status: 'pending' | 'processing' | 'ready' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled' | 'failed'
  total_amount: number
  created_at: string
  daily_shift_id?: string
  driver_name?: string
}

interface DriverSnapshotItem {
  id: string
  name: string
  status: 'offline' | 'available' | 'busy'
  active_shift_id?: string | null
  current_trip_number?: number | null
}

interface DeliveryTripSnapshot {
  id: string
  trip_number: number
  driver_name: string
  status: string
  expected_amount: number
  collected_amount: number
  order_count: number
}

interface NeedsAttentionItem {
  id: string
  type: 'urgent' | 'warning' | 'info'
  category: 'pending_order' | 'unassigned_ready' | 'driver_custody' | 'shift_blocker' | 'open_trip'
  title: string
  description: string
  actionLabel: string
  actionHref: string
  count?: number
}

interface LiveAlert {
  id: string
  title: string
  message: string
  time: string
  type: 'urgent' | 'warning' | 'info' | 'success'
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'مالك المطعم',
  manager: 'مشرف / مدير',
  cashier: 'كاشير',
  kitchen: 'شيف / مطبخ',
  driver: 'طيار',
}

const ORDER_STATUS_LABELS: Record<string, { label: string; badgeClass: string }> = {
  pending: { label: 'طلب جديد ⏳', badgeClass: 'bg-amber-100 text-amber-900 border-amber-300' },
  processing: { label: 'قيد التحضير 🍳', badgeClass: 'bg-blue-100 text-blue-900 border-blue-300' },
  ready: { label: 'جاهز للاستلام/التوصيل 📦', badgeClass: 'bg-purple-100 text-purple-900 border-purple-300' },
  assigned: { label: 'تم الإسناد للطيار 🛵', badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
  picked_up: { label: 'استلمه الطيار 🛵', badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
  out_for_delivery: { label: 'في الطريق للعميل 🚀', badgeClass: 'bg-teal-100 text-teal-900 border-teal-300' },
  delivered: { label: 'تم التوصيل ✅', badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  completed: { label: 'مكتمل ✅', badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  cancelled: { label: 'ملغي ❌', badgeClass: 'bg-rose-100 text-rose-900 border-rose-300' },
  failed: { label: 'تعذر التسليم ⚠️', badgeClass: 'bg-rose-100 text-rose-900 border-rose-300' },
}

export default function DashboardCommandCenterPage() {
  const [loading, setLoading] = useState(true)
  const [activeShift, setActiveShift] = useState<ActiveShiftData | null>(null)
  const [currentStaff, setCurrentStaff] = useState<CurrentStaffInfo | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isSendingReport, setIsSendingReport] = useState(false)

  // Operational Lists
  const [orders, setOrders] = useState<OrderItemSummary[]>([])
  const [drivers, setDrivers] = useState<DriverSnapshotItem[]>([])
  const [trips, setTrips] = useState<DeliveryTripSnapshot[]>([])

  // Live Alerts & Toasts
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([])
  const [activeToast, setActiveToast] = useState<LiveAlert | null>(null)
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const triggerAlert = useCallback(
    (alert: Omit<LiveAlert, 'id' | 'time'>) => {
      const newAlert: LiveAlert = {
        ...alert,
        id: Math.random().toString(36).substring(2, 9),
        time: new Date().toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Africa/Cairo',
        }),
      }

      setLiveAlerts((prev) => [newAlert, ...prev.slice(0, 19)])
      setActiveToast(newAlert)

      if (soundEnabled) {
        playAlertSound(alert.type)
      }

      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
      toastTimeoutRef.current = setTimeout(() => {
        setActiveToast(null)
      }, 6000)
    },
    [soundEnabled]
  )

  // Realtime debounce ref
  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const fetchCommandCenterData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    try {
      const [ordersRes, driversRes, tripsRes, dailyShiftRes] = await Promise.all([
        fetch('/api/admin/orders?status=all'),
        fetch('/api/admin/drivers'),
        fetch('/api/admin/trips'),
        fetch('/api/admin/daily-shift'),
      ])

      const ordersData = await ordersRes.json()
      const driversData = await driversRes.json()
      const tripsData = await tripsRes.json()
      const dailyShiftData = await dailyShiftRes.json()

      const fetchedOrders: OrderItemSummary[] = ordersData.orders || []
      const fetchedDrivers: DriverSnapshotItem[] = driversData.drivers || []
      const fetchedTrips: DeliveryTripSnapshot[] = tripsData.trips || []

      setOrders(fetchedOrders)
      setDrivers(fetchedDrivers)
      setTrips(fetchedTrips)

      if (dailyShiftData.currentStaff) {
        setCurrentStaff(dailyShiftData.currentStaff)
      }

      if (dailyShiftData.hasActiveShift && dailyShiftData.activeShift) {
        setActiveShift(dailyShiftData.activeShift)
      } else {
        setActiveShift(null)
      }
    } catch (err) {
      console.error('Error loading command center data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const scheduleBackgroundSync = useCallback(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current)
    }
    syncDebounceRef.current = setTimeout(() => {
      fetchCommandCenterData(true)
    }, 300)
  }, [fetchCommandCenterData])

  useEffect(() => {
    fetchCommandCenterData(false)

    const channel = supabase
      .channel('command-center-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
        scheduleBackgroundSync()

        if (payload.eventType === 'INSERT') {
          const orderNum = payload.new?.order_number || ''
          const customer = payload.new?.customer_name || 'عميل'
          const amount = payload.new?.total_amount || 0
          triggerAlert({
            title: '🔥 طلب جديد ورد للتو',
            message: `طلب جديد #${orderNum} - ${customer} (${amount} ج.م)`,
            type: 'success',
          })
        } else if (payload.eventType === 'UPDATE') {
          const newStatus = payload.new?.status
          const oldStatus = payload.old?.status
          const orderNum = payload.new?.order_number || ''
          const customer = payload.new?.customer_name || 'عميل'

          if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
            triggerAlert({
              title: '❌ إلغاء طلب فوري',
              message: `تم إلغاء الطلب #${orderNum} للعميل ${customer}`,
              type: 'urgent',
            })
          } else if (newStatus === 'failed' && oldStatus !== 'failed') {
            triggerAlert({
              title: '⚠️ تعذر تسليم طلب',
              message: `تعذر توصيل الطلب #${orderNum} للعميل ${customer}`,
              type: 'warning',
            })
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_expenses' }, () => {
        scheduleBackgroundSync()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [fetchCommandCenterData, scheduleBackgroundSync, triggerAlert])

  const handleSendTelegramReport = async () => {
    setIsSendingReport(true)
    try {
      const shiftQuery = activeShift?.id ? `?shift_id=${activeShift.id}` : ''
      const res = await fetch(`/api/admin/daily-report${shiftQuery}`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        triggerAlert({
          title: '✅ تم إرسال التقرير اليومي',
          message: 'تم إرسال التقرير التنفيذي الشامل إلى تليجرام المالك بنجاح',
          type: 'success',
        })
      } else {
        alert(data.error || 'تعذر إرسال التقرير')
      }
    } catch {
      alert('حدث خطأ أثناء إرسال التقرير')
    } finally {
      setIsSendingReport(false)
    }
  }

  // ==========================================
  // 5 CORE OPERATIONAL COMMAND KPIS
  // ==========================================
  const activeOrdersCount = orders.filter((o) =>
    ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
  ).length

  const kitchenProcessingCount = orders.filter((o) => o.status === 'processing').length

  const outForDeliveryCount = orders.filter((o) =>
    ['assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
  ).length

  // SSoT: Shift Sales come strictly from backend accounting engine
  const canonicalShiftSales = activeShift ? Number(activeShift.totalSales || 0) : 0

  // ==========================================
  // NEEDS ATTENTION BOTTLENECK AUDIT (See -> Understand)
  // ==========================================
  const needsAttentionList: NeedsAttentionItem[] = []

  // 1. Pending Orders Awaiting Acceptance
  const pendingOrders = orders.filter((o) => o.status === 'pending')
  if (pendingOrders.length > 0) {
    needsAttentionList.push({
      id: 'pending_orders',
      type: 'urgent',
      category: 'pending_order',
      title: `${pendingOrders.length} طلب جديد بحاجة للتأكيد والدخول للمطبخ`,
      description: `طلبات جديدة بالانتظار (أرقام: ${pendingOrders.slice(0, 4).map((o) => '#' + o.order_number).join(', ')})`,
      actionLabel: 'فتح الطلبات وتأكيدها ⬅️',
      actionHref: '/orders?status=pending',
      count: pendingOrders.length,
    })
  }

  // 2. Ready Delivery Orders Unassigned to Drivers
  const unassignedReadyDelivery = orders.filter(
    (o) => o.status === 'ready' && o.order_type === 'delivery' && !o.driver_name
  )
  if (unassignedReadyDelivery.length > 0) {
    needsAttentionList.push({
      id: 'unassigned_ready',
      type: 'warning',
      category: 'unassigned_ready',
      title: `${unassignedReadyDelivery.length} طلب دليفري جاهز بالمطبخ بدون طيار`,
      description: 'أصناف جاهزة ساخنة بانتظار إسناد وتوجيه طيار لاستلامها',
      actionLabel: 'إسناد لطيار فوراً 🛵',
      actionHref: '/assignments',
      count: unassignedReadyDelivery.length,
    })
  }

  // 3. Driver Custody Pending Settlement
  const pendingCustodyCash = activeShift ? Number(activeShift.driverCustodyCash || 0) : 0
  if (pendingCustodyCash > 0) {
    needsAttentionList.push({
      id: 'driver_custody',
      type: 'warning',
      category: 'driver_custody',
      title: `عهدة كاش معلقة مع الطيارين بقيمة ${pendingCustodyCash.toLocaleString()} ج.م`,
      description: 'مبالغ نقدية لرحلات مكتملة بانتظار التوريد والتصفية داخل الخزينة',
      actionLabel: 'تسوية عهدة الطيارين 💰',
      actionHref: '/drivers',
    })
  }

  // 4. Open Delivery Trips in Field
  const activeTrips = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
  if (activeTrips.length > 0) {
    needsAttentionList.push({
      id: 'active_trips',
      type: 'info',
      category: 'open_trip',
      title: `${activeTrips.length} رحلة دليفري نشطة في الميدان حالياً`,
      description: 'طيارين في خطوط السير لتوصيل الطلبات للعملاء',
      actionLabel: 'متابعة خطوط السير 🗺️',
      actionHref: '/drivers',
      count: activeTrips.length,
    })
  }

  // 5. Shift Required Gatekeeper
  if (!activeShift) {
    needsAttentionList.unshift({
      id: 'no_shift',
      type: 'urgent',
      category: 'shift_blocker',
      title: 'الوردية التشغيلية مغلقة — العمليات والطلبات مقيدة',
      description: 'يجب فتح وردية جديدة وتثبيت العهدة الافتتاحية للمباشرة',
      actionLabel: 'فتح وردية الآن 🔓',
      actionHref: '/shift-control',
    })
  }

  const needsAttentionCount = needsAttentionList.length

  // Top Active Orders Requiring Attention
  const activeUrgentOrders = orders
    .filter((o) => ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status))
    .slice(0, 6)

  // Driver Fleet Snapshot
  const availableDriversCount = drivers.filter((d) => d.status === 'available').length
  const busyDriversCount = drivers.filter((d) => d.status === 'busy').length
  const activeDriversCount = drivers.filter((d) => d.status === 'available' || d.status === 'busy' || d.active_shift_id).length

  return (
    <div className="min-h-screen bg-zinc-900/10 bg-gradient-to-b from-zinc-100 to-gray-100 text-gray-900 flex flex-col font-sans relative pb-20 md:pb-6">
      {/* Global Operations Navbar */}
      <OpsNavbar
        title="مركز العمليات والقيادة (Command Center)"
        subtitle="نظرة تشغيلية فورية: المتابعة والتدخل والإجراء السريع"
      />

      {/* Global Shift Bar (SSoT Shift Context) */}
      <GlobalShiftBar />

      {/* Realtime Floating Toast Notification */}
      {activeToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4 animate-bounce">
          <div
            className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 backdrop-blur-md ${
              activeToast.type === 'urgent'
                ? 'bg-rose-950/95 border-rose-600 text-rose-100'
                : activeToast.type === 'warning'
                ? 'bg-amber-950/95 border-amber-600 text-amber-100'
                : activeToast.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-600 text-emerald-100'
                : 'bg-zinc-900/95 border-blue-500 text-blue-100'
            }`}
          >
            <div className="text-2xl mt-0.5">
              {activeToast.type === 'urgent'
                ? '🚨'
                : activeToast.type === 'warning'
                ? '⚠️'
                : activeToast.type === 'success'
                ? '🔔'
                : '🛵'}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black tracking-wide">{activeToast.title}</h4>
                <span className="text-[10px] opacity-75 font-mono">{activeToast.time}</span>
              </div>
              <p className="text-xs font-semibold mt-1 opacity-90 leading-relaxed">{activeToast.message}</p>
            </div>
            <button
              onClick={() => setActiveToast(null)}
              className="text-white/60 hover:text-white text-sm font-bold px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {/* Header Bar: Status Controls & Live Connectivity */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-gray-800">مركز القيادة اللحظي</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  متصل ومباشر ⚡
                </span>
              </div>
              <p className="text-[11px] text-gray-500 font-medium">
                تحديث أوتوماتيكي لكافة الحركات التشغيلية والطلبات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {currentStaff && (
              <div className="hidden sm:flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-xl text-xs">
                <span className="font-bold text-gray-800">👤 {currentStaff.full_name}</span>
                <span className="bg-zinc-200 text-zinc-700 font-bold px-1.5 py-0.5 rounded text-[10px]">
                  {ROLE_LABELS[currentStaff.role] || currentStaff.role}
                </span>
              </div>
            )}

            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled)
                if (!soundEnabled) playAlertSound('info')
              }}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 ${
                soundEnabled
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <span>{soundEnabled ? '🔊 التنبيه مفعل' : '🔇 مكتوم'}</span>
            </button>

            <button
              onClick={() => fetchCommandCenterData(false)}
              disabled={loading}
              className="text-xs font-bold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>🔄</span>
              <span className="hidden sm:inline">تحديث</span>
            </button>
          </div>
        </div>

        {/* ========================================== */}
        {/* SECTION B: 5 CORE OPERATIONAL COMMAND KPIS */}
        {/* ========================================== */}
        <section aria-label="مؤشرات القيادة والتشغيل" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* KPI 1: Active Orders */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-200 shadow-xs hover:border-amber-400 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">الطلبات النشطة</span>
              <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-sm font-bold">
                ⚡
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">{activeOrdersCount}</h3>
            <p className="text-[11px] text-amber-700 font-semibold mt-1">
              {pendingOrders.length} جديد • {kitchenProcessingCount} مطبخ
            </p>
          </div>

          {/* KPI 2: Kitchen / Processing */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-200 shadow-xs hover:border-blue-400 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">في المطبخ (تحضير)</span>
              <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-sm font-bold">
                🍳
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">{kitchenProcessingCount}</h3>
            <p className="text-[11px] text-blue-700 font-semibold mt-1">
              أصناف قيد التجهيز
            </p>
          </div>

          {/* KPI 3: Out for Delivery */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-200 shadow-xs hover:border-teal-400 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">مع الطيارين (توصيل)</span>
              <span className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-sm font-bold">
                🛵
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">{outForDeliveryCount}</h3>
            <p className="text-[11px] text-teal-700 font-semibold mt-1">
              {activeTrips.length} رحلة ميدانية نشطة
            </p>
          </div>

          {/* KPI 4: Shift Sales (Canonical SSoT) */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-200 shadow-xs hover:border-emerald-400 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">مبيعات الوردية</span>
              <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold">
                💰
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-emerald-700 mt-2 tabular-nums">
              {canonicalShiftSales.toLocaleString()} <span className="text-xs font-bold">ج.م</span>
            </h3>
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">
              {activeShift ? `الوردية #${activeShift.shift_number}` : 'الوردية مغلقة'}
            </p>
          </div>

          {/* KPI 5: Needs Attention */}
          <div className={`p-4 sm:p-5 rounded-3xl border shadow-xs transition-all col-span-2 sm:col-span-1 ${
            needsAttentionCount > 0
              ? 'bg-rose-50/70 border-rose-300 text-rose-950'
              : 'bg-white border-gray-200 text-gray-900'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600">تتطلب تدخلاً فورياً</span>
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${
                needsAttentionCount > 0 ? 'bg-rose-200 text-rose-900 animate-pulse' : 'bg-zinc-100 text-zinc-600'
              }`}>
                ⚠️
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black mt-2">
              {needsAttentionCount}
            </h3>
            <p className="text-[11px] font-semibold mt-1 opacity-90">
              {needsAttentionCount > 0 ? 'معوقات بحاجة للحسم' : 'العمليات منضبطة تماماً ✓'}
            </p>
          </div>
        </section>

        {/* ========================================== */}
        {/* SECTION C: NEEDS ATTENTION HUB (See -> Understand -> Act) */}
        {/* ========================================== */}
        {needsAttentionList.length > 0 && (
          <section aria-label="مركز التدخل السريع" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <span>⚠️ مركز التدخل السريع (Needs Attention Hub)</span>
                <span className="text-[10px] bg-rose-100 text-rose-900 font-extrabold px-2.5 py-0.5 rounded-full">
                  {needsAttentionList.length} تنبيه تشغيلي
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {needsAttentionList.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs transition-all ${
                    item.type === 'urgent'
                      ? 'bg-rose-50/90 border-rose-300 text-rose-950'
                      : item.type === 'warning'
                      ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                      : 'bg-sky-50/90 border-sky-300 text-sky-950'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">
                        {item.type === 'urgent' ? '🚨' : item.type === 'warning' ? '⚠️' : 'ℹ️'}
                      </span>
                      <h4 className="text-xs sm:text-sm font-black tracking-tight">{item.title}</h4>
                    </div>
                    <p className="text-[11px] opacity-85 pr-6 font-medium">{item.description}</p>
                  </div>

                  <Link
                    href={item.actionHref}
                    className={`text-xs font-black px-3.5 py-2 rounded-xl shadow-xs transition-all text-center whitespace-nowrap shrink-0 ${
                      item.type === 'urgent'
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : item.type === 'warning'
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-sky-600 hover:bg-sky-700 text-white'
                    }`}
                  >
                    {item.actionLabel}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ========================================== */}
        {/* SECTION D: QUICK ACTIONS BAR (Act) */}
        {/* ========================================== */}
        <section aria-label="إجراءات العمليات السريعة" className="space-y-3">
          <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
            <span>⚡ إجراءات التشغيل السريعة (Quick Actions)</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Action 1: New Manual Order */}
            <Link
              href="/orders"
              className="bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white p-3.5 rounded-2xl shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-all group"
            >
              <span className="text-xl group-hover:scale-110 transition-transform">➕</span>
              <span className="text-xs font-black">طلب جديد</span>
            </Link>

            {/* Action 2: Orders Board */}
            <Link
              href="/orders"
              className="bg-white hover:bg-zinc-50 text-gray-900 border border-gray-200 p-3.5 rounded-2xl shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-all group"
            >
              <span className="text-xl group-hover:scale-110 transition-transform">📦</span>
              <span className="text-xs font-bold">لوحة الطلبات</span>
            </Link>

            {/* Action 3: Dispatch & Assignments */}
            <Link
              href="/assignments"
              className="bg-white hover:bg-zinc-50 text-gray-900 border border-gray-200 p-3.5 rounded-2xl shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-all group"
            >
              <span className="text-xl group-hover:scale-110 transition-transform">🛵</span>
              <span className="text-xs font-bold">إسناد وتوجيه</span>
            </Link>

            {/* Action 4: Kitchen KDS */}
            <Link
              href="/kitchen"
              className="bg-white hover:bg-zinc-50 text-gray-900 border border-gray-200 p-3.5 rounded-2xl shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-all group"
            >
              <span className="text-xl group-hover:scale-110 transition-transform">🍳</span>
              <span className="text-xs font-bold">شاشة المطبخ</span>
            </Link>

            {/* Action 5: Shift Control & Cash */}
            <Link
              href="/shift-control"
              className="bg-white hover:bg-zinc-50 text-gray-900 border border-gray-200 p-3.5 rounded-2xl shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-all group"
            >
              <span className="text-xl group-hover:scale-110 transition-transform">💰</span>
              <span className="text-xs font-bold">الوردية والخزينة</span>
            </Link>

            {/* Action 6: Send Telegram Summary */}
            <button
              onClick={handleSendTelegramReport}
              disabled={isSendingReport || !activeShift}
              className={`p-3.5 rounded-2xl shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer ${
                activeShift
                  ? 'bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
              }`}
              title={activeShift ? 'إرسال ملخص الوردية لتليجرام المالك' : 'لا توجد وردية مفتوحة'}
            >
              <span className="text-xl">{isSendingReport ? '⏳' : '📲'}</span>
              <span className="text-xs font-bold">تقرير تليجرام</span>
            </button>
          </div>
        </section>

        {/* ========================================== */}
        {/* SECTION E & F: ACTIVE ORDERS QUEUE & DRIVER FLEET SNAPSHOT */}
        {/* ========================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Orders List (2 Columns on Desktop) */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-gray-900 flex items-center gap-2">
                  <span>📋 قائمة الطلبات النشطة ذات الأولوية</span>
                  <span className="text-xs bg-zinc-100 text-zinc-700 font-bold px-2 py-0.5 rounded-full">
                    {activeOrdersCount} طلب قيد التنفيذ
                  </span>
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  الطلبات التي تتطلب تقدماً بالحالة أو تسليم بالمطبخ أو التوصيل
                </p>
              </div>

              <Link
                href="/orders"
                className="text-xs font-black text-amber-700 hover:text-amber-800 hover:underline flex items-center gap-1"
              >
                <span>عرض الكل</span>
                <span>⬅️</span>
              </Link>
            </div>

            {activeUrgentOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-400 space-y-2">
                <div className="text-3xl">✨</div>
                <h4 className="text-xs font-black text-gray-600">لا توجد طلبات نشطة معلقة حالياً</h4>
                <p className="text-[11px] text-gray-400">
                  كافة الطلبات إما تم تسليمها بنجاح أو لم يتم تسجيل طلبات جديدة بعد.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {activeUrgentOrders.map((order) => {
                  const statusInfo = ORDER_STATUS_LABELS[order.status] || {
                    label: order.status,
                    badgeClass: 'bg-gray-100 text-gray-800 border-gray-300',
                  }

                  return (
                    <div
                      key={order.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-zinc-50/80 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200 flex flex-col items-center justify-center shrink-0">
                          <span className="text-[10px] text-zinc-500 font-bold">طلب</span>
                          <span className="text-xs font-black font-mono text-zinc-900">#{order.order_number}</span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black text-gray-900">{order.customer_name}</h4>
                            <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-bold">
                              {order.order_type === 'delivery'
                                ? '🛵 دليفري'
                                : order.order_type === 'takeaway'
                                ? '🥡 تيك أواي'
                                : '🍽️ صالة'}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Africa/Cairo',
                            })}{' '}
                            • <strong className="text-gray-800 tabular-nums">{order.total_amount} ج.م</strong>
                            {order.driver_name && (
                              <span className="text-teal-700 font-bold mr-2">
                                (الطيار: {order.driver_name})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>

                        <Link
                          href="/orders"
                          className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors"
                        >
                          معالجة ⬅️
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Driver Fleet Snapshot (1 Column on Desktop) */}
          <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <span>🛵 أسطول التوصيل الميداني</span>
                </h3>
                <span className="text-[10px] bg-teal-100 text-teal-900 font-bold px-2 py-0.5 rounded-full">
                  {activeDriversCount} في الخدمة
                </span>
              </div>

              {/* Fleet Roster Stats */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
                  <span className="text-[10px] font-bold text-zinc-500 block">طيارين متاحين</span>
                  <span className="text-lg font-black text-emerald-600">{availableDriversCount}</span>
                </div>
                <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
                  <span className="text-[10px] font-bold text-zinc-500 block">في رحلات (مشغول)</span>
                  <span className="text-lg font-black text-teal-600">{busyDriversCount}</span>
                </div>
              </div>

              {/* Driver List Preview */}
              <div className="space-y-2">
                <span className="text-[11px] font-black text-gray-700 block">حالة الطيارين:</span>
                {drivers.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">لا يوجد طيارين مسجلين</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {drivers.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-zinc-50/80 border border-zinc-200/80 text-xs"
                      >
                        <span className="font-bold text-gray-800">{d.name}</span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                            d.status === 'available'
                              ? 'bg-emerald-100 text-emerald-800'
                              : d.status === 'busy'
                              ? 'bg-teal-100 text-teal-800'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {d.status === 'available'
                            ? 'متاح بالفرع 🟢'
                            : d.status === 'busy'
                            ? 'في مشوار 🛵'
                            : 'خارج الدوام ⚪'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Link
              href="/drivers"
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-black py-2.5 rounded-xl text-center shadow-xs transition-colors block mt-3"
            >
              مركز إدارة وتصفية الطيارين ⬅️
            </Link>
          </div>
        </div>

        {/* Live Activity Stream (Recent Events) */}
        <section aria-label="شريط النشاط اللحظي" className="bg-white border border-gray-200 rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
            <h3 className="text-xs sm:text-sm font-black text-gray-900 flex items-center gap-2">
              <span>📡 شريط النشاط اللحظي والتنبيهات المباشرة</span>
            </h3>
            <span className="text-[10px] text-gray-500 font-bold">{liveAlerts.length} حدث مسجل</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {liveAlerts.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center">في انتظار الأحداث اللحظية الجديدة...</p>
            ) : (
              liveAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                    alert.type === 'urgent'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : alert.type === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : alert.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {alert.type === 'urgent'
                        ? '🚨'
                        : alert.type === 'warning'
                        ? '⚠️'
                        : alert.type === 'success'
                        ? '🔔'
                        : 'ℹ️'}
                    </span>
                    <span className="font-bold">{alert.title}:</span>
                    <span className="opacity-90">{alert.message}</span>
                  </div>
                  <span className="text-[10px] opacity-75 font-mono shrink-0">{alert.time}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
