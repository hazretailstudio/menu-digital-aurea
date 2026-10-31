-- 1. EXTENSIÓN PARA UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA RESTAURANTES
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    wifi_ssid TEXT,
    wifi_password TEXT,
    wifi_encryption TEXT DEFAULT 'WPA',
    whatsapp_number TEXT,
    cross_sell_title TEXT DEFAULT 'Frecuentemente pedidos juntos',
    bottom_left_type TEXT DEFAULT 'promo',
    bottom_left_label TEXT DEFAULT 'Promos',
    bottom_left_icon TEXT DEFAULT 'tag',
    bottom_left_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA CATEGORÍAS (CON ICONO, ORDEN Y JERARQUÍA)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🍽️',
    parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    order_index INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA TIPOS DE PLATILLO (CLASIFICACIÓN DIRECTA)
CREATE TABLE IF NOT EXISTS product_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🏷️',
    order_index INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA ETIQUETAS (TAGS)
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#f59e0b',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLA PRODUCTOS
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    type_id UUID REFERENCES product_types(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    media JSONB DEFAULT '[]'::jsonb,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_available BOOLEAN DEFAULT TRUE,
    recommended_product_ids UUID[] DEFAULT ARRAY[]::UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABLA MODIFICADORES / EXTRAS
CREATE TABLE IF NOT EXISTS product_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10,2) DEFAULT 0.00,
    type TEXT DEFAULT 'extra',
    applies_to_categories UUID[] DEFAULT ARRAY[]::UUID[],
    applies_to_products UUID[] DEFAULT ARRAY[]::UUID[]
);

-- 8. TABLA LLAMADAS DE MESERO
CREATE TABLE IF NOT EXISTS waiter_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    called_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    duration_seconds INT,
    status TEXT DEFAULT 'pending'
);

-- 9. TABLA DE COMANDAS / PEDIDOS (KDS)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    waiter_name TEXT DEFAULT 'Sin asignar',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    applied_promotions TEXT[] DEFAULT ARRAY[]::TEXT[],
    status TEXT DEFAULT 'pending', -- 'pending', 'preparing', 'delivered', 'paid'
    customer_notes TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    preparing_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    prep_time_seconds INT,
    total_time_seconds INT
);

-- 10. TABLA PROMOCIONES CON REGLAS Y HORARIOS
CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    promo_type TEXT DEFAULT 'percentage',
    promo_value TEXT,
    buy_qty INT DEFAULT 1,
    get_qty INT DEFAULT 1,
    trigger_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    reward_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    reward_discount_percentage INT DEFAULT 100,
    discount_percentage INT DEFAULT 0,
    bg_color TEXT DEFAULT '#b45309',
    text_color TEXT DEFAULT '#ffffff',
    bg_image_url TEXT,
    start_date DATE,
    end_date DATE,
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

-- 11. POLÍTICAS RLS
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiter_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow all restaurants" ON restaurants;
    DROP POLICY IF EXISTS "Allow all categories" ON categories;
    DROP POLICY IF EXISTS "Allow all product_types" ON product_types;
    DROP POLICY IF EXISTS "Allow all tags" ON tags;
    DROP POLICY IF EXISTS "Allow all products" ON products;
    DROP POLICY IF EXISTS "Allow all product_modifiers" ON product_modifiers;
    DROP POLICY IF EXISTS "Allow all waiter_calls" ON waiter_calls;
    DROP POLICY IF EXISTS "Allow all orders" ON orders;
    DROP POLICY IF EXISTS "Allow all promotions" ON promotions;
END $$;

CREATE POLICY "Allow all restaurants" ON restaurants FOR ALL USING (true);
CREATE POLICY "Allow all categories" ON categories FOR ALL USING (true);
CREATE POLICY "Allow all product_types" ON product_types FOR ALL USING (true);
CREATE POLICY "Allow all tags" ON tags FOR ALL USING (true);
CREATE POLICY "Allow all products" ON products FOR ALL USING (true);
CREATE POLICY "Allow all product_modifiers" ON product_modifiers FOR ALL USING (true);
CREATE POLICY "Allow all waiter_calls" ON waiter_calls FOR ALL USING (true);
CREATE POLICY "Allow all orders" ON orders FOR ALL USING (true);
CREATE POLICY "Allow all promotions" ON promotions FOR ALL USING (true);

-- 12. STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-media', 'menu-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Public Read Media" ON storage.objects;
    DROP POLICY IF EXISTS "Public Upload Media" ON storage.objects;
    DROP POLICY IF EXISTS "Public Delete Media" ON storage.objects;
END $$;

CREATE POLICY "Public Read Media" ON storage.objects FOR SELECT USING (bucket_id = 'menu-media');
CREATE POLICY "Public Upload Media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'menu-media');
CREATE POLICY "Public Delete Media" ON storage.objects FOR DELETE USING (bucket_id = 'menu-media');

-- 13. REALTIME
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE waiter_calls, products, orders, categories, product_types, promotions;
COMMIT;

-- 14. DATOS SEMILLA
DO $$
DECLARE
    r_id UUID := 'b47a9880-9fd3-4c9b-b05b-86ea8f0d014d';
    cat_brunch UUID := '11111111-1111-1111-1111-111111111111';
    cat_cafe UUID := '22222222-2222-2222-2222-222222222222';
    typ_salado UUID := '44444444-4444-4444-4444-444444444441';
    typ_caliente UUID := '44444444-4444-4444-4444-444444444442';
    prod_toston UUID := '33333333-3333-3333-3333-333333333331';
    prod_flat UUID := '33333333-3333-3333-3333-333333333332';
BEGIN
    INSERT INTO restaurants (id, slug, name, description, logo_url, banner_url, wifi_ssid, wifi_password, whatsapp_number, cross_sell_title)
    VALUES (
        r_id,
        'cafe-aurea',
        'Café & Bistro Áurea',
        'Cafetería de especialidad, panadería horneada a diario y cocina de temporada con ingredientes orgánicos.',
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=250&q=80',
        'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
        'Aurea_HighSpeed',
        'Brunch2026',
        '523312345678',
        'Combina perfecto con:'
    ) ON CONFLICT (slug) DO UPDATE SET
        logo_url = EXCLUDED.logo_url,
        banner_url = EXCLUDED.banner_url,
        description = EXCLUDED.description;

    INSERT INTO categories (id, restaurant_id, name, icon, order_index)
    VALUES 
        (cat_brunch, r_id, 'Brunch & Cocina', '🥪', 1),
        (cat_cafe, r_id, 'Cafetería de Especialidad', '☕', 2)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO product_types (id, restaurant_id, name, icon, order_index)
    VALUES
        (typ_salado, r_id, 'Salado / Brunch', '🥪', 1),
        (typ_caliente, r_id, 'Bebida Caliente', '☕', 2),
        (gen_random_uuid(), r_id, 'Bebida Fría', '🧊', 3),
        (gen_random_uuid(), r_id, 'Dulce / Postre', '🥐', 4)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO products (id, restaurant_id, category_id, type_id, title, description, price, media, tags, recommended_product_ids)
    VALUES 
        (prod_toston, r_id, cat_brunch, typ_salado, 'Tostón de Aguacate Trufado', 'Pan de masa madre, láminas de aguacate hass, huevo poché orgánico y aceite de trufa blanca.', 165.00, '[{"type":"image","url":"https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80"}]'::jsonb, ARRAY['Favorito', 'Vegetariano'], ARRAY[prod_flat]),
        (prod_flat, r_id, cat_cafe, typ_caliente, 'Flat White Oaxaca Pluma', 'Extracción doble con leche emulsionada aterciopelada y notas a chocolate y avellana.', 78.00, '[{"type":"image","url":"https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=800&q=80"}]'::jsonb, ARRAY['Recomendado'], ARRAY[prod_toston])
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO product_modifiers (restaurant_id, name, price, type, applies_to_products)
    VALUES 
        (r_id, 'Sin Huevo Poché', 0.00, 'removable', ARRAY[prod_toston]),
        (r_id, 'Salsa de Trufa Extra', 35.00, 'extra', ARRAY[prod_toston]),
        (r_id, 'Leche de Avena Barista', 15.00, 'extra', ARRAY[prod_flat])
    ON CONFLICT DO NOTHING;

    INSERT INTO promotions (restaurant_id, title, description, promo_type, promo_value, buy_qty, get_qty, start_time, end_time, scope_type, is_active)
    VALUES 
        (r_id, 'Happy Hour 2x1 en Café', 'Paga 1 y lleva 2 en bebidas de especialidad seleccionadas.', '2x1', '2x1', 1, 2, '00:00:00', '23:59:59', 'all', true)
    ON CONFLICT DO NOTHING;
END $$;
