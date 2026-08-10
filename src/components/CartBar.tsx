'use client'

import { CartLine } from '@/types/menu'

interface CartBarProps {
  cart: CartLine[]
  onOpenCart: () => void
}

// الشريط السفلي الثابت — يظهر فقط لما تكون السلة فيها أصناف
export default function CartBar({ cart, onOpenCart }: CartBarProps) {
  if (cart.length === 0) return null

  // حساب إجمالي الأصناف والسعر
  const totalItems = cart.reduce((sum, line) => sum + line.quantity, 0)
  const totalPrice = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 animate-slide-up">
      {/* تدرج شفاف فوق الشريط عشان المحتوى اللي تحته ما يبقاش مقطوع فجأة */}
      <div className="h-6 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
      <div className="bg-white/95 backdrop-blur-xl border-t border-amber-200 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* ملخص السلة */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="text-2xl">🛒</span>
              {/* عداد الأصناف — الدائرة الحمراء فوق الأيقونة */}
              <span className="absolute -top-1.5 -start-1.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                {totalItems}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500">الإجمالي</p>
              <p className="font-extrabold text-gray-900 text-lg tabular-nums">
                {totalPrice.toFixed(0)} <span className="text-sm font-semibold text-gray-500">ج.م</span>
              </p>
            </div>
          </div>

          {/* زرار فتح السلة */}
          <button
            type="button"
            onClick={onOpenCart}
            className="bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-bold py-3 px-6 rounded-xl text-sm transition-all shadow-md shadow-amber-200/50 active:scale-[0.97]"
          >
            مراجعة الطلب
          </button>
        </div>
      </div>
    </div>
  )
}
