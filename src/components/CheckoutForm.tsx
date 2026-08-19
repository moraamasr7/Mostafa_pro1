'use client'

import { useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { OrderType } from '@/types/orders'
import { PaymentMethod } from '@/types/menu'

interface CheckoutFormProps {
  isOpen: boolean
  initialOrderType?: OrderType
  onClose: () => void
  onSubmit: (data: {
    customer_name: string
    customer_phone: string
    notes: string
    order_type: OrderType
    delivery_address?: string
    payment_method: PaymentMethod
    payment_receipt_url?: string
    turnstile_token: string
  }) => void
  isSubmitting: boolean
}

// فورم إتمام الطلب — بيانات العميل + نوع الطلب (دليفري/استلام) + طريقة الدفع وإثبات التحويل
export default function CheckoutForm({
  isOpen,
  initialOrderType = 'takeaway',
  onClose,
  onSubmit,
  isSubmitting,
}: CheckoutFormProps) {
  const [orderType, setOrderType] = useState<OrderType>(initialOrderType)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialOrderType === 'takeaway' ? 'instapay' : 'cash'
  )
  const [paymentReceipt, setPaymentReceipt] = useState('')
  const [notes, setNotes] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [phoneError, setPhoneError] = useState('')

  if (!isOpen) return null

  // التحقق من رقم الموبايل المصري: 11 رقم يبدأ بـ 01
  const validatePhone = (value: string): boolean => {
    const cleaned = value.replace(/\s/g, '')
    if (cleaned.length !== 11) {
      setPhoneError('رقم الموبايل لازم يكون 11 رقم')
      return false
    }
    if (!cleaned.startsWith('01')) {
      setPhoneError('رقم الموبايل لازم يبدأ بـ 01')
      return false
    }
    if (!/^\d+$/.test(cleaned)) {
      setPhoneError('رقم الموبايل لازم يكون أرقام بس')
      return false
    }
    setPhoneError('')
    return true
  }

  const handlePhoneChange = (value: string) => {
    setPhone(value)
    if (value.length > 0) {
      validatePhone(value)
    } else {
      setPhoneError('')
    }
  }

  const handleOrderTypeChange = (type: OrderType) => {
    setOrderType(type)
    if (type === 'takeaway') {
      setPaymentMethod('instapay')
    } else {
      setPaymentMethod('cash')
    }
  }

  // التحقق من اكتمال البيانات حسب نوع الطلب وطريقة الدفع
  const isAddressValid = orderType !== 'delivery' || deliveryAddress.trim().length >= 5
  const isReceiptValid =
    orderType !== 'takeaway' && paymentMethod === 'cash'
      ? true
      : paymentReceipt.trim().length >= 3

  const isFormValid =
    name.trim().length > 0 &&
    /^01\d{9}$/.test(phone.replace(/\s/g, '')) &&
    isAddressValid &&
    isReceiptValid &&
    turnstileToken.length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validatePhone(phone)) return
    if (!isFormValid) return

    onSubmit({
      customer_name: name.trim(),
      customer_phone: phone.replace(/\s/g, ''),
      notes: notes.trim(),
      order_type: orderType,
      delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : undefined,
      payment_method: paymentMethod,
      payment_receipt_url: paymentReceipt.trim() || undefined,
      turnstile_token: turnstileToken,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fade-in">
      {/* خلفية مظلمة */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!isSubmitting ? onClose : undefined}
      />

      {/* محتوى الفورم */}
      <div className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col animate-slide-up">
        {/* هيدر */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-extrabold text-xl text-gray-900">إتمام الطلب</h2>
            <p className="text-xs text-gray-500 font-medium">حدد تفاصيل الاستلام والدفع</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors text-lg disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* اختيارات نوع الطلب (تيك اواي / دليفري) */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-2">
              طريقة استلام الطلب <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleOrderTypeChange('delivery')}
                className={`py-3 px-4 rounded-2xl font-extrabold text-sm border-2 transition-all flex flex-col items-center gap-1 ${
                  orderType === 'delivery'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-sm'
                    : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="text-xl">🛵</span>
                <span>توصيل للمنزل (دليفري)</span>
              </button>

              <button
                type="button"
                onClick={() => handleOrderTypeChange('takeaway')}
                className={`py-3 px-4 rounded-2xl font-extrabold text-sm border-2 transition-all flex flex-col items-center gap-1 ${
                  orderType === 'takeaway'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-sm'
                    : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="text-xl">🏪</span>
                <span>استلام من الفرع (تيك اواي)</span>
              </button>
            </div>
          </div>

          {/* حقل عنوان التوصيل — يظهر فقط عند اختيار الدليفري */}
          {orderType === 'delivery' && (
            <div className="animate-fade-in-up">
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                عنوان التوصيل التفصيلي <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="المنطقة، اسم الشارع، رقم العمارة والشقة..."
                required={orderType === 'delivery'}
                disabled={isSubmitting}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 bg-gray-50/50 transition-all text-sm disabled:opacity-60"
              />
              {deliveryAddress.length > 0 && deliveryAddress.trim().length < 5 && (
                <p className="text-red-500 text-xs mt-1 font-medium">العنوان يجب أن يكون 5 حروف على الأقل</p>
              )}
            </div>
          )}

          {/* طرق الدفع المتاحة */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-2">
              طريقة الدفع <span className="text-red-500">*</span>
            </label>

            {orderType === 'delivery' ? (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1 ${
                    paymentMethod === 'cash'
                      ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-base">💵</span>
                  <span>نقدي كاش</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('instapay')}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1 ${
                    paymentMethod === 'instapay'
                      ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-base">⚡</span>
                  <span>إنستا باي</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1 ${
                    paymentMethod === 'wallet'
                      ? 'border-red-600 bg-red-600 text-white shadow-sm'
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-base">📱</span>
                  <span>فودافون كاش</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('instapay')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                    paymentMethod === 'instapay'
                      ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                      : 'border-gray-200 bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="text-base">⚡</span>
                  <span>تحويل إنستا باي</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                    paymentMethod === 'wallet'
                      ? 'border-red-600 bg-red-600 text-white shadow-sm'
                      : 'border-gray-200 bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="text-base">📱</span>
                  <span>فودافون كاش</span>
                </button>
              </div>
            )}
          </div>

          {/* تنبيه تعليمات التحويل وإدخال رقم العملية (ضروري للتيك اواي أو التحويل بالدليفري) */}
          {(orderType === 'takeaway' || paymentMethod !== 'cash') && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 animate-fade-in">
              <div className="flex items-start gap-2">
                <span className="text-amber-600 text-base shrink-0">💳</span>
                <div className="text-xs text-amber-900 font-semibold space-y-1">
                  {orderType === 'takeaway' ? (
                    <p className="font-extrabold text-red-700">
                      ⚠️ تنبيه: لضمان تحضير طلب الاستلام من الفرع بالمطبخ، يلزم تحويل المبلغ كاملاً وإرفاق إثبات/رقم العملية.
                    </p>
                  ) : (
                    <p className="font-bold">يرجى تحويل المبلغ كاملاً وإرفاق رقم عملية التحويل لتأكيد طلبك.</p>
                  )}
                  <p>• حساب فودافون كاش / إنستا باي: <strong className="text-black font-mono text-sm underline dir-ltr">01000000000</strong></p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">
                  رقم العملية / إثبات تحويل المبلغ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={paymentReceipt}
                  onChange={(e) => setPaymentReceipt(e.target.value)}
                  placeholder="أدخل رقم عملية التحويل أو كود التأكيد..."
                  required={orderType === 'takeaway' || paymentMethod !== 'cash'}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-xs font-semibold"
                />
              </div>
            </div>
          )}

          {/* حقل الاسم */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              الاسم <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسمك الكريم"
              required
              disabled={isSubmitting}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 bg-gray-50/50 transition-all text-sm disabled:opacity-60"
            />
          </div>

          {/* حقل رقم الموبايل */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              رقم الموبايل <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="01xxxxxxxxx"
              required
              disabled={isSubmitting}
              dir="ltr"
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 bg-gray-50/50 transition-all text-sm text-left disabled:opacity-60 ${
                phoneError
                  ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                  : 'border-gray-200 focus:ring-amber-200 focus:border-amber-400'
              }`}
            />
            {phoneError && (
              <p className="text-red-500 text-xs mt-1.5 font-medium">
                {phoneError}
              </p>
            )}
          </div>

          {/* ملاحظات اختيارية */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              ملاحظات على الطلب
              <span className="text-gray-400 font-normal mr-1">(اختياري)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي طلبات خاصة..."
              rows={2}
              disabled={isSubmitting}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 bg-gray-50/50 transition-all text-sm resize-none disabled:opacity-60"
            />
          </div>

          {/* تحقق Cloudflare Turnstile — حماية من الروبوتات */}
          <div className="flex justify-center">
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setTurnstileToken('')}
              onExpire={() => setTurnstileToken('')}
              options={{
                theme: 'light',
                language: 'ar',
              }}
            />
          </div>

          {/* زرار التأكيد */}
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-md shadow-amber-200/50 active:scale-[0.98] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                جاري إرسال الطلب...
              </>
            ) : (
              `تأكيد طلب ${orderType === 'delivery' ? 'الدليفري 🛵' : 'الاستلام 🏪'}`
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
