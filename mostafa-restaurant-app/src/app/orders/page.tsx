'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { OrderStatus } from '@/types/orders'
import { Driver } from '@/types/drivers'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'
import ManualOrderModal from '@/components/ManualOrderModal'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { Badge, BadgeVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { TabNav, TabItem } from '@/components/ui/TabNav'
import { Modal } from '@/components/ui/Modal'

interface OrderItem {
  id: string
  quantity: number
  unit_price: number
  subtotal: number
  item_notes?: string
  item_variants?: {
    variant_name: string
    menu_items?: {
      name: string
    }
  }
}

interface AssignedDriverInfo {
  assignment_id: string
  assignment_status: string
  driver_id: string
  driver_name: string
  driver_phone?: string
}

interface Order {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  delivery_address?: string
  order_type: 'takeaway' | 'delivery' | 'dine_in'
  order_source?: 'online' | 'manual'
  daily_shift_id?: string
  created_by_staff?: string
  payment_method?: string
  status: OrderStatus
  total_amount: number
  notes?: string
  failure_reason?: string
  cancellation_reason?: string
  delivery_fee?: number
  created_at: string
  order_items?: OrderItem[]
  assigned_driver?: AssignedDriverInfo | null
}

type TabType = 'active' | 'dine_in' | 'takeaway' | 'delivery' | 'all' | 'completed' | 'cancelled'

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'جديد ⏳', variant: 'processing' },
  processing: { label: 'قيد التحضير 🍳', variant: 'processing' },
  ready: { label: 'جاهز 📦', variant: 'ready' },
  assigned: { label: 'مسند 🛵', variant: 'delivery' },
  picked_up: { label: 'استلم 🛵', variant: 'delivery' },
  out_for_delivery: { label: 'في الطريق 🚀', variant: 'delivery' },
  delivered: { label: 'تم التسليم ✅', variant: 'completed' },
  completed: { label: 'مكتمل ✅', variant: 'completed' },
  cancelled: { label: 'ملغي ❌', variant: 'cancelled' },
  failed: { label: 'تعذر ⚠️', variant: 'danger' },
}

export default function OrdersPOSHubPage() {
  // Core Data
  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [dailyShift, setDailyShift] = useState<{ id: string; shift_number: number; opened_by: string } | null>(null)

  // Status & UI
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [openMenuOrderId, setOpenMenuOrderId] = useState<string | null>(null)

  // Modals
  const [showManualOrderModal, setShowManualOrderModal] = useState(false)
  const [selectedOrderForDriver, setSelectedOrderForDriver] = useState<Order | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string>('')
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null)
  const [selectedOrderForFailure, setSelectedOrderForFailure] = useState<Order | null>(null)
  const [failureReason, setFailureReason] = useState<string>('العميل لا يرد على الهاتف')

  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const loadOrdersData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    try {
      const [ordersRes, driversRes, shiftRes] = await Promise.all([
        fetch('/api/admin/orders?status=all'),
        fetch('/api/admin/drivers'),
        fetch('/api/admin/daily-shift'),
      ])

      const [ordersData, driversData, shiftData] = await Promise.all([
        ordersRes.json(),
        driversRes.json(),
        shiftRes.json(),
      ])

      if (ordersRes.ok && driversRes.ok) {
        setOrders(ordersData.orders || [])
        setDrivers(driversData.drivers || [])
        if (shiftRes.ok && shiftData.hasActiveShift && shiftData.activeShift) {
          setDailyShift(shiftData.activeShift)
        } else if (shiftRes.ok && !shiftData.hasActiveShift) {
          setDailyShift(null)
        }
      }
    } catch {
      if (!isBackground) {
        setActionError('تعذر الاتصال بالسيرفر لجلب الطلبات')
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
      loadOrdersData(true)
    }, 300)
  }, [loadOrdersData])

  useEffect(() => {
    loadOrdersData(false)

    const channel = supabase
      .channel('orders-pos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_driver_assignments' }, () => {
        scheduleBackgroundSync()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
    }
  }, [loadOrdersData, scheduleBackgroundSync])

  // Close menus on click outside
  useEffect(() => {
    const handleDocumentClick = () => setOpenMenuOrderId(null)
    window.addEventListener('click', handleDocumentClick)
    return () => window.removeEventListener('click', handleDocumentClick)
  }, [])

  // ==========================================
  // STATUS MUTATIONS
  // ==========================================
  const handleStatusChange = async (orderId: string, currentStatus: OrderStatus, newStatus: OrderStatus) => {
    setUpdatingOrderId(orderId)
    setOpenMenuOrderId(null)
    setActionError(null)
    setActionSuccess(null)

    const previousOrders = [...orders]
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    )

    try {
      const res = await fetch('/api/admin/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          current_status: currentStatus,
          new_status: newStatus,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setOrders(previousOrders)
        setActionError(data.error || 'تعذر تحديث حالة الطلب')
        return
      }

      setActionSuccess(`تم التحديث إلى: ${STATUS_CONFIG[newStatus]?.label || newStatus}`)
      loadOrdersData(true)
    } catch {
      setOrders(previousOrders)
      setActionError('حدث خطأ في الاتصال أثناء التحديث')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  const handleDeliveryStatusUpdate = async (orderId: string, newStatus: string) => {
    setUpdatingOrderId(orderId)
    setOpenMenuOrderId(null)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          order_id: orderId,
          new_status: newStatus,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'فشل تحديث حالة التوصيل')
        return
      }

      setActionSuccess(data.message)
      loadOrdersData(true)
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  const handleAssignDriver = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderForDriver || !selectedDriverId) return

    setUpdatingOrderId(selectedOrderForDriver.id)
    setActionError(null)

    const isReassign = !!selectedOrderForDriver.assigned_driver

    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isReassign ? 'reassign' : 'assign',
          order_id: selectedOrderForDriver.id,
          driver_id: selectedDriverId,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'فشل إسناد الطيار')
        return
      }

      setActionSuccess('تم إسناد الطلب للطيار بنجاح')
      setSelectedOrderForDriver(null)
      setSelectedDriverId('')
      loadOrdersData(true)
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  const handleConfirmFailure = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderForFailure) return

    setUpdatingOrderId(selectedOrderForFailure.id)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: selectedOrderForFailure.id,
          new_status: 'failed',
          failure_reason: failureReason,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess('تم تسجيل تعذر التسليم')
        setSelectedOrderForFailure(null)
        loadOrdersData(true)
      } else {
        setActionError(data.error || 'تعذر تسجيل الحالة')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  // ==========================================
  // COUNTS & FILTERING
  // ==========================================
  const allCount = orders.length

  const activeCount = orders.filter((o) =>
    ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
  ).length

  const dineInCount = orders.filter(
    (o) => o.order_type === 'dine_in' && !['completed', 'cancelled', 'failed'].includes(o.status)
  ).length

  const takeawayCount = orders.filter(
    (o) => o.order_type === 'takeaway' && !['completed', 'cancelled', 'failed'].includes(o.status)
  ).length

  const deliveryCount = orders.filter(
    (o) => o.order_type === 'delivery' && !['completed', 'cancelled', 'failed'].includes(o.status)
  ).length

  const completedCount = orders.filter((o) => o.status === 'completed' || o.status === 'delivered').length
  const cancelledCount = orders.filter((o) => o.status === 'cancelled' || o.status === 'failed').length

  const tabs: TabItem[] = [
    { id: 'active', label: 'النشطة', count: activeCount, icon: '🔥' },
    { id: 'dine_in', label: 'صالة', count: dineInCount, icon: '🍽️' },
    { id: 'takeaway', label: 'استلام', count: takeawayCount, icon: '🥡' },
    { id: 'delivery', label: 'توصيل وطيارين', count: deliveryCount, icon: '🛵' },
    { id: 'all', label: 'الكل', count: allCount, icon: '📋' },
    { id: 'completed', label: 'المكتملة', count: completedCount, icon: '✅' },
    { id: 'cancelled', label: 'الملغاة / تعذر', count: cancelledCount, icon: '❌' },
  ]

  const filteredOrders = useMemo(() => {
    let list = orders

    if (activeTab === 'active') {
      list = list.filter((o) =>
        ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
      )
    } else if (activeTab === 'dine_in') {
      list = list.filter(
        (o) => o.order_type === 'dine_in' && !['completed', 'cancelled', 'failed'].includes(o.status)
      )
    } else if (activeTab === 'takeaway') {
      list = list.filter(
        (o) => o.order_type === 'takeaway' && !['completed', 'cancelled', 'failed'].includes(o.status)
      )
    } else if (activeTab === 'delivery') {
      list = list.filter(
        (o) => o.order_type === 'delivery' && !['completed', 'cancelled', 'failed'].includes(o.status)
      )
    } else if (activeTab === 'completed') {
      list = list.filter((o) => o.status === 'completed' || o.status === 'delivered')
    } else if (activeTab === 'cancelled') {
      list = list.filter((o) => o.status === 'cancelled' || o.status === 'failed')
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((o) => {
        const num = String(o.order_number)
        const name = (o.customer_name || '').toLowerCase()
        const phone = (o.customer_phone || '').toLowerCase()
        const addr = (o.delivery_address || '').toLowerCase()
        return num.includes(q) || name.includes(q) || phone.includes(q) || addr.includes(q)
      })
    }

    return list
  }, [orders, activeTab, searchQuery])

  const eligibleDrivers = drivers.filter(
    (d) => d.is_active && d.active_shift_id && (d.status === 'available' || d.status === 'busy')
  )

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Cairo',
      })
    } catch {
      return ''
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none pb-20 md:pb-8">
      {/* Global Header & Shift Bar */}
      <OpsNavbar title="صالة الطلبات" />
      <GlobalShiftBar />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 w-full space-y-4">
        {/* Action Banners */}
        {actionError && (
          <div className="bg-red-950/80 border border-red-700 text-red-200 p-3 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 p-1">✕</button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-emerald-950/80 border border-emerald-700 text-emerald-200 p-3 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs">
            <span>✅ {actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-400 p-1">✕</button>
          </div>
        )}

        {/* Top Control Bar: Title, Tabs & New Order Primary CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-sm">
          {/* Tabs */}
          <TabNav
            tabs={tabs}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            className="w-full sm:w-auto overflow-x-auto"
          />

          {/* Primary Action Button */}
          <Button
            variant="success"
            size="md"
            icon="➕"
            onClick={() => setShowManualOrderModal(true)}
            className="shrink-0 w-full sm:w-auto"
          >
            طلب جديد
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="🔎 بحث برقم الطلب، اسم العميل، الهاتف، أو العنوان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs p-1"
            >
              ✕ مسح
            </button>
          )}
        </div>

        {/* Orders Stream / Grid */}
        {loading && orders.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-500 animate-pulse">
            جاري تحميل قائمة الطلبات...
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card variant="flat" className="py-16 text-center text-xs text-zinc-400">
            <span className="text-3xl block mb-2">📦</span>
            <span className="font-bold text-sm text-zinc-300">لا توجد طلبات في هذا القسم</span>
            {searchQuery && <p className="text-[11px] text-zinc-500 mt-1">جرب البحث بكلمات أخرى</p>}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredOrders.map((order) => {
              const statusCfg = STATUS_CONFIG[order.status] || { label: order.status, variant: 'neutral' }
              const isBusy = updatingOrderId === order.id
              const isMenuOpen = openMenuOrderId === order.id
              const isDelivery = order.order_type === 'delivery'
              const isTakeaway = order.order_type === 'takeaway'
              const isDineIn = order.order_type === 'dine_in'

              return (
                <Card
                  key={order.id}
                  variant="default"
                  className="flex flex-col justify-between space-y-3 relative hover:border-zinc-750 transition-all"
                >
                  {/* Top Row: Order Number, Customer, Type, Money */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-amber-400 text-base">
                        #{order.order_number}
                      </span>
                      <div>
                        <h3 className="font-bold text-xs sm:text-sm text-white truncate max-w-[140px]">
                          {order.customer_name}
                        </h3>
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="text-[11px] font-mono text-zinc-400 hover:text-amber-400 block"
                          dir="ltr"
                        >
                          {order.customer_phone}
                        </a>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <MoneyDisplay amount={order.total_amount} size="md" variant="white" />
                      <span className="block text-[10px] text-zinc-400 mt-0.5">
                        {isDelivery ? 'دليفري 🛵' : isDineIn ? 'صالة 🍽️' : 'استلام 🥡'}
                      </span>
                    </div>
                  </div>

                  {/* Middle Row: Time, Status Badge & Driver Attribution */}
                  <div className="flex items-center justify-between text-[11px] bg-zinc-950/60 border border-zinc-800/80 p-2 rounded-xl">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={statusCfg.variant} dot size="sm">
                        {statusCfg.label}
                      </Badge>
                      <span className="text-zinc-500 font-mono">{formatTime(order.created_at)}</span>
                    </div>

                    {order.assigned_driver && (
                      <span className="text-amber-300 font-bold truncate max-w-[110px]">
                        🛵 {order.assigned_driver.driver_name}
                      </span>
                    )}
                  </div>

                  {/* Delivery Address (if delivery) */}
                  {isDelivery && order.delivery_address && (
                    <div className="text-[11px] text-zinc-300 bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/40 flex items-start gap-1.5">
                      <span className="shrink-0 text-purple-400">📍</span>
                      <span className="line-clamp-2">{order.delivery_address}</span>
                    </div>
                  )}

                  {/* Order Notes (shows table number e.g. [طاولة: T-01] if present) */}
                  {order.notes && (
                    <div className="text-[11px] text-zinc-300 bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/40 flex items-start gap-1.5">
                      <span className="shrink-0 text-amber-400">📝</span>
                      <span className="line-clamp-2">{order.notes}</span>
                    </div>
                  )}

                  {/* Items Preview */}
                  {order.order_items && order.order_items.length > 0 && (
                    <div className="text-[11px] space-y-1 bg-zinc-950/30 p-2 rounded-xl border border-zinc-800/30">
                      {order.order_items.slice(0, 2).map((item) => (
                        <div key={item.id} className="flex justify-between text-zinc-400">
                          <span className="truncate max-w-[180px]">
                            {item.quantity}× {item.item_variants?.menu_items?.name || 'صنف'} (
                            {item.item_variants?.variant_name})
                          </span>
                          <span className="font-mono">{item.subtotal} ج.م</span>
                        </div>
                      ))}
                      {order.order_items.length > 2 && (
                        <span className="text-[10px] text-amber-400 block font-bold">
                          +{order.order_items.length - 2} أصناف أخرى...
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bottom Action Row: Single Primary CTA + Context Menu */}
                  <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
                    {/* Primary Single CTA Button for Next Action */}
                    {order.status === 'pending' && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={isBusy}
                        onClick={() => handleStatusChange(order.id, 'pending', 'processing')}
                        className="flex-1"
                      >
                        🍳 إرسال للتحضير
                      </Button>
                    )}

                    {order.status === 'processing' && (
                      <Button
                        variant="success"
                        size="sm"
                        loading={isBusy}
                        onClick={() => handleStatusChange(order.id, 'processing', 'ready')}
                        className="flex-1"
                      >
                        📦 جاهز للتسليم
                      </Button>
                    )}

                    {order.status === 'ready' && (isTakeaway || isDineIn) && (
                      <Button
                        variant="success"
                        size="sm"
                        loading={isBusy}
                        onClick={() => handleStatusChange(order.id, 'ready', 'completed')}
                        className="flex-1"
                      >
                        {isDineIn ? '🍽️ تقديم وإكمال' : '✅ تسليم وإكمال'}
                      </Button>
                    )}

                    {order.status === 'ready' && isDelivery && !order.assigned_driver && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={isBusy}
                        onClick={() => {
                          setSelectedOrderForDriver(order)
                          if (eligibleDrivers.length > 0) setSelectedDriverId(eligibleDrivers[0].id)
                        }}
                        className="flex-1"
                      >
                        🛵 إسناد لطيار
                      </Button>
                    )}

                    {order.status === 'ready' && isDelivery && order.assigned_driver && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={isBusy}
                        onClick={() => handleDeliveryStatusUpdate(order.id, 'out_for_delivery')}
                        className="flex-1"
                      >
                        🚀 خروج للتوصيل
                      </Button>
                    )}

                    {order.status === 'assigned' && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={isBusy}
                        onClick={() => handleDeliveryStatusUpdate(order.id, 'picked_up')}
                        className="flex-1"
                      >
                        📦 استلم الطيار الطلب
                      </Button>
                    )}

                    {order.status === 'picked_up' && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={isBusy}
                        onClick={() => handleDeliveryStatusUpdate(order.id, 'out_for_delivery')}
                        className="flex-1"
                      >
                        🚀 بدء التوصيل
                      </Button>
                    )}

                    {order.status === 'out_for_delivery' && (
                      <Button
                        variant="success"
                        size="sm"
                        loading={isBusy}
                        onClick={() => handleDeliveryStatusUpdate(order.id, 'delivered')}
                        className="flex-1"
                      >
                        ✅ تأكيد التسليم والتحصيل
                      </Button>
                    )}

                    {(order.status === 'completed' || order.status === 'delivered') && (
                      <span className="flex-1 text-center text-xs font-bold text-emerald-400 py-1.5 bg-emerald-950/40 rounded-xl border border-emerald-800/40">
                        ✓ طلب مكتمل
                      </span>
                    )}

                    {(order.status === 'cancelled' || order.status === 'failed') && (
                      <span className="flex-1 text-center text-xs font-bold text-red-400 py-1.5 bg-red-950/40 rounded-xl border border-red-800/40">
                        {order.status === 'failed' ? '⚠️ تعذر التسليم' : '❌ ملغي'}
                      </span>
                    )}

                    {/* Context Menu Dropdown Trigger */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenMenuOrderId(isMenuOpen ? null : order.id)
                        }}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-bold border border-zinc-700 transition-colors cursor-pointer"
                        title="خيارات إضافية"
                      >
                        ⋮
                      </button>

                      {isMenuOpen && (
                        <div
                          className="absolute left-0 bottom-full mb-1 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-1 z-30 text-xs text-right animate-fadeIn"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderForDetails(order)
                              setOpenMenuOrderId(null)
                            }}
                            className="w-full text-right px-2.5 py-1.5 hover:bg-zinc-800 rounded-lg text-zinc-200 font-bold cursor-pointer"
                          >
                            📋 تفاصيل الأصناف
                          </button>

                          {isDelivery && order.status !== 'completed' && order.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderForDriver(order)
                                if (eligibleDrivers.length > 0) setSelectedDriverId(eligibleDrivers[0].id)
                                setOpenMenuOrderId(null)
                              }}
                              className="w-full text-right px-2.5 py-1.5 hover:bg-zinc-800 rounded-lg text-amber-300 font-bold cursor-pointer"
                            >
                              🛵 {order.assigned_driver ? 'إعادة إسناد طيار' : 'إسناد لطيار'}
                            </button>
                          )}

                          {isDelivery && order.status === 'out_for_delivery' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderForFailure(order)
                                setOpenMenuOrderId(null)
                              }}
                              className="w-full text-right px-2.5 py-1.5 hover:bg-zinc-800 rounded-lg text-amber-400 font-bold cursor-pointer"
                            >
                              ⚠️ تعذر التسليم
                            </button>
                          )}

                          {order.status !== 'completed' && order.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`هل أنت متأكد من إلغاء الطلب #${order.order_number}؟`)) {
                                  handleStatusChange(order.id, order.status, 'cancelled')
                                }
                                setOpenMenuOrderId(null)
                              }}
                              className="w-full text-right px-2.5 py-1.5 hover:bg-red-950/60 rounded-lg text-red-400 font-bold cursor-pointer"
                            >
                              ❌ إلغاء الطلب
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      {/* Manual Order Creation Modal */}
      {showManualOrderModal && (
        <ManualOrderModal
          isOpen={showManualOrderModal}
          onClose={() => setShowManualOrderModal(false)}
          onSuccess={(msg) => {
            setActionSuccess(msg)
            setShowManualOrderModal(false)
            loadOrdersData(true)
          }}
          dailyShiftNumber={dailyShift?.shift_number}
          openedBy={dailyShift?.opened_by}
        />
      )}

      {/* Assign Driver Modal */}
      {selectedOrderForDriver && (
        <Modal
          isOpen={!!selectedOrderForDriver}
          onClose={() => setSelectedOrderForDriver(null)}
          title={`إسناد الطلب #${selectedOrderForDriver.order_number} لطيار`}
          icon="🛵"
          footer={
            <Button
              variant="primary"
              size="md"
              loading={updatingOrderId === selectedOrderForDriver.id}
              onClick={handleAssignDriver}
              disabled={!selectedDriverId || eligibleDrivers.length === 0}
            >
              تأكيد الإسناد
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              العميل: <strong className="text-white">{selectedOrderForDriver.customer_name}</strong> · المبلغ: <strong className="text-white">{selectedOrderForDriver.total_amount} ج.م</strong>
            </p>

            {eligibleDrivers.length === 0 ? (
              <div className="p-3 bg-amber-950/60 border border-amber-700 text-amber-200 text-xs rounded-xl">
                ⚠️ لا يوجد طيارون متاحون بوردية نشطة حالياً. يرجى بدء وردية طيار من شاشة الطيارين أولاً.
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">اختر الطيار:</label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-hidden focus:border-amber-500"
                >
                  {eligibleDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.status === 'available' ? 'متاح 🟢' : 'في مشوار 🟡'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Order Item Details Modal */}
      {selectedOrderForDetails && (
        <Modal
          isOpen={!!selectedOrderForDetails}
          onClose={() => setSelectedOrderForDetails(null)}
          title={`تفاصيل الطلب #${selectedOrderForDetails.order_number}`}
          icon="📋"
          footer={
            <Button variant="secondary" size="md" onClick={() => setSelectedOrderForDetails(null)}>
              إغلاق
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="p-2.5 bg-zinc-950 rounded-xl border border-zinc-800 text-xs space-y-1">
              <p>العميل: <strong className="text-white">{selectedOrderForDetails.customer_name}</strong> ({selectedOrderForDetails.customer_phone})</p>
              {selectedOrderForDetails.delivery_address && (
                <p>العنوان: <span className="text-zinc-300">{selectedOrderForDetails.delivery_address}</span></p>
              )}
              {selectedOrderForDetails.notes && (
                <p className="text-amber-300 font-bold">ملاحظات: {selectedOrderForDetails.notes}</p>
              )}
            </div>

            <h4 className="text-xs font-black text-zinc-400 border-b border-zinc-800 pb-1">الأصناف المطلوبة:</h4>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {selectedOrderForDetails.order_items && selectedOrderForDetails.order_items.length > 0 ? (
                selectedOrderForDetails.order_items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-zinc-800/60 rounded-xl text-xs">
                    <div>
                      <span className="font-bold text-white">
                        {item.item_variants?.menu_items?.name || 'صنف'} - {item.item_variants?.variant_name || ''}
                      </span>
                      <span className="text-zinc-400 mr-2 font-mono">× {item.quantity}</span>
                      {item.item_notes && (
                        <p className="text-[10px] text-amber-400 font-medium">{item.item_notes}</p>
                      )}
                    </div>
                    <MoneyDisplay amount={item.subtotal} size="sm" variant="white" />
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">لا توجد تفاصيل أصناف مسجلة لهذا الطلب</p>
              )}
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-xs font-black">
              <span>الإجمالي الكلي:</span>
              <MoneyDisplay amount={selectedOrderForDetails.total_amount} size="md" variant="emerald" />
            </div>
          </div>
        </Modal>
      )}

      {/* Delivery Failure Modal */}
      {selectedOrderForFailure && (
        <Modal
          isOpen={!!selectedOrderForFailure}
          onClose={() => setSelectedOrderForFailure(null)}
          title={`تسجيل تعذر تسليم الطلب #${selectedOrderForFailure.order_number}`}
          icon="⚠️"
          footer={
            <Button
              variant="danger"
              size="md"
              loading={updatingOrderId === selectedOrderForFailure.id}
              onClick={handleConfirmFailure}
            >
              تأكيد تعذر التسليم
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              يرجى اختيار سبب تعذر توصيل الطلب للعميل:
            </p>
            <select
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-hidden focus:border-red-500"
            >
              <option value="العميل لا يرد على الهاتف">العميل لا يرد على الهاتف</option>
              <option value="العميل رفض استلام الطلب">العميل رفض استلام الطلب</option>
              <option value="العنوان غير صحيح أو غير موجود">العنوان غير صحيح أو غير موجود</option>
              <option value="هاتف العميل مغلق">هاتف العميل مغلق</option>
              <option value="تعذر الوصول للعنوان">تعذر الوصول للعنوان</option>
            </select>
          </div>
        </Modal>
      )}
    </div>
  )
}
