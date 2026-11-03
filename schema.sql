-- 1. EXTENSIÓN PARA UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. LIMPIEZA PREVIA
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS waiter_calls CASCADE;
DROP TABLE IF EXISTS promotions CASCADE;
DROP TABLE IF EXISTS product_modifiers CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS product_types CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
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
    called_at TIMESTAMPTZ DEFAULT NOW(),
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

-- 8. POLÍTICAS RLS
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiter_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON restaurants FOR ALL USING (true);
CREATE POLICY "Allow all" ON categories FOR ALL USING (true);
CREATE POLICY "Allow all" ON product_types FOR ALL USING (true);
CREATE POLICY "Allow all" ON products FOR ALL USING (true);
CREATE POLICY "Allow all" ON product_modifiers FOR ALL USING (true);
CREATE POLICY "Allow all" ON orders FOR ALL USING (true);
CREATE POLICY "Allow all" ON waiter_calls FOR ALL USING (true);
CREATE POLICY "Allow all" ON promotions FOR ALL USING (true);

-- 9. REALTIME
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE orders, waiter_calls, products, categories, product_types, promotions;
COMMIT;

-- 10. DATOS SEMILLA
DO $$
DECLARE
    r_id UUID := 'b47a9880-9fd3-4c9b-b05b-86ea8f0d014d';
    cat_1 UUID := gen_random_uuid();
    cat_2 UUID := gen_random_uuid();
    typ_1 UUID := gen_random_uuid();
    typ_2 UUID := gen_random_uuid();
    p_1 UUID := gen_random_uuid();
    p_2 UUID := gen_random_uuid();
BEGIN
    INSERT INTO restaurants (id, slug, name, description, logo_url, banner_url, wifi_ssid, wifi_password, whatsapp_number)
    VALUES (
        r_id, 'cafe-aurea', 'Café & Bistro Áurea', 
        'Cafetería de especialidad, panadería artesanal y cocina de temporada.',
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=250&q=80',
        'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
        'Aurea_HighSpeed', 'Brunch2026', '523312345678'
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

    INSERT INTO product_modifiers (restaurant_id, name, price, applies_to_products) VALUES 
        (r_id, 'Sin Huevo Poché', 0.00, ARRAY[p_1]),
        (r_id, 'Leche de Avena Barista', 15.00, ARRAY[p_2]);

    INSERT INTO promotions (restaurant_id, title, description, promo_type, promo_value, buy_qty, get_qty) VALUES 
        (r_id, 'Happy Hour 2x1 en Café', 'Paga 1 y lleva 2 en bebidas calientes.', '2x1', '2x1', 1, 2);

    INSERT INTO orders (restaurant_id, table_number, waiter_name, items, subtotal, discount, total, status, created_at) VALUES 
        (r_id, '01', 'Carlos M.', jsonb_build_array(
            jsonb_build_object('title', 'Tostón de Aguacate Trufado', 'qty', 1, 'price', 165.00, 'modifiers', ARRAY['Sin Huevo Poché']),
            jsonb_build_object('title', 'Flat White Oaxaca Pluma', 'qty', 2, 'price', 78.00, 'modifiers', ARRAY['Leche de Avena Barista'])
        ), 321.00, 78.00, 243.00, 'pending', NOW() - INTERVAL '5 minutes');
END $$;
