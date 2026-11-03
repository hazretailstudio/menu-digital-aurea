export const REST_ID = 'b47a9880-9fd3-4c9b-b05b-86ea8f0d014d';
export const SUPABASE_URL = 'https://jmqqkgshwwycercknzgy.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptcXFrZ3Nod3d5Y2VyY2tuemd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNzYyODUsImV4cCI6MjEwODk1MjI4NX0.tCiRMvl05IXv_IGXIeJ2h9p6AEABRgPofgIRQZMt9UE';

export const WAITERS_LIST = ['Carlos M.', 'Sofía R.', 'Miguel A.', 'Barra / Mostrador'];
export const STATUS_FLOW = ['pending', 'preparing', 'delivered', 'paid'];
export const STATUS_LABELS = {
  pending: 'Recibida',
  preparing: 'En Preparación',
  delivered: 'Servida en Mesa',
  paid: 'Cobrada'
};

export let client = null;
try {
  if (window.supabase) {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
} catch (e) {
  console.warn("Supabase init error:", e);
}
