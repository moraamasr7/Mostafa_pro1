# مطعم مصطفى الجزار — منيو رقمي + طلب استلام (MVP)

هذا الملف هو الـ Brief الكامل. الصقه في Cursor (Composer / Agent mode) كـ prompt أول واحد، وخليه ينفذ الخطوات بالترتيب.

---

## 1) نظرة عامة على المشروع

نظام طلبات بسيط لمطعم لحوم (مصطفى الجزار) بيتكون من تطبيق واحد بجزئين:

- **صفحة عميل (`/`)**: يشوف المنيو، يضيف للسلة، يبعت طلب استلام من الفرع (Pickup فقط، دفع كاش فقط — مفيش أونلاين payment في النسخة دي).
- **لوحة كاشير (`/admin/orders`)**: تستقبل الطلبات لحظياً (Supabase Realtime)، وتقدر تغيّر حالة كل طلب.

قاعدة البيانات جاهزة بالفعل على Supabase (schema كامل: categories, menu_items, item_variants, orders, order_items + view اسمها `v_full_menu` + Realtime مفعّل على orders/order_items).

**مهم:** المنيو كامل موجود في قاعدة البيانات، لكن أول نسخة تعرض بس الأقسام اللي `is_active = true` (سندوتشات وطلبات). الـ frontend لازم يفلتر على أساس كده، مش يفترض إن كل الأقسام لازم تتعرض.

---

## 2) الـ Stack

- **Next.js 14+ (App Router)** — TypeScript
- **Tailwind CSS** للتنسيق
- **Supabase JS client** (`@supabase/supabase-js`) — قراءة المنيو + كتابة/قراءة الطلبات + الاشتراك في Realtime
- **Vercel** للنشر لاحقًا (مش دلوقتي، أول حاجة نشغّل local)
- بدون أي auth provider معقد في البداية — لوحة الكاشير محمية بـ password بسيط أو Supabase Auth email/password (اختر إيه أسهل، وده يتفعل في مرحلة تالية قبل ما ننشر فعليًا)

---

## 3) خطوات التنفيذ بالترتيب

### الخطوة 1 — تأسيس المشروع
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
npm install @supabase/supabase-js
```

### الخطوة 2 — متغيرات البيئة
أنشئ `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
(القيم هجيبها من إعدادات مشروع Supabase وهحطها بنفسي — سيب المتغيرات فاضية دلوقتي)

### الخطوة 3 — Supabase client
أنشئ `src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### الخطوة 4 — الأنواع (Types)
أنشئ `src/types/menu.ts` بناءً على الـ view `v_full_menu`:
```typescript
export interface MenuVariantRow {
  category_id: string
  category_name: string
  category_order: number
  item_id: string
  item_name: string
  item_description: string | null
  item_available: boolean
  variant_id: string
  variant_name: string
  price: number
  variant_available: boolean
}

export interface CartLine {
  variant_id: string
  item_name: string
  variant_name: string
  price: number
  quantity: number
  item_notes?: string
}
```

### الخطوة 5 — صفحة المنيو والطلب (`/`)
- اقرأ من `v_full_menu` عبر `supabase.from('v_full_menu').select('*')`
- جمّع الصفوف حسب `category_name` ثم `item_name` (كل صنف ممكن يكون له أكتر من variant/سعر)
- لكل صنف: اعرض الاسم والوصف، وأزرار/قائمة لاختيار الحجم (variant) والسعر
- سلة (Cart) في React state (useState/useReducer) — مفيش حاجة في localStorage
- زرار "إتمام الطلب" يفتح فورم: الاسم، رقم الموبايل، ملاحظات (اختياري)
- عند التأكيد:
  1. `insert` في جدول `orders` بـ `order_type = 'takeaway'` و `status = 'pending'`
  2. `insert` في جدول `order_items` لكل سطر في السلة (خد الأسعار من الـ cart snapshot، مش استعلام تاني)
  3. اعرض للعميل رقم الطلب (`order_number`) وشاشة تأكيد بسيطة

### الخطوة 6 — لوحة الكاشير (`/admin/orders`)
- استعلام أولي: كل الطلبات اللي `status != 'completed' AND status != 'cancelled'`، مرتبة بالأحدث
- **Realtime subscription** على جدول `orders` (وربما `order_items`) عشان الطلب الجديد يظهر فورًا من غير refresh — استخدم `supabase.channel(...).on('postgres_changes', ...)`
- لكل طلب: اعرض رقم الطلب، اسم العميل، رقم الموبايل، الأصناف (join مع order_items)، الإجمالي، والحالة الحالية
- أزرار لتغيير الحالة بالترتيب المنطقي: `pending → processing → completed` (أو `cancelled` في أي وقت)
- تحديث الحالة = `update` على جدول `orders`

### الخطوة 7 — تصميم بسيط
- استخدم Tailwind فقط، بدون أي مكتبة UI تقيلة
- الاتجاه RTL لكل الصفحات (`dir="rtl"` على `<html>`)، والخط يدعم العربي بوضوح
- لوحة الكاشير تصميمها لازم يكون واضح على تابلت (أزرار كبيرة، تباين قوي بين الحالات)

---

## 4) حاجات تتعمل عمدًا لاحقًا مش دلوقتي

- الدفع الأونلاين
- التوصيل (order_type = 'delivery') — العمود موجود في الـ schema لكن مش هنستخدمه دلوقتي
- Auth حقيقي للوحة الكاشير (اتفعل قبل الإطلاق الفعلي مباشرة، مش أثناء التطوير)
- تقرير نهاية الوردية لصاحب المطعم (ملخص يومي) — مرحلة تالية بعد ما نتأكد إن الطلبات بتتسجل صح
- إشعارات فورية لصاحب المطعم (واتساب/تيليجرام webhook)

**لا تبني أي حاجة من دول دلوقتي حتى لو بدت سهلة — ركز بس على: العميل يقدر يطلب، والكاشير يشوف الطلب ويغيّر حالته.**
