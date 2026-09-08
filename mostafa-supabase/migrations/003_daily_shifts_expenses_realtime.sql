-- Migration 003: Daily Restaurant Shifts, Expenses, and Realtime Policies
DROP POLICY IF EXISTS "Public select orders for realtime" ON orders;
CREATE POLICY "Public select orders for realtime" ON orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public select drivers for realtime" ON drivers;
CREATE POLICY "Public select drivers for realtime" ON drivers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public select driver_shifts for realtime" ON driver_shifts;
CREATE POLICY "Public select driver_shifts for realtime" ON driver_shifts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public select order_driver_assignments for realtime" ON order_driver_assignments;
CREATE POLICY "Public select order_driver_assignments for realtime" ON order_driver_assignments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public select delivery_trips for realtime" ON delivery_trips;
CREATE POLICY "Public select delivery_trips for realtime" ON delivery_trips FOR SELECT USING (true);

ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE drivers REPLICA IDENTITY FULL;
ALTER TABLE driver_shifts REPLICA IDENTITY FULL;
ALTER TABLE order_driver_assignments REPLICA IDENTITY FULL;
ALTER TABLE delivery_trips REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS daily_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_number BIGSERIAL,
    opened_by VARCHAR(100) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    initial_cash DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    closed_by VARCHAR(100),
    closed_at TIMESTAMPTZ,
    final_cash DECIMAL(10, 2),
    system_expected_cash DECIMAL(10, 2),
    discrepancy DECIMAL(10, 2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE daily_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public select daily_shifts" ON daily_shifts;
CREATE POLICY "Public select daily_shifts" ON daily_shifts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff manage daily_shifts" ON daily_shifts;
CREATE POLICY "Staff manage daily_shifts" ON daily_shifts FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE daily_shifts REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS shift_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES daily_shifts(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT NOT NULL,
    recipient_name VARCHAR(100),
    recorded_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE shift_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public select shift_expenses" ON shift_expenses;
CREATE POLICY "Public select shift_expenses" ON shift_expenses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff manage shift_expenses" ON shift_expenses;
CREATE POLICY "Staff manage shift_expenses" ON shift_expenses FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE shift_expenses REPLICA IDENTITY FULL;
