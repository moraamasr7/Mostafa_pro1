'use client'

import { useState, useMemo } from 'react'
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

// الصفحة الرئيسية (كلاينت) — واجهة زجاجية بريميوم بتصميم أبو خاطر مع الحفاظ التام على بيانات ومنطق مصطفى الجزار
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

  // فلترة الأقسام والبحث
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // إضافة صنف للسلة
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

  // حذف صنف من السلة
  const handleRemoveItem = (variantId: string) => {
    setCart((prev) => prev.filter((l) => l.variant_id !== variantId))
  }

  // تحديث الكمية
  const handleUpdateQuantity = (variantId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemoveItem(variantId)
      return
    }
    const clampedQty = Math.min(50, newQuantity)
    setCart((prev) =>
      prev.map((l) => (l.variant_id === variantId ? { ...l, quantity: clampedQty } : l))
    )
  }

  const handleCheckout = () => {
    setIsCartOpen(false)
    setIsCheckoutOpen(true)
  }

  // إرسال الطلب
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

      setCart([])
      setIsCheckoutOpen(false)

      const trackingUrl = result.tracking_token
        ? `/order/${result.order_id}?token=${result.tracking_token}`
        : `/order/${result.order_id}`

      router.push(trackingUrl)
    } catch {
      setSubmitError('تعذر الاتصال بالسيرفر. تأكد من الاتصال بالإنترنت وحاول مرة أخرى.')
      setIsSubmitting(false)
    }
  }

  // تجميع إجمالي عدد العناصر المتاحة في المنيو
  const totalMenuItemsCount = useMemo(() => {
    return categories.reduce((acc, cat) => acc + cat.items.length, 0)
  }, [categories])

  // فلترة الأقسام بناءً على البحث والقسم النشط
  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return categories
      .map((cat) => {
        // إذا كان يحدد قسماً معيناً وليس 'all'
        if (activeCategoryId !== 'all' && cat.id !== activeCategoryId) {
          return null
        }

        const items = cat.items.filter((item) => {
          if (!query) return true
          return (
            item.name.toLowerCase().includes(query) ||
            (item.description && item.description.toLowerCase().includes(query))
          )
        })

        if (items.length === 0) return null

        return {
          ...cat,
          items,
        }
      })
      .filter((cat): cat is GroupedCategory => cat !== null)
  }, [categories, activeCategoryId, searchQuery])

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 pb-[max(7rem,env(safe-area-inset-bottom,0px))] selection:bg-amber-500/20">
      {/* Banner & Hero Section (هيرو فاخر) */}
      <div className="relative min-h-[220px] h-[35vh] sm:h-[40vh] md:min-h-[280px] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-dark-950 z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(234,88,12,0.15)_0,transparent_70%)] z-10" />

        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4 py-8">
          <div className="mb-3 animate-float relative">
            <div className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full scale-150 opacity-50" />
            <div className="relative bg-dark-900/80 backdrop-blur-md p-3.5 sm:p-4 rounded-full border border-white/10 shadow-2xl">
              <span className="text-4xl sm:text-5xl drop-shadow-[0_0_15px_rgba(234,88,12,0.5)]">
                🥩
              </span>
            </div>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black mb-2 tracking-tight drop-shadow-[0_2px_30px_rgba(234,88,12,0.35)]">
            <span className="bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500 bg-clip-text text-transparent">
              مطعم مصطفى الجزار
            </span>
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm font-bold tracking-wide max-w-sm mx-auto leading-relaxed border-t border-white/10 pt-2 mt-1">
            أشهى المشويات واللحوم البلدي الطازجة والأكلات الشعبية
          </p>
        </div>
      </div>

      {/* Floating Interaction Bar (شريط تفاعلي مثبت زجاجي للبحث والتصنيفات) */}
      <div className="sticky top-3 sm:top-4 z-40 px-3 sm:px-4 transition-all duration-500">
        <div className="max-w-4xl mx-auto bg-dark-900/88 backdrop-blur-xl border border-white/[0.08] rounded-[1.75rem] sm:rounded-[2rem] shadow-[0_20px_56px_rgba(0,0,0,0.5)] p-3.5 sm:p-5 space-y-3.5">
          {/* شريط البحث وحالة المنيو */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">
                تصفح قائمة الطعام
              </span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>مباشر (Live)</span>
              </div>
            </div>

            <div className="relative flex-1 min-w-0">
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
                🔍
              </span>
              <input
                type="search"
                autoComplete="off"
                placeholder="ابحث عن وجبتك المفضلة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-dark-950/70 border border-white/[0.08] text-white pr-10 pl-9 py-3 rounded-xl sm:rounded-2xl focus:outline-none focus:border-amber-500/50 transition-all text-xs sm:text-sm placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* شريط التصنيفات الأفقي (Horizontal Category Navigation Bar) */}
          <div className="relative flex items-center gap-1">
            <div
              id="categories-scroll"
              className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-hide mask-fade flex-1 scroll-smooth snap-x snap-mandatory"
              dir="rtl"
            >
              {/* زر الكل */}
              <button
                type="button"
                onClick={() => setActiveCategoryId('all')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap border shrink-0 snap-start min-h-[38px] ${
                  activeCategoryId === 'all'
                    ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/25 scale-[1.02]'
                    : 'bg-dark-800/60 border-white/[0.06] text-slate-400 hover:bg-dark-800 hover:text-slate-200'
                }`}
              >
                <span>🍽️ الكل</span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-md tabular-nums ${
                    activeCategoryId === 'all' ? 'bg-white/20' : 'bg-dark-700/60'
                  }`}
                >
                  {totalMenuItemsCount}
                </span>
              </button>

              {/* أزرار الأقسام من قاعدة البيانات */}
              {categories.map((cat) => {
                const isActive = activeCategoryId === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategoryId(cat.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap border shrink-0 snap-start min-h-[38px] ${
                      isActive
                        ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/25 scale-[1.02]'
                        : 'bg-dark-800/60 border-white/[0.06] text-slate-400 hover:bg-dark-800 hover:text-slate-200'
                    }`}
                  >
                    <span>🍱 {cat.name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-md tabular-nums ${
                        isActive ? 'bg-white/20' : 'bg-dark-700/60'
                      }`}
                    >
                      {cat.items.length}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* قائمة المنتجات حسب الأقسام (Product Grid) */}
      <main className="max-w-4xl mx-auto px-3 sm:px-4 mt-6 sm:mt-8 space-y-8">
        {filteredCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center glass-card rounded-3xl">
            <span className="text-5xl mb-4">📥</span>
            <h3 className="text-xl font-black text-slate-300 mb-2">لا توجد نتائج</h3>
            <p className="text-slate-400 text-xs max-w-xs mx-auto leading-relaxed mb-6">
              لم نجد أي وجبة تطابق بحثك حالياً، جرب كلمة بحث أخرى أو اختر تصنيفاً آخر.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveCategoryId('all')
                setSearchQuery('')
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-amber-500/20"
            >
              عرض المنيو بالكامل
            </button>
          </div>
        ) : (
          filteredCategories.map((category) => (
            <section key={category.id} className="animate-fade-in-up">
              {/* عنوان القسم */}
              <div className="flex items-center gap-3 mb-4 px-1">
                <h2 className="font-black text-lg sm:text-xl text-white flex items-center gap-2">
                  <span className="text-amber-500">🔥</span>
                  <span>{category.name}</span>
                </h2>
                <div className="flex-1 h-px bg-gradient-to-l from-transparent via-white/10 to-transparent" />
                <span className="text-xs font-bold text-slate-500 tabular-nums">
                  {category.items.length} أصناف
                </span>
              </div>

              {/* بطاقات الأصناف */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {category.items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onAddToCart={handleAddToCart}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* شريط السلة العائم السفلي */}
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
        <div className="fixed top-4 inset-x-4 z-[70] max-w-md mx-auto animate-fade-in-up">
          <div className="bg-red-950/90 border border-red-500/50 backdrop-blur-xl rounded-2xl p-4 shadow-2xl flex items-start gap-3">
            <span className="text-red-400 text-xl shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-red-200 font-bold text-xs sm:text-sm">{submitError}</p>
            </div>
            <button
              onClick={() => setSubmitError('')}
              className="text-red-400 hover:text-red-200 text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

