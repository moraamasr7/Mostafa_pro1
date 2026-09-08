# PROMPT التنفيذي — إعادة هيكلة وتقسيم مشروع "مصطفى الجزار" حسب الماستر دايركتيف

الصق هذا الـ prompt كامل في أداة الـ AI Builder (Cursor / Claude Code / Antigravity) وهي متصلة بالـ repo الحالي `Mostafa_pro1`.

---

## 0. السياق — لازم تقرأه قبل أي خطوة

المشروع الحالي هو تطبيق Next.js واحد (App Router + TypeScript + Tailwind + Supabase JS)، وهو **MVP أول مرحلة فقط**: عميل يطلب Pickup بالكاش، وكاشير يشوف الطلبات Realtime. ده موثق في `antigravity_PROJECT_BRIEF.md` وواضح فيه صراحة إن الدليفري والـ Auth الحقيقي والتقارير والإشعارات "تتعمل عمدًا لاحقًا مش دلوقتي".

لكن قاعدة البيانات (`gazzar schema final.sql`) اتبنت من الأول أوسع بكتير من الـ MVP: فيها فعليًا:
- جداول كاملة لـ drivers / driver_shifts / delivery_trips / order_driver_assignments / delivery_outcomes
- restaurant_operating_hours / restaurant_special_closures / restaurant_schedule_overrides
- دوال RPC ذرية جاهزة: `create_order_secure`, `create_delivery_trip_secure`, `record_delivery_outcome_secure`, `complete_delivery_trip_secure`, `start_driver_shift_secure`, `end_driver_shift_secure`, `assign_order_to_driver_secure`, `reassign_order_secure`, `update_delivery_status_secure`, `update_order_status_secure`
- RLS مفعّل على كل الجداول مع policies منفصلة public/staff
- View `v_full_menu` وتريجر تلقائي لحساب `total_amount`

يعني: **الطبقة الخلفية (Supabase) أذكى وأنضج من الطبقة الأمامية (Next.js) الحالية بمراحل**. الكود الحالي في `src/app` و`src/components` بيستخدم جزء بسيط بس من الإمكانيات دي (orders + admin/orders بشكل أساسي، وفيه صفحات admin/drivers, admin/assignments, admin/schedule, admin/shift-control وdriver/page.tsx موجودة لكن غالبًا ناقصة/أولية).

**الاستنتاج المهم لأي قرار تقسيم:** الأولوية القصوى هي فحص كل route وكل API قبل الحذف أو النقل، لأن فيه احتمال حقيقي إن بعض صفحات الدليفري والـ shift-control مبنية جزئيًا بالفعل فوق RPCs موجودة وجاهزة، مش "غير موجودة من الأساس".

---

## 1. المطلوب منك (الـ AI Builder) بالضبط

نفّذ العملية دي **كأودت أول، وبعدين تنفيذ**، مش Rewrite مباشر. اتبع الفيز التالية بالترتيب ولا تقفز فيز.

### FIZ 1 — الجرد الكامل (Inventory)

قبل ما تلمس أي ملف، اعمل جرد كامل واطبعه كتقرير (ملف `AUDIT.md` في جذر المشروع) يشمل:

1. كل ملف في `src/app`, `src/components`, `src/lib`, `src/types` مع سطر وصف لوظيفته الفعلية (اقرأ الكود، متفترضش من اسم الملف).
2. لكل صفحة `admin/*` و`driver/*`: هل هي كاملة الوظيفة، ناقصة، أم مجرد placeholder فاضي؟
3. كل جدول/RPC/policy في `gazzar schema final.sql` مقابل: هل بيُستخدم فعليًا من أي كود frontend حاليًا (ابحث عن أسماء الجداول والدوال في `src/`)، ولا لسه "منتظر" استخدام؟
4. أي ملفات default من `create-next-app` مالهاش علاقة بالمنتج (زي `public/*.svg` الافتراضية، أمثلة الـ globals.css الافتراضية إلخ).

### FIZ 2 — التصنيف

صنّف كل عنصر اكتشفته في الجرد إلى واحدة من:

- **KEEP** — يفضل زي ما هو وينتقل مكانه الصح فقط
- **REFACTOR** — منطقه صح لكن شكله/موقعه محتاج تحسين قبل النقل
- **REPLACE** — بيتعارض مع الماستر دايركتيف (مثال: أي منطق أعمال حساس اتكتب في الـ client بدل الاعتماد على RPC الموجودة بالفعل في الـ schema)
- **REMOVE** — Boilerplate افتراضي أو كود ميت مالوش استخدام حقيقي
- **MISSING** — مطلوب حسب الماستر دايركتيف وغير موجود إطلاقًا (مثال: طبقة Policy/Configuration، لوحة owner، attendance، expenses، snapshotting تاريخي)
- **CONFLICT** — موجود لكن بيخالف قاعدة عمل مؤكدة (مثال: أي مكان بيحسب سعر أو مسافة توصيل من غير الرجوع لقيمة محفوظة وقت إنشاء الطلب)

اكتب الجدول ده في `AUDIT.md` قبل ما تكمل لأي خطوة تانية.

### FIZ 3 — إعادة الهيكلة الفعلية (فصل فعلي إلى Repo A / Repo B من الأول)

**لا تنقل الملفات عشوائيًا.** الهدف النهائي — وليس خطوة وسيطة — هو **repo-يان منفصلان تمامًا** (Git history منفصل، `package.json` منفصل، `node_modules` منفصل، نشر Vercel منفصل)، وبيشتركوا في نفس Supabase project فقط (نفس `NEXT_PUBLIC_SUPABASE_URL` / نفس الـ schema، من غير تكرار قاعدة بيانات ولا تكرار منطق أعمال):

```
                 ┌──────────────────┐
                 │     Supabase     │
                 │  Single Backend  │
                 └────────┬─────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
       ┌──────────────┐       ┌──────────────┐
       │ Repo A       │       │ Repo B       │
       │ Restaurant   │       │ Customer     │
       │ Operations   │       │ Online Menu  │
       └──────┬───────┘       └──────┬───────┘
              │                      │
              ▼                      ▼
          Vercel A               Vercel B
```

نفّذ الفصل بالخطوات دي بالترتيب:

1. **أنشئ مجلدين منفصلين تمامًا خارج بعض** (مش أبناء لبعض): `mostafa-restaurant-app/` و `mostafa-customer-app/`، كل واحد فيه `git init` مستقل، `package.json` مستقل، وكل الملفات اللي `create-next-app` بينشئها عادةً (next.config.ts, tsconfig.json, eslint.config.mjs, postcss.config.mjs) بنسخة خاصة بيه.
2. **schema واحد مشترك بره الاتنين**: أنشئ مجلد `mostafa-supabase/` منفصل (مش جوه أي من الـ repo-ين) يحتوي على `gazzar_schema_final.sql` (نسخة من "gazzar schema final.sql" باسم بدون مسافات) و`/migrations`. ده مش تطبيق Next.js، هو مصدر الحقيقة للـ schema بس، وممكن يتربط لاحقًا كـ Supabase project واحد يديره صاحب المشروع من لوحة Supabase مباشرة أو عبر Supabase CLI.
3. **متكررش منطق مشترك بين الاتنين نسخ-لصق**: أي نوع (type) أو دالة منطقية لازم تتكرر بالحرف في الـ repo-ين (زي `OrderStatus`, `ALLOWED_STATUS_TRANSITIONS`, شكل `MenuVariantRow`) — انسخها كـ ملف واحد صغير مستقل في كل repo، ووثّق في `ARCHITECTURE.md` بتاع كل repo إنه نسخة متعمدة ولازم تتزامن يدويًا لو الـ schema اتغيّر (ده حل عملي لغياب shared package بين repos منفصلة، وثّقه كـ افتراض حسب القسم 40).

**Repo A — `mostafa-restaurant-app/`** (owner/manager/cashier/kitchen/driver):
```
src/app/(auth)/...
src/app/dashboard/...          ← MISSING حاليًا، ينشأ فاضي بهيكل واضح
src/app/orders/...             ← من src/app/admin/orders الحالي (REFACTOR)
src/app/kitchen/...            ← MISSING، ينشأ كواجهة مبسطة تقرأ orders بحالة processing
src/app/drivers/...            ← من src/app/admin/drivers (REFACTOR)
src/app/assignments/...        ← من src/app/admin/assignments (REFACTOR)
src/app/driver-portal/...      ← من src/app/driver (REFACTOR)
src/app/shift-control/...      ← من src/app/admin/shift-control (REFACTOR/MISSING الجزء الخاص بقواعد الإغلاق)
src/app/schedule/...           ← من src/app/admin/schedule (KEEP/REFACTOR)
src/app/settings/...           ← MISSING، طبقة policy configuration
src/lib/supabase.ts            ← من src/lib/supabase.ts (KEEP، انسخ بدون تعديل منطقي)
src/lib/schedule.ts            ← من src/lib/schedule.ts (KEEP/REFACTOR)
src/types/orders.ts            ← KEEP (منطق الانتقالات ده صح ومطابق للماستر — القسم 25)
src/types/drivers.ts           ← KEEP/REFACTOR
```

**Repo B — `mostafa-customer-app/`** (العميل فقط):
```
src/app/page.tsx               ← من src/app/page.tsx الحالي (REFACTOR)
src/app/order/[id]/page.tsx    ← من src/app/order/[id] الحالي (KEEP/REFACTOR — استخدم tracking_token)
src/components/CartBar.tsx     ← KEEP
src/components/CartModal.tsx   ← KEEP
src/components/CheckoutForm.tsx← REFACTOR (لازم يستخدم create_order_secure RPC بدل insert مباشر لو مش كده حاليًا — تحقق بنفسك من الكود الفعلي)
src/components/MenuItemCard.tsx← KEEP
src/components/MenuPageClient.tsx ← KEEP/REFACTOR
src/lib/supabase.ts            ← نسخة client-only، صلاحيات anon key محدودة (public read فقط + RPC)
src/lib/imageCompression.ts    ← ينتقل هنا لو مستخدم فقط في رفع صور إيصال الدفع بتاع العميل
```

كل repo لازم يحتوي على `AUDIT.md` (نسخته الخاصة من نتيجة الفيز 1/2 المتعلقة بيه فقط) و`ARCHITECTURE.md` (قراراته وافتراضاته الخاصة).

**ملاحظات إلزامية أثناء النقل:**

- أي ملف بينقل، **اقرأه كامل الأول وافهم منطقه قبل النقل**، ولا تعمل نقل أعمى بالنسخ واللصق مع تغيير الـ imports فقط.
- ملف `src/lib/supabase.ts` الحالي بيستخدم anon key واحد — لازم تتأكد إن كل repo بيبقى ليه `.env.local` مستقل تمامًا (متاح من Vercel project منفصل)، وإن أي عملية حساسة (تغيير حالة الطلب، تعيين سائق، إغلاق شيفت) بتعدي على RPC محمي مش على `update`/`insert` مباشر من عميل يقدر ينتحل صفة كاشير — الحماية دي **خصوصًا مهمة هنا** لأن `mostafa-customer-app` مفروض يكون anon key بتاعه محدود جدًا (public read + RPC الطلب بس).
- **متلغيش** `gazzar schema final.sql` ولا تعيد كتابته من الصفر — انقله كما هو لمجلد `mostafa-supabase/` وابني عليه بملفات migration جديدة فقط.
- لو الـ AI Builder بيشتغل داخل بيئة مش بتدعم إنشاء أكتر من `git init` مستقل أو مجلدات خارج بعض فعليًا (بعض أدوات الـ agent مقيدة بمجلد المشروع الأصلي)، وقتها ابنِ التقسيم داخليًا كمجلدين منفصلين تمامًا في المستوى الجذري ووثّق في `ARCHITECTURE.md` إن الخطوة المتبقية هي فصلهم يدويًا لـ Git repositories منفصلة (`git init` + `git remote` منفصل لكل مجلد) كخطوة يدوية أخيرة من المستخدم نفسه — دي القيود التقنية فقط، مش تغيير في القرار المعماري.

### FIZ 4 — الحذف الآمن للملفات غير الهامة

احذف (REMOVE) فقط العناصر دي بعد التأكد إنها فعلاً غير مستخدمة:

- `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` — دي أيقونات افتراضية من `create-next-app`، احذفها إلا لو لقيت أي منها متستخدم فعليًا في `src/app` أو `src/components` (افحص بـ grep قبل الحذف).
- أي CSS افتراضي غير مستخدم في `globals.css` (فحص فعلي، مش افتراض).
- ملف `AGENTS.md` — ده ملف توليد تلقائي من أداة تطوير (Next.js dev agent rules)، مش جزء من منطق المنتج، ممكن يتشال أو يتسيب حسب الأداة اللي بتشتغل بيها، مالوش تأثير على المنتج نفسه.
- **لا تحذف** أي شيء من `gazzar schema final.sql`، ولا أي ملف types، ولا أي API route قبل ما تتأكد من الجرد في الفيز 1 إنه فعلاً REMOVE مش REFACTOR.

### FIZ 5 — سد الفجوات (MISSING) بأقل افتراض ممكن

بعد التقسيم، ابني فقط الحد الأدنى الآمن من العناصر الـ MISSING اللي الماستر دايركتيف يعتبرها حرجة لتشغيل النظام، وبالترتيب ده:

1. **طبقة Policy/Configuration** (القسم 10 و36): جدول/ملف إعدادات واحد (`restaurant_policies` أو مكافئ) يحتوي: نصف قطر التوصيل الأقصى، سعر الكيلومتر، الحد الأقصى لطلبات السائق النشطة، وقت بداية عمليات الطلبات، وقت أقرب إغلاق شيفت. لا تحطها كـ magic numbers متفرقة في الكود.
2. **قواعد إغلاق الشيفت** (القسم 17): تحقق فعلي قبل الإغلاق (طلبات مفتوحة، سائقين نشطين) مع رسالة توضح السبب، مش مجرد "متأكد؟".
3. **Snapshot تاريخي** (القسم 11 و35): تأكد إن أي قيمة مالية بتتسجل في `order_items`/`orders` وقت الإنشاء فقط، ومفيش أي مكان في الكود بيعيد حساب طلب قديم بإعدادات اليوم.
4. **لوحة owner مبسطة**: ملخص عملياتي واحد (طلبات نشطة، مكتملة، سائقين شغالين، هل الشيفت ممكن يقفل ولو لأ ليه) — مش تحليلات معقدة.

**لا تبني** أي حاجة من القسم 40 (ضرائب، خصومات، ولاء، كوبونات، دفع أونلاين، أو أي حاجة مش مذكورة صراحة) حتى لو الـ schema فيه عمود يسمح بيها.

### FIZ 6 — التحقق

بعد كل التنفيذ، اعمل:
1. Build فعلي لكل تطبيق على حدة (`restaurant-app` و`customer-app`) وتأكد إنهم يشتغلوا بدون أخطاء TypeScript.
2. راجع الـ RLS policies من `gazzar schema final.sql` وتأكد إن كل تطبيق بيقدر يعمل بس العمليات المسموح له بيها فعليًا (customer-app منعندوش صلاحية تعديل حالة طلب مثلاً).
3. اكتب في `ARCHITECTURE.md` أي قرار اضطريت تاخده من غير تأكيد صريح من المستخدم، عشان يراجعه لاحقًا.

---

## 2. قواعد صلبة ماينفعش تتجاوزها أثناء التنفيذ كله

- ممنوع Rewrite أعمى — كل نقل لازم مبني على قراءة فعلية للكود الموجود.
- ممنوع اختراع قواعد عمل غير مذكورة (لا ضرائب، لا خصومات، لا دفع أونلاين، لا أنظمة حجز).
- ممنوع حذف أو تعديل `gazzar schema final.sql` مباشرة — أي تغيير = migration جديد.
- ممنوع نقل أي منطق حساس (تغيير حالة طلب، تعيين سائق، حساب سعر توصيل) للتنفيذ في الـ client فقط — لازم يعدي على RPC.
- كل قرار غامض يتكتب في `ARCHITECTURE.md` كـ افتراض موثق، مش يتنفذ بصمت.
- النتيجة النهائية لازم تُبنى بنجاح فعليًا (`npm run build`) في التطبيقين قبل ما تعتبر المهمة خلصت.

ابدأ بالفيز 1 (الجرد) الآن واطبع `AUDIT.md` أول حاجة، وماتكملش لفيز 2 غير بعد ما أراجعه.
