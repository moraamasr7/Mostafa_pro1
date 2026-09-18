'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { OrderStatus, STATUS_UI_CONFIG } from '@/types/orders'
import { Driver } from '@/types/drivers'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'
import ManualOrderModal from '@/components/ManualOrderModal'

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
  payment_receipt_url?: string
  status: OrderStatus
  total_amount: number
  notes?: string
  failure_reason?: string
  cancellation_reason?: string
  customer_lat?: number
  customer_lng?: number
  delivery_distance_km?: number
  delivery_fee?: number
  created_at: string
  order_items?: OrderItem[]
  assigned_driver?: AssignedDriverInfo | null
  isNew?: boolean
}

type TabType = 'active' | 'pending' | 'processing' | 'ready' | 'takeaway' | 'delivery' | 'completed' | 'cancelled' | 'all'

const TAB_CONFIG: { id: TabType; label: string; icon: string; countBadge?: (orders: Order[]) => number }[] = [
  {
    id: 'active',
    label: 'النشطة حالياً',
    icon: '🔥',
    countBadge: (orders) =>
      orders.filter((o) =>
        ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
      ).length,
  },
  {
    id: 'pending',
    label: 'في الانتظار',
    icon: '⏳',
    countBadge: (orders) => orders.filter((o) => o.status === 'pending').length,
  },
  {
    id: 'processing',
    label: 'في المطبخ',
    icon: '🍳',
    countBadge: (orders) => orders.filter((o) => o.status === 'processing').length,
  },
  {
    id: 'ready',
    label: 'جاهز للاستلام/التوصيل',
    icon: '📦',
    countBadge: (orders) => orders.filter((o) => o.status === 'ready').length,
  },
  {
    id: 'takeaway',
    label: 'طابور الصالة والاستلام',
    icon: '🏪',
    countBadge: (orders) =>
      orders.filter((o) => (o.order_type === 'takeaway' || o.order_type === 'dine_in') && !['completed', 'cancelled'].includes(o.status)).length,
  },
  {
    id: 'delivery',
    label: 'طابور الدليفري',
    icon: '🛵',
    countBadge: (orders) =>
      orders.filter((o) => o.order_type === 'delivery' && !['delivered', 'completed', 'cancelled', 'failed'].includes(o.status)).length,
  },
  {
    id: 'completed',
    label: 'المكتملة',
    icon: '✅',
  },
  {
    id: 'cancelled',
    label: 'الملغاة / تعذر',
    icon: '❌',
  },
  {
    id: 'all',
    label: 'كافة الطلبات',
    icon: '📋',
  },
]

export default function FastOrdersBoardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Core Data
  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [dailyShift, setDailyShift] = useState<{ id: string; shift_number: number; opened_by: string } | null>(null)

  // Status & UI
  const [loading, setLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)

  // Modals & Panels
  const [showDriverPanel, setShowDriverPanel] = useState(false)
  const [selectedOrderForDriver, setSelectedOrderForDriver] = useState<Order | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string>('')
  const [selectedOrderForFailure, setSelectedOrderForFailure] = useState<Order | null>(null)
  const [failureReason, setFailureReason] = useState<string>('العميل لا يرد على الهاتف')
  const [customFailureText, setCustomFailureText] = useState<string>('')
  const [showManualOrderModal, setShowManualOrderModal] = useState(false)

  // Driver creation state
  const [newDriverName, setNewDriverName] = useState('')
  const [newDriverPhone, setNewDriverPhone] = useState('')
  const [isAddingDriver, setIsAddingDriver] = useState(false)

  // Debounce ref for Realtime synchronization
  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // ==========================================
  // FAST DATA LOADER (Single Full Fetch + In-Memory Fast Views)
  // ==========================================
  const loadOrdersBoardData = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    } else {
      setIsSyncing(true)
    }

    try {
      const [ordersRes, driversRes, shiftRes] = await Promise.all([
        fetch('/api/admin/orders?status=all'),
        fetch('/api/admin/drivers'),
        fetch('/api/admin/daily-shift'),
      ])

      if (ordersRes.status === 401 || driversRes.status === 401 || shiftRes.status === 401) {
        setIsAuthenticated(false)
        setLoading(false)
        setIsSyncing(false)
        return
      }

      const [ordersData, driversData, shiftData] = await Promise.all([
        ordersRes.json(),
        driversRes.json(),
        shiftRes.json(),
      ])

      if (ordersRes.ok && driversRes.ok) {
        setIsAuthenticated(true)
        setOrders(ordersData.orders || [])
        setDrivers(driversData.drivers || [])
        if (shiftData.hasActiveShift && shiftData.activeShift) {
          setDailyShift(shiftData.activeShift)
        } else {
          setDailyShift(null)
        }
      } else if (!isBackground) {
        setActionError('حدث خطأ أثناء تحميل البيانات')
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

  // Debounced trigger for realtime sync
  const scheduleBackgroundSync = useCallback(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current)
    }
    syncDebounceRef.current = setTimeout(() => {
      loadOrdersBoardData(true)
    }, 300)
  }, [loadOrdersBoardData])

  useEffect(() => {
    loadOrdersBoardData(false)

    const handleOnline = () => {
      setIsOnline(true)
      loadOrdersBoardData(true)
    }
    const handleOffline = () => {
      setIsOnline(false)
    }

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }

    const channel = supabase
      .channel('orders-board-optimized')
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => {
        scheduleBackgroundSync()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [loadOrdersBoardData, scheduleBackgroundSync])

  // Close open dropdowns when clicking outside
  useEffect(() => {
    const handleDocumentClick = () => setOpenDropdownId(null)
    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleDocumentClick)
      return () => window.removeEventListener('click', handleDocumentClick)
    }
  }, [])

  // ==========================================
  // AUTHENTICATION HANDLERS
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
        setActionError(null)
        setPasscode('')
        loadOrdersBoardData(false)
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
  // ORDER STATUS MUTATION (Safe Optimistic + Rollback)
  // ==========================================
  const handleStatusChange = async (orderId: string, currentStatus: OrderStatus, newStatus: OrderStatus) => {
    setUpdatingOrderId(orderId)
    setOpenDropdownId(null)
    setActionError(null)
    setActionSuccess(null)

    // Safe optimistic update
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
        setActionError(data.error || 'تعذر تحديث الحالة')
        return
      }

      setActionSuccess(`تم تحديث الطلب إلى: ${STATUS_UI_CONFIG[newStatus]?.label || newStatus}`)
      loadOrdersBoardData(true)
    } catch {
      setOrders(previousOrders)
      setActionError('حدث خطأ في الشبكة أثناء التحديث')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  // Delivery status update (e.g. picked_up, out_for_delivery, delivered)
  const handleDeliveryStatusUpdate = async (orderId: string, newStatus: string) => {
    setUpdatingOrderId(orderId)
    setOpenDropdownId(null)
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
      loadOrdersBoardData(true)
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  // Confirm Failure with Reason
  const handleConfirmFailure = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderForFailure) return

    setUpdatingOrderId(selectedOrderForFailure.id)
    setActionError(null)

    const finalReason =
      failureReason === 'سبب آخر'
        ? customFailureText.trim() || 'سبب آخر لم يُحدد'
        : failureReason

    try {
      const res = await fetch('/api/admin/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: selectedOrderForFailure.id,
          new_status: 'failed',
          failure_reason: finalReason,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess('تم تسجيل حالة فشل التوصيل والسبب بنجاح')
        setSelectedOrderForFailure(null)
        setCustomFailureText('')
        setFailureReason('العميل لا يرد على الهاتف')
        loadOrdersBoardData(true)
      } else {
        setActionError(data.error || 'تعذر تسجيل فشل التوصيل')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  // Assign driver to order
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
        setActionError(data.error || 'فشل تعيين الطيار')
        return
      }

      setActionSuccess(data.message)
      setSelectedOrderForDriver(null)
      setSelectedDriverId('')
      loadOrdersBoardData(true)
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  // Driver shift toggle
  const handleShiftAction = async (driverId: string, action: 'start' | 'end', allowReopen = false) => {
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
        loadOrdersBoardData(true)
      } else if (res.status === 409 && data.requires_override) {
        const confirmReopen = window.confirm(
          `⚠️ تنبيه رقابي:\n${data.error}\n\nهل أنت متأكد من فتح وردية ثانية استثنائية لهذا الطيار الآن؟`
        )
        if (confirmReopen) {
          await handleShiftAction(driverId, 'start', true)
        }
      } else {
        setActionError(data.error || 'فشل إجراء الوردية')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    }
  }

  // Add new driver
  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsAddingDriver(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDriverName, phone: newDriverPhone }),
      })

      const data = await res.json()

      if (!res.ok) {
        setActionError(data.error || 'فشل إضافة الطيار')
        return
      }

      setNewDriverName('')
      setNewDriverPhone('')
      setActionSuccess('تم إضافة الطيار بنجاح')
      loadOrdersBoardData(true)
    } catch {
      setActionError('تعذر إضافة الطيار')
    } finally {
      setIsAddingDriver(false)
    }
  }

  // ==========================================
  // FAST CLIENT-SIDE FILTERING & SEARCH (0ms Latency)
  // ==========================================
  const filteredOrders = useMemo(() => {
    let list = orders

    // 1. Tab filter
    if (activeTab === 'active') {
      list = list.filter((o) =>
        ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
      )
    } else if (activeTab === 'pending') {
      list = list.filter((o) => o.status === 'pending')
    } else if (activeTab === 'processing') {
      list = list.filter((o) => o.status === 'processing')
    } else if (activeTab === 'ready') {
      list = list.filter((o) => o.status === 'ready')
    } else if (activeTab === 'takeaway') {
      list = list.filter(
        (o) => (o.order_type === 'takeaway' || o.order_type === 'dine_in') && !['completed', 'cancelled'].includes(o.status)
      )
    } else if (activeTab === 'delivery') {
      list = list.filter(
        (o) => o.order_type === 'delivery' && !['delivered', 'completed', 'cancelled', 'failed'].includes(o.status)
      )
    } else if (activeTab === 'completed') {
      list = list.filter((o) => o.status === 'completed' || o.status === 'delivered')
    } else if (activeTab === 'cancelled') {
      list = list.filter((o) => o.status === 'cancelled' || o.status === 'failed')
    }

    // 2. Search query filter
    const query = searchQuery.trim().toLowerCase()
    if (query) {
      list = list.filter((o) => {
        const orderNumStr = String(o.order_number)
        const nameStr = (o.customer_name || '').toLowerCase()
        const phoneStr = (o.customer_phone || '').toLowerCase()
        const addressStr = (o.delivery_address || '').toLowerCase()

        return (
          orderNumStr.includes(query) ||
          nameStr.includes(query) ||
          phoneStr.includes(query) ||
          addressStr.includes(query)
        )
      })
    }

    return list
  }, [orders, activeTab, searchQuery])

  const eligibleDrivers = drivers.filter(
    (d) => d.is_active && d.active_shift_id && (d.status === 'available' || d.status === 'busy')
  )

  // ==========================================
  // UNATHENTICATED STATE VIEW
  // ==========================================
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl border border-zinc-200">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-2">🥩</span>
            <h1 className="text-xl font-black text-gray-900">دخول طاقم المطعم</h1>
            <p className="text-xs text-gray-500 mt-1">أدخل رمز المرور للوصول إلى لوحة متابعة الطلبات والتشغيل</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">كود الكاشير / الإدارة</label>
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
              {isLoggingIn ? 'جاري التحقق...' : 'دخول اللوحة ✓'}
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
        title="لوحة متابعة الطلبات والتشغيل"
        subtitle="إدارة وتحديث الطلبات لحظياً بأعلى سرعة واستجابة"
      />
      <GlobalShiftBar />

      {/* Offline Connectivity Alert */}
      {!isOnline && (
        <div className="bg-amber-500 text-black px-4 py-2 text-center text-xs font-black animate-pulse flex items-center justify-center gap-2">
          <span>⚠️ تم فقدان الاتصال بالإنترنت - يتم العمل في وضع عدم الاتصال حالياً (سيتم المزامنة تلقائياً)</span>
        </div>
      )}

      {/* Control Header: Search, Realtime Status, Fast Actions */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left: Search Input */}
          <div className="flex-1 max-w-md relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 ابحث برقم الطلب، اسم العميل، أو الهاتف..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
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

          {/* Right: Actions Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {isSyncing && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                مزامنة...
              </span>
            )}

            <button
              onClick={() => {
                if (!dailyShift) {
                  setActionError('تنبيه: يجب فتح الوردية اليومية أولاً من مركز التحكم لتسجيل طلبات.')
                  return
                }
                setShowManualOrderModal(true)
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2 px-3.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
            >
              <span>➕</span>
              <span>طلب يدوي جديد</span>
            </button>

            <button
              onClick={() => setShowDriverPanel(!showDriverPanel)}
              className="bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-bold py-2 px-3 rounded-xl transition-all flex items-center gap-1.5"
            >
              <span>🛵</span>
              <span>طاقم الطيارين ({drivers.filter((d) => d.active_shift_id).length})</span>
            </button>

            <button
              onClick={() => loadOrdersBoardData(false)}
              disabled={loading}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold p-2 rounded-xl transition-all cursor-pointer"
              title="تحديث البيانات"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Status Horizontal Tabs */}
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto pt-3 pb-1 scrollbar-thin">
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.id
            const count = tab.countBadge ? tab.countBadge(orders) : null

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                  isActive
                    ? 'bg-amber-600 text-white shadow-xs font-black'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {count !== null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-extrabold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Driver Fleet Slide-down Panel */}
      {showDriverPanel && (
        <div className="bg-white border-b border-gray-300 shadow-md p-5 animate-fade-in">
          <div className="max-w-7xl mx-auto space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <span>🛵 إدارة طاقم الطيارين وورديات الميدان</span>
              </h2>
              <button
                onClick={() => setShowDriverPanel(false)}
                className="text-xs font-bold text-gray-400 hover:text-gray-800"
              >
                إغلاق ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {drivers.map((d) => (
                <div
                  key={d.id}
                  className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-black text-xs text-gray-900">{d.name}</h3>
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 ${
                        d.status === 'available'
                          ? 'bg-green-100 text-green-800'
                          : d.status === 'busy'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {d.status === 'available' ? '🟢 متاح' : d.status === 'busy' ? '🟡 مشغول' : '⚪ أوفلاين'}
                    </span>
                  </div>

                  <div>
                    {d.active_shift_id ? (
                      <button
                        onClick={() => handleShiftAction(d.id, 'end')}
                        className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-xl border border-red-200 text-xs transition-colors"
                      >
                        ⏹️ إنهاء وردية
                      </button>
                    ) : (
                      <button
                        onClick={() => handleShiftAction(d.id, 'start')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-xs"
                      >
                        ▶️ بدء وردية
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddDriver}
              className="bg-amber-50/70 border border-amber-200 p-3 rounded-2xl flex flex-wrap items-center gap-2 text-xs"
            >
              <span className="font-bold text-amber-900">➕ إضافة طيار جديد:</span>
              <input
                type="text"
                placeholder="اسم الطيار..."
                value={newDriverName}
                onChange={(e) => setNewDriverName(e.target.value)}
                required
                className="px-3 py-1.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
              />
              <input
                type="tel"
                placeholder="رقم الهاتف (11 رقم)..."
                value={newDriverPhone}
                onChange={(e) => setNewDriverPhone(e.target.value)}
                required
                className="px-3 py-1.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                dir="ltr"
              />
              <button
                type="submit"
                disabled={isAddingDriver}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-1.5 rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {isAddingDriver ? 'جاري الإضافة...' : 'حفظ ✓'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 py-5 flex-1 w-full space-y-4">
        {/* Global Notifications */}
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

        {/* Loading Skeletons */}
        {loading && orders.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div key={idx} className="bg-white rounded-3xl border border-gray-200 p-5 space-y-3 animate-pulse">
                <div className="flex justify-between items-center">
                  <div className="h-6 w-20 bg-gray-200 rounded-lg" />
                  <div className="h-5 w-24 bg-gray-200 rounded-full" />
                </div>
                <div className="h-4 w-36 bg-gray-200 rounded" />
                <div className="h-16 bg-gray-100 rounded-xl" />
                <div className="h-9 bg-gray-200 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-gray-200 shadow-xs max-w-md mx-auto space-y-2">
            <span className="text-4xl block">📦</span>
            <h3 className="font-black text-sm text-gray-800">لا توجد طلبات مطابقة</h3>
            <p className="text-xs text-gray-400">
              {searchQuery ? 'جرب البحث بكلمة أخرى أو تغيير القسم' : 'الطلبات الجديدة ستظهر فوراً'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => {
              const statusCfg = STATUS_UI_CONFIG[order.status] || STATUS_UI_CONFIG.pending
              const isBusy = updatingOrderId === order.id
              const isDropdownOpen = openDropdownId === order.id

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-3xl border shadow-xs overflow-hidden flex flex-col transition-all duration-200 ${
                    order.isNew ? 'ring-2 ring-amber-500 animate-pulse' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Card Header: Order Number, Badge, Time */}
                  <div className="p-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 block">رقم الطلب</span>
                      <h2 className="text-xl font-black text-gray-900 tabular-nums">#{order.order_number}</h2>
                    </div>
                    <div className="text-left">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${statusCfg.bgColor} ${statusCfg.color} ${statusCfg.borderColor}`}
                      >
                        {statusCfg.label}
                      </span>
                      <p className="text-[10px] font-semibold text-gray-400 mt-0.5" dir="ltr">
                        {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Africa/Cairo',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Customer Info & Order Type */}
                  <div className="p-3.5 border-b border-gray-100 bg-amber-50/15 space-y-1.5 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="font-black text-gray-900">{order.customer_name}</h4>
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="text-amber-700 hover:underline font-bold text-[11px] dir-ltr block mt-0.5"
                        >
                          📞 {order.customer_phone}
                        </a>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {order.order_source === 'manual' && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-800 border border-orange-200">
                            كاشير يدوي
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                            order.order_type === 'delivery'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : order.order_type === 'dine_in'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {order.order_type === 'delivery'
                            ? '🛵 دليفري'
                            : order.order_type === 'dine_in'
                            ? '🍽️ صالة'
                            : '🏪 استلام فرع'}
                        </span>
                      </div>
                    </div>

                    {/* Delivery Address & Distance */}
                    {order.delivery_address && (
                      <div className="bg-white p-2 rounded-xl border border-gray-200 text-[11px] space-y-1">
                        <p className="text-gray-700">
                          📍 <strong>العنوان:</strong> {order.delivery_address}
                        </p>
                        {order.customer_lat && order.customer_lng && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&origin=30.126131,31.298350&destination=${order.customer_lat},${order.customer_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-sky-700 font-bold hover:underline"
                          >
                            <span>🗺️ خط السير بالخريطة ↗</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Assigned Driver Badge */}
                    {order.assigned_driver && (
                      <div className="bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-xl flex justify-between items-center text-[11px]">
                        <span className="font-black text-indigo-900">
                          🛵 الطيار: {order.assigned_driver.driver_name}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedOrderForDriver(order)
                            setSelectedDriverId('')
                          }}
                          className="bg-white text-indigo-800 hover:bg-indigo-100 font-bold px-2 py-0.5 rounded border border-indigo-300 text-[10px]"
                        >
                          تغيير
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Order Items List (Compact Scroll) */}
                  <div className="p-3.5 flex-1 space-y-1.5 max-h-44 overflow-y-auto">
                    {order.order_items && order.order_items.length > 0 ? (
                      order.order_items.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-start text-xs bg-gray-50 p-2 rounded-xl border border-gray-100"
                        >
                          <div>
                            <span className="font-bold text-gray-900">
                              {item.item_variants?.menu_items?.name || 'صنف'}
                            </span>
                            {item.item_variants?.variant_name && item.item_variants.variant_name !== 'افتراضي' && (
                              <span className="text-gray-500 mr-1 text-[11px]">
                                ({item.item_variants.variant_name})
                              </span>
                            )}
                            {item.item_notes && (
                              <p className="text-[10px] text-amber-700 font-medium">📝 {item.item_notes}</p>
                            )}
                          </div>
                          <span className="font-black text-gray-800 shrink-0 bg-white px-1.5 py-0.5 rounded border border-gray-200 text-xs">
                            {item.quantity}×
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400">لا توجد أصناف مسجلة</p>
                    )}

                    {order.notes && (
                      <div className="bg-amber-50 border border-amber-200 p-2 rounded-xl text-[11px] text-amber-900">
                        📌 <strong>ملاحظات:</strong> {order.notes}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Total Amount + Smart Primary Action + Secondary Menu */}
                  <div className="p-3.5 bg-gray-50 border-t border-gray-100 mt-auto space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-500">الإجمالي:</span>
                      <span className="font-black text-base text-amber-700 tabular-nums">
                        {Number(order.total_amount).toFixed(0)} ج.م
                      </span>
                    </div>

                    {/* SMART ACTION BAR */}
                    <div className="flex items-center gap-2 relative">
                      {/* State: PENDING */}
                      {order.status === 'pending' && (
                        <button
                          onClick={() => handleStatusChange(order.id, 'pending', 'processing')}
                          disabled={isBusy}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-2 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50"
                        >
                          {isBusy ? 'جاري التحديث...' : '🔥 قبول وبدء التحضير'}
                        </button>
                      )}

                      {/* State: PROCESSING */}
                      {order.status === 'processing' && (
                        <button
                          onClick={() => handleStatusChange(order.id, 'processing', 'ready')}
                          disabled={isBusy}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50"
                        >
                          {isBusy ? 'جاري التحديث...' : '📦 جاهز بالمطبخ'}
                        </button>
                      )}

                      {/* State: READY (Takeaway vs Delivery) */}
                      {order.status === 'ready' && order.order_type === 'delivery' && (
                        <button
                          onClick={() => {
                            setSelectedOrderForDriver(order)
                            setSelectedDriverId('')
                          }}
                          disabled={isBusy}
                          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-black py-2 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          🛵 تعيين طيار دليفري
                        </button>
                      )}

                      {order.status === 'ready' && order.order_type !== 'delivery' && (
                        <button
                          onClick={() => handleStatusChange(order.id, 'ready', 'completed')}
                          disabled={isBusy}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50"
                        >
                          {isBusy ? 'جاري التحديث...' : '✅ تم تسليم العميل'}
                        </button>
                      )}

                      {/* State: ASSIGNED */}
                      {order.status === 'assigned' && (
                        <button
                          onClick={() => handleDeliveryStatusUpdate(order.id, 'picked_up')}
                          disabled={isBusy}
                          className="flex-1 bg-cyan-700 hover:bg-cyan-800 text-white font-black py-2 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50"
                        >
                          {isBusy ? 'جاري التحديث...' : '🎒 استلم الطيار بالفرع'}
                        </button>
                      )}

                      {/* State: PICKED UP */}
                      {order.status === 'picked_up' && (
                        <button
                          onClick={() => handleDeliveryStatusUpdate(order.id, 'out_for_delivery')}
                          disabled={isBusy}
                          className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-black py-2 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50"
                        >
                          {isBusy ? 'جاري التحديث...' : '🚚 خرج في الطريق للعميل'}
                        </button>
                      )}

                      {/* State: OUT FOR DELIVERY */}
                      {order.status === 'out_for_delivery' && (
                        <button
                          onClick={() => handleDeliveryStatusUpdate(order.id, 'delivered')}
                          disabled={isBusy}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50"
                        >
                          {isBusy ? 'جاري التحديث...' : '🎉 تم التوصيل بنجاح'}
                        </button>
                      )}

                      {/* State: FINAL STATES */}
                      {['completed', 'delivered', 'cancelled', 'failed'].includes(order.status) && (
                        <div className="flex-1 text-center py-1.5 bg-gray-200 rounded-xl text-xs font-bold text-gray-600">
                          {order.status === 'delivered' || order.status === 'completed'
                            ? '✓ طلب منتهي ومكتمل'
                            : '✕ طلب ملغى / تعذر'}
                        </div>
                      )}

                      {/* SECONDARY ACTION MENU TRIGGER (⋮) */}
                      {!['completed', 'delivered', 'cancelled', 'failed'].includes(order.status) && (
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setOpenDropdownId(isDropdownOpen ? null : order.id)}
                            className="p-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-black transition-colors"
                            title="خيارات إضافية"
                          >
                            ⋮
                          </button>

                          {/* DROPDOWN MENU */}
                          {isDropdownOpen && (
                            <div className="absolute left-0 bottom-full mb-1 w-44 bg-zinc-900 text-white rounded-2xl shadow-2xl border border-zinc-700 p-1.5 z-30 text-xs space-y-1">
                              {/* Direct Takeaway Complete if in processing */}
                              {order.status === 'processing' && order.order_type !== 'delivery' && (
                                <button
                                  onClick={() => handleStatusChange(order.id, 'processing', 'completed')}
                                  className="w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-emerald-400 font-bold"
                                >
                                  ✅ تسليم مباشر للعميل
                                </button>
                              )}

                              {/* Direct Out for Delivery if Assigned */}
                              {order.status === 'assigned' && (
                                <button
                                  onClick={() => handleDeliveryStatusUpdate(order.id, 'out_for_delivery')}
                                  className="w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-purple-300 font-bold"
                                >
                                  🚚 خروج مباشر للعميل
                                </button>
                              )}

                              {/* Reassign Driver */}
                              {['ready', 'assigned', 'picked_up'].includes(order.status) && order.order_type === 'delivery' && (
                                <button
                                  onClick={() => {
                                    setSelectedOrderForDriver(order)
                                    setSelectedDriverId('')
                                    setOpenDropdownId(null)
                                  }}
                                  className="w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-indigo-300 font-bold"
                                >
                                  🛵 {order.assigned_driver ? 'تغيير الطيار' : 'تعيين طيار'}
                                </button>
                              )}

                              {/* Failure recording for out_for_delivery */}
                              {order.status === 'out_for_delivery' && (
                                <button
                                  onClick={() => {
                                    setSelectedOrderForFailure(order)
                                    setOpenDropdownId(null)
                                  }}
                                  className="w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-rose-400 font-bold"
                                >
                                  ⚠️ تسجيل تعذر التوصيل
                                </button>
                              )}

                              {/* Cancel Order */}
                              {['pending', 'processing', 'ready'].includes(order.status) && (
                                <button
                                  onClick={() => handleStatusChange(order.id, order.status, 'cancelled')}
                                  className="w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-red-950 text-red-400 font-bold"
                                >
                                  ❌ إلغاء الطلب
                                </button>
                              )}
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

      {/* MODAL 1: Driver Assignment */}
      {selectedOrderForDriver && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-900">
                🛵 تعيين طيار للطلب #{selectedOrderForDriver.order_number}
              </h3>
              <button
                onClick={() => setSelectedOrderForDriver(null)}
                className="text-xs font-bold text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500">
              اختر طياراً متاحاً ولديه وردية مفتوحة لتكليفه بطلب التوصيل:
            </p>

            <form onSubmit={handleAssignDriver} className="space-y-4">
              <div>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-bold bg-gray-50"
                >
                  <option value="">-- اختر طياراً متاحاً بالفرع --</option>
                  {eligibleDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.status === 'available' ? '🟢 متاح' : '🟡 في رحلة'})
                    </option>
                  ))}
                </select>

                {eligibleDrivers.length === 0 && (
                  <p className="text-red-600 text-[11px] font-semibold mt-1">
                    ⚠️ لا يوجد طيارون متاحون حالياً لديهم وردية مفتوحة.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDriver(null)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!selectedDriverId || updatingOrderId === selectedOrderForDriver.id}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-xs disabled:opacity-50"
                >
                  {updatingOrderId === selectedOrderForDriver.id ? 'جاري التعيين...' : 'تأكيد التعيين ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Record Delivery Failure */}
      {selectedOrderForFailure && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-red-700">
                ⚠️ تسجيل تعذر توصيل الطلب #{selectedOrderForFailure.order_number}
              </h3>
              <button
                onClick={() => setSelectedOrderForFailure(null)}
                className="text-xs font-bold text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmFailure} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">سبب تعذر التوصيل:</label>
                <select
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-bold bg-gray-50 mb-2"
                >
                  <option value="العميل لا يرد على الهاتف">العميل لا يرد على الهاتف</option>
                  <option value="العنوان غير صحيح أو غير واضح">العنوان غير صحيح أو غير واضح</option>
                  <option value="العميل ألغى الطلب عند الوصول">العميل ألغى الطلب عند الوصول</option>
                  <option value="مشكلة في تحصيل المبلغ المطلوب">مشكلة في تحصيل المبلغ المطلوب</option>
                  <option value="سبب آخر">سبب آخر (كتابة يدوي)</option>
                </select>

                {failureReason === 'سبب آخر' && (
                  <input
                    type="text"
                    placeholder="اكتب السبب بالتفصيل هنا..."
                    value={customFailureText}
                    onChange={(e) => setCustomFailureText(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-red-300 rounded-xl text-xs font-bold bg-white"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForFailure(null)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={updatingOrderId === selectedOrderForFailure.id}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-xs disabled:opacity-50"
                >
                  {updatingOrderId === selectedOrderForFailure.id ? 'جاري الحفظ...' : 'تأكيد الحفظ ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Manual Order Entry Modal */}
      <ManualOrderModal
        isOpen={showManualOrderModal}
        onClose={() => setShowManualOrderModal(false)}
        onSuccess={(msg) => {
          setActionSuccess(msg)
          loadOrdersBoardData(true)
        }}
        dailyShiftNumber={dailyShift?.shift_number}
        openedBy={dailyShift?.opened_by}
      />
    </div>
  )
}
