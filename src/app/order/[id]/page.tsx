'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// خريطة الحالات بالعربي مع الألوان والأيقونات
const STATUS_MAP: Record<string, { label: string; icon: string; color: string; bgColor: string; pulse: boolean }> = {
  pending: {
    label: 'في انتظار التأكيد',
    icon: '🕐',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50 border-amber-200',
    pulse: true,
  },
  processing: {
    label: 'جاري التحضير',
    icon: '🔥',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
    pulse: true,
  },
  completed: {
    label: 'الطلب جاهز للاستلام',
    icon: '✅',
    color: 'text-green-700',
    bgColor: 'bg-green-50 border-green-200',
    pulse: false,
  },
  cancelled: {
    label: 'تم الإلغاء',
    icon: '❌',
    color: 'text-red-700',
    bgColor: 'bg-red-50 border-red-200',
    pulse: false,
  },
}

interface OrderData {
  id: string
  order_number: number
  status: string
  customer_name: string
  total_amount: number
  created_at: string
}

// صفحة تتبع الطلب — تتحدث لحظياً عبر Supabase Realtime
export default function OrderTrackingPage() {
  const params = useParams()
  const id = params.id as string

  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return

    // جلب بيانات الطلب أول مرة
    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        setNotFound(true)
      } else {
        setOrder(data as OrderData)
      }
      setLoading(false)
    }

    fetchOrder()

    // الاشتراك في التحديثات اللحظية — نتابع فقط هذا الطلب
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          // تحديث الحالة فوراً من غير refresh
          setOrder((prev) =>
            prev ? { ...prev, ...payload.new } as OrderData : prev
          )
        }
      )
      .subscribe()

    // تنظيف الاشتراك لما الصفحة تتقفل
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  // حالة التحميل
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50 to-orange-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-500 font-medium">جاري تحميل الطلب...</p>
        </div>
      </div>
    )
  }

  // الطلب مش موجود
  if (notFound || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50 to-orange-50">
        <div className="text-center bg-white/80 backdrop-blur-sm rounded-3xl p-10 shadow-lg border border-gray-100 max-w-sm mx-4">
          <p className="text-5xl mb-4">😕</p>
          <h1 className="text-xl font-extrabold text-gray-900 mb-2">
            الطلب مش موجود
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            ممكن الرابط غلط أو الطلب اتمسح
          </p>
          <a
            href="/"
            className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-6 rounded-xl transition-colors text-sm"
          >
            الرجوع للمنيو
          </a>
        </div>
      </div>
    )
  }

  const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.pending

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50/50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in-up">
        {/* بطاقة حالة الطلب الرئيسية */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-white/50 overflow-hidden">
          {/* هيدر بدرجات الأمبر */}
          <div className="bg-gradient-to-l from-amber-600 to-amber-500 p-6 text-center text-white">
            <p className="text-amber-100 text-sm font-medium mb-1">
              رقم الطلب
            </p>
            <p className="text-4xl font-extrabold tabular-nums">
              #{order.order_number}
            </p>
          </div>

          {/* حالة الطلب */}
          <div className="p-6">
            <div
              className={`${statusInfo.bgColor} border rounded-2xl p-5 text-center`}
            >
              <span className={`text-4xl block mb-3 ${statusInfo.pulse ? 'animate-pulse-dot' : ''}`}>
                {statusInfo.icon}
              </span>
              <p className={`font-extrabold text-lg ${statusInfo.color}`}>
                {statusInfo.label}
              </p>
            </div>

            {/* تفاصيل إضافية */}
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-500">الاسم</span>
                <span className="font-bold text-gray-900">
                  {order.customer_name}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-500">الإجمالي</span>
                <span className="font-extrabold text-amber-600 text-base tabular-nums">
                  {Number(order.total_amount).toFixed(0)} ج.م
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-500">وقت الطلب</span>
                <span className="font-medium text-gray-700 tabular-nums" dir="ltr">
                  {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* تنبيه Realtime */}
        <p className="text-center text-xs text-gray-400">
          ✨ الحالة بتتحدث تلقائي من غير ما تعمل refresh
        </p>

        {/* رابط الرجوع للمنيو */}
        <div className="text-center">
          <a
            href="/"
            className="text-amber-600 hover:text-amber-700 font-semibold text-sm transition-colors"
          >
            ← الرجوع للمنيو
          </a>
        </div>
      </div>
    </div>
  )
}
