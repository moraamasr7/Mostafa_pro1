'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import OpsNavbar from '@/components/OpsNavbar'
import Link from 'next/link'

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

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchDashboardData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        fetchDashboardData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans">
      <OpsNavbar title="لوحة التحكم والعمليات" subtitle="نظرة شاملة لمؤشرات المطعم وفحص جاهزية إغلاق الوردية" />

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
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

        {/* Shift Closure Readiness Section */}
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-5">
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

            <div className="flex items-center gap-3">
              <button
                onClick={fetchDashboardData}
                disabled={isAuditing}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-4 py-2 rounded-xl transition-all"
              >
                🔄 إعادة الفحص
              </button>
              <Link
                href="/shift-control"
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black px-4 py-2 rounded-xl shadow-sm transition-all"
              >
                📋 الانتقال للتحصيل المالي وإغلاق الوردية
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
