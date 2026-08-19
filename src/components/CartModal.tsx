'use client'

import { CartLine } from '@/types/menu'

interface CartModalProps {
  cart: CartLine[]
  isOpen: boolean
  onClose: () => void
  onRemoveItem: (variantId: string) => void
  onUpdateQuantity: (variantId: string, newQuantity: number) => void
  onCheckout: () => void
}

// مودال مراجعة السلة — تصميم Glassmorphic داكن وأنيق
export default function CartModal({
  cart,
  isOpen,
  onClose,
  onRemoveItem,
  onUpdateQuantity,
  onCheckout,
}: CartModalProps) {
  if (!isOpen) return null

  const totalPrice = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      {/* خلفية مظلمة ضبابية */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* محتوى المودال */}
      <div className="relative w-full max-w-lg bg-dark-900/95 backdrop-blur-2xl border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up overflow-hidden">
        {/* هيدر المودال */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛒</span>
            <h2 className="font-black text-lg sm:text-xl text-white">سلة الطلب</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-dark-800 hover:bg-dark-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors text-sm font-bold border border-white/10"
          >
            ✕
          </button>
        </div>

        {/* قائمة الأصناف */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🛒</p>
              <p className="text-slate-400 font-bold text-sm">السلة فارغة حالياً</p>
            </div>
          ) : (
            cart.map((line) => (
              <div
                key={line.variant_id}
                className="bg-dark-800/60 rounded-2xl p-3.5 sm:p-4 flex items-start gap-3 border border-white/[0.06]"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white text-sm truncate">
                    {line.item_name}
                  </h3>
                  {line.variant_name !== 'افتراضي' && (
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      {line.variant_name}
                    </p>
                  )}
                  {line.item_notes && (
                    <p className="text-xs text-amber-400 mt-1 truncate">
                      📝 {line.item_notes}
                    </p>
                  )}
                  <p className="text-amber-400 font-black text-sm mt-1.5 tabular-nums">
                    {(line.price * line.quantity).toFixed(0)} <small className="text-[10px]">ج.م</small>
                  </p>
                </div>

                {/* التحكم بالكمية */}
                <div className="flex items-center gap-0 border border-white/10 bg-dark-900/80 rounded-xl overflow-hidden shadow-sm shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (line.quantity <= 1) {
                        onRemoveItem(line.variant_id)
                      } else {
                        onUpdateQuantity(line.variant_id, line.quantity - 1)
                      }
                    }}
                    className="px-3 py-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400 font-bold transition-colors text-sm"
                  >
                    {line.quantity <= 1 ? '🗑' : '−'}
                  </button>
                  <span className="px-2.5 text-xs font-black text-white min-w-[1.75rem] text-center tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.variant_id, line.quantity + 1)}
                    className="px-3 py-1.5 text-slate-400 hover:bg-amber-500/20 hover:text-amber-400 font-bold transition-colors text-sm"
                  >
                    +
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ملخص وزرار إتمام الطلب */}
        {cart.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-dark-950/60 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-bold text-sm">الإجمالي</span>
              <span className="font-black text-xl text-amber-400 tabular-nums">
                {totalPrice.toFixed(0)} <small className="text-xs text-white">ج.م</small>
              </span>
            </div>
            <button
              type="button"
              onClick={onCheckout}
              className="w-full bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-extrabold py-3.5 rounded-2xl text-base transition-all shadow-lg shadow-amber-900/30 active:scale-[0.98]"
            >
              متابعة وإتمام الطلب
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

