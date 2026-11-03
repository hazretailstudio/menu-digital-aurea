import { client, REST_ID } from '../config.js';

let adminCalls = [];

export function setCalls(calls) {
  adminCalls = calls;
  renderCalls();
}

export function renderCalls() {
  const grid = document.getElementById('waiterCallsGrid');
  const badge = document.getElementById('pendingCallsBadge');
  if (badge) badge.innerText = adminCalls.length;
  if (!grid) return;

  if (adminCalls.length === 0) {
    grid.innerHTML = '<div class="col-span-full bg-white rounded-2xl p-8 text-center text-stone-400 text-xs">No hay mesas solicitando atención.</div>';
    return;
  }

  grid.innerHTML = adminCalls.map(c => `
    <div class="bg-white rounded-2xl p-4 border border-rose-200 shadow-sm flex items-center justify-between">
      <span class="font-black text-sm text-stone-900">Mesa ${c.table_number}</span>
      <button onclick="window.app.resolveCall('${c.id}')" class="bg-emerald-600 text-white font-bold text-xs px-3 py-1.5 rounded-xl">Atendida ✓</button>
    </div>
  `).join('');
}

export async function resolveCall(id) {
  adminCalls = adminCalls.filter(c => c.id !== id);
  renderCalls();
  if (client) await client.from('waiter_calls').update({ status: 'resolved' }).eq('id', id);
}

export async function testSimulateCall() {
  const mockTable = '0' + (Math.floor(Math.random() * 8) + 1);
  const newCall = { id: 'call-' + Date.now(), restaurant_id: REST_ID, table_number: mockTable, status: 'pending' };
  adminCalls.unshift(newCall);
  renderCalls();
  if (client) await client.from('waiter_calls').insert([newCall]);
}
