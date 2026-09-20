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

interface StaffProfile {
  id: string
  full_name: string
  role: string
}

export interface DeliveryZone {
  id: string
  name: string
  min_fee: number
  max_fee: number
  is_active: boolean
  sort_order: number
  areas: string[]
}

const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: 'zone_matariya',
    name: 'المطرية وضواحيها',
    min_fee: 20,
    max_fee: 30,
    is_active: true,
    sort_order: 1,
    areas: [
      'المطرية',
      'ميدان المطرية',
      'شارع التروللي',
      'شارع المطراوي',
      'النعام',
      'شجرة مريم',
      'العزب',
      'عرب الحصن',
      'مسطرد (القطاع القريب)'
    ]
  },
  {
    id: 'zone_amireya',
    name: 'الأميرية وضواحيها',
    min_fee: 30,
    max_fee: 35,
    is_active: true,
    sort_order: 2,
    areas: [
      'الأميرية',
      'ميدان السواح',
      'شارع بورسعيد (الأميرية)',
      'مساكن الأميرية',
      'الزيتون الغربية',
      'سراي القبة'
    ]
  },
  {
    id: 'zone_hadaeq',
    name: 'الحدائق وضواحيها',
    min_fee: 45,
    max_fee: 55,
    is_active: true,
    sort_order: 3,
    areas: [
      'حدائق القبة',
      'دير الملاك',
      'حمامات القبة',
      'كوبري القبة',
      'الوايلي',
      'منشية الصدر',
      'الزاوية الحمراء'
    ]
  },
  {
    id: 'zone_shoubra_kheima',
    name: 'شبرا الخيمة وضواحيها',
    min_fee: 50,
    max_fee: 60,
    is_active: true,
    sort_order: 4,
    areas: [
      'شبرا الخيمة',
      'بهتيم',
      'الشارع الجديد',
      'مسطرد',
      'بيجام',
      'منطى',
      'عزبة رستم',
      'الوحدة العربية'
    ]
  },
  {
    id: 'zone_heliopolis',
    name: 'مصر الجديدة وضواحيها',
    min_fee: 50,
    max_fee: 60,
    is_active: true,
    sort_order: 5,
    areas: [
      'مصر الجديدة',
      'ميدان روكسي',
      'الكوربة',
      'ميدان تريامف',
      'ميدان الحجاز',
      'ميدان المحكمة',
      'أرض الجولف',
      'سانت فاتيما',
      'شيراتون المطار'
    ]
  },
  {
    id: 'zone_nasr_city',
    name: 'مدينة نصر وضواحيها',
    min_fee: 70,
    max_fee: 80,
    is_active: true,
    sort_order: 6,
    areas: [
      'مدينة نصر',
      'الحي السابع',
      'الحي السادس',
      'الحي الثامن',
      'حي الواحة',
      'عباس العقاد',
      'مكرم عبيد',
      'مصطفى النحاس',
      'الطيران',
      'زهراء مدينة نصر'
    ]
  }
]

export default function SettingsPage() {
  const [policies, setPolicies] = useState<PolicyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Policy States
  const [deliveryFee, setDeliveryFee] = useState<number>(8.0)
  const [minDeliveryFee, setMinDeliveryFee] = useState<number>(15.0)
  const [maxRadius, setMaxRadius] = useState<number>(13.0)
  const [maxDriverOrders, setMaxDriverOrders] = useState<number>(5)
  const [minOrderAmount, setMinOrderAmount] = useState<number>(80.0)
  const [driverHourlyRate, setDriverHourlyRate] = useState<number>(20.0)
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(DEFAULT_DELIVERY_ZONES)

  // Zone Editing State
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null)
  const [isNewZoneModalOpen, setIsNewZoneModalOpen] = useState<boolean>(false)
  const [newAreaTagInput, setNewAreaTagInput] = useState<string>('')

  // Reservation Payment Accounts
  const [instapayId, setInstapayId] = useState<string>('elgzar@instapay')
  const [instapayName, setInstapayName] = useState<string>('Mostafa Elgzar')
  const [instapayNote, setInstapayNote] = useState<string>('تحويل عبر تطبيق إنستاباي لعنوان الدفع اللحظي')

  const [walletId, setWalletId] = useState<string>('01026131499')
  const [walletName, setWalletName] = useState<string>('محفظة كاش')
  const [walletNote, setWalletNote] = useState<string>('فودافون كاش / أورانج كاش / اتصالات كاش / وي باي')

  // Operating Hours summary
  const [scheduleStatus, setScheduleStatus] = useState<{ isOpen: boolean; reason: string } | null>(null)

  // Staff PIN Management
  const [staffList, setStaffList] = useState<StaffProfile[]>([])
  const [pinTargetStaffId, setPinTargetStaffId] = useState<string>('')
  const [newPinValue, setNewPinValue] = useState<string>('')
  const [isUpdatingPin, setIsUpdatingPin] = useState(false)

  const fetchSettings = async () => {
    setLoading(true)
    setAccessDenied(null)
    try {
      const [settingsRes, scheduleRes, staffRes] = await Promise.all([
        fetch('/api/admin/settings'),
        fetch('/api/admin/schedule'),
        fetch('/api/admin/staff'),
      ])

      if (settingsRes.status === 403) {
        setAccessDenied('غير مصرح بالوصول: صفحة إعدادات وسياسات المطعم مقتصرة حصرياً على مالك المطعم (Owner Only).')
        setLoading(false)
        return
      }

      const settingsData = await settingsRes.json()
      if (settingsRes.ok && settingsData.policies) {
        setPolicies(settingsData.policies)
        for (const p of settingsData.policies) {
          const val = p.value
          if (p.key === 'delivery_fee_per_km') setDeliveryFee(Number(val) || 8.0)
          if (p.key === 'min_delivery_fee') setMinDeliveryFee(Number(val) || 15.0)
          if (p.key === 'max_delivery_radius_km') setMaxRadius(Number(val) || 13.0)
          if (p.key === 'max_driver_active_orders') setMaxDriverOrders(Number(val) || 5)
          if (p.key === 'min_order_amount') setMinOrderAmount(Number(val) || 80.0)
          if (p.key === 'driver_hourly_rate') setDriverHourlyRate(Number(val) || 20.0)
          if (p.key === 'delivery_zones' && Array.isArray(val) && val.length > 0) {
            setDeliveryZones(val)
          }

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

      if (staffRes.ok) {
        const sData = await staffRes.json()
        if (sData.staff && Array.isArray(sData.staff)) {
          setStaffList(sData.staff)
          if (sData.staff.length > 0 && !pinTargetStaffId) {
            setPinTargetStaffId(sData.staff[0].id)
          }
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

  const handleToggleZoneActive = (zoneId: string) => {
    const updated = deliveryZones.map((z) => (z.id === zoneId ? { ...z, is_active: !z.is_active } : z))
    setDeliveryZones(updated)
    savePolicy('delivery_zones', updated, 'تم تحديث حالة تفعيل المنطقة بنجاح ✅')
  }

  const handleDeleteZone = (zoneId: string) => {
    if (deliveryZones.length <= 1) {
      setMessage({ type: 'error', text: 'لا يمكن حذف جميع مناطق التوصيل' })
      return
    }
    const updated = deliveryZones.filter((z) => z.id !== zoneId)
    setDeliveryZones(updated)
    savePolicy('delivery_zones', updated, 'تم حذف المنطقة بنجاح ✅')
  }

  const handleSaveEditedZone = (zoneToSave: DeliveryZone) => {
    if (!zoneToSave.id.trim() || !zoneToSave.name.trim()) {
      setMessage({ type: 'error', text: 'يرجى إدخال معرف واسم المنطقة' })
      return
    }
    if (zoneToSave.min_fee < 0 || zoneToSave.max_fee < zoneToSave.min_fee) {
      setMessage({ type: 'error', text: 'نطاق السعر غير صالح (يجب أن يكون الحد الأقصى أكبر من أو يساوي الحد الأدنى)' })
      return
    }
    if (zoneToSave.areas.length === 0) {
      setMessage({ type: 'error', text: 'يجب إضافة حي فرعي واحد على الأقل للمنطقة' })
      return
    }

    const isNew = !deliveryZones.some((z) => z.id === zoneToSave.id)
    let updated: DeliveryZone[]
    if (isNew) {
      updated = [...deliveryZones, zoneToSave].sort((a, b) => a.sort_order - b.sort_order)
    } else {
      updated = deliveryZones.map((z) => (z.id === zoneToSave.id ? zoneToSave : z)).sort((a, b) => a.sort_order - b.sort_order)
    }

    setDeliveryZones(updated)
    setEditingZone(null)
    setIsNewZoneModalOpen(false)
    savePolicy('delivery_zones', updated, 'تم حفظ المنطقة وتحديث السياسات بنجاح ✅')
  }

  const handleResetDefaultZones = () => {
    if (window.confirm('هل أنت متأكد من استعادة قائمة مناطق التوصيل الافتراضية؟ سيتم استبدال التعديلات الحالية.')) {
      setDeliveryZones(DEFAULT_DELIVERY_ZONES)
      savePolicy('delivery_zones', DEFAULT_DELIVERY_ZONES, 'تمت استعادة المناطق الافتراضية بنجاح ✅')
    }
  }

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinTargetStaffId) {
      setMessage({ type: 'error', text: 'يرجى اختيار الموظف أولاً' })
      return
    }
    if (!newPinValue.trim() || newPinValue.trim().length < 4) {
      setMessage({ type: 'error', text: 'رمز الـ PIN يجب ألا يقل عن 4 أرقام' })
      return
    }

    setIsUpdatingPin(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/staff/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: pinTargetStaffId,
          new_pin: newPinValue.trim(),
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `${data.message} (تم إرسال إشعار الأمان إلى Telegram 🔔)` })
        setNewPinValue('')
      } else {
        setMessage({ type: 'error', text: data.error || 'فشل تغيير رمز الدخول' })
      }
    } catch {
      setMessage({ type: 'error', text: 'تعذر الاتصال بالخادم لتحديث الـ PIN' })
    } finally {
      setIsUpdatingPin(false)
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return '👑 المالك'
      case 'cashier':
        return '💰 الكاشير'
      case 'kitchen':
        return '🍳 المطبخ'
      default:
        return role
    }
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
          <div className="flex items-center gap-2 bg-amber-50 text-amber-900 border border-amber-300 px-4 py-2 rounded-2xl text-xs font-black">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            صلاحيات المالك فقط (Owner Only)
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
            جاري التحقق من الصلاحيات وجلب السياسات...
          </div>
        ) : accessDenied ? (
          <div className="bg-rose-50 border border-rose-200 p-8 rounded-3xl text-center space-y-4">
            <div className="text-4xl">⛔</div>
            <h3 className="text-lg font-black text-rose-900">غير مصرح بالوصول</h3>
            <p className="text-xs text-rose-700 font-bold max-w-md mx-auto">{accessDenied}</p>
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-block bg-gray-900 hover:bg-black text-white text-xs font-bold px-6 py-3 rounded-2xl shadow-sm transition-all"
              >
                العودة للوحة التحكم الرئيسية
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Section 1: Maps Distance Delivery Policy */}
            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🗺️</span>
                  <div>
                    <h2 className="text-base font-black text-gray-900">سياسات التوصيل بالخرائط (Maps Distance Pricing)</h2>
                    <p className="text-xs text-gray-500">المسار الأساسي للتسعير: السعر = المسافة × سعر الكيلومتر مع التقريب لأقرب 5 جنيه</p>
                  </div>
                </div>
                <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-xl font-bold">
                  🟢 المسار الأساسي (Primary)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Delivery Fee Per KM */}
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-gray-900">سعر الكيلومتر للتوصيل</h4>
                    <p className="text-xs text-gray-500">سعر الكيلومتر الواحد لحساب مسافة التوصيل الفعلية.</p>
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

                {/* Min Delivery Fee */}
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-gray-900">الحد الأدنى لرسوم التوصيل</h4>
                    <p className="text-xs text-gray-500">أقل رسوم توصيل يمكن تطبيقها على أي طلب دليفري.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={minDeliveryFee}
                        onChange={(e) => setMinDeliveryFee(parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">ج.م</span>
                    </div>
                    <button
                      onClick={() => savePolicy('min_delivery_fee', minDeliveryFee)}
                      disabled={savingKey === 'min_delivery_fee'}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      {savingKey === 'min_delivery_fee' ? '...' : 'حفظ'}
                    </button>
                  </div>
                </div>

                {/* Max Delivery Radius */}
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-gray-900">أقصى نطاق توصيل مسموح</h4>
                    <p className="text-xs text-gray-500">يتم رفض أي طلب يبعد أكثر من هذا النصف قطر.</p>
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Min Order Amount */}
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-gray-900">الحد الأدنى لقيمة الطلب</h4>
                    <p className="text-xs text-gray-500">أقل قيمة أصناف (Subtotal) مسموح بطلبها للتوصيل.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="5"
                        min="0"
                        value={minOrderAmount}
                        onChange={(e) => setMinOrderAmount(parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
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

                {/* Max Active Orders Per Driver */}
                <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-gray-900">أقصى حمولة للطيار</h4>
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
                    <p className="text-xs text-gray-500">الأجر المحتسب للطيار عن كل ساعة عمل في الوردية.</p>
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

            {/* Section 2: Fixed Delivery Zones Manager (Fallback Policy) */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📍</span>
                  <div>
                    <h2 className="text-base font-black text-gray-900">مناطق وأحياء التوصيل الثابتة (Fixed Delivery Zones)</h2>
                    <p className="text-xs text-gray-500">المسار البديل (Fallback): يُستخدم تلقائياً عند غياب إحداثيات الخريطة أو تعذر تحديد الموقع</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetDefaultZones}
                    className="text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded-xl transition-all"
                  >
                    استعادة الافتراضي
                  </button>
                  <button
                    onClick={() => {
                      setEditingZone({
                        id: `zone_${Date.now().toString(36)}`,
                        name: '',
                        min_fee: 30,
                        max_fee: 40,
                        is_active: true,
                        sort_order: deliveryZones.length + 1,
                        areas: []
                      })
                      setIsNewZoneModalOpen(true)
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span>➕</span>
                    <span>إضافة منطقة جديدة</span>
                  </button>
                </div>
              </div>

              {/* Zones List Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deliveryZones.map((zone) => (
                  <div
                    key={zone.id}
                    className={`bg-white rounded-3xl border p-5 shadow-sm space-y-4 transition-all ${
                      zone.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60 bg-gray-50'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-sm text-gray-900">{zone.name}</h4>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                              zone.is_active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {zone.is_active ? 'نشط' : 'معطل'}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-gray-400">ID: {zone.id}</p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleZoneActive(zone.id)}
                          title={zone.is_active ? 'تعطيل المنطقة' : 'تفعيل المنطقة'}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-all ${
                            zone.is_active
                              ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          }`}
                        >
                          {zone.is_active ? 'إيقاف' : 'تشغيل'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingZone({ ...zone })
                            setIsNewZoneModalOpen(false)
                          }}
                          className="text-xs px-2.5 py-1 rounded-lg font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 transition-all"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDeleteZone(zone.id)}
                          className="text-xs px-2 py-1 rounded-lg font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all"
                        >
                          حذف
                        </button>
                      </div>
                    </div>

                    {/* Price Range Badge */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs">
                      <span className="font-bold text-gray-600">نطاق السعر المعتمد:</span>
                      <span className="font-black text-amber-700 bg-amber-100/70 border border-amber-300 px-3 py-1 rounded-xl">
                        {zone.min_fee} - {zone.max_fee} ج.م
                      </span>
                    </div>

                    {/* Areas Chips */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-gray-500">الأحياء والمناطق التابعة ({zone.areas.length}):</div>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                        {zone.areas.map((area, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] font-bold bg-gray-100 border border-gray-300 text-gray-800 px-2 py-0.5 rounded-lg"
                          >
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Zone Edit/Add Modal */}
              {editingZone && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-lg w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b pb-4">
                      <div>
                        <h3 className="font-black text-base text-gray-900">
                          {isNewZoneModalOpen ? 'إضافة منطقة توصيل جديدة' : `تعديل منطقة: ${editingZone.name}`}
                        </h3>
                        <p className="text-xs text-gray-500">قم بضبط النطاق السعري وقائمة الأحياء المرتبطة بالمنطقة</p>
                      </div>
                      <button
                        onClick={() => {
                          setEditingZone(null)
                          setIsNewZoneModalOpen(false)
                        }}
                        className="text-gray-400 hover:text-gray-700 font-black text-lg p-1"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-gray-600 block mb-1">اسم المنطقة (مثل: المطرية وضواحيها):</label>
                          <input
                            type="text"
                            value={editingZone.name}
                            onChange={(e) => setEditingZone({ ...editingZone, name: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                            placeholder="اسم المنطقة..."
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-gray-600 block mb-1">المعرف البرمجي (Slug ID):</label>
                          <input
                            type="text"
                            value={editingZone.id}
                            disabled={!isNewZoneModalOpen}
                            onChange={(e) => setEditingZone({ ...editingZone, id: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                            placeholder="zone_name"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-gray-600 block mb-1">الحد الأدنى (ج.م):</label>
                          <input
                            type="number"
                            min="0"
                            step="5"
                            value={editingZone.min_fee}
                            onChange={(e) => setEditingZone({ ...editingZone, min_fee: parseFloat(e.target.value) || 0 })}
                            className="w-full text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-xs font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-gray-600 block mb-1">الحد الأقصى (ج.م):</label>
                          <input
                            type="number"
                            min="0"
                            step="5"
                            value={editingZone.max_fee}
                            onChange={(e) => setEditingZone({ ...editingZone, max_fee: parseFloat(e.target.value) || 0 })}
                            className="w-full text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-xs font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-gray-600 block mb-1">ترتيب العرض:</label>
                          <input
                            type="number"
                            min="1"
                            value={editingZone.sort_order}
                            onChange={(e) => setEditingZone({ ...editingZone, sort_order: parseInt(e.target.value, 10) || 1 })}
                            className="w-full text-center bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-xs font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                        <label className="text-xs font-bold text-gray-700 flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingZone.is_active}
                            onChange={(e) => setEditingZone({ ...editingZone, is_active: e.target.checked })}
                            className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                          />
                          <span>تفعيل هذه المنطقة لخدمة التوصيل</span>
                        </label>
                      </div>

                      {/* Area Tags Editor */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-gray-600 block">
                          الأحياء والمناطق الفرعية التابعة (تُستخدم لمطابقة عنوان العميل):
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newAreaTagInput}
                            onChange={(e) => setNewAreaTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const trimmed = newAreaTagInput.trim()
                                if (trimmed && !editingZone.areas.includes(trimmed)) {
                                  setEditingZone({ ...editingZone, areas: [...editingZone.areas, trimmed] })
                                  setNewAreaTagInput('')
                                }
                              }
                            }}
                            placeholder="اكتب اسم الحي واضغط إضافة..."
                            className="flex-1 bg-gray-50 border border-gray-300 rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = newAreaTagInput.trim()
                              if (trimmed && !editingZone.areas.includes(trimmed)) {
                                setEditingZone({ ...editingZone, areas: [...editingZone.areas, trimmed] })
                                setNewAreaTagInput('')
                              }
                            }}
                            className="bg-gray-800 hover:bg-black text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
                          >
                            إضافة
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 p-3 rounded-2xl bg-gray-50 border border-gray-200 min-h-[60px] max-h-40 overflow-y-auto">
                          {editingZone.areas.map((area, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-xl"
                            >
                              <span>{area}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingZone({
                                    ...editingZone,
                                    areas: editingZone.areas.filter((_, i) => i !== idx)
                                  })
                                }}
                                className="text-amber-700 hover:text-amber-950 font-black text-xs"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                          {editingZone.areas.length === 0 && (
                            <span className="text-xs text-gray-400 font-medium py-1">لا توجد أحياء مضافة بعد</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingZone(null)
                          setIsNewZoneModalOpen(false)
                        }}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold px-4 py-2.5 rounded-xl transition-all"
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEditedZone(editingZone)}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black px-6 py-2.5 rounded-xl transition-all shadow-sm"
                      >
                        حفظ المنطقة
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Section 3: Staff PIN Management (Security Control) */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <span className="text-lg">🔑</span>
                <h2 className="text-base font-black text-gray-900">إدارة الـ PIN ورموز مرور طاقم العمل</h2>
                <span className="text-xs text-gray-400 font-normal">| Staff PIN Security & Alerts</span>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    يمكن للمالك فقط تغيير وتعيين رمز مرور (PIN) سري لأي موظف. كل تعديل يُرسل فوراً كـ Security Alert إلى Telegram.
                  </p>
                  <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    🔔 Telegram Alert Enabled
                  </span>
                </div>

                <form onSubmit={handleUpdatePin} className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 block mb-1">اختر الموظف المستهدف:</label>
                    <select
                      value={pinTargetStaffId}
                      onChange={(e) => setPinTargetStaffId(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({getRoleLabel(s.role)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-600 block mb-1">رمز الـ PIN الجديد (4 - 10 أرقام):</label>
                    <input
                      type="password"
                      required
                      placeholder="أدخل الـ PIN الجديد..."
                      value={newPinValue}
                      onChange={(e) => setNewPinValue(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 text-center tracking-widest text-base"
                      maxLength={10}
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={isUpdatingPin || !newPinValue.trim()}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black text-xs py-3 px-4 rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <span>🔒</span>
                      <span>{isUpdatingPin ? 'جاري التحديث والتنبيه...' : 'تحديث الـ PIN وإرسال التنبيه'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </section>

            {/* Section 4: Reservation & Deposit Payment Accounts */}
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

            {/* Section 5: Operating Hours & Schedule Overview */}
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
