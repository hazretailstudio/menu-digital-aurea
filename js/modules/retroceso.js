import { REST_ID, generateUUID, showToast, normalizeTableNumber } from '../config.js';
import { state, client, dbWrite, logAudit } from '../state.js';
import { renderKanbanBoard } from './kanban.js';
import { requirePinAuthorization } from './auth-pin.js';

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
            <span class="block text-rose-700 font-bold">🚫 Cancelar Comanda</span>
            <span class="text-[10px] font-normal text-stone-500 block">Requiere PIN Admin/Gerente.</span>
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
    order.status = 'preparing';
    if (rePrep) order.kitchen_cycle_started_at = new Date().toISOString();
    renderKanbanBoard();
    dbWrite(client.from('orders').update({ status: order.status, kitchen_cycle_started_at: order.kitchen_cycle_started_at }).eq('id', order.id), 'retroceder estatus');
  } else {
    const currentIdx = state.customStatusConfig.findIndex(c => c.id === order.status);
    if (currentIdx > 0) {
      order.status = state.customStatusConfig[currentIdx - 1].id;
      renderKanbanBoard();
      dbWrite(client.from('orders').update({ status: order.status }).eq('id', order.id), 'retroceder estatus');
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

  const executeAction = async (authorizerStaff) => {
    if (retrocesoInventoryChoice === 'no_prepared') {
      for (const item of (order.items || [])) {
        if (!item.inventory_deducted) continue;
        const recipes = state.recipes.filter(r => r.product_id === item.id);
        for (const rcp of recipes) {
          const sup = state.supplies.find(s => s.id === rcp.supply_id);
          if (sup) {
            sup.current_stock = Number(sup.current_stock) + Number(rcp.quantity_per_portion) * Number(item.qty);
            await client.from('supplies').update({ current_stock: sup.current_stock }).eq('id', sup.id);
          }
        }
        item.inventory_deducted = false;
      }
    } else if (retrocesoInventoryChoice === 'prepared') {
      if (retrocesoPreparedDest === 'buffer_resell') {
        for (const item of (order.items || [])) {
          const buff = {
            id: generateUUID(),
            restaurant_id: REST_ID,
            order_id: order.id,
            product_title: item.title,
            qty: item.qty,
            status: 'available',
            table_number: order.table_number,
            waiter_name: order.waiter_name,
            created_at: new Date().toISOString()
          };
          state.buffer.unshift(buff);
          await dbWrite(client.from('prepared_items_buffer').insert([buff]), 'registrar buffer');
        }
      } else if (retrocesoPreparedDest === 'waste_loss') {
        for (const item of (order.items || [])) {
          const wasteEntry = {
            id: generateUUID(),
            restaurant_id: REST_ID,
            order_id: order.id,
            product_title: item.title,
            reason: 'Cancelado durante preparación',
            cost_loss: Number((Number(item.price) * Number(item.qty) * 0.35).toFixed(2)),
            ingredients_summary: [{ item: item.title, qty: item.qty }],
            table_number: order.table_number,
            waiter_name: order.waiter_name,
            created_at: new Date().toISOString()
          };
          state.waste.unshift(wasteEntry);
          await dbWrite(client.from('kitchen_waste').insert([wasteEntry]), 'registrar merma');
        }
      }
    }

    if (orderAction === 'return_flow') {
      order.status = 'pending';
      order.preparing_at = null;
      await dbWrite(client.from('orders').update({ status: 'pending', preparing_at: null, items: order.items }).eq('id', order.id), 'regresar comanda a recibida');
    } else if (orderAction === 'delete_order') {
      const reason = prompt('Motivo de la cancelación (obligatorio para auditoría):', 'Cliente canceló') || 'Sin motivo especificado';
      order.status = 'cancelled';
      order.is_archived = true;
      order.cancel_reason = reason;
      order.cancelled_by = authorizerStaff?.name || state.activeStaff?.name;

      await dbWrite(
        client.from('orders').update({
          status: 'cancelled',
          is_archived: true,
          cancel_reason: reason,
          cancelled_by: order.cancelled_by,
          items: order.items
        }).eq('id', order.id),
        'cancelar comanda'
      );

      if (!order.order_channel || order.order_channel === 'dine_in') {
        const tbl = state.tables.find(t => normalizeTableNumber(t.table_number) === normalizeTableNumber(order.table_number));
        if (tbl?.id) {
          tbl.status = 'available';
          await client.from('tables').update({ status: 'available' }).eq('id', tbl.id);
        }
      }

      await logAudit('cancel_order', {
        order_id: order.id,
        table: order.table_number,
        total: order.total,
        reason,
        authorized_by: order.cancelled_by,
        inventory_choice: retrocesoInventoryChoice,
        dest: retrocesoPreparedDest
      });
      showToast(`Comanda Mesa ${order.table_number} cancelada y auditada.`, 'warning');
    }

    renderKanbanBoard();
    if (window.renderTablesFloorPlan) window.renderTablesFloorPlan();
    closeRetrocesoModal();
  };

  if (orderAction === 'delete_order') {
    requirePinAuthorization('PIN de Admin o Gerente para cancelar comanda', ['admin', 'management'], executeAction);
  } else {
    await executeAction(state.activeStaff);
  }
}

export function closeRetrocesoModal() {
  const modal = document.getElementById('retrocesoModal');
  if (modal) modal.classList.add('hidden');
  retrocesoOrderId = null;
}
