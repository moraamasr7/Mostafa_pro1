-- ==============================================================================
-- مخطط قاعدة بيانات مطعم مصطفى الجزار — المستودع التشغيلي (Ops Repo Schema)
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

-- 4) جدول الطلبات
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tracking_token UUID DEFAULT gen_random_uuid() NOT NULL,
    order_number BIGINT GENERATED ALWAYS AS IDENTITY,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    delivery_address TEXT,
    order_type VARCHAR(20) NOT NULL DEFAULT 'takeaway'
        CHECK (order_type IN ('delivery', 'takeaway', 'dine_in')),
    payment_method VARCHAR(30) DEFAULT 'cash',
    payment_receipt_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'failed')),
    total_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (total_amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

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

-- 6) جدول طيارين الدليفري العام (Drivers - العامة بدون بيانات الاعتماد أو الهواتف)
CREATE TABLE IF NOT EXISTS drivers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(20) NOT NULL DEFAULT 'offline'
        CHECK (status IN ('offline', 'available', 'busy')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

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
        CHECK (status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled'))
);

-- 10) جدول نتائج وتقرير التوصيل
CREATE TABLE IF NOT EXISTS delivery_outcomes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES order_driver_assignments(id) ON DELETE SET NULL,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('delivered', 'failed', 'cancelled')),
    failure_reason TEXT,
    collected_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (collected_amount >= 0),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

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
-- RLS Security Section
-- ==============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_credentials ENABLE ROW LEVEL SECURITY; -- EXPLICITLY ENABLE RLS
ALTER TABLE driver_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_special_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_schedule_overrides ENABLE ROW LEVEL SECURITY;

-- Public read policies for menu & operating hours
CREATE POLICY "Public read active categories" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "Public read active menu_items" ON menu_items FOR SELECT USING (is_available = true);
CREATE POLICY "Public read active item_variants" ON item_variants FOR SELECT USING (is_available = true);
CREATE POLICY "Public read operating hours" ON restaurant_operating_hours FOR SELECT USING (true);
CREATE POLICY "Public read special closures" ON restaurant_special_closures FOR SELECT USING (true);
CREATE POLICY "Public read schedule overrides" ON restaurant_schedule_overrides FOR SELECT USING (true);

-- Customer Public Order Creation & Tracking Policies
CREATE POLICY "Public insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert order_items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public select single order" ON orders FOR SELECT USING (true);
CREATE POLICY "Public select single order_items" ON order_items FOR SELECT USING (true);

-- Realtime Select Policies for Drivers & Operations UI
CREATE POLICY "Public select drivers" ON drivers FOR SELECT USING (true);
CREATE POLICY "Public select driver_shifts" ON driver_shifts FOR SELECT USING (true);
CREATE POLICY "Public select delivery_trips" ON delivery_trips FOR SELECT USING (true);
CREATE POLICY "Public select order_driver_assignments" ON order_driver_assignments FOR SELECT USING (true);
CREATE POLICY "Public select delivery_outcomes" ON delivery_outcomes FOR SELECT USING (true);

-- CRITICAL SECURITY:
-- 1. driver_credentials HAS 0 POLICIES -> DENY-BY-DEFAULT for all anon key access! Access ONLY via SUPABASE_SERVICE_ROLE_KEY.
-- 2. No INSERT / UPDATE / DELETE policies created for anon key on drivers, driver_shifts, delivery_trips, order_driver_assignments -> DENY-BY-DEFAULT for all write mutations! Write mutations MUST go through secure Ops API routes.
