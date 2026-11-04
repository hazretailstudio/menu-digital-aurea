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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    preparing_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    has_new_additions BOOLEAN DEFAULT FALSE,
    notes_updated BOOLEAN DEFAULT FALSE,
    kitchen_cycle_started_at TIMESTAMPTZ,
    split_type TEXT DEFAULT 'single',
    split_details JSONB DEFAULT '[]'::jsonb
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
    status TEXT DEFAULT 'confirmed',
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