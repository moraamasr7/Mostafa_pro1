'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import OpsNavbar from '@/components/OpsNavbar'
import Link from 'next/link'
import { playAlertSound } from '@/lib/audioAlert'

interface DashboardStats {
  activeOrders: number
  pendingOrders: number
  processingOrders: number
  readyOrders: number
  deliveryActive: number
  completedToday: number
  totalRevenueToday: number
  totalDriversCount: number
  activeDriversCount: number
}

interface ClosureAuditResult {
  canClose: boolean
  issues: string[]
  unresolvedOrdersCount: number
  activeDriversInTripsCount: number
  pendingCollectedAmount: number
}

interface LiveAlert {
  id: string
  title: string
  message: string
  time: string
  type: 'urgent' | 'warning' | 'info' | 'success'
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    activeOrders: 0,
    pendingOrders: 0,
    processingOrders: 0,
    readyOrders: 0,
    deliveryActive: 0,
    completedToday: 0,
    totalRevenueToday: 0,
    totalDriversCount: 0,
    activeDriversCount: 0,
  })

  const [closureAudit, setClosureAudit] = useState<ClosureAuditResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAuditing, setIsAuditing] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([])
  const [activeToast, setActiveToast] = useState<LiveAlert | null>(null)
  const [isSendingReport, setIsSendingReport] = useState(false)
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleSendTelegramReport = async () => {
    setIsSendingReport(true)
    try {
      const res = await fetch('/api/admin/daily-report', { method: 'POST' })
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

  const triggerAlert = (alert: Omit<LiveAlert, 'id' | 'time'>) => {
    const newAlert: LiveAlert = {
      ...alert,
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }

    setLiveAlerts((prev) => [newAlert, ...prev.slice(0, 24)])
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
  }

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const [ordersRes, driversRes, tripsRes] = await Promise.all([
        fetch('/api/admin/orders?status=all'),
        fetch('/api/admin/drivers'),
        fetch('/api/admin/trips'),
      ])

      const ordersData = await ordersRes.json()
      const driversData = await driversRes.json()
      const tripsData = await tripsRes.json()

      const allOrders: any[] = ordersData.orders || []
      const allDrivers: any[] = driversData.drivers || []
      const allTrips: any[] = tripsData.trips || []

      const todayStr = new Date().toISOString().split('T')[0]

      let pending = 0
      let processing = 0
      let ready = 0
      let deliveryActive = 0
      let completedToday = 0
      let revenueToday = 0

      for (const o of allOrders) {
        if (o.status === 'pending') pending++
        else if (o.status === 'processing') processing++
        else if (o.status === 'ready') ready++
        else if (['assigned', 'picked_up', 'out_for_delivery'].includes(o.status)) deliveryActive++

        if (o.status === 'completed' || o.status === 'delivered') {
          const orderDate = (o.created_at || '').split('T')[0]
          if (orderDate === todayStr) {
            completedToday++
            revenueToday += Number(o.total_amount || 0)
          }
        }
      }

      const activeDrivers = allDrivers.filter((d: any) => d.status === 'available' || d.status === 'busy' || d.active_shift_id)

      setStats({
        activeOrders: pending + processing + ready + deliveryActive,
        pendingOrders: pending,
        processingOrders: processing,
        readyOrders: ready,
        deliveryActive,
        completedToday,
        totalRevenueToday: revenueToday,
        totalDriversCount: allDrivers.length,
        activeDriversCount: activeDrivers.length,
      })

      // Run automatic readiness audit
      const issues: string[] = []
      const openOrders = allOrders.filter((o: any) =>
        ['pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
      )

      if (openOrders.length > 0) {
        issues.push(`يوجد ${openOrders.length} طلب مفتوح لم يُحسم بعد (بين معلق، تجهيز، أو دليفري).`)
      }

      const activeTrips = allTrips.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled')
      if (activeTrips.length > 0) {
        issues.push(`يوجد ${activeTrips.length} رحلة دليفري نشطة في الميدان لم تُغلق.`)
      }

      let pendingCollected = 0
      for (const t of activeTrips) {
        pendingCollected += Number(t.expected_amount || 0)
      }

      setClosureAudit({
        canClose: issues.length === 0,
        issues,
        unresolvedOrdersCount: openOrders.length,
        activeDriversInTripsCount: activeTrips.length,
        pendingCollectedAmount: pendingCollected,
      })
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()

    // Subscriptions to all operational tables with instant alerts
    const channel = supabase
      .channel('dashboard-realtime-enhanced')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
        fetchDashboardData()

        if (payload.eventType === 'UPDATE') {
          const newStatus = payload.new?.status
          const oldStatus = payload.old?.status
          const orderNum = payload.new?.order_number || ''
          const customer = payload.new?.customer_name || 'عميل'
          const amount = payload.new?.total_amount || 0

          if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
            triggerAlert({
              title: '❌ إلغاء طلب فوري',
              message: `تم إلغاء الطلب #${orderNum} الخاص بالعميل ${customer} بقيمة ${amount} ج.م`,
              type: 'urgent',
            })
          } else if (newStatus === 'failed' && oldStatus !== 'failed') {
            triggerAlert({
              title: '⚠️ تعذر تسليم طلب (فشل)',
              message: `تعذر توصيل الطلب #${orderNum} للعميل ${customer}`,
              type: 'warning',
            })
          }
        } else if (payload.eventType === 'INSERT') {
          const orderNum = payload.new?.order_number || ''
          const customer = payload.new?.customer_name || 'عميل'
          const amount = payload.new?.total_amount || 0
          triggerAlert({
            title: '🔥 طلب جديد ورد للتو',
            message: `طلب جديد #${orderNum} - العميل: ${customer} (${amount} ج.م)`,
            type: 'success',
          })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, (payload: any) => {
        fetchDashboardData()

        if (payload.eventType === 'INSERT' && payload.new?.status === 'open') {
          triggerAlert({
            title: '🛵 فتح شيفت طيار جديد',
            message: 'قام طيار ببدء شفته الميداني وجاهز الآن للاستلام',
            type: 'info',
          })
        } else if (payload.eventType === 'UPDATE' && payload.new?.status === 'closed') {
          triggerAlert({
            title: '🏁 إغلاق وإنهاء شيفت طيار',
            message: 'تم إنهاء وتصفية شيفت الطيار بنجاح',
            type: 'info',
          })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        fetchDashboardData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => {
        fetchDashboardData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => {
        fetchDashboardData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundEnabled])

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans relative">
      <OpsNavbar title="لوحة التحكم والعمليات" subtitle="نظرة شاملة لمؤشرات المطعم وفحص جاهزية إغلاق الوردية" />

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
              <div className="mt-2 text-[10px] font-bold text-amber-300 flex items-center gap-1">
                <span>⚡ تم إرسال تنبيه فوري عبر تليجرام</span>
              </div>
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

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        {/* Realtime Status Bar */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
            </span>
            <div>
              <p className="text-xs font-black text-gray-800 flex items-center gap-2">
                <span>النظام متصل لحظياً (Supabase Realtime + تليجرام بوت)</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  مباشر ⚡
                </span>
              </p>
              <p className="text-[11px] text-gray-500 font-medium">
                أي إلغاء أو فشل طلب، أو فتح/إغلاق شيفت طيار ينعكس هنا وفي تليجرام تلقائياً في نفس الثانية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled)
                if (!soundEnabled) playAlertSound('info')
              }}
              className={`text-xs font-black px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 ${
                soundEnabled
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <span>{soundEnabled ? '🔊 التنبيه الصوتي مفعّل' : '🔇 كتم التنبيه الصوتي'}</span>
            </button>
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded-xl transition-all"
            >
              🔄 تحديث يدوي
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-2xl font-black shrink-0">
              ⚡
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500">الطلبات النشطة الآن</p>
              <h3 className="text-3xl font-black text-gray-900 mt-0.5">{stats.activeOrders}</h3>
              <p className="text-[11px] text-amber-700 font-semibold mt-1">
                {stats.pendingOrders} جديد • {stats.processingOrders} مطبخ • {stats.deliveryActive} دليفري
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-black shrink-0">
              ✅
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500">طلبات اكتملت اليوم</p>
              <h3 className="text-3xl font-black text-gray-900 mt-0.5">{stats.completedToday}</h3>
              <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                تسليم ناجح للعملاء
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-black shrink-0">
              💰
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500">إجمالي مبيعات اليوم</p>
              <h3 className="text-2xl font-black text-gray-900 mt-0.5">
                {stats.totalRevenueToday.toLocaleString()} <span className="text-xs font-bold">ج.م</span>
              </h3>
              <p className="text-[11px] text-blue-700 font-semibold mt-1">
                محصل نقدياً واستلام
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-2xl font-black shrink-0">
              🛵
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500">الطيارين في الوردية</p>
              <h3 className="text-3xl font-black text-gray-900 mt-0.5">
                {stats.activeDriversCount} <span className="text-sm text-gray-400 font-bold">/ {stats.totalDriversCount}</span>
              </h3>
              <p className="text-[11px] text-purple-700 font-semibold mt-1">
                طيارين نشطين بالفرع والميدان
              </p>
            </div>
          </div>
        </div>

        {/* Live Activity Feed + Shift Closure Readiness */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Shift Closure Readiness Section (2 Columns on Desktop) */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <span>🛡️ تدقيق جاهزية إغلاق الوردية (Shift Closure Audit)</span>
                  {closureAudit && (
                    <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${
                      closureAudit.canClose
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}>
                      {closureAudit.canClose ? 'جاهز للإغلاق الآن ✅' : 'غير متاح للإغلاق حالياً ⚠️'}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  فحص أوتوماتيكي لقواعد إغلاق اليوم: لا يمكن إنهاء الوردية دون حسم كل الطلبات وتصفية العهد النقدية
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleSendTelegramReport}
                  disabled={isSendingReport}
                  className="bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300 text-xs font-black px-3.5 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="إرسال ملخص الوردية اليومية الحالي إلى تليجرام المالك فوراً"
                >
                  <span>{isSendingReport ? '⏳ جاري الإرسال...' : '📲 إرسال التقرير لتليجرام'}</span>
                </button>
                <button
                  onClick={fetchDashboardData}
                  disabled={isAuditing}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-3 py-2 rounded-xl transition-all cursor-pointer"
                >
                  🔄 إعادة الفحص
                </button>
                <Link
                  href="/shift-control"
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black px-3.5 py-2 rounded-xl shadow-sm transition-all"
                >
                  📋 تصفية الوردية
                </Link>
              </div>
            </div>

            {closureAudit ? (
              closureAudit.canClose ? (
                <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl text-emerald-900 flex items-center gap-4">
                  <span className="text-3xl">🎉</span>
                  <div>
                    <h4 className="font-black text-sm">كافة المعايير مستوفاة بنجاح!</h4>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      لا توجد أي طلبات معلقة بالمطبخ أو رحلات دليفري نشطة. يمكنك التوجه إلى صفحة التحصيل وطباعة التقرير النهائي وإغلاق وردية المطعم بأمان.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl text-rose-900 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⚠️</span>
                    <h4 className="font-black text-sm">
                      لا يمكن إغلاق الوردية حتى معالجة المعوقات التالية:
                    </h4>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-xs font-bold text-rose-800 pr-4">
                    {closureAudit.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )
            ) : (
              <div className="text-center py-6 text-xs text-gray-400 font-bold">جاري تدقيق الشفت...</div>
            )}
          </div>

          {/* Live Telegram & Dashboard Activity Stream (1 Column on Desktop) */}
          <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <span>📡 التنبيهات اللحظية المباشرة</span>
              </h3>
              <span className="text-[10px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full font-bold">
                {liveAlerts.length} حدث مسجل
              </span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {liveAlerts.length === 0 ? (
                <div className="text-center py-10 text-xs text-gray-400 font-bold space-y-1">
                  <div className="text-2xl">⚡</div>
                  <p>في انتظار الأحداث المباشرة...</p>
                  <p className="text-[10px] text-gray-400">أي حركة أو إلغاء ستظهر هنا وتُرسل لتليجرام فوراً</p>
                </div>
              ) : (
                liveAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-2xl border text-xs transition-all ${
                      alert.type === 'urgent'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : alert.type === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : alert.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-blue-50 border-blue-200 text-blue-900'
                    }`}
                  >
                    <div className="flex items-center justify-between font-black">
                      <span>{alert.title}</span>
                      <span className="text-[10px] opacity-75 font-mono">{alert.time}</span>
                    </div>
                    <p className="text-[11px] font-medium mt-1 leading-snug">{alert.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Operations Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Link
            href="/orders"
            className="bg-white p-5 rounded-3xl border border-gray-200 hover:border-amber-500 shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">🥩</span>
              <span className="text-xs font-bold text-amber-700 group-hover:underline">فتح اللوحة ⬅️</span>
            </div>
            <h4 className="font-black text-base text-gray-900 mt-3">لوحة الكاشير المباشرة</h4>
            <p className="text-xs text-gray-500 mt-1">
              متابعة واستقبال طلبات العملاء وتحديث حالات الدفع والاستلام ريل تايم
            </p>
          </Link>

          <Link
            href="/kitchen"
            className="bg-white p-5 rounded-3xl border border-gray-200 hover:border-amber-500 shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">🍳</span>
              <span className="text-xs font-bold text-amber-700 group-hover:underline">فتح الشاشة ⬅️</span>
            </div>
            <h4 className="font-black text-base text-gray-900 mt-3">شاشة تحضير المطبخ</h4>
            <p className="text-xs text-gray-500 mt-1">
              شاشة مخصصة لطاقم الطهي تعرض الأصناف وملاحظات التجهيز بدون أسعار
            </p>
          </Link>

          <Link
            href="/assignments"
            className="bg-white p-5 rounded-3xl border border-gray-200 hover:border-amber-500 shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">📦</span>
              <span className="text-xs font-bold text-amber-700 group-hover:underline">فتح الإسناد ⬅️</span>
            </div>
            <h4 className="font-black text-base text-gray-900 mt-3">إسناد رحلات التوصيل</h4>
            <p className="text-xs text-gray-500 mt-1">
              توزيع الطلبات الجاهزة على طيارين الفرع وتكوين خطوط السير التجميعية
            </p>
          </Link>
        </div>
      </main>
    </div>
  )
}
