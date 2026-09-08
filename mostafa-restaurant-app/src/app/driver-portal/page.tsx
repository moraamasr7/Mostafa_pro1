'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface OrderAssignment {
  id: string
  order_id: string
  status: string
  assigned_at: string
  orders: {
    id: string
    order_number: number
    customer_name: string
    customer_phone: string
    delivery_address?: string
    total_amount: number
    notes?: string
    status: string
  }
}

interface ActiveTrip {
  id: string
  trip_number: number
  status: string
  expected_amount: number
  collected_amount: number
  collection_status: string
  dispatched_at?: string
  created_at: string
  order_driver_assignments?: OrderAssignment[]
}

interface DriverInfo {
  id: string
  name: string
  status: string
}

interface OpenShift {
  id: string
  started_at: string
  status: string
}

const FAILURE_REASONS = [
  'العميل لا يرد على الهاتف',
  'العميل رفض استلام الطلب',
  'العنوان غير صحيح أو غير موجود',
  'هاتف العميل مغلق',
  'تعذر الوصول للعنوان',
  'سبب آخر',
]

export default function DriverMobilePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [driver, setDriver] = useState<DriverInfo | null>(null)
  const [openShift, setOpenShift] = useState<OpenShift | null>(null)
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null)

  const [loading, setLoading] = useState(true)
  const [isActionSubmitting, setIsActionSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const [selectedOrderForDelivery, setSelectedOrderForDelivery] = useState<OrderAssignment | null>(null)
  const [collectedInput, setCollectedInput] = useState<string>('')
  
  const [selectedOrderForFailure, setSelectedOrderForFailure] = useState<OrderAssignment | null>(null)
  const [selectedFailureReason, setSelectedFailureReason] = useState<string>(FAILURE_REASONS[0])

  const fetchDriverData = async () => {
    setLoading(true)
    setActionError(null)

    try {
      const res = await fetch('/api/driver/me')
      if (res.status === 401) {
        setIsAuthenticated(false)
        setLoading(false)
        return
      }

      const data = await res.json()
      if (res.ok) {
        setIsAuthenticated(true)
        setDriver(data.driver)
        setOpenShift(data.open_shift)
        setActiveTrip(data.active_trip)
      } else {
        setActionError(data.error || 'تعذر تحميل بيانات الطيار')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      await fetchDriverData()
    }
    load()

    const channel = supabase
      .channel('driver-mobile-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchDriverData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => fetchDriverData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_driver_assignments' }, () => fetchDriverData())
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
      const res = await fetch('/api/driver/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput }),
      })

      const data = await res.json()
      if (res.ok) {
        setIsAuthenticated(true)
        setPhoneInput('')
        fetchDriverData()
      } else {
        setLoginError(data.error || 'رقم الموبايل غير مسجل كطيار')
      }
    } catch {
      setLoginError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/driver/logout', { method: 'POST' })
    setIsAuthenticated(false)
    setDriver(null)
  }

  const handleTripPickup = async (tripId: string) => {
    setIsActionSubmitting(true)
    setActionError(null)

    try {
      const res = await fetch('/api/driver/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pickup', trip_id: tripId }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess(data.message)
        fetchDriverData()
      } else {
        setActionError(data.error || 'فشل تسجيل الاستلام')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsActionSubmitting(false)
    }
  }

  const handleTripOutForDelivery = async (tripId: string) => {
    setIsActionSubmitting(true)
    setActionError(null)

    try {
      const res = await fetch('/api/driver/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'out_for_delivery', trip_id: tripId }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess(data.message)
        fetchDriverData()
      } else {
        setActionError(data.error || 'فشل التحديث')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsActionSubmitting(false)
    }
  }

  const handleConfirmDelivered = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderForDelivery) return

    setIsActionSubmitting(true)
    setActionError(null)

    try {
      const amount = parseFloat(collectedInput) || selectedOrderForDelivery.orders.total_amount

      const res = await fetch('/api/driver/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_outcome',
          order_id: selectedOrderForDelivery.order_id,
          outcome: 'delivered',
          collected_amount: amount,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess(data.message)
        setSelectedOrderForDelivery(null)
        setCollectedInput('')
        fetchDriverData()
      } else {
        setActionError(data.error || 'فشل تسجيل التسليم')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsActionSubmitting(false)
    }
  }

  const handleConfirmFailed = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderForFailure) return

    setIsActionSubmitting(true)
    setActionError(null)

    try {
      const res = await fetch('/api/driver/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_outcome',
          order_id: selectedOrderForFailure.order_id,
          outcome: 'failed',
          failure_reason: selectedFailureReason,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess(data.message)
        setSelectedOrderForFailure(null)
        fetchDriverData()
      } else {
        setActionError(data.error || 'فشل تسجيل حالة الفشل')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsActionSubmitting(false)
    }
  }

  const handleCompleteTrip = async (tripId: string) => {
    setIsActionSubmitting(true)
    setActionError(null)

    try {
      const res = await fetch('/api/driver/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_trip', trip_id: tripId }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess(data.message)
        fetchDriverData()
      } else {
        setActionError(data.error || 'تعذر إغلاق الرحلة')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsActionSubmitting(false)
    }
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-950 via-zinc-900 to-black text-white flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-zinc-900/90 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-zinc-800 animate-fade-in-up">
          <div className="text-center mb-6">
            <span className="text-6xl block mb-3">🛵</span>
            <h1 className="text-xl font-black text-amber-400">تطبيق طيار الدليفري</h1>
            <p className="text-xs text-gray-400 mt-1">مطعم مصطفى الجزار — تنفيذ الرحلات والطلبات</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1">
                رقم موبايل الطيار المسجل
              </label>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="01XXXXXXXXX"
                required
                className="w-full px-4 py-3.5 border border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-center font-bold tracking-widest text-lg bg-zinc-800 text-white"
                dir="ltr"
              />
            </div>

            {loginError && (
              <p className="text-red-400 text-xs font-semibold text-center bg-red-950/50 p-2.5 rounded-xl border border-red-800">
                ⚠️ {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn || !phoneInput}
              className="w-full bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-700 text-white font-extrabold py-4 rounded-2xl text-base transition-all shadow-lg shadow-amber-950/40 disabled:opacity-50"
            >
              {isLoggingIn ? 'جاري التحقق...' : 'دخول التطبيق ➔'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const assignments = activeTrip?.order_driver_assignments || []
  const allOrdersResolved =
    assignments.length > 0 &&
    assignments.every((a) => a.orders.status === 'delivered' || a.orders.status === 'failed')

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans pb-10">
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛵</span>
            <div>
              <h1 className="text-base font-black text-amber-400">{driver?.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                openShift
                  ? 'bg-green-950 text-green-400 border-green-800'
                  : 'bg-zinc-800 text-gray-400 border-zinc-700'
              }`}
            >
              {openShift ? '🟢 وردية مفتوحة' : '🔴 بدون وردية'}
            </span>
            <button
              onClick={handleLogout}
              className="bg-red-950/60 hover:bg-red-900 text-red-300 text-xs font-bold py-1.5 px-3 rounded-xl border border-red-800 transition-colors"
            >
              خروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 w-full flex-1 space-y-5">
        {actionError && (
          <div className="bg-red-950/80 border border-red-800 text-red-200 p-3.5 rounded-2xl flex items-center justify-between text-xs font-bold animate-fade-in">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 font-black">
              ✕
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-green-950/80 border border-green-800 text-green-200 p-3.5 rounded-2xl flex items-center justify-between text-xs font-bold animate-fade-in">
            <span>✅ {actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-green-400 font-black">
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-xs font-bold text-gray-400">جاري تحميل الرحلة النشطة...</p>
          </div>
        ) : !activeTrip ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center space-y-3">
            <span className="text-5xl block">☕</span>
            <h2 className="text-base font-extrabold text-gray-200">لا توجد رحلة توصيل مكلف بها حالياً</h2>
            <p className="text-xs text-gray-400">
              أنت في حالة استعداد بالفرع. عند تعيين خط سير لك من الكاشير ستظهر الطلبات هنا فوراً.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-gradient-to-l from-zinc-900 to-zinc-900/90 border border-amber-500/30 p-5 rounded-3xl space-y-3 shadow-lg">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-xs font-bold text-gray-400">خط سير رقم</span>
                  <h2 className="text-2xl font-black text-amber-400 tabular-nums">
                    #{activeTrip.trip_number}
                  </h2>
                </div>
                <span className="bg-amber-950 text-amber-300 border border-amber-800 text-xs font-extrabold px-3 py-1 rounded-full">
                  {assignments.length} طلبات دليفري
                </span>
              </div>

              {activeTrip.status === 'created' && (
                <button
                  onClick={() => handleTripPickup(activeTrip.id)}
                  disabled={isActionSubmitting}
                  className="w-full bg-gradient-to-l from-cyan-600 to-cyan-500 hover:from-cyan-700 text-white font-extrabold py-3.5 rounded-2xl text-sm transition-all shadow-md shadow-cyan-950/40 disabled:opacity-50"
                >
                  🎒 استلام كل الطلبات من المطبخ
                </button>
              )}

              {activeTrip.status === 'picked_up' && (
                <button
                  onClick={() => handleTripOutForDelivery(activeTrip.id)}
                  disabled={isActionSubmitting}
                  className="w-full bg-gradient-to-l from-purple-600 to-purple-500 hover:from-purple-700 text-white font-extrabold py-3.5 rounded-2xl text-sm transition-all shadow-md shadow-purple-950/40 disabled:opacity-50"
                >
                  🚚 خرجت الآن للتوصيل إلى العملاء
                </button>
              )}

              {allOrdersResolved && (
                <button
                  onClick={() => handleCompleteTrip(activeTrip.id)}
                  disabled={isActionSubmitting}
                  className="w-full bg-gradient-to-l from-green-600 to-green-500 hover:from-green-700 text-white font-black py-4 rounded-2xl text-base transition-all shadow-xl shadow-green-950/50 disabled:opacity-50"
                >
                  🏁 إنهاء وإغلاق رحلة التوصيل بالكامل ✓
                </button>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-gray-400 px-1">
                طلبات خط السير (كل طلب مستقل بالكامل):
              </h3>

              {assignments.map((item) => {
                const o = item.orders
                const isDelivered = o.status === 'delivered'
                const isFailed = o.status === 'failed'

                return (
                  <div
                    key={item.id}
                    className={`bg-zinc-900 border p-5 rounded-3xl space-y-3 transition-all ${
                      isDelivered
                        ? 'border-green-800/60 bg-green-950/10'
                        : isFailed
                        ? 'border-red-800/60 bg-red-950/10'
                        : 'border-zinc-800'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[11px] font-bold text-gray-400">طلب رقم</span>
                        <h4 className="text-xl font-black text-amber-400 tabular-nums">
                          #{o.order_number}
                        </h4>
                      </div>

                      <span
                        className={`text-xs font-extrabold px-3 py-1 rounded-full border ${
                          isDelivered
                            ? 'bg-green-950 text-green-400 border-green-800'
                            : isFailed
                            ? 'bg-red-950 text-red-400 border-red-800'
                            : 'bg-zinc-800 text-amber-300 border-zinc-700'
                        }`}
                      >
                        {isDelivered ? '✅ تم التسليم' : isFailed ? '❌ تعذر التسليم' : 'جاري التوصيل'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center bg-zinc-800/60 p-3 rounded-2xl">
                        <span className="font-extrabold text-gray-200">{o.customer_name}</span>
                        <a
                          href={`tel:${o.customer_phone}`}
                          className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold px-3 py-1.5 rounded-xl transition-colors dir-ltr text-xs shadow-sm flex items-center gap-1"
                        >
                          📞 اتصال بالعميل
                        </a>
                      </div>

                      {o.delivery_address && (
                        <div className="bg-zinc-800/40 p-3 rounded-2xl border border-zinc-800/80 text-gray-300 font-semibold leading-relaxed">
                          📍 <strong>العنوان:</strong> {o.delivery_address}
                        </div>
                      )}

                      <div className="bg-amber-950/40 border border-amber-800/50 p-2.5 rounded-2xl flex justify-between items-center text-amber-300 font-extrabold">
                        <span>المطلوب تحصيله:</span>
                        <span className="text-base tabular-nums">{Number(o.total_amount).toFixed(0)} ج.م</span>
                      </div>

                      {o.notes && (
                        <p className="text-[11px] text-amber-200/80 bg-zinc-800/30 p-2 rounded-xl">
                          📝 {o.notes}
                        </p>
                      )}
                    </div>

                    {!isDelivered && !isFailed && (
                      <div className="flex gap-2 pt-2 border-t border-zinc-800">
                        <button
                          onClick={() => {
                            setSelectedOrderForDelivery(item)
                            setCollectedInput(o.total_amount.toString())
                          }}
                          disabled={isActionSubmitting}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-extrabold py-3 rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50"
                        >
                          🎉 تم التسليم
                        </button>
                        <button
                          onClick={() => setSelectedOrderForFailure(item)}
                          disabled={isActionSubmitting}
                          className="bg-red-950 hover:bg-red-900 text-red-300 font-bold px-4 py-3 rounded-xl text-xs transition-colors border border-red-800 disabled:opacity-50"
                        >
                          ⚠️ تعذر التسليم
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {selectedOrderForDelivery && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 rounded-3xl max-w-sm w-full p-6 space-y-4 border border-zinc-800 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-extrabold text-amber-400">
                🎉 تأكيد تسليم طلب #{selectedOrderForDelivery.orders.order_number}
              </h3>
              <button
                onClick={() => setSelectedOrderForDelivery(null)}
                className="text-xs font-bold text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDelivered} className="space-y-4">
              <div className="bg-zinc-800 p-3 rounded-2xl text-xs space-y-1">
                <p className="text-gray-400">إجمالي الطلب المطلوب:</p>
                <p className="text-xl font-black text-amber-300 tabular-nums">
                  {Number(selectedOrderForDelivery.orders.total_amount).toFixed(0)} ج.م
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  المبلغ المحصل فعلياً (ج.م):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={collectedInput}
                  onChange={(e) => setCollectedInput(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-white font-bold text-center text-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDelivery(null)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-700 text-xs font-bold text-gray-400 hover:bg-zinc-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isActionSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-extrabold transition-all shadow-md shadow-green-950/50 disabled:opacity-50"
                >
                  {isActionSubmitting ? 'جاري التسجيل...' : 'تأكيد التسليم والتحصيل ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedOrderForFailure && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 rounded-3xl max-w-sm w-full p-6 space-y-4 border border-zinc-800 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-extrabold text-red-400">
                ⚠️ تعذر تسليم طلب #{selectedOrderForFailure.orders.order_number}
              </h3>
              <button
                onClick={() => setSelectedOrderForFailure(null)}
                className="text-xs font-bold text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmFailed} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-2">
                  اختر سبب عدم التوصيل:
                </label>
                <div className="space-y-2">
                  {FAILURE_REASONS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        selectedFailureReason === reason
                          ? 'bg-red-950/60 border-red-600 text-red-300'
                          : 'bg-zinc-800/60 border-zinc-700 text-gray-300 hover:bg-zinc-800'
                      }`}
                    >
                      <input
                        type="radio"
                        name="failure_reason"
                        value={reason}
                        checked={selectedFailureReason === reason}
                        onChange={(e) => setSelectedFailureReason(e.target.value)}
                        className="text-red-600 focus:ring-red-500"
                      />
                      <span>{reason}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForFailure(null)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-700 text-xs font-bold text-gray-400 hover:bg-zinc-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isActionSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-extrabold transition-all shadow-md shadow-red-950/50 disabled:opacity-50"
                >
                  {isActionSubmitting ? 'جاري التسجيل...' : 'تأكيد حالة الفشل ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
