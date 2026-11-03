import { client, WAITERS_LIST, STATUS_FLOW, STATUS_LABELS } from '../config.js';
import { playFlowSound } from '../audio.js';

let adminOrders = [];
let kanbanViewMode = 'all';
let selectedSingleStatus = 'pending';
let currentEditingOrder = null;
let modalOrderItems = [];

export function setOrders(orders) {
  adminOrders = orders;
  renderKanbanBoard();
}

export function getOrders() {
  return adminOrders;
}

export function setKanbanDisplayMode(mode) {
  kanbanViewMode = mode;
  const btnAll = document.getElementById('btnViewMode-all');
  const btnSingle = document.getElementById('btnViewMode-single');
  const singleWrapper = document.getElementById('singleStatusSelectorWrapper');

  if (mode === 'all') {
    if (btnAll) btnAll.className = 'px-3.5 py-1.5 rounded-xl transition bg-stone-900 text-white shadow-sm flex items-center gap-1.5';
    if (btnSingle) btnSingle.className = 'px-3.5 py-1.5 rounded-xl transition text-stone-600 hover:text-stone-900 flex items-center gap-1.5';
    if (singleWrapper) singleWrapper.classList.add('hidden');
  } else {
    if (btnSingle) btnSingle.className = 'px-3.5 py-1.5 rounded-xl transition bg-stone-900 text-white shadow-sm flex items-center gap-1.5';
    if (btnAll) btnAll.className = 'px-3.5 py-1.5 rounded-xl transition text-stone-600 hover:text-stone-900 flex items-center gap-1.5';
    if (singleWrapper) singleWrapper.classList.remove('hidden');
  }

  updateSingleStatusChipsUI();
  renderKanbanBoard();
}

export function changeSingleStatusView(status) {
  selectedSingleStatus = status;
  updateSingleStatusChipsUI();
  renderKanbanBoard();
}

function updateSingleStatusChipsUI() {
  STATUS_FLOW.forEach(st => {
    const chip = document.getElementById(`chipStatus-${st}`);
    if (!chip) return;
    if (st === selectedSingleStatus) {
      chip.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm bg-amber-600 text-white border border-amber-600';
    } else {
      chip.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition border border-stone-200 bg-white text-stone-700 hover:bg-stone-50';
    }
  });
}

export function renderKanbanBoard() {
  const container = document.getElementById('kanbanBoardContainer');
  if (!container) return;

  const activeLiveOrders = adminOrders.filter(o => !o.is_archived);
  const activeCount = activeLiveOrders.filter(o => o.status !== 'paid').length;

  const activeCountEl = document.getElementById('kdsActiveCount');
  if (activeCountEl) activeCountEl.innerText = `${activeCount} comanda(s) activas`;
  
  const badgeOrdersEl = document.getElementById('badgeLiveOrders');
  if (badgeOrdersEl) badgeOrdersEl.innerText = activeCount;

  STATUS_FLOW.forEach(st => {
    const count = activeLiveOrders.filter(o => o.status === st).length;
    const badgeEl = document.getElementById(`colCount-${st}`);
    if (badgeEl) badgeEl.innerText = count;
  });

  if (kanbanViewMode === 'single') {
    container.className = 'grid grid-cols-1 max-w-xl mx-auto gap-4 items-start';
    STATUS_FLOW.forEach(st => {
      const colEl = document.getElementById(`column-${st}`);
      if (colEl) colEl.style.display = (st === selectedSingleStatus ? 'block' : 'none');
    });
  } else {
    container.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start';
    STATUS_FLOW.forEach(st => {
      const colEl = document.getElementById(`column-${st}`);
      if (colEl) colEl.style.display = 'block';
    });
  }

  STATUS_FLOW.forEach(statusKey => {
    const colContainer = document.getElementById(`cards-${statusKey}`);
    if (!colContainer) return;

    const ordersInStatus = activeLiveOrders.filter(o => o.status === statusKey);

    if (ordersInStatus.length === 0) {
      colContainer.innerHTML = `
        <div class="h-44 border-2 border-dashed border-stone-300/80 rounded-2xl flex flex-col items-center justify-center text-stone-400 text-xs">
          <span>Sin comandas en este estatus</span>
        </div>
      `;
      return;
    }

    colContainer.innerHTML = ordersInStatus.map(order => {
      const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
      const { timerClass, badgeBg, badgeText } = getTimerSLA(elapsed, order.status);
      const items = Array.isArray(order.items) ? order.items : [];
      const currentIdx = STATUS_FLOW.indexOf(order.status);

      return `
        <div class="bg-white rounded-2xl border-2 p-3.5 shadow-sm space-y-3 transition-all duration-200 ${timerClass}" id="card-${order.id}">
          <div class="flex justify-between items-start gap-2">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-base font-black text-stone-900">Mesa ${order.table_number}</span>
                <span class="text-[10px] text-stone-400 font-mono">#${(order.id || '').substring(0,4)}</span>
              </div>
              <div class="flex items-center gap-1 mt-0.5">
                <span class="text-[11px] text-stone-400">Mesero:</span>
                <select onchange="window.app.updateOrderWaiter('${order.id}', this.value)" class="text-xs font-bold text-stone-700 bg-transparent border-b border-stone-200 focus:outline-none cursor-pointer">
                  ${WAITERS_LIST.map(w => `<option value="${w}" ${order.waiter_name === w ? 'selected' : ''}>${w}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="flex flex-col items-end gap-1.5">
              <span class="inline-flex items-center gap-1 text-[11px] font-mono font-black px-2 py-0.5 rounded-lg ${badgeBg} ${badgeText}" id="orderTimer-${order.id}">
                ⏱ ${formatElapsed(elapsed)}
              </span>
              <div class="flex items-center gap-1">
                <button onclick="window.app.openEditOrderModal('${order.id}')" class="p-1 hover:bg-stone-100 rounded-lg text-xs font-bold text-stone-600 transition" title="Editar comanda">✏️</button>
                <button onclick="window.app.deleteOrder('${order.id}')" class="p-1 hover:bg-rose-50 text-rose-500 rounded-lg text-xs font-bold transition" title="Eliminar comanda">🗑️</button>
              </div>
            </div>
          </div>

          <div class="border-t border-stone-100 pt-2 space-y-1.5 text-xs">
            ${items.map(it => `
              <div class="flex justify-between items-start gap-2">
                <div class="flex items-start gap-1.5">
                  <span class="font-mono font-black bg-stone-900 text-white rounded px-1.5 text-[10px] flex-shrink-0 mt-0.5">${it.qty}x</span>
                  <div>
                    <span class="font-bold text-stone-800 leading-snug">${it.title}</span>
                    ${it.modifiers && it.modifiers.length > 0 ? `<p class="text-[10px] text-amber-800 font-semibold">↳ ${it.modifiers.join(', ')}</p>` : ''}
                  </div>
                </div>
                <span class="font-mono text-stone-500 text-[11px] font-semibold">$${(it.price * it.qty).toFixed(2)}</span>
              </div>
            `).join('')}
            ${order.customer_notes ? `<div class="bg-amber-50 border border-amber-200 rounded-lg p-1.5 text-[10px] text-amber-900 font-semibold mt-1"><span>📝 Nota:</span> ${order.customer_notes}</div>` : ''}
          </div>

          <div class="border-t border-stone-100 pt-2 flex justify-between items-center text-xs">
            <div>
              ${order.discount > 0 ? `<div class="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold text-emerald-800 flex items-center gap-1"><span>🏷️ Ahorro Promo:</span><span class="font-mono">-$${Number(order.discount).toFixed(2)}</span></div>` : ''}
            </div>
            <div class="text-right">
              <span class="text-[10px] text-stone-400 block font-medium">Total Mesa:</span>
              <span class="font-black font-mono text-sm text-stone-900">$${Number(order.total).toFixed(2)}</span>
            </div>
          </div>

          <div class="border-t border-stone-100 pt-2 flex items-center justify-between gap-1.5">
            ${currentIdx > 0 ? `
              <button onclick="window.app.moveOrderStatus('${order.id}', -1)" class="px-2.5 py-1.5 rounded-xl text-stone-600 bg-stone-100 hover:bg-stone-200 text-xs font-bold transition flex items-center gap-1 active:scale-95" title="Regresar"><span>←</span></button>
            ` : '<div></div>'}

            ${order.status === 'paid' ? `
              <button onclick="window.app.archiveOrder('${order.id}')" class="flex-grow px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm">
                <span>Enviar al Histórico del Día 📦</span>
              </button>
            ` : `
              <button onclick="window.app.moveOrderStatus('${order.id}', 1)" class="flex-grow px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95">
                <span>Mover a ${STATUS_LABELS[STATUS_FLOW[currentIdx + 1]]}</span><span>→</span>
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  });
}

export async function moveOrderStatus(orderId, direction) {
  const order = adminOrders.find(o => o.id === orderId);
  if (!order) return;

  const currentIdx = STATUS_FLOW.indexOf(order.status);
  const nextIdx = currentIdx + direction;
  if (nextIdx < 0 || nextIdx >= STATUS_FLOW.length) return;

  const newStatus = STATUS_FLOW[nextIdx];
  order.status = newStatus;

  if (direction < 0) playFlowSound('rewind');
  else playFlowSound(newStatus);

  const updatePayload = { status: newStatus };
  const nowIso = new Date().toISOString();
  if (newStatus === 'preparing') updatePayload.preparing_at = nowIso;
  if (newStatus === 'delivered') updatePayload.delivered_at = nowIso;
  if (newStatus === 'paid') updatePayload.paid_at = nowIso;

  renderKanbanBoard();
  if (client) await client.from('orders').update(updatePayload).eq('id', orderId);
}

export async function archiveOrder(orderId) {
  const order = adminOrders.find(o => o.id === orderId);
  if (!order) return;
  order.is_archived = true;
  playFlowSound('archive');
  renderKanbanBoard();
  if (client) await client.from('orders').update({ is_archived: true }).eq('id', orderId);
}

export async function deleteOrder(orderId) {
  const order = adminOrders.find(o => o.id === orderId);
  if (!confirm(`¿Eliminar la comanda de la Mesa ${order?.table_number || ''}?`)) return;
  adminOrders = adminOrders.filter(o => o.id !== orderId);
  renderKanbanBoard();
  if (client) await client.from('orders').delete().eq('id', orderId);
}

export function updateOrderTimers() {
  adminOrders.forEach(o => {
    const timerEl = document.getElementById(`orderTimer-${o.id}`);
    if (timerEl && o.status !== 'paid' && !o.is_archived) {
      const elapsed = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 1000);
      timerEl.innerText = `⏱ ${formatElapsed(elapsed)}`;
    }
  });
}

export function formatElapsed(secs) {
  const m = Math.floor(Math.max(0, secs) / 60);
  const s = Math.max(0, secs) % 60;
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

function getTimerSLA(secs, status) {
  if (status === 'paid') return { timerClass: 'border-stone-200', badgeBg: 'bg-stone-100', badgeText: 'text-stone-500' };
  if (status === 'delivered') return { timerClass: 'border-blue-200', badgeBg: 'bg-blue-100', badgeText: 'text-blue-800' };
  if (status === 'preparing') return { timerClass: 'border-orange-300', badgeBg: 'bg-orange-100', badgeText: 'text-orange-900' };
  if (secs > 1200) return { timerClass: 'pulse-danger border-rose-500', badgeBg: 'bg-rose-600', badgeText: 'text-white' };
  if (secs > 600) return { timerClass: 'border-amber-400', badgeBg: 'bg-amber-100', badgeText: 'text-amber-900' };
  return { timerClass: 'border-stone-200', badgeBg: 'bg-stone-100', badgeText: 'text-stone-700' };
}

export async function updateOrderWaiter(orderId, waiterName) {
  const order = adminOrders.find(o => o.id === orderId);
  if (order) order.waiter_name = waiterName;
  if (client) await client.from('orders').update({ waiter_name: waiterName }).eq('id', orderId);
}

// Modal de edición de comanda
export function openEditOrderModal(orderId) {
  const order = adminOrders.find(o => o.id === orderId);
  if (!order) return;

  currentEditingOrder = order;
  modalOrderItems = JSON.parse(JSON.stringify(order.items || []));

  const idEl = document.getElementById('modalOrderId');
  if (idEl) idEl.value = order.id;

  const badgeEl = document.getElementById('modalOrderTableBadge');
  if (badgeEl) badgeEl.innerText = `Mesa ${order.table_number}`;

  const notesEl = document.getElementById('modalOrderNotes');
  if (notesEl) notesEl.value = order.customer_notes || '';

  const statusEl = document.getElementById('modalOrderStatus');
  if (statusEl) statusEl.value = order.status || 'pending';

  const waiterSelect = document.getElementById('modalOrderWaiter');
  if (waiterSelect) {
    waiterSelect.innerHTML = WAITERS_LIST.map(w => `<option value="${w}" ${order.waiter_name === w ? 'selected' : ''}>${w}</option>`).join('');
  }

  renderModalOrderItems();
  const modal = document.getElementById('editOrderModal');
  if (modal) modal.classList.remove('hidden');
}

export function closeEditOrderModal() {
  const modal = document.getElementById('editOrderModal');
  if (modal) modal.classList.add('hidden');
  const results = document.getElementById('modalAddProdResults');
  if (results) results.classList.add('hidden');
  const search = document.getElementById('modalAddProdSearch');
  if (search) search.value = '';
  currentEditingOrder = null;
}

export function renderModalOrderItems() {
  const container = document.getElementById('modalOrderItemsContainer');
  if (!container) return;

  if (modalOrderItems.length === 0) {
    container.innerHTML = '<p class="text-xs text-stone-400 py-4 text-center">La comanda no tiene productos.</p>';
    calculateModalOrderTotal();
    return;
  }

  container.innerHTML = modalOrderItems.map((it, idx) => `
    <div class="p-3 border rounded-2xl bg-stone-50 space-y-2 text-xs">
      <div class="flex justify-between items-center">
        <div>
          <span class="font-bold text-stone-900">${it.title}</span>
          <span class="text-stone-400 font-mono ml-1">($${Number(it.price).toFixed(2)} c/u)</span>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 bg-white border rounded-xl p-1 shadow-sm">
            <button type="button" onclick="window.app.changeModalItemQty(${idx}, -1)" class="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold flex items-center justify-center">-</button>
            <span class="font-bold font-mono px-1.5">${it.qty}</span>
            <button type="button" onclick="window.app.changeModalItemQty(${idx}, 1)" class="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold flex items-center justify-center">+</button>
          </div>
          <span class="font-mono font-bold text-stone-900 w-16 text-right">$${(it.price * it.qty).toFixed(2)}</span>
          <button type="button" onclick="window.app.removeModalItem(${idx})" class="text-rose-500 hover:text-rose-700 font-bold p-1">✕</button>
        </div>
      </div>
      <div class="border-t border-stone-200/60 pt-1.5 flex flex-wrap items-center gap-1.5">
        <span class="text-[10px] text-stone-500 font-semibold">Extras:</span>
        ${(it.modifiers || []).map((mod, modIdx) => `
          <span class="inline-flex items-center gap-1 bg-amber-100 text-amber-900 px-2 py-0.5 rounded-lg text-[10px] font-bold">
            ${mod}
            <button type="button" onclick="window.app.removeModalModifier(${idx}, ${modIdx})" class="hover:text-rose-600">×</button>
          </span>
        `).join('')}
        <button type="button" onclick="window.app.addModalModifierPrompt(${idx})" class="text-[10px] bg-white border border-stone-300 hover:bg-stone-100 px-2 py-0.5 rounded-lg font-bold text-stone-600">+ Añadir extra</button>
      </div>
    </div>
  `).join('');

  calculateModalOrderTotal();
}

export function changeModalItemQty(idx, delta) {
  modalOrderItems[idx].qty += delta;
  if (modalOrderItems[idx].qty <= 0) modalOrderItems.splice(idx, 1);
  renderModalOrderItems();
}

export function removeModalItem(idx) {
  modalOrderItems.splice(idx, 1);
  renderModalOrderItems();
}

export function removeModalModifier(itemIdx, modIdx) {
  modalOrderItems[itemIdx].modifiers.splice(modIdx, 1);
  renderModalOrderItems();
}

export function addModalModifierPrompt(itemIdx) {
  const extraName = prompt("Escribe el extra (ej: 'Sin azúcar', 'Leche de avena'):");
  if (!extraName || extraName.trim() === '') return;
  if (!modalOrderItems[itemIdx].modifiers) modalOrderItems[itemIdx].modifiers = [];
  modalOrderItems[itemIdx].modifiers.push(extraName.trim());
  renderModalOrderItems();
}

export function filterModalProductSearch(query, adminProducts) {
  const q = query.toLowerCase().trim();
  const resultsBox = document.getElementById('modalAddProdResults');
  if (!resultsBox) return;
  if (!q) { resultsBox.classList.add('hidden'); return; }

  const matches = (adminProducts || []).filter(p => p.title.toLowerCase().includes(q));
  if (matches.length === 0) {
    resultsBox.innerHTML = '<p class="text-xs text-stone-400 p-3 text-center">No hay coincidencias</p>';
    resultsBox.classList.remove('hidden');
    return;
  }

  resultsBox.innerHTML = matches.map(p => `
    <div onclick="window.app.addModalNewProduct('${p.id}')" class="p-2.5 hover:bg-amber-50 cursor-pointer flex items-center justify-between transition">
      <span class="font-bold text-stone-900">${p.title}</span>
      <span class="font-mono font-bold text-amber-700">$${Number(p.price).toFixed(2)}</span>
    </div>
  `).join('');
  resultsBox.classList.remove('hidden');
}

export function addModalNewProduct(prod) {
  if (!prod) return;
  modalOrderItems.push({ id: prod.id, title: prod.title, price: Number(prod.price), qty: 1, modifiers: [] });
  const search = document.getElementById('modalAddProdSearch');
  if (search) search.value = '';
  const results = document.getElementById('modalAddProdResults');
  if (results) results.classList.add('hidden');
  renderModalOrderItems();
}

export function calculateModalOrderTotal() {
  const subtotal = modalOrderItems.reduce((acc, it) => acc + (Number(it.price) * it.qty), 0);
  const discount = currentEditingOrder?.discount || 0;
  const total = Math.max(0, subtotal - discount);
  const totalDisplay = document.getElementById('modalOrderTotalDisplay');
  if (totalDisplay) totalDisplay.innerText = `$${total.toFixed(2)} MXN`;
  return { subtotal, discount, total };
}

export async function saveOrderEdits() {
  if (!currentEditingOrder) return;
  if (modalOrderItems.length === 0) {
    alert("La comanda debe tener al menos un platillo.");
    return;
  }

  const { subtotal, total } = calculateModalOrderTotal();
  const waiter = document.getElementById('modalOrderWaiter')?.value || 'Sin asignar';
  const status = document.getElementById('modalOrderStatus')?.value || 'pending';
  const notes = document.getElementById('modalOrderNotes')?.value?.trim() || '';

  currentEditingOrder.items = modalOrderItems;
  currentEditingOrder.subtotal = subtotal;
  currentEditingOrder.total = total;
  currentEditingOrder.waiter_name = waiter;
  currentEditingOrder.status = status;
  currentEditingOrder.customer_notes = notes;

  renderKanbanBoard();
  closeEditOrderModal();

  if (client) {
    await client.from('orders').update({
      items: modalOrderItems,
      subtotal: subtotal,
      total: total,
      waiter_name: waiter,
      status: status,
      customer_notes: notes
    }).eq('id', currentEditingOrder.id);
  }
}
