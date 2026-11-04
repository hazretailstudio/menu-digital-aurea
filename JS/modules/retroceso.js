import { state, client } from '../state.js';
import { REST_ID } from '../config.js';
import { renderKanbanBoard } from './kanban.js';

let retrocesoOrderId = null;
let retrocesoInventoryChoice = null;
let retrocesoPreparedDest = null;

export function ensureRetrocesoModal() {
  if (document.getElementById('retrocesoModal')) return;
  const modal = document.createElement('div');
  modal.id = 'retrocesoModal';
  modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
      <div class="flex items-center gap-2 border-b pb-3">
        <span class="text-xl">⚠️</span>
        <div>
          <h3 class="font-bold text-base text-stone-900">Control de Insumos y Destino</h3>
          <p class="text-[11px] text-stone-500" id="retrocesoModalSub">Mesa --</p>
        </div>
      </div>
      <div id="retrocesoStep1" class="space-y-3">
        <label class="block text-xs font-bold text-stone-800">1. ¿El platillo ya se había preparado / cocinado?</label>
        <div class="grid grid-cols-2 gap-2 text-xs font-bold">
          <button id="btnRetroNoPrep" onclick="window.handleRetrocesoInventoryChoice('no_prepared')" class="p-3 border rounded-xl text-left transition space-y-1 bg-white">
            <span class="block text-emerald-700 font-bold">❌ Aún no se preparó</span>
            <span class="text-[10px] font-normal text-stone-500 block">Reincorporar 100% de insumos al almacén.</span>
          </button>
          <button id="btnRetroPrep" onclick="window.handleRetrocesoInventoryChoice('prepared')" class="p-3 border rounded-xl text-left transition space-y-1 bg-white">
            <span class="block text-amber-800 font-bold">🍳 Sí, ya está listo</span>
            <span class="text-[10px] font-normal text-stone-500 block">Decidir si se revende o es merma.</span>
          </button>
        </div>
      </div>
      <div id="retrocesoStep1Sub" class="hidden space-y-2 border-t pt-3">
        <label class="block text-xs font-bold text-stone-800">Destino del platillo preparado:</label>
        <div class="grid grid-cols-2 gap-2 text-xs font-bold">
          <button id="btnRetroBuffer" onclick="window.setRetrocesoPreparedDestination('buffer_resell')" class="p-3 border rounded-xl text-left transition bg-white">
            <span class="block text-blue-700 font-bold">🥪 Es Revendible</span>
            <span class="text-[10px] font-normal text-stone-500 block">Enviar a buffer para próximo cliente.</span>
          </button>
          <button id="btnRetroWaste" onclick="window.setRetrocesoPreparedDestination('waste_loss')" class="p-3 border rounded-xl text-left transition bg-white">
            <span class="block text-rose-700 font-bold">🗑️ Es Merma</span>
            <span class="text-[10px] font-normal text-stone-500 block">Registrar como pérdida financiera.</span>
          </button>
        </div>
      </div>
      <div id="retrocesoStep2" class="hidden space-y-3 border-t pt-3">
        <label class="block text-xs font-bold text-stone-800">2. ¿Qué deseas hacer con la comanda en el KDS?</label>
        <div class="grid grid-cols-2 gap-2 text-xs font-bold">
          <button onclick="window.finalizeRetrocesoOrderAction('return_flow')" class="p-3 border rounded-xl hover:bg-stone-100 text-stone-700 text-left transition space-y-1">
            <span class="block text-stone-900 font-bold">🔄 Regresar a Recibida</span>
            <span class="text-[10px] font-normal text-stone-500 block">La comanda continúa viva en cocina.</span>
          </button>
          <button onclick="window.finalizeRetrocesoOrderAction('delete_order')" class="p-3 border border-rose-200 hover:bg-rose-50 text-rose-800 text-left transition space-y-1">
            <span class="block text-rose-700 font-bold">🚫 Eliminar Comanda</span>
            <span class="text-[10px] font-normal text-stone-500 block">Archivar como Cancelada en historial.</span>
          </button>
        </div>
      </div>
      <div class="flex justify-end pt-2 border-t">
        <button onclick="window.closeRetrocesoModal()" class="text-xs font-bold text-stone-500 hover:text-stone-800 px-4 py-2">
          Cancelar Acción
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export function requestRetrocesoOrder(orderId) {
  ensureRetrocesoModal();
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  retrocesoOrderId = orderId;
  retrocesoInventoryChoice = null;
  retrocesoPreparedDest = null;

  ['btnRetroNoPrep', 'btnRetroPrep', 'btnRetroBuffer', 'btnRetroWaste'].forEach(b => {
    const el = document.getElementById(b);
    if (el) el.className = 'p-3 border rounded-xl text-left transition space-y-1 bg-white';
  });

  if (order.status === 'preparing') {
    document.getElementById('retrocesoModalSub').innerText = `Mesa ${order.table_number}`;
    document.getElementById('retrocesoStep1').classList.remove('hidden');
    document.getElementById('retrocesoStep1Sub').classList.add('hidden');
    document.getElementById('retrocesoStep2').classList.add('hidden');
    document.getElementById('retrocesoModal').classList.remove('hidden');
  } else if (order.status === 'delivered') {
    const rePrep = confirm("¿Se preparará en cocina algún producto nuevo o modificación?\n\n• [Aceptar]: Regresar a 'En Preparación' e iniciar nuevo contador.\n• [Cancelar]: Regresar normalmente.");
    if (rePrep) {
      order.status = 'preparing';
      order.kitchen_cycle_started_at = new Date().toISOString();
    } else {
      order.status = 'preparing';
    }
    renderKanbanBoard();
    if (client) client.from('orders').update({ status: order.status, kitchen_cycle_started_at: order.kitchen_cycle_started_at }).eq('id', order.id);
  } else {
    const currentIdx = state.customStatusConfig.findIndex(c => c.id === order.status);
    if (currentIdx > 0) {
      order.status = state.customStatusConfig[currentIdx - 1].id;
      renderKanbanBoard();
      if (client) client.from('orders').update({ status: order.status }).eq('id', order.id);
    }
  }
}

export function handleRetrocesoInventoryChoice(choice) {
  retrocesoInventoryChoice = choice;
  document.getElementById('btnRetroNoPrep').className = choice === 'no_prepared' ? 'p-3 border-2 border-emerald-600 bg-emerald-50 rounded-xl text-left' : 'p-3 border rounded-xl text-left bg-white opacity-50';
  document.getElementById('btnRetroPrep').className = choice === 'prepared' ? 'p-3 border-2 border-amber-600 bg-amber-50 rounded-xl text-left' : 'p-3 border rounded-xl text-left bg-white opacity-50';

  if (choice === 'no_prepared') {
    document.getElementById('retrocesoStep1Sub').classList.add('hidden');
    document.getElementById('retrocesoStep2').classList.remove('hidden');
  } else {
    document.getElementById('retrocesoStep1Sub').classList.remove('hidden');
  }
}

export function setRetrocesoPreparedDestination(dest) {
  retrocesoPreparedDest = dest;
  document.getElementById('btnRetroBuffer').className = dest === 'buffer_resell' ? 'p-3 border-2 border-blue-600 bg-blue-50 rounded-xl text-left' : 'p-3 border rounded-xl text-left bg-white opacity-50';
  document.getElementById('btnRetroWaste').className = dest === 'waste_loss' ? 'p-3 border-2 border-rose-600 bg-rose-50 rounded-xl text-left' : 'p-3 border rounded-xl text-left bg-white opacity-50';
  document.getElementById('retrocesoStep2').classList.remove('hidden');
}

export async function finalizeRetrocesoOrderAction(orderAction) {
  const order = state.orders.find(o => o.id === retrocesoOrderId);
  if (!order) return;

  if (retrocesoInventoryChoice === 'no_prepared') {
    (order.items || []).forEach(item => {
      const recipes = state.recipes.filter(r => r.product_id === item.id || r.product_title === item.title);
      recipes.forEach(rcp => {
        const sup = state.supplies.find(s => s.id === rcp.supply_id);
        if (sup) {
          sup.current_stock += Number(rcp.quantity_per_portion) * Number(item.qty);
          if (client) client.from('supplies').update({ current_stock: sup.current_stock }).eq('id', sup.id);
        }
      });
    });
  } else if (retrocesoInventoryChoice === 'prepared') {
    if (retrocesoPreparedDest === 'buffer_resell') {
      (order.items || []).forEach(item => {
        const buff = { id: 'buf-' + Date.now(), restaurant_id: REST_ID, order_id: order.id, product_title: item.title, qty: item.qty, status: 'available', table_number: order.table_number, waiter_name: order.waiter_name, created_at: new Date().toISOString() };
        state.buffer.push(buff);
        if (client) client.from('prepared_items_buffer').insert([buff]);
      });
    } else if (retrocesoPreparedDest === 'waste_loss') {
      (order.items || []).forEach(item => {
        const wasteEntry = { id: 'wst-' + Date.now(), restaurant_id: REST_ID, order_id: order.id, product_title: item.title, reason: 'Cancelado durante preparación', cost_loss: Number(item.price) * 0.35, ingredients_summary: [{ item: item.title, qty: item.qty }], table_number: order.table_number, waiter_name: order.waiter_name, created_at: new Date().toISOString() };
        state.waste.push(wasteEntry);
        if (client) client.from('kitchen_waste').insert([wasteEntry]);
      });
    }
  }

  if (orderAction === 'return_flow') {
    order.status = 'pending';
    order.preparing_at = null;
    if (client) await client.from('orders').update({ status: 'pending', preparing_at: null }).eq('id', order.id);
  } else if (orderAction === 'delete_order') {
    order.status = 'cancelled';
    order.is_archived = true;
    if (client) await client.from('orders').update({ status: 'cancelled', is_archived: true }).eq('id', order.id);
  }

  renderKanbanBoard();
  closeRetrocesoModal();
}

export function closeRetrocesoModal() {
  const modal = document.getElementById('retrocesoModal');
  if (modal) modal.classList.add('hidden');
  retrocesoOrderId = null;
}