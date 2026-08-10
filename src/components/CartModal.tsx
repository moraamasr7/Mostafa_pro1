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

// مودال مراجعة السلة — يعرض الأصناف المختارة مع إمكانية التعديل
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fade-in">
      {/* خلفية مظلمة ضبابية — الضغط عليها يقفل المودال */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* محتوى المودال */}
      <div className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up">
        {/* هيدر المودال */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-extrabold text-xl text-gray-900">سلة الطلب</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* قائمة الأصناف */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🛒</p>
              <p className="text-gray-400 font-medium">السلة فاضية</p>
            </div>
          ) : (
            cart.map((line) => (
              <div
                key={line.variant_id}
                className="bg-gray-50/80 rounded-2xl p-4 flex items-start gap-3 border border-gray-100"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-sm truncate">
                    {line.item_name}
                  </h3>
                  {/* اسم الحجم لو مش "افتراضي" */}
                  {line.variant_name !== 'افتراضي' && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {line.variant_name}
                    </p>
                  )}
                  {line.item_notes && (
                    <p className="text-xs text-amber-600 mt-1 truncate">
                      📝 {line.item_notes}
                    </p>
                  )}
                  <p className="text-amber-600 font-extrabold text-sm mt-1.5 tabular-nums">
                    {(line.price * line.quantity).toFixed(0)} ج.م
                  </p>
                </div>

                {/* التحكم بالكمية */}
                <div className="flex items-center gap-0 border border-gray-200 bg-white rounded-xl overflow-hidden shadow-sm shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      // لو الكمية 1 والمستخدم نقص، يتحذف الصنف بالكامل
                      if (line.quantity <= 1) {
                        onRemoveItem(line.variant_id)
                      } else {
                        onUpdateQuantity(line.variant_id, line.quantity - 1)
                      }
                    }}
                    className="px-3 py-1.5 text-gray-500 hover:bg-red-50 hover:text-red-500 font-bold transition-colors text-sm"
                  >
                    {line.quantity <= 1 ? '🗑' : '−'}
                  </button>
                  <span className="px-2.5 text-sm font-bold text-gray-800 min-w-[2rem] text-center tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.variant_id, line.quantity + 1)}
                    className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 font-bold transition-colors text-sm"
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
          <div className="p-5 border-t border-gray-100 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-medium">الإجمالي</span>
              <span className="font-extrabold text-xl text-gray-900 tabular-nums">
                {totalPrice.toFixed(0)} ج.م
              </span>
            </div>
            <button
              type="button"
              onClick={onCheckout}
              className="w-full bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-md shadow-amber-200/50 active:scale-[0.98]"
            >
              إتمام الطلب
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
