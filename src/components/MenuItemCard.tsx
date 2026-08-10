'use client'

import { useState } from 'react'
import { GroupedMenuItem, CartLine } from '@/types/menu'

interface MenuItemCardProps {
  item: GroupedMenuItem
  onAddToCart: (line: CartLine) => void
}

// بطاقة عرض الصنف — كل صنف يعرض أحجامه وسعره وزرار إضافة
export default function MenuItemCard({ item, onAddToCart }: MenuItemCardProps) {
  const availableVariants = item.variants.filter(v => v.available)
  // الحجم الافتراضي المختار هو أول واحد متوفر
  const [selectedVariantId, setSelectedVariantId] = useState(
    availableVariants[0]?.id || ''
  )
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  // لتأثير بصري سريع بعد الإضافة للسلة
  const [justAdded, setJustAdded] = useState(false)

  const selectedVariant = item.variants.find(v => v.id === selectedVariantId)

  // الصنف غير متوفر لو مفيش أي حجم متاح
  const isFullyUnavailable = !item.available || availableVariants.length === 0

  const handleAdd = () => {
    if (!selectedVariant) return

    onAddToCart({
      variant_id: selectedVariant.id,
      item_name: item.name,
      variant_name: selectedVariant.name,
      price: selectedVariant.price,
      quantity: quantity,
      item_notes: notes.trim() || undefined
    })

    // إعادة تصفير بعد الإضافة + إظهار تأثير بصري مؤقت
    setQuantity(1)
    setNotes('')
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 600)
  }

  return (
    <div
      className={`flex flex-col bg-white rounded-2xl shadow-sm border overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${
        isFullyUnavailable
          ? 'opacity-50 border-gray-200 grayscale'
          : justAdded
            ? 'border-green-400 shadow-green-100 ring-2 ring-green-200'
            : 'border-gray-100 hover:border-amber-200'
      }`}
    >
      {/* تفاصيل الصنف */}
      <div className="p-5 flex-1">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1">
            <h3 className="font-bold text-lg text-gray-900 leading-tight">
              {item.name}
            </h3>
            {item.description && (
              <p className="text-gray-500 text-sm mt-1.5 leading-relaxed">
                {item.description}
              </p>
            )}
          </div>
          {isFullyUnavailable && (
            <span className="bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-100 shrink-0 whitespace-nowrap">
              غير متوفر
            </span>
          )}
          {justAdded && !isFullyUnavailable && (
            <span className="bg-green-50 text-green-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-100 shrink-0 animate-fade-in">
              ✓ تمت الإضافة
            </span>
          )}
        </div>

        {/* اختيار الأحجام */}
        {!isFullyUnavailable && (
          <div className="mt-4">
            {availableVariants.length > 1 ? (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400 block">
                  اختر الحجم:
                </span>
                <div className="flex flex-wrap gap-2">
                  {availableVariants.map(variant => (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`px-3 py-1.5 rounded-xl text-sm transition-all duration-200 border ${
                        selectedVariantId === variant.id
                          ? 'bg-amber-600 border-amber-600 text-white font-semibold shadow-sm shadow-amber-200'
                          : 'border-gray-200 text-gray-700 hover:bg-amber-50 hover:border-amber-300'
                      }`}
                    >
                      {variant.name} · {variant.price} ج.م
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* سعر مباشر لو حجم واحد فقط */
              <div className="flex items-center gap-1.5 mt-1">
                <span className="font-extrabold text-amber-600 text-xl">
                  {selectedVariant?.price}
                </span>
                <span className="text-sm text-gray-400">ج.م</span>
              </div>
            )}
          </div>
        )}

        {/* ملاحظات الصنف */}
        {!isFullyUnavailable && (
          <div className="mt-3">
            <input
              type="text"
              placeholder="ملاحظات... (بدون بصل، زيادة شطة)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 bg-gray-50/50 transition-all placeholder:text-gray-300"
            />
          </div>
        )}
      </div>

      {/* منطقة الإضافة للسلة */}
      {!isFullyUnavailable && (
        <div className="p-4 bg-gradient-to-t from-amber-50/60 to-transparent border-t border-gray-100 flex items-center justify-between gap-3 mt-auto">
          {/* التحكم بالكمية */}
          <div className="flex items-center border border-gray-200 bg-white rounded-xl overflow-hidden shrink-0 shadow-sm">
            <button
              type="button"
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="px-3.5 py-2 text-gray-500 hover:bg-gray-100 font-bold transition-colors text-lg"
            >
              −
            </button>
            <span className="px-3 text-sm font-bold text-gray-800 min-w-[2.5rem] text-center tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(q => q + 1)}
              className="px-3.5 py-2 text-gray-500 hover:bg-gray-100 font-bold transition-colors text-lg"
            >
              +
            </button>
          </div>

          {/* زرار الإضافة */}
          <button
            type="button"
            onClick={handleAdd}
            className="flex-1 bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all text-center shadow-sm shadow-amber-200 active:scale-[0.97]"
          >
            إضافة · {((selectedVariant?.price || 0) * quantity).toFixed(0)} ج.م
          </button>
        </div>
      )}
    </div>
  )
}
