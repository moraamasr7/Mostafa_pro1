'use client'

import { useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'

interface CheckoutFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    customer_name: string
    customer_phone: string
    notes: string
    turnstile_token: string
  }) => void
  isSubmitting: boolean
}

// فورم إتمام الطلب — بيانات العميل + تحقق Turnstile
export default function CheckoutForm({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}: CheckoutFormProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  // أخطاء الحقول — بتظهر فقط بعد أول محاولة إرسال أو بعد التعديل
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

  // الزرار يتفعل فقط لما كل الشروط تتحقق
  const isFormValid =
    name.trim().length > 0 &&
    /^01\d{9}$/.test(phone.replace(/\s/g, '')) &&
    turnstileToken.length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validatePhone(phone)) return
    if (!isFormValid) return

    onSubmit({
      customer_name: name.trim(),
      customer_phone: phone.replace(/\s/g, ''),
      notes: notes.trim(),
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
          <h2 className="font-extrabold text-xl text-gray-900">
            بيانات الطلب
          </h2>
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
              rows={3}
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
                {/* دوّارة تحميل أثناء الإرسال */}
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                جاري الإرسال...
              </>
            ) : (
              'تأكيد الطلب ✓'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
