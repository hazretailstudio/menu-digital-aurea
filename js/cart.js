import {
  DEFAULT_REST_ID,
  getRequestedRestaurantSlug,
  setActiveRestaurantId,
  normalizeTableNumber
} from './config.js';
import { client } from './state.js';

const CONTEXT_KEY = 'aurea_order_context_v3';

let activeSession = null;
let groupCartItems = [];
let realtimeChannel = null;

export function resolveOrderContext() {
  const params = new URLSearchParams(window.location.search);
  const saved = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || '{}');

  const slug = getRequestedRestaurantSlug();
  const tableId = params.get('table_id') || saved.table_id || null;
  const zone = params.get('zone') || saved.zone || null;
  const rawTable = params.get('table') || params.get('mesa') || saved.table_number || null;
  const tableNumber = rawTable ? normalizeTableNumber(rawTable) : null;
  const explicitType = (params.get('type') || '').toUpperCase();

  let orderType = saved.order_type || 'DINE_IN';
  if (['DINE_IN', 'PICKUP', 'DELIVERY'].includes(explicitType)) {
    orderType = explicitType;
  } else if (tableId || tableNumber) {
    orderType = 'DINE_IN';
  }

  const context = {
    restaurant_id: params.get('restaurant_id') || saved.restaurant_id || DEFAULT_REST_ID,
    slug,
    table_id: tableId,
    zone,
    table_number: tableNumber || '01',
    table_label: zone && tableNumber ? `${zone} - Mesa ${tableNumber}` : (tableNumber ? `Mesa ${tableNumber}` : 'Mesa 01'),
    order_type: orderType,
    guest_name: localStorage.getItem('aurea_guest_name') || ''
  };

  sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
  return context;
}

export function updateOrderContext(partial) {
  const current = resolveOrderContext();
  const next = { ...current, ...partial };
  sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(next));
  return next;
}

export function setGuestName(name) {
  const clean = String(name || '').trim();
  localStorage.setItem('aurea_guest_name', clean);
  return clean;
}

export async function resolveRestaurantBySlug(context) {
  const { data } = await client
    .from('restaurants')
    .select('*')
    .eq('slug', context.slug)
    .maybeSingle();

  const rest = data || (await client.from('restaurants').select('*').eq('id', context.restaurant_id).maybeSingle()).data;
  if (rest?.id) {
    setActiveRestaurantId(rest.id);
    context.restaurant_id = rest.id;
    updateOrderContext({ restaurant_id: rest.id });
  }
  return rest;
}

export function applyReadOnlyMode(restaurant) {
  const enabled = restaurant?.is_ordering_enabled !== false;
  document.querySelectorAll('[data-ordering-control], #navOrderBtn, #btnSendOrder').forEach(el => {
    el.classList.toggle('hidden', !enabled);
  });
  return enabled;
}

export async function initTableSession(context, { onRequireGuestName, onCartChange }) {
  if (context.order_type !== 'DINE_IN') return null;

  if (!context.table_id && context.table_number) {
    const { data: tbl } = await client
      .from('tables')
      .select('id, zone, table_number')
      .eq('restaurant_id', context.restaurant_id)
      .eq('table_number', context.table_number)
      .maybeSingle();
    if (tbl?.id) {
      context.table_id = tbl.id;
      updateOrderContext({ table_id: tbl.id });
    }
  }

  if (!context.table_id) return null;

  const { data: existing, error } = await client
    .from('table_sessions')
    .select('*')
    .eq('restaurant_id', context.restaurant_id)
    .eq('table_id', context.table_id)
    .eq('status', 'OPEN')
    .maybeSingle();

  if (error) {
    console.warn('table_sessions no disponible aún:', error.message);
    return null;
  }

  if (existing) {
    activeSession = existing;
    if (!context.guest_name && typeof onRequireGuestName === 'function') {
      const name = await onRequireGuestName(true);
      context.guest_name = setGuestName(name || 'Invitado');
    }
  } else {
    if (!context.guest_name && typeof onRequireGuestName === 'function') {
      const name = await onRequireGuestName(false);
      context.guest_name = setGuestName(name || 'Anfitrión');
    }
    const { data: created, error: createErr } = await client
      .from('table_sessions')
      .insert([{
        restaurant_id: context.restaurant_id,
        table_id: context.table_id,
        table_label: context.table_label,
        status: 'OPEN'
      }])
      .select()
      .single();

    if (createErr) throw createErr;
    activeSession = created;
  }

  await fetchSessionCart(onCartChange);
  subscribeToTableCart(activeSession.id, onCartChange);
  return activeSession;
}

export async function fetchSessionCart(onCartChange) {
  if (!activeSession) return [];
  const { data, error } = await client
    .from('cart_items')
    .select('*, products(title, price, media, station)')
    .eq('table_session_id', activeSession.id)
    .order('created_at', { ascending: true });

  if (!error && data) {
    groupCartItems = data;
    if (typeof onCartChange === 'function') onCartChange(getGroupCartSummary());
  }
  return groupCartItems;
}

function subscribeToTableCart(sessionId, onCartChange) {
  if (realtimeChannel) client.removeChannel(realtimeChannel);

  realtimeChannel = client
    .channel(`table-cart-${sessionId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cart_items', filter: `table_session_id=eq.${sessionId}` },
      async () => {
        await fetchSessionCart(onCartChange);
      }
    )
    .subscribe();
}

export function getActiveTableSession() {
  return activeSession;
}

export function resetGroupCartLocal() {
  groupCartItems = [];
  return getGroupCartSummary();
}

export async function addItemToGroupCart({ restaurantId, guestName, productId, qty = 1, selectedModifiers = [], unitPrice, notes = '' }) {
  if (!activeSession) throw new Error('No hay sesión de mesa activa');
  const { error } = await client.from('cart_items').insert([{
    table_session_id: activeSession.id,
    restaurant_id: restaurantId,
    guest_name: guestName || 'Invitado',
    product_id: productId,
    qty,
    selected_modifiers: selectedModifiers,
    unit_price: unitPrice,
    notes
  }]);
  if (error) throw error;
}

export async function updateGroupCartItemQty(cartItemId, newQty) {
  if (newQty <= 0) return removeGroupCartItem(cartItemId);
  const { error } = await client.from('cart_items').update({ qty: newQty, updated_at: new Date().toISOString() }).eq('id', cartItemId);
  if (error) throw error;
}

export async function removeGroupCartItem(cartItemId) {
  const { error } = await client.from('cart_items').delete().eq('id', cartItemId);
  if (error) throw error;
}

export async function clearActiveGroupCart() {
  groupCartItems = [];
  if (!activeSession) return;
  await client.from('cart_items').delete().eq('table_session_id', activeSession.id);
}

export function getGroupCartSummary() {
  const byGuest = {};
  let grandTotal = 0;

  for (const item of groupCartItems) {
    const guest = item.guest_name || 'General';
    const lineTotal = Number(item.unit_price) * Number(item.qty);
    grandTotal += lineTotal;
    if (!byGuest[guest]) byGuest[guest] = { items: [], subtotal: 0 };
    byGuest[guest].items.push({ ...item, line_total: lineTotal });
    byGuest[guest].subtotal += lineTotal;
  }
  return { session: activeSession, items: groupCartItems, byGuest, grandTotal };
}

export async function calculateDeliveryFeeRPC(restaurantId, lat, lng, subtotal) {
  const { data, error } = await client.rpc('calculate_delivery_fee', {
    p_restaurant_id: restaurantId,
    p_lat: Number(lat),
    p_lng: Number(lng),
    p_subtotal: Number(subtotal)
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function submitOrderViaRPC({
  context,
  itemsToOrder,
  customerName,
  customerPhone = null,
  deliveryAddress = null,
  deliveryLat = null,
  deliveryLng = null,
  paymentMethod = 'CASH',
  cashTendered = null,
  requiresCardTerminal = false,
  customerNotes = '',
  onesignalPlayerId = null,
  closeSession = false
}) {
  const payloadItems = itemsToOrder.map(item => ({
    product_id: item.product_id || item.id,
    qty: Number(item.qty || 1),
    guest_name: item.guest_name || customerName || context.guest_name || 'General',
    notes: item.notes || item.note || '',
    selected_modifiers: item.selected_modifiers || item.modifiers || []
  }));

  const { data, error } = await client.rpc('create_order', {
    p_restaurant_id: context.restaurant_id,
    p_order_type: context.order_type,
    p_items: payloadItems,
    p_table_session_id: context.order_type === 'DINE_IN' ? (activeSession?.id || null) : null,
    p_table_number: context.order_type === 'DINE_IN' ? context.table_number : context.order_type,
    p_customer_name: customerName || context.guest_name || 'Cliente',
    p_customer_phone: customerPhone,
    p_delivery_address: deliveryAddress,
    p_delivery_lat: deliveryLat ? Number(deliveryLat) : null,
    p_delivery_lng: deliveryLng ? Number(deliveryLng) : null,
    p_payment_method: paymentMethod,
    p_cash_tendered: cashTendered ? Number(cashTendered) : null,
    p_requires_card_terminal: Boolean(requiresCardTerminal),
    p_customer_notes: customerNotes,
    p_onesignal_player_id: onesignalPlayerId,
    p_close_session: closeSession
  });

  if (error) throw new Error(error.message);
  groupCartItems = [];
  return data;
}
