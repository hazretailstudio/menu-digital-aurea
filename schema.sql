-- 1. EXTENSIÓN PARA UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. LIMPIEZA PREVIA
DROP TABLE IF EXISTS kitchen_waste CASCADE;
DROP TABLE IF EXISTS prepared_items_buffer CASCADE;
DROP TABLE IF EXISTS product_recipes CASCADE;
DROP TABLE IF EXISTS supplies CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS waiter_calls CASCADE;
DROP TABLE IF EXISTS promotions CASCADE;
DROP TABLE IF EXISTS product_modifiers CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS product_types CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS restaurants CASCADE;

-- 3. RESTAURANTES
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

-- 4. CATEGORÍAS & TIPOS
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

-- 5. PRODUCTOS Y MODIFICADORES
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    type_id UUID REFERENCES product_types(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
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

-- 6. COMANDAS Y LLAMADAS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    order_channel TEXT DEFAULT 'dine_in', -- 'dine_in', 'takeout', 'rappi', 'didi', 'ubereats'
    waiter_name TEXT DEFAULT 'Sin asignar',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    applied_promotions TEXT[] DEFAULT ARRAY[]::TEXT[],
    status TEXT DEFAULT 'pending',
    customer_notes TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
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

-- 7. PROMOCIONES
CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    promo_type TEXT DEFAULT '2x1',
    promo_value TEXT,
    buy_qty INT DEFAULT 1,
    get_qty INT DEFAULT 2,
    trigger_product_id UUID,
    reward_product_id UUID,
    reward_discount_percentage INT DEFAULT 100,
    discount_percentage INT DEFAULT 0,
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

-- 8. INVENTARIO & ESCANDALLOS
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE prepared_items_buffer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    product_title TEXT NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    status TEXT DEFAULT 'available', -- 'available', 'resold', 'discarded'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. RESERVAS
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
    status TEXT DEFAULT 'confirmed', -- 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. POLÍTICAS RLS PÚBLICAS
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiter_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_waste ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepared_items_buffer ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON restaurants FOR ALL USING (true);
CREATE POLICY "Allow all" ON categories FOR ALL USING (true);
CREATE POLICY "Allow all" ON product_types FOR ALL USING (true);
CREATE POLICY "Allow all" ON products FOR ALL USING (true);
CREATE POLICY "Allow all" ON product_modifiers FOR ALL USING (true);
CREATE POLICY "Allow all" ON orders FOR ALL USING (true);
CREATE POLICY "Allow all" ON waiter_calls FOR ALL USING (true);
CREATE POLICY "Allow all" ON promotions FOR ALL USING (true);
CREATE POLICY "Allow all" ON supplies FOR ALL USING (true);
CREATE POLICY "Allow all" ON product_recipes FOR ALL USING (true);
CREATE POLICY "Allow all" ON kitchen_waste FOR ALL USING (true);
CREATE POLICY "Allow all" ON prepared_items_buffer FOR ALL USING (true);
CREATE POLICY "Allow all" ON reservations FOR ALL USING (true);

-- 11. PUBLICACIÓN REALTIME
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE orders, waiter_calls, products, supplies, reservations, prepared_items_buffer, kitchen_waste;
COMMIT;

-- 12. DATOS SEMILLA
DO $$
DECLARE
    r_id UUID := 'b47a9880-9fd3-4c9b-b05b-86ea8f0d014d';
    cat_1 UUID := gen_random_uuid();
    cat_2 UUID := gen_random_uuid();
    typ_1 UUID := gen_random_uuid();
    typ_2 UUID := gen_random_uuid();
    p_1 UUID := gen_random_uuid();
    p_2 UUID := gen_random_uuid();
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
        '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d238881.2005106541!2d-103.54023540205885!3d20.68914890429659!2m3!1f0!2f0!3f0!3m2!1i768!2f13.1!3m3!1m2!1s0x62d31e8f56465651%3A0x1c58e4177a2af557!2sHAZ%20Retail%20Studio!5e0!3m2!1ses-419!2smx!4v1793732225636!5m2!1ses-419!2smx" width="100%" height="250" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>'
    );

    INSERT INTO categories (id, restaurant_id, name, icon, order_index) VALUES 
        (cat_1, r_id, 'Brunch & Cocina', '🥪', 1),
        (cat_2, r_id, 'Cafetería de Especialidad', '☕', 2);

    INSERT INTO product_types (id, restaurant_id, name, icon, order_index) VALUES 
        (typ_1, r_id, 'Salado / Brunch', '🥪', 1),
        (typ_2, r_id, 'Bebida Caliente', '☕', 2);

    INSERT INTO products (id, restaurant_id, category_id, type_id, title, description, price, media) VALUES 
        (p_1, r_id, cat_1, typ_1, 'Tostón de Aguacate Trufado', 'Pan de masa madre, aguacate hass y huevo poché orgánico.', 165.00, '[{"type":"image","url":"https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80"}]'::jsonb),
        (p_2, r_id, cat_2, typ_2, 'Flat White Oaxaca Pluma', 'Extracción doble con leche emulsionada y notas a avellana.', 78.00, '[{"type":"image","url":"https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=800&q=80"}]'::jsonb);

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

    INSERT INTO orders (restaurant_id, table_number, order_channel, waiter_name, items, subtotal, discount, total, status, created_at, preparing_at, delivered_at, paid_at) VALUES 
        (r_id, '01', 'dine_in', 'Carlos M.', jsonb_build_array(
            jsonb_build_object('id', p_1, 'title', 'Tostón de Aguacate Trufado', 'qty', 1, 'price', 165.00),
            jsonb_build_object('id', p_2, 'title', 'Flat White Oaxaca Pluma', 'qty', 2, 'price', 78.00)
        ), 321.00, 0.00, 321.00, 'paid', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '25 minutes', NOW() - INTERVAL '5 minutes'),
        (r_id, '03', 'dine_in', 'Sofía R.', jsonb_build_array(
            jsonb_build_object('id', p_1, 'title', 'Tostón de Aguacate Trufado', 'qty', 1, 'price', 165.00)
        ), 165.00, 0.00, 165.00, 'preparing', NOW() - INTERVAL '12 minutes', NOW() - INTERVAL '8 minutes', NULL, NULL),
        (r_id, 'Takeout-01', 'takeout', 'Carlos M.', jsonb_build_array(
            jsonb_build_object('id', p_2, 'title', 'Flat White Oaxaca Pluma', 'qty', 1, 'price', 78.00)
        ), 78.00, 0.00, 78.00, 'pending', NOW() - INTERVAL '3 minutes', NULL, NULL, NULL);

    INSERT INTO reservations (restaurant_id, customer_name, customer_phone, party_size, table_number, reservation_date, reservation_time, notes, status) VALUES 
        (r_id, 'Valeria Méndez', '3318902345', 4, '05', CURRENT_DATE, '14:30:00', 'Celebración de aniversario', 'confirmed'),
        (r_id, 'Héctor Salgado', '3398765432', 2, '02', CURRENT_DATE, '16:00:00', 'Preferencia terraza', 'confirmed');
END $$;


-- AJUSTES ADICIONALES PARA DIVISIÓN DE CUENTA Y TRAZABILIDAD
ALTER TABLE orders ADD COLUMN IF NOT EXISTS has_new_additions BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes_updated BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_cycle_started_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_type TEXT DEFAULT 'single';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_details JSONB DEFAULT '[]'::jsonb;

ALTER TABLE waiter_calls ADD COLUMN IF NOT EXISTS waiter_name TEXT DEFAULT 'Sin asignar';
ALTER TABLE waiter_calls ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE waiter_calls ADD COLUMN IF NOT EXISTS response_time_seconds INT;

ALTER TABLE kitchen_waste ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE kitchen_waste ADD COLUMN IF NOT EXISTS waiter_name TEXT;
ALTER TABLE prepared_items_buffer ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE prepared_items_buffer ADD COLUMN IF NOT EXISTS waiter_name TEXT;
