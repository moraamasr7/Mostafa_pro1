'use client'

import { useState } from 'react'
import { GroupedMenuItem, CartLine } from '@/types/menu'

interface MenuItemCardProps {
  item: GroupedMenuItem
  onAddToCart: (line: CartLine) => void
}

export default function MenuItemCard({ item, onAddToCart }: MenuItemCardProps) {
  const availableVariants = item.variants.filter((v) => v.available)
  const [selectedVariantId, setSelectedVariantId] = useState(
    availableVariants[0]?.id || ''
  )
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [justAdded, setJustAdded] = useState(false)

  const selectedVariant = item.variants.find((v) => v.id === selectedVariantId)
  const isFullyUnavailable = !item.available || availableVariants.length === 0

  const handleAdd = () => {
    if (!selectedVariant) return

    onAddToCart({
      variant_id: selectedVariant.id,
      item_name: item.name,
      variant_name: selectedVariant.name,
      price: selectedVariant.price,
      quantity: quantity,
      item_notes: notes.trim() || undefined,
    })

    setQuantity(1)
    setNotes('')
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 800)
  }

  const currentPrice = selectedVariant?.price || 0
  const totalPrice = currentPrice * quantity

  return (
    <div
      className={`group glass-card rounded-2xl md:rounded-3xl overflow-hidden flex flex-col transition-all duration-300 md:hover:shadow-2xl md:hover:shadow-amber-900/20 md:hover:-translate-y-1 ${
        isFullyUnavailable ? 'opacity-50 grayscale' : ''
      } ${justAdded ? 'border-amber-500 shadow-lg shadow-amber-500/20 ring-1 ring-amber-500/50' : ''}`}
    >
      <div className="p-4 md:p-6 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-base md:text-xl font-black text-white group-hover:text-amber-400 transition-colors leading-snug">
              {item.name}
            </h3>
            {isFullyUnavailable ? (
              <span className="bg-red-500/10 border border-red-500/30 text-red-400 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-extrabold shrink-0">
                غير متاح
              </span>
            ) : justAdded ? (
              <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-extrabold shrink-0 animate-fade-in">
                ✓ تمت الإضافة
              </span>
            ) : null}
          </div>

          {item.description && (
            <p className="text-slate-400 text-xs md:text-sm line-clamp-2 leading-relaxed mb-3">
              {item.description}
            </p>
          )}

          {!isFullyUnavailable && (
            <div className="mt-2 mb-3">
              {availableVariants.length > 1 ? (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    اختر الحجم:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableVariants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => setSelectedVariantId(variant.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
                          selectedVariantId === variant.id
                            ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/25 scale-[1.02]'
                            : 'bg-dark-800/80 border-white/10 text-slate-300 hover:bg-dark-700 hover:text-white'
                        }`}
                      >
                        {variant.name} · {variant.price} ج.م
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-amber-400 font-black text-xl md:text-2xl tabular-nums">
                    {currentPrice}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">ج.م</span>
                </div>
              )}
            </div>
          )}
        </div>

        {!isFullyUnavailable && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
            <input
              type="text"
              placeholder="ملاحظات الصنف (اختياري)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-dark-950/70 border border-white/[0.08] text-white rounded-xl text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition-all"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center bg-dark-800/80 p-1 rounded-xl border border-white/[0.08] shrink-0">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-7 h-7 flex items-center justify-center bg-dark-700/60 hover:bg-dark-600 text-white rounded-lg transition-all font-bold text-base active:scale-90"
                >
                  −
                </button>
                <span className="w-8 text-center text-xs font-black text-white tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-7 h-7 flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm transition-all font-bold text-base active:scale-90"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                className="flex-1 bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-extrabold py-2.5 px-3 rounded-xl text-xs md:text-sm transition-all shadow-md shadow-amber-900/30 flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <span>🔥 إضافة للطلب</span>
                <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums">
                  {totalPrice.toFixed(0)} ج.م
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
