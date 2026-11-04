import { state, client } from '../state.js';
import { REST_ID } from '../config.js';
import { openOrderDetailModal } from './orders-modal.js';

export function ensureNewSupplyModal() {
  if (document.getElementById('newSupplyModal')) return;
  const modal = document.createElement('div');
  modal.id = 'newSupplyModal';
  modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-3">
      <div class="flex justify-between items-center border-b pb-2">
        <h3 class="font-bold text-sm text-stone-900">+ Nuevo Insumo</h3>
        <button onclick="window.closeNewSupplyModal()" class="text-stone-400 hover:text-stone-700 font-bold">✕</button>
      </div>
      <div class="space-y-2 text-xs">
        <div>
          <label class="block font-semibold mb-1">Nombre Insumo</label>
          <input type="text" id="supName" placeholder="Ej: Café Pluma Grano" class="w-full border rounded-xl p-2 outline-none">
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-semibold mb-1">Unidad</label>
            <select id="supUnit" class="w-full border rounded-xl p-2 bg-white">
              <option value="g">Gramos (g)</option>
              <option value="ml">Mililitros (ml)</option>
              <option value="oz">Onzas (oz)</option>
              <option value="pza">Pieza (pza)</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold mb-1">Stock Inicial</label>
            <input type="number" step="0.01" id="supStock" placeholder="1000" class="w-full border rounded-xl p-2 font-mono">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-semibold mb-1">Alerta Mínima</label>
            <input type="number" step="0.01" id="supMin" placeholder="200" class="w-full border rounded-xl p-2 font-mono">
          </div>
          <div>
            <label class="block font-semibold mb-1">Costo Unitario ($)</label>
            <input type="number" step="0.0001" id="supCost" placeholder="0.42" class="w-full border rounded-xl p-2 font-mono">
          </div>
        </div>
        <button onclick="window.saveNewSupply()" class="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-2.5 rounded-xl transition shadow-sm mt-1">
          Guardar Insumo
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export function renderInventoryTab() {
  renderSuppliesTable();
  renderProductRecipeSelect();
  renderPreparedBuffer();
  renderKitchenWasteList();
}

export function renderSuppliesTable() {
  const tbody = document.getElementById('suppliesTableBody');
  if (!tbody) return;
  let totalVal = 0, lowStock = 0;

  tbody.innerHTML = state.supplies.map(s => {
    const val = Number(s.current_stock) * Number(s.unit_cost);
    totalVal += val;
    const isLow = Number(s.current_stock) <= Number(s.min_stock_alert);
    if (isLow) lowStock++;
    return `
      <tr class="hover:bg-stone-50 text-stone-700">
        <td class="py-2.5 font-bold text-stone-900">${s.name}</td>
        <td class="py-2.5 font-mono ${isLow ? 'text-rose-600 font-black' : ''}">${s.current_stock} ${s.unit}</td>
        <td class="py-2.5 font-mono text-stone-400">${s.min_stock_alert} ${s.unit}</td>
        <td class="py-2.5 font-mono">$${Number(s.unit_cost).toFixed(4)} /${s.unit}</td>
        <td class="py-2.5 font-mono font-bold">$${val.toFixed(2)}</td>
        <td class="py-2.5"><button onclick="window.quickStockAdjust('${s.id}')" class="text-[10px] bg-stone-100 hover:bg-stone-200 border px-2 py-0.5 rounded font-bold">Ajustar</button></td>
      </tr>
    `;
  }).join('');

  const kpiVal = document.getElementById('kpiInventoryValue');
  const kpiLow = document.getElementById('kpiLowStockCount');
  if (kpiVal) kpiVal.innerText = `$${totalVal.toFixed(2)} MXN`;
  if (kpiLow) kpiLow.innerText = lowStock;
}

export function quickStockAdjust(supId) {
  const sup = state.supplies.find(s => s.id === supId);
  if (!sup) return;
  const newStock = prompt(`Ajustar stock de ${sup.name} (${sup.unit}):`, sup.current_stock);
  if (newStock !== null && !isNaN(parseFloat(newStock))) {
    sup.current_stock = parseFloat(newStock);
    renderSuppliesTable();
    if (client) client.from('supplies').update({ current_stock: sup.current_stock }).eq('id', sup.id);
  }
}

export function renderProductRecipeSelect() {
  const sel = document.getElementById('recipeProductSelect');
  const supSel = document.getElementById('newRecipeSupplySelect');
  if (sel) sel.innerHTML = state.products.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
  if (supSel) supSel.innerHTML = state.supplies.map(s => `<option value="${s.id}">${s.name} (${s.unit})</option>`).join('');
  if (state.products.length > 0 && sel) loadProductRecipe(state.products[0].id);
}

export function loadProductRecipe(prodId) {
  const cont = document.getElementById('recipeIngredientsList');
  if (!cont) return;
  const recipes = state.recipes.filter(r => r.product_id === prodId);
  if (recipes.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-4 text-center">Sin ingredientes asociados.</p>';
    return;
  }
  cont.innerHTML = recipes.map(r => {
    const sup = state.supplies.find(s => s.id === r.supply_id);
    return `<div class="flex justify-between items-center p-2 rounded-xl bg-stone-50 border text-xs"><span class="font-bold text-stone-800">${sup ? sup.name : 'Insumo'}</span><span class="font-mono">${r.quantity_per_portion} ${sup ? sup.unit : ''}</span></div>`;
  }).join('');
}

export async function addIngredientToRecipe() {
  const prodId = document.getElementById('recipeProductSelect')?.value;
  const supId = document.getElementById('newRecipeSupplySelect')?.value;
  const qty = parseFloat(document.getElementById('newRecipeQty')?.value) || 0;
  if (!prodId || !supId || qty <= 0) return;

  const newRcp = { id: 'rcp-' + Date.now(), restaurant_id: REST_ID, product_id: prodId, supply_id: supId, quantity_per_portion: qty };
  state.recipes.push(newRcp);
  loadProductRecipe(prodId);
  document.getElementById('newRecipeQty').value = '';
  if (client) await client.from('product_recipes').insert([newRcp]);
}

export function renderPreparedBuffer() {
  const cont = document.getElementById('preparedBufferList');
  const badge = document.getElementById('bufferCountBadge');
  const avail = state.buffer.filter(b => b.status === 'available');
  if (badge) badge.innerText = `${avail.length} listos`;
  if (!cont) return;

  if (avail.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-3 text-center">No hay platillos preparados en buffer.</p>';
    return;
  }
  cont.innerHTML = avail.map(b => `
    <div class="flex justify-between items-center p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs">
      <div>
        <span class="font-bold text-blue-950">${b.qty}x ${b.product_title}</span>
        ${b.order_id ? `<button onclick="window.openOrderDetailModal('${b.order_id}')" class="text-[10px] text-blue-700 underline font-mono block mt-0.5">🔗 Ver Comanda Origen</button>` : ''}
      </div>
      <span class="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded shadow-xs">Listo para servir</span>
    </div>
  `).join('');
}

export function renderKitchenWasteList() {
  const cont = document.getElementById('kitchenWasteList');
  const badge = document.getElementById('wasteCountBadge');
  if (badge) badge.innerText = `${state.waste.length} registros`;
  if (!cont) return;

  let totalLoss = state.waste.reduce((acc, w) => acc + Number(w.cost_loss || 0), 0);
  const kpiLoss = document.getElementById('kpiWasteLossTotal');
  if (kpiLoss) kpiLoss.innerText = `$${totalLoss.toFixed(2)} MXN`;

  if (state.waste.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-3 text-center">Sin mermas registradas.</p>';
    return;
  }
  cont.innerHTML = state.waste.map(w => `
    <div class="flex justify-between items-center p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs">
      <div>
        <span class="font-bold text-rose-950">${w.product_title}</span>
        <span class="text-[10px] text-stone-500 block">${w.reason || 'Descarte'}</span>
        ${w.order_id ? `<button onclick="window.openOrderDetailModal('${w.order_id}')" class="text-[10px] text-rose-700 underline font-mono block mt-0.5">🔗 Ver Comanda Origen</button>` : ''}
      </div>
      <span class="font-mono font-bold text-rose-700">-$${Number(w.cost_loss).toFixed(2)}</span>
    </div>
  `).join('');
}

export function openNewSupplyModal() {
  ensureNewSupplyModal();
  document.getElementById('newSupplyModal').classList.remove('hidden');
}

export function closeNewSupplyModal() {
  const m = document.getElementById('newSupplyModal');
  if (m) m.classList.add('hidden');
}

export async function saveNewSupply() {
  const name = document.getElementById('supName')?.value?.trim();
  const unit = document.getElementById('supUnit')?.value;
  const stock = parseFloat(document.getElementById('supStock')?.value) || 0;
  const min = parseFloat(document.getElementById('supMin')?.value) || 0;
  const cost = parseFloat(document.getElementById('supCost')?.value) || 0;
  if (!name) return;

  const newSup = { id: 'sup-' + Date.now(), restaurant_id: REST_ID, name, unit, current_stock: stock, min_stock_alert: min, unit_cost: cost };
  state.supplies.push(newSup);
  renderSuppliesTable();
  closeNewSupplyModal();
  if (client) await client.from('supplies').insert([newSup]);
}