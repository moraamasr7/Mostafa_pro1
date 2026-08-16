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

// صفحة تتبع الطلب المحمية — تتحدث لحظياً عبر Supabase Realtime
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50 to-orange-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-500 font-medium">جاري تحميل بيانات الطلب...</p>
        </div>
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50 to-orange-50 p-4">
        <div className="text-center bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-lg border border-gray-100 max-w-sm w-full">
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-xl font-extrabold text-gray-900 mb-2">
            الطلب غير متاح
          </h1>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            الرابط غير صحيح أو ليس لديك تصريح لعرض تفاصيل هذا الطلب.
          </p>
          <Link
            href="/"
            className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-6 rounded-xl transition-colors text-sm shadow-md shadow-amber-200"
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
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50/50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5 animate-fade-in-up py-6">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-xl border border-white/60 overflow-hidden">
          <div className="bg-gradient-to-l from-amber-700 to-amber-600 p-6 text-center text-white">
            <span className="bg-amber-500/40 text-amber-100 text-xs font-semibold px-3 py-1 rounded-full border border-amber-300/30">
              طلب استلام من الفرع
            </span>
            <p className="text-amber-100 text-xs font-medium mt-3 mb-0.5">
              رقم الطلب
            </p>
            <p className="text-4xl font-black tabular-nums tracking-wide">
              #{order.order_number}
            </p>
          </div>

          <div className="p-6">
            <div className={`${statusInfo.bgColor} border ${statusInfo.borderColor} rounded-2xl p-5 text-center shadow-sm`}>
              <span className={`text-4xl block mb-2 ${isPulsing ? 'animate-pulse-dot' : ''}`}>
                {statusInfo.icon}
              </span>
              <p className={`font-extrabold text-base ${statusInfo.color}`}>
                {statusInfo.label}
              </p>
            </div>

            {orderItems.length > 0 && (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <h3 className="text-xs font-bold text-gray-400 mb-3">
                  محتويات الطلب:
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pl-1">
                  {orderItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center text-xs bg-gray-50/80 p-2.5 rounded-xl border border-gray-100"
                    >
                      <div>
                        <span className="font-bold text-gray-900">
                          {item.item_variants?.menu_items?.name || 'صنف'}
                        </span>
                        {item.item_variants?.variant_name && item.item_variants.variant_name !== 'افتراضي' && (
                          <span className="text-gray-500 mr-1">
                            ({item.item_variants.variant_name})
                          </span>
                        )}
                        {item.item_notes && (
                          <p className="text-[11px] text-amber-600 mt-0.5">
                            📝 {item.item_notes}
                          </p>
                        )}
                      </div>
                      <div className="text-left font-semibold text-gray-700 tabular-nums">
                        {item.quantity} × {Number(item.unit_price).toFixed(0)} ج.م
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 border-t border-gray-100 pt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500">اسم العميل</span>
                <span className="font-bold text-gray-900">
                  {order.customer_name}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500">وقت الإرسال</span>
                <span className="font-medium text-gray-700 tabular-nums" dir="ltr">
                  {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-t border-gray-100 mt-2">
                <span className="text-gray-700 font-bold">الإجمالي النهائي</span>
                <span className="font-black text-amber-600 text-lg tabular-nums">
                  {Number(order.total_amount).toFixed(0)} ج.م
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">
          ✨ يتحدث وضع الطلب تلقائياً بدون الحاجة لإعادة التحميل
        </p>

        <div className="text-center">
          <Link
            href="/"
            className="text-amber-600 hover:text-amber-700 font-bold text-sm transition-colors"
          >
            ← طلب جديد من المنيو
          </Link>
        </div>
      </div>
    </div>
  )
}
