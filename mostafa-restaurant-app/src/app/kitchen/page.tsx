'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import OpsNavbar from '@/components/OpsNavbar'

interface KitchenOrderItem {
  id: string
  quantity: number
  item_notes?: string
  item_variants?: {
    variant_name: string
    menu_items?: {
      name: string
    }
  }
}

interface KitchenOrder {
  id: string
  order_number: number
  order_type: 'takeaway' | 'delivery' | 'dine_in'
  status: string
  notes?: string
  created_at: string
  order_items?: KitchenOrderItem[]
}

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchProcessingOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/orders?status=processing')
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders || [])
      } else {
        setActionError('تعذر تحميل طلبات المطبخ')
      }
    } catch {
      setActionError('خطأ في الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProcessingOrders()

    const handleOnline = () => {
      fetchProcessingOrders()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
    }

    const channel = supabase
      .channel('kitchen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchProcessingOrders()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
      }
    }
  }, [])

  const markReady = async (orderId: string) => {
    setUpdatingId(orderId)
    setActionError(null)
    try {
      const res = await fetch('/api/admin/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          expected_status: 'processing',
          new_status: 'ready',
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'فشل تحديث حالة الطلب إلى جاهز')
      } else {
        setOrders((prev) => prev.filter((o) => o.id !== orderId))
      }
    } catch {
      setActionError('حدث خطأ أثناء الاتصال بالخادم')
    } finally {
      setUpdatingId(null)
    }
  }

  const getOrderTypeBadge = (type: string) => {
    switch (type) {
      case 'delivery':
        return <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-black">🛵 دليفري</span>
      case 'takeaway':
        return <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-black">🥡 استلام من الفرع</span>
      case 'dine_in':
        return <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-black">🍽️ صالة</span>
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      <OpsNavbar title="شاشة المطبخ والتحضير" subtitle="عرض طلبات قيد التجهيز فقط — مخصصة للطهي" />

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <div className="flex items-center gap-3">
            <span className="flex h-4 w-4 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
            </span>
            <h2 className="text-xl font-black text-white">الطلبات الجاري تحضيرها الآن</h2>
            <span className="bg-amber-500/20 text-amber-300 font-extrabold px-3 py-0.5 rounded-full text-sm border border-amber-500/30">
              {orders.length} طلب
            </span>
          </div>

          <button
            onClick={fetchProcessingOrders}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold px-4 py-2 rounded-xl transition-all"
          >
            🔄 تحديث
          </button>
        </div>

        {actionError && (
          <div className="bg-red-950/80 border border-red-800 text-red-200 p-4 rounded-2xl flex items-center justify-between text-sm font-bold">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 font-extrabold">✕</button>
          </div>
        )}

        {loading ? (
          <div className="p-16 text-center text-zinc-400">جاري تحميل الطلبات...</div>
        ) : orders.length === 0 ? (
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-16 text-center space-y-3">
            <div className="text-5xl">✨</div>
            <h3 className="text-xl font-bold text-zinc-300">لا توجد طلبات قيد التحضير حالياً</h3>
            <p className="text-zinc-500 text-sm">المطبخ منتهي من كافة الطلبات المعلقة!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map((order) => {
              const elapsedMinutes = Math.floor(
                (Date.now() - new Date(order.created_at).getTime()) / 60000
              )

              return (
                <div
                  key={order.id}
                  className="bg-zinc-900 border-2 border-amber-600/40 rounded-3xl p-5 shadow-2xl flex flex-col justify-between space-y-4 hover:border-amber-500 transition-all"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-black text-amber-400">
                          #{order.order_number}
                        </span>
                        {getOrderTypeBadge(order.order_type)}
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                        elapsedMinutes > 20 ? 'bg-red-900/60 text-red-300 border border-red-700' : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        ⏱️ منذ {elapsedMinutes} دقيقة
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {order.order_items && order.order_items.length > 0 ? (
                        order.order_items.map((item) => (
                          <div
                            key={item.id}
                            className="bg-zinc-950/80 border border-zinc-800/80 p-3 rounded-2xl flex items-start gap-3"
                          >
                            <span className="bg-amber-500 text-zinc-950 font-black text-lg px-2.5 py-1 rounded-xl shrink-0">
                              {item.quantity}×
                            </span>
                            <div className="flex-1">
                              <h4 className="text-base font-black text-white">
                                {item.item_variants?.menu_items?.name || 'صنف'}
                              </h4>
                              {item.item_variants?.variant_name && (
                                <p className="text-xs font-bold text-amber-300/90">
                                  {item.item_variants.variant_name}
                                </p>
                              )}
                              {item.item_notes && (
                                <p className="text-xs text-yellow-300 bg-yellow-950/40 border border-yellow-800/40 px-2 py-1 rounded-lg mt-1 font-bold">
                                  ⚠️ ملاحظة: {item.item_notes}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-zinc-500">لا توجد أصناف مسجلة</p>
                      )}
                    </div>

                    {order.notes && (
                      <div className="bg-amber-950/30 border border-amber-900/50 p-2.5 rounded-xl text-xs text-amber-200">
                        <span className="font-bold">ملاحظات الطلب: </span>
                        {order.notes}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => markReady(order.id)}
                    disabled={updatingId === order.id}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-base py-4 rounded-2xl shadow-lg shadow-emerald-950 transition-all flex items-center justify-center gap-2"
                  >
                    {updatingId === order.id ? (
                      'جاري التحويل...'
                    ) : (
                      <>
                        <span>✅ تم التحضير — جاهز الآن</span>
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
