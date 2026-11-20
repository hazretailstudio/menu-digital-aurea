-- ============================================================================
-- SCHEMA COMPLETO V2 (INSTALACIÓN DESDE CERO)
-- ADVERTENCIA: Este script borra y recrea todas las tablas.
-- Si ya tienes datos, usa mejor migration_v2.sql.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS kitchen_waste CASCADE;
DROP TABLE IF EXISTS prepared_items_buffer CASCADE;
DROP TABLE IF EXISTS product_recipes CASCADE;
DROP TABLE IF EXISTS supplies CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS cash_shifts CASCADE;
DROP TABLE IF EXISTS waiter_calls CASCADE;
DROP TABLE IF EXISTS promotions CASCADE;
DROP TABLE IF EXISTS product_modifiers CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS product_types CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS tables CASCADE;
DROP TABLE IF EXISTS staff_members CASCADE;
DROP TABLE IF EXISTS restaurants CASCADE;

CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    wifi_ssid TEXT,
    wifi_password TEXT,
    whatsapp_number TEXT,
    cross_sell_title TEXT DEFAULT 'Frecuentemente pedidos juntos',
    bottom_left_type TEXT DEFAULT 'promo',
    bottom_left_label TEXT DEFAULT 'Promos',
    bottom_left_url TEXT,
    google_maps_embed TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    zone TEXT DEFAULT 'Salón Principal',
    capacity INT DEFAULT 4,
    status TEXT DEFAULT 'available',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'waiter',
    pin TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🍽️',
    order_index INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🏷️',
    order_index INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    type_id UUID REFERENCES product_types(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    station TEXT DEFAULT 'cocina', -- 'cocina', 'barra', 'panaderia'
    media JSONB DEFAULT '[]'::jsonb,
    is_available BOOLEAN DEFAULT TRUE,
    recommended_product_ids UUID[] DEFAULT ARRAY[]::UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10,2) DEFAULT 0.00,
    applies_to_products UUID[] DEFAULT ARRAY[]::UUID[]
);

CREATE TABLE cash_shifts (
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
    status TEXT DEFAULT 'open',
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    notes TEXT
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    order_channel TEXT DEFAULT 'dine_in',
    waiter_name TEXT DEFAULT 'Sin asignar',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    applied_promotions TEXT[] DEFAULT ARRAY[]::TEXT[],
    status TEXT DEFAULT 'pending',
    customer_notes TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    has_new_additions BOOLEAN DEFAULT FALSE,
    notes_updated BOOLEAN DEFAULT FALSE,
    kitchen_cycle_started_at TIMESTAMPTZ,
    split_type TEXT DEFAULT 'single',
    split_details JSONB DEFAULT '[]'::jsonb,
    payment_method TEXT,
    payment_details JSONB DEFAULT '{}'::jsonb,
    tip_amount NUMERIC(10,2) DEFAULT 0.00,
    manual_discount_reason TEXT,
    shift_id UUID REFERENCES cash_shifts(id) ON DELETE SET NULL,
    active_course INT DEFAULT 1,
    cancel_reason TEXT,
    cancelled_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    preparing_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ
);

CREATE TABLE waiter_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    waiter_name TEXT DEFAULT 'Sin asignar',
    called_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    response_time_seconds INT,
    status TEXT DEFAULT 'pending'
);

CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    promo_type TEXT DEFAULT 'percentage', -- 'percentage', '2x1'
    promo_value TEXT,
    buy_qty INT DEFAULT 1,
    get_qty INT DEFAULT 2,
    trigger_product_id UUID,
    reward_product_id UUID,
    reward_discount_percentage INT DEFAULT 100,
    discount_percentage INT DEFAULT 15,
    bg_color TEXT DEFAULT '#b45309',
    text_color TEXT DEFAULT '#ffffff',
    bg_image_url TEXT,
    start_time TIME DEFAULT '00:00:00',
    end_time TIME DEFAULT '23:59:59',
    days_of_week INT[] DEFAULT ARRAY[0,1,2,3,4,5,6],
    scope_type TEXT DEFAULT 'all',
    applied_category_ids UUID[] DEFAULT ARRAY[]::UUID[],
    applied_type_ids UUID[] DEFAULT ARRAY[]::UUID[],
    applied_product_ids UUID[] DEFAULT ARRAY[]::UUID[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE supplies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'oz', 'pza')),
    current_stock NUMERIC(10,3) NOT NULL DEFAULT 0.000,
    min_stock_alert NUMERIC(10,3) NOT NULL DEFAULT 0.000,
    unit_cost NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    supply_id UUID REFERENCES supplies(id) ON DELETE CASCADE,
    quantity_per_portion NUMERIC(10,3) NOT NULL DEFAULT 1.000,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kitchen_waste (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    product_title TEXT NOT NULL,
    reason TEXT DEFAULT 'Cancelación en preparación',
    cost_loss NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ingredients_summary JSONB DEFAULT '[]'::jsonb,
    table_number TEXT,
    waiter_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE prepared_items_buffer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    product_title TEXT NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    status TEXT DEFAULT 'available',
    table_number TEXT,
    waiter_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    party_size INT NOT NULL DEFAULT 2,
    table_number TEXT DEFAULT 'Por asignar',
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    notes TEXT,
    status TEXT DEFAULT 'confirmed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    staff_role TEXT,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS PÚBLICAS PARA DESARROLLO
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiter_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_waste ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepared_items_buffer ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON restaurants FOR ALL USING (true);
CREATE POLICY "Allow all" ON tables FOR ALL USING (true);
CREATE POLICY "Allow all" ON staff_members FOR ALL USING (true);
CREATE POLICY "Allow all" ON categories FOR ALL USING (true);
CREATE POLICY "Allow all" ON product_types FOR ALL USING (true);
CREATE POLICY "Allow all" ON products FOR ALL USING (true);
CREATE POLICY "Allow all" ON product_modifiers FOR ALL USING (true);
CREATE POLICY "Allow all" ON cash_shifts FOR ALL USING (true);
CREATE POLICY "Allow all" ON orders FOR ALL USING (true);
CREATE POLICY "Allow all" ON waiter_calls FOR ALL USING (true);
CREATE POLICY "Allow all" ON promotions FOR ALL USING (true);
CREATE POLICY "Allow all" ON supplies FOR ALL USING (true);
CREATE POLICY "Allow all" ON product_recipes FOR ALL USING (true);
CREATE POLICY "Allow all" ON kitchen_waste FOR ALL USING (true);
CREATE POLICY "Allow all" ON prepared_items_buffer FOR ALL USING (true);
CREATE POLICY "Allow all" ON reservations FOR ALL USING (true);
CREATE POLICY "Allow all" ON audit_logs FOR ALL USING (true);

BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE
    orders, waiter_calls, products, product_modifiers, promotions,
    supplies, reservations, prepared_items_buffer, kitchen_waste,
    tables, cash_shifts, staff_members, audit_logs;
COMMIT;

-- DATOS SEMILLA
DO $$
DECLARE
    r_id UUID := 'b47a9880-9fd3-4c9b-b05b-86ea8f0d014d';
    cat_1 UUID := gen_random_uuid();
    cat_2 UUID := gen_random_uuid();
    cat_3 UUID := gen_random_uuid();
    typ_1 UUID := gen_random_uuid();
    typ_2 UUID := gen_random_uuid();
    typ_3 UUID := gen_random_uuid();
    p_1 UUID := gen_random_uuid();
    p_2 UUID := gen_random_uuid();
    p_3 UUID := gen_random_uuid();
    s_cafe UUID := gen_random_uuid();
    s_leche UUID := gen_random_uuid();
    s_pan UUID := gen_random_uuid();
    s_aguacate UUID := gen_random_uuid();
    s_huevo UUID := gen_random_uuid();
BEGIN
    INSERT INTO restaurants (id, slug, name, description, logo_url, banner_url, wifi_ssid, wifi_password, whatsapp_number, google_maps_embed)
    VALUES (
        r_id, 'cafe-aurea', 'Café & Bistro Áurea',
        'Cafetería de especialidad, panadería artesanal y cocina de temporada.',
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=250&q=80',
        'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
        'Aurea_HighSpeed', 'Brunch2026', '523312345678',
        '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d238881.2005106541!2d-103.54023540205885!3d20.68914890429659!2m3!1f0!2f0!3f0!3m2!1i768!2f13.1!3m3!1m2!1s0x62d31e8f56465651%3A0x1c58e4177a2af557!2sHAZ%20Retail%20Studio!5e0!3m2!1ses-419!2smx!4v1793732225636!5m2!1ses-419!2smx" width="100%" height="250" style="border:0;" allowfullscreen="" loading="lazy"></iframe>'
    );

    INSERT INTO tables (restaurant_id, table_number, zone, capacity, status) VALUES
        (r_id, '01', 'Salón Principal', 4, 'available'),
        (r_id, '02', 'Salón Principal', 2, 'available'),
        (r_id, '03', 'Salón Principal', 4, 'occupied'),
        (r_id, '04', 'Salón Principal', 6, 'available'),
        (r_id, '05', 'Terraza', 4, 'available'),
        (r_id, '06', 'Terraza', 4, 'available'),
        (r_id, '07', 'Terraza', 2, 'available'),
        (r_id, '08', 'Barra', 2, 'available');

    INSERT INTO staff_members (restaurant_id, name, role, pin) VALUES
        (r_id, 'Admin General', 'admin', '1234'),
        (r_id, 'Gerente Turno', 'management', '2222'),
        (r_id, 'Chef Cocina', 'kitchen', '3333'),
        (r_id, 'Carlos M.', 'waiter', '4444'),
        (r_id, 'Sofía R.', 'waiter', '5555'),
        (r_id, 'Miguel A.', 'waiter', '5678'),
        (r_id, 'Barra / Caja', 'cashier', '6666');

    INSERT INTO categories (id, restaurant_id, name, icon, order_index) VALUES
        (cat_1, r_id, 'Brunch & Cocina', '🥪', 1),
        (cat_2, r_id, 'Cafetería de Especialidad', '☕', 2),
        (cat_3, r_id, 'Panadería Artesanal', '🥐', 3);

    INSERT INTO product_types (id, restaurant_id, name, icon, order_index) VALUES
        (typ_1, r_id, 'Salado / Brunch', '🥪', 1),
        (typ_2, r_id, 'Bebida Caliente', '☕', 2),
        (typ_3, r_id, 'Dulce / Panadería', '🥐', 3);

    INSERT INTO products (id, restaurant_id, category_id, type_id, title, description, price, station, media) VALUES
        (p_1, r_id, cat_1, typ_1, 'Tostón de Aguacate Trufado', 'Pan de masa madre, aguacate hass y huevo poché orgánico.', 165.00, 'cocina', '[{"type":"image","url":"https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80"}]'::jsonb),
        (p_2, r_id, cat_2, typ_2, 'Flat White Oaxaca Pluma', 'Extracción doble con leche emulsionada y notas a avellana.', 78.00, 'barra', '[{"type":"image","url":"https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=800&q=80"}]'::jsonb),
        (p_3, r_id, cat_3, typ_3, 'Croissant de Almendra', 'Hojaldre fermentado 48h relleno de crema frangipane.', 85.00, 'panaderia', '[{"type":"image","url":"https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=80"}]'::jsonb);

    INSERT INTO product_modifiers (restaurant_id, name, price) VALUES
        (r_id, 'Leche de Avena', 15.00),
        (r_id, 'Leche Deslactosada', 10.00),
        (r_id, 'Shot Extra de Espresso', 22.00),
        (r_id, 'Sin Cebolla', 0.00),
        (r_id, 'Extra Aguacate', 30.00),
        (r_id, 'Huevo Extra', 25.00);

    INSERT INTO promotions (restaurant_id, title, description, promo_type, discount_percentage, bg_color, is_active) VALUES
        (r_id, 'Happy Hour Café 2x1', 'En bebidas participantes de cafetería de especialidad.', '2x1', 0, '#92400e', TRUE),
        (r_id, '15% en Brunch de Temporada', 'Aplica automáticamente en toda tu orden hoy.', 'percentage', 15, '#065f46', FALSE);

    INSERT INTO supplies (id, restaurant_id, name, unit, current_stock, min_stock_alert, unit_cost) VALUES
        (s_cafe, r_id, 'Café Pluma Oaxaca en Grano', 'g', 4500.000, 1000.000, 0.4200),
        (s_leche, r_id, 'Leche Entera Barista', 'ml', 10500.000, 2500.000, 0.0320),
        (s_pan, r_id, 'Pan Hogaza Masa Madre', 'pza', 20.000, 5.000, 14.5000),
        (s_aguacate, r_id, 'Aguacate Hass', 'pza', 35.000, 8.000, 9.0000),
        (s_huevo, r_id, 'Huevo Orgánico', 'pza', 50.000, 12.000, 4.5000);

    INSERT INTO product_recipes (restaurant_id, product_id, supply_id, quantity_per_portion) VALUES
        (r_id, p_1, s_pan, 1.000),
        (r_id, p_1, s_aguacate, 0.500),
        (r_id, p_1, s_huevo, 1.000),
        (r_id, p_2, s_cafe, 18.000),
        (r_id, p_2, s_leche, 180.000);

    INSERT INTO orders (restaurant_id, table_number, order_channel, waiter_name, items, subtotal, discount, total, status, payment_method, tip_amount, created_at, preparing_at, delivered_at, paid_at) VALUES
        (r_id, '01', 'dine_in', 'Carlos M.', jsonb_build_array(
            jsonb_build_object('id', p_1, 'title', 'Tostón de Aguacate Trufado', 'qty', 1, 'price', 165.00, 'station', 'cocina', 'course', 1, 'done', true, 'inventory_deducted', true),
            jsonb_build_object('id', p_2, 'title', 'Flat White Oaxaca Pluma', 'qty', 2, 'price', 78.00, 'station', 'barra', 'course', 1, 'done', true, 'inventory_deducted', true)
        ), 321.00, 0.00, 321.00, 'paid', 'card', 32.00, NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '25 minutes', NOW() - INTERVAL '5 minutes'),
        (r_id, '03', 'dine_in', 'Sofía R.', jsonb_build_array(
            jsonb_build_object('id', p_1, 'title', 'Tostón de Aguacate Trufado', 'qty', 1, 'price', 165.00, 'station', 'cocina', 'course', 1, 'done', false, 'inventory_deducted', true),
            jsonb_build_object('id', p_2, 'title', 'Flat White Oaxaca Pluma', 'qty', 1, 'price', 78.00, 'station', 'barra', 'course', 1, 'done', true, 'inventory_deducted', true)
        ), 243.00, 0.00, 243.00, 'preparing', NULL, 0.00, NOW() - INTERVAL '12 minutes', NOW() - INTERVAL '8 minutes', NULL, NULL);

    INSERT INTO reservations (restaurant_id, customer_name, customer_phone, party_size, table_number, reservation_date, reservation_time, notes, status) VALUES
        (r_id, 'Valeria Méndez', '3318902345', 4, '05', CURRENT_DATE, '14:30:00', 'Celebración de aniversario', 'confirmed'),
        (r_id, 'Héctor Salgado', '3398765432', 2, '02', CURRENT_DATE, '16:00:00', 'Preferencia terraza', 'confirmed');
END $$;
