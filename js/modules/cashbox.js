import { REST_ID, generateUUID, escapeHtml, showToast, normalizeTableNumber } from '../config.js';
import { state, client, dbWrite, getActiveShift, logAudit } from '../state.js';
import { playSoundByName } from '../audio.js';
import { requirePinAuthorization } from './auth-pin.js';

let checkoutOrderId = null;
let checkoutMethod = 'cash';

export function ensureCheckoutModal() {
  if (document.getElementById('checkoutOrderModal')) return;
  const m = document.createElement('div');
  m.id = 'checkoutOrderModal';
  m.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
  m.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar">
      <div class="flex justify-between items-center border-b pb-3">
        <div>
          <h3 class="font-extrabold text-base text-stone-900">💵 Cobrar Cuenta</h3>
          <p class="text-xs text-stone-500" id="chkOrderSubtitle">Mesa --</p>
        </div>
        <button onclick="window.closeCheckoutModal()" class="text-stone-400 hover:text-stone-700 font-bold text-lg">✕</button>
      </div>

      <!-- Resumen subtotal / descuento / propina -->
      <div class="bg-stone-50 border rounded-2xl p-3.5 space-y-2 text-xs">
        <div class="flex justify-between">
          <span class="text-stone-500">Consumo Subtotal:</span>
          <b class="font-mono" id="chkSubtotal">$0.00</b>
        </div>
        <div class="flex justify-between items-center gap-2">
          <span class="text-stone-500">Descuento / Cortesía ($):</span>
          <input type="number" step="1" min="0" id="chkManualDiscount" value="0" oninput="window.recalcCheckoutTotals()" class="w-24 border rounded-lg px-2 py-1 text-right font-mono bg-white">
        </div>
        <div id="chkDiscountReasonWrap" class="hidden">
          <input type="text" id="chkDiscountReason" placeholder="Motivo del descuento o cortesía..." class="w-full border rounded-lg px-2 py-1.5 text-[11px] bg-white">
        </div>
        <div class="space-y-1 pt-1 border-t">
          <div class="flex justify-between items-center">
            <span class="text-stone-500 font-bold">Propina ($):</span>
            <div class="flex gap-1">
              <button onclick="window.setCheckoutTipPct(0)" class="px-2 py-0.5 rounded bg-stone-200 text-[10px] font-bold">0%</button>
              <button onclick="window.setCheckoutTipPct(10)" class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">10%</button>
              <button onclick="window.setCheckoutTipPct(15)" class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">15%</button>
              <input type="number" step="1" min="0" id="chkTipAmount" value="0" oninput="window.recalcCheckoutTotals()" class="w-20 border rounded-lg px-2 py-0.5 text-right font-mono bg-white">
            </div>
          </div>
        </div>
        <div class="flex justify-between items-center pt-2 border-t text-base font-black text-stone-900">
          <span>TOTAL A COBRAR:</span>
          <span class="font-mono text-emerald-700" id="chkGrandTotal">$0.00 MXN</span>
        </div>
      </div>

      <!-- Método de Pago -->
      <div class="space-y-2 text-xs">
        <label class="block font-bold text-stone-700">Método de Pago:</label>
        <div class="grid grid-cols-4 gap-1.5 font-bold">
          <button id="btnPay-cash" onclick="window.selectCheckoutMethod('cash')" class="py-2 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-900">💵 Efectivo</button>
          <button id="btnPay-card" onclick="window.selectCheckoutMethod('card')" class="py-2 rounded-xl border border-stone-200 bg-white text-stone-700">💳 Tarjeta</button>
          <button id="btnPay-transfer" onclick="window.selectCheckoutMethod('transfer')" class="py-2 rounded-xl border border-stone-200 bg-white text-stone-700">📲 Transf.</button>
          <button id="btnPay-mixed" onclick="window.selectCheckoutMethod('mixed')" class="py-2 rounded-xl border border-stone-200 bg-white text-stone-700">🔀 Mixto</button>
        </div>
      </div>

      <!-- Área Efectivo -->
      <div id="chkCashArea" class="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 space-y-2 text-xs">
        <div class="flex justify-between items-center">
          <label class="font-bold text-emerald-950">Efectivo Recibido:</label>
          <input type="number" step="1" min="0" id="chkCashTendered" oninput="window.recalcCheckoutTotals()" placeholder="0.00" class="w-28 border-2 border-emerald-400 rounded-xl px-2.5 py-1.5 text-right font-mono font-black text-sm bg-white outline-none">
        </div>
        <div class="flex justify-between items-center text-sm font-black">
          <span class="text-emerald-800">Cambio a entregar:</span>
          <span id="chkChangeDisplay" class="font-mono text-emerald-900">$0.00 MXN</span>
        </div>
      </div>

      <!-- Área Mixto -->
      <div id="chkMixedArea" class="hidden bg-stone-50 border rounded-2xl p-3 space-y-2 text-xs">
        <div class="flex justify-between items-center">
          <span>💵 Parte en Efectivo:</span>
          <input type="number" step="1" min="0" id="chkMixCash" value="0" oninput="window.recalcCheckoutTotals()" class="w-24 border rounded-lg px-2 py-1 text-right font-mono bg-white">
        </div>
        <div class="flex justify-between items-center">
          <span>💳 Parte en Tarjeta:</span>
          <input type="number" step="1" min="0" id="chkMixCard" value="0" oninput="window.recalcCheckoutTotals()" class="w-24 border rounded-lg px-2 py-1 text-right font-mono bg-white">
        </div>
        <div class="flex justify-between items-center">
          <span>📲 Parte en Transferencia:</span>
          <input type="number" step="1" min="0" id="chkMixTransfer" value="0" oninput="window.recalcCheckoutTotals()" class="w-24 border rounded-lg px-2 py-1 text-right font-mono bg-white">
        </div>
        <div class="flex justify-between font-bold border-t pt-1.5">
          <span>Restante por cubrir:</span>
          <span id="chkMixRemaining" class="font-mono text-amber-700">$0.00</span>
        </div>
      </div>

      <button onclick="window.confirmOrderCheckout()" class="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black py-3.5 rounded-2xl text-xs shadow-lg transition">
        ✓ Confirmar Cobro y Liquidar Cuenta
      </button>
    </div>
  `;
  document.body.appendChild(m);
}

export function openCheckoutModal(orderId) {
  ensureCheckoutModal();
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  checkoutOrderId = orderId;

  document.getElementById('chkOrderSubtitle').innerText = `Mesa ${order.table_number} • Mesero: ${order.waiter_name || 'Sin asignar'}`;
  document.getElementById('chkSubtotal').innerText = `$${Number(order.subtotal || order.total || 0).toFixed(2)}`;
  document.getElementById('chkManualDiscount').value = Number(order.discount || 0);
  document.getElementById('chkDiscountReason').value = order.manual_discount_reason || '';
  document.getElementById('chkTipAmount').value = '0';
  document.getElementById('chkCashTendered').value = '';
  document.getElementById('chkMixCash').value = '0';
  document.getElementById('chkMixCard').value = '0';
  document.getElementById('chkMixTransfer').value = '0';

  selectCheckoutMethod('cash');
  recalcCheckoutTotals();
  document.getElementById('checkoutOrderModal').classList.remove('hidden');
}

export function closeCheckoutModal() {
  const m = document.getElementById('checkoutOrderModal');
  if (m) m.classList.add('hidden');
  checkoutOrderId = null;
}

export function selectCheckoutMethod(method) {
  checkoutMethod = method;
  ['cash', 'card', 'transfer', 'mixed'].forEach(mt => {
    const btn = document.getElementById(`btnPay-${mt}`);
    if (!btn) return;
    btn.className = (mt === method)
      ? 'py-2 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-900'
      : 'py-2 rounded-xl border border-stone-200 bg-white text-stone-700';
  });
  document.getElementById('chkCashArea').classList.toggle('hidden', method !== 'cash');
  document.getElementById('chkMixedArea').classList.toggle('hidden', method !== 'mixed');
  recalcCheckoutTotals();
}

export function setCheckoutTipPct(pct) {
  const order = state.orders.find(o => o.id === checkoutOrderId);
  if (!order) return;
  const sub = Number(order.subtotal || order.total || 0);
  const disc = Math.max(0, parseFloat(document.getElementById('chkManualDiscount')?.value) || 0);
  const net = Math.max(0, sub - disc);
  document.getElementById('chkTipAmount').value = (net * (pct / 100)).toFixed(2);
  recalcCheckoutTotals();
}

export function recalcCheckoutTotals() {
  const order = state.orders.find(o => o.id === checkoutOrderId);
  if (!order) return;
  const sub = Number(order.subtotal || order.total || 0);
  const disc = Math.max(0, parseFloat(document.getElementById('chkManualDiscount')?.value) || 0);
  const tip = Math.max(0, parseFloat(document.getElementById('chkTipAmount')?.value) || 0);

  document.getElementById('chkDiscountReasonWrap').classList.toggle('hidden', disc <= Number(order.discount || 0));

  const netOrderTotal = Math.max(0, sub - disc);
  const grandTotal = netOrderTotal + tip;
  document.getElementById('chkGrandTotal').innerText = `$${grandTotal.toFixed(2)} MXN`;

  if (checkoutMethod === 'cash') {
    const tendered = parseFloat(document.getElementById('chkCashTendered')?.value) || 0;
    const change = Math.max(0, tendered - grandTotal);
    document.getElementById('chkChangeDisplay').innerText = `$${change.toFixed(2)} MXN`;
  } else if (checkoutMethod === 'mixed') {
    const c = parseFloat(document.getElementById('chkMixCash')?.value) || 0;
    const k = parseFloat(document.getElementById('chkMixCard')?.value) || 0;
    const t = parseFloat(document.getElementById('chkMixTransfer')?.value) || 0;
    const rem = grandTotal - (c + k + t);
    const remEl = document.getElementById('chkMixRemaining');
    remEl.innerText = `$${rem.toFixed(2)}`;
    remEl.className = Math.abs(rem) < 0.01 ? 'font-mono text-emerald-700' : 'font-mono text-rose-600';
  }
}

export async function confirmOrderCheckout() {
  const order = state.orders.find(o => o.id === checkoutOrderId);
  if (!order) return;

  const sub = Number(order.subtotal || order.total || 0);
  const newDisc = Math.max(0, parseFloat(document.getElementById('chkManualDiscount')?.value) || 0);
  const discReason = document.getElementById('chkDiscountReason')?.value?.trim() || '';
  const tip = Math.max(0, parseFloat(document.getElementById('chkTipAmount')?.value) || 0);
  const netTotal = Math.max(0, sub - newDisc);
  const grandTotal = netTotal + tip;

  let paymentDetails = { cash: 0, card: 0, transfer: 0, tendered: 0, change: 0 };
  if (checkoutMethod === 'cash') {
    const tendered = parseFloat(document.getElementById('chkCashTendered')?.value) || grandTotal;
    if (tendered < grandTotal - 0.01) {
      showToast('El efectivo recibido es menor al total a cobrar.', 'warning');
      return;
    }
    paymentDetails = { cash: grandTotal, card: 0, transfer: 0, tendered, change: Math.max(0, tendered - grandTotal) };
  } else if (checkoutMethod === 'card') {
    paymentDetails = { cash: 0, card: grandTotal, transfer: 0, tendered: grandTotal, change: 0 };
  } else if (checkoutMethod === 'transfer') {
    paymentDetails = { cash: 0, card: 0, transfer: grandTotal, tendered: grandTotal, change: 0 };
  } else if (checkoutMethod === 'mixed') {
    const c = parseFloat(document.getElementById('chkMixCash')?.value) || 0;
    const k = parseFloat(document.getElementById('chkMixCard')?.value) || 0;
    const t = parseFloat(document.getElementById('chkMixTransfer')?.value) || 0;
    if (Math.abs((c + k + t) - grandTotal) > 0.5) {
      showToast('La suma del pago mixto debe coincidir con el total a cobrar.', 'warning');
      return;
    }
    paymentDetails = { cash: c, card: k, transfer: t, tendered: c + k + t, change: 0 };
  }

  const doSave = async (authorizer) => {
    const nowIso = new Date().toISOString();
    const activeShift = getActiveShift();

    const payload = {
      status: 'paid',
      paid_at: nowIso,
      delivered_at: order.delivered_at || nowIso,
      discount: newDisc,
      total: netTotal,
      tip_amount: tip,
      payment_method: checkoutMethod,
      payment_details: paymentDetails,
      manual_discount_reason: discReason || order.manual_discount_reason,
      shift_id: activeShift ? activeShift.id : null
    };

    const { error } = await dbWrite(client.from('orders').update(payload).eq('id', order.id), 'cobrar comanda');
    if (error) return;

    Object.assign(order, payload);
    playSoundByName('reward');

    if (newDisc > Number(order.discount || 0)) {
      await logAudit('manual_discount', { order_id: order.id, discount: newDisc, reason: discReason, authorized_by: authorizer?.name });
    }

    // Marcar mesa como por limpiar
    if (!order.order_channel || order.order_channel === 'dine_in') {
      const tbl = state.tables.find(t => normalizeTableNumber(t.table_number) === normalizeTableNumber(order.table_number));
      if (tbl?.id) {
        tbl.status = 'cleaning';
        await client.from('tables').update({ status: 'cleaning' }).eq('id', tbl.id);
      }
    }

    closeCheckoutModal();
    if (window.renderKanbanBoard) window.renderKanbanBoard();
    if (window.renderTablesFloorPlan) window.renderTablesFloorPlan();
    renderCashboxTab();
    showToast(`Cuenta Mesa ${order.table_number} cobrada ($${grandTotal.toFixed(2)}) ✓`, 'success');
  };

  if (newDisc > Number(order.discount || 0)) {
    requirePinAuthorization('PIN de Admin/Gerente para autorizar cortesía o descuento manual', ['admin', 'management'], doSave);
  } else {
    await doSave(state.activeStaff);
  }
}

// =========================================================================
// MÓDULO DE CAJA Y CORTES DE TURNO (X / Z)
// =========================================================================
function computeShiftSummary(shift) {
  const shiftOrders = state.orders.filter(o =>
    o.status === 'paid' && (
      o.shift_id === shift.id ||
      (!o.shift_id && new Date(o.paid_at || o.created_at) >= new Date(shift.opened_at) && (!shift.closed_at || new Date(o.paid_at || o.created_at) <= new Date(shift.closed_at)))
    )
  );

  let cashSales = 0, cardSales = 0, transferSales = 0, tipsTotal = 0;
  shiftOrders.forEach(o => {
    const pd = o.payment_details || {};
    const totWithTip = Number(o.total || 0) + Number(o.tip_amount || 0);
    tipsTotal += Number(o.tip_amount || 0);

    if (o.payment_method === 'mixed') {
      cashSales += Number(pd.cash || 0);
      cardSales += Number(pd.card || 0);
      transferSales += Number(pd.transfer || 0);
    } else if (o.payment_method === 'card') {
      cardSales += totWithTip;
    } else if (o.payment_method === 'transfer') {
      transferSales += totWithTip;
    } else {
      cashSales += totWithTip;
    }
  });

  const movs = Array.isArray(shift.movements) ? shift.movements : [];
  const cashIn = movs.filter(m => m.type === 'in').reduce((a, m) => a + Number(m.amount || 0), 0);
  const cashOut = movs.filter(m => m.type === 'out').reduce((a, m) => a + Number(m.amount || 0), 0);
  const expectedCash = Number(shift.opening_amount || 0) + cashSales + cashIn - cashOut;

  return { count: shiftOrders.length, cashSales, cardSales, transferSales, tipsTotal, cashIn, cashOut, expectedCash };
}

export function renderCashboxTab() {
  const activeBox = document.getElementById('cashboxActiveArea');
  const histBody = document.getElementById('cashboxHistoryBody');
  if (!activeBox) return;

  const openShift = getActiveShift();

  if (!openShift) {
    activeBox.innerHTML = `
      <div class="bg-white rounded-3xl p-6 border-2 border-dashed border-stone-300 max-w-md mx-auto text-center space-y-4">
        <div class="text-4xl">💵</div>
        <div>
          <h3 class="font-black text-lg text-stone-900">Caja Cerrada</h3>
          <p class="text-xs text-stone-500 mt-1">Abre un nuevo turno declarando el fondo inicial en efectivo para registrar cobros y cortes.</p>
        </div>
        <div class="text-left text-xs space-y-1">
          <label class="font-bold text-stone-700">Fondo Inicial en Efectivo ($ MXN):</label>
          <input type="number" step="10" min="0" id="openShiftAmountInput" value="1000" class="w-full border-2 rounded-2xl p-3 font-mono font-black text-lg text-center bg-stone-50 outline-none focus:border-amber-600">
        </div>
        <button onclick="window.openCashShift()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-2xl text-xs shadow-md transition">
          🔓 Abrir Turno de Caja
        </button>
      </div>
    `;
  } else {
    const sum = computeShiftSummary(openShift);
    const movs = Array.isArray(openShift.movements) ? openShift.movements : [];

    activeBox.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs">
          <span class="text-[10px] font-bold uppercase text-stone-400">Efectivo Esperado en Caja</span>
          <h4 class="text-2xl font-black font-mono text-emerald-700 mt-1">$${sum.expectedCash.toFixed(2)}</h4>
          <p class="text-[11px] text-stone-500 mt-0.5">Fondo $${Number(openShift.opening_amount).toFixed(2)} + Ventas $${sum.cashSales.toFixed(2)}</p>
        </div>
        <div class="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs">
          <span class="text-[10px] font-bold uppercase text-stone-400">Cobros Tarjeta</span>
          <h4 class="text-2xl font-black font-mono text-stone-900 mt-1">$${sum.cardSales.toFixed(2)}</h4>
          <p class="text-[11px] text-stone-500 mt-0.5">Vouchers terminal</p>
        </div>
        <div class="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs">
          <span class="text-[10px] font-bold uppercase text-stone-400">Transferencias</span>
          <h4 class="text-2xl font-black font-mono text-blue-700 mt-1">$${sum.transferSales.toFixed(2)}</h4>
          <p class="text-[11px] text-stone-500 mt-0.5">SPEI / Banco</p>
        </div>
        <div class="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs">
          <span class="text-[10px] font-bold uppercase text-stone-400">Propinas Acumuladas</span>
          <h4 class="text-2xl font-black font-mono text-amber-700 mt-1">$${sum.tipsTotal.toFixed(2)}</h4>
          <p class="text-[11px] text-stone-500 mt-0.5">${sum.count} comandas cobradas</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5">
        <!-- MOVIMIENTOS DE CAJA -->
        <div class="lg:col-span-6 bg-white rounded-3xl p-5 border border-stone-200 space-y-4">
          <h4 class="font-extrabold text-sm text-stone-900 border-b pb-2">💸 Movimientos de Efectivo (Retiros / Gastos Menores)</h4>
          <div class="grid grid-cols-3 gap-2 text-xs">
            <select id="cashMovType" class="border rounded-xl p-2 bg-stone-50 font-bold">
              <option value="out">🔴 Retiro / Gasto</option>
              <option value="in">🟢 Ingreso Extra</option>
            </select>
            <input type="number" step="1" min="1" id="cashMovAmount" placeholder="Monto $" class="border rounded-xl p-2 font-mono">
            <button onclick="window.addCashMovement()" class="bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl">Registrar</button>
          </div>
          <input type="text" id="cashMovConcept" placeholder="Concepto (ej: Compra de hielo, pago proveedor pan...)" class="w-full border rounded-xl p-2 text-xs bg-stone-50">
          <div class="space-y-1.5 max-h-44 overflow-y-auto text-xs">
            ${movs.length === 0 ? '<p class="text-stone-400 text-center py-4">Sin movimientos manuales en este turno.</p>' : movs.map(m => `
              <div class="flex justify-between items-center p-2 rounded-xl border ${m.type === 'out' ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}">
                <div>
                  <span class="font-bold text-stone-900">${escapeHtml(m.concept)}</span>
                  <span class="block text-[10px] text-stone-500">${escapeHtml(m.by)} • ${new Date(m.at).toLocaleTimeString()}</span>
                </div>
                <span class="font-mono font-black ${m.type === 'out' ? 'text-rose-700' : 'text-emerald-700'}">${m.type === 'out' ? '-' : '+'}$${Number(m.amount).toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- CORTE Z / CIERRE DE TURNO -->
        <div class="lg:col-span-6 bg-white rounded-3xl p-5 border border-stone-200 space-y-4">
          <div class="flex justify-between items-center border-b pb-2">
            <div>
              <h4 class="font-extrabold text-sm text-stone-900">🔒 Corte Z / Cierre de Turno</h4>
              <p class="text-[11px] text-stone-500">Abierto por <b>${escapeHtml(openShift.opened_by)}</b> el ${new Date(openShift.opened_at).toLocaleString()}</p>
            </div>
            <button onclick="window.printShiftReport('${openShift.id}')" class="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-bold">🖨️ Corte X</button>
          </div>
          <div class="space-y-2 text-xs">
            <label class="block font-bold text-stone-700">Efectivo Físico Contado en Cajón ($ MXN):</label>
            <input type="number" step="0.5" min="0" id="closeShiftCountedCash" placeholder="${sum.expectedCash.toFixed(2)}" class="w-full border-2 border-amber-400 rounded-2xl p-3 font-mono font-black text-lg text-center bg-amber-50/40 outline-none">
            <textarea id="closeShiftNotes" rows="2" placeholder="Observaciones del cierre..." class="w-full border rounded-xl p-2 bg-stone-50"></textarea>
          </div>
          <button onclick="window.closeCashShift()" class="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-2xl text-xs shadow-md transition">
            🔒 Realizar Corte Z y Cerrar Turno
          </button>
        </div>
      </div>
    `;
  }

  if (histBody) {
    const closedShifts = state.cashShifts.filter(s => s.status === 'closed');
    if (closedShifts.length === 0) {
      histBody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-stone-400">Aún no hay cortes cerrados.</td></tr>';
    } else {
      histBody.innerHTML = closedShifts.map(s => `
        <tr class="text-xs text-stone-700 hover:bg-stone-50">
          <td class="py-2.5 font-mono text-[11px]">${new Date(s.opened_at).toLocaleDateString()} ${new Date(s.closed_at || s.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td class="py-2.5 font-bold">${escapeHtml(s.closed_by || s.opened_by)}</td>
          <td class="py-2.5 font-mono">$${Number(s.expected_cash || 0).toFixed(2)}</td>
          <td class="py-2.5 font-mono font-bold">$${Number(s.counted_cash || 0).toFixed(2)}</td>
          <td class="py-2.5 font-mono font-bold ${Number(s.difference || 0) < 0 ? 'text-rose-600' : 'text-emerald-700'}">${Number(s.difference || 0) >= 0 ? '+' : ''}$${Number(s.difference || 0).toFixed(2)}</td>
          <td class="py-2.5 font-mono">$${(Number(s.card_total || 0) + Number(s.transfer_total || 0)).toFixed(2)}</td>
          <td class="py-2.5"><button onclick="window.printShiftReport('${s.id}')" class="px-2 py-1 rounded-lg border text-[10px] font-bold hover:bg-stone-100">🖨️ Ver</button></td>
        </tr>
      `).join('');
    }
  }
}

export async function openCashShift() {
  const openingAmount = Math.max(0, parseFloat(document.getElementById('openShiftAmountInput')?.value) || 0);
  const shift = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    opened_by: state.activeStaff?.name || 'Admin',
    opening_amount: openingAmount,
    expected_cash: openingAmount,
    movements: [],
    status: 'open',
    opened_at: new Date().toISOString()
  };
  const { error } = await dbWrite(client.from('cash_shifts').insert([shift]), 'abrir turno de caja');
  if (error) return;
  state.cashShifts.unshift(shift);
  renderCashboxTab();
  showToast(`Turno abierto con fondo de $${openingAmount.toFixed(2)} ✓`, 'success');
}

export async function addCashMovement() {
  const openShift = getActiveShift();
  if (!openShift) return;
  const type = document.getElementById('cashMovType')?.value || 'out';
  const amount = parseFloat(document.getElementById('cashMovAmount')?.value) || 0;
  const concept = document.getElementById('cashMovConcept')?.value?.trim();
  if (amount <= 0 || !concept) {
    showToast('Ingresa monto y concepto del movimiento.', 'warning');
    return;
  }
  const movs = Array.isArray(openShift.movements) ? [...openShift.movements] : [];
  movs.unshift({ id: generateUUID(), type, amount, concept, by: state.activeStaff?.name || 'Caja', at: new Date().toISOString() });

  const { error } = await dbWrite(client.from('cash_shifts').update({ movements: movs }).eq('id', openShift.id), 'registrar movimiento de caja');
  if (error) return;

  openShift.movements = movs;
  document.getElementById('cashMovAmount').value = '';
  document.getElementById('cashMovConcept').value = '';
  renderCashboxTab();
  showToast('Movimiento registrado en caja ✓', 'success');
}

export function closeCashShift() {
  const openShift = getActiveShift();
  if (!openShift) return;
  const counted = parseFloat(document.getElementById('closeShiftCountedCash')?.value);
  if (isNaN(counted)) {
    showToast('Captura el efectivo físico contado en cajón.', 'warning');
    return;
  }

  requirePinAuthorization('PIN de Admin, Gerente o Caja para cerrar turno (Corte Z)', ['admin', 'management', 'cashier'], async (staff) => {
    const sum = computeShiftSummary(openShift);
    const diff = Number((counted - sum.expectedCash).toFixed(2));
    const notes = document.getElementById('closeShiftNotes')?.value?.trim() || '';
    const closedAt = new Date().toISOString();

    const updatePayload = {
      status: 'closed',
      closed_by: staff.name,
      closed_at: closedAt,
      expected_cash: sum.expectedCash,
      counted_cash: counted,
      card_total: sum.cardSales,
      transfer_total: sum.transferSales,
      tips_total: sum.tipsTotal,
      difference: diff,
      notes
    };

    const { error } = await dbWrite(client.from('cash_shifts').update(updatePayload).eq('id', openShift.id), 'cerrar turno Corte Z');
    if (error) return;

    Object.assign(openShift, updatePayload);
    await logAudit('close_shift', { shift_id: openShift.id, expected: sum.expectedCash, counted, diff });
    renderCashboxTab();
    showToast(`Corte Z completado. Diferencia: $${diff.toFixed(2)}`, diff < 0 ? 'warning' : 'success');
  });
}

export function printShiftReport(shiftId) {
  const shift = state.cashShifts.find(s => s.id === shiftId);
  if (!shift) return;
  const sum = computeShiftSummary(shift);
  const w = window.open('', '_blank', 'width=380,height=650');
  if (!w) return;
  w.document.write(`
    <html><head><title>Corte de Caja</title>
    <style>body{font-family:monospace;font-size:12px;margin:16px;} .row{display:flex;justify-content:space-between;margin:4px 0;} hr{border:0;border-top:1px dashed #000;margin:8px 0;}</style>
    </head><body>
      <h3 style="text-align:center;margin:0;">CAFÉ & BISTRO ÁUREA</h3>
      <p style="text-align:center;margin:4px 0;">${shift.status === 'open' ? 'CORTE X (PARCIAL)' : 'CORTE Z (CIERRE DE TURNO)'}</p>
      <hr>
      <div class="row"><span>Abrió:</span><span>${escapeHtml(shift.opened_by)}</span></div>
      <div class="row"><span>Apertura:</span><span>${new Date(shift.opened_at).toLocaleString()}</span></div>
      ${shift.closed_at ? `<div class="row"><span>Cerró:</span><span>${escapeHtml(shift.closed_by || '')}</span></div>` : ''}
      <hr>
      <div class="row"><span>Fondo Inicial:</span><span>$${Number(shift.opening_amount || 0).toFixed(2)}</span></div>
      <div class="row"><span>Ventas Efectivo:</span><span>$${sum.cashSales.toFixed(2)}</span></div>
      <div class="row"><span>Ingresos Extra:</span><span>+$${sum.cashIn.toFixed(2)}</span></div>
      <div class="row"><span>Retiros/Gastos:</span><span>-$${sum.cashOut.toFixed(2)}</span></div>
      <div class="row"><strong>EFECTIVO ESPERADO:</strong><strong>$${sum.expectedCash.toFixed(2)}</strong></div>
      ${shift.counted_cash !== null && shift.counted_cash !== undefined ? `
        <div class="row"><span>Efectivo Contado:</span><span>$${Number(shift.counted_cash).toFixed(2)}</span></div>
        <div class="row"><strong>DIFERENCIA:</strong><strong>$${Number(shift.difference || 0).toFixed(2)}</strong></div>
      ` : ''}
      <hr>
      <div class="row"><span>Tarjeta:</span><span>$${sum.cardSales.toFixed(2)}</span></div>
      <div class="row"><span>Transferencia:</span><span>$${sum.transferSales.toFixed(2)}</span></div>
      <div class="row"><span>Propinas:</span><span>$${sum.tipsTotal.toFixed(2)}</span></div>
      <div class="row"><strong>COMANDAS COBRADAS:</strong><strong>${sum.count}</strong></div>
    </body></html>
  `);
  w.document.close();
  w.focus();
  w.print();
  w.close();
}
