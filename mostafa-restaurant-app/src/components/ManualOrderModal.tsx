'use client'

import { useState, useEffect } from 'react'

export interface MenuItemVariant {
  id: string
  variant_name: string
  price: number
  is_available: boolean
}

export interface MenuItem {
  id: string
  name: string
  description: string | null
  is_available: boolean
  item_variants: MenuItemVariant[]
}

export interface MenuCategory {
  id: string
  name: string
  display_order: number
  is_active: boolean
  menu_items: MenuItem[]
}

export interface SelectedItemState {
  variant_id: string
  variant_name: string
  item_name: string
  price: number
  quantity: number
  item_notes: string
}

interface ManualOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  dailyShiftNumber?: number
  openedBy?: string
}

export default function ManualOrderModal({
  isOpen,
  onClose,
  onSuccess,
  dailyShiftNumber,
  openedBy,
}: ManualOrderModalProps) {
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [loadingMenu, setLoadingMenu] = useState(false)
  const [menuError, setMenuError] = useState<string | null>(null)

  // Form states
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderType, setOrderType] = useState<'takeaway' | 'delivery' | 'dine_in'>('takeaway')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'instapay' | 'wallet'>('cash')
  const [orderNotes, setOrderNotes] = useState('')

  // Item selector state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [itemQuantity, setItemQuantity] = useState<number>(1)
  const [itemNotes, setItemNotes] = useState<string>('')

  // Selected items basket (Client-side view only, server binds real prices)
  const [basket, setBasket] = useState<SelectedItemState[]>([])

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Load menu when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoadingMenu(true)
      setMenuError(null)
      fetch('/api/menu')
        .then((res) => res.json())
        .then((data) => {
          if (data.categories) {
            setCategories(data.categories)
            if (data.categories.length > 0) {
              setSelectedCategoryId(data.categories[0].id)
            }
          } else {
            setMenuError(data.error || 'تعذر تحميل المنيو')
          }
        })
        .catch(() => setMenuError('تعذر الاتصال بالخادم لجلب قائمة الأصناف'))
        .finally(() => setLoadingMenu(false))
    } else {
      // Reset form
      setCustomerName('')
      setCustomerPhone('')
      setOrderType('takeaway')
      setDeliveryAddress('')
      setPaymentMethod('cash')
      setOrderNotes('')
      setBasket([])
      setSelectedCategoryId('')
      setSelectedItemId('')
      setSelectedVariantId('')
      setItemQuantity(1)
      setItemNotes('')
      setSubmitError(null)
    }
  }, [isOpen])

  // Current category items
  const currentCategory = categories.find((c) => c.id === selectedCategoryId)
  const activeMenuItems = (currentCategory?.menu_items || []).filter((m) => m.is_available)

  // Current selected item variants
  const currentItem = activeMenuItems.find((m) => m.id === selectedItemId)
  const activeVariants = (currentItem?.item_variants || []).filter((v) => v.is_available)

  // Auto-select first item when category changes
  useEffect(() => {
    if (activeMenuItems.length > 0) {
      setSelectedItemId(activeMenuItems[0].id)
    } else {
      setSelectedItemId('')
      setSelectedVariantId('')
    }
  }, [selectedCategoryId, categories])

  // Auto-select first variant when item changes
  useEffect(() => {
    if (activeVariants.length > 0) {
      setSelectedVariantId(activeVariants[0].id)
    } else {
      setSelectedVariantId('')
    }
  }, [selectedItemId])

  // Handle adding item to basket
  const handleAddItem = () => {
    if (!currentItem || !selectedVariantId) return

    const variant = activeVariants.find((v) => v.id === selectedVariantId)
    if (!variant) return

    const qty = Math.max(1, Math.min(50, itemQuantity))

    setBasket((prev) => {
      const existingIdx = prev.findIndex(
        (b) => b.variant_id === variant.id && b.item_notes === itemNotes.trim()
      )
      if (existingIdx >= 0) {
        const copy = [...prev]
        copy[existingIdx].quantity = Math.min(50, copy[existingIdx].quantity + qty)
        return copy
      }
      return [
        ...prev,
        {
          variant_id: variant.id,
          variant_name: variant.variant_name,
          item_name: currentItem.name,
          price: Number(variant.price),
          quantity: qty,
          item_notes: itemNotes.trim(),
        },
      ]
    })

    setItemQuantity(1)
    setItemNotes('')
  }

  // Handle removing item
  const handleRemoveItem = (idx: number) => {
    setBasket((prev) => prev.filter((_, i) => i !== idx))
  }

  // Handle quantity modification in basket
  const handleUpdateQty = (idx: number, delta: number) => {
    setBasket((prev) => {
      const copy = [...prev]
      const newQty = copy[idx].quantity + delta
      if (newQty <= 0) {
        return copy.filter((_, i) => i !== idx)
      }
      copy[idx].quantity = Math.min(50, newQty)
      return copy
    })
  }

  // Submit manual order to API
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!customerName.trim()) {
      setSubmitError('اسم العميل مطلوب')
      return
    }

    if (!/^01[0-9]{9}$/.test(customerPhone.trim())) {
      setSubmitError('رقم الموبايل غير صحيح (يجب أن يكون 11 رقماً ويبدأ بـ 01)')
      return
    }

    if (orderType === 'delivery' && (!deliveryAddress.trim() || deliveryAddress.trim().length < 5)) {
      setSubmitError('عنوان التوصيل مطلوب بحد أدنى 5 حروف عند اختيار الدليفري')
      return
    }

    if (basket.length === 0) {
      setSubmitError('يجب إضافة صنف واحد على الأقل إلى الطلب')
      return
    }

    setSubmitting(true)

    try {
      // NOTE: We do NOT send total_amount, order_source, daily_shift_id, or created_by_staff!
      // The server API and DB calculate and bind everything securely.
      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        order_type: orderType,
        payment_method: paymentMethod,
        delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : null,
        notes: orderNotes.trim() || null,
        items: basket.map((b) => ({
          variant_id: b.variant_id,
          quantity: b.quantity,
          item_notes: b.item_notes || undefined,
        })),
      }

      const res = await fetch('/api/admin/orders/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error || 'تعذر تسجيل الطلب اليدوي')
        return
      }

      onSuccess(`تم إنشاء الطلب اليدوي بنجاح (رقم #${data.order?.order_number || ''}) بمبلغ ${data.order?.total_amount || ''} ج.م`)
      onClose()
    } catch {
      setSubmitError('تعذر الاتصال بالسيرفر أثناء تسجيل الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh] animate-fade-in my-auto">
        {/* Modal Header */}
        <div className="bg-gradient-to-l from-amber-800 to-amber-700 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📝</span>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                تسجيل طلب يدوي (كاشير / صالة / هاتف)
              </h2>
              <p className="text-[11px] text-amber-200">
                {dailyShiftNumber ? `مرتبط بالوردية المفتوحة #${dailyShiftNumber} (${openedBy || 'الكاشير'})` : 'تسجيل مباشر بنظام الطلبات'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-2xl text-xs font-bold flex items-center justify-between">
              <span>⚠️ {submitError}</span>
              <button type="button" onClick={() => setSubmitError(null)} className="text-red-500 font-bold mr-2">
                ✕
              </button>
            </div>
          )}

          {menuError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-2xl text-xs font-bold">
              ⚠️ {menuError}
            </div>
          )}

          {/* Section 1: Customer Info */}
          <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-200 space-y-3">
            <h3 className="text-xs font-black text-gray-800 flex items-center gap-1.5">
              <span>👤</span> بيانات العميل
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  اسم العميل <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="مثال: أحمد محمود"
                  required
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  رقم الموبايل <span className="text-red-500">* (11 رقم يبدأ بـ 01)</span>
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  dir="ltr"
                  required
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-left bg-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Order Type & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Order Type */}
            <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200 space-y-2">
              <label className="block text-[11px] font-black text-gray-800">
                📦 نوع الطلب
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setOrderType('takeaway')}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all ${
                    orderType === 'takeaway'
                      ? 'bg-amber-700 text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  🏪 استلام
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('delivery')}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all ${
                    orderType === 'delivery'
                      ? 'bg-amber-700 text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  🛵 دليفري
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('dine_in')}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all ${
                    orderType === 'dine_in'
                      ? 'bg-amber-700 text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  🍽️ صالة
                </button>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200 space-y-2">
              <label className="block text-[11px] font-black text-gray-800">
                💳 طريقة الدفع
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2 px-2 text-center rounded-xl text-xs font-bold transition-all ${
                    paymentMethod === 'cash'
                      ? 'bg-amber-700 text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  💵 نقدي (كاش)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`py-2 px-2 text-center rounded-xl text-xs font-bold transition-all ${
                    paymentMethod === 'card'
                      ? 'bg-amber-700 text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  💳 بطاقة (فيزا)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('instapay')}
                  className={`py-2 px-2 text-center rounded-xl text-xs font-bold transition-all ${
                    paymentMethod === 'instapay'
                      ? 'bg-amber-700 text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  ⚡ إنستا باي
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`py-2 px-2 text-center rounded-xl text-xs font-bold transition-all ${
                    paymentMethod === 'wallet'
                      ? 'bg-amber-700 text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  📱 محفظة إلكترونية
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Delivery Address (Only visible when orderType === 'delivery') */}
          {orderType === 'delivery' && (
            <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-200 space-y-2 animate-fade-in">
              <label className="block text-[11px] font-black text-purple-900">
                📍 عنوان التوصيل بالتفصيل <span className="text-red-500">* (حد أدنى 5 حروف)</span>
              </label>
              <textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="الشارع، رقم العمارة، الشقة، علامة مميزة..."
                rows={2}
                required={orderType === 'delivery'}
                className="w-full px-3 py-2 text-xs border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              />
            </div>
          )}

          {/* Section 4: Item Selector */}
          <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-200 space-y-3">
            <h3 className="text-xs font-black text-gray-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>🥩</span> اختيار الأصناف من القائمة
              </span>
              {loadingMenu && <span className="text-[10px] text-amber-600 animate-pulse font-bold">جاري تحميل المنيو...</span>}
            </h3>

            {/* Category selection */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">القسم</label>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategoryId === cat.id
                        ? 'bg-amber-700 text-white'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Item and Variant Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">الصنف</label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {activeMenuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">الحجم / النوع</label>
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {activeVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.variant_name} ({Number(v.price)} ج.م)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quantity and Notes and Add Button */}
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <div className="w-24">
                <label className="block text-[10px] font-bold text-gray-500 mb-1">الكمية</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 text-xs font-black text-center border border-gray-300 rounded-xl bg-white"
                />
              </div>

              <div className="flex-1 min-w-[150px]">
                <label className="block text-[10px] font-bold text-gray-500 mb-1">ملاحظة للصنف (اختياري)</label>
                <input
                  type="text"
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="مثال: بدون بصل / طحينة زيادة"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl bg-white"
                />
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                disabled={!selectedVariantId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all disabled:opacity-50 whitespace-nowrap"
              >
                ➕ إضافة للسلة
              </button>
            </div>
          </div>

          {/* Section 5: Selected Items Basket */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black text-gray-800 flex items-center gap-1.5">
                <span>🛒</span> سلة الطلب ({basket.length} أصناف)
              </h3>
              {basket.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBasket([])}
                  className="text-[10px] font-bold text-red-600 hover:underline"
                >
                  تفريغ السلة
                </button>
              )}
            </div>

            {basket.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-xs text-gray-400 font-bold">
                لم يتم إضافة أصناف إلى السلة بعد. اختر الصنف ثم اضغط &quot;إضافة للسلة&quot;.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100 bg-white">
                {basket.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-900">{item.item_name}</span>
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                          {item.variant_name}
                        </span>
                      </div>
                      {item.item_notes && (
                        <p className="text-[10px] text-gray-500">📝 {item.item_notes}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(idx, -1)}
                          className="w-5 h-5 bg-white rounded shadow-sm flex items-center justify-center text-xs font-black text-gray-700 hover:bg-gray-50"
                        >
                          -
                        </button>
                        <span className="px-1.5 text-xs font-black text-gray-800">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(idx, 1)}
                          className="w-5 h-5 bg-white rounded shadow-sm flex items-center justify-center text-xs font-black text-gray-700 hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-red-500 hover:text-red-700 text-xs font-bold p-1"
                        title="حذف الصنف"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 6: General Notes */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 mb-1">
              ملاحظات عامة على الطلب (اختياري)
            </label>
            <input
              type="text"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="مثال: تجهيز سريع / استلام الساعة 4"
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || basket.length === 0}
              className="px-6 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-black transition-all shadow-md shadow-amber-900/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>جاري التسجيل...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>تسجيل الطلب اليدوي</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
