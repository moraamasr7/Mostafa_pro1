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

// فورم إتمام الطلب — تصميم Glassmorphic داكن وأنيق مطابق لهوية التطبيق
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

  // التحقق من رقم الموبايل المصري
  const validatePhone = (value: string): boolean => {
    const cleaned = value.replace(/\s/g, '')
    if (cleaned.length !== 11) {
      setPhoneError('رقم الموبايل يجب أن يتكون من 11 رقماً')
      return false
    }
    if (!cleaned.startsWith('01')) {
      setPhoneError('رقم الموبايل يجب أن يبدأ بـ 01')
      return false
    }
    if (!/^\d+$/.test(cleaned)) {
      setPhoneError('يمنع استخدام الحروف أو الرموز في رقم الموبايل')
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

  // التحقق من اكتمال البيانات
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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      {/* خلفية مظلمة ضبابية */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={!isSubmitting ? onClose : undefined}
      />

      {/* محتوى الفورم */}
      <div className="relative w-full max-w-lg bg-dark-900/95 backdrop-blur-2xl border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col animate-slide-up overflow-hidden">
        {/* هيدر */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/[0.08]">
          <div>
            <h2 className="font-black text-lg sm:text-xl text-white">إتمام الطلب</h2>
            <p className="text-xs text-slate-400 font-medium">حدد تفاصيل التسليم والدفع لخدمتك بأسرع وقت</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full bg-dark-800 hover:bg-dark-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors text-sm font-bold border border-white/10 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 sm:space-y-5">
          {/* اختيارات نوع الطلب (تيك اواي / دليفري) */}
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
              طريقة استلام الطلب <span className="text-amber-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleOrderTypeChange('delivery')}
                className={`py-3 px-3 rounded-2xl font-black text-xs sm:text-sm border transition-all flex flex-col items-center gap-1 ${
                  orderType === 'delivery'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-400 shadow-md shadow-amber-500/10'
                    : 'border-white/[0.06] bg-dark-800/50 text-slate-400 hover:bg-dark-800 hover:text-white'
                }`}
              >
                <span className="text-xl">🛵</span>
                <span>توصيل للمنزل (دليفري)</span>
              </button>

              <button
                type="button"
                onClick={() => handleOrderTypeChange('takeaway')}
                className={`py-3 px-3 rounded-2xl font-black text-xs sm:text-sm border transition-all flex flex-col items-center gap-1 ${
                  orderType === 'takeaway'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-400 shadow-md shadow-amber-500/10'
                    : 'border-white/[0.06] bg-dark-800/50 text-slate-400 hover:bg-dark-800 hover:text-white'
                }`}
              >
                <span className="text-xl">🏪</span>
                <span>استلام من الفرع (تيك اواي)</span>
              </button>
            </div>
          </div>

          {/* حقل عنوان التوصيل — يظهر عند الدليفري */}
          {orderType === 'delivery' && (
            <div className="animate-fade-in-up space-y-1">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">
                عنوان التوصيل التفصيلي <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="المنطقة، اسم الشارع، رقم العمارة والشقة..."
                required={orderType === 'delivery'}
                disabled={isSubmitting}
                className="w-full px-4 py-3 bg-dark-950/70 border border-white/[0.08] text-white rounded-xl focus:outline-none focus:border-amber-500/60 transition-all text-xs sm:text-sm placeholder:text-slate-500 disabled:opacity-60"
              />
              {deliveryAddress.length > 0 && deliveryAddress.trim().length < 5 && (
                <p className="text-red-400 text-[10px] font-bold mt-1">العنوان يجب أن لا يقل عن 5 حروف</p>
              )}
            </div>
          )}

          {/* طرق الدفع المتاحة */}
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
              طريقة الدفع <span className="text-amber-500">*</span>
            </label>

            {orderType === 'delivery' ? (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1 ${
                    paymentMethod === 'cash'
                      ? 'border-amber-500 bg-amber-500 text-white shadow-md'
                      : 'border-white/[0.06] bg-dark-800/50 text-slate-400 hover:bg-dark-800'
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
                      ? 'border-purple-500 bg-purple-600 text-white shadow-md'
                      : 'border-white/[0.06] bg-dark-800/50 text-slate-400 hover:bg-dark-800'
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
                      ? 'border-red-500 bg-red-600 text-white shadow-md'
                      : 'border-white/[0.06] bg-dark-800/50 text-slate-400 hover:bg-dark-800'
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
                      ? 'border-purple-500 bg-purple-600 text-white shadow-md'
                      : 'border-white/[0.06] bg-dark-800/50 text-slate-400'
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
                      ? 'border-red-500 bg-red-600 text-white shadow-md'
                      : 'border-white/[0.06] bg-dark-800/50 text-slate-400'
                  }`}
                >
                  <span className="text-base">📱</span>
                  <span>فودافون كاش</span>
                </button>
              </div>
            )}
          </div>

          {/* تعليمات التحويل وإدخال رقم العملية */}
          {(orderType === 'takeaway' || paymentMethod !== 'cash') && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl space-y-2 animate-fade-in">
              <div className="flex items-start gap-2">
                <span className="text-amber-400 text-base shrink-0">💳</span>
                <div className="text-xs text-amber-200/95 font-semibold space-y-1">
                  {orderType === 'takeaway' ? (
                    <p className="font-black text-red-400">
                      ⚠️ تنبيه: لضمان تحضير طلب الاستلام من الفرع بالمطبخ، يلزم تحويل المبلغ كاملاً وإرفاق إثبات/رقم العملية.
                    </p>
                  ) : (
                    <p className="font-bold">يرجى تحويل المبلغ كاملاً وإرفاق رقم عملية التحويل لتأكيد طلبك.</p>
                  )}
                  <p>• حساب فودافون كاش / إنستا باي: <strong className="text-white font-mono text-sm underline dir-ltr">01000000000</strong></p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1">
                  رقم العملية / إثبات تحويل المبلغ <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={paymentReceipt}
                  onChange={(e) => setPaymentReceipt(e.target.value)}
                  placeholder="أدخل رقم عملية التحويل أو كود التأكيد..."
                  required={orderType === 'takeaway' || paymentMethod !== 'cash'}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-dark-950/80 border border-amber-500/30 rounded-xl text-xs font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* حقل الاسم */}
          <div className="space-y-1">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">
              الاسم بالكامل <span className="text-amber-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسمك الكريم"
              required
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-dark-950/70 border border-white/[0.08] text-white rounded-xl focus:outline-none focus:border-amber-500/60 transition-all text-xs sm:text-sm placeholder:text-slate-500 disabled:opacity-60"
            />
          </div>

          {/* حقل رقم الموبايل */}
          <div className="space-y-1">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">
              رقم الموبايل <span className="text-amber-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="01xxxxxxxxx"
              required
              disabled={isSubmitting}
              dir="ltr"
              className={`w-full px-4 py-3 bg-dark-950/70 border rounded-xl focus:outline-none transition-all text-xs sm:text-sm text-left disabled:opacity-60 ${
                phoneError
                  ? 'border-red-500/60 focus:border-red-500'
                  : 'border-white/[0.08] focus:border-amber-500/60'
              }`}
            />
            {phoneError && (
              <p className="text-red-400 text-[10px] font-bold mt-1">
                {phoneError}
              </p>
            )}
          </div>

          {/* ملاحظات اختيارية */}
          <div className="space-y-1">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">
              ملاحظات على الطلب
              <span className="text-slate-500 font-normal mr-1">(اختياري)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي طلبات خاصة بالتحضير أو الاستلام..."
              rows={2}
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-dark-950/70 border border-white/[0.08] text-white rounded-xl focus:outline-none focus:border-amber-500/60 transition-all text-xs sm:text-sm resize-none placeholder:text-slate-500 disabled:opacity-60"
            />
          </div>

          {/* تحقق Cloudflare Turnstile */}
          <div className="flex justify-center">
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setTurnstileToken('')}
              onExpire={() => setTurnstileToken('')}
              options={{
                theme: 'dark',
                language: 'ar',
              }}
            />
          </div>

          {/* زرار التأكيد */}
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-dark-800 disabled:to-dark-800 disabled:text-slate-600 disabled:shadow-none text-white font-extrabold py-3.5 rounded-2xl text-base transition-all shadow-lg shadow-amber-900/30 active:scale-[0.98] disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

