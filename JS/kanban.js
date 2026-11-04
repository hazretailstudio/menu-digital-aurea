import { state, client, saveStatusConfig } from '../state.js';
import { playSoundByName, SOUND_ENGINES } from '../audio.js';

export function formatElapsed(secs) {
  const m = Math.floor(Math.max(0, secs) / 60);
  const s = Math.max(0, secs) % 60;
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

export function filterByChannel(channel) {
  state.currentChannelFilter = channel;
  ['all', 'dine_in', 'takeout', 'delivery'].forEach(ch => {
    const btn = document.getElementById(`btnChannel-${ch}`);
    if (!btn) return;
    btn.className = (ch === channel)
      ? 'px-3 py-1.5 rounded-xl bg-stone-900 text-white shadow-sm transition'
      : 'px-3 py-1.5 rounded-xl text-stone-600 hover:text-stone-900 transition';
  });
  renderKanbanBoard();
}

export function setKanbanDisplayMode(mode) {
  state.kanbanViewMode = mode;
  renderKanbanBoard();
}

export function renderKanbanBoard() {
  const container = document.getElementById('kanbanBoardContainer');
  if (!container) return;

  let filtered = state.orders.filter(o => !o.is_archived);
  if (state.currentChannelFilter === 'dine_in') filtered = filtered.filter(o => !o.order_channel || o.order_channel === 'dine_in');
  else if (state.currentChannelFilter === 'takeout') filtered = filtered.filter(o => o.order_channel === 'takeout');
  else if (state.currentChannelFilter === 'delivery') filtered = filtered.filter(o => ['rappi', 'didi', 'ubereats'].includes(o.order_channel));

  const activeCount = filtered.filter(o => o.status !== 'paid' && o.status !== 'cancelled').length;
  const kdsCountEl = document.getElementById('kdsActiveCount');
  const badgeOrdersEl = document.getElementById('badgeLiveOrders');
  if (kdsCountEl) kdsCountEl.innerText = `${activeCount} activas`;
  if (badgeOrdersEl) badgeOrdersEl.innerText = activeCount;

  container.innerHTML = state.customStatusConfig.map((col, idx) => {
    const ordersInStatus = filtered.filter(o => o.status === col.id);
    const count = ordersInStatus.length;

    let cardsHtml = '';
    if (count === 0) {
      cardsHtml = '<div class="h-36 border-2 border-dashed border-stone-300 rounded-2xl flex items-center justify-center text-stone-400 text-xs">Sin pedidos</div>';
    } else {
      cardsHtml = ordersInStatus.map(order => renderOrderCardHtml(order, idx)).join('');
    }

    return `
      <div id="column-${col.id}" class="kanban-col bg-stone-200/70 rounded-3xl p-3.5 space-y-3 border border-stone-300/80">
        <div class="flex justify-between items-center p-2 rounded-2xl bg-white shadow-xs border border-stone-200/60">
          <div class="flex items-center gap-2">
            <span class="w-3.5 h-3.5 rounded-full" style="background-color: ${col.color || '#f59e0b'}"></span>
            <div>
              <h3 class="font-black text-xs uppercase tracking-wider text-stone-800 leading-tight">${col.name}</h3>
              <span class="text-[10px] text-stone-400 font-semibold block">Etapa ${idx + 1}</span>
            </div>
          </div>
          <div class="bg-stone-900 text-white px-3 py-1.5 rounded-xl text-sm font-black font-mono shadow-xs">
            ${count}
          </div>
        </div>

        <div id="cards-${col.id}" class="space-y-3 min-h-[300px]">
          ${cardsHtml}
        </div>
      </div>
    `;
  }).join('');
}

function renderOrderCardHtml(order, currentIdx) {
  const items = Array.isArray(order.items) ? order.items : [];

  let channelBadge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-lg">🍽️ Mesa ${order.table_number}</span>`;
  if (order.order_channel === 'takeout') {
    channelBadge = '<span class="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-lg">🛍️ Para Llevar</span>';
  } else if (['rappi', 'didi', 'ubereats'].includes(order.order_channel)) {
    channelBadge = `<span class="bg-orange-100 text-orange-950 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase">🛵 ${order.order_channel}</span>`;
  }

  const createdMs = new Date(order.kitchen_cycle_started_at || order.created_at).getTime();
  const deliveredMs = order.delivered_at ? new Date(order.delivered_at).getTime() : null;
  const paidMs = order.paid_at ? new Date(order.paid_at).getTime() : null;

  let t1Secs = deliveredMs ? Math.max(0, Math.floor((deliveredMs - createdMs) / 1000)) : Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
  let t1Label = deliveredMs ? `✓ Servido en: ${formatElapsed(t1Secs)}` : `🔥 Cocina: ${formatElapsed(t1Secs)}`;
  let t1Class = deliveredMs ? 'bg-blue-50 text-blue-900 border-blue-200' : (t1Secs > 1200 ? 'bg-rose-100 text-rose-900 border-rose-300 pulse-danger' : 'bg-stone-100 text-stone-800 border-stone-200');

  let t2Label = '🍽️ Mesa: --:--', t2Class = 'bg-stone-50 text-stone-400 border-stone-200';
  if (deliveredMs) {
    let t2Secs = paidMs ? Math.max(0, Math.floor((paidMs - deliveredMs) / 1000)) : Math.max(0, Math.floor((Date.now() - deliveredMs) / 1000));
    t2Label = paidMs ? `✓ Pagó en: ${formatElapsed(t2Secs)}` : `🍽️ En Mesa: ${formatElapsed(t2Secs)}`;
    t2Class = paidMs ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-amber-50 text-amber-900 border-amber-200';
  }

  const totalEstancia = Math.max(0, Math.floor(((paidMs || Date.now()) - new Date(order.created_at).getTime()) / 1000));
  const hasNext = currentIdx < state.customStatusConfig.length - 1;
  const nextCol = hasNext ? state.customStatusConfig[currentIdx + 1] : null;

  return `
    <div class="bg-white rounded-2xl border-2 border-stone-200 p-3.5 shadow-sm space-y-2.5" id="card-${order.id}">
      <div class="flex justify-between items-start gap-2">
        <div>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${channelBadge}
            <span class="text-[10px] text-stone-400 font-mono">#${(order.id || '').substring(0,4)}</span>
          </div>
          <div class="flex items-center gap-1 mt-1">
            <span class="text-[11px] text-stone-400">Mesero:</span>
            <span class="text-xs font-bold text-stone-700">${order.waiter_name || 'Sin asignar'}</span>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <button onclick="window.openEditOrderModal('${order.id}')" class="p-1 hover:bg-stone-100 rounded-lg text-xs font-bold text-stone-600 transition" title="Editar Comanda">✏️</button>
          <button onclick="window.openOrderDetailModal('${order.id}')" class="p-1 hover:bg-stone-100 rounded-lg text-xs font-bold text-amber-700 transition" title="Ver Ticket / Imprimir">🖨️</button>
        </div>
      </div>

      <div class="bg-stone-50 border border-stone-200 rounded-xl p-2 space-y-1">
        <div class="grid grid-cols-2 gap-1 text-[10px] font-mono font-bold text-center">
          <div class="border rounded-lg p-1 ${t1Class}">${t1Label}</div>
          <div class="border rounded-lg p-1 ${t2Class}">${t2Label}</div>
        </div>
        <div class="text-[9px] text-stone-500 font-mono text-center">
          Estancia Total: <b class="text-stone-800">${formatElapsed(totalEstancia)}</b>
        </div>
      </div>

      <div class="border-t border-stone-100 pt-2 space-y-1 text-xs">
        ${items.map(it => `
          <div class="flex justify-between items-start ${it.is_new ? 'bg-amber-100 border border-amber-300 rounded p-1 font-bold' : ''}">
            <span>${it.qty}x ${it.title} ${it.is_new ? '<span class="text-[9px] bg-amber-600 text-white px-1 rounded ml-1">NUEVO</span>' : ''}</span>
            <span class="font-mono text-stone-500">$${(Number(it.price) * it.qty).toFixed(2)}</span>
          </div>
        `).join('')}
        ${order.customer_notes ? `
          <div class="p-1.5 rounded-lg text-[10px] font-semibold mt-1 ${order.notes_updated ? 'bg-amber-200 text-amber-950 font-bold border border-amber-400' : 'bg-amber-50 text-amber-900'}">
            ${order.notes_updated ? '⚠️ NOTA MODIFICADA: ' : 'Nota: '} ${order.customer_notes}
          </div>
        ` : ''}
      </div>

      <div class="border-t border-stone-100 pt-2 flex justify-between items-center text-xs">
        <span class="text-stone-400 text-[10px]">Total:</span>
        <div class="flex items-center gap-2">
          ${order.split_type && order.split_type !== 'single' ? '<span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">👥 Dividida</span>' : ''}
          <span class="font-black font-mono text-sm text-stone-900">$${Number(order.total).toFixed(2)}</span>
        </div>
      </div>

      <div class="border-t border-stone-100 pt-2 flex items-center justify-between gap-1.5">
        ${currentIdx > 0 ? `
          <button onclick="window.requestRetrocesoOrder('${order.id}')" class="px-2.5 py-1.5 rounded-xl text-stone-600 bg-stone-100 hover:bg-stone-200 text-xs font-bold transition active:scale-95" title="Regresar de Estatus">←</button>
        ` : '<div></div>'}

        ${order.status === 'paid' ? `
          <button onclick="window.archiveOrder('${order.id}')" class="flex-grow px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm">📦 Enviar al Histórico</button>
        ` : (hasNext ? `
          <button onclick="window.advanceOrderStatus('${order.id}')" class="flex-grow px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition shadow-sm active:scale-95">Mover a ${nextCol.name} →</button>
        ` : `
          <button onclick="window.archiveOrder('${order.id}')" class="flex-grow px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm">Finalizar Pedido ✓</button>
        `)}
      </div>
    </div>
  `;
}

export async function advanceOrderStatus(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const currentIdx = state.customStatusConfig.findIndex(c => c.id === order.status);
  const nextCol = state.customStatusConfig[currentIdx + 1];
  if (!nextCol) return;

  const nowIso = new Date().toISOString();
  const prevCol = state.customStatusConfig[currentIdx];

  if (prevCol?.sound_out) playSoundByName(prevCol.sound_out);
  if (nextCol?.sound_in) playSoundByName(nextCol.sound_in);

  order.status = nextCol.id;

  if (nextCol.id === 'preparing' || nextCol.id.includes('prep')) {
    order.preparing_at = nowIso;
    deductSuppliesForOrder(order);
  } else if (nextCol.id === 'delivered' || nextCol.id.includes('serv')) {
    order.delivered_at = nowIso;
    order.has_new_additions = false;
    order.notes_updated = false;
    (order.items || []).forEach(it => it.is_new = false);
  } else if (nextCol.id === 'paid' || nextCol.id.includes('cob')) {
    order.paid_at = nowIso;
  }

  renderKanbanBoard();
  if (client) {
    await client.from('orders').update({
      status: nextCol.id,
      preparing_at: order.preparing_at,
      delivered_at: order.delivered_at,
      paid_at: order.paid_at,
      has_new_additions: order.has_new_additions,
      notes_updated: order.notes_updated,
      items: order.items
    }).eq('id', orderId);
  }
}

export async function archiveOrder(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.is_archived = true;
  renderKanbanBoard();
  if (client) {
    await client.from('orders').update({ is_archived: true }).eq('id', orderId);
  }
}

function deductSuppliesForOrder(order) {
  (order.items || []).forEach(item => {
    const bufferIdx = state.buffer.findIndex(b => b.product_title === item.title && b.status === 'available');
    if (bufferIdx > -1) {
      state.buffer[bufferIdx].status = 'resold';
      if (client) client.from('prepared_items_buffer').update({ status: 'resold' }).eq('id', state.buffer[bufferIdx].id);
      return;
    }

    const recipes = state.recipes.filter(r => r.product_id === item.id || r.product_title === item.title);
    recipes.forEach(rcp => {
      const sup = state.supplies.find(s => s.id === rcp.supply_id);
      if (sup) {
        const used = Number(rcp.quantity_per_portion) * Number(item.qty);
        sup.current_stock = Math.max(0, sup.current_stock - used);
        if (client) client.from('supplies').update({ current_stock: sup.current_stock }).eq('id', sup.id);
      }
    });
  });
}

// INYECCIÓN DINÁMICA MODAL CONFIGURACIÓN DE ESTATUS
export function ensureStatusConfigModal() {
  if (document.getElementById('statusConfigModal')) return;
  const modal = document.createElement('div');
  modal.id = 'statusConfigModal';
  modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white w-full max-w-2xl rounded-3xl max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl p-6 space-y-5">
      <div class="flex justify-between items-center border-b pb-3">
        <div>
          <h3 class="font-bold text-base text-stone-900 flex items-center gap-2">
            <span>⚙️ Configuración de Flujo, Estatus y Sonidos</span>
          </h3>
          <p class="text-xs text-stone-500">Personaliza el nombre de tus columnas y asigna tonos independientes.</p>
        </div>
        <button onclick="window.closeStatusConfigModal()" class="text-stone-400 hover:text-stone-700 font-bold text-lg p-1">✕</button>
      </div>
      <div id="statusConfigList" class="space-y-3"></div>
      <div class="pt-3 border-t flex justify-end">
        <button onclick="window.saveStatusConfiguration()" class="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition shadow-md">
          Guardar Cambios ✓
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export function openStatusConfigModal() {
  ensureStatusConfigModal();
  const cont = document.getElementById('statusConfigList');
  const soundOptions = Object.keys(SOUND_ENGINES).map(s => `<option value="${s}">${s.toUpperCase()}</option>`).join('') + `<option value="none">SIN SONIDO</option>`;

  cont.innerHTML = state.customStatusConfig.map((st, idx) => `
    <div class="border rounded-2xl p-3 bg-stone-50 text-xs flex justify-between items-center gap-2">
      <input type="text" id="st_name_${idx}" value="${st.name}" class="border rounded px-2 py-1 font-bold flex-grow bg-white">
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-stone-500 font-bold">In:</span>
        <select id="st_in_${idx}" class="border rounded p-1 text-[11px] bg-white">
          ${soundOptions.replace(`value="${st.sound_in}"`, `value="${st.sound_in}" selected`)}
        </select>
        <button onclick="window.playSoundByName(document.getElementById('st_in_${idx}').value)" class="text-stone-500 font-bold px-1">▶</button>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-stone-500 font-bold">Out:</span>
        <select id="st_out_${idx}" class="border rounded p-1 text-[11px] bg-white">
          ${soundOptions.replace(`value="${st.sound_out}"`, `value="${st.sound_out}" selected`)}
        </select>
        <button onclick="window.playSoundByName(document.getElementById('st_out_${idx}').value)" class="text-stone-500 font-bold px-1">▶</button>
      </div>
    </div>
  `).join('');

  document.getElementById('statusConfigModal').classList.remove('hidden');
}

export function closeStatusConfigModal() {
  const modal = document.getElementById('statusConfigModal');
  if (modal) modal.classList.add('hidden');
}

export function saveStatusConfiguration() {
  state.customStatusConfig.forEach((st, idx) => {
    const nameEl = document.getElementById(`st_name_${idx}`);
    const inEl = document.getElementById(`st_in_${idx}`);
    const outEl = document.getElementById(`st_out_${idx}`);
    if (nameEl) st.name = nameEl.value;
    if (inEl) st.sound_in = inEl.value;
    if (outEl) st.sound_out = outEl.value;
  });
  saveStatusConfig(state.customStatusConfig);
  closeStatusConfigModal();
  renderKanbanBoard();
  alert("Configuración de estatus guardada correctamente.");
}