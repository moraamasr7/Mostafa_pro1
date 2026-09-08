-- ==============================================================================
-- Migration 002: Close RLS Gaps & Implement Supabase Auth for Staff
-- ==============================================================================

-- 1) جدول ملفات الموظفين (Staff Profiles)
CREATE TABLE IF NOT EXISTS staff_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'manager', 'cashier', 'kitchen')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read profiles" ON staff_profiles;
CREATE POLICY "Staff read profiles" ON staff_profiles
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Manager update profiles" ON staff_profiles;
CREATE POLICY "Manager update profiles" ON staff_profiles
    FOR ALL TO authenticated
    USING (
        auth.uid() = id OR 
        EXISTS (SELECT 1 FROM staff_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager'))
    );

-- دالة فحص صلاحية الموظف (Security Definer Helper)
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN true;
    END IF;
    IF auth.uid() IS NOT NULL THEN
        RETURN true;
    END IF;
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) جدول إعدادات وسياسات المطعم (Restaurant Policies)
CREATE TABLE IF NOT EXISTS restaurant_policies (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE restaurant_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read restaurant policies" ON restaurant_policies;
CREATE POLICY "Public read restaurant policies" ON restaurant_policies
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Staff manage restaurant policies" ON restaurant_policies;
CREATE POLICY "Staff manage restaurant policies" ON restaurant_policies
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- بذر القيم الافتراضية للسياسات
INSERT INTO restaurant_policies (key, value, description)
VALUES 
    ('delivery_fee_per_km', '5.00'::jsonb, 'سعر الكيلومتر للتوصيل بالجنيه'),
    ('max_delivery_radius_km', '15.00'::jsonb, 'أقصى نصف قطر مسموح به للتوصيل بالكيلومتر'),
    ('max_driver_active_orders', '5'::jsonb, 'أقصى عدد طلبات نشطة مسموح بحملها للطيار في الرحلة'),
    ('min_order_amount', '50.00'::jsonb, 'الحد الأدنى لقيمة الطلب')
ON CONFLICT (key) DO NOTHING;

-- 3) إسقاط سياسات الـ RLS العامة المعيبة (Vulnerable Public Policies)
DROP POLICY IF EXISTS "Public select single order" ON orders;
DROP POLICY IF EXISTS "Public insert orders" ON orders;
DROP POLICY IF EXISTS "Public select single order_items" ON order_items;
DROP POLICY IF EXISTS "Public insert order_items" ON order_items;
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
DROP POLICY IF EXISTS "Staff select orders" ON orders;
DROP POLICY IF EXISTS "Staff update orders" ON orders;
DROP POLICY IF EXISTS "Staff select order_items" ON order_items;
DROP POLICY IF EXISTS "Staff update drivers" ON drivers;

-- 4) بناء سياسات موثقة ومحمية للموظفين المسجلين (Staff Only via Authenticated Role)
CREATE POLICY "Staff select orders" ON orders 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY "Staff update orders" ON orders 
    FOR UPDATE TO authenticated 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Staff select order_items" ON order_items 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY "Staff select drivers" ON drivers 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY "Staff update drivers" ON drivers 
    FOR UPDATE TO authenticated 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Staff select driver_shifts" ON driver_shifts 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY "Staff select delivery_trips" ON delivery_trips 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY "Staff select order_driver_assignments" ON order_driver_assignments 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY "Staff select delivery_outcomes" ON delivery_outcomes 
    FOR SELECT TO authenticated 
    USING (true);

-- 5) تتبع العميل للطلب بالـ Tracking Token بشكل آمن ومحصن (بدون فتح جدول orders للعامة)
CREATE OR REPLACE FUNCTION get_customer_order_tracking(
    p_order_id UUID,
    p_tracking_token UUID
)
RETURNS TABLE (
    id UUID,
    order_number BIGINT,
    order_type VARCHAR,
    status VARCHAR,
    customer_name VARCHAR,
    total_amount DECIMAL(10, 2),
    delivery_fee DECIMAL(10, 2),
    delivery_address TEXT,
    created_at TIMESTAMPTZ,
    items JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.order_number,
        o.order_type,
        o.status,
        o.customer_name,
        o.total_amount,
        o.delivery_fee,
        o.delivery_address,
        o.created_at,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', oi.id,
                        'quantity', oi.quantity,
                        'unit_price', oi.unit_price,
                        'subtotal', oi.subtotal,
                        'item_notes', oi.item_notes,
                        'variant_name', iv.variant_name,
                        'item_name', mi.name
                    )
                )
                FROM order_items oi
                JOIN item_variants iv ON iv.id = oi.variant_id
                JOIN menu_items mi ON mi.id = iv.item_id
                WHERE oi.order_id = o.id
            ),
            '[]'::jsonb
        ) AS items
    FROM orders o
    WHERE o.id = p_order_id AND o.tracking_token = p_tracking_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION get_customer_order_tracking(UUID, UUID) TO anon, authenticated;

-- 6) تعزيز فحص الصلاحية داخل الـ RPCs الحساسة
-- نقوم بتحديث دالة update_order_status_secure للتحقق من هوية المنفذ
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
    -- فحص هوية الموظف أو سيرفر رول
    IF auth.role() <> 'service_role' AND auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول كموظف معتمد لتغيير حالة الطلب';
    END IF;

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
    UPDATE order_driver_assignments SET status = p_new_status WHERE order_id = p_order_id;

    IF p_new_status = 'out_for_delivery' THEN
        UPDATE delivery_trips dt SET status = 'out_for_delivery'
        FROM order_driver_assignments oda
        WHERE oda.order_id = p_order_id AND oda.trip_id = dt.id;

        UPDATE drivers d SET status = 'busy', updated_at = now()
        FROM order_driver_assignments oda
        WHERE oda.order_id = p_order_id AND oda.driver_id = d.id;
    END IF;

    RETURN QUERY SELECT true, 'تم تحديث حالة الطلب بنجاح'::TEXT, p_new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
