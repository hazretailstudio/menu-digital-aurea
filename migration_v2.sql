-- ============================================================================
-- MIGRACIÓN SEGURA A V2 (NO BORRA TUS DATOS EXISTENTES)
-- Ejecuta este script en Supabase -> SQL Editor -> New Query -> Run
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. NUEVAS COLUMNAS EN TABLAS EXISTENTES
ALTER TABLE products ADD COLUMN IF NOT EXISTS station TEXT DEFAULT 'cocina';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS has_new_additions BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes_updated BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_cycle_started_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_type TEXT DEFAULT 'single';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manual_discount_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS active_course INT DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT;

ALTER TABLE waiter_calls ADD COLUMN IF NOT EXISTS waiter_name TEXT DEFAULT 'Sin asignar';
ALTER TABLE waiter_calls ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE waiter_calls ADD COLUMN IF NOT EXISTS response_time_seconds INT;

ALTER TABLE kitchen_waste ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE kitchen_waste ADD COLUMN IF NOT EXISTS waiter_name TEXT;
ALTER TABLE prepared_items_buffer ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE prepared_items_buffer ADD COLUMN IF NOT EXISTS waiter_name TEXT;

-- 2. NUEVA TABLA: MESAS DEL RESTAURANTE (MAPA DE SALA)
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    zone TEXT DEFAULT 'Salón Principal',
    capacity INT DEFAULT 4,
    status TEXT DEFAULT 'available', -- 'available', 'occupied', 'bill_requested', 'cleaning'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. NUEVA TABLA: PERSONAL Y PINS DE ACCESO RÁPIDO
CREATE TABLE IF NOT EXISTS staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'waiter', -- 'admin', 'management', 'cashier', 'waiter', 'kitchen'
    pin TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. NUEVA TABLA: TURNOS Y CORTES DE CAJA (X/Z)
CREATE TABLE IF NOT EXISTS cash_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    opened_by TEXT NOT NULL,
    closed_by TEXT,
    opening_amount NUMERIC(10,2) DEFAULT 0.00,
    expected_cash NUMERIC(10,2) DEFAULT 0.00,
    counted_cash NUMERIC(10,2),
    card_total NUMERIC(10,2) DEFAULT 0.00,
    transfer_total NUMERIC(10,2) DEFAULT 0.00,
    tips_total NUMERIC(10,2) DEFAULT 0.00,
    difference NUMERIC(10,2) DEFAULT 0.00,
    movements JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'open', -- 'open', 'closed'
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    notes TEXT
);

-- Vincular órdenes con turno de caja
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES cash_shifts(id) ON DELETE SET NULL;

-- 5. NUEVA TABLA: BITÁCORA DE AUDITORÍA (CANCELACIONES, CORTESÍAS, CAMBIOS DE MESA)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    staff_role TEXT,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS PÚBLICO PARA DESARROLLO (Asegurar con Supabase Auth en producción)
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tables' AND policyname = 'Allow all') THEN
        CREATE POLICY "Allow all" ON tables FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_members' AND policyname = 'Allow all') THEN
        CREATE POLICY "Allow all" ON staff_members FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cash_shifts' AND policyname = 'Allow all') THEN
        CREATE POLICY "Allow all" ON cash_shifts FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Allow all') THEN
        CREATE POLICY "Allow all" ON audit_logs FOR ALL USING (true);
    END IF;
END $$;

-- 7. ACTUALIZAR PUBLICACIÓN REALTIME
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE
    orders, waiter_calls, products, product_modifiers, promotions,
    supplies, reservations, prepared_items_buffer, kitchen_waste,
    tables, cash_shifts, staff_members, audit_logs;
COMMIT;

-- 8. DATOS INICIALES PARA MESAS, PERSONAL Y MODIFICADORES (SOLO SI ESTÁN VACÍAS)
DO $$
DECLARE
    r_id UUID := 'b47a9880-9fd3-4c9b-b05b-86ea8f0d014d';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tables WHERE restaurant_id = r_id) THEN
        INSERT INTO tables (restaurant_id, table_number, zone, capacity, status) VALUES
            (r_id, '01', 'Salón Principal', 4, 'available'),
            (r_id, '02', 'Salón Principal', 2, 'available'),
            (r_id, '03', 'Salón Principal', 4, 'available'),
            (r_id, '04', 'Salón Principal', 6, 'available'),
            (r_id, '05', 'Terraza', 4, 'available'),
            (r_id, '06', 'Terraza', 4, 'available'),
            (r_id, '07', 'Terraza', 2, 'available'),
            (r_id, '08', 'Barra', 2, 'available');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM staff_members WHERE restaurant_id = r_id) THEN
        INSERT INTO staff_members (restaurant_id, name, role, pin) VALUES
            (r_id, 'Admin General', 'admin', '1234'),
            (r_id, 'Gerente Turno', 'management', '2222'),
            (r_id, 'Chef Cocina', 'kitchen', '3333'),
            (r_id, 'Carlos M.', 'waiter', '4444'),
            (r_id, 'Sofía R.', 'waiter', '5555'),
            (r_id, 'Miguel A.', 'waiter', '5678'),
            (r_id, 'Barra / Caja', 'cashier', '6666');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM product_modifiers WHERE restaurant_id = r_id) THEN
        INSERT INTO product_modifiers (restaurant_id, name, price) VALUES
            (r_id, 'Leche de Avena', 15.00),
            (r_id, 'Leche Deslactosada', 10.00),
            (r_id, 'Shot Extra de Espresso', 22.00),
            (r_id, 'Sin Cebolla', 0.00),
            (r_id, 'Extra Aguacate', 30.00),
            (r_id, 'Huevo Extra', 25.00),
            (r_id, 'Pan Sin Gluten', 18.00);
    END IF;

    -- Asignar estación barra a bebidas existentes si no tenían
    UPDATE products SET station = 'barra'
    WHERE restaurant_id = r_id
      AND (LOWER(title) LIKE '%café%' OR LOWER(title) LIKE '%latte%' OR LOWER(title) LIKE '%white%' OR LOWER(title) LIKE '%matcha%' OR LOWER(title) LIKE '%jugo%');
END $$;
