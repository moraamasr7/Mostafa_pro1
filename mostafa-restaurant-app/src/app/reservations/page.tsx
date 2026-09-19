'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Reservation, ReservationStatus } from '@/types/reservations'
import OpsNavbar from '@/components/OpsNavbar'
import GlobalShiftBar from '@/components/GlobalShiftBar'
import { Badge, BadgeVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { TabNav, TabItem } from '@/components/ui/TabNav'
import { Modal } from '@/components/ui/Modal'

const STATUS_CONFIG: Record<ReservationStatus, { label: string; variant: BadgeVariant; icon: string }> = {
  pending: { label: 'في انتظار التأكيد', variant: 'processing', icon: '⏳' },
  confirmed: { label: 'مؤكد ومحجوز', variant: 'delivery', icon: '✅' },
  completed: { label: 'تم الحضور والجلوس', variant: 'ready', icon: '🍽️' },
  cancelled: { label: 'ملغي', variant: 'cancelled', icon: '❌' },
  no_show: { label: 'تخلف عن الحضور', variant: 'danger', icon: '⚠️' },
}

export default function ReservationsManagementPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [showAllDates, setShowAllDates] = useState(false)

  // Action state
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Confirm/Table Assignment Modal
  const [selectedResForTable, setSelectedResForTable] = useState<Reservation | null>(null)
  const [targetTableNumber, setTargetTableNumber] = useState<string>('')
  const [confirmStatusTarget, setConfirmStatusTarget] = useState<ReservationStatus>('confirmed')

  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const fetchReservations = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    try {
      let url = '/api/admin/reservations'
      const params = new URLSearchParams()
      if (!showAllDates && selectedDate) {
        params.append('date', selectedDate)
      }
      if (activeTab !== 'all') {
        params.append('status', activeTab)
      }
      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const res = await fetch(url)
      const data = await res.json()

      if (res.ok) {
        setReservations(data.reservations || [])
      } else {
        if (!isBackground) {
          setActionError(data.error || 'تعذر تحميل قائمة الحجوزات')
        }
      }
    } catch {
      if (!isBackground) {
        setActionError('حدث خطأ في الاتصال بالخادم أثناء جلب الحجوزات')
      }
    } finally {
      if (!isBackground) setLoading(false)
    }
  }, [selectedDate, showAllDates, activeTab])

  const scheduleBackgroundSync = useCallback(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current)
    }
    syncDebounceRef.current = setTimeout(() => {
      fetchReservations(true)
    }, 300)
  }, [fetchReservations])

  useEffect(() => {
    fetchReservations(false)

    const channel = supabase
      .channel('admin-reservations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        scheduleBackgroundSync()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current)
      }
    }
  }, [fetchReservations, scheduleBackgroundSync])

  const handleUpdateStatus = async (
    reservationId: string,
    newStatus: ReservationStatus,
    tableNumber?: string | null
  ) => {
    setUpdatingId(reservationId)
    setActionError(null)
    setActionSuccess(null)

    try {
      const payload: Record<string, any> = {
        id: reservationId,
        status: newStatus,
      }
      if (tableNumber !== undefined) {
        payload.table_number = tableNumber
      }

      const res = await fetch('/api/admin/reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setActionError(data.error || 'فشل تحديث حالة الحجز')
        return
      }

      setActionSuccess(data.message || 'تم تحديث حالة الحجز بنجاح')
      setSelectedResForTable(null)
      fetchReservations(true)
    } catch {
      setActionError('حدث خطأ أثناء الاتصال بالخادم')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleOpenConfirmModal = (res: Reservation, newStatus: ReservationStatus) => {
    setSelectedResForTable(res)
    setTargetTableNumber(res.table_number || '')
    setConfirmStatusTarget(newStatus)
  }

  // Filter reservations by search query
  const filteredReservations = reservations.filter((r) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    return (
      r.customer_name.toLowerCase().includes(q) ||
      r.customer_phone.includes(q) ||
      String(r.reservation_number).includes(q) ||
      (r.table_number && r.table_number.toLowerCase().includes(q))
    )
  })

  // Tab stats
  const pendingCount = reservations.filter((r) => r.status === 'pending').length
  const confirmedCount = reservations.filter((r) => r.status === 'confirmed').length
  const completedCount = reservations.filter((r) => r.status === 'completed').length

  const tabs: TabItem[] = [
    { id: 'all', label: 'جميع الحجوزات', count: reservations.length, icon: '📋' },
    { id: 'pending', label: 'في الانتظار', count: pendingCount, icon: '⏳' },
    { id: 'confirmed', label: 'المؤكدة', count: confirmedCount, icon: '✅' },
    { id: 'completed', label: 'المكتملة', count: completedCount, icon: '🍽️' },
    { id: 'cancelled', label: 'الملغاة', icon: '❌' },
    { id: 'no_show', label: 'لم يحضر', icon: '⚠️' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      <OpsNavbar title="إدارة الصالة والحجوزات" subtitle="متابعة الحجوزات وتسكين الطاولات" />
      <GlobalShiftBar />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 w-full space-y-4 sm:space-y-6">
        {/* Top Header & Date Control */}
        <div className="bg-zinc-900/90 border border-zinc-800 p-3.5 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
          <div>
            <h1 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <span>🍽️</span>
              <span>سجل حجوزات الصالة والضيوف</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              متابعة مباشرة للحجوزات اليومية، تأكيد الحضور، وتسكين الطاولات
            </p>
          </div>

          {/* Date Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-700/80 px-3 py-1.5 rounded-xl">
              <span className="text-xs text-zinc-400">📅 التاريخ:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value)
                  setShowAllDates(false)
                }}
                disabled={showAllDates}
                className="bg-transparent text-xs font-mono font-bold text-amber-400 focus:outline-none disabled:opacity-50"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAllDates(!showAllDates)
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                showAllDates
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {showAllDates ? 'عرض اليوم المختار' : 'عرض كافة التواريخ 🌐'}
            </button>

            <button
              type="button"
              onClick={() => fetchReservations(false)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-colors"
              title="تحديث البيانات"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Alerts */}
        {actionError && (
          <div className="bg-red-950/80 border border-red-700 text-red-200 p-3 rounded-2xl text-xs font-bold flex items-center justify-between animate-fadeIn">
            <span>⚠️ {actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-red-400 font-bold px-2"
            >
              ✕
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="bg-emerald-950/80 border border-emerald-700 text-emerald-200 p-3 rounded-2xl text-xs font-bold flex items-center justify-between animate-fadeIn">
            <span>✓ {actionSuccess}</span>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="text-emerald-400 font-bold px-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
          <Card variant="default" className="p-3 sm:p-4 text-center">
            <span className="text-[11px] text-zinc-400 block mb-1">إجمالي الحجوزات</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-white">
              {reservations.length}
            </span>
          </Card>
          <Card variant="default" className="p-3 sm:p-4 text-center border-amber-500/30">
            <span className="text-[11px] text-amber-400 block mb-1">قيد الانتظار ⏳</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-amber-400">
              {pendingCount}
            </span>
          </Card>
          <Card variant="default" className="p-3 sm:p-4 text-center border-blue-500/30">
            <span className="text-[11px] text-blue-400 block mb-1">المؤكدة ✅</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-blue-400">
              {confirmedCount}
            </span>
          </Card>
          <Card variant="default" className="p-3 sm:p-4 text-center border-emerald-500/30">
            <span className="text-[11px] text-emerald-400 block mb-1">المكتملة والحاضرة 🍽️</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-emerald-400">
              {completedCount}
            </span>
          </Card>
        </div>

        {/* Tabs & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <TabNav tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id)} />

          <div className="w-full md:w-64">
            <input
              type="text"
              placeholder="🔍 بحث بالاسم، الهاتف، أو رقم الطاولة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Reservations List */}
        {loading && reservations.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-500 animate-pulse">
            جاري تحميل سجل الحجوزات...
          </div>
        ) : filteredReservations.length === 0 ? (
          <Card variant="flat" className="py-16 text-center text-xs text-zinc-400">
            <span className="text-3xl block mb-2">🍽️</span>
            <span className="font-bold text-sm text-zinc-300">لا توجد حجوزات مطابقة في هذا القسم</span>
            {searchQuery && <p className="text-[11px] text-zinc-500 mt-1">جرب البحث بكلمات أخرى</p>}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredReservations.map((res) => {
              const statusCfg = STATUS_CONFIG[res.status] || {
                label: res.status,
                variant: 'neutral',
                icon: '•',
              }
              const isUpdating = updatingId === res.id

              return (
                <Card
                  key={res.id}
                  variant="default"
                  className="flex flex-col justify-between space-y-3 relative hover:border-zinc-700 transition-all p-4"
                >
                  {/* Top Header: Reservation #, Guest Name, Phone */}
                  <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-amber-400 text-sm">
                          #RES-{res.reservation_number}
                        </span>
                        <Badge variant={statusCfg.variant} size="sm" dot>
                          {statusCfg.label}
                        </Badge>
                      </div>
                      <h3 className="font-black text-sm text-white mt-1">{res.customer_name}</h3>
                      <a
                        href={`tel:${res.customer_phone}`}
                        className="text-xs font-mono text-zinc-400 hover:text-amber-400 block mt-0.5"
                        dir="ltr"
                      >
                        {res.customer_phone}
                      </a>
                    </div>

                    {/* Table Number Badge */}
                    <div className="text-left shrink-0">
                      {res.table_number ? (
                        <span className="inline-block bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono font-black text-xs px-2.5 py-1 rounded-xl">
                          طاولة: {res.table_number}
                        </span>
                      ) : (
                        <span className="inline-block bg-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded-lg">
                          بدون طاولة
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Booking Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/60 font-mono">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">📅 التاريخ</span>
                      <span className="text-zinc-200 font-bold">{res.reservation_date}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">⏰ الموعد</span>
                      <span className="text-zinc-200 font-bold">
                        {res.reservation_time ? res.reservation_time.slice(0, 5) : '--:--'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">👥 عدد الأفراد</span>
                      <span className="text-amber-400 font-bold">{res.guest_count} أفراد</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">💵 العربون المسجل</span>
                      <span className="text-emerald-400 font-bold">
                        {res.deposit_amount ? `${res.deposit_amount} ج.م` : 'بدون عربون'}
                      </span>
                    </div>
                  </div>

                  {/* Notes / Deposit Receipt */}
                  {res.notes && (
                    <div className="text-[11px] text-zinc-300 bg-zinc-900 p-2 rounded-xl border border-zinc-800">
                      <span className="text-zinc-500 font-bold block text-[10px] mb-0.5">ملاحظات:</span>
                      {res.notes}
                    </div>
                  )}

                  {res.deposit_receipt_url && (
                    <div className="pt-1">
                      <a
                        href={res.deposit_receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                      >
                        <span>🧾</span> عرض إيصال العربون المرفق
                      </a>
                    </div>
                  )}

                  {/* Actions according to Current State */}
                  <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center gap-2">
                    {/* State: Pending */}
                    {res.status === 'pending' && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => handleOpenConfirmModal(res, 'confirmed')}
                          className="flex-1"
                        >
                          تأكيد وتسكين طاولة ✅
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(res.id, 'cancelled')}
                        >
                          إلغاء ❌
                        </Button>
                      </>
                    )}

                    {/* State: Confirmed */}
                    {res.status === 'confirmed' && (
                      <>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(res.id, 'completed')}
                          className="flex-1"
                        >
                          حضور وجلوس 🍽️
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => handleOpenConfirmModal(res, 'confirmed')}
                        >
                          تعديل الطاولة ✏️
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(res.id, 'no_show')}
                        >
                          لم يحضر ⚠️
                        </Button>
                      </>
                    )}

                    {/* Terminal States */}
                    {['completed', 'cancelled', 'no_show'].includes(res.status) && (
                      <div className="w-full text-center py-1 text-[11px] text-zinc-500 font-mono">
                        الحالة نهائية ({statusCfg.label})
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      {/* Confirm / Assign Table Modal */}
      <Modal
        isOpen={!!selectedResForTable}
        onClose={() => setSelectedResForTable(null)}
        title={
          confirmStatusTarget === 'confirmed'
            ? 'تأكيد الحجز وتسكين الطاولة'
            : 'تخصيص رقم الطاولة'
        }
      >
        {selectedResForTable && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleUpdateStatus(
                selectedResForTable.id,
                confirmStatusTarget,
                targetTableNumber.trim() || null
              )
            }}
            className="space-y-4 text-right"
          >
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-xs space-y-1">
              <p className="font-bold text-white">
                حجز رقم: <span className="font-mono text-amber-400">#RES-{selectedResForTable.reservation_number}</span>
              </p>
              <p className="text-zinc-300">العميل: {selectedResForTable.customer_name}</p>
              <p className="text-zinc-400 font-mono">
                الموعد: {selectedResForTable.reservation_date} الساعة {selectedResForTable.reservation_time?.slice(0, 5)} ({selectedResForTable.guest_count} أفراد)
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                رقم / اسم الطاولة (Logical Table Number):
              </label>
              <input
                type="text"
                placeholder="مثال: T-01 أو طاولة 5 أو VIP-1"
                value={targetTableNumber}
                onChange={(e) => setTargetTableNumber(e.target.value)}
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-500 text-right"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                يمكن إدخال نص أو رقم لتوجيه الويتر والعميل داخل الصالة
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!!updatingId}
                className="flex-1"
              >
                {updatingId ? 'جاري الحفظ...' : 'تأكيد وحفظ الطاولة ✅'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={!!updatingId}
                onClick={() => setSelectedResForTable(null)}
              >
                إلغاء
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
