'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import OpsNavbar from '@/components/OpsNavbar'

interface PolicyItem {
  key: string
  value: any
  description: string
  updated_at?: string
}

interface PaymentAccounts {
  instapay?: {
    identifier: string
    account_name: string
    note: string
  }
  wallet?: {
    identifier: string
    account_name: string
    note: string
  }
}

export default function SettingsPage() {
  const [policies, setPolicies] = useState<PolicyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Policy States
  const [deliveryFee, setDeliveryFee] = useState<number>(10.0)
  const [maxRadius, setMaxRadius] = useState<number>(13.0)
  const [maxDriverOrders, setMaxDriverOrders] = useState<number>(5)
  const [minOrderAmount, setMinOrderAmount] = useState<number>(80.0)
  const [driverHourlyRate, setDriverHourlyRate] = useState<number>(20.0)

  // Reservation Payment Accounts
  const [instapayId, setInstapayId] = useState<string>('elgzar@instapay')
  const [instapayName, setInstapayName] = useState<string>('Mostafa Elgzar')
  const [instapayNote, setInstapayNote] = useState<string>('تحويل عبر تطبيق إنستاباي لعنوان الدفع اللحظي')

  const [walletId, setWalletId] = useState<string>('01026131499')
  const [walletName, setWalletName] = useState<string>('محفظة كاش')
  const [walletNote, setWalletNote] = useState<string>('فودافون كاش / أورانج كاش / اتصالات كاش / وي باي')

  // Operating Hours summary
  const [scheduleStatus, setScheduleStatus] = useState<{ isOpen: boolean; reason: string } | null>(null)

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const [settingsRes, scheduleRes] = await Promise.all([
        fetch('/api/admin/settings'),
        fetch('/api/admin/schedule'),
      ])

      const settingsData = await settingsRes.json()
      if (settingsRes.ok && settingsData.policies) {
        setPolicies(settingsData.policies)
        for (const p of settingsData.policies) {
          const val = p.value
          if (p.key === 'delivery_fee_per_km') setDeliveryFee(Number(val) || 10.0)
          if (p.key === 'max_delivery_radius_km') setMaxRadius(Number(val) || 13.0)
          if (p.key === 'max_driver_active_orders') setMaxDriverOrders(Number(val) || 5)
          if (p.key === 'min_order_amount') setMinOrderAmount(Number(val) || 80.0)
          if (p.key === 'driver_hourly_rate') setDriverHourlyRate(Number(val) || 20.0)

          if (p.key === 'reservation_payment_accounts' && typeof val === 'object' && val !== null) {
            const accs = val as PaymentAccounts
            if (accs.instapay) {
              setInstapayId(accs.instapay.identifier || '')
              setInstapayName(accs.instapay.account_name || '')
              setInstapayNote(accs.instapay.note || '')
            }
            if (accs.wallet) {
              setWalletId(accs.wallet.identifier || '')
              setWalletName(accs.wallet.account_name || '')
              setWalletNote(accs.wallet.note || '')
            }
          }
        }
      }

      if (scheduleRes.ok) {
        const schedData = await scheduleRes.json()
        if (schedData.status) {
          setScheduleStatus(schedData.status)
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'فشل الاتصال بالخادم لجلب الإعدادات والسياسات' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const savePolicy = async (key: string, value: any, successLabel?: string) => {
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
        setMessage({ type: 'success', text: successLabel || 'تم حفظ التعديل بنجاح ✅' })
      } else {
        setMessage({ type: 'error', text: data.error || 'تعذر حفظ السياسة' })
      }
    } catch {
      setMessage({ type: 'error', text: 'حدث خطأ غير متوقع أثناء حفظ التعديل' })
    } finally {
      setSavingKey(null)
    }
  }

  const saveReservationAccounts = () => {
    const payload: PaymentAccounts = {
      instapay: {
        identifier: instapayId.trim(),
        account_name: instapayName.trim(),
        note: instapayNote.trim(),
      },
      wallet: {
        identifier: walletId.trim(),
        account_name: walletName.trim(),
        note: walletNote.trim(),
      },
    }
    savePolicy('reservation_payment_accounts', payload, 'تم حفظ حسابات دفع عربون الحجز بنجاح ✅')
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col font-sans">
      <OpsNavbar title="مركز السياسات والإعدادات المركزية" subtitle="إدارة قيود التسليم، المحاسبة، حسابات الدفع، وأوقات العمل" />

      <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        {/* Header Hero */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">
                ⚙️
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900">مركز التحكم في سياسات وإعدادات المطعم</h1>
                <p className="text-xs text-gray-500">
                  الإعدادات المحفوظة هنا تُطبق مباشرة وفورياً على محركات الدفع، حسابات الطيارين، وأوامر الـ RPC.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-2xl text-xs font-black">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            صلاحيات إدارة كاملة (Manager / Owner)
          </div>
        </div>

        {/* Feedback Alert */}
        {message && (
          <div
            className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between border shadow-sm ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="font-extrabold text-sm hover:opacity-75">✕</button>
          </div>
        )}

        {loading ? (
          <div className="p-20 text-center text-gray-400 font-bold bg-white rounded-3xl border border-gray-200">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            جاري جلب بيانات السياسات المركزية...
          </div>
        ) : (
          <div className="space-y-8">
            {/* Section 1: Delivery & Fleet Rules */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <span className="text-lg">🛵</span>
                <h2 className="text-base font-black text-gray-900">سياسات التوصيل وأسطول الطيارين</h2>
                <span className="text-xs text-gray-400 font-normal">| Delivery & Fleet Policies</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Delivery Fee Per KM */}
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-gray-900">سعر الكيلومتر للتوصيل</h4>
                    <p className="text-xs text-gray-500">المبلغ المحتسب على كل كيلومتر إضافي للطلبات البعيدة.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={deliveryFee}
                        onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">ج.م/كم</span>
                    </div>
                    <button
                      onClick={() => savePolicy('delivery_fee_per_km', deliveryFee)}
                      disabled={savingKey === 'delivery_fee_per_km'}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      {savingKey === 'delivery_fee_per_km' ? '...' : 'حفظ'}
                    </button>
                  </div>
                </div>

                {/* Max Delivery Radius */}
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-gray-900">أقصى نطاق توصيل مسموح</h4>
                    <p className="text-xs text-gray-500">الحد الأقصى للمسافة المسموح بها لتوصيل الطلبات خارج الفرع.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={maxRadius}
                        onChange={(e) => setMaxRadius(parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">كم</span>
                    </div>
                    <button
                      onClick={() => savePolicy('max_delivery_radius_km', maxRadius)}
                      disabled={savingKey === 'max_delivery_radius_km'}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      {savingKey === 'max_delivery_radius_km' ? '...' : 'حفظ'}
                    </button>
                  </div>
                </div>

                {/* Max Active Orders Per Driver */}
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-gray-900">أقصى حمولة للطيار في الرحلة</h4>
                    <p className="text-xs text-gray-500">الحد الأقصى لعدد طلبات الدليفري المسموح بحملها معاً.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="10"
                        value={maxDriverOrders}
                        onChange={(e) => setMaxDriverOrders(parseInt(e.target.value, 10) || 1)}
                        className="w-full text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">طلبات</span>
                    </div>
                    <button
                      onClick={() => savePolicy('max_driver_active_orders', maxDriverOrders)}
                      disabled={savingKey === 'max_driver_active_orders'}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      {savingKey === 'max_driver_active_orders' ? '...' : 'حفظ'}
                    </button>
                  </div>
                </div>

                {/* Driver Hourly Rate */}
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-gray-900">أجر ساعة عمل الطيار</h4>
                    <p className="text-xs text-gray-500">الأجر المحتسب للطيار عن كل ساعة عمل في ورديته التشغيلية.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={driverHourlyRate}
                        onChange={(e) => setDriverHourlyRate(parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">ج.م/ساعة</span>
                    </div>
                    <button
                      onClick={() => savePolicy('driver_hourly_rate', driverHourlyRate)}
                      disabled={savingKey === 'driver_hourly_rate'}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      {savingKey === 'driver_hourly_rate' ? '...' : 'حفظ'}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Order Limits & Rules */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <span className="text-lg">🛒</span>
                <h2 className="text-base font-black text-gray-900">شروط وحدود الطلبات</h2>
                <span className="text-xs text-gray-400 font-normal">| Order Rules & Limits</span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-black text-sm text-gray-900">الحد الأدنى لقيمة الطلب (Min Order Amount)</h4>
                  <p className="text-xs text-gray-500">أقل قيمة إجمالية مسموح بها لتأكيد طلب العميل عبر الموقع أو الكاشير.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative">
                    <input
                      type="number"
                      step="5"
                      min="0"
                      value={minOrderAmount}
                      onChange={(e) => setMinOrderAmount(parseFloat(e.target.value) || 0)}
                      className="w-36 text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">ج.م</span>
                  </div>
                  <button
                    onClick={() => savePolicy('min_order_amount', minOrderAmount)}
                    disabled={savingKey === 'min_order_amount'}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50"
                  >
                    {savingKey === 'min_order_amount' ? '...' : 'حفظ'}
                  </button>
                </div>
              </div>
            </section>

            {/* Section 3: Reservation & Deposit Payment Accounts */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <span className="text-lg">💳</span>
                <h2 className="text-base font-black text-gray-900">حسابات تحصيل عربون الحجوزات</h2>
                <span className="text-xs text-gray-400 font-normal">| Reservation Deposit Gateways</span>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                <p className="text-xs text-gray-500">
                  تظهر هذه الأرقام للعملاء عند حجز طاولة أو صالة، لتمكينهم من تحويل العربون ورفع إيصال السداد.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* InstaPay */}
                  <div className="space-y-3 p-4 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className="flex items-center gap-2 font-black text-sm text-gray-900">
                      <span className="text-emerald-600 font-black">⚡ إنستاباي (InstaPay IPA)</span>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">عنوان الدفع اللحظي (IPA / Mobile):</label>
                      <input
                        type="text"
                        value={instapayId}
                        onChange={(e) => setInstapayId(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="elgzar@instapay"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">اسم الحساب:</label>
                      <input
                        type="text"
                        value={instapayName}
                        onChange={(e) => setInstapayName(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="Mostafa Elgzar"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">ملاحظة توضيحية للعميل:</label>
                      <input
                        type="text"
                        value={instapayNote}
                        onChange={(e) => setInstapayNote(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="تحويل عبر إنستاباي"
                      />
                    </div>
                  </div>

                  {/* Cash Wallets */}
                  <div className="space-y-3 p-4 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className="flex items-center gap-2 font-black text-sm text-gray-900">
                      <span className="text-rose-600 font-black">📱 محافظ الكاش (Vodafone / Orange / Etisalat / WE)</span>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">رقم المحفظة الإلكترونية:</label>
                      <input
                        type="text"
                        value={walletId}
                        onChange={(e) => setWalletId(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="01026131499"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">اسم صاحب المحفظة:</label>
                      <input
                        type="text"
                        value={walletName}
                        onChange={(e) => setWalletName(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="محفظة كاش"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">ملاحظة توضيحية للعميل:</label>
                      <input
                        type="text"
                        value={walletNote}
                        onChange={(e) => setWalletNote(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="فودافون كاش / اتصالات كاش"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={saveReservationAccounts}
                    disabled={savingKey === 'reservation_payment_accounts'}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-6 py-3 rounded-2xl transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    <span>💾</span>
                    <span>{savingKey === 'reservation_payment_accounts' ? 'جاري الحفظ...' : 'حفظ بيانات حسابات الدفع'}</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Section 4: Operating Hours & Schedule Overview */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <span className="text-lg">🕒</span>
                <h2 className="text-base font-black text-gray-900">مواعيد العمل والإغلاقات الاستثنائية</h2>
                <span className="text-xs text-gray-400 font-normal">| Operating Schedule & Closures</span>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-black text-sm text-gray-900">جدول ساعات العمل الأسبوعية والإجازات</h4>
                    {scheduleStatus && (
                      <span
                        className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                          scheduleStatus.isOpen
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-rose-50 text-rose-700 border-rose-300'
                        }`}
                      >
                        {scheduleStatus.isOpen ? '🟢 المطعم مفتوح حالياً' : '🔴 المطعم مغلق حالياً'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    يمكنك تعديل مواعيد الفتح والإغلاق لكل يوم، وإضافة أيام إغلاق استثنائية أو فترات عمل خاصة للمناسبات.
                  </p>
                </div>
                <Link
                  href="/schedule"
                  className="bg-gray-900 hover:bg-black text-white font-black text-xs px-5 py-3 rounded-2xl transition-all shadow-sm flex items-center gap-2"
                >
                  <span>📅</span>
                  <span>إدارة جدول المواعيد بالكامل</span>
                </Link>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
