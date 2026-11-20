import { STATIONS, escapeHtml, showToast, normalizeTableNumber } from '../config.js';
import { state, client, saveStatusConfig, dbWrite } from '../state.js';
import { playSoundByName, SOUND_ENGINES } from '../audio.js';
import { openCheckoutModal } from './cashbox.js';

export function formatElapsed(secs) {
  const sSafe = Math.max(0, Math.floor(secs));
  const m = Math.floor(sSafe / 60);
  const s = sSafe % 60;
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

export function filterByStation(station) {
  state.currentStationFilter = station;
  ['all', 'cocina', 'barra', 'panaderia'].forEach(st => {
    const btn = document.getElementById(`btnStation-${st}`);
    if (!btn) return;
    btn.className = (st === station)
      ? 'px-3 py-1.5 rounded-xl bg-amber-600 text-white shadow-sm transition'
      : 'px-3 py-1.5 rounded-xl text-stone-600 hover:text-stone-900 transition';
  });
  renderKanbanBoard();
}

export function setKanbanDisplayMode(mode) {
  state.kanbanViewMode = mode;
  ['all', 'single'].forEach(m => {
    const btn = document.getElementById(`btnViewMode-${m}`);
    if (!btn) return;
    btn.className = (m === mode)
      ? 'px-3.5 py-1.5 rounded-xl transition bg-stone-900 text-white shadow-sm'
      : 'px-3.5 py-1.5 rounded-xl transition text-stone-600 hover:text-stone-900';
  });
  const singleBar = document.getElementById('singleStageSelectorBar');
  if (singleBar) singleBar.classList.toggle('hidden', mode !== 'single');
  renderKanbanBoard();
}

export function selectSingleStage(statusId) {
  state.kanbanSingleStatus = statusId;
  renderKanbanBoard();
}

function getFilteredOrders() {
  let filtered = state.orders.filter(o => !o.is_archived && o.status !== 'cancelled');
  if (state.currentChannelFilter === 'dine_in') filtered = filtered.filter(o => !o.order_channel || o.order_channel === 'dine_in');
  else if (state.currentChannelFilter === 'takeout') filtered = filtered.filter(o => o.order_channel === 'takeout');
  else if (state.currentChannelFilter === 'delivery') filtered = filtered.filter(o => ['rappi', 'didi', 'ubereats'].includes(o.order_channel));

  if (state.currentStationFilter && state.currentStationFilter !== 'all') {
    filtered = filtered.filter(o => (o.items || []).some(it => (it.station || 'cocina') === state.currentStationFilter));
  }
  return filtered;
}

export function renderKanbanBoard() {
  const container = document.getElementById('kanbanBoardContainer');
  if (!container) return;

  const filtered = getFilteredOrders();
  const activeCount = filtered.filter(o => o.status !== 'paid').length;
  const kdsCountEl = document.getElementById('kdsActiveCount');
  const badgeOrdersEl = document.getElementById('badgeLiveOrders');
  if (kdsCountEl) kdsCountEl.innerText = `${activeCount} activas`;
  if (badgeOrdersEl) badgeOrdersEl.innerText = activeCount;

  // Selector de etapa cuando está en modo Columna Única
  const singleBar = document.getElementById('singleStageSelectorBar');
  if (singleBar && state.kanbanViewMode === 'single') {
    singleBar.classList.remove('hidden');
    singleBar.innerHTML = state.customStatusConfig.map(col => {
      const cnt = filtered.filter(o => o.status === col.id).length;
      const active = state.kanbanSingleStatus === col.id;
      return `
        <button onclick="window.selectSingleStage('${col.id}')" class="px-3.5 py-2 rounded-2xl text-xs font-bold border transition flex items-center gap-2 ${active ? 'bg-stone-900 text-white border-stone-900 shadow-sm' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'}">
          <span class="w-2.5 h-2.5 rounded-full" style="background:${col.color || '#f59e0b'}"></span>
          <span>${escapeHtml(col.name)}</span>
          <span class="font-mono px-1.5 py-0.5 rounded-md text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'}">${cnt}</span>
        </button>
      `;
    }).join('');
  }

  const columnsToRender = state.kanbanViewMode === 'single'
    ? state.customStatusConfig.filter(c => c.id === state.kanbanSingleStatus)
    : state.customStatusConfig;

  container.className = state.kanbanViewMode === 'single'
    ? 'grid grid-cols-1 gap-4 items-start'
    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start';

  container.innerHTML = columnsToRender.map(col => {
    const realIdx = state.customStatusConfig.findIndex(c => c.id === col.id);
    const ordersInStatus = filtered.filter(o => o.status === col.id);
    const count = ordersInStatus.length;

    const cardsHtml = count === 0
      ? '<div class="h-36 border-2 border-dashed border-stone-300 rounded-2xl flex items-center justify-center text-stone-400 text-xs">Sin pedidos en esta etapa</div>'
      : `<div class="${state.kanbanViewMode === 'single' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}">${ordersInStatus.map(order => renderOrderCardHtml(order, realIdx)).join('')}</div>`;

    return `
      <div id="column-${col.id}" class="kanban-col bg-stone-200/70 rounded-3xl p-3.5 space-y-3 border border-stone-300/80">
        <div class="flex justify-between items-center p-2 rounded-2xl bg-white shadow-xs border border-stone-200/60">
          <div class="flex items-center gap-2">
            <span class="w-3.5 h-3.5 rounded-full" style="background-color: ${col.color || '#f59e0b'}"></span>
            <div>
              <h3 class="font-black text-xs uppercase tracking-wider text-stone-800 leading-tight">${escapeHtml(col.name)}</h3>
              <span class="text-[10px] text-stone-400 font-semibold block">Etapa ${realIdx + 1}</span>
            </div>
          </div>
          <div class="bg-stone-900 text-white px-3 py-1.5 rounded-xl text-sm font-black font-mono shadow-xs">
            ${count}
          </div>
        </div>
        <div id="cards-${col.id}" class="min-h-[260px]">
          ${cardsHtml}
        </div>
      </div>
    `;
  }).join('');

  updateKanbanTimers();
}

function renderOrderCardHtml(order, currentIdx) {
  const allItems = Array.isArray(order.items) ? order.items : [];
  const activeCourse = Number(order.active_course || 1);
  const hasWaitingCourse = allItems.some(it => Number(it.course || 1) > activeCourse && !it.done);

  let channelBadge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-lg">🍽️ Mesa ${escapeHtml(order.table_number)}</span>`;
  if (order.order_channel === 'takeout') {
    channelBadge = `<span class="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-lg">🛍️ ${escapeHtml(order.table_number)}</span>`;
  } else if (['rappi', 'didi', 'ubereats'].includes(order.order_channel)) {
    channelBadge = `<span class="bg-orange-100 text-orange-950 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase">🛵 ${escapeHtml(order.order_channel)} ${escapeHtml(order.table_number)}</span>`;
  }

  const hasNext = currentIdx < state.customStatusConfig.length - 1;
  const nextCol = hasNext ? state.customStatusConfig[currentIdx + 1] : null;
  const isNextPaid = nextCol && (nextCol.id === 'paid' || nextCol.id.includes('cob'));

  // Mostrar ítems filtrados por estación si el filtro está activo (pero conservando su índice original)
  const itemsIndexed = allItems.map((it, idx) => ({ it, idx }))
    .filter(({ it }) => state.currentStationFilter === 'all' || (it.station || 'cocina') === state.currentStationFilter);

  const doneCount = itemsIndexed.filter(({ it }) => it.done).length;

  return `
    <div class="bg-white rounded-2xl border-2 border-stone-200 p-3.5 shadow-sm space-y-2.5" id="card-${order.id}" data-order-card="${order.id}">
      <div class="flex justify-between items-start gap-2">
        <div>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${channelBadge}
            <span class="text-[10px] text-stone-400 font-mono">#${(order.id || '').substring(0, 4).toUpperCase()}</span>
          </div>
          <div class="flex items-center gap-1 mt-1">
            <span class="text-[11px] text-stone-400">Mesero:</span>
            <span class="text-xs font-bold text-stone-700">${escapeHtml(order.waiter_name || 'Sin asignar')}</span>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <button onclick="window.openEditOrderModal('${order.id}')" class="p-1.5 hover:bg-stone-100 rounded-lg text-xs font-bold text-stone-600 transition" title="Editar Comanda / Cambiar Mesa">✏️</button>
          <button onclick="window.openOrderDetailModal('${order.id}')" class="p-1.5 hover:bg-stone-100 rounded-lg text-xs font-bold text-amber-700 transition" title="Ticket / Comanda Cocina">🖨️</button>
        </div>
      </div>

      <!-- CRONÓMETROS ACTUALIZADOS SIN RE-RENDERIZAR DOM -->
      <div class="bg-stone-50 border border-stone-200 rounded-xl p-2 space-y-1">
        <div class="grid grid-cols-2 gap-1 text-[10px] font-mono font-bold text-center">
          <div data-t1="${order.id}" class="border rounded-lg p-1 bg-stone-100 text-stone-800 border-stone-200">--:--</div>
          <div data-t2="${order.id}" class="border rounded-lg p-1 bg-stone-50 text-stone-400 border-stone-200">--:--</div>
        </div>
        <div class="text-[9px] text-stone-500 font-mono text-center">
          Estancia Total: <b data-tot="${order.id}" class="text-stone-800">--:--</b> • Listos: <b>${doneCount}/${itemsIndexed.length}</b>
        </div>
      </div>

      <!-- LISTADO DE PLATILLOS CON TACHADO INDIVIDUAL, MODIFICADORES Y TIEMPOS -->
      <div class="border-t border-stone-100 pt-2 space-y-1.5 text-xs">
        ${itemsIndexed.map(({ it, idx }) => {
          const stObj = STATIONS.find(s => s.id === (it.station || 'cocina')) || STATIONS[0];
          const courseNum = Number(it.course || 1);
          const isHolding = courseNum > activeCourse && !it.done;
          const modsTxt = (it.modifiers || []).map(m => m.name).join(', ');
          return `
            <div onclick="window.toggleOrderItemDone('${order.id}', ${idx})" class="p-1.5 rounded-xl border cursor-pointer transition select-none ${it.done ? 'bg-emerald-50/70 border-emerald-200 opacity-65' : (it.is_new ? 'bg-amber-100 border-amber-300' : (isHolding ? 'bg-stone-50 border-dashed border-stone-300 opacity-80' : 'bg-white border-stone-100 hover:bg-stone-50'))}">
              <div class="flex justify-between items-start gap-1.5">
                <div class="flex items-start gap-1.5 min-w-0">
                  <span class="mt-0.5 text-xs">${it.done ? '✅' : (isHolding ? '⏸️' : '⬜')}</span>
                  <div class="min-w-0">
                    <span class="font-bold leading-snug ${it.done ? 'line-through text-stone-500' : 'text-stone-900'}">
                      ${it.qty}x ${escapeHtml(it.title)}
                    </span>
                    <div class="flex flex-wrap gap-1 mt-0.5">
                      <span class="text-[9px] font-bold px-1.5 py-0.2 rounded border ${stObj.badgeClass}">${stObj.icon} ${stObj.name.split(' ')[0]}</span>
                      ${courseNum > 1 ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded ${isHolding ? 'bg-stone-200 text-stone-700' : 'bg-orange-600 text-white'}">${isHolding ? `En espera (${courseNum}º T)` : `🔥 ${courseNum}º T`}</span>` : ''}
                      ${it.is_new ? '<span class="text-[9px] bg-amber-600 text-white px-1.5 rounded font-black">NUEVO</span>' : ''}
                    </div>
                    ${modsTxt ? `<p class="text-[10px] text-amber-900 font-semibold mt-0.5">+ ${escapeHtml(modsTxt)}</p>` : ''}
                    ${it.note ? `<p class="text-[10px] text-rose-700 font-bold mt-0.5">📝 ${escapeHtml(it.note)}</p>` : ''}
                  </div>
                </div>
                <span class="font-mono text-[11px] text-stone-500 flex-shrink-0">$${(Number(it.price) * Number(it.qty)).toFixed(2)}</span>
              </div>
            </div>
          `;
        }).join('')}

        ${hasWaitingCourse ? `
          <button onclick="window.fireNextCourse('${order.id}')" class="w-full py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-extrabold transition shadow-xs">
            🔥 Marchar ${activeCourse + 1}º Tiempo a Cocina
          </button>
        ` : ''}

        ${order.customer_notes ? `
          <div class="p-1.5 rounded-lg text-[10px] font-semibold mt-1 ${order.notes_updated ? 'bg-amber-200 text-amber-950 font-bold border border-amber-400' : 'bg-amber-50 text-amber-900'}">
            ${order.notes_updated ? '⚠️ NOTA MODIFICADA: ' : 'Nota mesa: '} ${escapeHtml(order.customer_notes)}
          </div>
        ` : ''}
      </div>

      <div class="border-t border-stone-100 pt-2 flex justify-between items-center text-xs">
        <span class="text-stone-400 text-[10px]">Total:</span>
        <div class="flex items-center gap-2">
          ${order.split_type && order.split_type !== 'single' ? '<span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">👥 Dividida</span>' : ''}
          ${order.payment_method ? `<span class="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded uppercase">${escapeHtml(order.payment_method)}</span>` : ''}
          <span class="font-black font-mono text-sm text-stone-900">$${Number(order.total).toFixed(2)}</span>
        </div>
      </div>

      <div class="border-t border-stone-100 pt-2 flex items-center justify-between gap-1.5">
        ${currentIdx > 0 ? `
          <button onclick="window.requestRetrocesoOrder('${order.id}')" class="px-2.5 py-1.5 rounded-xl text-stone-600 bg-stone-100 hover:bg-stone-200 text-xs font-bold transition active:scale-95" title="Regresar de Estatus">←</button>
        ` : '<div></div>'}

        ${order.status === 'paid' ? `
          <button onclick="window.archiveOrder('${order.id}')" class="flex-grow px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm">📦 Enviar al Histórico</button>
        ` : (isNextPaid ? `
          <button onclick="window.openCheckoutModal('${order.id}')" class="flex-grow px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm active:scale-95">💵 Cobrar Cuenta →</button>
        ` : (hasNext ? `
          <button onclick="window.advanceOrderStatus('${order.id}')" class="flex-grow px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition shadow-sm active:scale-95">Mover a ${escapeHtml(nextCol.name)} →</button>
        ` : `
          <button onclick="window.archiveOrder('${order.id}')" class="flex-grow px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm">Finalizar ✓</button>
        `))}
      </div>
    </div>
  `;
}

/**
 * Actualiza únicamente los textos de los relojes cada segundo SIN destruir el DOM
 * (Evita pérdida de clics y saltos de scroll)
 */
export function updateKanbanTimers() {
  const now = Date.now();
  state.orders.forEach(order => {
    if (order.is_archived || order.status === 'cancelled') return;
    const t1El = document.querySelector(`[data-t1="${order.id}"]`);
    if (!t1El) return;
    const t2El = document.querySelector(`[data-t2="${order.id}"]`);
    const totEl = document.querySelector(`[data-tot="${order.id}"]`);

    const createdMs = new Date(order.kitchen_cycle_started_at || order.created_at).getTime();
    const deliveredMs = order.delivered_at ? new Date(order.delivered_at).getTime() : null;
    const paidMs = order.paid_at ? new Date(order.paid_at).getTime() : null;

    const t1Secs = deliveredMs ? Math.max(0, Math.floor((deliveredMs - createdMs) / 1000)) : Math.max(0, Math.floor((now - createdMs) / 1000));
    t1El.innerText = deliveredMs ? `✓ Servido: ${formatElapsed(t1Secs)}` : `🔥 Cocina: ${formatElapsed(t1Secs)}`;
    t1El.className = `border rounded-lg p-1 ${deliveredMs ? 'bg-blue-50 text-blue-900 border-blue-200' : (t1Secs > 1200 ? 'bg-rose-100 text-rose-900 border-rose-300 pulse-danger' : 'bg-stone-100 text-stone-800 border-stone-200')}`;

    if (t2El) {
      if (deliveredMs) {
        const t2Secs = paidMs ? Math.max(0, Math.floor((paidMs - deliveredMs) / 1000)) : Math.max(0, Math.floor((now - deliveredMs) / 1000));
        t2El.innerText = paidMs ? `✓ Pagó: ${formatElapsed(t2Secs)}` : `🍽️ Mesa: ${formatElapsed(t2Secs)}`;
        t2El.className = `border rounded-lg p-1 ${paidMs ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-amber-50 text-amber-900 border-amber-200'}`;
      } else {
        t2El.innerText = '🍽️ Mesa: --:--';
        t2El.className = 'border rounded-lg p-1 bg-stone-50 text-stone-400 border-stone-200';
      }
    }

    if (totEl) {
      const totalEstancia = Math.max(0, Math.floor(((paidMs || now) - new Date(order.created_at).getTime()) / 1000));
      totEl.innerText = formatElapsed(totalEstancia);
    }
  });
}

export async function toggleOrderItemDone(orderId, itemIdx) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order || !order.items || !order.items[itemIdx]) return;
  order.items[itemIdx].done = !order.items[itemIdx].done;
  renderKanbanBoard();
  await dbWrite(client.from('orders').update({ items: order.items }).eq('id', order.id), 'marcar platillo listo');
}

export async function fireNextCourse(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.active_course = Number(order.active_course || 1) + 1;
  order.kitchen_cycle_started_at = new Date().toISOString();
  playSoundByName('bell');
  renderKanbanBoard();
  await dbWrite(
    client.from('orders').update({
      active_course: order.active_course,
      kitchen_cycle_started_at: order.kitchen_cycle_started_at
    }).eq('id', order.id),
    'marchar siguiente tiempo'
  );
  showToast(`🔥 Tiempo ${order.active_course} marchado para Mesa ${order.table_number}`, 'warning');
}

export async function advanceOrderStatus(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const currentIdx = state.customStatusConfig.findIndex(c => c.id === order.status);
  const nextCol = state.customStatusConfig[currentIdx + 1];
  if (!nextCol) return;

  // Si la siguiente etapa es Cobrada, abrir modal de cobro real
  if (nextCol.id === 'paid' || nextCol.id.includes('cob')) {
    openCheckoutModal(orderId);
    return;
  }

  const nowIso = new Date().toISOString();
  const prevCol = state.customStatusConfig[currentIdx];
  if (prevCol?.sound_out) playSoundByName(prevCol.sound_out);
  if (nextCol?.sound_in) playSoundByName(nextCol.sound_in);

  order.status = nextCol.id;

  if (nextCol.id === 'preparing' || nextCol.id.includes('prep')) {
    order.preparing_at = order.preparing_at || nowIso;
    await deductSuppliesForOrder(order);
  } else if (nextCol.id === 'delivered' || nextCol.id.includes('serv')) {
    order.delivered_at = nowIso;
    order.has_new_additions = false;
    order.notes_updated = false;
    (order.items || []).forEach(it => { it.is_new = false; it.done = true; });
  }

  renderKanbanBoard();
  await dbWrite(
    client.from('orders').update({
      status: nextCol.id,
      preparing_at: order.preparing_at,
      delivered_at: order.delivered_at,
      paid_at: order.paid_at,
      has_new_additions: order.has_new_additions,
      notes_updated: order.notes_updated,
      items: order.items
    }).eq('id', orderId),
    'avanzar estatus comanda'
  );
}

export async function archiveOrder(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.is_archived = true;
  renderKanbanBoard();
  await dbWrite(client.from('orders').update({ is_archived: true }).eq('id', orderId), 'archivar comanda');

  // Si era mesa en salón, marcar mesa por limpiar
  if (!order.order_channel || order.order_channel === 'dine_in') {
    const norm = normalizeTableNumber(order.table_number);
    const tbl = state.tables.find(t => normalizeTableNumber(t.table_number) === norm);
    if (tbl?.id) {
      tbl.status = 'cleaning';
      await client.from('tables').update({ status: 'cleaning' }).eq('id', tbl.id);
    }
  }
}

/**
 * Descuenta insumos ÚNICAMENTE para platillos que no tienen inventory_deducted = true
 * Evita descuentos duplicados cuando se añaden adiciones a una mesa existente.
 */
export async function deductSuppliesForOrder(order) {
  let autoSoldOutTriggered = [];
  for (const item of (order.items || [])) {
    if (item.inventory_deducted) continue;

    const bufferIdx = state.buffer.findIndex(b => b.product_title === item.title && b.status === 'available');
    if (bufferIdx > -1) {
      state.buffer[bufferIdx].status = 'resold';
      await client.from('prepared_items_buffer').update({ status: 'resold' }).eq('id', state.buffer[bufferIdx].id);
      item.inventory_deducted = true;
      continue;
    }

    const recipes = state.recipes.filter(r => r.product_id === item.id);
    for (const rcp of recipes) {
      const sup = state.supplies.find(s => s.id === rcp.supply_id);
      if (sup) {
        const used = Number(rcp.quantity_per_portion) * Number(item.qty);
        sup.current_stock = Math.max(0, Number(sup.current_stock) - used);
        await client.from('supplies').update({ current_stock: sup.current_stock }).eq('id', sup.id);
        if (sup.current_stock <= 0) autoSoldOutTriggered.push(sup.name);
      }
    }
    item.inventory_deducted = true;
  }

  if (autoSoldOutTriggered.length > 0) {
    showToast(`⚠️ Stock en 0 para: ${autoSoldOutTriggered.join(', ')}. Considera marcar "86" en Carta.`, 'warning');
  }
}

// MODAL CONFIGURACIÓN DE ESTATUS
export function ensureStatusConfigModal() {
  if (document.getElementById('statusConfigModal')) return;
  const modal = document.createElement('div');
  modal.id = 'statusConfigModal';
  modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white w-full max-w-2xl rounded-3xl max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl p-6 space-y-5">
      <div class="flex justify-between items-center border-b pb-3">
        <div>
          <h3 class="font-bold text-base text-stone-900">⚙️ Configuración de Flujo, Estatus y Sonidos</h3>
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
  const soundOptions = Object.keys(SOUND_ENGINES).map(s => `<option value="${s}">${s.toUpperCase()}</option>`).join('') + '<option value="none">SIN SONIDO</option>';

  cont.innerHTML = state.customStatusConfig.map((st, idx) => `
    <div class="border rounded-2xl p-3 bg-stone-50 text-xs flex flex-wrap justify-between items-center gap-2">
      <input type="text" id="st_name_${idx}" value="${escapeHtml(st.name)}" class="border rounded px-2 py-1 font-bold flex-grow bg-white">
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
  showToast('Configuración de estatus guardada ✓', 'success');
}
