'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Driver } from '@/types/drivers'
import Link from 'next/link'

interface DriverExtended extends Driver {
  started_at?: string | null
  current_order_number?: number | null
}

const DRIVER_STATUS_MAP: Record<string, { label: string; badgeClass: string }> = {
  offline: {
    label: '⚪ غير متاح (أوفلاين)',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-300',
  },
  available: {
    label: '🟢 متاح للطلب',
    badgeClass: 'bg-green-100 text-green-800 border-green-300',
  },
  busy: {
    label: '🟡 مشغول بطلب',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
}

export default function AdminDriversPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [drivers, setDrivers] = useState<DriverExtended[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const fetchDriversData = async () => {
    setLoading(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/drivers')
      if (res.status === 401) {
        setIsAuthenticated(false)
        setLoading(false)
        return
      }

      const data = await res.json()
      if (res.ok) {
        setIsAuthenticated(true)
        const rawDrivers: Driver[] = data.drivers || []

        const { data: openShifts } = await supabase
          .from('driver_shifts')
          .select('driver_id, started_at')
          .eq('status', 'open')

        const { data: activeAssignments } = await supabase
          .from('order_driver_assignments')
          .select('driver_id, orders ( order_number )')
          .in('status', ['assigned', 'accepted', 'picked_up', 'out_for_delivery'])

        const shiftMap = new Map<string, string>()
        if (openShifts) {
          for (const s of openShifts) shiftMap.set(s.driver_id, s.started_at)
        }

        const assignmentMap = new Map<string, number>()
        interface AssignmentOrderRow { driver_id: string; orders?: { order_number?: number } }
        if (activeAssignments) {
          for (const a of (activeAssignments as unknown as AssignmentOrderRow[])) {
            if (a.orders?.order_number) {
              assignmentMap.set(a.driver_id, a.orders.order_number)
            }
          }
        }

        const extended: DriverExtended[] = rawDrivers.map((d) => ({
          ...d,
          started_at: shiftMap.get(d.id) || null,
          current_order_number: assignmentMap.get(d.id) || null,
        }))

        setDrivers(extended)
      } else {
        setActionError(data.error || 'تعذر تحميل قائمة الطيارين')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      await fetchDriversData()
    }
    load()

    const channel = supabase
      .channel('admin-drivers-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => fetchDriversData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => fetchDriversData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_driver_assignments' }, () => fetchDriversData())
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
        fetchDriversData()
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
        setActionSuccess('تمت إضافة الطيار بنجاح')
        fetchDriversData()
      } else {
        setActionError(data.error || 'فشل إضافة الطيار')
      }
    } catch {
      setActionError('تعذر إضافة الطيار')
    } finally {
      setIsAdding(false)
    }
  }

  const handleShiftAction = async (driverId: string, action: 'start' | 'end') => {
    setBusyDriverId(driverId)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: driverId, action }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess(data.message)
        fetchDriversData()
      } else {
        setActionError(data.error || 'فشل تنفيذ إجراء الوردية')
      }
    } catch {
      setActionError('حدث خطأ في الاتصال بالسيرفر')
    } finally {
      setBusyDriverId(null)
    }
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-900 to-zinc-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20 animate-fade-in-up">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-2">🛵</span>
            <h1 className="text-xl font-extrabold text-gray-900">
              دخول إدارة طاقم الطيارين
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              أدخل كود الإدارة للوصول للوحة الورديات والطيارين
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

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans">
      <header className="bg-gradient-to-l from-zinc-900 via-amber-950 to-zinc-900 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛵</span>
            <div>
              <h1 className="text-lg font-black tracking-tight">
                إدارة طاقم طيارين الدليفري والورديات
              </h1>
              <p className="text-amber-200/80 text-xs">
                متابعة حالة الطيارين وفتح وإغلاق الورديات التشغيلية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/admin/orders"
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all flex items-center gap-1"
            >
              🥩 لوحة استقبال الطلبات ➔
            </a>
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

        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm">
          <h2 className="text-sm font-extrabold text-gray-900 mb-3 flex items-center gap-2">
            ➕ إضافة طيار جديد لطاقم المطعم
          </h2>
          <form onSubmit={handleCreateDriver} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="اسم الطيار..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50 flex-1 min-w-[200px]"
            />
            <input
              type="tel"
              placeholder="رقم الموبايل (11 رقم)..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50 text-left flex-1 min-w-[200px]"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={isAdding || !name || !phone}
              className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-amber-900/20 disabled:opacity-50"
            >
              {isAdding ? 'جاري الحفظ...' : 'حفظ الطيار ✓'}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-4 border-amber-300 border-t-amber-600 rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-xs font-bold text-gray-500">جاري تحميل بيانات الطيارين...</p>
          </div>
        ) : drivers.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 shadow-sm max-w-md mx-auto">
            <span className="text-5xl block mb-3">🛵</span>
            <h3 className="font-extrabold text-base text-gray-800">لا يوجد طيارون مسجلون</h3>
            <p className="text-xs text-gray-400 mt-1">قم بإضافة أول طيار باستخدام النموذج أعلاه</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {drivers.map((d) => {
              const statusCfg = DRIVER_STATUS_MAP[d.status] || DRIVER_STATUS_MAP.offline
              const isWorking = busyDriverId === d.id

              return (
                <div
                  key={d.id}
                  className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col justify-between p-5 space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-black text-gray-900">{d.name}</h3>
                    </div>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border ${statusCfg.badgeClass}`}
                    >
                      {statusCfg.label}
                    </span>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-semibold">حالة الوردية:</span>
                      <span className="font-extrabold">
                        {d.active_shift_id ? '🟢 وردية مفتوحة' : '🔴 وردية مغلقة'}
                      </span>
                    </div>

                    {d.started_at && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-gray-400">وقت البدء:</span>
                        <span className="font-semibold text-gray-700 tabular-nums" dir="ltr">
                          {new Date(d.started_at).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )}

                    {d.current_order_number && (
                      <div className="bg-amber-100/70 border border-amber-200 text-amber-900 p-2 rounded-xl text-xs font-extrabold flex justify-between items-center mt-1">
                        <span>🛵 يوصل الطلب:</span>
                        <span className="text-amber-800 text-sm">#{d.current_order_number}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    {d.active_shift_id ? (
                      <button
                        onClick={() => handleShiftAction(d.id, 'end')}
                        disabled={isWorking}
                        className="w-full bg-red-50 hover:bg-red-100 text-red-700 font-bold py-2.5 rounded-xl text-xs transition-all border border-red-200 disabled:opacity-50"
                      >
                        {isWorking ? 'جاري الإغلاق...' : '⏹️ إنهاء الوردية'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleShiftAction(d.id, 'start')}
                        disabled={isWorking || !d.is_active}
                        className="w-full bg-gradient-to-l from-green-700 to-green-600 hover:from-green-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50"
                      >
                        {isWorking ? 'جاري الفتح...' : '▶️ بدء الوردية'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
