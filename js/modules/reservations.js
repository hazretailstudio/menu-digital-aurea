import { REST_ID, generateUUID, normalizeTableNumber, escapeHtml, showToast } from '../config.js';
import { state, client, dbWrite } from '../state.js';
import { playSoundByName } from '../audio.js';

export function renderReservationsList() {
  const cont = document.getElementById('reservationsListContainer');
  const countBadge = document.getElementById('badgeReservationsCount');
  const filterDate = document.getElementById('resFilterDate')?.value || '';

  const filtered = filterDate
    ? state.reservations.filter(r => r.reservation_date === filterDate)
    : state.reservations;

  if (countBadge) countBadge.innerText = state.reservations.filter(r => r.status === 'confirmed').length;
  if (!cont) return;

  if (filtered.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-8 text-center">No hay reservas registradas para esta vista.</p>';
    return;
  }
  cont.innerHTML = filtered.map(r => `
    <div class="p-3 rounded-2xl border bg-stone-50 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div>
        <div class="flex items-center gap-2">
          <span class="font-bold text-stone-900">${escapeHtml(r.customer_name)}</span>
          <span class="bg-amber-100 text-amber-900 font-mono px-2 py-0.5 rounded font-bold">${r.party_size} pers.</span>
          <span class="text-stone-500 font-bold">Mesa ${escapeHtml(r.table_number || 'S/A')}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'seated' ? 'bg-emerald-100 text-emerald-800' : (r.status === 'cancelled' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800')}">${escapeHtml(r.status)}</span>
        </div>
        <p class="text-[11px] text-stone-500 mt-0.5">📅 ${escapeHtml(r.reservation_date)} | 🕒 ${escapeHtml((r.reservation_time || '').substring(0, 5))} | 📞 ${escapeHtml(r.customer_phone)} | 📝 ${escapeHtml(r.notes || 'Sin notas')}</p>
      </div>
      <div class="flex gap-1.5">
        ${r.status === 'confirmed' ? `
          <button onclick="window.updateReservationStatus('${r.id}', 'seated')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl">Sentar en Mesa</button>
          <button onclick="window.updateReservationStatus('${r.id}', 'cancelled')" class="bg-white border border-rose-200 text-rose-700 font-bold px-2.5 py-1.5 rounded-xl">Cancelar</button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

export async function createReservation() {
  const name = document.getElementById('resClientName')?.value?.trim();
  const phone = document.getElementById('resClientPhone')?.value?.trim();
  const size = parseInt(document.getElementById('resPartySize')?.value) || 2;
  const table = normalizeTableNumber(document.getElementById('resTableNum')?.value?.trim() || '01');
  const date = document.getElementById('resDate')?.value || new Date().toISOString().split('T')[0];
  const time = document.getElementById('resTime')?.value || '14:00';
  const notes = document.getElementById('resNotes')?.value?.trim() || '';
  if (!name || !phone) {
    showToast('Nombre y teléfono del cliente son obligatorios.', 'warning');
    return;
  }

  const newRes = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    customer_name: name,
    customer_phone: phone,
    party_size: size,
    table_number: table,
    reservation_date: date,
    reservation_time: time,
    notes,
    status: 'confirmed'
  };
  const { error } = await dbWrite(client.from('reservations').insert([newRes]), 'crear reserva');
  if (error) return;

  state.reservations.unshift(newRes);
  ['resClientName', 'resClientPhone', 'resNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderReservationsList();
  showToast(`Reserva de ${name} registrada ✓`, 'success');
}

export async function updateReservationStatus(id, newStatus) {
  const r = state.reservations.find(x => x.id === id);
  if (!r) return;
  const { error } = await dbWrite(client.from('reservations').update({ status: newStatus }).eq('id', id), 'actualizar reserva');
  if (error) return;
  r.status = newStatus;
  if (newStatus === 'seated' && r.table_number) {
    const tbl = state.tables.find(t => normalizeTableNumber(t.table_number) === normalizeTableNumber(r.table_number));
    if (tbl?.id) {
      tbl.status = 'occupied';
      await client.from('tables').update({ status: 'occupied' }).eq('id', tbl.id);
    }
    if (window.renderTablesFloorPlan) window.renderTablesFloorPlan();
  }
  renderReservationsList();
  showToast(`Reserva actualizada a "${newStatus}" ✓`, 'success');
}

export function renderCalls() {
  const grid = document.getElementById('waiterCallsGrid');
  const badge = document.getElementById('pendingCallsBadge');
  if (badge) badge.innerText = state.calls.length;
  if (!grid) return;

  if (state.calls.length === 0) {
    grid.innerHTML = '<div class="col-span-full bg-white rounded-2xl p-8 text-center text-stone-400 text-xs">No hay mesas solicitando atención en este momento.</div>';
    return;
  }
  grid.innerHTML = state.calls.map(c => {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(c.called_at || Date.now()).getTime()) / 1000));
    const mins = Math.floor(secs / 60);
    const remS = secs % 60;
    return `
      <div class="bg-white rounded-2xl p-4 border-2 border-rose-300 shadow-sm flex items-center justify-between gap-2">
        <div>
          <span class="font-black text-base text-stone-900 block">🔔 Mesa ${escapeHtml(c.table_number)}</span>
          <span class="text-[11px] font-mono text-rose-600 font-bold">Esperando: ${mins}m ${remS < 10 ? '0' : ''}${remS}s</span>
        </div>
        <button onclick="window.resolveCall('${c.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs">
          Atendida ✓
        </button>
      </div>
    `;
  }).join('');
}

/**
 * CORREGIDO: Ahora guarda resolved_at, waiter_name y response_time_seconds reales para métricas
 */
export async function resolveCall(id) {
  const call = state.calls.find(c => c.id === id);
  const nowIso = new Date().toISOString();
  const calledMs = call?.called_at ? new Date(call.called_at).getTime() : Date.now();
  const respSecs = Math.max(1, Math.round((Date.now() - calledMs) / 1000));
  const waiterName = state.activeStaff?.name || 'Mesero en turno';

  const { error } = await dbWrite(
    client.from('waiter_calls').update({
      status: 'resolved',
      resolved_at: nowIso,
      waiter_name: waiterName,
      response_time_seconds: respSecs
    }).eq('id', id),
    'resolver llamada de mesero'
  );
  if (error) return;

  if (call) {
    call.status = 'resolved';
    call.resolved_at = nowIso;
    call.waiter_name = waiterName;
    call.response_time_seconds = respSecs;
  }
  state.calls = state.calls.filter(c => c.id !== id);
  renderCalls();
  if (window.renderTablesFloorPlan) window.renderTablesFloorPlan();
  showToast(`Llamada atendida por ${waiterName} en ${respSecs}s ✓`, 'success');
}

export async function testSimulateCall() {
  const mockTable = normalizeTableNumber(String(Math.floor(Math.random() * 8) + 1));
  const newCall = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    table_number: mockTable,
    status: 'pending',
    called_at: new Date().toISOString()
  };
  const { error } = await dbWrite(client.from('waiter_calls').insert([newCall]), 'simular llamada');
  if (error) return;
  state.calls.unshift(newCall);
  state.allCalls.unshift(newCall);
  playSoundByName('bell');
  renderCalls();
  if (window.renderTablesFloorPlan) window.renderTablesFloorPlan();
}
