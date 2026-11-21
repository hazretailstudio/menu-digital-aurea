export const SUPABASE_URL = 'https://jmqqkgshwwycercknzgy.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptcXFrZ3Nod3d5Y2VyY2tuemd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNzYyODUsImV4cCI6MjEwODk1MjI4NX0.tCiRMvl05IXv_IGXIeJ2h9p6AEABRgPofgIRQZMt9UE';
export const SUPABASE_KEY = SUPABASE_ANON;

export const DEFAULT_REST_ID = 'b47a9880-9fd3-4c9b-b05b-86ea8f0d014d';
export const DEFAULT_SLUG = 'cafe-aurea';
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

export const WAITERS_LIST = ['Carlos M.', 'Sofía R.', 'Barra / Caja', 'Admin General'];
export const WAITERS = WAITERS_LIST;
export const KDS_STATUS_STORAGE_KEY = 'kds_status_config';

export const DEFAULT_STATUS_CONFIG = [
  { id: 'pending', key: 'pending', name: '1. Recibida en Cocina', label: 'Recibido', color: '#f59e0b', sound_in: 'bell', sound_out: 'arcade', sound: 'bell', enabled: true },
  { id: 'preparing', key: 'preparing', name: '2. En Preparación', label: 'En Cocina', color: '#ea580c', sound_in: 'arcade', sound_out: 'dingdong', sound: 'pop', enabled: true },
  { id: 'delivered', key: 'delivered', name: '3. Servida en Mesa', label: 'En Mesa / Servido', color: '#2563eb', sound_in: 'dingdong', sound_out: 'reward', sound: 'chime', enabled: true },
  { id: 'paid', key: 'paid', name: '4. Cobrada / Finalizada', label: 'Cobrado', color: '#16a34a', sound_in: 'reward', sound_out: 'fanfare', sound: 'cash', enabled: true }
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
