import { state, client } from '../state.js';
import { REST_ID, escapeHtml, showToast } from '../config.js';
import { playSoundByName } from '../audio.js';
import { initCartaEnhancer } from './carta-enhancer.js';

let lastClickedCheckoutOrderId = null;

export function saveGoogleMapsEmbed() {
  const val = document.getElementById('gmapsEmbedInput')?.value?.trim();
  if (!val) return;
  const prev = document.getElementById('gmapsPreviewContainer');
  if (prev) prev.innerHTML = val;
  if (client) {
    client.from('restaurants').update({ google_maps_embed: val }).eq('id', REST_ID);
  }
  showToast('Ficha de Google Maps vinculada correctamente ✓', 'success');
}

export function toggleWhatsappInputVisibility() {
  const mode = document.getElementById('adminOrderDeliveryMode')?.value || 'KDS';
  const waBox = document.getElementById('adminWhatsappNumberBox');
  if (waBox) waBox.classList.toggle('hidden', mode === 'KDS');
}

export async function loadOrderChannelSettings() {
  if (!client) return;
  const { data } = await client
    .from('restaurants')
    .select('order_delivery_mode, whatsapp_number, is_ordering_enabled')
    .eq('id', REST_ID)
    .maybeSingle();

  if (!data) return;
  const modeSel = document.getElementById('adminOrderDeliveryMode');
  const waInput = document.getElementById('adminWhatsappNumber');
  const enabledChk = document.getElementById('adminIsOrderingEnabled');

  if (modeSel) modeSel.value = data.order_delivery_mode || 'KDS';
  if (waInput) waInput.value = data.whatsapp_number || '';
  if (enabledChk) enabledChk.checked = data.is_ordering_enabled !== false;
  toggleWhatsappInputVisibility();
}

export async function saveOrderChannelSettings() {
  if (!client) return;
  const mode = document.getElementById('adminOrderDeliveryMode')?.value || 'KDS';
  const rawPhone = (document.getElementById('adminWhatsappNumber')?.value || '').replace(/\D/g, '');
  const isOrderingEnabled = Boolean(document.getElementById('adminIsOrderingEnabled')?.checked);

  if ((mode === 'WHATSAPP' || mode === 'BOTH') && rawPhone.length < 10) {
    showToast('Ingresa un número de WhatsApp válido (con lada, ej. 523312345678).', 'warning');
    return;
  }

  const { error } = await client
    .from('restaurants')
    .update({
      order_delivery_mode: mode,
      whatsapp_number: rawPhone || null,
      is_ordering_enabled: isOrderingEnabled
    })
    .eq('id', REST_ID);

  if (error) {
    showToast(`No se pudo guardar: ${error.message}`, 'error');
    return;
  }
  showToast('Configuración de pedidos del Menú QR guardada ✓', 'success');
}

function injectOrderSettingsCard() {
  const tabMarketing = document.getElementById('tab-marketing');
  if (!tabMarketing || document.getElementById('orderChannelSettingsCard')) return;

  const card = document.createElement('div');
  card.id = 'orderChannelSettingsCard';
  card.className = 'bg-white rounded-2xl p-5 shadow-sm border border-stone-200 space-y-4';
  card.innerHTML = `
    <div class="border-b pb-3 flex flex-wrap justify-between items-center gap-2">
      <div>
        <h3 class="font-bold text-base text-stone-900">📲 Recepción de Pedidos del Menú QR</h3>
        <p class="text-xs text-stone-500">Elige si los pedidos entran directo al tablero de Comandas del Admin, se envían por WhatsApp, o ambos.</p>
      </div>
      <label class="inline-flex items-center gap-2 text-xs font-bold text-stone-800 bg-stone-100 px-3 py-1.5 rounded-xl cursor-pointer">
        <input type="checkbox" id="adminIsOrderingEnabled" checked class="accent-amber-600 w-4 h-4">
        <span>Permitir pedidos en el menú</span>
      </label>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs items-end">
      <div>
        <label class="block font-bold text-stone-700 mb-1">¿A dónde llegan los pedidos del cliente?</label>
        <select id="adminOrderDeliveryMode" onchange="window.toggleWhatsappInputVisibility()" class="w-full border rounded-xl p-2.5 bg-stone-50 font-semibold text-stone-800 outline-none focus:border-amber-600">
          <option value="KDS">📋 Directo a Comandas (Admin)</option>
          <option value="WHATSAPP">💬 Solo por WhatsApp</option>
          <option value="BOTH">📋 + 💬 Comandas en Admin y WhatsApp</option>
        </select>
      </div>

      <div id="adminWhatsappNumberBox" class="hidden">
        <label class="block font-bold text-stone-700 mb-1">Número de WhatsApp destino (con código de país):</label>
        <input type="tel" id="adminWhatsappNumber" placeholder="Ej: 523312345678" class="w-full border rounded-xl p-2.5 bg-stone-50 font-mono outline-none focus:border-amber-600">
      </div>
    </div>

    <div class="flex justify-end pt-2 border-t border-stone-100">
      <button onclick="window.saveOrderChannelSettings()" class="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-sm">
        Guardar Configuración de Pedidos ✓
      </button>
    </div>
  `;

  tabMarketing.prepend(card);
  loadOrderChannelSettings();
}

function findVisibleCheckoutModal() {
  const candidates = [
    document.getElementById('checkoutModal'),
    document.getElementById('orderCheckoutModal'),
    document.getElementById('payOrderModal')
  ].filter(Boolean);

  for (const el of candidates) {
    if (!el.classList.contains('hidden')) return el;
  }

  const confirmBtn = document.querySelector('button[onclick*="confirmOrderCheckout"]');
  if (confirmBtn) {
    const m = confirmBtn.closest('.fixed');
    if (m && !m.classList.contains('hidden')) return m;
  }
  return null;
}

function resolveOrderFromCheckoutModal(modal) {
  if (lastClickedCheckoutOrderId) {
    const found = (state.orders || []).find(o => o.id === lastClickedCheckoutOrderId);
    if (found) return found;
  }
  const hiddenInput = modal?.querySelector('input[type="hidden"]');
  if (hiddenInput?.value) {
    const found = (state.orders || []).find(o => o.id === hiddenInput.value);
    if (found) return found;
  }
  const headerText = modal?.innerText || '';
  const match = headerText.match(/Mesa\s+([A-Za-z0-9-]+)/i);
  if (match) {
    const tbl = match[1].trim();
    const found = (state.orders || []).find(o => !o.is_archived && o.status !== 'paid' && o.status !== 'cancelled' && String(o.table_number) === tbl);
    if (found) return found;
  }
  return null;
}

function deriveGuestBreakdownFromItems(order) {
  const items = (order?.items?.length ? order.items : order?.items_snapshot) || [];
  const map = {};
  for (const it of items) {
    const g = (it.guest_name || '').trim();
    if (!g || g === 'General') continue;
    const qty = Number(it.qty || 1);
    const price = Number(it.price || it.unit_price || 0);
    if (!map[g]) map[g] = { name: g, amount: 0, paid: false, payment_method: 'cash', items: [] };
    map[g].amount += qty * price;
    map[g].items.push({ title: `${qty > 1 ? `${qty}x ` : ''}${it.title}`, price: qty * price });
  }
  return Object.values(map).map(g => ({ ...g, amount: Number(g.amount.toFixed(2)) }));
}

function renderSplitBoxInsideModal(modal, order) {
  if (!modal || !order) return;

  const card = modal.querySelector('.bg-white') || modal;
  let box = modal.querySelector('#checkoutSplitBreakdownBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'checkoutSplitBreakdownBox';
    const header = card.querySelector('.border-b');
    if (header && header.parentNode === card) {
      header.insertAdjacentElement('afterend', box);
    } else {
      card.prepend(box);
    }
  }

  const hasExplicitSplit =
    order.split_type &&
    order.split_type !== 'single' &&
    Array.isArray(order.split_details) &&
    order.split_details.length > 0;

  if (hasExplicitSplit) {
    const modeLabel = order.split_type === 'equal'
      ? `⚖️ Cuenta Dividida en Partes Iguales (${order.split_details.length})`
      : `👤 Cuenta Dividida por Comensal (${order.split_details.length})`;

    const paidSum = order.split_details.filter(p => p.paid).reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const pendingSum = order.split_details.filter(p => !p.paid).reduce((acc, p) => acc + Number(p.amount || 0), 0);

    const byMethod = { cash: 0, card: 0, transfer: 0 };
    order.split_details.forEach(p => {
      if (p.paid) {
        const m = p.payment_method || 'cash';
        byMethod[m] = (byMethod[m] || 0) + Number(p.amount || 0);
      }
    });

    box.className = 'rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-3.5 text-xs space-y-2.5 my-2';
    box.innerHTML = `
      <div class="flex flex-wrap justify-between items-center gap-1 border-b border-amber-200 pb-2">
        <span class="font-black text-amber-950">${escapeHtml(modeLabel)}</span>
        <span class="font-mono text-[11px] font-bold ${pendingSum <= 0.01 ? 'text-emerald-700' : 'text-rose-700'}">
          Pagado: $${paidSum.toFixed(2)} · Falta: $${pendingSum.toFixed(2)}
        </span>
      </div>
      <div class="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
        ${order.split_details.map((p, idx) => {
          const itemsList = Array.isArray(p.items) && p.items.length > 0
            ? `<div class="text-[10px] text-stone-500 mt-0.5">${p.items.map(i => `${escapeHtml(i.title)} ($${Number(i.price || 0).toFixed(2)})`).join(' · ')}</div>`
            : '';
          const pm = p.payment_method || 'cash';
          return `
            <div class="bg-white border border-stone-200 rounded-xl p-2 space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0 flex-grow">
                  <span class="font-bold text-stone-900">${escapeHtml(p.name || `Comensal ${idx + 1}`)}</span>
                  <span class="font-mono font-black text-amber-800 ml-1.5">$${Number(p.amount || 0).toFixed(2)}</span>
                  ${itemsList}
                </div>
                <button type="button" onclick="window.printSplitGuestTicket('${order.id}', ${idx})" title="Imprimir ticket de este comensal"
                  class="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px]">
                  🖨️
                </button>
              </div>
              <div class="flex items-center justify-between gap-2 pt-1 border-t border-stone-100">
                <select onchange="window.changeCheckoutSplitMethod('${order.id}', ${idx}, this.value)"
                  class="border rounded-lg px-2 py-1 text-[11px] bg-stone-50 font-semibold text-stone-700 outline-none">
                  <option value="cash" ${pm === 'cash' ? 'selected' : ''}>💵 Efectivo</option>
                  <option value="card" ${pm === 'card' ? 'selected' : ''}>💳 Tarjeta</option>
                  <option value="transfer" ${pm === 'transfer' ? 'selected' : ''}>🏦 Transferencia</option>
                </select>
                <button type="button" onclick="window.toggleCheckoutSplitPersonPaid('${order.id}', ${idx})"
                  class="px-3 py-1 rounded-lg font-bold text-[11px] transition ${
                    p.paid
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200'
                  }">
                  ${p.paid ? '✓ Pagado' : 'Marcar Pagado'}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ${paidSum > 0 ? `
        <div class="text-[10px] font-mono text-stone-600 bg-white/80 rounded-xl px-2.5 py-1.5 border border-amber-200 flex flex-wrap justify-between gap-2">
          <span>💵 Efec: <b>$${byMethod.cash.toFixed(2)}</b></span>
          <span>💳 Tarj: <b>$${byMethod.card.toFixed(2)}</b></span>
          <span>🏦 Transf: <b>$${byMethod.transfer.toFixed(2)}</b></span>
        </div>
      ` : ''}
    `;
    return;
  }

  const guestBreakdown = deriveGuestBreakdownFromItems(order);
  if (guestBreakdown.length > 1) {
    box.className = 'rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs space-y-2 my-2';
    box.innerHTML = `
      <div class="flex flex-wrap justify-between items-center gap-2 border-b border-blue-200 pb-2">
        <span class="font-black text-blue-950">👥 Pedido Grupal por Nombre (${guestBreakdown.length} comensales)</span>
        <button type="button" onclick="window.convertGroupOrderToSplit('${order.id}')"
          class="px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-[10px] transition">
          Cobrar por Separado
        </button>
      </div>
      <div class="space-y-1">
        ${guestBreakdown.map(g => `
          <div class="flex justify-between items-start bg-white border border-blue-100 rounded-xl px-2.5 py-1.5">
            <div>
              <span class="font-bold text-stone-800">👤 ${escapeHtml(g.name)}</span>
              <div class="text-[10px] text-stone-500">${g.items.map(i => escapeHtml(i.title)).join(', ')}</div>
            </div>
            <span class="font-mono font-bold text-stone-900">$${g.amount.toFixed(2)}</span>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  box.className = 'rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] text-stone-500 font-semibold my-2';
  box.innerHTML = '🧾 Tipo de cuenta: <b class="text-stone-800">Cuenta Individual (sin división)</b>';
}

async function refreshAndRenderCheckoutSplit(modal) {
  const order = resolveOrderFromCheckoutModal(modal);
  if (!order) return;

  renderSplitBoxInsideModal(modal, order);

  if (client && order.id) {
    const { data } = await client
      .from('orders')
      .select('split_type, split_details, guest_subtotals, items, items_snapshot, total, discount')
      .eq('id', order.id)
      .maybeSingle();

    if (data) {
      order.split_type = data.split_type;
      order.split_details = data.split_details;
      order.guest_subtotals = data.guest_subtotals;
      if (data.items) order.items = data.items;
      if (data.items_snapshot) order.items_snapshot = data.items_snapshot;
      renderSplitBoxInsideModal(modal, order);
    }
  }
}

export async function toggleCheckoutSplitPersonPaid(orderId, personIdx) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order || !Array.isArray(order.split_details) || !order.split_details[personIdx]) return;

  order.split_details[personIdx].paid = !order.split_details[personIdx].paid;
  const modal = findVisibleCheckoutModal();
  if (modal) renderSplitBoxInsideModal(modal, order);

  if (client) {
    await client.from('orders').update({ split_details: order.split_details }).eq('id', order.id);
  }
  if (order.split_details.every(p => p.paid)) {
    showToast('✓ Todos los comensales están pagados. Ya puedes confirmar el cobro final.', 'success');
  }
}

export async function changeCheckoutSplitMethod(orderId, personIdx, method) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order || !Array.isArray(order.split_details) || !order.split_details[personIdx]) return;

  order.split_details[personIdx].payment_method = method;
  const modal = findVisibleCheckoutModal();
  if (modal) renderSplitBoxInsideModal(modal, order);

  if (client) {
    await client.from('orders').update({ split_details: order.split_details }).eq('id', order.id);
  }
}

export async function convertGroupOrderToSplit(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const breakdown = deriveGuestBreakdownFromItems(order);
  if (breakdown.length === 0) return;

  order.split_type = 'by_person';
  order.split_details = breakdown;
  const modal = findVisibleCheckoutModal();
  if (modal) renderSplitBoxInsideModal(modal, order);

  if (client) {
    await client.from('orders').update({ split_type: 'by_person', split_details: breakdown }).eq('id', order.id);
  }
  showToast('Cuenta dividida por comensal activada ✓', 'success');
}

export function printSplitGuestTicket(orderId, personIdx) {
  const order = state.orders.find(o => o.id === orderId);
  const person = order?.split_details?.[personIdx];
  if (!order || !person) return;

  const itemsHtml = Array.isArray(person.items) && person.items.length > 0
    ? person.items.map(i => `<div class="row"><span>${escapeHtml(i.title)}</span><span>$${Number(i.price || 0).toFixed(2)}</span></div>`).join('')
    : `<div class="row"><span>Parte proporcional (${order.split_type === 'equal' ? 'Partes iguales' : 'Por monto'})</span><span>$${Number(person.amount || 0).toFixed(2)}</span></div>`;

  const w = window.open('', '_blank', 'width=360,height=520');
  if (!w) return;
  w.document.write(`
    <html><head><title>Ticket ${escapeHtml(person.name)}</title>
    <style>
      body { font-family: monospace; font-size: 12px; margin: 18px; }
      .center { text-align: center; }
      .line { border-top: 1px dashed #000; margin: 10px 0; }
      .row { display: flex; justify-content: space-between; margin: 4px 0; }
      .total { font-size: 15px; font-weight: bold; }
    </style></head><body>
      <div class="center">
        <strong>TICKET INDIVIDUAL</strong><br/>
        Mesa ${escapeHtml(order.table_number)} · Orden #${order.order_number || order.id.slice(0, 6)}<br/>
        Comensal: <strong>${escapeHtml(person.name)}</strong><br/>
        ${new Date().toLocaleString()}
      </div>
      <div class="line"></div>
      ${itemsHtml}
      <div class="line"></div>
      <div class="row total"><span>TOTAL A PAGAR:</span><span>$${Number(person.amount || 0).toFixed(2)} MXN</span></div>
      <div class="center" style="margin-top:16px;">¡Gracias por su visita!</div>
    </body></html>
  `);
  w.document.close();
  w.focus();
  w.print();
  w.close();
}

function installGlobalOperationalHooks() {
  if (window.__aureaOpHooksInstalled) return;
  window.__aureaOpHooksInstalled = true;

  document.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('button[onclick]');
    if (!btn) return;
    const oc = btn.getAttribute('onclick') || '';

    const checkoutMatch = oc.match(/openCheckoutModal\(\s*['"]([^'"]+)['"]\s*\)/);
    if (checkoutMatch) {
      lastClickedCheckoutOrderId = checkoutMatch[1];
      setTimeout(() => {
        const modal = findVisibleCheckoutModal();
        if (modal) refreshAndRenderCheckoutSplit(modal);
      }, 60);
    }

    const seatMatch = oc.match(/updateReservationStatus\(\s*['"]([^'"]+)['"]\s*,\s*['"]seated['"]\s*\)/);
    if (seatMatch && client) {
      const resId = seatMatch[1];
      const resObj = (state.reservations || []).find(r => r.id === resId);
      if (resObj?.table_number && resObj.table_number !== 'Por asignar') {
        client
          .from('tables')
          .update({ status: 'occupied' })
          .eq('restaurant_id', REST_ID)
          .eq('table_number', resObj.table_number)
          .then(() => {
            showToast(`🪑 Mesa ${resObj.table_number} marcada como ocupada para ${resObj.customer_name}`, 'info');
          });
      }
    }
  }, true);

  const observer = new MutationObserver(() => {
    const modal = findVisibleCheckoutModal();
    if (modal && !modal.querySelector('#checkoutSplitBreakdownBox')) {
      refreshAndRenderCheckoutSplit(modal);
    }

    const callsGrid = document.getElementById('waiterCallsGrid');
    if (callsGrid && Array.isArray(state.calls) && state.calls.length > 0) {
      state.calls.forEach(c => {
        if (!c.reason) return;
        const resolveBtn = callsGrid.querySelector(`button[onclick*="${c.id}"]`);
        const card = resolveBtn?.closest('.bg-white');
        if (card && !card.querySelector('.call-reason-badge')) {
          const badge = document.createElement('div');
          const isBill = c.reason.includes('Pagar') || c.reason.includes('Cuenta');
          badge.className = `call-reason-badge mt-1.5 inline-block text-[11px] font-bold px-2.5 py-1 rounded-lg ${
            isBill ? 'bg-amber-100 text-amber-950 border border-amber-300' : 'bg-stone-100 text-stone-700'
          }`;
          badge.innerText = c.reason;
          const titleEl = card.querySelector('span, h3, h4');
          if (titleEl && titleEl.parentNode) titleEl.parentNode.appendChild(badge);
        }
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  if (client) {
    client.channel(`bar_ready_alerts_${REST_ID}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${REST_ID}` },
        (payload) => {
          const oldItems = Array.isArray(payload.old?.items) ? payload.old.items : [];
          const newItems = Array.isArray(payload.new?.items) ? payload.new.items : [];
          const newlyDoneBar = newItems.filter((it, i) =>
            (it.station === 'barra') && it.done === true && (!oldItems[i] || oldItems[i].done !== true)
          );
          if (newlyDoneBar.length > 0) {
            playSoundByName('chime');
            const names = newlyDoneBar.map(x => `${x.qty}x ${x.title}`).join(', ');
            showToast(`🍹 Barra lista (Mesa ${payload.new.table_number}): ${names}`, 'success');
          }
        }
      )
      .subscribe();
  }
}

window.saveOrderChannelSettings = saveOrderChannelSettings;
window.toggleWhatsappInputVisibility = toggleWhatsappInputVisibility;
window.loadOrderChannelSettings = loadOrderChannelSettings;
window.toggleCheckoutSplitPersonPaid = toggleCheckoutSplitPersonPaid;
window.changeCheckoutSplitMethod = changeCheckoutSplitMethod;
window.convertGroupOrderToSplit = convertGroupOrderToSplit;
window.printSplitGuestTicket = printSplitGuestTicket;

function bootOperationalEnhancements() {
  injectOrderSettingsCard();
  installGlobalOperationalHooks();
  initCartaEnhancer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(bootOperationalEnhancements, 250));
} else {
  setTimeout(bootOperationalEnhancements, 250);
}
