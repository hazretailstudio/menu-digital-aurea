import { REST_ID, generateUUID, normalizeTableNumber, escapeHtml, showToast } from '../config.js';
import { state, client, dbWrite, getWaiterNames, logAudit } from '../state.js';
import { renderKanbanBoard } from './kanban.js';
import { playSoundByName } from '../audio.js';

let manualOrderItems = [];
let currentEditingOrder = null;
let currentSelectedDetailOrder = null;

// Estado temporal del configurador rápido de platillo (Modificadores + Nota + Tiempo)
let itemConfigContext = null; // 'manual' | 'edit'
let itemConfigProduct = null;
let itemConfigSelectedMods = new Set();

export function ensureOrderModals() {
  // MODAL 1: NUEVO PEDIDO MANUAL
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
            <input type="text" id="manualOrderTable" list="tablesDatalist" placeholder="01" class="w-full border rounded-xl p-2.5 font-bold outline-none focus:border-amber-600">
            <datalist id="tablesDatalist"></datalist>
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">Mesero / Atiende:</label>
            <select id="manualOrderWaiter" class="w-full border rounded-xl p-2.5 bg-stone-50 font-semibold outline-none focus:border-amber-600"></select>
          </div>
        </div>
        <div class="border border-stone-200 bg-stone-50 rounded-2xl p-3.5 space-y-2">
          <label class="block text-xs font-bold text-stone-800">Buscar Platillo (con modificadores, nota y tiempo):</label>
          <div class="relative">
            <input type="text" id="manualProdSearchInput" oninput="window.filterManualProductDropdown(this.value)" onfocus="window.filterManualProductDropdown(this.value)" placeholder="Escribe el nombre o haz clic para ver carta..." class="w-full border rounded-xl p-2.5 text-xs bg-white outline-none focus:border-amber-600">
            <div id="manualProdDropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-xl max-h-52 overflow-y-auto z-30 divide-y text-xs"></div>
          </div>
        </div>
        <div class="space-y-2">
          <label class="block text-xs font-bold uppercase tracking-wider text-stone-600">Platillos en Comanda:</label>
          <div id="manualOrderItemsList" class="space-y-2 max-h-52 overflow-y-auto pr-1"></div>
        </div>
        <div>
          <label class="block font-bold text-xs text-stone-700 mb-1">Notas generales de mesa:</label>
          <textarea id="manualOrderNotes" rows="2" placeholder="Ej: Cumpleaños, traer cubiertos extra..." class="w-full border rounded-xl p-2.5 text-xs outline-none bg-stone-50"></textarea>
        </div>
        <div class="border-t pt-3 flex justify-between items-center">
          <div>
            <span class="text-xs text-stone-400 block font-medium">Total:</span>
            <span class="text-xl font-black font-mono text-stone-900" id="manualOrderTotalDisplay">$0.00 MXN</span>
          </div>
          <button onclick="window.submitManualOrder()" class="bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition shadow-md">
            Crear y Enviar a Cocina 🛎️
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(m1);
  }

  // MODAL 2: EDITAR COMANDA
  if (!document.getElementById('editOrderModal')) {
    const m2 = document.createElement('div');
    m2.id = 'editOrderModal';
    m2.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
    m2.innerHTML = `
      <div class="bg-white w-full max-w-xl rounded-3xl max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl p-6 space-y-4">
        <div class="flex justify-between items-center border-b pb-3">
          <h3 class="font-bold text-base text-stone-900 flex items-center gap-2">
            <span>✏️ Editar Comanda</span>
            <span id="modalOrderTableBadge" class="bg-amber-100 text-amber-900 font-black text-xs px-2.5 py-0.5 rounded-lg font-mono">Mesa --</span>
          </h3>
          <button onclick="window.closeEditOrderModal()" class="text-stone-400 hover:text-stone-700 font-bold text-lg p-1">✕</button>
        </div>
        <input type="hidden" id="modalOrderId">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label class="block font-bold text-stone-700 mb-1">Cambiar Mesa #:</label>
            <input type="text" id="modalOrderTableInput" list="tablesDatalist" class="w-full border rounded-xl p-2.5 bg-amber-50 font-black text-stone-900 outline-none focus:border-amber-600">
          </div>
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
            <input type="text" id="editProdSearchInput" oninput="window.filterEditProductDropdown(this.value)" onfocus="window.filterEditProductDropdown(this.value)" placeholder="Buscar platillo..." class="w-full border rounded-xl p-2 bg-white outline-none">
            <div id="editProdDropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-30 divide-y text-xs"></div>
          </div>
        </div>
        <div class="space-y-2">
          <h4 class="font-bold text-xs uppercase tracking-wider text-stone-700">Platillos en Comanda:</h4>
          <div id="modalOrderItemsContainer" class="space-y-2 max-h-60 overflow-y-auto pr-1"></div>
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

  // MODAL 3: DETALLE / TICKET CLIENTE / COMANDA COCINA
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
              <span>Descuento:</span>
              <span id="ticketDiscount">-$0.00</span>
            </div>
            <div class="flex justify-between text-blue-800 font-bold hidden" id="ticketTipRow">
              <span>Propina:</span>
              <span id="ticketTip">$0.00</span>
            </div>
            <div class="flex justify-between text-sm font-black border-t pt-1 text-stone-900">
              <span>TOTAL:</span>
              <span id="ticketTotal">$0.00 MXN</span>
            </div>
            <div id="ticketPaymentInfo" class="hidden text-[10px] text-stone-500 pt-1 text-center"></div>
          </div>
          <div id="ticketSplitStatusBox" class="hidden border-t border-dashed border-stone-300 pt-2 space-y-1"></div>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-2 border-t text-xs font-bold">
          <button onclick="window.printKitchenChit()" class="bg-orange-600 hover:bg-orange-500 text-white py-2.5 rounded-xl transition flex items-center justify-center gap-1 shadow-sm">
            <span>🍳 Comanda Cocina</span>
          </button>
          <button onclick="window.printCurrentOrderTicket()" class="bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-xl transition flex items-center justify-center gap-1 shadow-sm">
            <span>🖨️ Ticket Cliente</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(m3);
  }

  // MODAL 4: CONFIGURADOR RÁPIDO DE PLATILLO (MODIFICADORES, CANTIDAD, TIEMPO, NOTA INDIVIDUAL)
  if (!document.getElementById('itemQuickConfigModal')) {
    const m4 = document.createElement('div');
    m4.id = 'itemQuickConfigModal';
    m4.className = 'fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
    m4.innerHTML = `
      <div class="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4">
        <div class="flex justify-between items-start border-b pb-2.5">
          <div>
            <h4 id="iqTitle" class="font-extrabold text-sm text-stone-900">Platillo</h4>
            <span id="iqBasePrice" class="text-xs font-mono font-bold text-amber-800">$0.00</span>
          </div>
          <button onclick="window.closeItemQuickConfig()" class="text-stone-400 hover:text-stone-700 font-bold">✕</button>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label class="block font-bold text-stone-700 mb-1">Cantidad:</label>
            <input type="number" id="iqQty" value="1" min="1" max="50" class="w-full border rounded-xl p-2 font-mono font-black text-center bg-stone-50">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">Tiempo de Servicio:</label>
            <select id="iqCourse" class="w-full border rounded-xl p-2 bg-stone-50 font-bold">
              <option value="1">1er Tiempo (Inmediato)</option>
              <option value="2">2do Tiempo (En espera)</option>
              <option value="3">3er Tiempo / Postre</option>
            </select>
          </div>
        </div>

        <div id="iqModifiersBox" class="space-y-1.5 text-xs">
          <label class="block font-bold text-stone-700">Modificadores / Extras:</label>
          <div id="iqModifiersList" class="space-y-1.5 max-h-36 overflow-y-auto pr-1"></div>
        </div>

        <div class="text-xs">
          <label class="block font-bold text-stone-700 mb-1">Nota individual para este platillo:</label>
          <input type="text" id="iqNote" placeholder="Ej: Término 3/4, sin cebolla, muy caliente..." class="w-full border rounded-xl p-2 bg-stone-50 outline-none focus:border-amber-600">
        </div>

        <button onclick="window.confirmItemQuickConfig()" class="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl text-xs shadow-md transition">
          Agregar a la Comanda ✓
        </button>
      </div>
    `;
    document.body.appendChild(m4);
  }
}

function populateTablesDatalist() {
  const dl = document.getElementById('tablesDatalist');
  if (!dl) return;
  dl.innerHTML = state.tables.map(t => `<option value="${escapeHtml(t.table_number)}">Mesa ${escapeHtml(t.table_number)} - ${escapeHtml(t.zone)}</option>`).join('');
}

// ABRIR CONFIGURADOR DE PLATILLO
export function openItemQuickConfig(prodId, context) {
  ensureOrderModals();
  const prod = state.products.find(p => p.id === prodId);
  if (!prod) return;
  if (prod.is_available === false) {
    showToast(`"${prod.title}" está marcado como Agotado (86).`, 'warning');
    return;
  }

  itemConfigContext = context;
  itemConfigProduct = prod;
  itemConfigSelectedMods = new Set();

  document.getElementById('iqTitle').innerText = prod.title;
  document.getElementById('iqBasePrice').innerText = `$${Number(prod.price).toFixed(2)} • ${prod.station || 'cocina'}`;
  document.getElementById('iqQty').value = '1';
  document.getElementById('iqCourse').value = '1';
  document.getElementById('iqNote').value = '';

  const mods = state.modifiers.filter(m => !m.applies_to_products || m.applies_to_products.length === 0 || m.applies_to_products.includes(prod.id));
  const box = document.getElementById('iqModifiersBox');
  const list = document.getElementById('iqModifiersList');
  if (mods.length > 0) {
    box.classList.remove('hidden');
    list.innerHTML = mods.map(m => `
      <label class="flex justify-between items-center p-2 rounded-xl border bg-stone-50 cursor-pointer">
        <span class="flex items-center gap-2 font-semibold text-stone-800">
          <input type="checkbox" onchange="window.toggleQuickConfigMod('${m.id}')" class="accent-amber-600">
          ${escapeHtml(m.name)}
        </span>
        <span class="font-mono text-amber-800 font-bold">${Number(m.price) > 0 ? `+$${Number(m.price).toFixed(2)}` : '$0'}</span>
      </label>
    `).join('');
  } else {
    box.classList.add('hidden');
  }

  document.getElementById('itemQuickConfigModal').classList.remove('hidden');
}

export function toggleQuickConfigMod(modId) {
  if (itemConfigSelectedMods.has(modId)) itemConfigSelectedMods.delete(modId);
  else itemConfigSelectedMods.add(modId);
}

export function closeItemQuickConfig() {
  const m = document.getElementById('itemQuickConfigModal');
  if (m) m.classList.add('hidden');
  itemConfigProduct = null;
}

export function confirmItemQuickConfig() {
  if (!itemConfigProduct) return;
  const qty = Math.max(1, parseInt(document.getElementById('iqQty')?.value) || 1);
  const course = parseInt(document.getElementById('iqCourse')?.value) || 1;
  const note = document.getElementById('iqNote')?.value?.trim() || '';

  const chosenMods = Array.from(itemConfigSelectedMods).map(id => {
    const m = state.modifiers.find(x => x.id === id);
    return m ? { id: m.id, name: m.name, price: Number(m.price || 0) } : null;
  }).filter(Boolean);
  const extraPrice = chosenMods.reduce((a, m) => a + m.price, 0);

  const builtItem = {
    id: itemConfigProduct.id,
    title: itemConfigProduct.title,
    base_price: Number(itemConfigProduct.price),
    price: Number(itemConfigProduct.price) + extraPrice,
    qty,
    station: itemConfigProduct.station || 'cocina',
    course,
    modifiers: chosenMods,
    note,
    done: false,
    inventory_deducted: false
  };

  if (itemConfigContext === 'manual') {
    manualOrderItems.push(builtItem);
    renderManualOrderItems();
  } else if (itemConfigContext === 'edit' && currentEditingOrder) {
    currentEditingOrder.items.unshift({ ...builtItem, is_new: true });
    renderEditOrderItems();
  }
  closeItemQuickConfig();
}

// NUEVO PEDIDO MANUAL
export function openNewOrderModal(presetTable = '') {
  ensureOrderModals();
  populateTablesDatalist();
  manualOrderItems = [];
  document.getElementById('manualOrderChannel').value = 'dine_in';
  document.getElementById('manualOrderTable').value = presetTable ? normalizeTableNumber(presetTable) : '';
  document.getElementById('manualOrderNotes').value = '';
  document.getElementById('manualProdSearchInput').value = '';
  document.getElementById('manualProdDropdown').classList.add('hidden');

  const waiters = getWaiterNames();
  const activeName = state.activeStaff?.name;
  const waiterSelect = document.getElementById('manualOrderWaiter');
  waiterSelect.innerHTML = waiters.map(w => `<option value="${escapeHtml(w)}" ${w === activeName ? 'selected' : ''}>${escapeHtml(w)}</option>`).join('');

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
  if (channel === 'dine_in') { tableLabel.innerText = 'Mesa #:'; tableInput.value = ''; tableInput.placeholder = '01'; }
  else if (channel === 'takeout') { tableLabel.innerText = 'Etiqueta:'; tableInput.value = 'Para Llevar'; }
  else { tableLabel.innerText = 'Folio App:'; tableInput.value = ''; tableInput.placeholder = 'Ej: #A92'; }
}

export function filterManualProductDropdown(query) {
  const q = (query || '').toLowerCase().trim();
  const drop = document.getElementById('manualProdDropdown');
  const matches = q ? state.products.filter(p => p.title.toLowerCase().includes(q)) : state.products.slice(0, 15);
  drop.classList.remove('hidden');
  if (matches.length === 0) {
    drop.innerHTML = '<div class="p-3 text-center text-stone-400">Sin resultados</div>';
    return;
  }
  drop.innerHTML = matches.map(p => {
    const img = (p.media && p.media[0]) ? p.media[0].url : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80';
    const soldOut = p.is_available === false;
    return `
      <div onclick="window.selectProductToAddManual('${p.id}')" class="p-2 flex items-center justify-between gap-2 text-xs ${soldOut ? 'opacity-50 bg-rose-50 cursor-not-allowed' : 'hover:bg-amber-50 cursor-pointer'}">
        <div class="flex items-center gap-2">
          <img src="${img}" class="w-8 h-8 rounded-lg object-cover bg-stone-200">
          <div>
            <span class="font-bold text-stone-900 block">${escapeHtml(p.title)}</span>
            <span class="text-[10px] text-stone-400">${soldOut ? '🚫 AGOTADO (86)' : escapeHtml(p.station || 'cocina')}</span>
          </div>
        </div>
        <span class="font-bold font-mono text-amber-700">$${Number(p.price).toFixed(2)}</span>
      </div>
    `;
  }).join('');
}

export function selectProductToAddManual(prodId) {
  document.getElementById('manualProdDropdown').classList.add('hidden');
  document.getElementById('manualProdSearchInput').value = '';
  openItemQuickConfig(prodId, 'manual');
}

export function changeManualItemQty(idx, delta) {
  if (!manualOrderItems[idx]) return;
  manualOrderItems[idx].qty += delta;
  if (manualOrderItems[idx].qty <= 0) manualOrderItems.splice(idx, 1);
  renderManualOrderItems();
}

export function renderManualOrderItems() {
  const cont = document.getElementById('manualOrderItemsList');
  if (manualOrderItems.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-3 text-center">Sin platillos agregados aún.</p>';
    document.getElementById('manualOrderTotalDisplay').innerText = '$0.00 MXN';
    return;
  }
  cont.innerHTML = manualOrderItems.map((it, idx) => {
    const modsTxt = (it.modifiers || []).map(m => m.name).join(', ');
    return `
      <div class="flex justify-between items-center p-2.5 rounded-xl bg-stone-50 border text-xs gap-2">
        <div class="min-w-0">
          <span class="font-bold text-stone-900">${escapeHtml(it.title)}</span>
          ${it.course > 1 ? `<span class="ml-1 text-[10px] bg-orange-100 text-orange-800 px-1.5 rounded font-bold">${it.course}º T</span>` : ''}
          ${modsTxt ? `<span class="block text-[10px] text-amber-800">+ ${escapeHtml(modsTxt)}</span>` : ''}
          ${it.note ? `<span class="block text-[10px] text-rose-700 italic">"${escapeHtml(it.note)}"</span>` : ''}
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button onclick="window.changeManualItemQty(${idx}, -1)" class="w-6 h-6 rounded-lg bg-white border font-bold">−</button>
          <span class="font-mono font-bold w-4 text-center">${it.qty}</span>
          <button onclick="window.changeManualItemQty(${idx}, 1)" class="w-6 h-6 rounded-lg bg-white border font-bold">+</button>
          <span class="font-mono font-bold w-14 text-right">$${(it.price * it.qty).toFixed(2)}</span>
          <button onclick="window.removeManualOrderItem(${idx})" class="text-rose-600 font-bold px-1">✕</button>
        </div>
      </div>
    `;
  }).join('');
  const total = manualOrderItems.reduce((acc, it) => acc + (it.price * it.qty), 0);
  document.getElementById('manualOrderTotalDisplay').innerText = `$${total.toFixed(2)} MXN`;
}

export function removeManualOrderItem(idx) {
  manualOrderItems.splice(idx, 1);
  renderManualOrderItems();
}

export async function submitManualOrder() {
  if (manualOrderItems.length === 0) {
    showToast('Agrega al menos un platillo.', 'warning');
    return;
  }
  const channel = document.getElementById('manualOrderChannel').value;
  let tableNum = document.getElementById('manualOrderTable').value.trim() || '01';
  if (channel === 'dine_in') tableNum = normalizeTableNumber(tableNum);

  if (channel === 'dine_in') {
    const activeExisting = state.orders.find(o =>
      !o.is_archived &&
      (!o.order_channel || o.order_channel === 'dine_in') &&
      normalizeTableNumber(o.table_number) === tableNum &&
      o.status !== 'paid' && o.status !== 'cancelled'
    );
    if (activeExisting) {
      const unite = confirm(`La Mesa ${tableNum} ya tiene una comanda activa (#${activeExisting.id.substring(0, 4)}).

• [Aceptar]: Unificar y enviar lo nuevo a cocina.
• [Cancelar]: Crear cuenta separada (${tableNum}-B).`);
      if (unite) {
        manualOrderItems.forEach(it => activeExisting.items.unshift({ ...it, is_new: true, inventory_deducted: false }));
        activeExisting.has_new_additions = true;
        if (activeExisting.status === 'delivered') activeExisting.status = 'preparing';
        activeExisting.kitchen_cycle_started_at = new Date().toISOString();
        activeExisting.subtotal = activeExisting.items.reduce((acc, i) => acc + (Number(i.price) * Number(i.qty)), 0);
        activeExisting.total = Math.max(0, activeExisting.subtotal - Number(activeExisting.discount || 0));

        const { error } = await dbWrite(
          client.from('orders').update({
            items: activeExisting.items,
            has_new_additions: true,
            status: activeExisting.status,
            kitchen_cycle_started_at: activeExisting.kitchen_cycle_started_at,
            subtotal: activeExisting.subtotal,
            total: activeExisting.total
          }).eq('id', activeExisting.id),
          'unificar adición a mesa'
        );
        if (error) return;
        renderKanbanBoard();
        if (window.renderTablesFloorPlan) window.renderTablesFloorPlan();
        closeNewOrderModal();
        showToast(`Platillos agregados a Mesa ${tableNum} ✓`, 'success');
        return;
      } else {
        tableNum = `${tableNum}-B`;
      }
    }
  }

  const total = manualOrderItems.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const newOrder = {
    id: generateUUID(),
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
    active_course: 1,
    customer_notes: document.getElementById('manualOrderNotes').value.trim(),
    created_at: new Date().toISOString()
  };

  const { error } = await dbWrite(client.from('orders').insert([newOrder]), 'crear pedido manual');
  if (error) return;

  const firstCol = state.customStatusConfig[0];
  if (firstCol?.sound_in) playSoundByName(firstCol.sound_in);

  state.orders.unshift(newOrder);
  if (channel === 'dine_in') {
    const tbl = state.tables.find(t => normalizeTableNumber(t.table_number) === tableNum);
    if (tbl?.id) {
      tbl.status = 'occupied';
      await client.from('tables').update({ status: 'occupied' }).eq('id', tbl.id);
    }
  }

  renderKanbanBoard();
  if (window.renderTablesFloorPlan) window.renderTablesFloorPlan();
  closeNewOrderModal();
  showToast(`Comanda Mesa ${tableNum} enviada a cocina ✓`, 'success');
}

// EDITAR COMANDA
export function openEditOrderModal(orderId) {
  ensureOrderModals();
  populateTablesDatalist();
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  currentEditingOrder = order;

  document.getElementById('modalOrderId').value = order.id;
  document.getElementById('modalOrderTableBadge').innerText = `Mesa ${order.table_number}`;
  document.getElementById('modalOrderTableInput').value = order.table_number;
  document.getElementById('modalOrderNotes').value = order.customer_notes || '';
  document.getElementById('editProdSearchInput').value = '';
  document.getElementById('editProdDropdown').classList.add('hidden');

  const waiters = getWaiterNames();
  const waiterSelect = document.getElementById('modalOrderWaiter');
  waiterSelect.innerHTML = waiters.map(w => `<option value="${escapeHtml(w)}" ${order.waiter_name === w ? 'selected' : ''}>${escapeHtml(w)}</option>`).join('');

  const statusSelect = document.getElementById('modalOrderStatus');
  statusSelect.innerHTML = state.customStatusConfig.map(s => `<option value="${s.id}" ${order.status === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

  renderEditOrderItems();
  document.getElementById('editOrderModal').classList.remove('hidden');
}

export function closeEditOrderModal() {
  const m = document.getElementById('editOrderModal');
  if (m) m.classList.add('hidden');
  currentEditingOrder = null;
}

export function filterEditProductDropdown(query) {
  const q = (query || '').toLowerCase().trim();
  const drop = document.getElementById('editProdDropdown');
  const matches = q ? state.products.filter(p => p.title.toLowerCase().includes(q)) : state.products.slice(0, 12);
  drop.classList.remove('hidden');
  drop.innerHTML = matches.map(p => `
    <div onclick="window.selectProductToAddEdit('${p.id}')" class="p-2 flex justify-between text-xs ${p.is_available === false ? 'opacity-50 bg-rose-50' : 'hover:bg-amber-50 cursor-pointer'}">
      <span>${escapeHtml(p.title)} ${p.is_available === false ? '(86)' : ''}</span>
      <span class="font-mono font-bold">$${Number(p.price).toFixed(2)}</span>
    </div>
  `).join('');
}

export function selectProductToAddEdit(prodId) {
  document.getElementById('editProdDropdown').classList.add('hidden');
  document.getElementById('editProdSearchInput').value = '';
  openItemQuickConfig(prodId, 'edit');
}

export function changeEditItemQty(idx, delta) {
  if (!currentEditingOrder || !currentEditingOrder.items[idx]) return;
  currentEditingOrder.items[idx].qty += delta;
  if (currentEditingOrder.items[idx].qty <= 0) currentEditingOrder.items.splice(idx, 1);
  renderEditOrderItems();
}

export function renderEditOrderItems() {
  const cont = document.getElementById('modalOrderItemsContainer');
  const items = currentEditingOrder?.items || [];
  cont.innerHTML = items.map((it, idx) => {
    const modsTxt = (it.modifiers || []).map(m => m.name).join(', ');
    return `
      <div class="flex justify-between items-center p-2.5 rounded-xl bg-stone-50 border text-xs gap-2">
        <div class="min-w-0">
          <span class="font-bold text-stone-900">${escapeHtml(it.title)}</span>
          ${it.is_new ? '<b class="text-amber-700 text-[10px] ml-1">(NUEVO)</b>' : ''}
          ${modsTxt ? `<span class="block text-[10px] text-amber-800">+ ${escapeHtml(modsTxt)}</span>` : ''}
          ${it.note ? `<span class="block text-[10px] text-rose-700 italic">"${escapeHtml(it.note)}"</span>` : ''}
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button onclick="window.changeEditItemQty(${idx}, -1)" class="w-6 h-6 rounded-lg bg-white border font-bold">−</button>
          <span class="font-mono font-bold w-4 text-center">${it.qty}</span>
          <button onclick="window.changeEditItemQty(${idx}, 1)" class="w-6 h-6 rounded-lg bg-white border font-bold">+</button>
          <span class="font-mono font-bold w-14 text-right">$${(it.price * it.qty).toFixed(2)}</span>
          <button onclick="window.removeEditOrderItem(${idx})" class="text-rose-600 font-bold px-1">✕</button>
        </div>
      </div>
    `;
  }).join('');
  const sub = items.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
  const total = Math.max(0, sub - Number(currentEditingOrder?.discount || 0));
  document.getElementById('modalOrderTotalDisplay').innerText = `$${total.toFixed(2)} MXN`;
}

export function removeEditOrderItem(idx) {
  if (!currentEditingOrder) return;
  currentEditingOrder.items.splice(idx, 1);
  renderEditOrderItems();
}

export async function saveOrderEditsWithConfirm() {
  if (!currentEditingOrder) return;
  const oldTable = currentEditingOrder.table_number;
  let newTable = document.getElementById('modalOrderTableInput')?.value?.trim() || oldTable;
  if (!currentEditingOrder.order_channel || currentEditingOrder.order_channel === 'dine_in') {
    newTable = normalizeTableNumber(newTable);
  }

  const waiter = document.getElementById('modalOrderWaiter').value;
  let status = document.getElementById('modalOrderStatus').value;
  const notes = document.getElementById('modalOrderNotes').value.trim();
  const subtotal = currentEditingOrder.items.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
  const total = Math.max(0, subtotal - Number(currentEditingOrder.discount || 0));

  if (currentEditingOrder.status === 'delivered' && currentEditingOrder.items.some(i => i.is_new)) {
    if (confirm("Se añadieron productos nuevos a una mesa servida. ¿Regresar comanda a 'En Preparación' en cocina?")) {
      status = 'preparing';
      currentEditingOrder.kitchen_cycle_started_at = new Date().toISOString();
      currentEditingOrder.has_new_additions = true;
    }
  }

  const notesChanged = (currentEditingOrder.customer_notes || '') !== notes;
  const { error } = await dbWrite(
    client.from('orders').update({
      table_number: newTable,
      items: currentEditingOrder.items,
      waiter_name: waiter,
      status,
      customer_notes: notes,
      notes_updated: notesChanged ? true : currentEditingOrder.notes_updated,
      subtotal,
      total,
      has_new_additions: currentEditingOrder.has_new_additions,
      kitchen_cycle_started_at: currentEditingOrder.kitchen_cycle_started_at
    }).eq('id', currentEditingOrder.id),
    'guardar edición de comanda'
  );
  if (error) return;

  currentEditingOrder.table_number = newTable;
  currentEditingOrder.waiter_name = waiter;
  currentEditingOrder.status = status;
  currentEditingOrder.customer_notes = notes;
  currentEditingOrder.subtotal = subtotal;
  currentEditingOrder.total = total;

  if (oldTable !== newTable) {
    await logAudit('edit_change_table', { order_id: currentEditingOrder.id, from: oldTable, to: newTable });
  }

  renderKanbanBoard();
  if (window.renderTablesFloorPlan) window.renderTablesFloorPlan();
  closeEditOrderModal();
  showToast('Comanda actualizada ✓', 'success');
}

// DETALLE / TICKET / COMANDA COCINA
export function openOrderDetailModal(orderId) {
  ensureOrderModals();
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  currentSelectedDetailOrder = order;

  document.getElementById('detailTableNum').innerText = `Mesa ${order.table_number}`;
  document.getElementById('detailOrderId').innerText = `#${(order.id || '').substring(0, 6).toUpperCase()}`;
  document.getElementById('ticketDateTime').innerText = new Date(order.created_at).toLocaleString();
  document.getElementById('ticketWaiter').innerText = `Mesero: ${order.waiter_name || 'Sin asignar'}`;
  document.getElementById('ticketChannelBadge').innerText = order.order_channel === 'takeout' ? 'Para Llevar' : (['rappi', 'didi', 'ubereats'].includes(order.order_channel) ? order.order_channel.toUpperCase() : 'En Mesa');

  const items = Array.isArray(order.items) ? order.items : [];
  document.getElementById('ticketItemsContainer').innerHTML = items.map(it => {
    const modsTxt = (it.modifiers || []).map(m => m.name).join(', ');
    return `
      <div class="space-y-0.5">
        <div class="flex justify-between items-start">
          <span>${it.qty}x ${escapeHtml(it.title)}</span>
          <span class="font-bold">$${(Number(it.price) * Number(it.qty)).toFixed(2)}</span>
        </div>
        ${modsTxt ? `<div class="text-[10px] text-stone-500 pl-3">+ ${escapeHtml(modsTxt)}</div>` : ''}
        ${it.note ? `<div class="text-[10px] text-stone-500 pl-3 italic">"${escapeHtml(it.note)}"</div>` : ''}
      </div>
    `;
  }).join('');

  document.getElementById('ticketSubtotal').innerText = `$${Number(order.subtotal || order.total).toFixed(2)}`;
  const disc = Number(order.discount || 0);
  document.getElementById('ticketDiscountRow').classList.toggle('hidden', disc <= 0);
  document.getElementById('ticketDiscount').innerText = `-$${disc.toFixed(2)}`;

  const tip = Number(order.tip_amount || 0);
  document.getElementById('ticketTipRow').classList.toggle('hidden', tip <= 0);
  document.getElementById('ticketTip').innerText = `$${tip.toFixed(2)}`;

  document.getElementById('ticketTotal').innerText = `$${(Number(order.total || 0) + tip).toFixed(2)} MXN`;

  const payInfo = document.getElementById('ticketPaymentInfo');
  if (order.payment_method) {
    payInfo.classList.remove('hidden');
    payInfo.innerText = `Pagado vía: ${order.payment_method.toUpperCase()}`;
  } else {
    payInfo.classList.add('hidden');
  }

  const splitBox = document.getElementById('ticketSplitStatusBox');
  if (order.split_type && order.split_type !== 'single' && Array.isArray(order.split_details) && order.split_details.length > 0) {
    splitBox.classList.remove('hidden');
    splitBox.innerHTML = `
      <div class="space-y-1">
        <span class="font-bold text-[11px] text-amber-900 block">👥 Cuenta Dividida:</span>
        ${order.split_details.map((p, idx) => `
          <div class="flex justify-between items-center text-[10px] bg-white p-1 rounded border">
            <span>${escapeHtml(p.name)}: $${Number(p.amount).toFixed(2)}</span>
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
  await dbWrite(client.from('orders').update({ split_details: order.split_details }).eq('id', order.id), 'actualizar pago parcial');
}

export function printCurrentOrderTicket() {
  const printContents = document.getElementById('printableTicketArea').innerHTML;
  const printWindow = window.open('', '_blank', 'width=380,height=650');
  if (!printWindow) return;
  printWindow.document.write(`
    <html><head><title>Ticket Mesa ${currentSelectedDetailOrder?.table_number}</title>
    <style>
      body { font-family: monospace; font-size: 12px; margin: 16px; color: #000; }
      .flex { display: flex; justify-content: space-between; }
      .border-b, .border-t { border-color: #000; border-style: dashed; padding: 6px 0; }
      .text-center { text-align: center; }
      .font-bold, .font-black { font-weight: bold; }
      .hidden { display: none; }
    </style>
    </head><body>${printContents}<p style="text-align:center;margin-top:16px;">¡Gracias por su visita!</p></body></html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

/**
 * Formato térmico especial para COMANDA DE COCINA / BARRA (sin precios, letra grande, resaltando adiciones y notas)
 */
export function printKitchenChit() {
  const order = currentSelectedDetailOrder;
  if (!order) return;
  const items = Array.isArray(order.items) ? order.items : [];
  const w = window.open('', '_blank', 'width=380,height=650');
  if (!w) return;
  w.document.write(`
    <html><head><title>COMANDA MESA ${escapeHtml(order.table_number)}</title>
    <style>
      body { font-family: monospace; margin: 14px; color: #000; }
      h1 { font-size: 22px; margin: 0; text-align: center; }
      .meta { font-size: 13px; text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 10px; }
      .item { font-size: 16px; font-weight: bold; margin: 8px 0; padding-bottom: 6px; border-bottom: 1px dotted #666; }
      .mod { font-size: 14px; font-weight: normal; margin-left: 14px; }
      .note { font-size: 14px; background: #000; color: #fff; padding: 2px 6px; display: inline-block; margin-top: 4px; }
      .badge { font-size: 11px; border: 1px solid #000; padding: 1px 4px; margin-left: 6px; }
    </style>
    </head><body>
      <h1>*** COMANDA COCINA ***</h1>
      <div class="meta">
        <strong>MESA: ${escapeHtml(order.table_number)}</strong> | #${(order.id || '').substring(0, 6).toUpperCase()}<br>
        Mesero: ${escapeHtml(order.waiter_name || 'N/A')} | ${new Date().toLocaleTimeString()}
      </div>
      ${items.map(it => `
        <div class="item">
          ${it.qty}x ${escapeHtml(it.title)}
          <span class="badge">${escapeHtml((it.station || 'cocina').toUpperCase())}</span>
          ${it.course > 1 ? `<span class="badge">${it.course}º TIEMPO</span>` : ''}
          ${it.is_new ? '<span class="badge">*** NUEVO ***</span>' : ''}
          ${(it.modifiers || []).map(m => `<div class="mod">+ ${escapeHtml(m.name)}</div>`).join('')}
          ${it.note ? `<div><span class="note">NOTA: ${escapeHtml(it.note)}</span></div>` : ''}
        </div>
      `).join('')}
      ${order.customer_notes ? `<div style="margin-top:12px;border:2px solid #000;padding:8px;font-size:14px;"><strong>NOTA GENERAL:</strong> ${escapeHtml(order.customer_notes)}</div>` : ''}
    </body></html>
  `);
  w.document.close();
  w.focus();
  w.print();
  w.close();
}
