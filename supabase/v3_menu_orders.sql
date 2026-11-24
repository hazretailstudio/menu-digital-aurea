-- ============================================================================
-- MIGRACIÓN V3.1 (SIN DUPLICIDADES): MENÚ QR + COMANDAS ADMIN + WHATSAPP
-- Compatible 100% con admin.html (Comandas Kanban) y migration_v2.sql
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Configuración de pedidos en restaurants
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_ordering_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS order_delivery_mode TEXT DEFAULT 'KDS'
    CHECK (order_delivery_mode IN ('KDS', 'WHATSAPP', 'BOTH')),
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Mexico_City',
  ADD COLUMN IF NOT EXISTS location GEOGRAPHY(Point, 4326),
  ADD COLUMN IF NOT EXISTS delivery_pricing_mode TEXT DEFAULT 'DISTANCE'
    CHECK (delivery_pricing_mode IN ('DISTANCE', 'ZONE', 'BOTH')),
  ADD COLUMN IF NOT EXISTS delivery_distance_tiers JSONB DEFAULT '[
    {"min_km": 0, "max_km": 3, "fee": 25},
    {"min_km": 3, "max_km": 6, "fee": 45}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS general_hours JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS channel_hours JSONB DEFAULT '{}'::jsonb;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS schedule_hours JSONB DEFAULT '{}'::jsonb;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number SERIAL,
  ADD COLUMN IF NOT EXISTS table_session_id UUID,
  ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'DINE_IN'
    CHECK (order_type IN ('DINE_IN', 'PICKUP', 'DELIVERY')),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cash_tendered NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS change_due NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS requires_card_terminal BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING'
    CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS items_snapshot JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS guest_subtotals JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onesignal_player_id TEXT;

-- 2. Nuevas tablas (Carrito grupal, Modificadores avanzados, Zonas PostGIS)
CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
  table_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_table_session
  ON table_sessions (restaurant_id, table_id)
  WHERE status = 'OPEN' AND table_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  selected_modifiers JSONB DEFAULT '[]'::jsonb,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_required BOOLEAN DEFAULT FALSE,
  min_selections INT DEFAULT 0 CHECK (min_selections >= 0),
  max_selections INT DEFAULT 1 CHECK (max_selections >= 1),
  max_qty_per_option INT DEFAULT 1 CHECK (max_qty_per_option >= 1),
  pricing_type TEXT NOT NULL DEFAULT 'ADDITIVE'
    CHECK (pricing_type IN ('ADDITIVE', 'OVERRIDE', 'FREE_UP_TO_N')),
  free_up_to INT DEFAULT 0,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  is_available BOOLEAN DEFAULT TRUE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone_polygon GEOMETRY(Polygon, 4326) NOT NULL,
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_geom
  ON delivery_zones USING GIST (zone_polygon);

-- 3. Validación de horarios (America/Mexico_City)
CREATE OR REPLACE FUNCTION is_within_schedule(p_schedule JSONB, p_tz TEXT DEFAULT 'America/Mexico_City')
RETURNS BOOLEAN AS $$
DECLARE
  v_now TIMESTAMP := NOW() AT TIME ZONE COALESCE(p_tz, 'America/Mexico_City');
  v_dow TEXT := EXTRACT(DOW FROM v_now)::TEXT;
  v_time TIME := v_now::TIME;
  v_slots JSONB;
  v_slot JSONB;
BEGIN
  IF p_schedule IS NULL OR p_schedule = '{}'::jsonb THEN
    RETURN TRUE;
  END IF;
  v_slots := p_schedule -> v_dow;
  IF v_slots IS NULL OR jsonb_array_length(v_slots) = 0 THEN
    RETURN FALSE;
  END IF;
  FOR v_slot IN SELECT * FROM jsonb_array_elements(v_slots)
  LOOP
    IF v_time >= (v_slot->>'open')::TIME AND v_time <= (v_slot->>'close')::TIME THEN
      RETURN TRUE;
    END IF;
  END LOOP;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Cálculo de envío por Polígono (ST_Contains) o Distancia (ST_Distance)
CREATE OR REPLACE FUNCTION calculate_delivery_fee(
  p_restaurant_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_subtotal NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  v_rest RECORD;
  v_point GEOMETRY(Point, 4326);
  v_zone RECORD;
  v_dist_km DOUBLE PRECISION;
  v_tier JSONB;
BEGIN
  SELECT location, delivery_pricing_mode, delivery_distance_tiers
  INTO v_rest FROM restaurants WHERE id = p_restaurant_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Se requieren coordenadas (lat, lng) para calcular el envío';
  END IF;

  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  IF v_rest.delivery_pricing_mode IN ('ZONE', 'BOTH') THEN
    SELECT * INTO v_zone FROM delivery_zones
    WHERE restaurant_id = p_restaurant_id AND is_active = TRUE
      AND ST_Contains(zone_polygon, v_point)
    LIMIT 1;

    IF FOUND THEN
      IF p_subtotal < v_zone.min_order_amount THEN
        RAISE EXCEPTION 'El monto mínimo para la zona % es de $% MXN', v_zone.name, v_zone.min_order_amount;
      END IF;
      RETURN jsonb_build_object('covered', TRUE, 'mode', 'ZONE', 'zone_name', v_zone.name, 'fee', v_zone.delivery_fee);
    ELSIF v_rest.delivery_pricing_mode = 'ZONE' THEN
      RAISE EXCEPTION 'Tu ubicación está fuera de nuestras zonas de reparto';
    END IF;
  END IF;

  IF v_rest.location IS NULL THEN
    RAISE EXCEPTION 'El restaurante no tiene coordenadas configuradas';
  END IF;

  v_dist_km := ST_Distance(v_rest.location, v_point::GEOGRAPHY) / 1000.0;

  FOR v_tier IN SELECT * FROM jsonb_array_elements(COALESCE(v_rest.delivery_distance_tiers, '[]'::jsonb))
  LOOP
    IF v_dist_km >= (v_tier->>'min_km')::DOUBLE PRECISION
       AND v_dist_km <= (v_tier->>'max_km')::DOUBLE PRECISION THEN
      RETURN jsonb_build_object(
        'covered', TRUE, 'mode', 'DISTANCE',
        'distance_km', ROUND(v_dist_km::NUMERIC, 2),
        'fee', (v_tier->>'fee')::NUMERIC
      );
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Fuera de cobertura (%.2f km excede el límite permitido)', v_dist_km;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. RPC Atómica create_order -> Inserta con status 'pending' directo al Kanban del Admin
CREATE OR REPLACE FUNCTION create_order(
  p_restaurant_id UUID,
  p_order_type TEXT,
  p_items JSONB,
  p_table_session_id UUID DEFAULT NULL,
  p_table_number TEXT DEFAULT '01',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_delivery_lat DOUBLE PRECISION DEFAULT NULL,
  p_delivery_lng DOUBLE PRECISION DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'CASH',
  p_cash_tendered NUMERIC DEFAULT NULL,
  p_requires_card_terminal BOOLEAN DEFAULT FALSE,
  p_customer_notes TEXT DEFAULT NULL,
  p_onesignal_player_id TEXT DEFAULT NULL,
  p_close_session BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_rest RECORD;
  v_item JSONB;
  v_prod RECORD;
  v_cat RECORD;
  v_grp RECORD;
  v_mod JSONB;
  v_opt RECORD;
  v_legacy_mod RECORD;
  v_base_price NUMERIC(10,2);
  v_mods_total NUMERIC(10,2);
  v_unit_final NUMERIC(10,2);
  v_line_total NUMERIC(10,2);
  v_subtotal NUMERIC(10,2) := 0;
  v_delivery_fee NUMERIC(10,2) := 0;
  v_total NUMERIC(10,2) := 0;
  v_change_due NUMERIC(10,2) := 0;
  v_snapshot JSONB := '[]'::jsonb;
  v_mods_snapshot JSONB;
  v_guest_subtotals JSONB := '{}'::jsonb;
  v_guest TEXT;
  v_grp_count INT;
  v_free_remaining INT;
  v_chargeable_qty INT;
  v_has_groups BOOLEAN;
  v_delivery_res JSONB;
  v_channel TEXT;
  v_new_order RECORD;
BEGIN
  SELECT * INTO v_rest FROM restaurants WHERE id = p_restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  IF NOT COALESCE(v_rest.is_ordering_enabled, TRUE) THEN
    RAISE EXCEPTION 'El restaurante está en modo solo lectura';
  END IF;

  IF NOT is_within_schedule(v_rest.general_hours, v_rest.timezone) THEN
    RAISE EXCEPTION 'El restaurante se encuentra cerrado en este horario';
  END IF;
  IF v_rest.channel_hours ? p_order_type THEN
    IF NOT is_within_schedule(v_rest.channel_hours -> p_order_type, v_rest.timezone) THEN
      RAISE EXCEPTION 'El canal % no está disponible en este horario', p_order_type;
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_prod FROM products
    WHERE id = (v_item->>'product_id')::UUID AND restaurant_id = p_restaurant_id;

    IF NOT FOUND OR NOT COALESCE(v_prod.is_available, FALSE) THEN
      RAISE EXCEPTION 'El producto % no está disponible', COALESCE(v_prod.title, v_item->>'product_id');
    END IF;

    IF v_prod.category_id IS NOT NULL THEN
      SELECT * INTO v_cat FROM categories WHERE id = v_prod.category_id;
      IF FOUND AND NOT is_within_schedule(v_cat.schedule_hours, v_rest.timezone) THEN
        RAISE EXCEPTION 'La categoría "%" no está disponible en este horario', v_cat.name;
      END IF;
    END IF;

    v_base_price := v_prod.price;
    v_mods_total := 0;
    v_mods_snapshot := '[]'::jsonb;

    SELECT EXISTS(SELECT 1 FROM modifier_groups WHERE product_id = v_prod.id) INTO v_has_groups;

    IF v_has_groups THEN
      FOR v_grp IN SELECT * FROM modifier_groups WHERE product_id = v_prod.id ORDER BY order_index ASC
      LOOP
        SELECT COALESCE(SUM(COALESCE((m->>'qty')::INT, 1)), 0)
        INTO v_grp_count
        FROM jsonb_array_elements(COALESCE(v_item->'selected_modifiers', '[]'::jsonb)) m
        WHERE (m->>'group_id')::UUID = v_grp.id;

        IF v_grp.is_required AND v_grp_count < GREATEST(v_grp.min_selections, 1) THEN
          RAISE EXCEPTION 'Falta seleccionar opciones obligatorias en "%" para %', v_grp.name, v_prod.title;
        END IF;
        IF v_grp_count < v_grp.min_selections OR v_grp_count > v_grp.max_selections THEN
          RAISE EXCEPTION 'Selección inválida en "%" (mín %, máx %)', v_grp.name, v_grp.min_selections, v_grp.max_selections;
        END IF;

        v_free_remaining := COALESCE(v_grp.free_up_to, 0);

        FOR v_mod IN
          SELECT * FROM jsonb_array_elements(COALESCE(v_item->'selected_modifiers', '[]'::jsonb)) m
          WHERE (m->>'group_id')::UUID = v_grp.id
        LOOP
          SELECT * INTO v_opt FROM modifier_options
          WHERE id = (v_mod->>'option_id')::UUID AND group_id = v_grp.id;

          IF NOT FOUND OR NOT COALESCE(v_opt.is_available, FALSE) THEN
            RAISE EXCEPTION 'El modificador seleccionado no está disponible';
          END IF;
          IF COALESCE((v_mod->>'qty')::INT, 1) > v_grp.max_qty_per_option THEN
            RAISE EXCEPTION 'Cantidad excedida para "%"', v_opt.name;
          END IF;

          IF v_grp.pricing_type = 'OVERRIDE' THEN
            v_base_price := v_opt.price;
          ELSIF v_grp.pricing_type = 'FREE_UP_TO_N' THEN
            v_chargeable_qty := GREATEST(0, COALESCE((v_mod->>'qty')::INT, 1) - v_free_remaining);
            v_free_remaining := GREATEST(0, v_free_remaining - COALESCE((v_mod->>'qty')::INT, 1));
            v_mods_total := v_mods_total + (v_opt.price * v_chargeable_qty);
          ELSE
            v_mods_total := v_mods_total + (v_opt.price * COALESCE((v_mod->>'qty')::INT, 1));
          END IF;

          v_mods_snapshot := v_mods_snapshot || jsonb_build_object(
            'group_name', v_grp.name, 'option_id', v_opt.id, 'name', v_opt.name,
            'qty', COALESCE((v_mod->>'qty')::INT, 1), 'unit_price', v_opt.price, 'pricing_type', v_grp.pricing_type
          );
        END LOOP;
      END LOOP;
    ELSE
      FOR v_mod IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'selected_modifiers', '[]'::jsonb))
      LOOP
        SELECT * INTO v_legacy_mod FROM product_modifiers
        WHERE id = COALESCE((v_mod->>'option_id')::UUID, (v_mod->>'id')::UUID)
          AND restaurant_id = p_restaurant_id;
        IF FOUND THEN
          v_mods_total := v_mods_total + (v_legacy_mod.price * COALESCE((v_mod->>'qty')::INT, 1));
          v_mods_snapshot := v_mods_snapshot || jsonb_build_object(
            'option_id', v_legacy_mod.id, 'name', v_legacy_mod.name,
            'qty', COALESCE((v_mod->>'qty')::INT, 1), 'unit_price', v_legacy_mod.price, 'pricing_type', 'ADDITIVE'
          );
        END IF;
      END LOOP;
    END IF;

    v_unit_final := v_base_price + v_mods_total;
    v_line_total := v_unit_final * GREATEST(COALESCE((v_item->>'qty')::INT, 1), 1);
    v_subtotal := v_subtotal + v_line_total;

    v_guest := COALESCE(NULLIF(TRIM(v_item->>'guest_name'), ''), COALESCE(p_customer_name, 'General'));
    v_guest_subtotals := jsonb_set(
      v_guest_subtotals, ARRAY[v_guest],
      to_jsonb(COALESCE((v_guest_subtotals->>v_guest)::NUMERIC, 0) + v_line_total), TRUE
    );

    v_snapshot := v_snapshot || jsonb_build_object(
      'id', v_prod.id,
      'product_id', v_prod.id,
      'title', v_prod.title,
      'station', COALESCE(v_prod.station, 'cocina'),
      'qty', GREATEST(COALESCE((v_item->>'qty')::INT, 1), 1),
      'guest_name', v_guest,
      'price', v_unit_final,
      'unit_price', v_unit_final,
      'line_total', v_line_total,
      'modifiers', v_mods_snapshot,
      'note', COALESCE(v_item->>'notes', ''),
      'done', FALSE,
      'inventory_deducted', FALSE
    );
  END LOOP;

  IF p_order_type = 'DELIVERY' THEN
    v_delivery_res := calculate_delivery_fee(p_restaurant_id, p_delivery_lat, p_delivery_lng, v_subtotal);
    v_delivery_fee := (v_delivery_res->>'fee')::NUMERIC;
  END IF;

  v_total := v_subtotal + v_delivery_fee;

  IF p_payment_method = 'CASH' AND p_cash_tendered IS NOT NULL THEN
    IF p_cash_tendered < v_total THEN
      RAISE EXCEPTION 'El efectivo entregado ($%) es menor al total ($%)', p_cash_tendered, v_total;
    END IF;
    v_change_due := p_cash_tendered - v_total;
  END IF;

  -- Mapear canal al formato exacto del Kanban del Admin (dine_in | takeout | delivery)
  v_channel := CASE p_order_type
    WHEN 'PICKUP' THEN 'takeout'
    WHEN 'DELIVERY' THEN 'delivery'
    ELSE 'dine_in'
  END;

  -- Insertar con status 'pending' para entrar directo a Columna 1 del Admin (Comandas)
  INSERT INTO orders (
    restaurant_id, table_session_id, table_number, order_channel, order_type, waiter_name,
    items, items_snapshot, guest_subtotals, subtotal, delivery_fee, total,
    status, customer_name, customer_phone, delivery_address, delivery_lat, delivery_lng,
    payment_method, cash_tendered, change_due, requires_card_terminal,
    customer_notes, onesignal_player_id, is_archived
  ) VALUES (
    p_restaurant_id, p_table_session_id, p_table_number, v_channel, p_order_type, 'Menú QR',
    v_snapshot, v_snapshot, v_guest_subtotals, v_subtotal, v_delivery_fee, v_total,
    'pending', p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_lat, p_delivery_lng, p_payment_method, p_cash_tendered, v_change_due,
    p_requires_card_terminal, p_customer_notes, p_onesignal_player_id, FALSE
  )
  RETURNING * INTO v_new_order;

  IF p_table_session_id IS NOT NULL THEN
    DELETE FROM cart_items WHERE table_session_id = p_table_session_id;
    IF p_close_session THEN
      UPDATE table_sessions SET status = 'CLOSED', closed_at = NOW() WHERE id = p_table_session_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_new_order.id,
    'order_number', v_new_order.order_number,
    'status', v_new_order.status,
    'subtotal', v_new_order.subtotal,
    'delivery_fee', v_new_order.delivery_fee,
    'total', v_new_order.total,
    'change_due', v_new_order.change_due,
    'items_snapshot', v_new_order.items_snapshot,
    'guest_subtotals', v_new_order.guest_subtotals
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Políticas RLS
ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='modifier_groups' AND policyname='Public read modifier_groups') THEN
    CREATE POLICY "Public read modifier_groups" ON modifier_groups FOR SELECT USING (true);
    CREATE POLICY "Auth manage modifier_groups" ON modifier_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='modifier_options' AND policyname='Public read modifier_options') THEN
    CREATE POLICY "Public read modifier_options" ON modifier_options FOR SELECT USING (true);
    CREATE POLICY "Auth manage modifier_options" ON modifier_options FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='delivery_zones' AND policyname='Public read delivery_zones') THEN
    CREATE POLICY "Public read delivery_zones" ON delivery_zones FOR SELECT USING (is_active = true);
    CREATE POLICY "Auth manage delivery_zones" ON delivery_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='table_sessions' AND policyname='Public read table_sessions') THEN
    CREATE POLICY "Public read table_sessions" ON table_sessions FOR SELECT USING (true);
    CREATE POLICY "Public create open table_sessions" ON table_sessions FOR INSERT WITH CHECK (status = 'OPEN');
    CREATE POLICY "Auth update table_sessions" ON table_sessions FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cart_items' AND policyname='Public read cart_items') THEN
    CREATE POLICY "Public read cart_items" ON cart_items FOR SELECT USING (true);
    CREATE POLICY "Public insert cart_items in open session" ON cart_items FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM table_sessions ts WHERE ts.id = table_session_id AND ts.status = 'OPEN'));
    CREATE POLICY "Public update cart_items in open session" ON cart_items FOR UPDATE
      USING (EXISTS (SELECT 1 FROM table_sessions ts WHERE ts.id = table_session_id AND ts.status = 'OPEN'));
    CREATE POLICY "Public delete cart_items in open session" ON cart_items FOR DELETE
      USING (EXISTS (SELECT 1 FROM table_sessions ts WHERE ts.id = table_session_id AND ts.status = 'OPEN'));
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION calculate_delivery_fee(UUID, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_order TO anon, authenticated;

-- 7. Realtime preservando todas las tablas del Admin + nuevas tablas del Menú
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE
  orders, waiter_calls, products, product_modifiers, promotions,
  supplies, reservations, prepared_items_buffer, kitchen_waste,
  tables, cash_shifts, staff_members, audit_logs,
  modifier_groups, modifier_options, table_sessions, cart_items;

NOTIFY pgrst, 'reload schema';
