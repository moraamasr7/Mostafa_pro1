'use client'

import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { OrderStatus, STATUS_UI_CONFIG } from '@/types/orders'

interface OrderData {
  id: string
  order_number: number
  status: OrderStatus
  customer_name: string
  total_amount: number
  created_at: string
}

interface OrderItemDetail {
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

export default function OrderTrackingPage() {
  const params = useParams()
  const searchParams = useSearchParams()

  const id = params.id as string
  const token = searchParams.get('token')

  const [order, setOrder] = useState<OrderData | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItemDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return

    const fetchOrderData = async () => {
      let query = supabase.from('orders').select('id, order_number, status, customer_name, total_amount, created_at').eq('id', id)

      if (token) {
        query = query.eq('tracking_token', token)
      }

      const { data, error } = await query.single()

      if (error || !data) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setOrder(data as unknown as OrderData)

      const { data: itemsData } = await supabase
        .from('order_items')
        .select(`
          id,
          quantity,
          unit_price,
          subtotal,
          item_notes,
          item_variants (
            variant_name,
            menu_items (
              name
            )
          )
        `)
        .eq('order_id', id)

      if (itemsData) {
        setOrderItems(itemsData as unknown as OrderItemDetail[])
      }

      setLoading(false)
    }

    fetchOrderData()

    const channel = supabase
      .channel(`order-status-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (payload.new && payload.new.status) {
            setOrder((prev) => (prev ? { ...prev, status: payload.new.status as OrderStatus } : prev))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950 text-slate-100">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 font-bold text-sm">جاري تحميل بيانات الطلب...</p>
        </div>
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950 p-4 text-slate-100">
        <div className="text-center glass-card rounded-3xl p-8 max-w-sm w-full border border-white/10 space-y-4">
          <span className="text-5xl block">🔒</span>
          <h1 className="text-xl font-black text-white">
            الطلب غير متاح
          </h1>
          <p className="text-slate-400 text-xs leading-relaxed">
            الرابط غير صحيح أو ليس لديك تصريح لعرض تفاصيل هذا الطلب.
          </p>
          <Link
            href="/"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-extrabold py-3 px-6 rounded-2xl transition-all text-xs shadow-md shadow-amber-500/20"
          >
            الرجوع للمنيو الرئيسي
          </Link>
        </div>
      </div>
    )
  }

  const statusInfo = STATUS_UI_CONFIG[order.status] || STATUS_UI_CONFIG.pending
  const isPulsing = order.status === 'pending' || order.status === 'processing' || order.status === 'out_for_delivery'

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 animate-fade-in-up py-6">
        <div className="glass-card rounded-3xl overflow-hidden border border-white/10">
          <div className="bg-gradient-to-l from-amber-600 to-orange-600 p-6 text-center text-white">
            <span className="bg-white/20 text-white text-[11px] font-black px-3 py-1 rounded-full border border-white/20">
              متابعة حالة الطلب المباشرة
            </span>
            <p className="text-amber-100 text-xs font-bold mt-3 mb-0.5">
              رقم الطلب
            </p>
            <p className="text-4xl font-black tabular-nums tracking-wide">
              #{order.order_number}
            </p>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            <div className="bg-dark-950/80 border border-white/10 rounded-2xl p-5 text-center shadow-inner">
              <span className={`text-4xl block mb-2 ${isPulsing ? 'animate-pulse' : ''}`}>
                {statusInfo.icon}
              </span>
              <p className={`font-black text-base ${statusInfo.color}`}>
                {statusInfo.label}
              </p>
            </div>

            {orderItems.length > 0 && (
              <div className="border-t border-white/[0.08] pt-4">
                <h3 className="text-xs font-black text-slate-400 mb-3 uppercase tracking-wider">
                  محتويات الطلب:
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pl-1">
                  {orderItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center text-xs bg-dark-800/50 p-2.5 rounded-xl border border-white/[0.06]"
                    >
                      <div>
                        <span className="font-bold text-white">
                          {item.item_variants?.menu_items?.name || 'صنف'}
                        </span>
                        {item.item_variants?.variant_name && item.item_variants.variant_name !== 'افتراضي' && (
                          <span className="text-slate-400 mr-1 text-[11px]">
                            ({item.item_variants.variant_name})
                          </span>
                        )}
                        {item.item_notes && (
                          <p className="text-[11px] text-amber-400 mt-0.5">
                            📝 {item.item_notes}
                          </p>
                        )}
                      </div>
                      <div className="text-left font-bold text-slate-300 tabular-nums">
                        {item.quantity} × {Number(item.unit_price).toFixed(0)} ج.م
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-white/[0.08] pt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-bold">اسم العميل</span>
                <span className="font-bold text-white">
                  {order.customer_name}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-bold">وقت الإرسال</span>
                <span className="font-bold text-slate-300 tabular-nums" dir="ltr">
                  {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-t border-white/[0.08] mt-2">
                <span className="text-slate-300 font-bold">الإجمالي النهائي</span>
                <span className="font-black text-amber-400 text-lg tabular-nums">
                  {Number(order.total_amount).toFixed(0)} ج.م
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 font-medium">
          ✨ يتحدث وضع الطلب تلقائياً عبر Supabase Realtime
        </p>

        <div className="text-center">
          <Link
            href="/"
            className="text-amber-400 hover:text-amber-300 font-extrabold text-xs transition-colors"
          >
            ← العودة للمنيو الرئيسي
          </Link>
        </div>
      </div>
    </div>
  )
}
