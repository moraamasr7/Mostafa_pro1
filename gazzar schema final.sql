-- ==============================================================================
-- مخطط قاعدة بيانات مطعم مصطفى الجزار — النسخة النهائية (منيو + طلبات) على Supabase
-- قابلة للتوسع: تقدر تضيف أقسام/أصناف/أحجام جديدة بدون تعديل بنية الجداول
-- ==============================================================================


-- ==============================================================================
-- الجزء الأول: هيكل الجداول (Tables)
-- ==============================================================================

-- 1) جدول الأقسام (مثال: السندوتشات، الطواجن، الطلبات...)
CREATE TABLE IF NOT EXISTS categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,        -- يتحكم في ترتيب ظهور القسم في المنيو
    is_active BOOLEAN DEFAULT true,     -- إخفاء قسم كامل مؤقتًا بدون حذفه
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2) جدول أصناف المنيو (كل صنف تابع لقسم واحد)
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,                   -- المكونات، مثلاً "كبدة - كفتة - سجق"
    is_available BOOLEAN DEFAULT true,  -- "خلص من المطبخ" بدون حذف الصنف
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3) جدول الأحجام/الخيارات والأسعار — هنا مصدر الحقيقة الوحيد للسعر
CREATE TABLE IF NOT EXISTS item_variants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    variant_name VARCHAR(100) NOT NULL, -- صغير / وسط / كبير / طلب / ربع / نص / كيلو / افتراضي
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4) جدول الطلبات
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number BIGINT GENERATED ALWAYS AS IDENTITY, -- رقم تسلسلي يظهر للكاشير/العميل
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    delivery_address TEXT,              -- فاضي لو استلام من المحل
    order_type VARCHAR(20) NOT NULL DEFAULT 'delivery'
        CHECK (order_type IN ('delivery', 'takeaway', 'dine_in')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'delivering', 'completed', 'cancelled')),
    total_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (total_amount >= 0), -- بيتحدث تلقائيًا (تريجر تحت)
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5) جدول عناصر الطلب — مرتبط بالـ variant عشان نعرف الحجم بالظبط
CREATE TABLE IF NOT EXISTS order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES item_variants(id) ON DELETE RESTRICT, -- يمنع مسح صنف له طلبات سابقة
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0), -- نسخة من السعر وقت الطلب (لو السعر اتغير بعدين)
    subtotal DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    item_notes TEXT,                     -- مثال: "من غير بصل"
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ==============================================================================
-- الجزء الثاني: الفهارس (Indexes) — تسريع الاستعلامات المتكررة
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_item ON item_variants(item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);


-- ==============================================================================
-- الجزء الثالث: تريجر تحديث إجمالي الطلب تلقائيًا
-- كل ما يتضاف/يتعدل/يتمسح صنف من order_items، إجمالي orders.total_amount يتحدث لوحده
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_order_total_amount()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE orders
    SET total_amount = COALESCE((
        SELECT SUM(subtotal)
        FROM order_items
        WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
    ), 0.00)
    WHERE id = COALESCE(NEW.order_id, OLD.order_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_recalculate_order_total
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION update_order_total_amount();


-- ==============================================================================
-- الجزء الرابع: View جاهز يجيب المنيو كامل باستعلام واحد (مريح جدًا للـ Frontend)
-- ==============================================================================
CREATE OR REPLACE VIEW v_full_menu AS
SELECT
    c.id AS category_id,
    c.name AS category_name,
    c.display_order AS category_order,
    m.id AS item_id,
    m.name AS item_name,
    m.description AS item_description,
    m.is_available AS item_available,
    v.id AS variant_id,
    v.variant_name,
    v.price,
    v.is_available AS variant_available
FROM categories c
JOIN menu_items m ON c.id = m.category_id
JOIN item_variants v ON m.id = v.item_id
WHERE c.is_active = true
ORDER BY c.display_order, m.name, v.price ASC;


-- ==============================================================================
-- الجزء الخامس: تفعيل الحماية RLS (Row Level Security)
-- ==============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- قراءة عامة للمنيو (أي حد يفتح الـ PWA يقدر يشوف الأصناف والأسعار)
CREATE POLICY "Public read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Public read menu_items" ON menu_items FOR SELECT USING (true);
CREATE POLICY "Public read item_variants" ON item_variants FOR SELECT USING (true);

-- الطلبات: أي حد يقدر ينشئ طلب ويقرأ الطلبات
CREATE POLICY "Public create orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Public create order_items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read order_items" ON order_items FOR SELECT USING (true);

-- تحديث حالة الطلب (مهم جدًا: من غيرها الكاشير مش هيقدر يغيّر الحالة من pending لـ processing... إلخ)
CREATE POLICY "Public update orders" ON orders FOR UPDATE USING (true);

-- ملاحظة أمان: السياسات دي مفتوحة للجميع عشان تبني وتختبر بسرعة.
-- قبل ما تنشر رابط الطلب على TikTok فعليًا، لازم تضيف auth لداشبورد الكاشير
-- وتقفل قراءة orders/order_items بحيث العميل يشوف طلبه هو بس، مش كل الطلبات.


-- ==============================================================================
-- الجزء السادس: تفعيل Realtime — عشان الداشبورد يستقبل الطلبات لحظيًا من غير refresh
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;


-- ==============================================================================
-- الجزء السابع: تعبئة بيانات منيو مطعم مصطفى الجزار بالكامل
-- ==============================================================================
DO $$
DECLARE
    -- معرفات الأقسام
    cat_sawani UUID;
    cat_hawawshi UUID;
    cat_rice UUID;
    cat_fatteh UUID;
    cat_new UUID;
    cat_sandwiches UUID;
    cat_plates UUID;
    cat_tawajen UUID;
    cat_kilo UUID;
    cat_camel_liver UUID;
    cat_baladi_beef UUID;
    cat_soup UUID;
    cat_extras UUID;

    -- متغير مساعد لتمرير id الصنف الأخير المُدرج إلى جدول الأحجام
    item_id UUID;
BEGIN
    -- إدخال الأقسام
    INSERT INTO categories (name, display_order) VALUES ('الصواني', 1) RETURNING id INTO cat_sawani;
    INSERT INTO categories (name, display_order) VALUES ('الحواوشي', 2) RETURNING id INTO cat_hawawshi;
    INSERT INTO categories (name, display_order) VALUES ('ركن الأرز', 3) RETURNING id INTO cat_rice;
    INSERT INTO categories (name, display_order) VALUES ('الفتة', 4) RETURNING id INTO cat_fatteh;
    INSERT INTO categories (name, display_order) VALUES ('الجديد عندنا', 5) RETURNING id INTO cat_new;
    INSERT INTO categories (name, display_order) VALUES ('السندوتشات', 6) RETURNING id INTO cat_sandwiches;
    INSERT INTO categories (name, display_order) VALUES ('الطلبات', 7) RETURNING id INTO cat_plates;
    INSERT INTO categories (name, display_order) VALUES ('الطواجن', 8) RETURNING id INTO cat_tawajen;
    INSERT INTO categories (name, display_order) VALUES ('الكيلو', 9) RETURNING id INTO cat_kilo;
    INSERT INTO categories (name, display_order) VALUES ('الكبدة الجملي', 10) RETURNING id INTO cat_camel_liver;
    INSERT INTO categories (name, display_order) VALUES ('لحمة بلدي محمرة باللية', 11) RETURNING id INTO cat_baladi_beef;
    INSERT INTO categories (name, display_order) VALUES ('الشوربة', 12) RETURNING id INTO cat_soup;
    INSERT INTO categories (name, display_order) VALUES ('الإضافات', 13) RETURNING id INTO cat_extras;

    -- ----------------------------------------------------
    -- 1. قسم الصواني
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name, description) VALUES (cat_sawani, 'صينية الصحاب', 'كبدة + قلب + كفتة + سجق + ممبار + كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 750.00);

    INSERT INTO menu_items (category_id, name, description) VALUES (cat_sawani, 'صينية الجزار', 'لحمة + طحال + كبدة + قلب + كفتة + سجق + ممبار + كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 1000.00);

    INSERT INTO menu_items (category_id, name, description) VALUES (cat_sawani, 'صينية الملوك', 'لحمة + طحال + كبدة + قلب + كفتة + سجق + ممبار + فشة + كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 1850.00);

    -- ----------------------------------------------------
    -- 2. قسم الحواوشي
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name) VALUES (cat_hawawshi, 'حواوشي سادة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 30.00), (item_id, 'كبير', 50.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_hawawshi, 'حواوشي موتزاريلا') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 40.00), (item_id, 'كبير', 60.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_hawawshi, 'حواوشي إضافة سجق') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 60.00), (item_id, 'كبير', 80.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_hawawshi, 'حواوشي إضافة سجق وموتزاريلا') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 70.00), (item_id, 'كبير', 90.00);

    -- ----------------------------------------------------
    -- 3. قسم ركن الأرز
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name) VALUES (cat_rice, 'أرز سادة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 25.00), (item_id, 'كبير', 35.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_rice, 'أرز كبدة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 80.00), (item_id, 'كبير', 100.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_rice, 'أرز سجق') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 80.00), (item_id, 'كبير', 100.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_rice, 'كشري فتة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 80.00), (item_id, 'كبير', 100.00);

    -- ----------------------------------------------------
    -- 4. قسم الفتة
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name) VALUES (cat_fatteh, 'فتة سادة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 30.00), (item_id, 'كبير', 40.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_fatteh, 'فتة لحمة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كبير', 270.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_fatteh, 'فتة كوارع') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 200.00), (item_id, 'كبير', 250.00);

    -- ----------------------------------------------------
    -- 5. قسم الجديد عندنا
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name) VALUES (cat_new, 'ورقة لحمة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 250.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_new, 'ورقة سجق') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 200.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_new, 'ورقة كبدة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 200.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_new, 'ورقة مشكل') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 200.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_new, 'ورقة كوارع') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 200.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_new, 'مكرونة جريل مشكل') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 100.00), (item_id, 'كبير', 120.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_new, 'مكرونة جريل كبدة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 100.00), (item_id, 'كبير', 120.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_new, 'مكرونة جريل سجق') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 100.00), (item_id, 'كبير', 120.00);

    -- ----------------------------------------------------
    -- 6. قسم السندوتشات
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name, description) VALUES (cat_sandwiches, 'رغيف الجزار', 'لحمة - طحال - كبدة - كفتة - سجق - ممبار - قلب - كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 70.00), (item_id, 'كبير', 80.00);

    INSERT INTO menu_items (category_id, name, description) VALUES (cat_sandwiches, 'رغيف مشكل', 'كبدة - كفتة - سجق - ممبار - قلب - كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 40.00), (item_id, 'وسط', 50.00), (item_id, 'كبير', 60.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_sandwiches, 'رغيف كبدة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 50.00), (item_id, 'وسط', 60.00), (item_id, 'كبير', 70.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_sandwiches, 'رغيف قلب') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 50.00), (item_id, 'وسط', 60.00), (item_id, 'كبير', 70.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_sandwiches, 'رغيف كفتة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 50.00), (item_id, 'وسط', 60.00), (item_id, 'كبير', 70.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_sandwiches, 'رغيف سجق') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 50.00), (item_id, 'وسط', 60.00), (item_id, 'كبير', 70.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_sandwiches, 'رغيف ممبار') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 50.00), (item_id, 'كبير', 70.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_sandwiches, 'رغيف لحمة راس') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 70.00), (item_id, 'كبير', 80.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_sandwiches, 'رغيف طحال') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 70.00), (item_id, 'كبير', 80.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_sandwiches, 'رغيف فشة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 60.00), (item_id, 'كبير', 70.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_sandwiches, 'رغيف كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 50.00), (item_id, 'وسط', 60.00), (item_id, 'كبير', 70.00);

    -- ----------------------------------------------------
    -- 7. قسم الطلبات
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name, description) VALUES (cat_plates, 'طلب الجزار', 'لحمة - طحال - كبدة - كفتة - سجق - ممبار - قلب - فشة - كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 160.00), (item_id, 'نص', 320.00);

    INSERT INTO menu_items (category_id, name, description) VALUES (cat_plates, 'طلب مشكل', 'كبدة - كفتة - سجق - ممبار - قلب - كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 80.00), (item_id, 'ربع', 120.00), (item_id, 'نص', 240.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب كبدة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 150.00), (item_id, 'نص', 300.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب قلب') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 150.00), (item_id, 'نص', 300.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب كفتة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 150.00), (item_id, 'نص', 300.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب سجق') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 150.00), (item_id, 'نص', 300.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب ممبار') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 80.00), (item_id, 'ربع', 120.00), (item_id, 'نص', 240.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب لحمة راس') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 160.00), (item_id, 'نص', 320.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب طحال') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 160.00), (item_id, 'نص', 320.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب طحال ولحمة راس وممبار') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 160.00), (item_id, 'نص', 320.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب فشة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 160.00), (item_id, 'نص', 320.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'طلب كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'طلب', 100.00), (item_id, 'ربع', 150.00), (item_id, 'نص', 300.00);

    -- ----------------------------------------------------
    -- 8. قسم الطواجن
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name) VALUES (cat_tawajen, 'طاجن كوارع') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 250.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_tawajen, 'طاجن عكاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 400.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_tawajen, 'طاجن فتة كوارع') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 200.00);

    INSERT INTO menu_items (category_id, name, description) VALUES (cat_tawajen, 'طاجن العريس', 'كوارع - لحمة - عكاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 450.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_tawajen, 'طاجن ورق عنب بالكوارع') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 250.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_tawajen, 'طاجن ملوخية') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 60.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_tawajen, 'طاجن ورق عنب سادة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 100.00);

    -- ----------------------------------------------------
    -- 9. قسم الكيلو
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name, description) VALUES (cat_kilo, 'مشكل كيلو', 'كبدة - كفتة - سجق - ممبار - قلب') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 480.00);

    INSERT INTO menu_items (category_id, name, description) VALUES (cat_kilo, 'الجزار كيلو', 'لحمة - طحال - كبدة - كفتة - سجق - ممبار - قلب') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 600.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'كبدة كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 600.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'قلب كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 600.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'كفتة كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 600.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'سجق كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 600.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'ممبار كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 400.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'لحمة راس كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 640.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'طحال كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 600.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'فشة كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 600.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'طحال ولحمة راس وممبار كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 600.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_kilo, 'كلاوي كيلو') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كيلو', 600.00);

    -- ----------------------------------------------------
    -- 10. قسم الكبدة الجملي
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name) VALUES (cat_camel_liver, 'كبدة جملي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES
        (item_id, 'ربع (250 جرام)', 250.00),
        (item_id, 'نص (500 جرام)', 500.00),
        (item_id, 'كيلو (1000 جرام)', 1000.00);

    -- ----------------------------------------------------
    -- 11. قسم لحمة بلدي محمرة باللية
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name) VALUES (cat_baladi_beef, 'لحمة بلدي محمرة باللية') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES
        (item_id, 'ربع كيلو', 225.00),
        (item_id, 'نص كيلو', 450.00),
        (item_id, 'كيلو', 900.00);

    -- ----------------------------------------------------
    -- 12. قسم الشوربة
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name) VALUES (cat_soup, 'شوربة لسان عصفور') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 25.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_soup, 'شوربة كوارع سادة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 30.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_soup, 'شوربة كوارع مخلية') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 140.00);

    -- ----------------------------------------------------
    -- 13. قسم الإضافات
    -- ----------------------------------------------------
    INSERT INTO menu_items (category_id, name) VALUES (cat_extras, 'سلطة خضار') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 5.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_extras, 'سلطة طحينة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 5.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_extras, 'مياة صغيرة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 10.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_extras, 'مياة كبيرة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 15.00);

END $$;


-- ==============================================================================
-- الجزء الثامن: أمثلة توسّع جاهزة (اتركها كتعليق، فعّلها وقت الحاجة)
-- ==============================================================================

-- مثال: إضافة قسم جديد وصنف بحجم واحد
-- INSERT INTO categories (name, display_order) VALUES ('المقبلات', 14) RETURNING id;
-- INSERT INTO menu_items (category_id, name) VALUES ('<category_id>', 'بابا غنوج') RETURNING id;
-- INSERT INTO item_variants (item_id, variant_name, price) VALUES ('<item_id>', 'افتراضي', 40.00);

-- مثال: إخفاء صنف مؤقتًا بدل ما تمسحه (خلص من المطبخ النهاردة)
-- UPDATE menu_items SET is_available = false WHERE name = 'فتة لحمة';

-- مثال: تغيير سعر حجم معين (السعر الجديد يطبق على الطلبات الجاية فقط، القديمة تفضل زي ما اتسجلت)
-- UPDATE item_variants SET price = 90.00 WHERE variant_name = 'كبير' AND item_id = '<item_id>';
