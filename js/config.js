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

export const WAITERS_LIST = ['Carlos M.', 'Sofía R.', 'Miguel A.', 'Barra / Mostrador'];
export const WAITERS = WAITERS_LIST;
export const KDS_STATUS_STORAGE_KEY = 'kds_status_config_v2';

export const STATIONS = [
  { id: 'cocina', name: 'Cocina', icon: '🍳', badgeClass: 'bg-orange-100 text-orange-900 border-orange-200' },
  { id: 'barra', name: 'Barra / Bebidas', icon: '☕', badgeClass: 'bg-blue-100 text-blue-900 border-blue-200' },
  { id: 'panaderia', name: 'Panadería / Postres', icon: '🥐', badgeClass: 'bg-amber-100 text-amber-900 border-amber-200' }
];

export const DEFAULT_STAFF = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Admin General', role: 'admin', pin: '1234', is_active: true },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Gerente Turno', role: 'management', pin: '2222', is_active: true },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Chef Cocina', role: 'kitchen', pin: '3333', is_active: true },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Carlos M.', role: 'waiter', pin: '4444', is_active: true },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Sofía R.', role: 'waiter', pin: '5555', is_active: true },
  { id: '00000000-0000-4000-8000-000000000006', name: 'Barra / Caja', role: 'cashier', pin: '6666', is_active: true }
];

export const DEFAULT_STATUS_CONFIG = [
  { id: 'pending', key: 'pending', name: '1. Recibida en Cocina', label: 'Recibido', color: '#f59e0b', sound_in: 'bell', sound_out: 'arcade', sound: 'bell', enabled: true },
  { id: 'preparing', key: 'preparing', name: '2. En Preparación', label: 'En Cocina', color: '#ea580c', sound_in: 'arcade', sound_out: 'dingdong', sound: 'pop', enabled: true },
  { id: 'delivered', key: 'delivered', name: '3. Servida en Mesa', label: 'En Mesa / Servido', color: '#2563eb', sound_in: 'dingdong', sound_out: 'reward', sound: 'chime', enabled: true },
  { id: 'paid', key: 'paid', name: '4. Cobrada / Finalizada', label: 'Cobrado', color: '#16a34a', sound_in: 'reward', sound_out: 'fanfare', sound: 'cash', enabled: true }
];

export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizeTableNumber(raw) {
  if (raw === null || raw === undefined) return '01';
  const cleaned = String(raw).trim().replace(/^mesa\s*/i, '');
  if (!cleaned) return '01';
  if (/^\d+$/.test(cleaned)) {
    return cleaned.length === 1 ? '0' + cleaned : cleaned;
  }
  return cleaned;
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

export function formatMoney(val) {
  const num = Number(val || 0);
  return `$${num.toFixed(2)}`;
}

export function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none';
    document.body.appendChild(container);
  }
  const colors = {
    success: 'bg-emerald-700 text-white border-emerald-500',
    error: 'bg-rose-700 text-white border-rose-500',
    warning: 'bg-amber-600 text-white border-amber-400',
    info: 'bg-stone-900 text-white border-stone-700'
  };
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2 transition-all duration-300 ${colors[type] || colors.info}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, type === 'error' ? 5000 : 3200);
}
