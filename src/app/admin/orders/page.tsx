'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { OrderStatus, STATUS_UI_CONFIG } from '@/types/orders'
import { Driver } from '@/types/drivers'

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
  driver_phone: string
}

interface Order {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  delivery_address?: string
  order_type: 'takeaway' | 'delivery' | 'dine_in'
  payment_method?: string
  payment_receipt_url?: string
  status: OrderStatus
  total_amount: number
  notes?: string
  created_at: string
  order_items?: OrderItem[]
  assigned_driver?: AssignedDriverInfo | null
  isNew?: boolean
}

export default function AdminOrdersPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'processing' | 'ready' | 'takeaway' | 'delivery' | 'completed' | 'cancelled' | 'all'>('active')
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // شوّاش إدارة الطيارين والطلب المختار للتعيين
  const [showDriverPanel, setShowDriverPanel] = useState(false)
  const [selectedOrderForDriver, setSelectedOrderForDriver] = useState<Order | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string>('')
  
  // نموذج إضافة طيار جديد
  const [newDriverName, setNewDriverName] = useState('')
  const [newDriverPhone, setNewDriverPhone] = useState('')
  const [isAddingDriver, setIsAddingDriver] = useState(false)

  const fetchOrdersAndDrivers = async (tabFilter = activeTab) => {
    setLoading(true)
    setActionError(null)

    try {
      const [ordersRes, driversRes] = await Promise.all([
        fetch(`/api/admin/orders?status=${tabFilter}`),
        fetch('/api/admin/drivers'),
      ])

      if (ordersRes.status === 401 || driversRes.status === 401) {
        setIsAuthenticated(false)
        setLoading(false)
        return
      }

      const ordersData = await ordersRes.json()
      const driversData = await driversRes.json()

      if (ordersRes.ok && driversRes.ok) {
        setIsAuthenticated(true)
        setOrders(ordersData.orders || [])
        setDrivers(driversData.drivers || [])
      } else {
        setActionError('حدث خطأ أثناء تحميل البيانات')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      await fetchOrdersAndDrivers(activeTab)
    }
    load()

    // تفعيل Realtime لكل من الطلبات، الطيارين، الورديات والتعيينات
    const ordersChannel = supabase
      .channel('admin-realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrdersAndDrivers(activeTab)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        fetchOrdersAndDrivers(activeTab)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => {
        fetchOrdersAndDrivers(activeTab)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_driver_assignments' }, () => {
        fetchOrdersAndDrivers(activeTab)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

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
        fetchOrdersAndDrivers(activeTab)
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

  const handleStatusChange = async (orderId: string, currentStatus: OrderStatus, newStatus: OrderStatus) => {
    setUpdatingOrderId(orderId)
    setActionError(null)
    setActionSuccess(null)

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
        setActionError(data.error || 'تعذر تحديث الحالة')
        if (res.status === 409) fetchOrdersAndDrivers(activeTab)
        return
      }

      fetchOrdersAndDrivers(activeTab)
    } catch {
      setActionError('حدث خطأ في الشبكة، يرجى المحاولة لاحقاً')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  // إدارة الورديات (بدء / إنهاء)
  const handleShiftAction = async (driverId: string, action: 'start' | 'end') => {
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: driverId, action }),
      })

      const data = await res.json()

      if (!res.ok) {
        setActionError(data.error || 'فشل إجراء الوردية')
        return
      }

      setActionSuccess(data.message)
      fetchOrdersAndDrivers(activeTab)
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    }
  }

  // إضافة طيار جديد
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
      fetchOrdersAndDrivers(activeTab)
    } catch {
      setActionError('تعذر إضافة الطيار')
    } finally {
      setIsAddingDriver(false)
    }
  }

  // تعيين طيار لطلب دليفري
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
      fetchOrdersAndDrivers(activeTab)
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  // تحديث حالة التوصيل عبر التعيين
  const handleDeliveryStatusUpdate = async (orderId: string, newStatus: string) => {
    setUpdatingOrderId(orderId)
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
      fetchOrdersAndDrivers(activeTab)
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-900 to-zinc-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20 animate-fade-in-up">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-2">🥩</span>
            <h1 className="text-xl font-extrabold text-gray-900">
              دخول طاقم مطعم مصطفى الجزار
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              أدخل كود الكاشير للوصول للوحة استقبال الطلبات والطيارين
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                كود الكاشير / الإدارة
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="أدخل رمز المرور..."
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-center font-bold tracking-widest text-lg bg-gray-50"
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
              className="w-full bg-gradient-to-l from-amber-700 to-amber-600 hover:from-amber-800 hover:to-amber-700 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-md shadow-amber-900/30 disabled:opacity-50"
            >
              {isLoggingIn ? 'جاري التحقق...' : 'دخول اللوحة ✓'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const eligibleDrivers = drivers.filter(
    (d) => d.is_active && d.active_shift_id && d.status === 'available'
  )

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans">
      {/* هيدر اللوحة */}
      <header className="bg-gradient-to-l from-zinc-900 via-amber-950 to-zinc-900 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🥩</span>
            <div>
              <h1 className="text-lg font-black tracking-tight">
                لوحة استقبال الطلبات والطيارين — مطعم مصطفى الجزار
              </h1>
              <p className="text-amber-200/80 text-xs">
                إدارة الطلبات، الورديات، وتعيين الطيارين مباشرة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowDriverPanel(!showDriverPanel)}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              🛵 إدارة الطيارين والورديات ({drivers.filter((d) => d.active_shift_id).length} نشط)
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-900/40 hover:bg-red-800 text-red-200 text-xs font-bold py-2 px-3 rounded-xl border border-red-700/50 transition-colors"
            >
              خروج
            </button>
          </div>
        </div>
      </header>

      {/* لوحة التحكم بالطاقم والورديات (Drivers & Shifts Drawer) */}
      {showDriverPanel && (
        <div className="bg-white border-b border-gray-300 shadow-lg p-5 animate-fade-in">
          <div className="max-w-7xl mx-auto space-y-5">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                🛵 طاقم طيارين الدليفري ورابط الورديات
              </h2>
              <button
                onClick={() => setShowDriverPanel(false)}
                className="text-xs font-bold text-gray-500 hover:text-gray-800"
              >
                إغلاق ✕
              </button>
            </div>

            {/* جدول الطيارين */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {drivers.map((d) => (
                <div
                  key={d.id}
                  className="bg-gray-50 p-4 rounded-2xl border border-gray-200 flex flex-col justify-between space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-extrabold text-sm text-gray-900">{d.name}</h3>
                      <a href={`tel:${d.phone}`} className="text-xs text-amber-700 font-semibold dir-ltr block mt-0.5">
                        📞 {d.phone}
                      </a>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                        d.status === 'available'
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : d.status === 'busy'
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-gray-200 text-gray-700 border-gray-300'
                      }`}
                    >
                      {d.status === 'available' ? '🟢 متاح' : d.status === 'busy' ? '🟡 مشغول' : '⚪ أوفلاين'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-2 border-t border-gray-200">
                    <span className="text-gray-500 font-medium">
                      الوردية: {d.active_shift_id ? '🟢 مفتوحة' : '🔴 مغلقة'}
                    </span>

                    {d.active_shift_id ? (
                      <button
                        onClick={() => handleShiftAction(d.id, 'end')}
                        className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-lg border border-red-200 text-xs transition-colors"
                      >
                        ⏹️ إنهاء الوردية
                      </button>
                    ) : (
                      <button
                        onClick={() => handleShiftAction(d.id, 'start')}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-sm"
                      >
                        ▶️ بدء وردية
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* نموذج إضافة طيار جديد */}
            <form onSubmit={handleAddDriver} className="bg-amber-50/60 border border-amber-200 p-4 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
              <span className="font-bold text-amber-900">➕ إضافة طيار جديد:</span>
              <input
                type="text"
                placeholder="اسم الطيار..."
                value={newDriverName}
                onChange={(e) => setNewDriverName(e.target.value)}
                required
                className="px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="tel"
                placeholder="رقم الموبايل (11 رقم)..."
                value={newDriverPhone}
                onChange={(e) => setNewDriverPhone(e.target.value)}
                required
                className="px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500 text-left"
                dir="ltr"
              />
              <button
                type="submit"
                disabled={isAddingDriver}
                className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-4 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
              >
                {isAddingDriver ? 'جاري الإضافة...' : 'حفظ الطيار ✓'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* التبويبات والتصفية */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-[68px] z-20">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'active'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🔥 النشطة حالياً
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'pending'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🕐 في انتظار التأكيد
          </button>
          <button
            onClick={() => setActiveTab('processing')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'processing'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            👨‍🍳 جاري التحضير
          </button>
          <button
            onClick={() => setActiveTab('ready')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'ready'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            📦 جاهز بالمطبخ
          </button>
          <button
            onClick={() => setActiveTab('takeaway')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'takeaway'
                ? 'bg-amber-700 text-white shadow-sm ring-2 ring-amber-400'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            🏪 طابور الاستلام من الفرع (Pickup Queue)
          </button>
          <button
            onClick={() => setActiveTab('delivery')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'delivery'
                ? 'bg-purple-700 text-white shadow-sm ring-2 ring-purple-400'
                : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
            }`}
          >
            🛵 طابور التوصيل للمنزل (Delivery Queue)
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'completed'
                ? 'bg-green-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ✅ المكتملة
          </button>
          <button
            onClick={() => setActiveTab('cancelled')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'cancelled'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ❌ الملغاة
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'all'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            كل الطلبات
          </button>
        </div>
      </div>

      {/* محتوى الطلبات */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-4">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl flex items-center justify-between text-xs font-bold">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-500 font-extrabold">
              ✕
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-2xl flex items-center justify-between text-xs font-bold">
            <span>✅ {actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-green-600 font-extrabold">
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-4 border-amber-300 border-t-amber-600 rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-xs font-bold text-gray-500">جاري تحميل الطلبات والطيارين...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-gray-200 shadow-sm max-w-md mx-auto">
            <span className="text-5xl block mb-3">📦</span>
            <h3 className="font-extrabold text-base text-gray-800">لا توجد طلبات في هذا القسم</h3>
            <p className="text-xs text-gray-400 mt-1">الطلبات الجديدة ستظهر فوراً بدون الحاجة للتحديث</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {orders.map((order) => {
              const statusCfg = STATUS_UI_CONFIG[order.status] || STATUS_UI_CONFIG.pending
              const isBusy = updatingOrderId === order.id

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-3xl border shadow-sm overflow-hidden flex flex-col transition-all duration-300 ${
                    order.isNew ? 'ring-2 ring-amber-500 animate-pulse' : 'border-gray-200'
                  }`}
                >
                  {/* رأس بطاقة الطلب */}
                  <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-400">رقم الطلب</span>
                      <h2 className="text-2xl font-black text-gray-900 tabular-nums">
                        #{order.order_number}
                      </h2>
                    </div>
                    <div className="text-left">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border ${statusCfg.bgColor} ${statusCfg.color} ${statusCfg.borderColor}`}
                      >
                        {statusCfg.label}
                      </span>
                      <p className="text-[11px] font-semibold text-gray-400 mt-1" dir="ltr">
                        {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* بيانات العميل والتوصيل */}
                  <div className="p-4 border-b border-gray-100 bg-amber-50/20 flex flex-col space-y-1">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-gray-900">{order.customer_name}</p>
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="text-xs font-semibold text-amber-700 hover:underline dir-ltr block mt-0.5"
                        >
                          📞 {order.customer_phone}
                        </a>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${
                          order.order_type === 'delivery'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {order.order_type === 'delivery' ? '🛵 دليفري' : '🏪 استلام فرع'}
                      </span>
                    </div>

                    {order.delivery_address && (
                      <p className="text-xs text-gray-700 bg-white p-2 rounded-xl border border-gray-200 mt-1">
                        📍 <strong>العنوان:</strong> {order.delivery_address}
                      </p>
                    )}

                    {/* تفاصيل طريقة الدفع وإثبات التحويل */}
                    <div className="flex flex-wrap gap-1.5 mt-1 text-[11px]">
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg font-bold">
                        💳 الدفع: {order.payment_method === 'instapay' ? 'إنستا باي ⚡' : order.payment_method === 'wallet' ? 'فودافون كاش 📱' : 'نقدي كاش 💵'}
                      </span>
                      {order.payment_receipt_url && (
                        order.payment_receipt_url.startsWith('http') ? (
                          <a
                            href={order.payment_receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-blue-600 text-white hover:bg-blue-700 px-2 py-0.5 rounded-lg font-bold underline transition-colors"
                          >
                            🖼️ معاينة صورة التحويل
                          </a>
                        ) : (
                          <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-lg font-bold">
                            📄 رقم العملية: {order.payment_receipt_url}
                          </span>
                        )
                      )}
                    </div>

                    {/* بيانات الطيار المعين */}
                    {order.assigned_driver && (
                      <div className="bg-indigo-50 border border-indigo-200 p-2.5 rounded-xl text-xs flex justify-between items-center mt-1">
                        <div>
                          <p className="font-extrabold text-indigo-900">
                            🛵 الطيار: {order.assigned_driver.driver_name}
                          </p>
                          <a href={`tel:${order.assigned_driver.driver_phone}`} className="text-[11px] text-indigo-700 font-semibold dir-ltr block">
                            📞 {order.assigned_driver.driver_phone}
                          </a>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedOrderForDriver(order)
                            setSelectedDriverId('')
                          }}
                          className="bg-white hover:bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-1 rounded-lg border border-indigo-300"
                        >
                          🔄 تغيير الطيار
                        </button>
                      </div>
                    )}
                  </div>

                  {/* تفاصيل الأصناف */}
                  <div className="p-4 flex-1 space-y-2 max-h-56 overflow-y-auto">
                    {order.order_items && order.order_items.length > 0 ? (
                      order.order_items.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-start text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100"
                        >
                          <div>
                            <span className="font-bold text-gray-900">
                              {item.item_variants?.menu_items?.name || 'صنف'}
                            </span>
                            {item.item_variants?.variant_name && item.item_variants.variant_name !== 'افتراضي' && (
                              <span className="text-gray-500 mr-1">
                                ({item.item_variants.variant_name})
                              </span>
                            )}
                            {item.item_notes && (
                              <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                                📝 {item.item_notes}
                              </p>
                            )}
                          </div>
                          <span className="font-extrabold text-gray-800 shrink-0 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                            {item.quantity}×
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400">لا توجد تفاصيل أصلية</p>
                    )}

                    {order.notes && (
                      <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-xs text-amber-900 font-medium">
                        📌 <strong>ملاحظات:</strong> {order.notes}
                      </div>
                    )}
                  </div>

                  {/* الإجمالي وأزرار الإجراءات */}
                  <div className="p-4 bg-gray-50 border-t border-gray-100 space-y-3 mt-auto">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-500">الإجمالي النهائي</span>
                      <span className="font-black text-lg text-amber-700 tabular-nums">
                        {Number(order.total_amount).toFixed(0)} ج.م
                      </span>
                    </div>

                    {/* أزرار الحالات */}
                    {order.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStatusChange(order.id, 'pending', 'processing')}
                          disabled={isBusy}
                          className="flex-1 bg-gradient-to-l from-blue-700 to-blue-600 hover:from-blue-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50"
                        >
                          {isBusy ? 'جاري التحديث...' : '🔥 بدء التحضير'}
                        </button>
                        <button
                          onClick={() => handleStatusChange(order.id, 'pending', 'cancelled')}
                          disabled={isBusy}
                          className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-2.5 rounded-xl text-xs transition-all border border-red-200 disabled:opacity-50"
                        >
                          ❌ إلغاء
                        </button>
                      </div>
                    )}

                    {order.status === 'processing' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStatusChange(order.id, 'processing', 'ready')}
                          disabled={isBusy}
                          className="flex-1 bg-gradient-to-l from-emerald-700 to-emerald-600 hover:from-emerald-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50"
                        >
                          {isBusy ? 'جاري التحديث...' : '📦 جاهز بالمطبخ'}
                        </button>
                        {order.order_type === 'takeaway' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'processing', 'completed')}
                            disabled={isBusy}
                            className="bg-green-700 hover:bg-green-800 text-white font-bold px-3 py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50"
                          >
                            ✅ استلام
                          </button>
                        )}
                      </div>
                    )}

                    {/* تعيين طيار لطلب دليفري جاهز */}
                    {order.status === 'ready' && order.order_type === 'delivery' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedOrderForDriver(order)
                            setSelectedDriverId('')
                          }}
                          disabled={isBusy}
                          className="flex-1 bg-gradient-to-l from-purple-700 to-purple-600 hover:from-purple-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          🛵 تعيين طيار دليفري
                        </button>
                        <button
                          onClick={() => handleStatusChange(order.id, 'ready', 'cancelled')}
                          disabled={isBusy}
                          className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-2.5 rounded-xl text-xs transition-all border border-red-200 disabled:opacity-50"
                        >
                          ❌ إلغاء
                        </button>
                      </div>
                    )}

                    {/* تعيين طيار لطلب استلام فرع جاهز */}
                    {order.status === 'ready' && order.order_type === 'takeaway' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStatusChange(order.id, 'ready', 'completed')}
                          disabled={isBusy}
                          className="flex-1 bg-gradient-to-l from-green-700 to-green-600 hover:from-green-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50"
                        >
                          ✅ تم تسليم العميل بالفرع
                        </button>
                      </div>
                    )}

                    {/* تحكم الكاشير في خطوة التوصيل للطلب المعين */}
                    {order.status === 'assigned' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeliveryStatusUpdate(order.id, 'picked_up')}
                          disabled={isBusy}
                          className="flex-1 bg-cyan-700 hover:bg-cyan-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50"
                        >
                          🎒 تم الاستلام من المطبخ
                        </button>
                      </div>
                    )}

                    {order.status === 'picked_up' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeliveryStatusUpdate(order.id, 'out_for_delivery')}
                          disabled={isBusy}
                          className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50"
                        >
                          🚚 خرج مع الطيار للعميل
                        </button>
                      </div>
                    )}

                    {order.status === 'out_for_delivery' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeliveryStatusUpdate(order.id, 'delivered')}
                          disabled={isBusy}
                          className="flex-1 bg-green-700 hover:bg-green-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50"
                        >
                          🎉 تم التوصيل للعميل بنجاح
                        </button>
                      </div>
                    )}

                    {(order.status === 'completed' || order.status === 'cancelled' || order.status === 'delivered') && (
                      <div className="text-center py-1 bg-gray-100 rounded-xl text-xs font-bold text-gray-500">
                        {order.status === 'delivered'
                          ? '🎉 تم التوصيل للعميل'
                          : order.status === 'completed'
                          ? '✓ مكتمل ومعالج'
                          : '✕ ملغى'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* نافذة اختيار وتكليف الطيار (Driver Assignment Modal) */}
      {selectedOrderForDriver && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-extrabold text-gray-900">
                🛵 تعيين طيار للطلب #{selectedOrderForDriver.order_number}
              </h3>
              <button
                onClick={() => setSelectedOrderForDriver(null)}
                className="text-xs font-bold text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              اختر طياراً متاحاً ولديه وردية مفتوحة لتكليفه بطلب الدليفري:
            </p>

            <form onSubmit={handleAssignDriver} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الطيار المتاح:</label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-bold bg-gray-50"
                >
                  <option value="">-- اختر طياراً متاحاً --</option>
                  {eligibleDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.phone}) — 🟢 متاح
                    </option>
                  ))}
                </select>

                {eligibleDrivers.length === 0 && (
                  <p className="text-red-600 text-[11px] font-semibold mt-1">
                    ⚠️ لا يوجد طيارون متاحون حالياً لديهم وردية مفتوحة. قم ببدء وردية طيار أولاً من زر إدارة الطيارين.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDriver(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!selectedDriverId || updatingOrderId === selectedOrderForDriver.id}
                  className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition-all shadow-md shadow-purple-200 disabled:opacity-50"
                >
                  {updatingOrderId === selectedOrderForDriver.id ? 'جاري التعيين...' : 'تأكيد التعيين ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
