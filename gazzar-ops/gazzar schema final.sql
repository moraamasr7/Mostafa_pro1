-- ==============================================================================
-- مخطط قاعدة بيانات مطعم مصطفى الجزار — المستودع التشغيلي الموحد (Unified Ops Schema)
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

-- 3) جدول الأحجام/الخيارات والأسعار
CREATE TABLE IF NOT EXISTS item_variants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    variant_name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4) جدول الطلبات — يحتوي على بيانات موقع العميل وحساب المسافة وتكلفة التوصيل
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tracking_token UUID DEFAULT gen_random_uuid() NOT NULL,
    order_number BIGINT GENERATED ALWAYS AS IDENTITY,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    delivery_address TEXT,
    customer_lat DOUBLE PRECISION,
    customer_lng DOUBLE PRECISION,
    delivery_distance_km DECIMAL(10, 2),
    delivery_fee DECIMAL(10, 2) DEFAULT 0.00 CHECK (delivery_fee >= 0),
    order_type VARCHAR(20) NOT NULL DEFAULT 'takeaway'
        CHECK (order_type IN ('delivery', 'takeaway', 'dine_in')),
    payment_method VARCHAR(30) DEFAULT 'cash',
    payment_receipt_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (total_amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- التأكد من وجود أعمدة المسافة والرسوم وإعادة ضبط قيد الحالات المسموحة
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lat DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lng DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_distance_km DECIMAL(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10, 2) DEFAULT 0.00;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN ('pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'failed'));

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

-- 6) جدول طيارين الدليفري العام (Drivers)
CREATE TABLE IF NOT EXISTS drivers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(20) NOT NULL DEFAULT 'offline'
        CHECK (status IN ('offline', 'available', 'busy')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- إسقاط قيد عدم السماح بقيم فارغة للهاتف على جدول drivers القديم لدعم فصل driver_credentials
ALTER TABLE drivers ALTER COLUMN phone DROP NOT NULL;

-- 6.1) جدول اعتماد بيانات دخول الطيارين المحمي (Driver Credentials - Private Server Only)
CREATE TABLE IF NOT EXISTS driver_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    driver_id UUID NOT NULL UNIQUE REFERENCES drivers(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL UNIQUE,
    pin_code VARCHAR(100),
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

-- 8) جدول رحلات خطوط سير الدليفري (Delivery Trips)
CREATE TABLE IF NOT EXISTS delivery_trips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_number BIGINT GENERATED ALWAYS AS IDENTITY,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES driver_shifts(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'picked_up', 'out_for_delivery', 'completed', 'cancelled')),
    expected_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (expected_amount >= 0),
    collected_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (collected_amount >= 0),
    collection_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMPTZ
);

-- 9) جدول إسناد الطلبات للطيارين
CREATE TABLE IF NOT EXISTS order_driver_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES driver_shifts(id) ON DELETE SET NULL,
    trip_id UUID REFERENCES delivery_trips(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'assigned'
        CHECK (status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled')),
    picked_up_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

-- 10) جدول نتائج وتقرير التوصيل (Delivery Outcomes & Failure Audit)
CREATE TABLE IF NOT EXISTS delivery_outcomes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    trip_id UUID REFERENCES delivery_trips(id) ON DELETE SET NULL,
    assignment_id UUID REFERENCES order_driver_assignments(id) ON DELETE SET NULL,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('delivered', 'failed', 'cancelled')),
    failure_reason TEXT,
    expected_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (expected_amount >= 0),
    collected_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (collected_amount >= 0),
    recorded_by VARCHAR(100) DEFAULT 'staff',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- تحديث جدول delivery_outcomes للتأكد من وجود الأعمدة الموحدة
ALTER TABLE delivery_outcomes ADD COLUMN IF NOT EXISTS driver_id UUID;
ALTER TABLE delivery_outcomes ADD COLUMN IF NOT EXISTS trip_id UUID;
ALTER TABLE delivery_outcomes ADD COLUMN IF NOT EXISTS assignment_id UUID;
ALTER TABLE delivery_outcomes ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE delivery_outcomes ADD COLUMN IF NOT EXISTS expected_amount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE delivery_outcomes ADD COLUMN IF NOT EXISTS collected_amount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE delivery_outcomes ADD COLUMN IF NOT EXISTS recorded_by VARCHAR(100) DEFAULT 'staff';

-- 11) جدول مواعيد عمل المطعم
CREATE TABLE IF NOT EXISTS restaurant_operating_hours (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6) UNIQUE,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS restaurant_special_closures (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    closure_date DATE NOT NULL UNIQUE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS restaurant_schedule_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    override_date DATE NOT NULL UNIQUE,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- دوال الـ RPC المحمية الموحدة (Unified RPC Functions with Pessimistic Locks)
-- ==============================================================================

-- Dynamic drop for all existing function overloads to prevent error 42725 / 42P13
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' 
          AND p.proname IN (
              'create_order_secure',
              'assign_orders_to_driver_secure',
              'assign_order_to_driver_secure',
              'reassign_order_secure',
              'update_delivery_status_secure',
              'record_delivery_outcome_secure',
              'complete_delivery_trip_secure',
              'create_delivery_trip_secure',
              'start_driver_shift_secure',
              'end_driver_shift_secure',
              'update_order_status_secure'
          )
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE;', r.proname, r.args);
    END LOOP;
END $$;

-- 1) دالة إنشاء طلب بأسلوب ذري مع حساب المسافة وسعر التوصيل تلقائياً
CREATE OR REPLACE FUNCTION create_order_secure(
    p_customer_name VARCHAR,
    p_customer_phone VARCHAR,
    p_notes TEXT,
    p_items JSONB,
    p_order_type VARCHAR DEFAULT 'takeaway',
    p_delivery_address TEXT DEFAULT NULL,
    p_payment_method VARCHAR DEFAULT 'cash',
    p_payment_receipt_url TEXT DEFAULT NULL,
    p_customer_lat DOUBLE PRECISION DEFAULT NULL,
    p_customer_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
    order_id UUID,
    order_number BIGINT,
    total_amount DECIMAL(10, 2),
    delivery_fee DECIMAL(10, 2),
    delivery_distance_km DECIMAL(10, 2),
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
    v_valid_payment_method VARCHAR;
    
    -- حساب المسافة ورسوم التوصيل (إحداثيات المطعم الثابتة: 30.126131, 31.298350)
    v_rest_lat CONSTANT DOUBLE PRECISION := 30.126131;
    v_rest_lng CONSTANT DOUBLE PRECISION := 31.298350;
    v_dlat DOUBLE PRECISION;
    v_dlng DOUBLE PRECISION;
    v_a DOUBLE PRECISION;
    v_c DOUBLE PRECISION;
    v_dist DECIMAL(10, 2) := NULL;
    v_fee DECIMAL(10, 2) := 0.00;
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

    v_valid_payment_method := COALESCE(NULLIF(trim(p_payment_method), ''), 'cash');

    IF v_valid_order_type = 'delivery' THEN
        IF p_delivery_address IS NULL OR length(trim(p_delivery_address)) < 5 THEN
            RAISE EXCEPTION 'عنوان التوصيل مطلوب بحد أدنى 5 حروف عند اختيار الدليفري';
        END IF;

        IF p_customer_lat IS NOT NULL AND p_customer_lng IS NOT NULL THEN
            v_dlat := radians(p_customer_lat - v_rest_lat);
            v_dlng := radians(p_customer_lng - v_rest_lng);
            v_a := sin(v_dlat / 2.0)^2 + cos(radians(v_rest_lat)) * cos(radians(p_customer_lat)) * sin(v_dlng / 2.0)^2;
            v_c := 2.0 * atan2(sqrt(v_a), sqrt(1.0 - v_a));
            v_dist := round((6371.0 * v_c)::numeric, 2);

            -- الرسوم الأساسية: 15 ج.م لأول 3 كم + 5 ج.م لكل كم إضافي
            IF v_dist <= 3.0 THEN
                v_fee := 15.00;
            ELSE
                v_fee := 15.00 + ceil(v_dist - 3.0) * 5.00;
            END IF;
        ELSE
            v_fee := 20.00; -- رسم توصيل تقديري افتراضي في حالة عدم تحديد الخريطة
        END IF;
    END IF;

    IF v_valid_order_type = 'takeaway' AND (p_payment_receipt_url IS NULL OR length(trim(p_payment_receipt_url)) < 3) THEN
        RAISE EXCEPTION 'يلزم كتابة رقم العملية أو إرفاق إثبات تحويل المبلغ كاملاً لتأكيد تحضير طلب الاستلام من الفرع';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'السلة فارغة';
    END IF;

    INSERT INTO orders (
        customer_name,
        customer_phone,
        notes,
        order_type,
        delivery_address,
        customer_lat,
        customer_lng,
        delivery_distance_km,
        delivery_fee,
        payment_method,
        payment_receipt_url,
        status
    ) VALUES (
        trim(p_customer_name),
        trim(p_customer_phone),
        NULLIF(trim(p_notes), ''),
        v_valid_order_type,
        NULLIF(trim(p_delivery_address), ''),
        p_customer_lat,
        p_customer_lng,
        v_dist,
        v_fee,
        v_valid_payment_method,
        NULLIF(trim(p_payment_receipt_url), ''),
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

    SELECT (orders.total_amount + COALESCE(orders.delivery_fee, 0.00)) INTO v_total FROM orders WHERE id = v_order_id;

    RETURN QUERY SELECT v_order_id, v_order_number, v_total, v_fee, v_dist, v_tracking_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2) دالة تعيين طلبات دليفري لطيار موحدة وذرية
-- UNIFORM LOCK ORDERING: 1. drivers FOR UPDATE -> 2. driver_shifts FOR UPDATE -> 3. delivery_trips FOR UPDATE -> 4. orders FOR UPDATE -> 5. order_driver_assignments FOR UPDATE
CREATE OR REPLACE FUNCTION assign_orders_to_driver_secure(
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
    v_driver_rec RECORD;
    v_shift_id UUID;
    v_trip_id UUID;
    v_trip_number BIGINT;
    v_order_count INT;
    v_order_elem JSONB;
    v_order_id UUID;
    v_order_rec RECORD;
    v_expected_total DECIMAL(10, 2) := 0;
BEGIN
    v_order_count := jsonb_array_length(p_order_ids);
    IF v_order_count = 0 THEN
        RAISE EXCEPTION 'يجب تحديد طلب واحد على الأقل لإسناده للطيار';
    END IF;

    IF v_order_count > 5 THEN
        RAISE EXCEPTION 'الحد الأقصى لرحلة التوصيل الواحدة هو 5 طلبات فقط';
    END IF;

    -- 1. LOCK DRIVERS
    SELECT id, name, is_active, status INTO v_driver_rec
    FROM drivers
    WHERE id = p_driver_id
    FOR UPDATE;

    IF v_driver_rec.id IS NULL OR NOT v_driver_rec.is_active THEN
        RAISE EXCEPTION 'الطيار غير موجود أو غير نشط';
    END IF;

    -- 2. LOCK DRIVER_SHIFTS
    SELECT id INTO v_shift_id
    FROM driver_shifts
    WHERE driver_id = p_driver_id AND status = 'open'
    FOR UPDATE;

    IF v_shift_id IS NULL THEN
        RAISE EXCEPTION 'عفواً، لا يمكن إسناد طلبات لطيار ليس لديه وردية مفتوحة حالياً (isShiftOpen = false)';
    END IF;

    -- 3. LOCK DELIVERY_TRIPS (البحث عن رحلة نشطة أو تجهيز رحلة جديدة)
    SELECT id, delivery_trips.trip_number INTO v_trip_id, v_trip_number
    FROM delivery_trips
    WHERE driver_id = p_driver_id AND shift_id = v_shift_id AND status IN ('created', 'picked_up', 'out_for_delivery')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_trip_id IS NULL THEN
        INSERT INTO delivery_trips (driver_id, shift_id, status, expected_amount)
        VALUES (p_driver_id, v_shift_id, 'created', 0.00)
        RETURNING id, delivery_trips.trip_number INTO v_trip_id, v_trip_number;
    END IF;

    -- 4. LOCK ORDERS AND ASSIGN
    FOR v_order_elem IN SELECT * FROM jsonb_array_elements(p_order_ids)
    LOOP
        v_order_id := (v_order_elem->>'order_id')::UUID;
        IF v_order_id IS NULL THEN
            v_order_id := (v_order_elem#>>'{}')::UUID;
        END IF;

        SELECT id, order_type, status, total_amount, delivery_fee INTO v_order_rec
        FROM orders
        WHERE id = v_order_id
        FOR UPDATE;

        IF v_order_rec.id IS NULL THEN
            RAISE EXCEPTION 'أحد الطلبات المحددة غير موجود';
        END IF;

        IF v_order_rec.order_type <> 'delivery' THEN
            RAISE EXCEPTION 'طلب رقم % ليس طلب دليفري', v_order_rec.id;
        END IF;

        IF v_order_rec.status NOT IN ('ready', 'assigned') THEN
            RAISE EXCEPTION 'لا يمكن إسناد الطلب إلا إذا كان في حالة (جاهز بالمطبخ)';
        END IF;

        -- إنشاء قيد الإسناد
        INSERT INTO order_driver_assignments (order_id, driver_id, shift_id, trip_id, status)
        VALUES (v_order_id, p_driver_id, v_shift_id, v_trip_id, 'assigned')
        ON CONFLICT DO NOTHING;

        UPDATE orders SET status = 'assigned' WHERE id = v_order_id;
        v_expected_total := v_expected_total + COALESCE(v_order_rec.total_amount, 0) + COALESCE(v_order_rec.delivery_fee, 0);
    END LOOP;

    -- تحديث إجمالي المبلغ المتوقع للرحلة وتحديث حالة الطيار تلقائياً إلى busy
    UPDATE delivery_trips SET expected_amount = COALESCE(expected_amount, 0) + v_expected_total WHERE id = v_trip_id;
    UPDATE drivers SET status = 'busy', updated_at = now() WHERE id = p_driver_id;

    RETURN QUERY SELECT true, 'تم إسناد الطلبات للطيار وإنشاء خط السير بنجاح'::TEXT, v_trip_id, v_trip_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Drop existing assign_order_to_driver_secure functions to allow changing parameter names without error 42P13
DROP FUNCTION IF EXISTS assign_order_to_driver_secure(uuid, uuid) CASCADE;

-- 2.1) دالة توافقية لدعم الاستدعاءات الفردية بالشكل القديم: assign_order_to_driver_secure
CREATE OR REPLACE FUNCTION assign_order_to_driver_secure(
    p_driver_id UUID,
    p_order_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    assignment_id UUID
) AS $$
BEGIN
    RETURN QUERY 
    SELECT a.success, a.message, a.trip_id AS assignment_id
    FROM assign_orders_to_driver_secure(p_driver_id, jsonb_build_array(jsonb_build_object('order_id', p_order_id))) a;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3) دالة تسجيل نتيجة التوصيل الفردية مع تحرير الطيار تلقائياً (Unified Delivery Outcome & Auto Driver Release)
-- UNIFORM LOCK ORDERING: 1. drivers FOR UPDATE -> 2. driver_shifts FOR UPDATE -> 3. delivery_trips FOR UPDATE -> 4. orders FOR UPDATE -> 5. order_driver_assignments FOR UPDATE
CREATE OR REPLACE FUNCTION record_delivery_outcome_secure(
    p_order_id UUID,
    p_outcome VARCHAR,
    p_failure_reason TEXT DEFAULT NULL,
    p_collected_amount DECIMAL DEFAULT 0.00,
    p_staff_actor VARCHAR DEFAULT 'staff'
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    trip_completed BOOLEAN,
    driver_released BOOLEAN
) AS $$
DECLARE
    v_assignment_id UUID;
    v_trip_id UUID;
    v_driver_id UUID;
    v_order_total DECIMAL(10, 2);
    v_order_fee DECIMAL(10, 2);
    v_remaining_unresolved INT;
    v_trip_done BOOLEAN := false;
    v_driver_free BOOLEAN := false;
BEGIN
    IF p_outcome NOT IN ('delivered', 'failed') THEN
        RAISE EXCEPTION 'نتيجة التوصيل يجب أن تكون delivered أو failed';
    END IF;

    IF p_outcome = 'failed' AND (p_failure_reason IS NULL OR length(trim(p_failure_reason)) = 0) THEN
        RAISE EXCEPTION 'يلزم تسجيل سبب عدم التوصيل صراحة (مثال: العميل لا يرد، العنوان خاطئ...)';
    END IF;

    -- 1. LOCK ORDERS
    SELECT total_amount, delivery_fee INTO v_order_total, v_order_fee
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

    -- 2. LOCK ASSIGNMENTS
    SELECT id, trip_id, driver_id INTO v_assignment_id, v_trip_id, v_driver_id
    FROM order_driver_assignments
    WHERE order_id = p_order_id
    ORDER BY assigned_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_driver_id IS NOT NULL THEN
        -- 3. LOCK DRIVERS
        PERFORM 1 FROM drivers WHERE id = v_driver_id FOR UPDATE;
    END IF;

    IF v_trip_id IS NOT NULL THEN
        -- 4. LOCK DELIVERY_TRIPS
        PERFORM 1 FROM delivery_trips WHERE id = v_trip_id FOR UPDATE;
    END IF;

    -- تحديث حالة الطلب
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

    -- إدراج التقرير المستقل للنتيجة
    INSERT INTO delivery_outcomes (
        order_id,
        trip_id,
        assignment_id,
        driver_id,
        outcome,
        failure_reason,
        expected_amount,
        collected_amount,
        recorded_by
    ) VALUES (
        p_order_id,
        v_trip_id,
        v_assignment_id,
        COALESCE(v_driver_id, gen_random_uuid()),
        p_outcome,
        NULLIF(trim(p_failure_reason), ''),
        COALESCE(v_order_total, 0.00) + COALESCE(v_order_fee, 0.00),
        COALESCE(p_collected_amount, 0.00),
        p_staff_actor
    )
    ON CONFLICT (order_id) DO UPDATE SET
        outcome = EXCLUDED.outcome,
        failure_reason = EXCLUDED.failure_reason,
        collected_amount = EXCLUDED.collected_amount,
        recorded_by = EXCLUDED.recorded_by;

    -- تحديث المبلغ المحصل في الرحلة
    IF v_trip_id IS NOT NULL THEN
        UPDATE delivery_trips
        SET collected_amount = COALESCE(collected_amount, 0) + COALESCE(p_collected_amount, 0)
        WHERE id = v_trip_id;

        -- فحص الطلبات المتبقية في نفس الرحلة
        SELECT COUNT(*) INTO v_remaining_unresolved
        FROM order_driver_assignments oda
        JOIN orders o ON o.id = oda.order_id
        WHERE oda.trip_id = v_trip_id AND o.status IN ('assigned', 'picked_up', 'out_for_delivery');

        -- إذا حُسمت جميع طلبات الرحلة (سواء delivered أو failed) يتم إغلاق الرحلة وتحرير الطيار تلقائياً
        IF v_remaining_unresolved = 0 THEN
            UPDATE delivery_trips SET status = 'completed', completed_at = now() WHERE id = v_trip_id;
            v_trip_done := true;

            IF v_driver_id IS NOT NULL THEN
                UPDATE drivers SET status = 'available', updated_at = now() WHERE id = v_driver_id;
                v_driver_free := true;
            END IF;
        END IF;
    END IF;

    RETURN QUERY SELECT true, 'تم تسجيل نتيجة التوصيل بنجاح'::TEXT, v_trip_done, v_driver_free;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4) دالة إنهاء وردية طيار محمية مع تحرير وتدقيق آلي
-- UNIFORM LOCK ORDERING: 1. drivers FOR UPDATE -> 2. driver_shifts FOR UPDATE -> 3. delivery_trips FOR UPDATE -> 4. orders FOR UPDATE
CREATE OR REPLACE FUNCTION end_driver_shift_secure(p_driver_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
    v_active_shift_id UUID;
    v_unresolved_count INT;
BEGIN
    -- 1. LOCK DRIVERS
    PERFORM 1 FROM drivers WHERE id = p_driver_id FOR UPDATE;

    -- 2. LOCK DRIVER_SHIFTS
    SELECT id INTO v_active_shift_id
    FROM driver_shifts
    WHERE driver_id = p_driver_id AND status = 'open'
    FOR UPDATE;

    IF v_active_shift_id IS NULL THEN
        RETURN QUERY SELECT false, 'الطيار ليس لديه وردية مفتوحة حالياً'::TEXT;
        RETURN;
    END IF;

    -- التحقق من عدم وجود طلبات دليفري نشطة جاري توصيلها
    SELECT COUNT(*) INTO v_unresolved_count
    FROM order_driver_assignments oda
    JOIN orders o ON o.id = oda.order_id
    WHERE oda.driver_id = p_driver_id AND o.status IN ('assigned', 'picked_up', 'out_for_delivery');

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION 'لا يمكن إنهاء الوردية والطيار لديه % طلبات دليفري قيد التوصيل لم تُحسم بعد', v_unresolved_count;
    END IF;

    UPDATE driver_shifts SET status = 'closed', ended_at = now() WHERE id = v_active_shift_id;
    UPDATE drivers SET status = 'offline', updated_at = now() WHERE id = p_driver_id;

    RETURN QUERY SELECT true, 'تم إنهاء الوردية وتحويل حالة الطيار إلى offline بنجاح'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5) دالة بدء وردية طيار
-- UNIFORM LOCK ORDERING: 1. drivers FOR UPDATE -> 2. driver_shifts FOR UPDATE
CREATE OR REPLACE FUNCTION start_driver_shift_secure(p_driver_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT, shift_id UUID) AS $$
DECLARE
    v_active_shift_id UUID;
    v_new_shift_id UUID;
BEGIN
    -- 1. LOCK DRIVERS
    PERFORM 1 FROM drivers WHERE id = p_driver_id FOR UPDATE;

    -- 2. LOCK DRIVER_SHIFTS
    SELECT id INTO v_active_shift_id
    FROM driver_shifts
    WHERE driver_id = p_driver_id AND status = 'open'
    FOR UPDATE;

    IF v_active_shift_id IS NOT NULL THEN
        RETURN QUERY SELECT true, 'الطيار لديه وردية مفتوحة بالفعل'::TEXT, v_active_shift_id;
        RETURN;
    END IF;

    INSERT INTO driver_shifts (driver_id, status)
    VALUES (p_driver_id, 'open')
    RETURNING id INTO v_new_shift_id;

    UPDATE drivers SET status = 'available', updated_at = now() WHERE id = p_driver_id;

    RETURN QUERY SELECT true, 'تم فتح وردية جديدة وتحويل الطيار إلى available بنجاح'::TEXT, v_new_shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6) دالة تحديث حالة الطلب المحمية
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
    WHERE id = p_order_id
    FOR UPDATE;

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

    UPDATE orders SET status = p_new_status WHERE id = p_order_id;

    RETURN QUERY SELECT true, 'تم تحديث حالة الطلب بنجاح'::TEXT, p_new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6.1) دالة توافقية لدعم الاستدعاء القديم: update_delivery_status_secure
DROP FUNCTION IF EXISTS update_delivery_status_secure(uuid, varchar) CASCADE;
DROP FUNCTION IF EXISTS update_delivery_status_secure(varchar, uuid) CASCADE;

CREATE OR REPLACE FUNCTION update_delivery_status_secure(
    p_order_id UUID,
    p_new_status VARCHAR
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
) AS $$
BEGIN
    IF p_new_status IN ('delivered', 'failed') THEN
        RETURN QUERY
        SELECT r.success, r.message
        FROM record_delivery_outcome_secure(p_order_id, p_new_status, NULL, 0.00, 'staff') r;
    ELSE
        RETURN QUERY
        SELECT u.success, u.message
        FROM update_order_status_secure(p_order_id, NULL, p_new_status) u;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- RLS Security Section
-- ==============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_special_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_schedule_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active categories" ON categories;
DROP POLICY IF EXISTS "Public read active menu_items" ON menu_items;
DROP POLICY IF EXISTS "Public read active item_variants" ON item_variants;
DROP POLICY IF EXISTS "Public read operating hours" ON restaurant_operating_hours;
DROP POLICY IF EXISTS "Public read special closures" ON restaurant_special_closures;
DROP POLICY IF EXISTS "Public read schedule overrides" ON restaurant_schedule_overrides;
DROP POLICY IF EXISTS "Public insert orders" ON orders;
DROP POLICY IF EXISTS "Public insert order_items" ON order_items;
DROP POLICY IF EXISTS "Public select single order" ON orders;
DROP POLICY IF EXISTS "Public select single order_items" ON order_items;
DROP POLICY IF EXISTS "Public select drivers" ON drivers;
DROP POLICY IF EXISTS "Public select driver_shifts" ON driver_shifts;
DROP POLICY IF EXISTS "Public select delivery_trips" ON delivery_trips;
DROP POLICY IF EXISTS "Public select order_driver_assignments" ON order_driver_assignments;
DROP POLICY IF EXISTS "Public select delivery_outcomes" ON delivery_outcomes;
DROP POLICY IF EXISTS "Staff select drivers" ON drivers;
DROP POLICY IF EXISTS "Staff select driver_shifts" ON driver_shifts;
DROP POLICY IF EXISTS "Staff select delivery_trips" ON delivery_trips;
DROP POLICY IF EXISTS "Staff select order_driver_assignments" ON order_driver_assignments;
DROP POLICY IF EXISTS "Staff select delivery_outcomes" ON delivery_outcomes;

CREATE POLICY "Public read active categories" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "Public read active menu_items" ON menu_items FOR SELECT USING (is_available = true);
CREATE POLICY "Public read active item_variants" ON item_variants FOR SELECT USING (is_available = true);
CREATE POLICY "Public read operating hours" ON restaurant_operating_hours FOR SELECT USING (true);
CREATE POLICY "Public read special closures" ON restaurant_special_closures FOR SELECT USING (true);
CREATE POLICY "Public read schedule overrides" ON restaurant_schedule_overrides FOR SELECT USING (true);

CREATE POLICY "Public insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert order_items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public select single order" ON orders FOR SELECT USING (true);
CREATE POLICY "Public select single order_items" ON order_items FOR SELECT USING (true);

CREATE POLICY "Public select drivers" ON drivers FOR SELECT USING (true);
CREATE POLICY "Public select driver_shifts" ON driver_shifts FOR SELECT USING (true);
CREATE POLICY "Public select delivery_trips" ON delivery_trips FOR SELECT USING (true);
CREATE POLICY "Public select order_driver_assignments" ON order_driver_assignments FOR SELECT USING (true);
CREATE POLICY "Public select delivery_outcomes" ON delivery_outcomes FOR SELECT USING (true);

-- CRITICAL SECURITY:
-- 1. driver_credentials HAS 0 POLICIES -> DENY-BY-DEFAULT for all anon key access! Access ONLY via SUPABASE_SERVICE_ROLE_KEY.
-- 2. No INSERT / UPDATE / DELETE policies created for anon key -> DENY-BY-DEFAULT for all write mutations!
