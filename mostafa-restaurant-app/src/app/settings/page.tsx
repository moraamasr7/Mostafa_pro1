'use client'

import { useEffect, useState } from 'react'
import OpsNavbar from '@/components/OpsNavbar'

interface PolicyItem {
  key: string
  value: any
  description: string
}

export default function SettingsPage() {
  const [policies, setPolicies] = useState<PolicyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [deliveryFee, setDeliveryFee] = useState<number>(5.0)
  const [maxRadius, setMaxRadius] = useState<number>(15.0)
  const [maxDriverOrders, setMaxDriverOrders] = useState<number>(5)
  const [minOrderAmount, setMinOrderAmount] = useState<number>(50.0)

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (res.ok && data.policies) {
        setPolicies(data.policies)
        for (const p of data.policies) {
          const val = typeof p.value === 'string' ? parseFloat(p.value) : p.value
          if (p.key === 'delivery_fee_per_km') setDeliveryFee(val)
          if (p.key === 'max_delivery_radius_km') setMaxRadius(val)
          if (p.key === 'max_driver_active_orders') setMaxDriverOrders(val)
          if (p.key === 'min_order_amount') setMinOrderAmount(val)
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'فشل الاتصال بالخادم لجلب الإعدادات' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const savePolicy = async (key: string, value: any) => {
    setSavingKey(key)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: 'تم حفظ التعديل بنجاح ✅' })
      } else {
        setMessage({ type: 'error', text: data.error || 'تعذر حفظ السياسة' })
      }
    } catch {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء حفظ التعديلات' })
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans">
      <OpsNavbar title="سياسات وإعدادات التشغيل" subtitle="إدارة قيود التسليم، الأسعار، وحمولة الطيارين" />

      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-2">
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <span>⚙️ سياسات تشغيل مطعم مصطفى الجزار</span>
          </h2>
          <p className="text-xs text-gray-500">
            هذه القيم تحكم دوال الـ RPC الخاصة بالتوصيل وتسعير المسافات والحدود التشغيلية بدون أرقام ثابتة في الكود.
          </p>
        </div>

        {message && (
          <div
            className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between border ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="font-extrabold text-sm">✕</button>
          </div>
        )}

        {loading ? (
          <div className="p-16 text-center text-gray-400 font-bold">جاري تحميل السياسات...</div>
        ) : (
          <div className="space-y-4">
            {/* Delivery Fee Per KM */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-gray-900">سعر الكيلومتر للتوصيل (Delivery Fee / KM)</h4>
                <p className="text-xs text-gray-500">المبلغ المحتسب على كل كيلومتر مسافة بين الفرع وعنوان العميل.</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                    className="w-28 text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="absolute left-2 top-2.5 text-[10px] text-gray-400 font-bold">ج.م</span>
                </div>
                <button
                  onClick={() => savePolicy('delivery_fee_per_km', deliveryFee)}
                  disabled={savingKey === 'delivery_fee_per_km'}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm"
                >
                  {savingKey === 'delivery_fee_per_km' ? '...' : 'حفظ'}
                </button>
              </div>
            </div>

            {/* Max Delivery Radius */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-gray-900">أقصى نطاق توصيل (Max Delivery Radius)</h4>
                <p className="text-xs text-gray-500">الحد الأقصى للمسافة المسموح بها لتوصيل الطلبات خارج الفرع.</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={maxRadius}
                    onChange={(e) => setMaxRadius(parseFloat(e.target.value) || 0)}
                    className="w-28 text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="absolute left-2 top-2.5 text-[10px] text-gray-400 font-bold">كم</span>
                </div>
                <button
                  onClick={() => savePolicy('max_delivery_radius_km', maxRadius)}
                  disabled={savingKey === 'max_delivery_radius_km'}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm"
                >
                  {savingKey === 'max_delivery_radius_km' ? '...' : 'حفظ'}
                </button>
              </div>
            </div>

            {/* Max Active Orders Per Driver */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-gray-900">أقصى حمولة للطيار في الرحلة (Max Active Orders)</h4>
                <p className="text-xs text-gray-500">الحد الأقصى لعدد طلبات الدليفري التي يسمح للطيار بحملها في نفس خط السير.</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="10"
                    value={maxDriverOrders}
                    onChange={(e) => setMaxDriverOrders(parseInt(e.target.value, 10) || 1)}
                    className="w-28 text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="absolute left-2 top-2.5 text-[10px] text-gray-400 font-bold">طلب</span>
                </div>
                <button
                  onClick={() => savePolicy('max_driver_active_orders', maxDriverOrders)}
                  disabled={savingKey === 'max_driver_active_orders'}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm"
                >
                  {savingKey === 'max_driver_active_orders' ? '...' : 'حفظ'}
                </button>
              </div>
            </div>

            {/* Min Order Amount */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-gray-900">الحد الأدنى لقيمة الطلب (Min Order Amount)</h4>
                <p className="text-xs text-gray-500">أقل قيمة مسموح بها لتأكيد طلب العميل.</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative">
                  <input
                    type="number"
                    step="5"
                    min="0"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(parseFloat(e.target.value) || 0)}
                    className="w-28 text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="absolute left-2 top-2.5 text-[10px] text-gray-400 font-bold">ج.م</span>
                </div>
                <button
                  onClick={() => savePolicy('min_order_amount', minOrderAmount)}
                  disabled={savingKey === 'min_order_amount'}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm"
                >
                  {savingKey === 'min_order_amount' ? '...' : 'حفظ'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
