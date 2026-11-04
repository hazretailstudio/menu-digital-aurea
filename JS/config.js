export const REST_ID = 'b47a9880-9fd3-4c9b-b05b-86ea8f0d014d';
export const SUPABASE_URL = 'https://jmqqkgshwwycercknzgy.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptcXFrZ3Nod3d5Y2VyY2tuemd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNzYyODUsImV4cCI6MjEwODk1MjI4NX0.tCiRMvl05IXv_IGXIeJ2h9p6AEABRgPofgIRQZMt9UE';

export const WAITERS_LIST = ['Carlos M.', 'Sofía R.', 'Miguel A.', 'Barra / Mostrador'];

export const KDS_STATUS_STORAGE_KEY = 'kds_status_config';

export const DEFAULT_STATUS_CONFIG = [
  { id: 'pending', name: '1. Recibida en Cocina', color: '#f59e0b', sound_in: 'bell', sound_out: 'arcade' },
  { id: 'preparing', name: '2. En Preparación', color: '#ea580c', sound_in: 'arcade', sound_out: 'dingdong' },
  { id: 'delivered', name: '3. Servida en Mesa', color: '#2563eb', sound_in: 'dingdong', sound_out: 'reward' },
  { id: 'paid', name: '4. Cobrada / Finalizada', color: '#16a34a', sound_in: 'reward', sound_out: 'fanfare' }
];