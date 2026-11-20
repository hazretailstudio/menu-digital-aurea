import {
  SUPABASE_URL, SUPABASE_ANON, KDS_STATUS_STORAGE_KEY,
  DEFAULT_STATUS_CONFIG, DEFAULT_STAFF, REST_ID, generateUUID, showToast
} from './config.js';

export let client = null;
try {
  if (window.supabase) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch (e) {
  console.warn("Supabase init error:", e);
}

export const state = {
  customStatusConfig: JSON.parse(localStorage.getItem(KDS_STATUS_STORAGE_KEY) || 'null') || DEFAULT_STATUS_CONFIG,
  restaurant: null,
  orders: [],
  products: [],
  modifiers: [],
  promotions: [],
  categories: [],
  types: [],
  supplies: [],
  recipes: [],
  waste: [],
  buffer: [],
  reservations: [],
  calls: [],        // Llamadas pendientes (en vivo)
  allCalls: [],     // Todas las llamadas (incluye resueltas para métricas)
  tables: [],       // Mapa de mesas
  staff: [...DEFAULT_STAFF],
  activeStaff: DEFAULT_STAFF[0],
  cashShifts: [],
  auditLogs: [],
  currentChannelFilter: 'all',
  currentStationFilter: 'all',
  kanbanViewMode: 'all',
  kanbanSingleStatus: 'pending',
  currentAnalyticsFilter: 'today',
  customDateFrom: null,
  customDateTo: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
};

export function saveStatusConfig(newConfig) {
  state.customStatusConfig = newConfig;
  localStorage.setItem(KDS_STATUS_STORAGE_KEY, JSON.stringify(newConfig));
}

export function setConnectionBanner(isOk, msg = '') {
  state.isOnline = isOk;
  const conn = document.getElementById('connStatus');
  if (conn) {
    conn.innerText = isOk ? 'Sincronizado en tiempo real ✓' : (msg || '⚠️ Sin conexión');
    conn.className = isOk
      ? 'text-[10px] text-emerald-400 font-mono font-semibold'
      : 'text-[10px] text-rose-400 font-mono font-bold animate-pulse';
  }
  const banner = document.getElementById('offlineAlertBanner');
  if (banner) {
    if (isOk) {
      banner.classList.add('hidden');
    } else {
      banner.classList.remove('hidden');
      const txt = document.getElementById('offlineAlertText');
      if (txt) txt.innerText = msg || 'Conexión inestable o sin internet. Verifica tu Wi-Fi antes de continuar.';
    }
  }
}

/**
 * Ejecuta una operación en Supabase verificando errores explícitamente.
 * Nunca oculta fallos de red o SQL.
 */
export async function dbWrite(operationPromise, label = 'operación') {
  if (!client) {
    showToast(`Sin cliente Supabase para: ${label}`, 'error');
    return { data: null, error: new Error('No client') };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setConnectionBanner(false, 'Sin internet: no se pudo guardar en la nube.');
    showToast(`⚠️ Sin Wi-Fi: falló "${label}". Reintenta al reconectar.`, 'error');
    return { data: null, error: new Error('Offline') };
  }
  try {
    const res = await operationPromise;
    if (res && res.error) {
      console.error(`[Supabase Error - ${label}]:`, res.error);
      showToast(`Error al guardar (${label}): ${res.error.message || 'Verifica tu SQL en Supabase'}`, 'error');
      return res;
    }
    setConnectionBanner(true);
    return res;
  } catch (err) {
    console.error(`[Network Error - ${label}]:`, err);
    setConnectionBanner(false, 'Error de red al conectar con Supabase.');
    showToast(`⚠️ Error de red en "${label}". Verifica tu conexión.`, 'error');
    return { data: null, error: err };
  }
}

/**
 * Registra una acción sensible en la bitácora de auditoría
 */
export async function logAudit(action, details = {}) {
  const entry = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    staff_name: state.activeStaff?.name || 'Admin',
    staff_role: state.activeStaff?.role || 'admin',
    action,
    details,
    created_at: new Date().toISOString()
  };
  state.auditLogs.unshift(entry);
  if (client) {
    const { error } = await client.from('audit_logs').insert([entry]);
    if (error) console.warn('audit_logs no disponible aún:', error.message);
  }
}

export function getActiveShift() {
  return state.cashShifts.find(s => s.status === 'open') || null;
}

export function getWaiterNames() {
  const fromStaff = state.staff
    .filter(s => s.is_active !== false && ['waiter', 'cashier', 'admin', 'management'].includes(s.role))
    .map(s => s.name);
  return fromStaff.length > 0 ? fromStaff : ['Carlos M.', 'Sofía R.', 'Miguel A.', 'Barra / Mostrador'];
}

export async function fetchAllData() {
  if (!client) return;
  try {
    const results = await Promise.all([
      client.from('orders').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false }),
      client.from('products').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false }),
      client.from('product_modifiers').select('*').eq('restaurant_id', REST_ID).order('name', { ascending: true }),
      client.from('promotions').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false }),
      client.from('categories').select('*').eq('restaurant_id', REST_ID).order('order_index', { ascending: true }),
      client.from('product_types').select('*').eq('restaurant_id', REST_ID).order('order_index', { ascending: true }),
      client.from('supplies').select('*').eq('restaurant_id', REST_ID).order('name', { ascending: true }),
      client.from('product_recipes').select('*').eq('restaurant_id', REST_ID),
      client.from('reservations').select('*').eq('restaurant_id', REST_ID).order('reservation_time', { ascending: true }),
      client.from('waiter_calls').select('*').eq('restaurant_id', REST_ID).order('called_at', { ascending: false }),
      client.from('kitchen_waste').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false }),
      client.from('prepared_items_buffer').select('*').eq('restaurant_id', REST_ID).eq('status', 'available').order('created_at', { ascending: false }),
      client.from('restaurants').select('*').eq('id', REST_ID).maybeSingle(),
      client.from('tables').select('*').eq('restaurant_id', REST_ID).order('table_number', { ascending: true }),
      client.from('staff_members').select('*').eq('restaurant_id', REST_ID).order('name', { ascending: true }),
      client.from('cash_shifts').select('*').eq('restaurant_id', REST_ID).order('opened_at', { ascending: false }),
      client.from('audit_logs').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false }).limit(100)
    ]);

    const [
      ordersRes, prodsRes, modsRes, promosRes, catsRes, typesRes,
      supsRes, rcpsRes, resRes, callsRes, wasteRes, bufferRes,
      restRes, tablesRes, staffRes, shiftsRes, auditRes
    ] = results;

    if (ordersRes?.data) state.orders = ordersRes.data;
    if (prodsRes?.data) state.products = prodsRes.data;
    if (modsRes?.data) state.modifiers = modsRes.data;
    if (promosRes?.data) state.promotions = promosRes.data;
    if (catsRes?.data) state.categories = catsRes.data;
    if (typesRes?.data) state.types = typesRes.data;
    if (supsRes?.data) state.supplies = supsRes.data;
    if (rcpsRes?.data) state.recipes = rcpsRes.data;
    if (resRes?.data) state.reservations = resRes.data;
    if (callsRes?.data) {
      state.allCalls = callsRes.data;
      state.calls = callsRes.data.filter(c => c.status === 'pending');
    }
    if (wasteRes?.data) state.waste = wasteRes.data;
    if (bufferRes?.data) state.buffer = bufferRes.data;
    if (restRes?.data) {
      state.restaurant = restRes.data;
      if (restRes.data.google_maps_embed) {
        const gInput = document.getElementById('gmapsEmbedInput');
        const gPrev = document.getElementById('gmapsPreviewContainer');
        if (gInput) gInput.value = restRes.data.google_maps_embed;
        if (gPrev) gPrev.innerHTML = restRes.data.google_maps_embed;
      }
    }
    if (tablesRes?.data && tablesRes.data.length > 0) {
      state.tables = tablesRes.data;
    } else if (!tablesRes?.error) {
      state.tables = [];
    }
    if (staffRes?.data && staffRes.data.length > 0) {
      state.staff = staffRes.data;
      const savedPin = sessionStorage.getItem('aurea_active_staff_id');
      const found = savedPin ? state.staff.find(s => s.id === savedPin) : null;
      state.activeStaff = found || state.staff.find(s => s.role === 'admin') || state.staff[0];
    }
    if (shiftsRes?.data) state.cashShifts = shiftsRes.data;
    if (auditRes?.data) state.auditLogs = auditRes.data;

    // Verificar si faltan tablas de V2
    if (tablesRes?.error || shiftsRes?.error || staffRes?.error) {
      showToast('Recuerda ejecutar migration_v2.sql en Supabase para activar Mesas, Caja y PINs.', 'warning');
    }

    setConnectionBanner(true);
  } catch (err) {
    console.error("Error fetching data:", err);
    setConnectionBanner(false, 'Error al sincronizar con Supabase.');
  }
}
