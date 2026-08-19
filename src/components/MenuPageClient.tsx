'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GroupedCategory, CartLine, PaymentMethod } from '@/types/menu'
import { OrderType } from '@/types/orders'
import MenuItemCard from '@/components/MenuItemCard'
import CartBar from '@/components/CartBar'
import CartModal from '@/components/CartModal'
import CheckoutForm from '@/components/CheckoutForm'

interface MenuPageClientProps {
  categories: GroupedCategory[]
}

// الصفحة الرئيسية (كلاينت) — إدارة السلة + عرض المنيو + إتمام الطلب
export default function MenuPageClient({ categories }: MenuPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlType = searchParams.get('type')
  const initialOrderType: OrderType = urlType === 'delivery' ? 'delivery' : 'takeaway'

  const [cart, setCart] = useState<CartLine[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // إضافة صنف للسلة — دمج الكمية لو نفس الحجم مضاف سابقاً لتجنب تكرار الصفوف
  const handleAddToCart = (line: CartLine) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex((l) => l.variant_id === line.variant_id)
      if (existingIndex > -1) {
        const updated = [...prev]
        const existing = updated[existingIndex]
        updated[existingIndex] = {
          ...existing,
          quantity: Math.min(50, existing.quantity + line.quantity),
          item_notes: line.item_notes || existing.item_notes,
        }
        return updated
      }
      return [...prev, line]
    })
  }

  // حذف صنف من السلة بالكامل
  const handleRemoveItem = (variantId: string) => {
    setCart((prev) => prev.filter((l) => l.variant_id !== variantId))
  }

  // تحديث الكمية — لو 0 أو أقل يتم حذف الصنف، أقصى حد 50
  const handleUpdateQuantity = (variantId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemoveItem(variantId)
      return
    }
    const clampedQty = Math.min(50, newQuantity)
    setCart((prev) =>
      prev.map((l) =>
        l.variant_id === variantId ? { ...l, quantity: clampedQty } : l
      )
    )
  }

  // الانتقال من مودال السلة لفورم إتمام الطلب
  const handleCheckout = () => {
    setIsCartOpen(false)
    setIsCheckoutOpen(true)
  }

  // إرسال الطلب للـ API — نرسل بيانات الطلب ونوع التسليم وطريقة الدفع
  const handleSubmitOrder = async (data: {
    customer_name: string
    customer_phone: string
    notes: string
    order_type: OrderType
    delivery_address?: string
    payment_method: PaymentMethod
    payment_receipt_url?: string
    turnstile_token: string
  }) => {
    setIsSubmitting(true)
    setSubmitError('')

    try {
      const orderItemsPayload = cart.map((line) => ({
        variant_id: line.variant_id,
        quantity: line.quantity,
        item_notes: line.item_notes,
      }))

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: orderItemsPayload,
          ...data,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setSubmitError(result.error || 'حصلت مشكلة أثناء تسجيل الطلب. حاول مرة أخرى.')
        setIsSubmitting(false)
        return
      }

      // نجاح — تفريغ السلة والتوجيه لصفحة تتبع الطلب مع رمز التتبع الأمني
      setCart([])
      setIsCheckoutOpen(false)
      
      const trackingUrl = result.tracking_token
        ? `/order/${result.order_id}?token=${result.tracking_token}`
        : `/order/${result.order_id}`

      router.push(trackingUrl)
    } catch {
      setSubmitError('تعذر الاتصال بالسيرفر. تأكد من الاتصال بالإنترنت حاول مرة أخرى.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/80 via-white to-amber-50/50">
      {/* هيدر المنيو */}
      <header className="bg-gradient-to-l from-amber-700 to-amber-600 text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <h1 className="text-2xl font-extrabold tracking-tight">
            🥩 مصطفى الجزار
          </h1>
          <p className="text-amber-100 text-sm mt-0.5 font-medium">
            اختار أكلك واطلب استلام من الفرع
          </p>
        </div>
      </header>

      {/* قائمة المنيو */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {categories.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">📋</p>
            <p className="text-gray-400 font-medium text-lg">
              المنيو مش متاح حالياً
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {categories.map((category) => (
              <section key={category.id} className="animate-fade-in-up">
                {/* عنوان القسم */}
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="font-extrabold text-xl text-gray-900">
                    {category.name}
                  </h2>
                  <div className="flex-1 h-px bg-gradient-to-l from-transparent via-amber-200 to-transparent" />
                </div>

                {/* بطاقات الأصناف */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {category.items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onAddToCart={handleAddToCart}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* شريط السلة السفلي */}
      <CartBar cart={cart} onOpenCart={() => setIsCartOpen(true)} />

      {/* مودال مراجعة السلة */}
      <CartModal
        cart={cart}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onRemoveItem={handleRemoveItem}
        onUpdateQuantity={handleUpdateQuantity}
        onCheckout={handleCheckout}
      />

      {/* فورم إتمام الطلب */}
      <CheckoutForm
        isOpen={isCheckoutOpen}
        initialOrderType={initialOrderType}
        onClose={() => {
          setIsCheckoutOpen(false)
          setSubmitError('')
        }}
        onSubmit={handleSubmitOrder}
        isSubmitting={isSubmitting}
      />

      {/* رسالة خطأ عائمة لو الإرسال فشل */}
      {submitError && (
        <div className="fixed top-4 inset-x-4 z-[60] max-w-md mx-auto animate-fade-in-up">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-lg flex items-start gap-3">
            <span className="text-red-500 text-xl shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-red-700 font-semibold text-sm">{submitError}</p>
            </div>
            <button
              onClick={() => setSubmitError('')}
              className="text-red-400 hover:text-red-600 text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
