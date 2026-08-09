'use client'

import { useState } from 'react'
import { GroupedMenuItem, CartLine } from '../types/menu'

interface MenuItemCardProps {
  item: GroupedMenuItem
  onAddToCart: (line: CartLine) => void
}

// بطاقة عرض الصنف في القائمة
export default function MenuItemCard({ item, onAddToCart }: MenuItemCardProps) {
  // الحجم الافتراضي المختار هو الأول في القائمة المتاحة
  const availableVariants = item.variants.filter(v => v.available)
  const [selectedVariantId, setSelectedVariantId] = useState(
    availableVariants[0]?.id || ''
  )
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  // البحث عن الحجم المختار حالياً
  const selectedVariant = item.variants.find(v => v.id === selectedVariantId)

  // إذا لم يكن هناك أي حجم متاح لهذا الصنف، نعتبر الصنف غير متوفر بالكامل
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

    // إعادة تصفير الكمية والملاحظات بعد الإضافة
    setQuantity(1)
    setNotes('')
  }

  return (
    <div className={`flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200 hover:shadow-md ${isFullyUnavailable ? 'opacity-60 select-none' : ''}`}>
      {/* تفاصيل الصنف الأساسية */}
      <div className="p-5 flex-1">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
            {item.description && (
              <p className="text-gray-500 text-sm mt-1 leading-relaxed">{item.description}</p>
            )}
          </div>
          {isFullyUnavailable && (
            <span className="bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-100 shrink-0">
              غير متوفر اليوم
            </span>
          )}
        </div>

        {/* اختيار الأحجام إذا كان هناك أكثر من خيار واحد متوفر */}
        {!isFullyUnavailable && (
          <div className="mt-4">
            {availableVariants.length > 1 ? (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400 block">اختر الحجم:</span>
                <div className="flex flex-wrap gap-2">
                  {availableVariants.map(variant => (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all border ${
                        selectedVariantId === variant.id
                          ? 'bg-amber-600 border-amber-600 text-white font-medium shadow-sm'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {variant.name} ({variant.price} ج.م)
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // إذا كان خيار واحد فقط (مثل "افتراضي")، نعرض السعر مباشرة
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-sm text-gray-400">السعر:</span>
                <span className="font-bold text-amber-600 text-lg">
                  {selectedVariant?.price} ج.م
                </span>
              </div>
            )}
          </div>
        )}

        {/* مدخل الملاحظات الخاصة بالطلب */}
        {!isFullyUnavailable && (
          <div className="mt-4">
            <input
              type="text"
              placeholder="مثال: بدون بصل، زيادة شطة..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-600"
            />
          </div>
        )}
      </div>

      {/* منطقة التحكم والإضافة للسلة */}
      {!isFullyUnavailable && (
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4 mt-auto">
          {/* التحكم في الكمية */}
          <div className="flex items-center border border-gray-200 bg-white rounded-lg overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 font-bold transition-colors"
            >
              -
            </button>
            <span className="px-3 text-sm font-semibold text-gray-800 min-w-[2.5rem] text-center">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(q => q + 1)}
              className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 font-bold transition-colors"
            >
              +
            </button>
          </div>

          {/* زرار الإضافة */}
          <button
            type="button"
            onClick={handleAdd}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors text-center shadow-sm"
          >
            إضافة للسلة
          </button>
        </div>
      )}
    </div>
  )
}
