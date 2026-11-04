import { SUPABASE_URL, SUPABASE_ANON, KDS_STATUS_STORAGE_KEY, DEFAULT_STATUS_CONFIG, REST_ID } from './config.js';

export let client = null;
try {
  if (window.supabase) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch (e) {
  console.warn("Supabase init error:", e);
}

export const state = {
  customStatusConfig: JSON.parse(localStorage.getItem(KDS_STATUS_STORAGE_KEY) || 'null') || DEFAULT_STATUS_CONFIG,
  orders: [],
  products: [],
  categories: [],
  types: [],
  supplies: [],
  recipes: [],
  waste: [],
  buffer: [],
  reservations: [],
  calls: [],
  currentChannelFilter: 'all',
  kanbanViewMode: 'all',
  currentAnalyticsFilter: 'today',
  customDateFrom: null,
  customDateTo: null
};

export function saveStatusConfig(newConfig) {
  state.customStatusConfig = newConfig;
  localStorage.setItem(KDS_STATUS_STORAGE_KEY, JSON.stringify(newConfig));
}

export async function fetchAllData() {
  if (!client) return;
  try {
    const [ordersRes, prodsRes, catsRes, typesRes, supsRes, rcpsRes, resRes, callsRes, wasteRes, bufferRes, restRes] = await Promise.all([
      client.from('orders').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false }),
      client.from('products').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false }),
      client.from('categories').select('*').eq('restaurant_id', REST_ID).order('order_index', { ascending: true }),
      client.from('product_types').select('*').eq('restaurant_id', REST_ID).order('order_index', { ascending: true }),
      client.from('supplies').select('*').eq('restaurant_id', REST_ID).order('name', { ascending: true }),
      client.from('product_recipes').select('*').eq('restaurant_id', REST_ID),
      client.from('reservations').select('*').eq('restaurant_id', REST_ID).order('reservation_time', { ascending: true }),
      client.from('waiter_calls').select('*').eq('restaurant_id', REST_ID).eq('status', 'pending').order('called_at', { ascending: false }),
      client.from('kitchen_waste').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false }),
      client.from('prepared_items_buffer').select('*').eq('restaurant_id', REST_ID).eq('status', 'available').order('created_at', { ascending: false }),
      client.from('restaurants').select('google_maps_embed').eq('id', REST_ID).maybeSingle()
    ]);

    if (ordersRes?.data) state.orders = ordersRes.data;
    if (prodsRes?.data) state.products = prodsRes.data;
    if (catsRes?.data) state.categories = catsRes.data;
    if (typesRes?.data) state.types = typesRes.data;
    if (supsRes?.data) state.supplies = supsRes.data;
    if (rcpsRes?.data) state.recipes = rcpsRes.data;
    if (resRes?.data) state.reservations = resRes.data;
    if (callsRes?.data) state.calls = callsRes.data;
    if (wasteRes?.data) state.waste = wasteRes.data;
    if (bufferRes?.data) state.buffer = bufferRes.data;

    if (restRes?.data?.google_maps_embed) {
      const gInput = document.getElementById('gmapsEmbedInput');
      const gPrev = document.getElementById('gmapsPreviewContainer');
      if (gInput) gInput.value = restRes.data.google_maps_embed;
      if (gPrev) gPrev.innerHTML = restRes.data.google_maps_embed;
    }
  } catch (err) {
    console.warn("Error fetching data:", err);
  }
}