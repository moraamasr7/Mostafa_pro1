'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'
import Link from 'next/link'
import { playAlertSound } from '@/lib/audioAlert'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

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
}

interface DeliveryTripSnapshot {
  id: string
  trip_number: number
  driver_name: string
  status: string
  expected_amount: number
  collected_amount: number
}

interface NeedsAttentionItem {
  id: string
  type: 'urgent' | 'warning' | 'info'
  title: string
  count?: number
  actionLabel: string
  actionHref: string
}

interface LiveAlert {
  id: string
  title: string
  message: string
  time: string
  type: 'urgent' | 'warning' | 'info' | 'success'
}

const ORDER_STATUS_CONFIG: Record<string, { label: string; variant: 'ready' | 'processing' | 'delivery' | 'completed' | 'cancelled' | 'danger' | 'neutral' }> = {
  pending: { label: 'جديد ⏳', variant: 'processing' },
  processing: { label: 'تجهيز 🍳', variant: 'processing' },
  ready: { label: 'جاهز 📦', variant: 'ready' },
  assigned: { label: 'مسند 🛵', variant: 'delivery' },
  picked_up: { label: 'استلم 🛵', variant: 'delivery' },
  out_for_delivery: { label: 'في الطريق 🚀', variant: 'delivery' },
  delivered: { label: 'تم التسليم ✅', variant: 'completed' },
  completed: { label: 'مكتمل ✅', variant: 'completed' },
  cancelled: { label: 'ملغي ❌', variant: 'cancelled' },
  failed: { label: 'تعذر ⚠️', variant: 'danger' },
}

export default function DashboardCommandCenterPage() {
  const [loading, setLoading] = useState(true)
  const [activeShift, setActiveShift] = useState<ActiveShiftData | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Operational Lists
  const [orders, setOrders] = useState<OrderItemSummary[]>([])
  const [drivers, setDrivers] = useState<DriverSnapshotItem[]>([])
  const [trips, setTrips] = useState<DeliveryTripSnapshot[]>([])

  // Live Alerts & Toasts
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

      setActiveToast(newAlert)

      if (soundEnabled) {
        playAlertSound(alert.type)
      }

      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
      toastTimeoutRef.current = setTimeout(() => {
        setActiveToast(null)
      }, 5000)
    },
    [soundEnabled]
  )

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

      if (dailyShiftRes.status === 401) {
        window.location.href = '/login'
        return
      }

      const ordersData = await ordersRes.json()
      const driversData = await driversRes.json()
      const tripsData = await tripsRes.json()
      const dailyShiftData = await dailyShiftRes.json()

      setOrders(ordersData.orders || [])
      setDrivers(driversData.drivers || [])
      setTrips(tripsData.trips || [])

      if (dailyShiftRes.ok && dailyShiftData.hasActiveShift && dailyShiftData.activeShift) {
        setActiveShift(dailyShiftData.activeShift)
      } else if (dailyShiftRes.ok && !dailyShiftData.hasActiveShift) {
        setActiveShift(null)
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err)
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
      .channel('dashboard-realtime-hub')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
        scheduleBackgroundSync()

        if (payload.eventType === 'INSERT') {
          const orderNum = payload.new?.order_number || ''
          const customer = payload.new?.customer_name || 'عميل'
          const amount = payload.new?.total_amount || 0
          triggerAlert({
            title: 'طلب جديد ورد للتو',
            message: `#${orderNum} · ${customer} (${amount} ج.م)`,
            type: 'success',
          })
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

  // ==========================================
  // SSoT Metrics
  // ==========================================
  const activeOrders = orders.filter((o) =>
    ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
  )
  const activeOrdersCount = activeOrders.length
  const kitchenProcessingCount = orders.filter((o) => o.status === 'processing').length
  const outForDeliveryCount = orders.filter((o) =>
    ['assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
  ).length

  const availableDriversCount = drivers.filter((d) => d.status === 'available').length
  const busyDriversCount = drivers.filter((d) => d.status === 'busy').length

  const activeTrips = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')

  // Canonical SSoT Shift Sales
  const canonicalShiftSales = activeShift ? Number(activeShift.totalSales || 0) : 0

  // ==========================================
  // Needs Attention Items
  // ==========================================
  const needsAttentionList: NeedsAttentionItem[] = []

  if (!loading && !activeShift) {
    needsAttentionList.push({
      id: 'no_shift',
      type: 'urgent',
      title: 'الوردية مغلقة — العمليات مقيدة',
      actionLabel: 'فتح وردية الآن',
      actionHref: '/shift-control',
    })
  }

  const pendingOrders = orders.filter((o) => o.status === 'pending')
  if (pendingOrders.length > 0) {
    needsAttentionList.push({
      id: 'pending_orders',
      type: 'urgent',
      title: `${pendingOrders.length} طلب جديد بحاجة للتأكيد والدخول للمطبخ`,
      count: pendingOrders.length,
      actionLabel: 'تأكيد الطلبات',
      actionHref: '/orders?status=pending',
    })
  }

  const unassignedReadyDelivery = orders.filter(
    (o) => o.status === 'ready' && o.order_type === 'delivery' && !o.driver_name
  )
  if (unassignedReadyDelivery.length > 0) {
    needsAttentionList.push({
      id: 'unassigned_ready',
      type: 'warning',
      title: `${unassignedReadyDelivery.length} طلب دليفري جاهز بدون طيار`,
      count: unassignedReadyDelivery.length,
      actionLabel: 'إسناد لطيار',
      actionHref: '/assignments',
    })
  }

  const pendingCustodyCash = activeShift ? Number(activeShift.driverCustodyCash || 0) : 0
  if (pendingCustodyCash > 0) {
    needsAttentionList.push({
      id: 'driver_custody',
      type: 'warning',
      title: `عهدة كاش معلقة مع الطيارين (${pendingCustodyCash.toLocaleString()} ج.م)`,
      actionLabel: 'تسوية العهدة',
      actionHref: '/drivers',
    })
  }

  if (activeTrips.length > 0) {
    needsAttentionList.push({
      id: 'active_trips',
      type: 'info',
      title: `${activeTrips.length} رحلة دليفري قيد التوصيل بالميدان`,
      count: activeTrips.length,
      actionLabel: 'متابعة الرحلات',
      actionHref: '/drivers',
    })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none pb-20 md:pb-8">
      {/* Header & Global Shift Bar */}
      <OpsNavbar title="الداشبورد" />
      <GlobalShiftBar />

      {/* Realtime Toast Notification */}
      {activeToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full px-3 animate-fadeIn">
          <div className="bg-zinc-900 border border-amber-500/60 p-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-xs text-right">
            <div className="flex items-center gap-2">
              <span>🔔</span>
              <div>
                <p className="font-black text-white">{activeToast.title}</p>
                <p className="text-zinc-400 text-[11px]">{activeToast.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveToast(null)}
              className="text-zinc-400 hover:text-white text-xs p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content Hub */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 w-full space-y-4 sm:space-y-6">
        {/* Top Operational KPIs (3 High-Contrast Cards) */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Card 1: Shift Sales SSoT */}
          <Card variant="default" className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-1">المبيعات</p>
              <MoneyDisplay amount={canonicalShiftSales} size="xl" variant="emerald" />
              <p className="text-[11px] text-zinc-500 mt-1">مبيعات الوردية الحالية</p>
            </div>
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/50 rounded-2xl text-2xl text-emerald-400">
              💰
            </div>
          </Card>

          {/* Card 2: Active Orders */}
          <Card variant="default" className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-1">الطلبات النشطة</p>
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                {activeOrdersCount}
              </span>
              <p className="text-[11px] text-zinc-400 mt-1">
                {kitchenProcessingCount} بالمطبخ · {outForDeliveryCount} بالتوصيل
              </p>
            </div>
            <div className="p-3 bg-amber-950/60 border border-amber-800/50 rounded-2xl text-2xl text-amber-400">
              📦
            </div>
          </Card>

          {/* Card 3: Delivery Fleet */}
          <Card variant="default" className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-1">أسطول التوصيل</p>
              <span className="text-2xl sm:text-3xl font-black font-mono text-blue-400">
                {activeTrips.length}
              </span>
              <p className="text-[11px] text-zinc-400 mt-1">
                {availableDriversCount} طيار متاح · {busyDriversCount} في مشوار
              </p>
            </div>
            <div className="p-3 bg-blue-950/60 border border-blue-800/50 rounded-2xl text-2xl text-blue-400">
              🛵
            </div>
          </Card>
        </section>

        {/* 2-Column Work Center on Desktop, Stacked on Tablet/Mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          {/* Left Column (5 Cols): Needs Attention & Quick Actions */}
          <div className="lg:col-span-5 space-y-4">
            {/* Needs Attention Panel */}
            <Card variant="highlight" className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-sm">⚠️</span>
                  <h2 className="text-xs sm:text-sm font-black text-white">يحتاج انتباه</h2>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">
                  {needsAttentionList.length} تنبيه
                </span>
              </div>

              {needsAttentionList.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-400">
                  <span className="text-xl block mb-1">✅</span>
                  <span>جميع العمليات تسير بانسيابية تامة</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {needsAttentionList.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-bold text-zinc-200 truncate">{item.title}</span>
                      <Link
                        href={item.actionHref}
                        className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer"
                      >
                        {item.actionLabel}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Quick Actions Bar */}
            <Card variant="default" className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-400 border-b border-zinc-800 pb-2">
                إجراءات سريعة
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/orders"
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs transition-all cursor-pointer"
                >
                  <span>➕</span>
                  <span>طلب جديد</span>
                </Link>
                <Link
                  href="/orders"
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs border border-zinc-700 transition-all cursor-pointer"
                >
                  <span>📦</span>
                  <span>صالة الطلبات</span>
                </Link>
                <Link
                  href="/drivers"
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs border border-zinc-700 transition-all cursor-pointer"
                >
                  <span>🛵</span>
                  <span>الطيارين</span>
                </Link>
                <Link
                  href="/shift-control"
                  className="flex items-center justify-center gap-1.5 p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs border border-zinc-700 transition-all cursor-pointer"
                >
                  <span>💰</span>
                  <span>الخزينة</span>
                </Link>
              </div>
            </Card>
          </div>

          {/* Right Column (7 Cols): Active Orders Stream */}
          <div className="lg:col-span-7">
            <Card variant="default" className="space-y-3 h-full flex flex-col">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-sm">📦</span>
                  <h2 className="text-xs sm:text-sm font-black text-white">الطلبات النشطة</h2>
                </div>
                <Link
                  href="/orders"
                  className="text-amber-400 hover:text-amber-300 text-xs font-bold transition-colors"
                >
                  عرض الكل ⬅️
                </Link>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-zinc-500 animate-pulse">
                  جاري تحميل بيانات العمليات...
                </div>
              ) : activeOrders.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400 flex-1 flex flex-col items-center justify-center">
                  <span className="text-2xl block mb-1">📦</span>
                  <span>لا توجد طلبات نشطة حالياً</span>
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-[480px]">
                  {activeOrders.slice(0, 8).map((order) => {
                    const statusConfig = ORDER_STATUS_CONFIG[order.status] || {
                      label: order.status,
                      variant: 'neutral',
                    }
                    const isDelivery = order.order_type === 'delivery'

                    return (
                      <div
                        key={order.id}
                        className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 transition-all flex items-center justify-between gap-3"
                      >
                        {/* Order Identity & Customer */}
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-amber-400 text-sm">
                            #{order.order_number}
                          </span>
                          <div>
                            <p className="font-bold text-xs text-white">
                              {order.customer_name}
                              <span className="text-[10px] text-zinc-400 mr-1.5">
                                ({isDelivery ? 'دليفري 🛵' : 'تيك أواي 🛍️'})
                              </span>
                            </p>
                            <p className="text-[10px] text-zinc-500 font-mono">
                              {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Africa/Cairo',
                              })}
                            </p>
                          </div>
                        </div>

                        {/* Amount & Status */}
                        <div className="flex items-center gap-3">
                          <MoneyDisplay amount={order.total_amount} size="sm" variant="white" />
                          <Badge variant={statusConfig.variant} dot size="sm">
                            {statusConfig.label}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
