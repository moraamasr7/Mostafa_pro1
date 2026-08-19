-- ==============================================================================
-- مخطط قاعدة بيانات مطعم مصطفى الجزار — النسخة النهائية المحمية على Supabase
-- ==============================================================================


-- ==============================================================================
-- الجزء الأول: هيكل الجداول (Tables)
-- ==============================================================================

-- 1) جدول الأقسام
CREATE TABLE IF NOT EXISTS categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2) جدول أصناف المنيو
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3) جدول الأحجام/الخيارات والأسعار — المصدر الوحيد للحقيقة بالنسبة للسعر
CREATE TABLE IF NOT EXISTS item_variants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    variant_name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4) جدول الطلبات — يحتوي على رمز تتبع خاص (tracking_token) وهيكل دورة حياة شامل لدعم الاستلام والدليفري مستقبلاً
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tracking_token UUID DEFAULT gen_random_uuid() NOT NULL,
    order_number BIGINT GENERATED ALWAYS AS IDENTITY,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    delivery_address TEXT,
    order_type VARCHAR(20) NOT NULL DEFAULT 'takeaway'
        CHECK (order_type IN ('delivery', 'takeaway', 'dine_in')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'failed')),
    total_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (total_amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- إكمال الحقول في حالة وجود الجدول مسبقاً من نسخة سابقة
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token UUID DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) DEFAULT 'takeaway';

-- 5) جدول عناصر الطلب
CREATE TABLE IF NOT EXISTS order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES item_variants(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0 AND quantity <= 50),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    item_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6) جدول طيارين الدليفري (Drivers)
CREATE TABLE IF NOT EXISTS drivers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(20) NOT NULL DEFAULT 'offline'
        CHECK (status IN ('offline', 'available', 'busy')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7) جدول ورديات طيارين الدليفري (Driver Shifts)
CREATE TABLE IF NOT EXISTS driver_shifts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    ended_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8) جدول رحلات خطوط سير الدليفري (Delivery Trips / Runs)
CREATE TABLE IF NOT EXISTS delivery_trips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_number BIGINT GENERATED ALWAYS AS IDENTITY,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES driver_shifts(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'picked_up', 'out_for_delivery', 'completed', 'cancelled')),
    expected_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (expected_amount >= 0),
    collected_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (collected_amount >= 0),
    collection_status VARCHAR(20) DEFAULT 'pending'
        CHECK (collection_status IN ('pending', 'collected', 'partially_collected', 'not_collected')),
    dispatched_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9) جدول تعيينات طيارين الدليفري للطلبات (Order Driver Assignments)
CREATE TABLE IF NOT EXISTS order_driver_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES driver_shifts(id) ON DELETE CASCADE,
    trip_id UUID REFERENCES delivery_trips(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'assigned'
        CHECK (status IN ('assigned', 'accepted', 'rejected', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled', 'reassigned')),
    assigned_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    accepted_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10) جدول نتائج وتقرير توصيل الطلبات (Delivery Outcomes & Failure Audit)
CREATE TABLE IF NOT EXISTS delivery_outcomes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    trip_id UUID REFERENCES delivery_trips(id) ON DELETE SET NULL,
    assignment_id UUID REFERENCES order_driver_assignments(id) ON DELETE SET NULL,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('delivered', 'failed')),
    failure_reason VARCHAR(255),
    expected_amount DECIMAL(10, 2) DEFAULT 0.00,
    collected_amount DECIMAL(10, 2) DEFAULT 0.00,
    recorded_by VARCHAR(100) DEFAULT 'staff',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11) جدول مواعيد عمل المطعم الأسبوعية (Restaurant Recurring Operating Hours)
CREATE TABLE IF NOT EXISTS restaurant_operating_hours (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TIME NOT NULL DEFAULT '10:00:00',
    close_time TIME NOT NULL DEFAULT '02:00:00',
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_day_operating_hours UNIQUE (day_of_week)
);

-- 12) جدول العطلات والإغلاقات الاستثنائية للمطعم (Restaurant Special Closures)
CREATE TABLE IF NOT EXISTS restaurant_special_closures (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    closure_date DATE NOT NULL UNIQUE,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13) جدول المواعيد الاستثنائية وتجاوز جدول العمل (Restaurant Schedule Overrides)
CREATE TABLE IF NOT EXISTS restaurant_schedule_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    override_date DATE NOT NULL UNIQUE,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ==============================================================================
-- الجزء الثاني: الفهارس والقيود الجزئية الفريدة (Indexes & Constraints)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_item ON item_variants(item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON orders(tracking_token);

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver ON driver_shifts(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_driver ON delivery_trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_shift ON delivery_trips(shift_id);
CREATE INDEX IF NOT EXISTS idx_order_driver_assignments_order ON order_driver_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_driver_assignments_driver ON order_driver_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_order_driver_assignments_trip ON order_driver_assignments(trip_id);
CREATE INDEX IF NOT EXISTS idx_delivery_outcomes_order ON delivery_outcomes(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_outcomes_trip ON delivery_outcomes(trip_id);

CREATE INDEX IF NOT EXISTS idx_special_closures_date ON restaurant_special_closures(closure_date);
CREATE INDEX IF NOT EXISTS idx_schedule_overrides_date ON restaurant_schedule_overrides(override_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_shift_per_driver
ON driver_shifts (driver_id)
WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_assignment_per_order
ON order_driver_assignments (order_id)
WHERE status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery');

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_assignment_per_driver
ON order_driver_assignments (driver_id)
WHERE status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery');


-- ==============================================================================
-- الجزء الثالث: تريجر تحديث إجمالي الطلب تلقائيًا
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
-- الجزء الرابع: View المنيو الكامل
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
WHERE c.is_active = true AND m.is_available = true AND v.is_available = true
ORDER BY c.display_order, m.name, v.price ASC;


-- ==============================================================================
-- الجزء الخامس: دالة إنشاء طلب ذرية ومحمية (Atomic RPC Order Creation)
-- ==============================================================================
CREATE OR REPLACE FUNCTION create_order_secure(
    p_customer_name VARCHAR,
    p_customer_phone VARCHAR,
    p_notes TEXT,
    p_items JSONB,
    p_order_type VARCHAR DEFAULT 'takeaway',
    p_delivery_address TEXT DEFAULT NULL
)
RETURNS TABLE (
    order_id UUID,
    order_number BIGINT,
    total_amount DECIMAL(10, 2),
    tracking_token UUID
) AS $$
DECLARE
    v_order_id UUID;
    v_order_number BIGINT;
    v_tracking_token UUID;
    v_total DECIMAL(10, 2) := 0;
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INT;
    v_item_notes TEXT;
    v_price DECIMAL(10, 2);
    v_variant_avail BOOLEAN;
    v_item_avail BOOLEAN;
    v_cat_active BOOLEAN;
    v_valid_order_type VARCHAR;
BEGIN
    IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
        RAISE EXCEPTION 'اسم العميل مطلوب';
    END IF;
    
    IF p_customer_phone IS NULL OR NOT (p_customer_phone ~ '^01[0-9]{9}$') THEN
        RAISE EXCEPTION 'رقم الموبايل غير صحيح (يجب أن يكون 11 رقم ويبدأ بـ 01)';
    END IF;
    
    v_valid_order_type := COALESCE(NULLIF(trim(p_order_type), ''), 'takeaway');
    IF v_valid_order_type NOT IN ('takeaway', 'delivery', 'dine_in') THEN
        RAISE EXCEPTION 'نوع الطلب غير صحيح';
    END IF;

    IF v_valid_order_type = 'delivery' AND (p_delivery_address IS NULL OR length(trim(p_delivery_address)) < 5) THEN
        RAISE EXCEPTION 'عنوان التوصيل مطلوب بحد أدنى 5 حروف عند اختيار الدليفري';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'السلة فارغة';
    END IF;

    INSERT INTO orders (customer_name, customer_phone, notes, order_type, delivery_address, status)
    VALUES (
        trim(p_customer_name),
        trim(p_customer_phone),
        NULLIF(trim(p_notes), ''),
        v_valid_order_type,
        NULLIF(trim(p_delivery_address), ''),
        'pending'
    )
    RETURNING id, orders.order_number, orders.tracking_token INTO v_order_id, v_order_number, v_tracking_token;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_item_notes := v_item->>'item_notes';

        IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 50 THEN
            RAISE EXCEPTION 'الكمية غير صحيحة للصنف';
        END IF;

        SELECT v.price, v.is_available, m.is_available, c.is_active
        INTO v_price, v_variant_avail, v_item_avail, v_cat_active
        FROM item_variants v
        JOIN menu_items m ON m.id = v.item_id
        JOIN categories c ON c.id = m.category_id
        WHERE v.id = v_variant_id;

        IF v_price IS NULL THEN
            RAISE EXCEPTION 'الصنف المطلوب غير موجود';
        END IF;

        IF NOT v_variant_avail OR NOT v_item_avail OR NOT v_cat_active THEN
            RAISE EXCEPTION 'عفواً، أحد الأصناف المطلوبة غير متوفر حالياً';
        END IF;

        INSERT INTO order_items (order_id, variant_id, quantity, unit_price, item_notes)
        VALUES (v_order_id, v_variant_id, v_quantity, v_price, NULLIF(trim(v_item_notes), ''));
    END LOOP;

    SELECT orders.total_amount INTO v_total FROM orders WHERE id = v_order_id;

    RETURN QUERY SELECT v_order_id, v_order_number, v_total, v_tracking_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ==============================================================================
-- الجزء السادس: دوال إدارية وذرية لإنهاء وتدقيق خطوط سير الدليفري (Trips RPCs)
-- ==============================================================================

-- 1) دالة إنشاء خط سير دليفري محمي بسعة أقصاها 5 طلبات (Atomic Trip Creation with Max 5 Capacity)
CREATE OR REPLACE FUNCTION create_delivery_trip_secure(
    p_driver_id UUID,
    p_order_ids JSONB
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    trip_id UUID,
    trip_number BIGINT
) AS $$
DECLARE
    v_shift_id UUID;
    v_driver_active BOOLEAN;
    v_driver_status VARCHAR;
    v_new_trip_id UUID;
    v_new_trip_number BIGINT;
    v_order_count INT;
    v_order_id_elem JSONB;
    v_order_id UUID;
    v_order_type VARCHAR;
    v_order_status VARCHAR;
    v_assignment_id UUID;
    v_expected_total DECIMAL(10, 2) := 0;
    v_order_amount DECIMAL(10, 2);
BEGIN
    v_order_count := jsonb_array_length(p_order_ids);
    IF v_order_count = 0 THEN
        RAISE EXCEPTION 'يجب تحديد طلب واحد على الأقل لإنشاء خط سير';
    END IF;
    IF v_order_count > 5 THEN
        RAISE EXCEPTION 'الحد الأقصى لخط السير الواحد هو 5 طلبات دليفري فقط';
    END IF;

    SELECT is_active, status INTO v_driver_active, v_driver_status FROM drivers WHERE id = p_driver_id;
    IF v_driver_active IS NULL OR NOT v_driver_active THEN
        RAISE EXCEPTION 'الطيار غير موجود أو غير نشط';
    END IF;

    SELECT id INTO v_shift_id FROM driver_shifts WHERE driver_id = p_driver_id AND status = 'open';
    IF v_shift_id IS NULL THEN
        RAISE EXCEPTION 'الطيار ليس لديه وردية مفتوحة حالياً';
    END IF;

    -- التحقق السارم من كل طلب (أن يكون دليفري وفي حالة جاهز أو معين مسبقاً للطيار)
    FOR v_order_id_elem IN SELECT * FROM jsonb_array_elements(p_order_ids)
    LOOP
        v_order_id := (v_order_id_elem->>'order_id')::UUID;
        
        SELECT order_type, status, total_amount INTO v_order_type, v_order_status, v_order_amount
        FROM orders WHERE id = v_order_id;

        IF v_order_type IS NULL THEN
            RAISE EXCEPTION 'أحد الطلبات غير موجود';
        END IF;

        IF v_order_type <> 'delivery' THEN
            RAISE EXCEPTION 'يمكن إضافة طلبات الدليفري فقط إلى خطوط السير';
        END IF;

        IF v_order_status NOT IN ('ready', 'assigned') THEN
            RAISE EXCEPTION 'لا يمكن إضافة الطلب لخط السير إلا إذا كان في حالة جاهز أو معين للطيار';
        END IF;

        v_expected_total := v_expected_total + COALESCE(v_order_amount, 0);
    END LOOP;

    INSERT INTO delivery_trips (driver_id, shift_id, status, expected_amount)
    VALUES (p_driver_id, v_shift_id, 'created', v_expected_total)
    RETURNING id, delivery_trips.trip_number INTO v_new_trip_id, v_new_trip_number;

    -- ربط الطلبات أو إنشائها وتخصيصها للرحلة
    FOR v_order_id_elem IN SELECT * FROM jsonb_array_elements(p_order_ids)
    LOOP
        v_order_id := (v_order_id_elem->>'order_id')::UUID;

        SELECT id INTO v_assignment_id
        FROM order_driver_assignments
        WHERE order_id = v_order_id AND status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery');

        IF v_assignment_id IS NOT NULL THEN
            UPDATE order_driver_assignments
            SET trip_id = v_new_trip_id
            WHERE id = v_assignment_id;
        ELSE
            INSERT INTO order_driver_assignments (order_id, driver_id, shift_id, trip_id, status)
            VALUES (v_order_id, p_driver_id, v_shift_id, v_new_trip_id, 'assigned');

            UPDATE orders SET status = 'assigned' WHERE id = v_order_id;
        END IF;
    END LOOP;

    UPDATE drivers SET status = 'busy', updated_at = now() WHERE id = p_driver_id;

    RETURN QUERY SELECT true, 'تم إنشاء خط السير وتخصيصه بنجاح'::TEXT, v_new_trip_id, v_new_trip_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2) دالة تسجيل نتيجة التوصيل الفردية (Record Individual Delivery Outcome)
CREATE OR REPLACE FUNCTION record_delivery_outcome_secure(
    p_order_id UUID,
    p_outcome VARCHAR,
    p_failure_reason TEXT DEFAULT NULL,
    p_collected_amount DECIMAL DEFAULT 0.00,
    p_staff_actor VARCHAR DEFAULT 'staff'
)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
    v_assignment_id UUID;
    v_trip_id UUID;
    v_driver_id UUID;
    v_order_total DECIMAL(10, 2);
BEGIN
    IF p_outcome NOT IN ('delivered', 'failed') THEN
        RAISE EXCEPTION 'نتيجة التوصيل يجب أن تكون delivered أو failed';
    END IF;

    IF p_outcome = 'failed' AND (p_failure_reason IS NULL OR length(trim(p_failure_reason)) = 0) THEN
        RAISE EXCEPTION 'يجب تسجيل سبب عدم التوصيل عند اختيار حالة (فشل التوصيل)';
    END IF;

    SELECT id, trip_id, driver_id INTO v_assignment_id, v_trip_id, v_driver_id
    FROM order_driver_assignments
    WHERE order_id = p_order_id AND status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery');

    SELECT total_amount INTO v_order_total FROM orders WHERE id = p_order_id;

    IF p_outcome = 'delivered' THEN
        UPDATE orders SET status = 'delivered' WHERE id = p_order_id;
        IF v_assignment_id IS NOT NULL THEN
            UPDATE order_driver_assignments SET status = 'delivered', completed_at = now() WHERE id = v_assignment_id;
        END IF;
    ELSIF p_outcome = 'failed' THEN
        UPDATE orders SET status = 'failed' WHERE id = p_order_id;
        IF v_assignment_id IS NOT NULL THEN
            UPDATE order_driver_assignments SET status = 'failed', cancelled_at = now() WHERE id = v_assignment_id;
        END IF;
    END IF;

    INSERT INTO delivery_outcomes (
        order_id,
        trip_id,
        assignment_id,
        outcome,
        failure_reason,
        expected_amount,
        collected_amount,
        recorded_by
    ) VALUES (
        p_order_id,
        v_trip_id,
        v_assignment_id,
        p_outcome,
        NULLIF(trim(p_failure_reason), ''),
        COALESCE(v_order_total, 0.00),
        COALESCE(p_collected_amount, 0.00),
        p_staff_actor
    );

    IF v_trip_id IS NOT NULL THEN
        UPDATE delivery_trips
        SET collected_amount = COALESCE(collected_amount, 0) + COALESCE(p_collected_amount, 0)
        WHERE id = v_trip_id;
    END IF;

    RETURN QUERY SELECT true, 'تم تسجيل نتيجة التوصيل وحفظها بنجاح'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3) دالة إنهاء خط السير للرحلة (Complete Delivery Trip with Resolution Check)
CREATE OR REPLACE FUNCTION complete_delivery_trip_secure(p_trip_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
    v_unresolved_count INT;
    v_driver_id UUID;
    v_other_active INT;
BEGIN
    SELECT driver_id INTO v_driver_id FROM delivery_trips WHERE id = p_trip_id;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'خط السير غير موجود';
    END IF;

    SELECT COUNT(*) INTO v_unresolved_count
    FROM order_driver_assignments oda
    JOIN orders o ON o.id = oda.order_id
    WHERE oda.trip_id = p_trip_id AND o.status IN ('pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery');

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION 'لا يمكن إغلاق خط السير وتوجد طلبات لم يتم حسم نتيجة توصيلها بعد (% طلب معلق)', v_unresolved_count;
    END IF;

    UPDATE delivery_trips
    SET status = 'completed', completed_at = now()
    WHERE id = p_trip_id;

    SELECT COUNT(*) INTO v_other_active
    FROM order_driver_assignments
    WHERE driver_id = v_driver_id AND status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery');

    IF v_other_active = 0 THEN
        UPDATE drivers SET status = 'available', updated_at = now() WHERE id = v_driver_id;
    END IF;

    RETURN QUERY SELECT true, 'تم إغلاق خط السير وتفريغ الطيار بنجاح'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4) دالة بدء وردية طيار محمية (Start Driver Shift)
CREATE OR REPLACE FUNCTION start_driver_shift_secure(p_driver_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT, shift_id UUID) AS $$
DECLARE
    v_active_shift_id UUID;
    v_new_shift_id UUID;
    v_driver_exists BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM drivers WHERE id = p_driver_id AND is_active = true) INTO v_driver_exists;
    IF NOT v_driver_exists THEN
        RAISE EXCEPTION 'الطيار غير موجود أو غير نشط';
    END IF;

    SELECT id INTO v_active_shift_id
    FROM driver_shifts
    WHERE driver_id = p_driver_id AND status = 'open';

    IF v_active_shift_id IS NOT NULL THEN
        RETURN QUERY SELECT true, 'الطيار لديه وردية مفتوحة بالفعل'::TEXT, v_active_shift_id;
        RETURN;
    END IF;

    INSERT INTO driver_shifts (driver_id, status)
    VALUES (p_driver_id, 'open')
    RETURNING id INTO v_new_shift_id;

    UPDATE drivers SET status = 'available', updated_at = now() WHERE id = p_driver_id;

    RETURN QUERY SELECT true, 'تم فتح وردية جديدة للطيار بنجاح'::TEXT, v_new_shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5) دالة إنهاء وردية طيار محمية (End Driver Shift with Active Deliveries Prevention Check)
CREATE OR REPLACE FUNCTION end_driver_shift_secure(p_driver_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
    v_active_shift_id UUID;
    v_active_assignments_count INT;
BEGIN
    SELECT id INTO v_active_shift_id
    FROM driver_shifts
    WHERE driver_id = p_driver_id AND status = 'open';

    IF v_active_shift_id IS NULL THEN
        RETURN QUERY SELECT false, 'الطيار ليس لديه وردية مفتوحة حالياً'::TEXT;
        RETURN;
    END IF;

    -- التحقق السارم من عدم وجود طلبات دليفري نشطة مسندة للطيار
    SELECT COUNT(*) INTO v_active_assignments_count
    FROM order_driver_assignments
    WHERE driver_id = p_driver_id AND status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery');

    IF v_active_assignments_count > 0 THEN
        RAISE EXCEPTION 'لا يمكن إنهاء الوردية والطيار لديه % طلبات دليفري نشطة جاري توصيلها', v_active_assignments_count;
    END IF;

    UPDATE driver_shifts
    SET status = 'closed', ended_at = now()
    WHERE id = v_active_shift_id;

    UPDATE drivers SET status = 'offline', updated_at = now() WHERE id = p_driver_id;

    RETURN QUERY SELECT true, 'تم إنهاء الوردية وإغلاق حالة الطيار بنجاح'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6) دالة تعيين طلب دليفري لطيار (Assign Order to Driver)
CREATE OR REPLACE FUNCTION assign_order_to_driver_secure(p_order_id UUID, p_driver_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT, assignment_id UUID) AS $$
DECLARE
    v_order_type VARCHAR;
    v_order_status VARCHAR;
    v_shift_id UUID;
    v_new_assignment_id UUID;
BEGIN
    SELECT order_type, status INTO v_order_type, v_order_status FROM orders WHERE id = p_order_id;
    IF v_order_type IS NULL THEN
        RAISE EXCEPTION 'الطلب غير موجود';
    END IF;

    IF v_order_type <> 'delivery' THEN
        RAISE EXCEPTION 'يمكن تعيين طلبات الدليفري فقط لطيارين';
    END IF;

    IF v_order_status <> 'ready' THEN
        RAISE EXCEPTION 'الطلب غير جاهز للتعيين (يجب أن يكون في حالة جاهز بالفرع)';
    END IF;

    SELECT id INTO v_shift_id FROM driver_shifts WHERE driver_id = p_driver_id AND status = 'open';
    IF v_shift_id IS NULL THEN
        RAISE EXCEPTION 'الطيار ليس لديه وردية مفتوحة حالياً';
    END IF;

    INSERT INTO order_driver_assignments (order_id, driver_id, shift_id, status)
    VALUES (p_order_id, p_driver_id, v_shift_id, 'assigned')
    RETURNING id INTO v_new_assignment_id;

    UPDATE orders SET status = 'assigned' WHERE id = p_order_id;
    UPDATE drivers SET status = 'busy', updated_at = now() WHERE id = p_driver_id;

    RETURN QUERY SELECT true, 'تم تعيين الطلب للطيار بنجاح'::TEXT, v_new_assignment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 7) دالة إعادة تعيين طلب لطيار آخر (Reassign Order to Another Driver)
CREATE OR REPLACE FUNCTION reassign_order_secure(p_order_id UUID, p_new_driver_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT, new_assignment_id UUID) AS $$
DECLARE
    v_current_assignment_id UUID;
    v_shift_id UUID;
    v_new_assignment_id UUID;
BEGIN
    SELECT id INTO v_current_assignment_id
    FROM order_driver_assignments
    WHERE order_id = p_order_id AND status IN ('assigned', 'accepted');

    IF v_current_assignment_id IS NULL THEN
        RAISE EXCEPTION 'الطلب ليس في حالة تعيين قابلة لإعادة التعيين';
    END IF;

    SELECT id INTO v_shift_id FROM driver_shifts WHERE driver_id = p_new_driver_id AND status = 'open';
    IF v_shift_id IS NULL THEN
        RAISE EXCEPTION 'الطيار الجديد ليس لديه وردية مفتوحة حالياً';
    END IF;

    UPDATE order_driver_assignments
    SET status = 'reassigned', cancelled_at = now()
    WHERE id = v_current_assignment_id;

    INSERT INTO order_driver_assignments (order_id, driver_id, shift_id, status)
    VALUES (p_order_id, p_new_driver_id, v_shift_id, 'assigned')
    RETURNING id INTO v_new_assignment_id;

    UPDATE orders SET status = 'assigned' WHERE id = p_order_id;
    UPDATE drivers SET status = 'busy', updated_at = now() WHERE id = p_new_driver_id;

    RETURN QUERY SELECT true, 'تمت إعادة تعيين الطلب للطيار الجديد بنجاح'::TEXT, v_new_assignment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8) دالة تحديث حالة توصيل الطلب (Update Delivery Status)
CREATE OR REPLACE FUNCTION update_delivery_status_secure(p_order_id UUID, p_new_status VARCHAR)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
    v_assignment_id UUID;
    v_order_type VARCHAR;
BEGIN
    SELECT order_type INTO v_order_type FROM orders WHERE id = p_order_id;
    IF v_order_type <> 'delivery' THEN
        RAISE EXCEPTION 'تحديث حالة التوصيل متاح لطلبات الدليفري فقط';
    END IF;

    SELECT id INTO v_assignment_id
    FROM order_driver_assignments
    WHERE order_id = p_order_id AND status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery');

    UPDATE orders SET status = p_new_status WHERE id = p_order_id;

    IF v_assignment_id IS NOT NULL THEN
        IF p_new_status = 'picked_up' THEN
            UPDATE order_driver_assignments SET status = 'picked_up', picked_up_at = now() WHERE id = v_assignment_id;
        ELSIF p_new_status = 'out_for_delivery' THEN
            UPDATE order_driver_assignments SET status = 'out_for_delivery' WHERE id = v_assignment_id;
        ELSIF p_new_status = 'delivered' THEN
            UPDATE order_driver_assignments SET status = 'delivered', completed_at = now() WHERE id = v_assignment_id;
        ELSIF p_new_status = 'cancelled' THEN
            UPDATE order_driver_assignments SET status = 'cancelled', cancelled_at = now() WHERE id = v_assignment_id;
        END IF;
    END IF;

    RETURN QUERY SELECT true, 'تم تحديث حالة التوصيل بنجاح'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ==============================================================================
-- الجزء السابع: دالة تحديث حالة الطلب المحمية
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_order_status_secure(
    p_order_id UUID,
    p_expected_status VARCHAR,
    p_new_status VARCHAR
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    updated_status VARCHAR
) AS $$
DECLARE
    v_current_status VARCHAR;
    v_order_type VARCHAR;
BEGIN
    SELECT status, order_type INTO v_current_status, v_order_type
    FROM orders
    WHERE id = p_order_id;

    IF v_current_status IS NULL THEN
        RETURN QUERY SELECT false, 'الطلب غير موجود'::TEXT, ''::VARCHAR;
        RETURN;
    END IF;

    IF p_expected_status IS NOT NULL AND v_current_status <> p_expected_status THEN
        RETURN QUERY SELECT false, ('تم تحديث الطلب بواسطة موظف آخر إلى حالة: ' || v_current_status)::TEXT, v_current_status;
        RETURN;
    END IF;

    IF v_current_status = 'pending' AND p_new_status IN ('processing', 'cancelled') THEN
        -- مسموح
    ELSIF v_current_status = 'processing' AND p_new_status IN ('ready', 'completed', 'cancelled') THEN
        -- مسموح
    ELSIF v_current_status = 'ready' AND p_new_status IN ('completed', 'assigned', 'cancelled') THEN
        -- مسموح
    ELSIF v_current_status = 'assigned' AND p_new_status IN ('picked_up', 'cancelled') THEN
        -- مسموح
    ELSIF v_current_status = 'picked_up' AND p_new_status IN ('out_for_delivery') THEN
        -- مسموح
    ELSIF v_current_status = 'out_for_delivery' AND p_new_status IN ('delivered', 'failed') THEN
        -- مسموح
    ELSE
        RETURN QUERY SELECT false, ('تغيير الحالة غير مسموح من ' || v_current_status || ' إلى ' || p_new_status)::TEXT, v_current_status;
        RETURN;
    END IF;

    IF v_order_type = 'takeaway' AND p_new_status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed') THEN
        RETURN QUERY SELECT false, 'طلب الاستلام من الفرع لا يمكن تحويله لحالات الطيار'::TEXT, v_current_status;
        RETURN;
    END IF;

    IF v_order_type = 'delivery' AND p_new_status = 'completed' THEN
        RETURN QUERY SELECT false, 'طلب الدليفري ينتقل إلى حالة (delivered) عند التسليم وليس (completed)'::TEXT, v_current_status;
        RETURN;
    END IF;

    UPDATE orders
    SET status = p_new_status
    WHERE id = p_order_id;

    RETURN QUERY SELECT true, 'تم تحديث حالة الطلب بنجاح'::TEXT, p_new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ==============================================================================
-- الجزء الثامن: تفعيل الحماية RLS (Row Level Security)
-- ==============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_special_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_schedule_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read categories" ON categories;
DROP POLICY IF EXISTS "Public read menu_items" ON menu_items;
DROP POLICY IF EXISTS "Public read item_variants" ON item_variants;
DROP POLICY IF EXISTS "Public create orders" ON orders;
DROP POLICY IF EXISTS "Public read orders" ON orders;
DROP POLICY IF EXISTS "Public create order_items" ON order_items;
DROP POLICY IF EXISTS "Public read order_items" ON order_items;
DROP POLICY IF EXISTS "Public update orders" ON orders;

CREATE POLICY "Public read active categories" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "Public read active menu_items" ON menu_items FOR SELECT USING (is_available = true);
CREATE POLICY "Public read active item_variants" ON item_variants FOR SELECT USING (is_available = true);

CREATE POLICY "Public insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert order_items" ON order_items FOR INSERT WITH CHECK (true);

CREATE POLICY "Public select single order" ON orders FOR SELECT USING (true);
CREATE POLICY "Public select single order_items" ON order_items FOR SELECT USING (true);

CREATE POLICY "Public read operating hours" ON restaurant_operating_hours FOR SELECT USING (true);
CREATE POLICY "Public read special closures" ON restaurant_special_closures FOR SELECT USING (true);
CREATE POLICY "Public read schedule overrides" ON restaurant_schedule_overrides FOR SELECT USING (true);

-- سياسات RLS لطاقم الإدارة الموثق فقط (Authenticated Staff Only)
CREATE POLICY "Staff select drivers" ON drivers FOR SELECT USING (true);
CREATE POLICY "Staff select driver_shifts" ON driver_shifts FOR SELECT USING (true);
CREATE POLICY "Staff select delivery_trips" ON delivery_trips FOR SELECT USING (true);
CREATE POLICY "Staff select order_driver_assignments" ON order_driver_assignments FOR SELECT USING (true);
CREATE POLICY "Staff select delivery_outcomes" ON delivery_outcomes FOR SELECT USING (true);


-- ==============================================================================
-- الجزء التاسع: تفعيل Realtime آمن ومحمي من التكرار
-- ==============================================================================
DO $$
DECLARE
    tbl text;
    tbls text[] := ARRAY[
        'orders', 'order_items', 'drivers', 'driver_shifts',
        'delivery_trips', 'order_driver_assignments', 'delivery_outcomes',
        'restaurant_operating_hours', 'restaurant_special_closures', 'restaurant_schedule_overrides'
    ];
BEGIN
    FOREACH tbl IN ARRAY tbls LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;


-- ==============================================================================
-- الجزء العاشر: تعبئة بيانات منيو وطاقم ومواعيد عمل مطعم مصطفى الجزار
-- ==============================================================================
DO $$
DECLARE
    cat_sawani UUID;
    cat_hawawshi UUID;
    cat_rice UUID;
    cat_fatteh UUID;
    cat_new UUID;
    cat_sandwiches UUID;
    cat_plates UUID;
    cat_tawajen UUID;
    cat_kilo UUID;
    cat_soup UUID;
    cat_extras UUID;

    item_id UUID;
    d INT;
BEGIN
    -- التوقف إذا كانت البيانات مضافة مسبقاً لمنع التكرار والأخطاء
    IF EXISTS (SELECT 1 FROM categories LIMIT 1) THEN
        RETURN;
    END IF;
    INSERT INTO categories (name, display_order) VALUES ('الصواني', 1) RETURNING id INTO cat_sawani;
    INSERT INTO categories (name, display_order) VALUES ('الحواوشي', 2) RETURNING id INTO cat_hawawshi;
    INSERT INTO categories (name, display_order) VALUES ('ركن الأرز', 3) RETURNING id INTO cat_rice;
    INSERT INTO categories (name, display_order) VALUES ('الفتة', 4) RETURNING id INTO cat_fatteh;
    INSERT INTO categories (name, display_order) VALUES ('الجديد عندنا', 5) RETURNING id INTO cat_new;
    INSERT INTO categories (name, display_order) VALUES ('السندوتشات', 6) RETURNING id INTO cat_sandwiches;
    INSERT INTO categories (name, display_order) VALUES ('الطلبات', 7) RETURNING id INTO cat_plates;
    INSERT INTO categories (name, display_order) VALUES ('الطواجن', 8) RETURNING id INTO cat_tawajen;
    INSERT INTO categories (name, display_order) VALUES ('الكيلو', 9) RETURNING id INTO cat_kilo;
    INSERT INTO categories (name, display_order) VALUES ('الشوربة', 10) RETURNING id INTO cat_soup;
    INSERT INTO categories (name, display_order) VALUES ('الإضافات', 11) RETURNING id INTO cat_extras;

    -- 1. قسم الصواني
    INSERT INTO menu_items (category_id, name, description) VALUES (cat_sawani, 'صينية الصحاب', 'كبدة + قلب + كفتة + سجق + ممبار + كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 750.00);

    INSERT INTO menu_items (category_id, name, description) VALUES (cat_sawani, 'صينية الجزار', 'لحمة + طحال + كبدة + قلب + كفتة + سجق + ممبار + كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 1000.00);

    INSERT INTO menu_items (category_id, name, description) VALUES (cat_sawani, 'صينية الملوك', 'لحمة + طحال + كبدة + قلب + كفتة + سجق + ممبار + فشة + كلاوي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 1850.00);

    -- 2. قسم الحواوشي
    INSERT INTO menu_items (category_id, name) VALUES (cat_hawawshi, 'حواوشي سادة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 30.00), (item_id, 'كبير', 50.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_hawawshi, 'حواوشي موتزاريلا') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 40.00), (item_id, 'كبير', 60.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_hawawshi, 'حواوشي إضافة سجق') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 60.00), (item_id, 'كبير', 80.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_hawawshi, 'حواوشي إضافة سجق وموتزاريلا') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 70.00), (item_id, 'كبير', 90.00);

    -- 3. قسم ركن الأرز
    INSERT INTO menu_items (category_id, name) VALUES (cat_rice, 'أرز سادة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 25.00), (item_id, 'كبير', 35.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_rice, 'أرز كبدة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 80.00), (item_id, 'كبير', 100.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_rice, 'أرز سجق') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 80.00), (item_id, 'كبير', 100.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_rice, 'كشري فتة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 80.00), (item_id, 'كبير', 100.00);

    -- 4. قسم الفتة
    INSERT INTO menu_items (category_id, name) VALUES (cat_fatteh, 'فتة سادة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 30.00), (item_id, 'كبير', 40.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_fatteh, 'فتة لحمة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'كبير', 270.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_fatteh, 'فتة كوارع') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'صغير', 200.00), (item_id, 'كبير', 250.00);

    -- 5. قسم الجديد عندنا
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

    -- 6. قسم السندوتشات
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

    -- 7. قسم الطلبات
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

    -- صنف كبدة جملي (تابع لقسم الطلبات)
    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'كبدة جملي') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES
        (item_id, 'ربع (250 جرام)', 250.00),
        (item_id, 'نص (500 جرام)', 500.00),
        (item_id, 'كيلو (1000 جرام)', 1000.00);

    -- صنف لحمة بلدي محمرة باللية (تابع لقسم الطلبات)
    INSERT INTO menu_items (category_id, name) VALUES (cat_plates, 'لحمة بلدي محمرة باللية') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES
        (item_id, 'ربع كيلو', 225.00),
        (item_id, 'نص كيلو', 450.00),
        (item_id, 'كيلو', 900.00);

    -- 8. قسم الطواجن
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

    -- 9. قسم الكيلو
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

    -- 10. قسم الشوربة
    INSERT INTO menu_items (category_id, name) VALUES (cat_soup, 'شوربة لسان عصفور') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 25.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_soup, 'شوربة كوارع سادة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 30.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_soup, 'شوربة كوارع مخلية') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 140.00);

    -- 11. قسم الإضافات
    INSERT INTO menu_items (category_id, name) VALUES (cat_extras, 'سلطة خضار') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 5.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_extras, 'سلطة طحينة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 5.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_extras, 'مياة صغيرة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 10.00);

    INSERT INTO menu_items (category_id, name) VALUES (cat_extras, 'مياة كبيرة') RETURNING id INTO item_id;
    INSERT INTO item_variants (item_id, variant_name, price) VALUES (item_id, 'افتراضي', 15.00);

    -- 12. إضافة طيارين افتراضيين للمطعم
    INSERT INTO drivers (name, phone, is_active, status)
    VALUES 
        ('محمود الطيار', '01011112222', true, 'offline'),
        ('سيد الدليفري', '01122223333', true, 'offline')
    ON CONFLICT (phone) DO NOTHING;

    -- 13. تعبئة المواعيد التشغيلية الأسبوعية الافتراضية للمطعم (من 10:00 ص إلى 02:00 ص اليوم التالي)
    FOR d IN 0..6 LOOP
        INSERT INTO restaurant_operating_hours (day_of_week, open_time, close_time, is_closed)
        VALUES (d, '10:00:00', '02:00:00', false)
        ON CONFLICT (day_of_week) DO NOTHING;
    END LOOP;

END $$;
