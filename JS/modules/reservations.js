import { state, client } from '../state.js';
import { REST_ID } from '../config.js';

export function renderReservationsList() {
  const cont = document.getElementById('reservationsListContainer');
  const countBadge = document.getElementById('badgeReservationsCount');
  if (countBadge) countBadge.innerText = state.reservations.length;
  if (!cont) return;

  if (state.reservations.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-8 text-center">No hay reservas registradas.</p>';
    return;
  }
  cont.innerHTML = state.reservations.map(r => `
    <div class="p-3 rounded-2xl border bg-stone-50 flex items-center justify-between text-xs">
      <div>
        <div class="flex items-center gap-2">
          <span class="font-bold text-stone-900">${r.customer_name}</span>
          <span class="bg-amber-100 text-amber-900 font-mono px-2 py-0.2 rounded font-bold">${r.party_size} pers.</span>
          <span class="text-stone-400">Mesa ${r.table_number || 'S/A'}</span>
        </div>
        <p class="text-[11px] text-stone-500 mt-0.5">📞 ${r.customer_phone} | 🕒 ${r.reservation_time.substring(0,5)} | 📝 ${r.notes || 'Sin notas'}</p>
      </div>
      <button onclick="window.updateReservationStatus('${r.id}', 'seated')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl">Sentar en Mesa</button>
    </div>
  `).join('');
}

export async function createReservation() {
  const name = document.getElementById('resClientName')?.value?.trim();
  const phone = document.getElementById('resClientPhone')?.value?.trim();
  const size = parseInt(document.getElementById('resPartySize')?.value) || 2;
  const table = document.getElementById('resTableNum')?.value?.trim() || '01';
  const date = document.getElementById('resDate')?.value || new Date().toISOString().split('T')[0];
  const time = document.getElementById('resTime')?.value || '14:00';
  const notes = document.getElementById('resNotes')?.value?.trim() || '';
  if (!name || !phone) return;

  const newRes = { id: 'res-' + Date.now(), restaurant_id: REST_ID, customer_name: name, customer_phone: phone, party_size: size, table_number: table, reservation_date: date, reservation_time: time, notes: notes, status: 'confirmed' };
  state.reservations.unshift(newRes);
  renderReservationsList();
  if (client) await client.from('reservations').insert([newRes]);
}

export async function updateReservationStatus(id, newStatus) {
  const r = state.reservations.find(x => x.id === id);
  if (r) r.status = newStatus;
  renderReservationsList();
  if (client) await client.from('reservations').update({ status: newStatus }).eq('id', id);
}

export function renderCalls() {
  const grid = document.getElementById('waiterCallsGrid');
  const badge = document.getElementById('pendingCallsBadge');
  if (badge) badge.innerText = state.calls.length;
  if (!grid) return;

  if (state.calls.length === 0) {
    grid.innerHTML = '<div class="col-span-full bg-white rounded-2xl p-8 text-center text-stone-400 text-xs">No hay mesas solicitando atención.</div>';
    return;
  }
  grid.innerHTML = state.calls.map(c => `
    <div class="bg-white rounded-2xl p-4 border border-rose-200 shadow-sm flex items-center justify-between">
      <span class="font-black text-sm text-stone-900">Mesa ${c.table_number}</span>
      <button onclick="window.resolveCall('${c.id}')" class="bg-emerald-600 text-white font-bold text-xs px-3 py-1.5 rounded-xl">Atendida ✓</button>
    </div>
  `).join('');
}

export async function resolveCall(id) {
  state.calls = state.calls.filter(c => c.id !== id);
  renderCalls();
  if (client) await client.from('waiter_calls').update({ status: 'resolved' }).eq('id', id);
}

export async function testSimulateCall() {
  const mockTable = '0' + (Math.floor(Math.random() * 8) + 1);
  const newCall = { id: 'call-' + Date.now(), restaurant_id: REST_ID, table_number: mockTable, status: 'pending' };
  state.calls.unshift(newCall);
  renderCalls();
  if (client) await client.from('waiter_calls').insert([newCall]);
}