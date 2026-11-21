// =========================================================================
// IMPORTANTE: PEGA AQUÍ TUS CREDENCIALES REALES DE SUPABASE
// (Cópialas tal cual de tu archivo js/config.js actual antes de subirlo)
// =========================================================================
export const SUPABASE_URL = 'PEGA_AQUI_TU_SUPABASE_URL';
export const SUPABASE_KEY = 'PEGA_AQUI_TU_SUPABASE_ANON_KEY';

// Negocio por defecto si alguien abre la URL sin ?r=slug
export const DEFAULT_REST_ID = 'b47a9880-9fd3-4c9b-b05b-86ea8f0d014d';
export const DEFAULT_SLUG = 'cafe-aurea';

// Live binding ES Module: al actualizarlo con setActiveRestaurantId(),
// TODOS los módulos (tables, kanban, cashbox, inventory, etc.) reciben
// automáticamente el ID del restaurante activo sin reescribir ningún módulo.
export let REST_ID = DEFAULT_REST_ID;

export function setActiveRestaurantId(newId) {
  if (newId && typeof newId === 'string') {
    REST_ID = newId;
  }
}

export function getRequestedRestaurantSlug() {
  try {
    const params = new URLSearchParams(window.location.search);
    const slug = (params.get('r') || params.get('slug') || '').trim().toLowerCase();
    return slug || DEFAULT_SLUG;
  } catch {
    return DEFAULT_SLUG;
  }
}

// Constantes de compatibilidad para módulos v1/v2
export const WAITERS_LIST = ['Carlos M.', 'Sofía R.', 'Barra / Caja', 'Admin General'];
export const WAITERS = WAITERS_LIST;

export const DEFAULT_STATUS_CONFIG = [
  { key: 'pending', label: 'Recibido', color: 'amber', sound: 'bell', enabled: true },
  { key: 'preparing', label: 'En Cocina', color: 'orange', sound: 'pop', enabled: true },
  { key: 'delivered', label: 'En Mesa / Servido', color: 'blue', sound: 'chime', enabled: true },
  { key: 'paid', label: 'Cobrado', color: 'emerald', sound: 'cash', enabled: true }
];

export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeTableNumber(val) {
  const raw = String(val || '').trim();
  if (!raw) return '01';
  if (/^\d+$/.test(raw)) return raw.padStart(2, '0');
  return raw;
}

export function showToast(message, type = 'info') {
  let container = document.getElementById('globalToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'globalToastContainer';
    container.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 items-center pointer-events-none px-4 w-full max-w-sm';
    document.body.appendChild(container);
  }

  const palette = {
    success: 'bg-emerald-700 text-white border-emerald-500',
    error: 'bg-rose-700 text-white border-rose-500',
    warning: 'bg-amber-600 text-white border-amber-400',
    info: 'bg-stone-900 text-white border-stone-700'
  };

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto border px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold text-center transition-all duration-300 ${palette[type] || palette.info}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
