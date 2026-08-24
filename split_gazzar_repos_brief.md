# فصل مشروع مصطفى الجزار لمستودعين مستقلين — Menu / Ops

الصق هذا الملف كامل كـ prompt أول للـ AI Agent (Cursor / Antigravity / Claude Code)، وخليه ينفذ الخطوات بالترتيب من غير ما يتخطى وحدة.

---

## 0) المبدأ الأساسي — اقرأه قبل أي خطوة

المشروعين **مستقلين بالكود بالكامل**. مفيش أي `import` من مستودع للتاني، ومفيش monorepo، ومفيش npm package مشترك. نقطة الاتصال الوحيدة بينهم هي **Supabase project واحد** (نفس `SUPABASE_URL`)، وده كافٍ لأن قاعدة البيانات هي "العقد" المشترك بينهم — مش الكود.

- **Menu repo** = تطبيق العميل (Next.js). بيقرأ المنيو ويكتب طلبات بس.
- **Ops repo** = تطبيق تشغيل المطعم (الكاشير + الطيارين + الجدول). بيقرأ ويعدّل كل حاجة.

لو الـ agent اقترح إنشاء shared types package أو git submodule — ارفض واطلب منه يولّد types لوحده في كل مستودع بأمر Supabase CLI (خطوة 4).

---

## 1) توزيع الملفات الحالية من المستودع الواحد

| الملف/المجلد الحالي | يروح لـ |
|---|---|
| `src/app/page.tsx` | Menu |
| `src/app/order/[id]/*` | Menu |
| `src/components/CartBar.tsx`, `CartModal.tsx`, `CheckoutForm.tsx`, `MenuItemCard.tsx`, `MenuPageClient.tsx` | Menu |
| `src/app/api/orders/route.ts` | Menu (endpoint إنشاء الطلب اللي بيستخدمه العميل) |
| `src/app/admin/*` (كل الصفحات) | Ops |
| `src/app/driver/*` | Ops |
| `src/app/api/admin/*`, `src/app/api/driver/*` | Ops |
| `src/lib/schedule.ts` | Ops |
| `src/lib/supabase.ts` | يتكرر (نسخة مستقلة) في المستودعين |
| `src/lib/imageCompression.ts` | حسب مين بيستخدمه فعليًا (على الأرجح Ops لو بيرفع صور إيصالات) |
| `gazzar schema final.sql` | يفضل في **Ops repo بس** — هو مصدر الحقيقة الوحيد للـ schema، ومنه بيتعمل أي migration جديد |

---

## 2) متغيرات البيئة لكل مستودع

كلاهما بيتصل بـ **نفس** `SUPABASE_URL`، لكن بحدود مختلفة يفرضها RLS مش الكود:

**Menu repo `.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=<نفس القيمة في المستودعين>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<نفس anon key>
```

**Ops repo `.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=<نفس القيمة>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<نفس anon key>
ADMIN_PASSCODE=<قيمة قوية، لا تسيبها فاضية أو تعتمد على fallback في الكود>
```

⚠️ **لا تستخدم `service_role key` في أي من الـ frontend apps.** الحماية الحقيقية بتيجي من RLS policies + الـ HTTP-only cookie auth الموجودة في `api/admin/login`, مش من مفتاح أقوى.

---

## 3) مراجعة RLS — لازم تتم قبل تفعيل أي مستودع

Supabase مش بيعرف "مين بيتصل من app 1 ولا app 2" — الاتنين بيستخدموا نفس anon key. يبقى الفصل الأمني كله لازم يكون في:

1. **RLS policies على مستوى الجدول** (اللي موجودة في `gazzar schema final.sql`)
2. **التحقق من session الأدمن داخل API routes** في Ops repo (موجود بالفعل — الكوكي الـ HTTP-only)

اطلب من الـ agent يراجع كل policy فيها `USING (true)` ويسأل: هل ده مقصود يكون عام (زي قراءة المنيو) ولا لازم يتقيّد؟ خاصة جداول `drivers`, `driver_shifts`, `order_driver_assignments`, `delivery_outcomes` — دلوقتي `SELECT` عليهم عام بالكامل رغم التعليق في الكود بيقول "Staff Only".

---

## 4) توليد الأنواع (Types) في كل مستودع لوحده

كل مستودع يشغّل نفس الأمر ضد نفس الـ project، ويحتفظ بنسخته من الملف محليًا — من غير مشاركة package:

```bash
npx supabase gen types typescript --project-id <PROJECT_ID> --schema public > src/types/database.ts
```

يتعاد تشغيله يدويًا (أو في CI) كل ما الـ schema يتغيّر من Ops repo.

---

## 5) الـ Realtime — نقطة التكامل الفعلية

Ops repo هو اللي بيعمل `subscribeToOrders` على جدول `orders` (زي الكود الحالي في `admin/orders/page.tsx`). ده مش محتاج أي تنسيق مع Menu repo — بمجرد ما Menu repo يعمل `insert` في `orders`، الـ Realtime channel في Ops هيستقبله تلقائيًا لأنه نفس الـ project. **الاختبار الوحيد المطلوب:** اعمل طلب من Menu وشوفه ظاهر لحظيًا في Ops من غير refresh.

---

## 6) الـ Schema — قاعدة واحدة: التعديل من مكان واحد بس

أي `ALTER TABLE` أو migration جديد يتكتب في `gazzar schema final.sql` في **Ops repo فقط**، وميتنفذش من Menu repo أبدًا. لو Menu repo محتاج عمود جديد (مثلاً)، الطلب يتكتب كملاحظة ويتنفذ عبر Ops/Supabase SQL editor.

---

## 7) النشر (Deployment)

- Menu repo → Vercel project منفصل، دومين زي `gazzar.com` أو `menu.gazzar.com`
- Ops repo → Vercel project منفصل، دومين زي `ops.gazzar.com`
- كل project له متغيرات بيئة منفصلة في Vercel (حتى لو القيم متطابقة جزئيًا)

---

## 8) معايير القبول (Definition of Done)

- [ ] مستودعين منفصلين، كل واحد `npm install && npm run dev` يشتغل لوحده من غير أي اعتماد على التاني
- [ ] Menu repo مفيهوش أي كود admin/driver
- [ ] Ops repo مفيهوش صفحة العميل أو السلة
- [ ] طلب اتعمل من Menu ظهر Realtime في Ops
- [ ] كل RLS policy فيها `USING (true)` اتراجعت وكان القرار مقصود
- [ ] `ADMIN_PASSCODE` مفيهوش fallback ضعيف في الكود
