import { REST_ID, generateUUID, normalizeTableNumber, escapeHtml, showToast } from '../config.js';
import { state, client, dbWrite, logAudit } from '../state.js';
import { renderKanbanBoard } from './kanban.js';
import { openNewOrderModal, openEditOrderModal, openOrderDetailModal } from './orders-modal.js';
import { openCheckoutModal } from './cashbox.js';

let activeTableModalNum = null;

function getActiveOrderForTable(tableNum) {
  const norm = normalizeTableNumber(tableNum);
  return state.orders.find(o =>
    !o.is_archived &&
    (!o.order_channel || o.order_channel === 'dine_in') &&
    normalizeTableNumber(o.table_number) === norm &&
    o.status !== 'paid' &&
    o.status !== 'cancelled'
  );
}

function getPendingCallForTable(tableNum) {
  const norm = normalizeTableNumber(tableNum);
  return state.calls.find(c => c.status === 'pending' && normalizeTableNumber(c.table_number) === norm);
}

export function renderTablesFloorPlan() {
  const cont = document.getElementById('tablesFloorContainer');
  const kpiOcc = document.getElementById('tablesOccupiedBadge');
  if (!cont) return;

  // Combinar mesas registradas con cualquier mesa activa en comandas que no esté en el catálogo
  const mapByNum = new Map();
  state.tables.forEach(t => mapByNum.set(normalizeTableNumber(t.table_number), t));

  state.orders.forEach(o => {
    if (!o.is_archived && (!o.order_channel || o.order_channel === 'dine_in') && o.status !== 'paid' && o.status !== 'cancelled') {
      const n = normalizeTableNumber(o.table_number);
      if (!mapByNum.has(n)) {
        mapByNum.set(n, { id: null, table_number: n, zone: 'Adicional / QR', capacity: 4, status: 'occupied' });
      }
    }
  });

  const allTables = Array.from(mapByNum.values()).sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true }));

  if (allTables.length === 0) {
    cont.innerHTML = '<div class="bg-white rounded-2xl p-8 text-center text-xs text-stone-400 border">No hay mesas configuradas. Agrega tu primera mesa arriba o ejecuta migration_v2.sql.</div>';
    if (kpiOcc) kpiOcc.innerText = '0 / 0 ocupadas';
    return;
  }

  let occupiedCount = 0;
  const zones = {};
  allTables.forEach(t => {
    const z = t.zone || 'Salón Principal';
    if (!zones[z]) zones[z] = [];
    zones[z].push(t);
  });

  cont.innerHTML = Object.entries(zones).map(([zoneName, list]) => {
    const cards = list.map(t => {
      const order = getActiveOrderForTable(t.table_number);
      const call = getPendingCallForTable(t.table_number);
      let visualStatus = t.status || 'available';
      if (order) {
        occupiedCount++;
        if (visualStatus !== 'bill_requested') visualStatus = 'occupied';
      } else if (visualStatus === 'occupied' || visualStatus === 'bill_requested') {
        visualStatus = 'available';
      }

      const styles = {
        available: { bg: 'bg-white border-emerald-300 hover:border-emerald-500', badge: 'bg-emerald-100 text-emerald-800', label: 'Libre' },
        occupied: { bg: 'bg-amber-50 border-amber-400 hover:border-amber-600', badge: 'bg-amber-200 text-amber-950', label: 'Ocupada' },
        bill_requested: { bg: 'bg-blue-50 border-blue-400 hover:border-blue-600 pulse-danger', badge: 'bg-blue-600 text-white', label: '💳 Pidió Cuenta' },
        cleaning: { bg: 'bg-stone-200 border-stone-400 hover:border-stone-600', badge: 'bg-stone-700 text-white', label: '🧹 Por Limpiar' }
      }[visualStatus] || { bg: 'bg-white border-stone-200', badge: 'bg-stone-100 text-stone-700', label: visualStatus };

      const minsOpen = order ? Math.max(1, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)) : 0;

      return `
        <div onclick="window.openTableActionsModal('${escapeHtml(t.table_number)}')" class="cursor-pointer rounded-3xl border-2 p-4 shadow-sm transition active:scale-[0.98] flex flex-col justify-between min-h-[148px] relative ${styles.bg}">
          ${call ? '<span class="absolute -top-2 -right-2 bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-md animate-bounce">🔔 Mesero</span>' : ''}
          <div class="flex justify-between items-start gap-2">
            <div>
              <span class="text-[10px] text-stone-500 font-semibold block">${t.capacity || 4} pers.</span>
              <h4 class="text-xl font-black text-stone-900 font-mono leading-tight">Mesa ${escapeHtml(t.table_number)}</h4>
            </div>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${styles.badge}">${styles.label}</span>
          </div>

          ${order ? `
            <div class="mt-3 pt-2 border-t border-black/10 space-y-1 text-xs">
              <div class="flex justify-between items-center">
                <span class="text-stone-600 font-semibold truncate">${escapeHtml(order.waiter_name || 'Sin asignar')}</span>
                <span class="font-mono text-[10px] text-stone-500">⏱ ${minsOpen}m</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-[10px] text-stone-500">${(order.items || []).reduce((a, i) => a + Number(i.qty || 1), 0)} ítems</span>
                <span class="font-mono font-black text-sm text-stone-900">$${Number(order.total || 0).toFixed(2)}</span>
              </div>
            </div>
          ` : `
            <div class="mt-3 pt-2 border-t border-black/5 text-[11px] text-stone-400 flex justify-between items-center">
              <span>${visualStatus === 'cleaning' ? 'Toca para liberar' : 'Toca para abrir cuenta'}</span>
              <span class="font-bold text-stone-600">+</span>
            </div>
          `}
        </div>
      `;
    }).join('');

    return `
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-extrabold text-sm text-stone-800 uppercase tracking-wider">📍 ${escapeHtml(zoneName)}</h3>
          <span class="text-xs text-stone-400 font-mono">${list.length} mesas</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          ${cards}
        </div>
      </div>
    `;
  }).join('');

  if (kpiOcc) kpiOcc.innerText = `${occupiedCount} / ${allTables.length} ocupadas`;
}

export function ensureTableModals() {
  if (!document.getElementById('tableActionsModal')) {
    const m = document.createElement('div');
    m.id = 'tableActionsModal';
    m.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
    m.innerHTML = `
      <div class="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar">
        <div class="flex justify-between items-center border-b pb-3">
          <div>
            <h3 class="font-black text-lg text-stone-900" id="tableActTitle">Mesa --</h3>
            <p class="text-xs text-stone-500" id="tableActSub">Gestión rápida de sala</p>
          </div>
          <button onclick="window.closeTableActionsModal()" class="text-stone-400 hover:text-stone-700 font-bold text-lg p-1">✕</button>
        </div>
        <div id="tableActBody" class="space-y-3 text-xs"></div>
      </div>
    `;
    document.body.appendChild(m);
  }
}

export function openTableActionsModal(tableNum) {
  ensureTableModals();
  activeTableModalNum = normalizeTableNumber(tableNum);
  const tableObj = state.tables.find(t => normalizeTableNumber(t.table_number) === activeTableModalNum);
  const order = getActiveOrderForTable(activeTableModalNum);

  document.getElementById('tableActTitle').innerText = `Mesa ${activeTableModalNum}`;
  document.getElementById('tableActSub').innerText = tableObj ? `${tableObj.zone} • Capacidad ${tableObj.capacity} pers.` : 'Mesa de servicio';

  const body = document.getElementById('tableActBody');
  const otherTables = state.tables.filter(t => normalizeTableNumber(t.table_number) !== activeTableModalNum);
  const freeTables = otherTables.filter(t => !getActiveOrderForTable(t.table_number));
  const occupiedTables = otherTables.filter(t => Boolean(getActiveOrderForTable(t.table_number)));

  if (!order) {
    body.innerHTML = `
      <div class="p-3 rounded-2xl bg-stone-50 border text-stone-600 text-center">
        ${tableObj?.status === 'cleaning' ? '🧹 Esta mesa está marcada <b>Por Limpiar</b>.' : '✅ Esta mesa está <b>Libre</b> y lista para recibir comensales.'}
      </div>
      <div class="grid grid-cols-1 gap-2 font-bold">
        <button onclick="window.closeTableActionsModal(); window.openNewOrderModal('${activeTableModalNum}')" class="w-full py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition">
          🛎️ Abrir Cuenta / Tomar Pedido en Mesa ${activeTableModalNum}
        </button>
        ${tableObj?.status === 'cleaning' ? `
          <button onclick="window.setTableStatus('${activeTableModalNum}', 'available')" class="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white transition">
            ✨ Marcar Limpia y Disponible
          </button>
        ` : `
          <button onclick="window.setTableStatus('${activeTableModalNum}', 'cleaning')" class="w-full py-2.5 rounded-2xl bg-stone-200 hover:bg-stone-300 text-stone-800 transition">
            🧹 Marcar Por Limpiar
          </button>
        `}
        <a href="index.html?mesa=${encodeURIComponent(activeTableModalNum)}" target="_blank" class="w-full py-2.5 rounded-2xl border border-stone-200 text-stone-700 hover:bg-stone-50 text-center transition">
          📱 Ver Menú QR de Mesa ${activeTableModalNum} ↗
        </a>
        ${tableObj?.id ? `
          <button onclick="window.deleteTableRecord('${tableObj.id}')" class="w-full py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-[11px] font-bold transition mt-2">
            🗑️ Eliminar mesa del mapa
          </button>
        ` : ''}
      </div>
    `;
  } else {
    const items = Array.isArray(order.items) ? order.items : [];
    body.innerHTML = `
      <div class="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-1.5">
        <div class="flex justify-between font-bold text-amber-950">
          <span>Comanda #${order.id.substring(0, 6).toUpperCase()}</span>
          <span class="font-mono text-base">$${Number(order.total || 0).toFixed(2)}</span>
        </div>
        <p class="text-[11px] text-stone-600">Mesero: <b>${escapeHtml(order.waiter_name || 'Sin asignar')}</b> • Estatus: <b>${escapeHtml(order.status)}</b></p>
        <div class="max-h-28 overflow-y-auto divide-y divide-amber-200/60 pt-1">
          ${items.map(it => `<div class="py-1 flex justify-between text-[11px]"><span>${it.qty}x ${escapeHtml(it.title)}</span><span class="font-mono">$${(Number(it.price) * Number(it.qty)).toFixed(2)}</span></div>`).join('')}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 font-bold">
        <button onclick="window.closeTableActionsModal(); window.openEditOrderModal('${order.id}')" class="py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white transition">
          ✏️ Editar / Agregar
        </button>
        <button onclick="window.closeTableActionsModal(); window.openCheckoutModal('${order.id}')" class="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition">
          💵 Cobrar Cuenta
        </button>
        <button onclick="window.closeTableActionsModal(); window.openOrderDetailModal('${order.id}')" class="py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 transition">
          🖨️ Ticket / Comanda
        </button>
        <button onclick="window.setTableStatus('${activeTableModalNum}', 'bill_requested')" class="py-2.5 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900 transition">
          💳 Marcar Pidió Cuenta
        </button>
      </div>

      <!-- CAMBIO DE MESA -->
      <div class="border-t pt-3 space-y-2">
        <label class="block font-bold text-stone-700">🔄 Cambiar toda la cuenta a otra mesa:</label>
        <div class="flex gap-2">
          <select id="moveTargetTableSelect" class="flex-grow border rounded-xl p-2 bg-stone-50 font-bold">
            ${freeTables.length > 0
              ? freeTables.map(ft => `<option value="${escapeHtml(ft.table_number)}">Mesa ${escapeHtml(ft.table_number)} (${escapeHtml(ft.zone)})</option>`).join('')
              : '<option value="">No hay mesas libres</option>'}
          </select>
          <button onclick="window.moveOrderToAnotherTable('${order.id}')" ${freeTables.length === 0 ? 'disabled' : ''} class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold">
            Mover
          </button>
        </div>
      </div>

      <!-- UNIR MESAS -->
      <div class="border-t pt-3 space-y-2">
        <label class="block font-bold text-stone-700">🔗 Unir esta cuenta con otra mesa ocupada:</label>
        <div class="flex gap-2">
          <select id="mergeTargetTableSelect" class="flex-grow border rounded-xl p-2 bg-stone-50 font-bold">
            ${occupiedTables.length > 0
              ? occupiedTables.map(ot => `<option value="${escapeHtml(ot.table_number)}">Mesa ${escapeHtml(ot.table_number)}</option>`).join('')
              : '<option value="">No hay otras mesas ocupadas</option>'}
          </select>
          <button onclick="window.mergeOrdersIntoTable('${order.id}')" ${occupiedTables.length === 0 ? 'disabled' : ''} class="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-white font-bold">
            Unir
          </button>
        </div>
      </div>

      <!-- TRANSFERIR PLATILLOS ESPECÍFICOS -->
      <div class="border-t pt-3 space-y-2">
        <label class="block font-bold text-stone-700">🍽️ Transferir un platillo a otra mesa:</label>
        <div class="grid grid-cols-1 gap-2">
          <select id="transferItemIdxSelect" class="border rounded-xl p-2 bg-stone-50">
            ${items.map((it, idx) => `<option value="${idx}">${it.qty}x ${escapeHtml(it.title)} ($${(Number(it.price) * Number(it.qty)).toFixed(2)})</option>`).join('')}
          </select>
          <div class="flex gap-2">
            <select id="transferDestTableSelect" class="flex-grow border rounded-xl p-2 bg-stone-50 font-bold">
              ${otherTables.map(ot => `<option value="${escapeHtml(ot.table_number)}">Mesa ${escapeHtml(ot.table_number)} ${getActiveOrderForTable(ot.table_number) ? '(Ocupada)' : '(Libre)'}</option>`).join('')}
            </select>
            <button onclick="window.transferSingleItemToTable('${order.id}')" ${items.length <= 1 ? 'disabled title="Si es el único platillo usa Cambiar de Mesa"' : ''} class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold">
              Transferir
            </button>
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('tableActionsModal').classList.remove('hidden');
}

export function closeTableActionsModal() {
  const m = document.getElementById('tableActionsModal');
  if (m) m.classList.add('hidden');
}

export async function setTableStatus(tableNum, newStatus) {
  const norm = normalizeTableNumber(tableNum);
  const t = state.tables.find(x => normalizeTableNumber(x.table_number) === norm);
  if (t && t.id) {
    const { error } = await dbWrite(client.from('tables').update({ status: newStatus }).eq('id', t.id), 'cambiar estado de mesa');
    if (error) return;
    t.status = newStatus;
  }
  renderTablesFloorPlan();
  closeTableActionsModal();
  showToast(`Mesa ${norm} actualizada ✓`, 'success');
}

export async function moveOrderToAnotherTable(orderId) {
  const targetNum = normalizeTableNumber(document.getElementById('moveTargetTableSelect')?.value);
  const order = state.orders.find(o => o.id === orderId);
  if (!order || !targetNum) return;
  const oldNum = normalizeTableNumber(order.table_number);

  const { error } = await dbWrite(client.from('orders').update({ table_number: targetNum }).eq('id', order.id), 'cambiar de mesa');
  if (error) return;

  order.table_number = targetNum;
  // Liberar mesa anterior y ocupar destino
  const oldT = state.tables.find(t => normalizeTableNumber(t.table_number) === oldNum);
  const newT = state.tables.find(t => normalizeTableNumber(t.table_number) === targetNum);
  if (oldT?.id) {
    oldT.status = 'cleaning';
    await client.from('tables').update({ status: 'cleaning' }).eq('id', oldT.id);
  }
  if (newT?.id) {
    newT.status = 'occupied';
    await client.from('tables').update({ status: 'occupied' }).eq('id', newT.id);
  }

  await logAudit('move_table', { order_id: order.id, from: oldNum, to: targetNum });
  renderTablesFloorPlan();
  renderKanbanBoard();
  closeTableActionsModal();
  showToast(`Comanda movida de Mesa ${oldNum} ➔ Mesa ${targetNum}`, 'success');
}

export async function mergeOrdersIntoTable(sourceOrderId) {
  const targetNum = normalizeTableNumber(document.getElementById('mergeTargetTableSelect')?.value);
  const sourceOrder = state.orders.find(o => o.id === sourceOrderId);
  const targetOrder = getActiveOrderForTable(targetNum);
  if (!sourceOrder || !targetOrder) return;

  if (!confirm(`¿Unir todos los platillos de Mesa ${sourceOrder.table_number} dentro de la cuenta de Mesa ${targetNum}?`)) return;

  const combinedItems = [...(targetOrder.items || []), ...(sourceOrder.items || [])];
  const combinedSubtotal = combinedItems.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
  const combinedDiscount = Number(targetOrder.discount || 0) + Number(sourceOrder.discount || 0);
  const combinedTotal = Math.max(0, combinedSubtotal - combinedDiscount);
  const combinedNotes = [targetOrder.customer_notes, sourceOrder.customer_notes].filter(Boolean).join(' | ');

  const { error: err1 } = await dbWrite(
    client.from('orders').update({
      items: combinedItems,
      subtotal: combinedSubtotal,
      discount: combinedDiscount,
      total: combinedTotal,
      customer_notes: combinedNotes
    }).eq('id', targetOrder.id),
    'unir cuentas'
  );
  if (err1) return;

  const { error: err2 } = await dbWrite(
    client.from('orders').update({
      status: 'cancelled',
      is_archived: true,
      cancel_reason: `Unida con Mesa ${targetNum}`
    }).eq('id', sourceOrder.id),
    'cerrar cuenta origen tras unión'
  );
  if (err2) return;

  targetOrder.items = combinedItems;
  targetOrder.subtotal = combinedSubtotal;
  targetOrder.discount = combinedDiscount;
  targetOrder.total = combinedTotal;
  targetOrder.customer_notes = combinedNotes;

  sourceOrder.status = 'cancelled';
  sourceOrder.is_archived = true;

  const oldT = state.tables.find(t => normalizeTableNumber(t.table_number) === normalizeTableNumber(sourceOrder.table_number));
  if (oldT?.id) {
    oldT.status = 'available';
    await client.from('tables').update({ status: 'available' }).eq('id', oldT.id);
  }

  await logAudit('merge_tables', { from_table: sourceOrder.table_number, into_table: targetNum });
  renderTablesFloorPlan();
  renderKanbanBoard();
  closeTableActionsModal();
  showToast(`Mesas unidas en Mesa ${targetNum} ✓`, 'success');
}

export async function transferSingleItemToTable(sourceOrderId) {
  const idx = parseInt(document.getElementById('transferItemIdxSelect')?.value);
  const destNum = normalizeTableNumber(document.getElementById('transferDestTableSelect')?.value);
  const sourceOrder = state.orders.find(o => o.id === sourceOrderId);
  if (!sourceOrder || isNaN(idx) || !sourceOrder.items[idx]) return;

  const [movedItem] = sourceOrder.items.splice(idx, 1);
  sourceOrder.subtotal = sourceOrder.items.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
  sourceOrder.total = Math.max(0, sourceOrder.subtotal - Number(sourceOrder.discount || 0));

  await dbWrite(
    client.from('orders').update({ items: sourceOrder.items, subtotal: sourceOrder.subtotal, total: sourceOrder.total }).eq('id', sourceOrder.id),
    'actualizar cuenta origen'
  );

  let destOrder = getActiveOrderForTable(destNum);
  if (destOrder) {
    destOrder.items.push(movedItem);
    destOrder.subtotal = destOrder.items.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
    destOrder.total = Math.max(0, destOrder.subtotal - Number(destOrder.discount || 0));
    await dbWrite(
      client.from('orders').update({ items: destOrder.items, subtotal: destOrder.subtotal, total: destOrder.total }).eq('id', destOrder.id),
      'recibir platillo transferido'
    );
  } else {
    const sub = Number(movedItem.price) * Number(movedItem.qty);
    destOrder = {
      id: generateUUID(),
      restaurant_id: REST_ID,
      table_number: destNum,
      order_channel: 'dine_in',
      waiter_name: sourceOrder.waiter_name || state.activeStaff?.name || 'Sin asignar',
      items: [movedItem],
      subtotal: sub,
      discount: 0,
      total: sub,
      status: sourceOrder.status,
      is_archived: false,
      active_course: 1,
      created_at: new Date().toISOString()
    };
    await dbWrite(client.from('orders').insert([destOrder]), 'crear cuenta destino por transferencia');
    state.orders.unshift(destOrder);
    const destT = state.tables.find(t => normalizeTableNumber(t.table_number) === destNum);
    if (destT?.id) {
      destT.status = 'occupied';
      await client.from('tables').update({ status: 'occupied' }).eq('id', destT.id);
    }
  }

  await logAudit('transfer_item', { item: movedItem.title, from: sourceOrder.table_number, to: destNum });
  renderTablesFloorPlan();
  renderKanbanBoard();
  closeTableActionsModal();
  showToast(`"${movedItem.title}" transferido a Mesa ${destNum} ✓`, 'success');
}

export async function createNewTableRecord() {
  const numRaw = document.getElementById('newTableNumberInput')?.value?.trim();
  const zone = document.getElementById('newTableZoneInput')?.value?.trim() || 'Salón Principal';
  const cap = parseInt(document.getElementById('newTableCapInput')?.value) || 4;
  if (!numRaw) {
    showToast('Escribe el número o clave de la mesa (ej: 09 o T1).', 'warning');
    return;
  }
  const norm = normalizeTableNumber(numRaw);
  if (state.tables.some(t => normalizeTableNumber(t.table_number) === norm)) {
    showToast(`La Mesa ${norm} ya existe.`, 'warning');
    return;
  }
  const newTable = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    table_number: norm,
    zone,
    capacity: cap,
    status: 'available',
    created_at: new Date().toISOString()
  };
  const { error } = await dbWrite(client.from('tables').insert([newTable]), 'crear mesa');
  if (error) return;

  state.tables.push(newTable);
  document.getElementById('newTableNumberInput').value = '';
  renderTablesFloorPlan();
  showToast(`Mesa ${norm} agregada a ${zone} ✓`, 'success');
}

export async function deleteTableRecord(tableId) {
  if (!confirm('¿Eliminar esta mesa del plano?')) return;
  const { error } = await dbWrite(client.from('tables').delete().eq('id', tableId), 'eliminar mesa');
  if (error) return;
  state.tables = state.tables.filter(t => t.id !== tableId);
  renderTablesFloorPlan();
  closeTableActionsModal();
  showToast('Mesa eliminada ✓', 'info');
}
