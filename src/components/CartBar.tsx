'use client'

import { CartLine } from '@/types/menu'

interface CartBarProps {
  cart: CartLine[]
  onOpenCart: () => void
}

// الشريط السفلي العائم الملتصق — تصميم Glassmorphic مطور يظهر عند إضافة منتجات للسلة
export default function CartBar({ cart, onOpenCart }: CartBarProps) {
  if (cart.length === 0) return null

  const totalItems = cart.reduce((sum, line) => sum + line.quantity, 0)
  const totalPrice = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

  return (
    <div
      className="fixed z-50 max-w-lg mx-auto left-3 right-3 sm:left-4 sm:right-4 animate-slide-up"
      style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <button
        type="button"
        onClick={onOpenCart}
        className="group w-full bg-dark-900/92 text-white p-2.5 pr-4 sm:pr-5 rounded-[1.75rem] sm:rounded-[2rem] shadow-2xl shadow-black/60 border border-white/[0.1] backdrop-blur-xl flex items-center justify-between gap-2 transition-all active:scale-[0.98] min-h-[3.5rem]"
        aria-label={`متابعة الطلب: ${totalItems} عناصر في السلة، الإجمالي ${totalPrice.toFixed(0)} ج.م`}
      >
        {/* الجانب الأيمن: أيقونة وعدّاد الأصناف */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-amber-500 rounded-full flex items-center justify-center relative shadow-lg shadow-amber-500/30 group-hover:scale-105 transition-transform">
            <span className="text-white text-xl sm:text-2xl">🛒</span>
            <span className="absolute -top-0.5 -right-0.5 bg-white text-amber-600 text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-amber-500 ring-2 ring-dark-900 tabular-nums">
              {totalItems}
            </span>
          </div>
          <div className="flex flex-col items-start min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">إجمالي السلة</span>
            <span className="font-black text-lg sm:text-xl text-white truncate tabular-nums">
              {totalPrice.toFixed(0)} <small className="text-xs text-amber-400 font-bold">ج.م</small>
            </span>
          </div>
        </div>

        {/* الجانب الأيسر: الإجراء */}
        <div className="bg-dark-800 text-white flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-3 sm:py-3.5 rounded-xl sm:rounded-[1.5rem] font-black text-xs sm:text-sm group-hover:bg-amber-500 transition-colors border border-white/[0.08] shrink-0">
          <span>عرض السلة</span>
          <span className="text-base transition-transform group-hover:-translate-x-1">←</span>
        </div>
      </button>
    </div>
  )
}

