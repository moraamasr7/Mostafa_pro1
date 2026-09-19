'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Driver } from '@/types/drivers'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { Badge, BadgeVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { TabNav, TabItem } from '@/components/ui/TabNav'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'

interface DriverExtended extends Driver {
  started_at?: string | null
  current_trip_id?: string | null
  current_trip_number?: number | null
}

interface ActiveTripSnapshot {
  id: string
  trip_number: number
  driver_id: string
  driver_name: string
  status: string
  expected_amount: number
  collected_amount: number
  collection_status?: string
  order_count: number
}

interface DailyShiftContext {
  id: string
  shift_number: number
  opened_by: string
  driverCustodyCash?: number
  fleetAccounting?: {
    driversCount: number
    totalHoursWage: number
    totalDeliveryCommissions: number
    totalDriverAdvances: number
    totalNetPayout: number
    driver_summaries?: Array<{
      driver_id: string
      driver_name: string
      accounting: {
        hours_worked: number
        delivered_orders_count: number
        hours_wage: number
        commission_total: number
        advances_total: number
        gross_entitlement: number
        net_payout: number
        driver_cash_held: number
      }
    }>
  } | null
}

type TabType = 'active' | 'trips' | 'wages' | 'all'

export default function DriversFleetHubPage() {
  // Core Data
  const [drivers, setDrivers] = useState<DriverExtended[]>([])
  const [trips, setTrips] = useState<ActiveTripSnapshot[]>([])
  const [dailyShift, setDailyShift] = useState<DailyShiftContext | null>(null)

  // Status & UI
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null)
  const [openMenuDriverId, setOpenMenuDriverId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Modals
  const [showAddDriverModal, setShowAddDriverModal] = useState(false)
  const [newDriverName, setNewDriverName] = useState('')
  const [newDriverPhone, setNewDriverPhone] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const [selectedDriverForSettlement, setSelectedDriverForSettlement] = useState<DriverExtended | null>(null)
  const [settlementAmount, setSettlementAmount] = useState<number>(0)
  const [isSettling, setIsSettling] = useState(false)

  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const loadFleetData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    try {
      const [driversRes, shiftRes, tripsRes] = await Promise.all([
        fetch('/api/admin/drivers'),
        fetch('/api/admin/daily-shift'),
        fetch('/api/admin/trips'),
      ])

      const [driversData, shiftData, tripsData] = await Promise.all([
        driversRes.json(),
        shiftRes.json(),
        tripsRes.json(),
      ])

      if (driversRes.ok) {
        if (shiftData.hasActiveShift && shiftData.activeShift) {
          setDailyShift(shiftData.activeShift)
        } else {
          setDailyShift(null)
        }

        const rawDrivers: Driver[] = driversData.drivers || []
        const rawTrips: ActiveTripSnapshot[] = tripsData.trips || []
        setTrips(rawTrips)

        const activeTripMap = new Map<string, { tripId: string; tripNumber: number }>()
        for (const t of rawTrips) {
          if (t.status !== 'completed' && t.status !== 'cancelled') {
            activeTripMap.set(t.driver_id, { tripId: t.id, tripNumber: t.trip_number })
          }
        }

        const extended: DriverExtended[] = rawDrivers.map((d) => {
          const tripInfo = activeTripMap.get(d.id)
          return {
            ...d,
            started_at: d.accounting?.started_at || null,
            current_trip_id: tripInfo?.tripId || null,
            current_trip_number: tripInfo?.tripNumber || null,
          }
        })

        setDrivers(extended)
      }
    } catch {
      if (!isBackground) {
        setActionError('تعذر الاتصال بالسيرفر لجلب بيانات الأسطول')
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
      loadFleetData(true)
    }, 300)
  }, [loadFleetData])

  useEffect(() => {
    loadFleetData(false)

    const channel = supabase
      .channel('drivers-fleet-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_shifts' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_trips' }, () => {
        scheduleBackgroundSync()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shifts' }, () => {
        scheduleBackgroundSync()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
    }
  }, [loadFleetData, scheduleBackgroundSync])

  useEffect(() => {
    const handleDocClick = () => setOpenMenuDriverId(null)
    window.addEventListener('click', handleDocClick)
    return () => window.removeEventListener('click', handleDocClick)
  }, [])

  // ==========================================
  // ACTIONS
  // ==========================================
  const handleShiftAction = async (driverId: string, action: 'start' | 'end', allowReopen = false) => {
    setBusyDriverId(driverId)
    setOpenMenuDriverId(null)
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
        loadFleetData(true)
      } else if (res.status === 409 && data.requires_override) {
        if (window.confirm(`⚠️ تنبيه رقابي:
${data.error}

هل أنت متأكد من فتح وردية ثانية استثنائية لهذا الطيار؟`)) {
          await handleShiftAction(driverId, 'start', true)
        }
      } else {
        setActionError(data.error || 'فشل إجراء الوردية')
      }
    } catch {
      setActionError('حدث خطأ في الاتصال بالسيرفر')
    } finally {
      setBusyDriverId(null)
    }
  }

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDriverName.trim() || !newDriverPhone.trim()) return

    setIsAdding(true)
    setActionError(null)

    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDriverName.trim(), phone: newDriverPhone.trim() }),
      })

      const data = await res.json()
      if (res.ok) {
        setNewDriverName('')
        setNewDriverPhone('')
        setShowAddDriverModal(false)
        setActionSuccess('تمت إضافة الطيار بنجاح')
        loadFleetData(true)
      } else {
        setActionError(data.error || 'فشل إضافة الطيار')
      }
    } catch {
      setActionError('تعذر إضافة الطيار')
    } finally {
      setIsAdding(false)
    }
  }

  const driverCustodyMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of trips) {
      if (t.collection_status === 'collected') {
        const curr = map.get(t.driver_id) || 0
        map.set(t.driver_id, curr + Number(t.collected_amount || 0))
      }
    }
    return map
  }, [trips])

  const handleOpenSettlement = (driver: DriverExtended) => {
    const custody = driverCustodyMap.get(driver.id) || 0
    setSelectedDriverForSettlement(driver)
    setSettlementAmount(custody)
    setOpenMenuDriverId(null)
  }

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDriverForSettlement) return

    const targetTrip = trips.find(
      (t) => t.driver_id === selectedDriverForSettlement.id && t.collection_status === 'collected'
    )
    const tripId = selectedDriverForSettlement.current_trip_id || targetTrip?.id || null

    try {
      const res = await fetch('/api/admin/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'settle_to_cashier',
          driver_id: selectedDriverForSettlement.id,
          trip_id: tripId,
          collected_amount: settlementAmount,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setActionSuccess('تمت تسوية عهدة الطيار وتوريدها للخزينة بنجاح')
        setSelectedDriverForSettlement(null)
        loadFleetData(true)
      } else {
        setActionError(data.error || 'فشل تسوية العهدة')
      }
    } catch {
      setActionError('تعذر الاتصال بالسيرفر')
    } finally {
      setIsSettling(false)
    }
  }

  // ==========================================
  // COUNTS & FILTERING
  // ==========================================
  const activeShiftDrivers = drivers.filter((d) => !!d.active_shift_id)
  const activeShiftCount = activeShiftDrivers.length
  const activeTripsList = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
  const activeTripsCount = activeTripsList.length

  const pendingCustodyAmount = dailyShift ? Number(dailyShift.driverCustodyCash || 0) : 0

  const tabs: TabItem[] = [
    { id: 'active', label: 'في الخدمة', count: activeShiftCount, icon: '🟢' },
    { id: 'trips', label: 'الرحلات النشطة', count: activeTripsCount, icon: '🗺️' },
    { id: 'wages', label: 'كشف حساب الوردية', icon: '📋' },
    { id: 'all', label: 'كل الطيارين', count: drivers.length, icon: '👥' },
  ]

  const filteredDrivers = useMemo(() => {
    let list = drivers

    if (activeTab === 'active') {
      list = list.filter((d) => !!d.active_shift_id)
    } else if (activeTab === 'all') {
      list = drivers
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((d) => {
        const name = (d.name || '').toLowerCase()
        const phone = (d.phone || '').toLowerCase()
        return name.includes(q) || phone.includes(q)
      })
    }

    return list
  }, [drivers, activeTab, searchQuery])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none pb-20 md:pb-8">
      {/* Global Header & Shift Bar */}
      <OpsNavbar title="أسطول التوصيل" />
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

        {/* Top Control Bar: Tabs & Add Driver Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 p-3 sm:p-4 rounded-2xl shadow-sm">
          <TabNav
            tabs={tabs}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            className="w-full sm:w-auto overflow-x-auto"
          />

          <Button
            variant="primary"
            size="md"
            icon="➕"
            onClick={() => setShowAddDriverModal(true)}
            className="shrink-0 w-full sm:w-auto"
          >
            إضافة طيار
          </Button>
        </div>

        {/* Search Bar (if not on wages tab) */}
        {activeTab !== 'wages' && activeTab !== 'trips' && (
          <div className="relative">
            <input
              type="text"
              placeholder="🔎 بحث باسم الطيار أو رقم الهاتف..."
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
        )}

        {/* Tab 1 & Tab 4: Drivers Grid */}
        {(activeTab === 'active' || activeTab === 'all') && (
          <div>
            {loading && drivers.length === 0 ? (
              <div className="py-16 text-center text-xs text-zinc-500 animate-pulse">
                جاري تحميل بيانات الأسطول...
              </div>
            ) : filteredDrivers.length === 0 ? (
              <Card variant="flat" className="py-16 text-center text-xs text-zinc-400">
                <span className="text-3xl block mb-2">🛵</span>
                <span className="font-bold text-sm text-zinc-300">لا يوجد طيارون في هذا القسم</span>
                {searchQuery && <p className="text-[11px] text-zinc-500 mt-1">جرب البحث بكلمة أخرى</p>}
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {filteredDrivers.map((driver) => {
                  const hasShift = !!driver.active_shift_id
                  const custody = driverCustodyMap.get(driver.id) || 0
                  const deliveredCount = driver.accounting?.delivered_orders_count || 0
                  const isBusy = busyDriverId === driver.id
                  const isMenuOpen = openMenuDriverId === driver.id

                  return (
                    <Card
                      key={driver.id}
                      variant="default"
                      className="flex flex-col justify-between space-y-3 relative hover:border-zinc-750 transition-all"
                    >
                      {/* Top Row: Driver Name, Phone & Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">🛵</span>
                          <div>
                            <h3 className="font-bold text-xs sm:text-sm text-white">
                              {driver.name}
                            </h3>
                            <a
                              href={`tel:${driver.phone}`}
                              className="text-[11px] font-mono text-zinc-400 hover:text-amber-400 block"
                              dir="ltr"
                            >
                              {driver.phone}
                            </a>
                          </div>
                        </div>

                        <Badge
                          variant={
                            driver.status === 'busy'
                              ? 'processing'
                              : driver.status === 'available'
                              ? 'ready'
                              : 'closed'
                          }
                          dot
                          size="sm"
                        >
                          {driver.status === 'busy'
                            ? `مشوار #${driver.current_trip_number || ''}`
                            : driver.status === 'available'
                            ? 'متاح بالفرع'
                            : 'خارج الدوام'}
                        </Badge>
                      </div>

                      {/* Middle Row: Operational Snapshot */}
                      <div className="grid grid-cols-2 gap-2 bg-zinc-950/60 border border-zinc-800/80 p-2.5 rounded-xl text-[11px]">
                        <div>
                          <span className="text-zinc-500 block">طلبات مسلّمة</span>
                          <span className="font-mono font-bold text-white text-xs">
                            {deliveredCount} طلبات
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">عهدة معلقة</span>
                          <MoneyDisplay
                            amount={custody}
                            size="sm"
                            variant={custody > 0 ? 'amber' : 'white'}
                          />
                        </div>
                      </div>

                      {/* Bottom Row: Primary Single Action + Context Menu */}
                      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/80">
                        {/* Primary Single CTA Button */}
                        {!hasShift ? (
                          <Button
                            variant="success"
                            size="sm"
                            loading={isBusy}
                            onClick={() => handleShiftAction(driver.id, 'start')}
                            className="flex-1"
                          >
                            🟢 بدء الوردية
                          </Button>
                        ) : custody > 0 ? (
                          <Button
                            variant="warning"
                            size="sm"
                            onClick={() => handleOpenSettlement(driver)}
                            className="flex-1"
                          >
                            💵 تسوية العهدة ({custody} ج.م)
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={isBusy}
                            onClick={() => handleShiftAction(driver.id, 'end')}
                            className="flex-1"
                          >
                            🔴 إنهاء الوردية
                          </Button>
                        )}

                        {/* Context Menu Dropdown */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuDriverId(isMenuOpen ? null : driver.id)
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
                              {hasShift && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettlement(driver)}
                                  className="w-full text-right px-2.5 py-1.5 hover:bg-zinc-800 rounded-lg text-amber-300 font-bold cursor-pointer"
                                >
                                  💵 تسوية كاش العهدة
                                </button>
                              )}

                              {hasShift && (
                                <button
                                  type="button"
                                  onClick={() => handleShiftAction(driver.id, 'end')}
                                  className="w-full text-right px-2.5 py-1.5 hover:bg-red-950/60 rounded-lg text-red-400 font-bold cursor-pointer"
                                >
                                  🔴 إنهاء الوردية
                                </button>
                              )}

                              {!hasShift && (
                                <button
                                  type="button"
                                  onClick={() => handleShiftAction(driver.id, 'start')}
                                  className="w-full text-right px-2.5 py-1.5 hover:bg-zinc-800 rounded-lg text-emerald-400 font-bold cursor-pointer"
                                >
                                  🟢 بدء وردية جديدة
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
          </div>
        )}

        {/* Tab 2: Active Trips Stream */}
        {activeTab === 'trips' && (
          <div>
            {activeTripsList.length === 0 ? (
              <Card variant="flat" className="py-16 text-center text-xs text-zinc-400">
                <span className="text-3xl block mb-2">🗺️</span>
                <span className="font-bold text-sm text-zinc-300">لا توجد رحلات نشطة بالميدان حالياً</span>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {activeTripsList.map((trip) => (
                  <Card key={trip.id} variant="default" className="space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-amber-400 text-sm">
                          خط سير #{trip.trip_number}
                        </span>
                        <span className="font-bold text-xs text-white">· {trip.driver_name}</span>
                      </div>
                      <Badge variant="delivery" dot size="sm">
                        قيد التوصيل
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-950/50 p-2.5 rounded-xl">
                      <div>
                        <span className="text-zinc-500 block text-[11px]">عدد الطلبات:</span>
                        <span className="font-bold text-white font-mono">{trip.order_count} طلبات</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[11px]">كاش متوقع:</span>
                        <MoneyDisplay amount={trip.expected_amount} size="sm" variant="amber" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Shift Wages & Entitlements SSoT Table */}
        {activeTab === 'wages' && (
          <Card variant="default" className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-white">كشف حساب وردية الطيارين (SSoT)</h3>
                <p className="text-[11px] text-zinc-400">
                  محسوب آلياً من محرك الحسابات المعتمد مع الوردية اليومية الحالية
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-amber-400">
                إجمالي العهدة المعلقة: {pendingCustodyAmount.toLocaleString()} ج.م
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 font-bold">
                    <th className="py-2 px-3">الطيار</th>
                    <th className="py-2 px-3">ساعات العمل</th>
                    <th className="py-2 px-3">الطلبات</th>
                    <th className="py-2 px-3">أجر الساعات</th>
                    <th className="py-2 px-3">العمولات</th>
                    <th className="py-2 px-3">السلف</th>
                    <th className="py-2 px-3">صافي المستحق</th>
                    <th className="py-2 px-3">العهدة المعلقة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {dailyShift?.fleetAccounting?.driver_summaries &&
                  dailyShift.fleetAccounting.driver_summaries.length > 0 ? (
                    dailyShift.fleetAccounting.driver_summaries.map((summary) => (
                      <tr key={summary.driver_id} className="hover:bg-zinc-900/50">
                        <td className="py-2.5 px-3 font-sans font-bold text-white">
                          {summary.driver_name}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">
                          {summary.accounting.hours_worked.toFixed(1)} س
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">
                          {summary.accounting.delivered_orders_count}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">
                          {summary.accounting.hours_wage.toFixed(2)} ج.م
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">
                          {summary.accounting.commission_total.toFixed(2)} ج.م
                        </td>
                        <td className="py-2.5 px-3 text-red-400">
                          {summary.accounting.advances_total.toFixed(2)} ج.م
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-400">
                          {summary.accounting.net_payout.toFixed(2)} ج.م
                        </td>
                        <td className="py-2.5 px-3 font-bold text-amber-400">
                          {summary.accounting.driver_cash_held.toFixed(2)} ج.م
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-zinc-500 font-sans">
                        لا توجد ورديات طيارين نشطة مسجلة في الوردية الحالية
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>

      {/* Settlement Modal */}
      {selectedDriverForSettlement && (
        <Modal
          isOpen={!!selectedDriverForSettlement}
          onClose={() => setSelectedDriverForSettlement(null)}
          title={`تسوية عهدة كاش: ${selectedDriverForSettlement.name}`}
          icon="💵"
          footer={
            <Button
              variant="success"
              size="md"
              loading={isSettling}
              onClick={handleConfirmSettlement}
            >
              تأكيد استلام الكاش والتوريد للخزينة
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              أدخل المبلغ النقدي المستلم فعلياً من الطيار لتوريده في درج الخزينة وتصفير عهدته المعلقة:
            </p>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                المبلغ المستلم (ج.م):
              </label>
              <input
                type="number"
                step="any"
                value={settlementAmount}
                onChange={(e) => setSettlementAmount(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2 text-sm font-mono font-black text-emerald-400 text-center focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Add Driver Modal */}
      {showAddDriverModal && (
        <Modal
          isOpen={showAddDriverModal}
          onClose={() => setShowAddDriverModal(false)}
          title="إضافة طيار جديد للأسطول"
          icon="🛵"
          footer={
            <Button
              variant="primary"
              size="md"
              loading={isAdding}
              onClick={handleCreateDriver}
              disabled={!newDriverName.trim() || !newDriverPhone.trim()}
            >
              حفظ الطيار
            </Button>
          }
        >
          <form onSubmit={handleCreateDriver} className="space-y-3">
            <Input
              label="اسم الطيار:"
              placeholder="مثال: أحمد محمود"
              value={newDriverName}
              onChange={(e) => setNewDriverName(e.target.value)}
              required
            />
            <Input
              label="رقم الهاتف (11 رقم):"
              placeholder="01xxxxxxxxx"
              value={newDriverPhone}
              onChange={(e) => setNewDriverPhone(e.target.value)}
              required
              dir="ltr"
            />
          </form>
        </Modal>
      )}
    </div>
  )
}
