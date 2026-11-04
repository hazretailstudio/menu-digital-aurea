import { state, client } from '../state.js';
import { REST_ID, WAITERS_LIST } from '../config.js';
import { renderKanbanBoard } from './kanban.js';
import { playSoundByName } from '../audio.js';

let manualOrderItems = [];
let currentEditingOrder = null;
let currentSelectedDetailOrder = null;

export function ensureOrderModals() {
  if (!document.getElementById('newOrderManualModal')) {
    const m1 = document.createElement('div');
    m1.id = 'newOrderManualModal';
    m1.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
    m1.innerHTML = `
      <div class="bg-white w-full max-w-xl rounded-3xl max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl p-6 space-y-4">
        <div class="flex justify-between items-center border-b pb-3">
          <h3 class="font-bold text-base text-stone-900 flex items-center gap-2">
            <span>🛎️ Nuevo Pedido Manual</span>
          </h3>
          <button onclick="window.closeNewOrderModal()" class="text-stone-400 hover:text-stone-700 font-bold text-lg p-1">✕</button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label class="block font-bold text-stone-700 mb-1">Canal de Venta:</label>
            <select id="manualOrderChannel" onchange="window.handleManualChannelChange(this.value)" class="w-full border rounded-xl p-2.5 bg-stone-50 font-semibold outline-none focus:border-amber-600">
              <option value="dine_in">🍽️ En Mesa</option>
              <option value="takeout">🛍️ Para Llevar</option>
              <option value="rappi">🛵 Rappi</option>
              <option value="didi">🛵 DiDi Food</option>
              <option value="ubereats">🛵 Uber Eats</option>
            </select>
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1" id="manualTableLabel">Mesa #:</label>
            <input type="text" id="manualOrderTable" placeholder="01" class="w-full border rounded-xl p-2.5 font-bold outline-none focus:border-amber-600">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">Mesero / Atiende:</label>
            <select id="manualOrderWaiter" class="w-full border rounded-xl p-2.5 bg-stone-50 font-semibold outline-none focus:border-amber-600"></select>
          </div>
        </div>
        <div class="border border-stone-200 bg-stone-50 rounded-2xl p-3.5 space-y-2">
          <label class="block text-xs font-bold text-stone-800">Buscar Platillo:</label>
          <div class="relative">
            <input type="text" id="manualProdSearchInput" oninput="window.filterManualProductDropdown(this.value)" placeholder="Escribe el nombre del platillo..." class="w-full border rounded-xl p-2.5 text-xs bg-white outline-none focus:border-amber-600">
            <div id="manualProdDropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-30 divide-y text-xs"></div>
          </div>
        </div>
        <div class="space-y-2">
          <label class="block text-xs font-bold uppercase tracking-wider text-stone-600">Platillos en Comanda:</label>
          <div id="manualOrderItemsList" class="space-y-2 max-h-48 overflow-y-auto pr-1"></div>
        </div>
        <div>
          <label class="block font-bold text-xs text-stone-700 mb-1">Notas especiales:</label>
          <textarea id="manualOrderNotes" rows="2" placeholder="Ej: Sin cebolla, término medio..." class="w-full border rounded-xl p-2.5 text-xs outline-none bg-stone-50"></textarea>
        </div>
        <div class="border-t pt-3 flex justify-between items-center">
          <div>
            <span class="text-xs text-stone-400 block font-medium">Total:</span>
            <span class="text-xl font-black font-mono text-stone-900" id="manualOrderTotalDisplay">$0.00 MXN</span>
          </div>
          <button onclick="window.submitManualOrder()" class="bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition shadow-md">
            Crear y Enviar 🛎️
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(m1);
  }

  if (!document.getElementById('editOrderModal')) {
    const m2 = document.createElement('div');
    m2.id = 'editOrderModal';
    m2.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
    m2.innerHTML = `
      <div class="bg-white w-full max-w-xl rounded-3xl max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl p-6 space-y-5">
        <div class="flex justify-between items-center border-b pb-3">
          <h3 class="font-bold text-base text-stone-900 flex items-center gap-2">
            <span>✏️ Editar Comanda</span>
            <span id="modalOrderTableBadge" class="bg-amber-100 text-amber-900 font-black text-xs px-2.5 py-0.5 rounded-lg font-mono">Mesa --</span>
          </h3>
          <button onclick="window.closeEditOrderModal()" class="text-stone-400 hover:text-stone-700 font-bold text-lg p-1">✕</button>
        </div>
        <input type="hidden" id="modalOrderId">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label class="block font-bold text-stone-700 mb-1">Mesero Asignado:</label>
            <select id="modalOrderWaiter" class="w-full border rounded-xl p-2.5 bg-stone-50 font-bold text-stone-800 outline-none"></select>
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">Estatus Actual:</label>
            <select id="modalOrderStatus" class="w-full border rounded-xl p-2.5 bg-stone-50 font-bold text-stone-800 outline-none"></select>
          </div>
        </div>
        <div class="border border-stone-200 bg-stone-50 rounded-2xl p-3 space-y-2 text-xs">
          <label class="block font-bold text-stone-800">+ Añadir Platillo a la Comanda:</label>
          <div class="relative">
            <input type="text" id="editProdSearchInput" oninput="window.filterEditProductDropdown(this.value)" placeholder="Buscar platillo..." class="w-full border rounded-xl p-2 bg-white outline-none">
            <div id="editProdDropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-30 divide-y text-xs"></div>
          </div>
        </div>
        <div class="space-y-3">
          <h4 class="font-bold text-xs uppercase tracking-wider text-stone-700">Platillos en Comanda:</h4>
          <div id="modalOrderItemsContainer" class="space-y-2.5 max-h-60 overflow-y-auto pr-1"></div>
        </div>
        <div>
          <label class="block font-bold text-xs text-stone-700 mb-1">Notas especiales:</label>
          <textarea id="modalOrderNotes" rows="2" class="w-full border rounded-xl p-2.5 text-xs outline-none bg-stone-50"></textarea>
        </div>
        <div class="border-t pt-4 flex justify-between items-center">
          <p class="text-xl font-black font-mono text-stone-900" id="modalOrderTotalDisplay">$0.00 MXN</p>
          <button onclick="window.saveOrderEditsWithConfirm()" class="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition shadow-md">
            Guardar Cambios ✓
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(m2);
  }

  if (!document.getElementById('orderDetailModal')) {
    const m3 = document.createElement('div');
    m3.id = 'orderDetailModal';
    m3.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
    m3.innerHTML = `
      <div class="bg-white w-full max-w-md rounded-3xl max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl p-6 space-y-4">
        <div class="flex justify-between items-start border-b pb-3">
          <div>
            <span class="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Detalle de Comanda</span>
            <h3 class="text-lg font-black text-stone-900 flex items-center gap-2 mt-0.5">
              <span id="detailTableNum">Mesa --</span>
              <span id="detailOrderId" class="text-xs font-mono font-normal text-stone-400">#0000</span>
            </h3>
          </div>
          <button onclick="window.closeOrderDetailModal()" class="text-stone-400 hover:text-stone-700 font-bold text-lg p-1">✕</button>
        </div>
        <div id="printableTicketArea" class="bg-stone-50 border border-stone-200 rounded-2xl p-4 font-mono text-xs space-y-3">
          <div class="text-center pb-2 border-b border-dashed border-stone-300">
            <h4 class="font-extrabold text-sm text-stone-900 uppercase">Café & Bistro Áurea</h4>
            <p class="text-[10px] text-stone-500 mt-0.5" id="ticketDateTime">--/--/---- --:--</p>
            <div class="flex justify-center gap-2 mt-1 text-[11px] font-bold">
              <span id="ticketChannelBadge" class="bg-stone-200 px-1.5 py-0.5 rounded text-stone-800">Mesa</span>
              <span id="ticketWaiter" class="text-stone-700">Mesero: --</span>
            </div>
          </div>
          <div id="ticketItemsContainer" class="space-y-1.5 py-1"></div>
          <div class="border-t border-dashed border-stone-300 pt-2 space-y-1 text-[11px]">
            <div class="flex justify-between">
              <span>Subtotal:</span>
              <span id="ticketSubtotal">$0.00</span>
            </div>
            <div class="flex justify-between text-emerald-700 font-bold" id="ticketDiscountRow">
              <span>Descuento Promo:</span>
              <span id="ticketDiscount">-$0.00</span>
            </div>
            <div class="flex justify-between text-sm font-black border-t pt-1 text-stone-900">
              <span>TOTAL:</span>
              <span id="ticketTotal">$0.00 MXN</span>
            </div>
          </div>
          <div id="ticketSplitStatusBox" class="hidden border-t border-dashed border-stone-300 pt-2 space-y-1"></div>
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t">
          <button onclick="window.printCurrentOrderTicket()" class="flex-grow bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm">
            <span>🖨️ Imprimir Ticket / Guardar PDF</span>
          </button>
          <button onclick="window.closeOrderDetailModal()" class="px-4 py-2.5 border rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100">
            Cerrar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(m3);
  }
}

// NUEVO PEDIDO MANUAL
export function openNewOrderModal() {
  ensureOrderModals();
  manualOrderItems = [];
  document.getElementById('manualOrderTable').value = '';
  document.getElementById('manualOrderNotes').value = '';
  const waiterSelect = document.getElementById('manualOrderWaiter');
  waiterSelect.innerHTML = WAITERS_LIST.map(w => `<option value="${w}">${w}</option>`).join('');
  renderManualOrderItems();
  document.getElementById('newOrderManualModal').classList.remove('hidden');
}

export function closeNewOrderModal() {
  const m = document.getElementById('newOrderManualModal');
  if (m) m.classList.add('hidden');
  manualOrderItems = [];
}

export function handleManualChannelChange(channel) {
  const tableInput = document.getElementById('manualOrderTable');
  const tableLabel = document.getElementById('manualTableLabel');
  if (channel === 'dine_in') { tableLabel.innerText = 'Mesa #:'; tableInput.placeholder = '01'; }
  else if (channel === 'takeout') { tableLabel.innerText = 'Etiqueta:'; tableInput.value = 'Para Llevar'; }
  else { tableLabel.innerText = 'Folio App:'; tableInput.placeholder = 'Ej: #A92'; }
}

export function filterManualProductDropdown(query) {
  const q = query.toLowerCase().trim();
  const drop = document.getElementById('manualProdDropdown');
  if (!q) { drop.classList.add('hidden'); return; }

  const matches = state.products.filter(p => p.title.toLowerCase().includes(q));
  drop.classList.remove('hidden');
  drop.innerHTML = matches.map(p => {
    const img = (p.media && p.media[0]) ? p.media[0].url : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80';
    return `
      <div onclick="window.selectProductToAddManual('${p.id}')" class="p-2 hover:bg-amber-50 cursor-pointer flex items-center justify-between gap-2 text-xs">
        <div class="flex items-center gap-2">
          <img src="${img}" class="w-8 h-8 rounded-lg object-cover bg-stone-200">
          <span class="font-bold text-stone-900">${p.title}</span>
        </div>
        <span class="font-bold font-mono text-amber-700">$${Number(p.price).toFixed(2)}</span>
      </div>
    `;
  }).join('');
}

export function selectProductToAddManual(prodId) {
  const prod = state.products.find(p => p.id === prodId);
  if (!prod) return;
  manualOrderItems.push({ id: prod.id, title: prod.title, price: Number(prod.price), qty: 1 });
  document.getElementById('manualProdDropdown').classList.add('hidden');
  document.getElementById('manualProdSearchInput').value = '';
  renderManualOrderItems();
}

export function renderManualOrderItems() {
  const cont = document.getElementById('manualOrderItemsList');
  if (manualOrderItems.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-3 text-center">Sin platillos agregados aún.</p>';
    document.getElementById('manualOrderTotalDisplay').innerText = '$0.00 MXN';
    return;
  }
  cont.innerHTML = manualOrderItems.map((it, idx) => `
    <div class="flex justify-between items-center p-2 rounded-xl bg-stone-50 border text-xs">
      <span><b>${it.qty}x</b> ${it.title}</span>
      <div class="flex items-center gap-2">
        <span class="font-mono font-bold">$${(it.price * it.qty).toFixed(2)}</span>
        <button onclick="window.removeManualOrderItem(${idx})" class="text-rose-600 font-bold px-1">✕</button>
      </div>
    </div>
  `).join('');
  const total = manualOrderItems.reduce((acc, it) => acc + (it.price * it.qty), 0);
  document.getElementById('manualOrderTotalDisplay').innerText = `$${total.toFixed(2)} MXN`;
}

export function removeManualOrderItem(idx) {
  manualOrderItems.splice(idx, 1);
  renderManualOrderItems();
}

export async function submitManualOrder() {
  if (manualOrderItems.length === 0) { alert("Agrega al menos un platillo."); return; }
  const channel = document.getElementById('manualOrderChannel').value;
  let tableNum = document.getElementById('manualOrderTable').value.trim() || '01';

  if (channel === 'dine_in') {
    const activeExisting = state.orders.find(o => o.table_number === tableNum && o.status !== 'paid' && o.status !== 'cancelled' && !o.is_archived);
    if (activeExisting) {
      const unite = confirm(`La Mesa ${tableNum} ya tiene una comanda activa (#${activeExisting.id.substring(0,4)}).\n\n• [Aceptar]: Unificar y enviar lo nuevo a cocina.\n• [Cancelar]: Crear cuenta separada (${tableNum}-B).`);
      if (unite) {
        manualOrderItems.forEach(it => activeExisting.items.unshift({ ...it, is_new: true }));
        activeExisting.has_new_additions = true;
        activeExisting.status = 'preparing';
        activeExisting.kitchen_cycle_started_at = new Date().toISOString();
        activeExisting.total = activeExisting.items.reduce((acc, i) => acc + (i.price * i.qty), 0);

        if (client) {
          await client.from('orders').update({
            items: activeExisting.items,
            has_new_additions: true,
            status: 'preparing',
            kitchen_cycle_started_at: activeExisting.kitchen_cycle_started_at,
            total: activeExisting.total
          }).eq('id', activeExisting.id);
        }
        renderKanbanBoard();
        closeNewOrderModal();
        return;
      } else {
        tableNum = `${tableNum}-B`;
      }
    }
  }

  const total = manualOrderItems.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const newOrder = {
    id: 'ord-' + Date.now(),
    restaurant_id: REST_ID,
    table_number: tableNum,
    order_channel: channel,
    waiter_name: document.getElementById('manualOrderWaiter').value,
    items: manualOrderItems,
    subtotal: total,
    discount: 0,
    total: total,
    status: state.customStatusConfig[0].id,
    is_archived: false,
    customer_notes: document.getElementById('manualOrderNotes').value.trim(),
    created_at: new Date().toISOString()
  };

  const firstCol = state.customStatusConfig[0];
  if (firstCol?.sound_in) playSoundByName(firstCol.sound_in);

  state.orders.unshift(newOrder);
  renderKanbanBoard();
  closeNewOrderModal();

  if (client) {
    try { await client.from('orders').insert([newOrder]); } catch(e){}
  }
}

// EDITAR COMANDA
export function openEditOrderModal(orderId) {
  ensureOrderModals();
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  currentEditingOrder = order;

  document.getElementById('modalOrderId').value = order.id;
  document.getElementById('modalOrderTableBadge').innerText = `Mesa ${order.table_number}`;
  document.getElementById('modalOrderNotes').value = order.customer_notes || '';

  const waiterSelect = document.getElementById('modalOrderWaiter');
  waiterSelect.innerHTML = WAITERS_LIST.map(w => `<option value="${w}" ${order.waiter_name === w ? 'selected' : ''}>${w}</option>`).join('');

  const statusSelect = document.getElementById('modalOrderStatus');
  statusSelect.innerHTML = state.customStatusConfig.map(s => `<option value="${s.id}" ${order.status === s.id ? 'selected' : ''}>${s.name}</option>`).join('');

  renderEditOrderItems();
  document.getElementById('editOrderModal').classList.remove('hidden');
}

export function closeEditOrderModal() {
  const m = document.getElementById('editOrderModal');
  if (m) m.classList.add('hidden');
  currentEditingOrder = null;
}

export function filterEditProductDropdown(query) {
  const q = query.toLowerCase().trim();
  const drop = document.getElementById('editProdDropdown');
  if (!q) { drop.classList.add('hidden'); return; }

  const matches = state.products.filter(p => p.title.toLowerCase().includes(q));
  drop.classList.remove('hidden');
  drop.innerHTML = matches.map(p => `
    <div onclick="window.selectProductToAddEdit('${p.id}')" class="p-2 hover:bg-amber-50 cursor-pointer flex justify-between text-xs">
      <span>${p.title}</span>
      <span class="font-mono font-bold">$${Number(p.price).toFixed(2)}</span>
    </div>
  `).join('');
}

export function selectProductToAddEdit(prodId) {
  const prod = state.products.find(p => p.id === prodId);
  if (!prod || !currentEditingOrder) return;
  currentEditingOrder.items.unshift({ id: prod.id, title: prod.title, price: Number(prod.price), qty: 1, is_new: true });
  document.getElementById('editProdDropdown').classList.add('hidden');
  document.getElementById('editProdSearchInput').value = '';
  renderEditOrderItems();
}

export function renderEditOrderItems() {
  const cont = document.getElementById('modalOrderItemsContainer');
  const items = currentEditingOrder?.items || [];
  cont.innerHTML = items.map((it, idx) => `
    <div class="flex justify-between items-center p-2 rounded-xl bg-stone-50 border text-xs">
      <span>${it.title} ${it.is_new ? '<b class="text-amber-700">(NUEVO)</b>' : ''}</span>
      <div class="flex items-center gap-2">
        <span class="font-mono font-bold">$${(it.price * it.qty).toFixed(2)}</span>
        <button onclick="window.removeEditOrderItem(${idx})" class="text-rose-600 font-bold px-1">✕</button>
      </div>
    </div>
  `).join('');
  const total = items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  document.getElementById('modalOrderTotalDisplay').innerText = `$${total.toFixed(2)} MXN`;
}

export function removeEditOrderItem(idx) {
  if (!currentEditingOrder) return;
  currentEditingOrder.items.splice(idx, 1);
  renderEditOrderItems();
}

export async function saveOrderEditsWithConfirm() {
  if (!currentEditingOrder) return;
  const confirmSave = confirm(`¿Confirmas la modificación de la Comanda de la Mesa ${currentEditingOrder.table_number}?`);
  if (!confirmSave) return;

  const waiter = document.getElementById('modalOrderWaiter').value;
  const status = document.getElementById('modalOrderStatus').value;
  const notes = document.getElementById('modalOrderNotes').value.trim();
  const total = currentEditingOrder.items.reduce((acc, it) => acc + (it.price * it.qty), 0);

  if (currentEditingOrder.status === 'delivered' && currentEditingOrder.items.some(i => i.is_new)) {
    const prep = confirm("Se han añadido productos nuevos a una mesa servida. ¿Regresar comanda a preparación en cocina?");
    if (prep) {
      currentEditingOrder.status = 'preparing';
      currentEditingOrder.kitchen_cycle_started_at = new Date().toISOString();
      currentEditingOrder.has_new_additions = true;
    }
  }

  currentEditingOrder.waiter_name = waiter;
  currentEditingOrder.status = status;
  currentEditingOrder.customer_notes = notes;
  currentEditingOrder.subtotal = total;
  currentEditingOrder.total = total;

  renderKanbanBoard();
  closeEditOrderModal();

  if (client) {
    await client.from('orders').update({
      items: currentEditingOrder.items,
      waiter_name: waiter,
      status: currentEditingOrder.status,
      customer_notes: notes,
      subtotal: total,
      total: total,
      has_new_additions: currentEditingOrder.has_new_additions,
      kitchen_cycle_started_at: currentEditingOrder.kitchen_cycle_started_at
    }).eq('id', currentEditingOrder.id);
  }
}

// DETALLE / TICKET
export function openOrderDetailModal(orderId) {
  ensureOrderModals();
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  currentSelectedDetailOrder = order;

  document.getElementById('detailTableNum').innerText = `Mesa ${order.table_number}`;
  document.getElementById('detailOrderId').innerText = `#${(order.id || '').substring(0,6)}`;
  document.getElementById('ticketDateTime').innerText = new Date(order.created_at).toLocaleString();
  document.getElementById('ticketWaiter').innerText = `Mesero: ${order.waiter_name || 'Sin asignar'}`;
  document.getElementById('ticketChannelBadge').innerText = order.order_channel === 'takeout' ? 'Para Llevar' : (order.order_channel === 'delivery' ? 'Delivery' : 'En Mesa');

  const items = Array.isArray(order.items) ? order.items : [];
  document.getElementById('ticketItemsContainer').innerHTML = items.map(it => `
    <div class="flex justify-between items-start">
      <span>${it.qty}x ${it.title}</span>
      <span class="font-bold">$${(it.price * it.qty).toFixed(2)}</span>
    </div>
  `).join('');

  document.getElementById('ticketSubtotal').innerText = `$${Number(order.subtotal || order.total).toFixed(2)}`;
  document.getElementById('ticketTotal').innerText = `$${Number(order.total).toFixed(2)} MXN`;

  const splitBox = document.getElementById('ticketSplitStatusBox');
  if (order.split_type && order.split_type !== 'single' && order.split_details) {
    splitBox.classList.remove('hidden');
    splitBox.innerHTML = `
      <div class="space-y-1">
        <span class="font-bold text-[11px] text-amber-900 block">👥 Cuenta Dividida:</span>
        ${order.split_details.map((p, idx) => `
          <div class="flex justify-between items-center text-[10px] bg-white p-1 rounded border">
            <span>${p.name}: $${Number(p.amount).toFixed(2)}</span>
            <button onclick="window.togglePersonPaid('${order.id}', ${idx})" class="px-2 py-0.5 rounded font-bold ${p.paid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
              ${p.paid ? 'Pagado ✓' : 'Pendiente ✕'}
            </button>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    splitBox.classList.add('hidden');
  }

  document.getElementById('orderDetailModal').classList.remove('hidden');
}

export function closeOrderDetailModal() {
  const m = document.getElementById('orderDetailModal');
  if (m) m.classList.add('hidden');
  currentSelectedDetailOrder = null;
}

export async function togglePersonPaid(orderId, personIdx) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order || !order.split_details) return;
  order.split_details[personIdx].paid = !order.split_details[personIdx].paid;
  openOrderDetailModal(orderId);
  if (client) await client.from('orders').update({ split_details: order.split_details }).eq('id', order.id);
}

export function printCurrentOrderTicket() {
  const printContents = document.getElementById('printableTicketArea').innerHTML;
  const printWindow = window.open('', '_blank', 'width=380,height=600');
  printWindow.document.write(`
    <html><head><title>Ticket Mesa ${currentSelectedDetailOrder?.table_number}</title>
    <style>body { font-family: monospace; font-size: 12px; margin: 20px; } .flex { display: flex; justify-content: space-between; } .border-b { border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }</style>
    </head><body>${printContents}</body></html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}