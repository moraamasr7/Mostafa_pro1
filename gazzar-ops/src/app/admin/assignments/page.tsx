'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { OrderStatus, STATUS_UI_CONFIG } from '@/types/orders'
import { Driver } from '@/types/drivers'
import Link from 'next/link'

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

interface DeliveryOrder {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  delivery_address?: string
  order_type: 'delivery'
  status: OrderStatus
  total_amount: number
  notes?: string
  created_at: string
  order_items?: OrderItem[]
  assigned_driver?: AssignedDriverInfo | null
}

export default function AdminAssignmentsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [readyOrders, setReadyOrders] = useState<DeliveryOrder[]>([])
  const [activeDeliveryOrders, setActiveDeliveryOrders] = useState<DeliveryOrder[]>([])
  const [availableDrivers, setAvailableDrivers] = useState<Driver[]>([])
  
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [reassigningOrder, setReassigningOrder] = useState<DeliveryOrder | null>(null)

  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const fetchAssignmentData = async () => {
    setLoading(true)
    setActionError(null)

    try {
      const [ordersRes, driversRes] = await Promise.all([
        fetch('/api/admin/orders?status=all'),
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
        const allOrders: DeliveryOrder[] = (ordersData.orders || []).filter(
          (o: DeliveryOrder) => o.order_type === 'delivery'
        )

        const ready = allOrders.filter((o) => o.status === 'ready')

        const activeDelivering = allOrders.filter((o) =>
          ['assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
        )

        setReadyOrders(ready)
        setActiveDeliveryOrders(activeDelivering)

        const driversList: Driver[] = driversData.drivers || []
        const eligible = driversList.filter(
          (d) => d.is_active && d.active_shift_id && d.status === 'available'
        )
        setAvailableDrivers(eligible)
      } else {
        setActionError('تعذر تحميل بيانات التعيين')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      await fetchAssignmentData()
    }
    load()

    const channel = supabase
      .channel('admin-assignments-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchAssignmentData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => fetchAssignmentData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => fetchAssignmentData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_driver_assignments' }, () => fetchAssignmentData())
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
        fetchAssignmentData()
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

  const handleConfirmAssignment = async () => {
    if (!selectedOrderId || !selectedDriverId) return

    setIsSubmitting(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          order_id: selectedOrderId,
          driver_id: selectedDriverId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setActionError(data.error || 'فشل تعيين الطلب')
        return
      }

      setActionSuccess(data.message || 'تم تعيين الطلب للطيار بنجاح')
      setSelectedOrderId(null)
      setSelectedDriverId(null)
      fetchAssignmentData()
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmReassign = async (newDriverId: string) => {
    if (!reassigningOrder) return

    setIsSubmitting(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reassign',
          order_id: reassigningOrder.id,
          driver_id: newDriverId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setActionError(data.error || 'فشل إعادة التعيين')
        return
      }

      setActionSuccess(data.message || 'تمت إعادة تعيين الطلب بنجاح')
      setReassigningOrder(null)
      fetchAssignmentData()
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeliveryStatusUpdate = async (orderId: string, newStatus: string) => {
    setIsSubmitting(true)
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
      fetchAssignmentData()
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-900 to-zinc-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20 animate-fade-in-up">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-2">📦</span>
            <h1 className="text-xl font-extrabold text-gray-900">
              دخول شاشة تعيين طيارين الدليفري
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              أدخل كود الإدارة للوصول لشاشة ربط الطلبات بالطيارين
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                كود الإدارة / الكاشير
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
              {isLoggingIn ? 'جاري التحقق...' : 'دخول اللوحة ✓'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const selectedOrder = readyOrders.find((o) => o.id === selectedOrderId)
  const selectedDriver = availableDrivers.find((d) => d.id === selectedDriverId)

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans">
      <header className="bg-gradient-to-l from-zinc-900 via-amber-950 to-zinc-900 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📦</span>
            <div>
              <h1 className="text-lg font-black tracking-tight">
                شاشة تعيين طلبات الدليفري للطيارين
              </h1>
              <p className="text-amber-200/80 text-xs">
                ربط الطلبات الجاهزة بالمطبخ بالطيارين المتاحين بالفرع
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/drivers"
              className="bg-amber-800 hover:bg-amber-700 text-amber-100 text-xs font-bold py-2 px-3 rounded-xl border border-amber-600/50 transition-colors"
            >
              🛵 إدارة الورديات ({availableDrivers.length} متاح)
            </Link>
            <Link
              href="/admin/orders"
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all"
            >
              🥩 استقبال الطلبات
            </Link>
            <button
              onClick={handleLogout}
              className="bg-red-900/40 hover:bg-red-800 text-red-200 text-xs font-bold py-2 px-3 rounded-xl border border-red-700/50 transition-colors"
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
            <p className="mt-4 text-xs font-bold text-gray-500">جاري تحميل طلبات الدليفري والطيارين...</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                    📦 طلبات الدليفري الجاهزة بالمطبخ ({readyOrders.length})
                  </h2>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    حالة جاهز (ready)
                  </span>
                </div>

                {readyOrders.length === 0 ? (
                  <div className="bg-white rounded-3xl p-10 border border-gray-200 text-center shadow-sm">
                    <span className="text-4xl block mb-2">🎉</span>
                    <p className="text-xs font-bold text-gray-600">لا توجد طلبات دليفري جاهزة للتعيين حالياً</p>
                    <p className="text-[11px] text-gray-400 mt-1">الطلبات المتحولة لحالة جاهز بالمطبخ ستظهر هنا تلقائياً</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {readyOrders.map((order) => {
                      const isSelected = selectedOrderId === order.id

                      return (
                        <div
                          key={order.id}
                          onClick={() => setSelectedOrderId(order.id)}
                          className={`p-4 rounded-3xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-50/80 border-purple-400 ring-2 ring-purple-500/30 shadow-md'
                              : 'bg-white border-gray-200 hover:border-amber-300 shadow-sm'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-xs font-bold text-gray-400">طلب رقم</span>
                              <h3 className="text-xl font-black text-gray-900 tabular-nums">
                                #{order.order_number}
                              </h3>
                            </div>
                            <div className="text-left">
                              <span className="bg-purple-100 text-purple-800 text-[11px] font-extrabold px-3 py-1 rounded-full border border-purple-200">
                                🛵 دليفري
                              </span>
                              <p className="text-[11px] font-medium text-gray-400 mt-1" dir="ltr">
                                {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="text-xs space-y-1 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>العميل: {order.customer_name}</span>
                              <span className="dir-ltr text-amber-700">📞 {order.customer_phone}</span>
                            </div>
                            {order.delivery_address && (
                              <p className="text-gray-600 font-medium">📍 {order.delivery_address}</p>
                            )}
                          </div>

                          <div className="mt-3 flex justify-between items-center text-xs">
                            <span className="font-extrabold text-amber-700 tabular-nums">
                              الإجمالي: {Number(order.total_amount).toFixed(0)} ج.م
                            </span>
                            <span
                              className={`text-[11px] font-bold px-3 py-1 rounded-xl transition-colors ${
                                isSelected
                                  ? 'bg-purple-700 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {isSelected ? '✓ تم التحديد' : 'تحديد الطلب'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                    🛵 الطيارين المتاحين للتعيين ({availableDrivers.length})
                  </h2>
                  <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg border border-green-200">
                    🟢 متاح + وردية مفتوحة
                  </span>
                </div>

                {availableDrivers.length === 0 ? (
                  <div className="bg-white rounded-3xl p-8 border border-gray-200 text-center shadow-sm">
                    <span className="text-3xl block mb-2">🛵</span>
                    <p className="text-xs font-bold text-gray-600">لا يوجد طيارون متاحون حالياً</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      تأكد من فتح وردية للطيار من صفحة إدارة الطيارين
                    </p>
                    <Link
                      href="/admin/drivers"
                      className="inline-block mt-3 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition-colors"
                    >
                      فتح وردية طيار ➔
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableDrivers.map((driver) => {
                      const isSelected = selectedDriverId === driver.id

                      return (
                        <div
                          key={driver.id}
                          onClick={() => setSelectedDriverId(driver.id)}
                          className={`p-4 rounded-3xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-green-50/80 border-green-400 ring-2 ring-green-500/30 shadow-md'
                              : 'bg-white border-gray-200 hover:border-green-300 shadow-sm'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="font-extrabold text-sm text-gray-900">{driver.name}</h3>
                            </div>
                            <span
                              className={`text-xs font-bold px-3 py-1 rounded-xl transition-colors ${
                                isSelected
                                  ? 'bg-green-700 text-white'
                                  : 'bg-green-100 text-green-800 border border-green-200'
                              }`}
                            >
                              {isSelected ? '✓ محدد' : '🟢 متاح'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-lg space-y-3">
                  <div className="text-xs space-y-1">
                    <p className="text-gray-500 font-semibold">ملخص التعيين المطلوب:</p>
                    <p className="font-bold text-gray-900">
                      الطلب: {selectedOrder ? `#${selectedOrder.order_number} (${selectedOrder.customer_name})` : 'لم يحدد'}
                    </p>
                    <p className="font-bold text-gray-900">
                      الطيار: {selectedDriver ? `${selectedDriver.name}` : 'لم يحدد'}
                    </p>
                  </div>

                  <button
                    onClick={handleConfirmAssignment}
                    disabled={!selectedOrderId || !selectedDriverId || isSubmitting}
                    className="w-full bg-gradient-to-l from-purple-700 to-purple-600 hover:from-purple-800 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-md shadow-purple-900/20 disabled:opacity-50"
                  >
                    {isSubmitting ? 'جاري التعيين...' : '🛵 تأكيد تعيين الطلب للطيار ✓'}
                  </button>
                </div>
              </div>
            </div>

            {activeDeliveryOrders.length > 0 && (
              <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                  🚚 طلبات الدليفري جارية التوصيل ({activeDeliveryOrders.length})
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeDeliveryOrders.map((order) => {
                    const statusCfg = STATUS_UI_CONFIG[order.status] || STATUS_UI_CONFIG.pending

                    return (
                      <div
                        key={order.id}
                        className="bg-gray-50/80 p-4 rounded-2xl border border-gray-200 flex flex-col justify-between space-y-3"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-bold text-gray-400">طلب رقم</span>
                            <h3 className="text-xl font-black text-gray-900 tabular-nums">
                              #{order.order_number}
                            </h3>
                            <p className="text-xs font-bold text-gray-800 mt-1">{order.customer_name}</p>
                          </div>
                          <span
                            className={`text-xs font-extrabold px-3 py-1 rounded-full border ${statusCfg.bgColor} ${statusCfg.color} ${statusCfg.borderColor}`}
                          >
                            {statusCfg.label}
                          </span>
                        </div>

                        {order.assigned_driver && (
                          <div className="bg-indigo-50 border border-indigo-200 p-2.5 rounded-xl text-xs space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-extrabold text-indigo-900">
                                🛵 {order.assigned_driver.driver_name}
                              </span>
                              <button
                                onClick={() => setReassigningOrder(order)}
                                className="bg-white hover:bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-300"
                              >
                                🔄 تغيير
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-gray-200">
                          {order.status === 'assigned' && (
                            <button
                              onClick={() => handleDeliveryStatusUpdate(order.id, 'picked_up')}
                              disabled={isSubmitting}
                              className="w-full bg-cyan-700 hover:bg-cyan-800 text-white font-bold py-2 rounded-xl text-xs transition-colors shadow-sm"
                            >
                              🎒 استلام من المطبخ
                            </button>
                          )}

                          {order.status === 'picked_up' && (
                            <button
                              onClick={() => handleDeliveryStatusUpdate(order.id, 'out_for_delivery')}
                              disabled={isSubmitting}
                              className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 rounded-xl text-xs transition-colors shadow-sm"
                            >
                              🚚 خرج مع الطيار للعميل
                            </button>
                          )}

                          {order.status === 'out_for_delivery' && (
                            <button
                              onClick={() => handleDeliveryStatusUpdate(order.id, 'delivered')}
                              disabled={isSubmitting}
                              className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-2 rounded-xl text-xs transition-colors shadow-sm"
                            >
                              🎉 تم التوصيل للعميل
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {reassigningOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-extrabold text-gray-900">
                🔄 إعادة تعيين الطلب #{reassigningOrder.order_number}
              </h3>
              <button
                onClick={() => setReassigningOrder(null)}
                className="text-xs font-bold text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              اختر طياراً متاحاً جديداً لنقل الطلب إليه (سيتم حفظ سجل التعيين السابق):
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availableDrivers.map((d) => (
                <div
                  key={d.id}
                  onClick={() => handleConfirmReassign(d.id)}
                  className="p-3 rounded-2xl border border-gray-200 hover:border-purple-400 bg-gray-50 hover:bg-purple-50 cursor-pointer flex justify-between items-center text-xs transition-all"
                >
                  <span className="font-extrabold text-gray-900">{d.name}</span>
                  <span className="bg-purple-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold">
                    تحويل لهذا الطيار
                  </span>
                </div>
              ))}
            </div>

            <div className="text-left pt-2">
              <button
                onClick={() => setReassigningOrder(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
