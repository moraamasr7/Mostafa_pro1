'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { OperatingHoursResult, WeeklyOperatingHour, SpecialClosure, ScheduleOverride } from '@/lib/schedule'
import Link from 'next/link'

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export default function AdminSchedulePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [status, setStatus] = useState<OperatingHoursResult | null>(null)
  const [weeklyHours, setWeeklyHours] = useState<WeeklyOperatingHour[]>([])
  const [specialClosures, setSpecialClosures] = useState<SpecialClosure[]>([])
  const [scheduleOverrides, setScheduleOverrides] = useState<ScheduleOverride[]>([])

  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const [closureDate, setClosureDate] = useState('')
  const [closureReason, setClosureReason] = useState('')
  const [isAddingClosure, setIsAddingClosure] = useState(false)

  const [overrideDate, setOverrideDate] = useState('')
  const [overrideOpenTime, setOverrideOpenTime] = useState('10:00')
  const [overrideCloseTime, setOverrideCloseTime] = useState('02:00')
  const [overrideIsClosed, setOverrideIsClosed] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [isAddingOverride, setIsAddingOverride] = useState(false)

  const fetchScheduleData = async () => {
    setLoading(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/schedule')
      const data = await res.json()

      if (res.ok) {
        setIsAuthenticated(true)
        setStatus(data.status)
        setSpecialClosures(data.special_closures || [])
        setScheduleOverrides(data.schedule_overrides || [])

        const existingMap = new Map<number, WeeklyOperatingHour>()
        for (const h of data.weekly_hours || []) {
          existingMap.set(h.day_of_week, h)
        }

        const fullHours: WeeklyOperatingHour[] = []
        for (let d = 0; d <= 6; d++) {
          const item = existingMap.get(d)
          fullHours.push({
            day_of_week: d,
            open_time: item ? item.open_time.substring(0, 5) : '10:00',
            close_time: item ? item.close_time.substring(0, 5) : '02:00',
            is_closed: item ? item.is_closed : false,
          })
        }

        setWeeklyHours(fullHours)
      } else {
        setActionError(data.error || 'تعذر تحميل بيانات مواعيد العمل')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      await fetchScheduleData()
    }
    load()

    const channel = supabase
      .channel('admin-schedule-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_operating_hours' }, () => fetchScheduleData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_special_closures' }, () => fetchScheduleData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_schedule_overrides' }, () => fetchScheduleData())
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
        fetchScheduleData()
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

  const handleSaveWeeklyHours = async () => {
    setIsSaving(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const formattedHours = weeklyHours.map((h) => ({
        ...h,
        open_time: `${h.open_time}:00`,
        close_time: `${h.close_time}:00`,
      }))

      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_weekly',
          hours: formattedHours,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setActionError(data.error || 'فشل حفظ مواعيد العمل')
        return
      }

      setActionSuccess(data.message || 'تم حفظ مواعيد العمل الأسبوعية بنجاح')
      fetchScheduleData()
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddClosure = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsAddingClosure(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_closure',
          closure_date: closureDate,
          reason: closureReason,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setActionError(data.error || 'فشل إضافة الإغلاق')
        return
      }

      setClosureDate('')
      setClosureReason('')
      setActionSuccess(data.message)
      fetchScheduleData()
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsAddingClosure(false)
    }
  }

  const handleDeleteClosure = async (closureId: string) => {
    setActionError(null)

    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_closure',
          closure_id: closureId,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess(data.message)
        fetchScheduleData()
      } else {
        setActionError(data.error || 'فشل حذف الإغلاق')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    }
  }

  const handleAddOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsAddingOverride(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_override',
          override_date: overrideDate,
          open_time: `${overrideOpenTime}:00`,
          close_time: `${overrideCloseTime}:00`,
          is_closed: overrideIsClosed,
          reason: overrideReason,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setActionError(data.error || 'فشل إضافة الموعد الاستثنائي')
        return
      }

      setOverrideDate('')
      setOverrideReason('')
      setActionSuccess(data.message)
      fetchScheduleData()
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsAddingOverride(false)
    }
  }

  const handleDeleteOverride = async (overrideId: string) => {
    setActionError(null)

    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_override',
          override_id: overrideId,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess(data.message)
        fetchScheduleData()
      } else {
        setActionError(data.error || 'فشل حذف الموعد الاستثنائي')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    }
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-900 to-zinc-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20 animate-fade-in-up">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-2">📅</span>
            <h1 className="text-xl font-extrabold text-gray-900">
              دخول إدارة جدول ومواعيد عمل المطعم
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              أدخل كود الإدارة لتعديل مواعيد العمل الرسمية والعطلات
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
            <span className="text-3xl">📅</span>
            <div>
              <h1 className="text-lg font-black tracking-tight">
                جدول ومواعيد تشغيل المطعم — Africa/Cairo
              </h1>
              <p className="text-amber-200/80 text-xs">
                إدارة ساعات العمل الأسبوعية الدوريّة والعطلات الاستثنائية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/orders"
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all"
            >
              🥩 لوحة استقبال الطلبات
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

        {status && (
          <div
            className={`p-6 rounded-3xl border shadow-sm flex flex-wrap items-center justify-between gap-4 transition-all ${
              status.isOpen
                ? 'bg-gradient-to-l from-green-900 via-emerald-800 to-green-900 text-white border-green-700'
                : 'bg-gradient-to-l from-red-950 via-zinc-900 to-red-950 text-white border-red-900'
            }`}
          >
            <div className="flex items-center gap-4">
              <span className="text-4xl">{status.isOpen ? '🟢' : '🔴'}</span>
              <div>
                <h2 className="text-lg font-black">
                  {status.isOpen ? 'المطعم مفتوح حالياً ويستقبل الطلبات' : 'المطعم مغلق حالياً'}
                </h2>
                <p className="text-xs text-white/80 mt-0.5">{status.reason}</p>
                {status.currentWindow && (
                  <p className="text-xs font-bold text-amber-300 mt-1">
                    ساعات التشغيل اليوم: من {status.currentWindow.open} إلى {status.currentWindow.close} (توقيت القاهرة)
                  </p>
                )}
              </div>
            </div>
            <div className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-xl border border-white/20">
              التوقيت الرسمي: {status.timezone}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-4 border-amber-300 border-t-amber-600 rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-xs font-bold text-gray-500">جاري تحميل جدول مواعيد العمل...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-extrabold text-gray-900">
                    🕒 مواعيد العمل الأسبوعية الدوريّة
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    يدعم المواعيد الممتدة بعد منتصف الليل (مثال: 10:00 ص إلى 02:00 ص اليوم التالي)
                  </p>
                </div>
                <button
                  onClick={handleSaveWeeklyHours}
                  disabled={isSaving}
                  className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md shadow-amber-900/20 transition-all disabled:opacity-50"
                >
                  {isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات ✓'}
                </button>
              </div>

              <div className="space-y-3">
                {weeklyHours.map((h, idx) => (
                  <div
                    key={h.day_of_week}
                    className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-gray-50 border border-gray-100 text-xs"
                  >
                    <span className="font-extrabold text-gray-900 w-20">
                      {ARABIC_DAYS[h.day_of_week]}
                    </span>

                    <div className="flex items-center gap-2">
                      <label className="text-gray-500 font-medium">فتح:</label>
                      <input
                        type="time"
                        value={h.open_time}
                        disabled={h.is_closed}
                        onChange={(e) => {
                          const updated = [...weeklyHours]
                          updated[idx].open_time = e.target.value
                          setWeeklyHours(updated)
                        }}
                        className="px-3 py-1.5 rounded-xl border border-gray-300 font-bold bg-white text-center focus:ring-1 focus:ring-amber-500 disabled:opacity-40"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-gray-500 font-medium">إغلاق:</label>
                      <input
                        type="time"
                        value={h.close_time}
                        disabled={h.is_closed}
                        onChange={(e) => {
                          const updated = [...weeklyHours]
                          updated[idx].close_time = e.target.value
                          setWeeklyHours(updated)
                        }}
                        className="px-3 py-1.5 rounded-xl border border-gray-300 font-bold bg-white text-center focus:ring-1 focus:ring-amber-500 disabled:opacity-40"
                      />
                    </div>

                    <label className="flex items-center gap-1.5 font-bold text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={h.is_closed}
                        onChange={(e) => {
                          const updated = [...weeklyHours]
                          updated[idx].is_closed = e.target.checked
                          setWeeklyHours(updated)
                        }}
                        className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                      />
                      <span>مغلق</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <h2 className="text-sm font-extrabold text-gray-900">
                  🌴 العطلات والإغلاقات الاستثنائية
                </h2>

                <form onSubmit={handleAddClosure} className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={closureDate}
                      onChange={(e) => setClosureDate(e.target.value)}
                      required
                      className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold bg-gray-50 flex-1"
                    />
                    <input
                      type="text"
                      placeholder="سبب الإغلاق..."
                      value={closureReason}
                      onChange={(e) => setClosureReason(e.target.value)}
                      required
                      className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold bg-gray-50 flex-1"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isAddingClosure || !closureDate || !closureReason}
                    className="w-full bg-red-800 hover:bg-red-900 text-white font-bold py-2 rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isAddingClosure ? 'جاري الإضافة...' : '➕ إضافة تاريخ إغلاق استثنائي'}
                  </button>
                </form>

                {specialClosures.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {specialClosures.map((c) => (
                      <div
                        key={c.id}
                        className="flex justify-between items-center p-3 rounded-2xl bg-red-50/60 border border-red-100 text-xs"
                      >
                        <div>
                          <span className="font-extrabold text-red-900 block">{c.closure_date}</span>
                          <span className="text-red-700 font-semibold">{c.reason}</span>
                        </div>
                        <button
                          onClick={() => c.id && handleDeleteClosure(c.id)}
                          className="text-red-600 font-bold hover:text-red-800 text-xs"
                        >
                          حذف ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-2">لا توجد عطلات استثنائية مسجلة</p>
                )}
              </div>

              <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <h2 className="text-sm font-extrabold text-gray-900">
                  ⭐ التجاوزات وتعديل المواعيد الخاصة
                </h2>

                <form onSubmit={handleAddOverride} className="space-y-3">
                  <input
                    type="date"
                    value={overrideDate}
                    onChange={(e) => setOverrideDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold bg-gray-50"
                  />

                  <div className="flex gap-2 text-xs">
                    <input
                      type="time"
                      value={overrideOpenTime}
                      onChange={(e) => setOverrideOpenTime(e.target.value)}
                      required
                      className="px-3 py-2 rounded-xl border border-gray-200 font-bold bg-gray-50 flex-1"
                    />
                    <input
                      type="time"
                      value={overrideCloseTime}
                      onChange={(e) => setOverrideCloseTime(e.target.value)}
                      required
                      className="px-3 py-2 rounded-xl border border-gray-200 font-bold bg-gray-50 flex-1"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-gray-700 font-bold px-1">
                    <input
                      type="checkbox"
                      checked={overrideIsClosed}
                      onChange={(e) => setOverrideIsClosed(e.target.checked)}
                      className="rounded text-purple-700 focus:ring-purple-500"
                    />
                    <span>إغلاق كلي بهذا اليوم</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isAddingOverride || !overrideDate}
                    className="w-full bg-purple-800 hover:bg-purple-900 text-white font-bold py-2 rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isAddingOverride ? 'جاري الإضافة...' : '➕ إضافة موعد استثنائي للتاريخ'}
                  </button>
                </form>

                {scheduleOverrides.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {scheduleOverrides.map((o) => (
                      <div
                        key={o.id}
                        className="flex justify-between items-center p-3 rounded-2xl bg-purple-50/60 border border-purple-100 text-xs"
                      >
                        <div>
                          <span className="font-extrabold text-purple-900 block">{o.override_date}</span>
                          <span className="text-purple-800 font-semibold">
                            من {o.open_time.substring(0, 5)} إلى {o.close_time.substring(0, 5)}
                          </span>
                        </div>
                        <button
                          onClick={() => o.id && handleDeleteOverride(o.id)}
                          className="text-purple-600 font-bold hover:text-purple-800 text-xs"
                        >
                          حذف ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-2">لا توجد مواعيد استثنائية مسجلة</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
