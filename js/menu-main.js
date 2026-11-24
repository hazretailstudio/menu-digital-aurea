import { generateUUID, escapeHtml, showToast } from './config.js';
import { client, dbWrite, setConnectionBanner } from './state.js';
import { isWithinScheduleUI, validateAndPriceModifiers } from './modifiers.js';
import {
  resolveOrderContext,
  updateOrderContext,
  setGuestName,
  resolveRestaurantBySlug,
  applyReadOnlyMode,
  initTableSession,
  getActiveTableSession,
  resetGroupCartLocal,
  addItemToGroupCart,
  updateGroupCartItemQty,
  removeGroupCartItem,
  clearActiveGroupCart,
  calculateDeliveryFeeRPC,
  submitOrderViaRPC
} from './cart.js';
import { buildWhatsAppOrderUrl, buildTicketWhatsAppUrl } from './whatsapp.js';

let context = resolveOrderContext();
let restaurant = null;
let orderingEnabled = true;

let categories = [];
let types = [];
let products = [];
let legacyModifiers = [];
let modifierGroups = [];
let promotions = [];
let activeOrder = null;

let localCart = [];
let groupCartSummary = { items: [], byGuest: {}, grandTotal: 0 };
let isSubmittingOrder = false;

let selectedTypeId = 'all';
let searchQuery = '';
let currentView = 'menu';

let currentModalProduct = null;
let currentModalGroups = [];
let modalSelections = [];
let modalQty = 1;

let deliveryState = { lat: null, lng: null, fee: 0, infoText: '' };

let waiterCooldownTimer = null;
let waiterCooldownSecs = 0;
let billRequestedRecently = false;
let guestNameResolver = null;

let splitMode = 'equal';
let splitPersonSubMode = 'items';
let splitOrderUnits = [];
let splitPersons = [];

const STATUS_LABELS = {
  pending: { text: '🟡 Recibido en Cocina', cls: 'bg-amber-100 text-amber-900 border-amber-200' },
  preparing: { text: '🍳 En Preparación', cls: 'bg-orange-100 text-orange-900 border-orange-200' },
  delivered: { text: '🍽️ Servido / Listo', cls: 'bg-blue-100 text-blue-900 border-blue-200' },
  paid: { text: '✓ Pagado', cls: 'bg-emerald-100 text-emerald-900 border-emerald-200' }
};

Object.assign(window, {
  connectWifi, callWaiter, requestBillFromTable, openPayBillChoiceModal,
  closePayBillChoiceModal, confirmPayBillRequest, handleClientModifyOrder,
  openSplitBillModal, closeSplitBillModal, selectSplitMode, selectSplitPersonSubMode,
  calculateEqualSplit, addSplitPerson, removeSplitPerson, toggleUnitForPerson,
  updatePersonAmount, saveSplitBill,
  sendTicketToMyWhatsApp, handleSearch, clearSearchInput, filterByType,
  scrollToCategory, openProductModal, closeProductModal, toggleModifierOption,
  changeModalQty, addCurrentModalToCart, updateCartQty, removeCartItem,
  sendOrder, handleNavLeft, switchView, changeOrderType, captureCustomerLocation,
  handlePaymentMethodChange, updateCashChangePreview, promptChangeGuestName,
  submitGuestNameModal, closeGuestNameModal
});

async function initMenu() {
  window.addEventListener('online', () => setConnectionBanner(true));
  window.addEventListener('offline', () => setConnectionBanner(false, 'Sin Wi-Fi. Reconecta para enviar tu pedido.'));

  restaurant = await resolveRestaurantBySlug(context);
  if (restaurant?.is_active === false) {
    document.body.innerHTML = '<div class="min-h-screen flex items-center justify-center p-6 text-center"><div class="bg-white p-8 rounded-3xl shadow-xl max-w-sm"><h1 class="font-bold text-lg text-stone-900">Menú temporalmente suspendido</h1><p class="text-xs text-stone-500 mt-2">Consulta directamente con el restaurante.</p></div></div>';
    return;
  }

  updateTableBadgeUI();
  orderingEnabled = applyReadOnlyMode(restaurant);
  ensureCheckoutExtrasUI();
  ensurePayBillButtonInTracker();
  ensureSplitSubModeUI();
  ensureGuestNameModal();
  ensurePayBillChoiceModal();
  updateSendButtonLabel();
  await loadMenuData();

  if (orderingEnabled && context.order_type === 'DINE_IN') {
    await initTableSession(context, {
      onRequireGuestName: (isExisting) => openGuestNameModalAsync(isExisting),
      onCartChange: (summary) => {
        groupCartSummary = summary;
        renderCart();
      },
      onTableMoved: async (newTableNumber) => {
        if (!newTableNumber || newTableNumber === context.table_number) return;
        context = updateOrderContext({
          table_number: newTableNumber,
          table_label: `Mesa ${newTableNumber}`
        });
        updateTableBadgeUI();
        showToast(`📍 Tu cuenta fue movida a la Mesa ${newTableNumber}`, 'info');
        await loadMenuData();
        renderLiveOrderTracker();
      }
    });
  }

  renderAll();
  subscribeMenuRealtime();
}

function updateTableBadgeUI() {
  const badge = document.getElementById('tableBadge');
  if (!badge) return;
  badge.innerText = context.order_type === 'DINE_IN'
    ? context.table_label
    : (context.order_type === 'DELIVERY' ? '🛵 Domicilio' : '🛍️ Recoger');
}

function ensureGuestNameModal() {
  if (document.getElementById('guestNameModal')) return;
  const m = document.createElement('div');
  m.id = 'guestNameModal';
  m.className = 'fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
  m.innerHTML = `
    <div class="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
      <div class="space-y-1">
        <span class="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">Pedido en Mesa</span>
        <h3 class="font-serif text-xl font-bold text-stone-900">¿Cómo te llamas?</h3>
        <p id="guestNameModalDesc" class="text-xs text-stone-500">Etiquetamos tus platillos con tu nombre para facilitar la entrega y dividir la cuenta.</p>
      </div>
      <input type="text" id="guestNameModalInput" placeholder="Ej. Sofía, Carlos..."
        class="w-full border-2 border-stone-200 focus:border-amber-600 rounded-2xl px-4 py-3 text-sm font-bold text-stone-900 outline-none bg-stone-50">
      <div class="flex gap-2">
        <button type="button" onclick="window.closeGuestNameModal()" class="px-4 py-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-500">Omitir</button>
        <button type="button" onclick="window.submitGuestNameModal()" class="flex-grow bg-stone-900 hover:bg-stone-800 text-white font-bold py-3 rounded-xl text-xs shadow-md transition">
          Continuar al Menú →
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
}

function openGuestNameModalAsync(isExistingSession = false) {
  ensureGuestNameModal();
  const modal = document.getElementById('guestNameModal');
  const desc = document.getElementById('guestNameModalDesc');
  const input = document.getElementById('guestNameModalInput');
  if (desc) {
    desc.innerText = isExistingSession
      ? `Ya hay un pedido grupal abierto en ${context.table_label}. Escribe tu nombre para identificar tus platillos.`
      : `Bienvenido a ${context.table_label}. Escribe tu nombre para organizar tu orden y tu cuenta.`;
  }
  if (input) {
    input.value = context.guest_name || '';
    setTimeout(() => input.focus(), 120);
  }
  modal.classList.remove('hidden');
  return new Promise(resolve => { guestNameResolver = resolve; });
}

function submitGuestNameModal() {
  const input = document.getElementById('guestNameModalInput');
  const name = (input?.value || '').trim() || 'Invitado';
  context.guest_name = setGuestName(name);
  const el = document.getElementById('guestNameDisplay');
  if (el) el.innerText = context.guest_name;
  document.getElementById('guestNameModal')?.classList.add('hidden');
  if (guestNameResolver) {
    const r = guestNameResolver;
    guestNameResolver = null;
    r(context.guest_name);
  }
}

function closeGuestNameModal() {
  document.getElementById('guestNameModal')?.classList.add('hidden');
  if (guestNameResolver) {
    const r = guestNameResolver;
    guestNameResolver = null;
    r(context.guest_name || 'Invitado');
  }
}

function promptChangeGuestName() { openGuestNameModalAsync(false); }

function ensurePayBillChoiceModal() {
  if (document.getElementById('payBillChoiceModal')) return;
  const m = document.createElement('div');
  m.id = 'payBillChoiceModal';
  m.className = 'fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
  m.innerHTML = `
    <div class="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
      <div class="flex justify-between items-start border-b pb-3">
        <div>
          <h3 class="font-bold text-base text-stone-900">💳 Solicitar la Cuenta</h3>
          <p class="text-xs text-stone-500">Elige cómo prefieres pagar para avisar al mesero.</p>
        </div>
        <button type="button" onclick="window.closePayBillChoiceModal()" class="text-stone-400 font-bold text-lg">✕</button>
      </div>
      <div class="space-y-2 text-xs font-bold">
        <button type="button" onclick="window.confirmPayBillRequest('Tarjeta (Llevar Terminal TPV)')" class="w-full p-3.5 rounded-2xl border-2 border-stone-200 hover:border-amber-500 bg-stone-50 flex items-center justify-between transition">
          <span>💳 Tarjeta (Traer Terminal TPV)</span><span>→</span>
        </button>
        <button type="button" onclick="window.confirmPayBillRequest('Efectivo')" class="w-full p-3.5 rounded-2xl border-2 border-stone-200 hover:border-amber-500 bg-stone-50 flex items-center justify-between transition">
          <span>💵 Efectivo</span><span>→</span>
        </button>
        <button type="button" onclick="window.confirmPayBillRequest('Cuenta Dividida / Mixto')" class="w-full p-3.5 rounded-2xl border-2 border-amber-300 bg-amber-50 text-amber-950 flex items-center justify-between transition">
          <span>👥 Cuenta Dividida / Pago Mixto</span><span>→</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
}

function openPayBillChoiceModal() {
  ensurePayBillChoiceModal();
  document.getElementById('payBillChoiceModal')?.classList.remove('hidden');
}

function closePayBillChoiceModal() {
  document.getElementById('payBillChoiceModal')?.classList.add('hidden');
}

function ensurePayBillButtonInTracker() {
  const tracker = document.getElementById('liveOrderTracker');
  if (!tracker || document.getElementById('btnPayBillNow')) return;

  const waBtn = tracker.querySelector('button[onclick*="sendTicketToMyWhatsApp"]');
  const payBtn = document.createElement('button');
  payBtn.id = 'btnPayBillNow';
  payBtn.type = 'button';
  payBtn.onclick = requestBillFromTable;
  payBtn.className = 'w-full bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition';
  payBtn.innerHTML = '<span>💳 Pagar la Cuenta (Llamar al Mesero)</span>';

  if (waBtn && waBtn.parentNode) waBtn.parentNode.insertBefore(payBtn, waBtn);
  else tracker.querySelector('.bg-white')?.appendChild(payBtn);
}

function ensureSplitSubModeUI() {
  const area = document.getElementById('splitByPersonArea');
  if (!area || document.getElementById('splitPersonSubModeBar')) return;

  const bar = document.createElement('div');
  bar.id = 'splitPersonSubModeBar';
  bar.className = 'space-y-2.5';
  bar.innerHTML = `
    <div class="grid grid-cols-2 gap-1.5 bg-stone-100 p-1 rounded-xl text-[11px] font-bold">
      <button type="button" id="btnSubModeItems" onclick="window.selectSplitPersonSubMode('items')" class="py-1.5 rounded-lg bg-white text-stone-900 shadow-xs transition">
        🍽️ Por Artículos
      </button>
      <button type="button" id="btnSubModeAmount" onclick="window.selectSplitPersonSubMode('amount')" class="py-1.5 rounded-lg text-stone-500 transition">
        💵 Por Cantidad ($)
      </button>
    </div>
    <div id="splitMissingBanner" class="rounded-2xl p-3 border text-xs space-y-1.5"></div>
  `;
  area.prepend(bar);
}

function evaluatePromotionsUI(items) {
  if (!promotions || promotions.length === 0 || !items || items.length === 0) {
    return { discount: 0, applied: [] };
  }

  const tz = restaurant?.timezone || 'America/Mexico_City';
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[parts.weekday];
  const curTime = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:${parts.second}`;

  let totalDiscount = 0;
  const applied = [];

  for (const promo of promotions) {
    if (Array.isArray(promo.days_of_week) && promo.days_of_week.length > 0 && !promo.days_of_week.includes(dow)) continue;
    if (promo.start_time && promo.end_time && (curTime < promo.start_time || curTime > promo.end_time)) continue;

    let promoDisc = 0;
    for (const it of items) {
      const prodId = it.product_id || it.id;
      const prod = products.find(p => p.id === prodId) || it.products || {};
      const scope = promo.scope_type || 'all';
      let eligible = false;

      if (scope === 'all') eligible = true;
      else if (scope === 'category' && Array.isArray(promo.applied_category_ids) && promo.applied_category_ids.includes(prod.category_id)) eligible = true;
      else if (scope === 'type' && Array.isArray(promo.applied_type_ids) && promo.applied_type_ids.includes(prod.type_id)) eligible = true;
      else if (scope === 'product' && Array.isArray(promo.applied_product_ids) && promo.applied_product_ids.includes(prodId)) eligible = true;

      if (!eligible) continue;

      const qty = Math.max(1, Number(it.qty || 1));
      const unitPrice = Number(it.unit_price || it.price || 0);

      if (promo.promo_type === '2x1') {
        const freeUnits = Math.floor(qty / 2);
        if (freeUnits > 0) promoDisc += freeUnits * unitPrice;
      } else if (Number(promo.discount_percentage || 0) > 0) {
        promoDisc += (qty * unitPrice) * (Number(promo.discount_percentage) / 100);
      }
    }

    if (promoDisc > 0) {
      totalDiscount += promoDisc;
      applied.push(`${promo.title} (-$${promoDisc.toFixed(2)})`);
    }
  }

  return { discount: Number(totalDiscount.toFixed(2)), applied };
}

function updateSendButtonLabel() {
  const btn = document.getElementById('btnSendOrder');
  if (!btn) return;
  const mode = restaurant?.order_delivery_mode || 'KDS';
  const hasActiveTicket = Boolean(activeOrder && context.order_type === 'DINE_IN');

  if (mode === 'WHATSAPP') btn.innerText = '💬 Enviar Pedido por WhatsApp';
  else if (mode === 'BOTH') btn.innerText = hasActiveTicket ? '➕ Sumar a mi Ticket y Abrir WhatsApp' : '🍽️ Confirmar Pedido y Abrir WhatsApp';
  else btn.innerText = hasActiveTicket ? '➕ Sumar al Ticket en Cocina' : '🍽️ Enviar Pedido a Cocina';
}

async function loadMenuData() {
  if (!client || !context.restaurant_id) return;
  const rId = context.restaurant_id;

  const [catRes, typRes, prodRes, modRes, grpRes, promoRes, ordRes] = await Promise.all([
    client.from('categories').select('*').eq('restaurant_id', rId).order('order_index', { ascending: true }),
    client.from('product_types').select('*').eq('restaurant_id', rId).order('order_index', { ascending: true }),
    client.from('products').select('*').eq('restaurant_id', rId).order('created_at', { ascending: false }),
    client.from('product_modifiers').select('*').eq('restaurant_id', rId).order('name', { ascending: true }),
    client.from('modifier_groups').select('*, modifier_options(*)').eq('restaurant_id', rId).order('order_index', { ascending: true }),
    client.from('promotions').select('*').eq('restaurant_id', rId).eq('is_active', true),
    client.from('orders').select('*')
      .eq('restaurant_id', rId)
      .eq('table_number', context.table_number)
      .eq('is_archived', false)
      .not('status', 'in', '("paid","cancelled")')
      .order('created_at', { ascending: false })
      .limit(1)
  ]);

  if (restaurant) {
    const elName = document.getElementById('restName');
    const elDesc = document.getElementById('restDesc');
    const elLogo = document.getElementById('restLogo');
    const elBanner = document.getElementById('restBanner');
    if (elName) elName.innerText = restaurant.name || 'Menú Digital';
    if (elDesc) elDesc.innerText = restaurant.description || '';
    if (elLogo && restaurant.logo_url) elLogo.src = restaurant.logo_url;
    if (elBanner && restaurant.banner_url) elBanner.src = restaurant.banner_url;
  }

  categories = catRes?.data || [];
  types = typRes?.data || [];
  products = prodRes?.data || [];
  legacyModifiers = modRes?.data || [];
  modifierGroups = grpRes?.data || [];
  promotions = promoRes?.data || [];
  activeOrder = ordRes?.data?.[0] || null;
  updateSendButtonLabel();
}

function subscribeMenuRealtime() {
  if (!client || !context.restaurant_id) return;
  const rId = context.restaurant_id;

  client.channel(`menu_live_${rId}_${context.table_number}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rId}` }, async () => {
      const { data } = await client.from('orders').select('*')
        .eq('restaurant_id', rId)
        .eq('table_number', context.table_number)
        .eq('is_archived', false)
        .not('status', 'in', '("paid","cancelled")')
        .order('created_at', { ascending: false })
        .limit(1);
      activeOrder = data?.[0] || null;
      renderLiveOrderTracker();
      updateSendButtonLabel();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `restaurant_id=eq.${rId}` }, async () => {
      const { data } = await client.from('products').select('*').eq('restaurant_id', rId).order('created_at', { ascending: false });
      if (data) {
        products = data;
        renderCatalog();
        renderCart();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promotions', filter: `restaurant_id=eq.${rId}` }, async () => {
      const { data } = await client.from('promotions').select('*').eq('restaurant_id', rId).eq('is_active', true);
      if (data) {
        promotions = data;
        renderPromos();
        renderCart();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_modifiers', filter: `restaurant_id=eq.${rId}` }, async () => {
      const { data } = await client.from('product_modifiers').select('*').eq('restaurant_id', rId).order('name', { ascending: true });
      if (data) legacyModifiers = data;
    })
    .subscribe();
}

function ensureCheckoutExtrasUI() {
  const orderView = document.getElementById('orderView');
  if (!orderView || document.getElementById('checkoutExtrasBox')) return;

  const box = document.createElement('div');
  box.id = 'checkoutExtrasBox';
  box.className = 'bg-white rounded-3xl p-4 border border-stone-200 space-y-3 text-xs mt-4';
  box.innerHTML = `
    <div class="flex items-center justify-between border-b pb-2">
      <span class="font-bold text-stone-800">👤 Comensal: <b id="guestNameDisplay">${escapeHtml(context.guest_name || 'Sin nombre')}</b></span>
      <button onclick="window.promptChangeGuestName()" class="text-amber-700 font-bold underline">Cambiar</button>
    </div>
    <div>
      <label class="block font-bold text-stone-700 mb-1">Modalidad de Pedido:</label>
      <div class="grid grid-cols-3 gap-1.5">
        <button type="button" onclick="window.changeOrderType('DINE_IN')" id="btnMode-DINE_IN" class="py-2 rounded-xl border font-bold">🍽️ Mesa</button>
        <button type="button" onclick="window.changeOrderType('PICKUP')" id="btnMode-PICKUP" class="py-2 rounded-xl border font-bold">🛍️ Recoger</button>
        <button type="button" onclick="window.changeOrderType('DELIVERY')" id="btnMode-DELIVERY" class="py-2 rounded-xl border font-bold">🛵 Envío</button>
      </div>
    </div>
    <div id="deliveryFieldsBox" class="hidden space-y-2 pt-1 border-t">
      <input type="text" id="checkoutCustomerPhone" placeholder="Teléfono WhatsApp (10 dígitos)" class="w-full border rounded-xl p-2.5 bg-stone-50">
      <input type="text" id="checkoutDeliveryAddress" placeholder="Calle, número, colonia y referencias" class="w-full border rounded-xl p-2.5 bg-stone-50">
      <button type="button" onclick="window.captureCustomerLocation()" class="w-full py-2.5 rounded-xl bg-stone-900 text-white font-bold">📍 Usar mi ubicación y calcular envío</button>
      <p id="deliveryFeeStatus" class="text-[11px] font-semibold text-stone-500"></p>
    </div>
    <div class="space-y-2 pt-1 border-t">
      <label class="block font-bold text-stone-700">Método de Pago:</label>
      <select id="checkoutPaymentMethod" onchange="window.handlePaymentMethodChange(this.value)" class="w-full border rounded-xl p-2.5 bg-stone-50 font-semibold">
        <option value="CASH">💵 Efectivo</option>
        <option value="CARD_TERMINAL">💳 Tarjeta (Terminal Física TPV)</option>
        <option value="TRANSFER">🏦 Transferencia SPEI</option>
      </select>
      <div id="cashTenderedBox" class="space-y-1">
        <input type="number" id="checkoutCashTendered" oninput="window.updateCashChangePreview()" placeholder="¿Con cuánto pagas? (Ej. 500)" class="w-full border rounded-xl p-2.5 bg-stone-50 font-mono">
        <p id="cashChangePreview" class="text-[11px] font-bold text-emerald-700"></p>
      </div>
    </div>
  `;

  const sendBtn = document.getElementById('btnSendOrder');
  if (sendBtn && sendBtn.parentNode) sendBtn.parentNode.insertBefore(box, sendBtn);
  else orderView.appendChild(box);
  syncOrderTypeButtons();
}

function syncOrderTypeButtons() {
  ['DINE_IN', 'PICKUP', 'DELIVERY'].forEach(m => {
    const btn = document.getElementById(`btnMode-${m}`);
    if (!btn) return;
    btn.className = context.order_type === m
      ? 'py-2 rounded-xl border-2 border-amber-600 bg-amber-50 text-amber-900 font-bold'
      : 'py-2 rounded-xl border border-stone-200 bg-white text-stone-600 font-bold';
  });
  const delBox = document.getElementById('deliveryFieldsBox');
  if (delBox) delBox.classList.toggle('hidden', context.order_type !== 'DELIVERY');
}

function changeOrderType(type) {
  context = updateOrderContext({ order_type: type });
  updateTableBadgeUI();
  syncOrderTypeButtons();
  updateSendButtonLabel();
  renderCart();
}

function handlePaymentMethodChange(method) {
  const cashBox = document.getElementById('cashTenderedBox');
  if (cashBox) cashBox.classList.toggle('hidden', method !== 'CASH');
}

function updateCashChangePreview() {
  const tendered = Number(document.getElementById('checkoutCashTendered')?.value || 0);
  const { total } = getCurrentTotals();
  const prev = document.getElementById('cashChangePreview');
  if (!prev) return;
  if (!tendered) { prev.innerText = ''; return; }
  const diff = tendered - total;
  prev.innerText = diff >= 0 ? `Cambio a llevar: $${diff.toFixed(2)} MXN` : `Faltan $${Math.abs(diff).toFixed(2)} MXN`;
  prev.className = diff >= 0 ? 'text-[11px] font-bold text-emerald-700' : 'text-[11px] font-bold text-rose-600';
}

async function captureCustomerLocation() {
  const statusEl = document.getElementById('deliveryFeeStatus');
  if (!navigator.geolocation) { showToast('Tu navegador no soporta geolocalización.', 'error'); return; }
  if (statusEl) statusEl.innerText = 'Obteniendo ubicación...';

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const { subtotal, discount } = getCurrentTotals();
      const res = await calculateDeliveryFeeRPC(context.restaurant_id, lat, lng, Math.max(0, subtotal - discount));
      deliveryState = {
        lat, lng, fee: Number(res.fee || 0),
        infoText: res.mode === 'ZONE'
          ? `✓ Zona ${res.zone_name}: Envío $${Number(res.fee).toFixed(2)} MXN`
          : `✓ Distancia ${res.distance_km} km: Envío $${Number(res.fee).toFixed(2)} MXN`
      };
      if (statusEl) {
        statusEl.innerText = deliveryState.infoText;
        statusEl.className = 'text-[11px] font-bold text-emerald-700';
      }
      renderCart();
    } catch (err) {
      deliveryState = { lat: null, lng: null, fee: 0, infoText: err.message };
      if (statusEl) {
        statusEl.innerText = `⚠️ ${err.message}`;
        statusEl.className = 'text-[11px] font-bold text-rose-600';
      }
    }
  }, () => {
    if (statusEl) statusEl.innerText = '⚠️ Activa el permiso de ubicación para calcular el envío.';
  });
}

function renderAll() {
  renderLiveOrderTracker();
  renderTypesFilter();
  renderCategoryTabs();
  renderCatalog();
  renderPromos();
  renderCart();
}

function renderLiveOrderTracker() {
  const box = document.getElementById('liveOrderTracker');
  if (!box) return;
  if (!activeOrder) { box.classList.add('hidden'); return; }

  ensurePayBillButtonInTracker();
  box.classList.remove('hidden');
  document.getElementById('trackerOrderId').innerText = `#${activeOrder.order_number || (activeOrder.id || '').substring(0, 6).toUpperCase()}`;
  const stInfo = STATUS_LABELS[activeOrder.status] || { text: activeOrder.status, cls: 'bg-stone-100 text-stone-800 border-stone-200' };
  const badge = document.getElementById('trackerStatusBadge');
  badge.innerText = stInfo.text;
  badge.className = `px-3 py-1 rounded-full text-xs font-bold border ${stInfo.cls}`;

  const items = (activeOrder.items?.length ? activeOrder.items : activeOrder.items_snapshot) || [];
  document.getElementById('trackerItemsList').innerHTML = items.map(it => {
    const mods = (it.modifiers || []).map(m => m.name).join(', ');
    return `
      <div class="py-1.5 flex justify-between items-start gap-2">
        <div>
          <span class="font-bold text-stone-800">${it.qty}x ${escapeHtml(it.title)}</span>
          ${it.guest_name ? `<span class="ml-1 text-[10px] text-stone-400">(${escapeHtml(it.guest_name)})</span>` : ''}
          ${mods ? `<span class="block text-[10px] text-amber-800">+ ${escapeHtml(mods)}</span>` : ''}
          ${it.note ? `<span class="block text-[10px] text-stone-500 italic">"${escapeHtml(it.note)}"</span>` : ''}
        </div>
        <span class="font-mono font-bold text-stone-700">$${(Number(it.price || it.unit_price) * Number(it.qty)).toFixed(2)}</span>
      </div>
    `;
  }).join('');

  const discountTxt = Number(activeOrder.discount || 0) > 0 ? ` (Ahorro -$${Number(activeOrder.discount).toFixed(2)})` : '';
  document.getElementById('trackerTotalAmount').innerText = `$${Number(activeOrder.total || 0).toFixed(2)} MXN${discountTxt}`;

  const splitBadge = document.getElementById('trackerSplitSummaryBadge');
  const splitTxt = document.getElementById('trackerSplitSummaryText');
  if (splitBadge && splitTxt) {
    if (activeOrder.split_type && activeOrder.split_type !== 'single' && Array.isArray(activeOrder.split_details) && activeOrder.split_details.length > 0) {
      splitBadge.classList.remove('hidden');
      splitTxt.innerText = activeOrder.split_details.map(p => `${p.name}: $${Number(p.amount).toFixed(0)}`).join(' · ');
    } else {
      splitBadge.classList.add('hidden');
    }
  }
}

function renderTypesFilter() {
  const cont = document.getElementById('typesFilterContainer');
  if (!cont) return;
  const allBtn = `<button onclick="window.filterByType('all')" class="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border ${selectedTypeId === 'all' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200'}">Todos</button>`;
  cont.innerHTML = allBtn + types.map(t => `
    <button onclick="window.filterByType('${t.id}')" class="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border ${selectedTypeId === t.id ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-stone-700 border-stone-200'}">
      ${escapeHtml(t.icon || '🏷️')} ${escapeHtml(t.name)}
    </button>
  `).join('');
}

function filterByType(typeId) {
  selectedTypeId = typeId;
  renderTypesFilter();
  renderCatalog();
}

function renderCategoryTabs() {
  const cont = document.getElementById('categoryTabs');
  if (!cont) return;
  cont.innerHTML = categories.map(c => `
    <button onclick="window.scrollToCategory('${c.id}')" class="px-3.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 border border-stone-200 text-xs font-bold text-stone-800 whitespace-nowrap shadow-xs transition">
      ${escapeHtml(c.icon || '🍽️')} ${escapeHtml(c.name)}
    </button>
  `).join('');
}

function scrollToCategory(catId) {
  const el = document.getElementById(`cat-section-${catId}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getFilteredProducts() {
  return products.filter(p => {
    if (selectedTypeId !== 'all' && p.type_id !== selectedTypeId) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(p.title || '').toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderCatalog() {
  const cont = document.getElementById('menuContainer');
  if (!cont) return;
  const filtered = getFilteredProducts();
  const tz = restaurant?.timezone || 'America/Mexico_City';

  if (filtered.length === 0) {
    cont.innerHTML = '<div class="text-center py-12 bg-white rounded-3xl border border-stone-200 text-xs text-stone-400">No encontramos platillos con ese filtro.</div>';
    return;
  }

  const sections = [];
  categories.forEach(cat => {
    const items = filtered.filter(p => p.category_id === cat.id);
    const inHours = isWithinScheduleUI(cat.schedule_hours, tz);
    if (items.length > 0) sections.push({ id: cat.id, title: `${cat.icon || '🍽️'} ${cat.name}`, inHours, items });
  });
  const uncategorized = filtered.filter(p => !categories.some(c => c.id === p.category_id));
  if (uncategorized.length > 0) sections.push({ id: 'other', title: '🍽️ Especialidades', inHours: true, items: uncategorized });

  cont.innerHTML = sections.map(sec => `
    <section id="cat-section-${sec.id}" class="space-y-3 scroll-mt-16">
      <div class="flex items-center justify-between">
        <h2 class="font-serif text-xl font-bold text-stone-900">${escapeHtml(sec.title)}</h2>
        ${!sec.inHours ? '<span class="text-[10px] font-bold bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full">Fuera de horario</span>' : ''}
      </div>
      <div class="space-y-3">
        ${sec.items.map(p => {
          const firstImg = (p.media || []).find(m => m.type !== 'video') || p.media?.[0];
          const img = firstImg?.url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
          const hasVideo = (p.media || []).some(m => m.type === 'video');
          const disabled = p.is_available === false || !sec.inHours;
          return `
            <div onclick="${disabled ? '' : `window.openProductModal('${p.id}')`}" class="bg-white rounded-2xl p-3 border border-stone-200/80 shadow-xs flex gap-3 items-center transition ${disabled ? 'opacity-60 grayscale cursor-not-allowed' : 'cursor-pointer hover:border-amber-400'}">
              <div class="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-stone-100 relative">
                <img src="${img}" alt="${escapeHtml(p.title)}" class="w-full h-full object-cover">
                ${hasVideo ? '<span class="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">🎬 Video</span>' : ''}
                ${p.is_available === false ? '<div class="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] font-black text-white uppercase">Agotado</div>' : ''}
              </div>
              <div class="flex-grow min-w-0">
                <h3 class="font-bold text-sm text-stone-900 leading-snug">${escapeHtml(p.title)}</h3>
                <p class="text-xs text-stone-500 mt-1 line-clamp-2">${escapeHtml(p.description || '')}</p>
                <div class="flex items-center justify-between mt-2">
                  <span class="font-mono font-extrabold text-sm text-amber-800">$${Number(p.price).toFixed(2)}</span>
                  ${orderingEnabled && !disabled ? '<span class="text-[11px] font-bold bg-stone-900 text-white px-2.5 py-1 rounded-xl">+ Agregar</span>' : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `).join('');
}

function handleSearch(val) {
  searchQuery = val.trim();
  const clearBtn = document.getElementById('clearSearch');
  if (clearBtn) clearBtn.classList.toggle('hidden', !searchQuery);
  renderCatalog();
}

function clearSearchInput() {
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  handleSearch('');
}

function ensureModalItemNoteAndQty() {
  const modSec = document.getElementById('modalModifiersSection');
  if (!modSec || document.getElementById('modalItemNote')) return;

  const extra = document.createElement('div');
  extra.className = 'border-t border-stone-100 pt-4 space-y-3';
  extra.innerHTML = `
    <div>
      <label class="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">Indicaciones para este platillo (Opcional)</label>
      <input type="text" id="modalItemNote" placeholder="Ej. Sin cebolla, salsa aparte, muy caliente..."
        class="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-xs bg-stone-50 outline-none focus:border-amber-600">
    </div>
    <div class="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2">
      <span class="text-xs font-bold text-stone-700">Cantidad</span>
      <div class="flex items-center gap-3">
        <button type="button" onclick="window.changeModalQty(-1)" class="w-7 h-7 rounded-xl bg-white border font-black text-sm">−</button>
        <span id="modalQtyDisplay" class="font-mono font-black text-sm w-5 text-center">1</span>
        <button type="button" onclick="window.changeModalQty(1)" class="w-7 h-7 rounded-xl bg-white border font-black text-sm">+</button>
      </div>
    </div>
  `;
  modSec.insertAdjacentElement('afterend', extra);
}

function openProductModal(prodId) {
  const p = products.find(x => x.id === prodId);
  if (!p || p.is_available === false) return;
  ensureModalItemNoteAndQty();

  currentModalProduct = p;
  currentModalGroups = modifierGroups.filter(g => g.product_id === p.id);
  modalSelections = [];
  modalQty = 1;

  const mediaItems = (p.media && p.media.length > 0)
    ? p.media
    : [{ type: 'image', url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80' }];

  document.getElementById('modalMediaCarousel').innerHTML = mediaItems.map((m, idx) => {
    const counter = mediaItems.length > 1
      ? `<span class="absolute bottom-2 right-2 bg-black/65 text-white text-[10px] font-bold px-2 py-0.5 rounded-full pointer-events-none">${idx + 1}/${mediaItems.length} · Desliza →</span>`
      : '';
    if (m.type === 'video') {
      const ytMatch = (m.url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/);
      if (ytMatch) {
        return `<div class="relative w-full h-full flex-shrink-0 snap-center bg-black"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" class="w-full h-full" frameborder="0" allowfullscreen></iframe>${counter}</div>`;
      }
      return `<div class="relative w-full h-full flex-shrink-0 snap-center bg-black"><video src="${m.url}" controls playsinline preload="metadata" class="w-full h-full object-cover"></video>${counter}</div>`;
    }
    return `<div class="relative w-full h-full flex-shrink-0 snap-center"><img src="${m.url}" class="w-full h-full object-cover">${counter}</div>`;
  }).join('');

  document.getElementById('modalTitle').innerText = p.title;
  document.getElementById('modalPrice').innerText = `$${Number(p.price).toFixed(2)}`;
  document.getElementById('modalDesc').innerText = p.description || '';
  const noteInput = document.getElementById('modalItemNote');
  if (noteInput) noteInput.value = '';
  const qtyEl = document.getElementById('modalQtyDisplay');
  if (qtyEl) qtyEl.innerText = '1';

  const modSec = document.getElementById('modalModifiersSection');
  const modList = document.getElementById('modifiersList');

  if (currentModalGroups.length > 0) {
    modSec?.classList.remove('hidden');
    if (modList) {
      modList.innerHTML = currentModalGroups.map(g => `
        <div class="space-y-1.5 mb-3">
          <div class="flex justify-between items-center text-xs">
            <span class="font-bold text-stone-900">${escapeHtml(g.name)}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${g.is_required ? 'bg-amber-100 text-amber-900' : 'bg-stone-100 text-stone-500'}">
              ${g.is_required ? 'Obligatorio' : 'Opcional'} · Máx ${g.max_selections}
            </span>
          </div>
          ${(g.modifier_options || []).filter(o => o.is_available !== false).map(o => `
            <label class="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer text-xs">
              <div class="flex items-center gap-2">
                <input type="${g.max_selections === 1 ? 'radio' : 'checkbox'}" name="grp_${g.id}"
                  onchange="window.toggleModifierOption('${g.id}', '${o.id}', this.checked, ${g.max_selections === 1})" class="accent-amber-600 w-4 h-4">
                <span class="font-semibold text-stone-800">${escapeHtml(o.name)}</span>
              </div>
              <span class="font-mono font-bold text-amber-800">${Number(o.price) > 0 ? `${g.pricing_type === 'OVERRIDE' ? '' : '+'}$${Number(o.price).toFixed(2)}` : 'Sin costo'}</span>
            </label>
          `).join('')}
        </div>
      `).join('');
    }
  } else {
    const applicable = legacyModifiers.filter(m =>
      m.is_available !== false &&
      (!m.applies_to_products || m.applies_to_products.length === 0 || m.applies_to_products.includes(p.id))
    );
    if (applicable.length > 0) {
      modSec?.classList.remove('hidden');
      if (modList) {
        modList.innerHTML = applicable.map(m => `
          <label class="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer text-xs">
            <div class="flex items-center gap-2">
              <input type="checkbox" onchange="window.toggleModifierOption('', '${m.id}', this.checked, false)" class="accent-amber-600 w-4 h-4">
              <span class="font-semibold text-stone-800">${escapeHtml(m.name)}</span>
            </div>
            <span class="font-mono font-bold text-amber-800">${Number(m.price) > 0 ? `+$${Number(m.price).toFixed(2)}` : 'Sin costo'}</span>
          </label>
        `).join('');
      }
    } else {
      modSec?.classList.add('hidden');
    }
  }

  const addBtn = document.getElementById('modalAddBtn');
  if (addBtn) addBtn.onclick = addCurrentModalToCart;

  updateModalFinalPrice();
  document.getElementById('productModal').classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
  currentModalProduct = null;
}

// FIX: Normaliza groupId || null para que al deseleccionar siempre reste y nunca duplique
function toggleModifierOption(groupId, optionId, checked, isSingle) {
  const normGroupId = groupId || null;
  if (isSingle) {
    modalSelections = modalSelections.filter(s => (s.group_id || null) !== normGroupId);
  } else {
    modalSelections = modalSelections.filter(s => !((s.group_id || null) === normGroupId && s.option_id === optionId));
  }
  if (checked) {
    const alreadyExists = modalSelections.some(s => (s.group_id || null) === normGroupId && s.option_id === optionId);
    if (!alreadyExists) {
      modalSelections.push({ group_id: normGroupId, option_id: optionId, qty: 1 });
    }
  }
  updateModalFinalPrice();
}

function changeModalQty(delta) {
  modalQty = Math.max(1, modalQty + delta);
  const qtyEl = document.getElementById('modalQtyDisplay');
  if (qtyEl) qtyEl.innerText = modalQty;
  updateModalFinalPrice();
}

function updateModalFinalPrice() {
  if (!currentModalProduct) return;
  const pricing = validateAndPriceModifiers(currentModalProduct, currentModalGroups, legacyModifiers, modalSelections);
  const priceEl = document.getElementById('modalFinalPrice');
  if (priceEl) priceEl.innerText = `$${(pricing.unitPrice * modalQty).toFixed(2)}`;
}

async function addCurrentModalToCart() {
  if (!currentModalProduct || !orderingEnabled) return;
  const pricing = validateAndPriceModifiers(currentModalProduct, currentModalGroups, legacyModifiers, modalSelections);
  if (!pricing.valid) {
    showToast(pricing.errors[0], 'warning');
    return;
  }

  const note = document.getElementById('modalItemNote')?.value?.trim() || '';
  const session = getActiveTableSession();

  if (context.order_type === 'DINE_IN' && session) {
    if (!context.guest_name) await openGuestNameModalAsync(true);
    try {
      await addItemToGroupCart({
        restaurantId: context.restaurant_id,
        guestName: context.guest_name || 'Invitado',
        productId: currentModalProduct.id,
        qty: modalQty,
        selectedModifiers: pricing.selectedModifiers,
        unitPrice: pricing.unitPrice,
        notes: note
      });
      closeProductModal();
      showToast(`Agregado al carrito (${context.guest_name})`, 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
    return;
  }

  localCart.push({
    product_id: currentModalProduct.id,
    title: currentModalProduct.title,
    guest_name: context.guest_name || 'Cliente',
    unit_price: pricing.unitPrice,
    qty: modalQty,
    selected_modifiers: pricing.selectedModifiers,
    notes: note
  });
  renderCart();
  closeProductModal();
  showToast(`Agregado: ${modalQty}x ${currentModalProduct.title}`, 'success');
}

function getActiveCartItems() {
  if (context.order_type === 'DINE_IN' && getActiveTableSession()) return groupCartSummary.items;
  return localCart;
}

function isCartItemUnavailable(it) {
  const prod = products.find(p => p.id === (it.product_id || it.id));
  if (prod && prod.is_available === false) return true;
  if (it.products && it.products.is_available === false) return true;
  return false;
}

function getCurrentTotals() {
  const items = getActiveCartItems();
  const subtotal = items.reduce((acc, it) => acc + (Number(it.unit_price) * Number(it.qty)), 0);
  const { discount, applied } = evaluatePromotionsUI(items);
  const safeDiscount = Math.min(subtotal, discount);
  const deliveryFee = context.order_type === 'DELIVERY' ? Number(deliveryState.fee || 0) : 0;
  const total = Math.max(0, (subtotal - safeDiscount) + deliveryFee);
  return { subtotal, discount: safeDiscount, appliedPromos: applied, deliveryFee, total };
}

function renderCart() {
  const items = getActiveCartItems();
  const hasItems = items.length > 0;
  const totalQty = items.reduce((acc, it) => acc + Number(it.qty), 0);
  const hasUnavailable = items.some(isCartItemUnavailable);

  const navBadge = document.getElementById('navOrderBadge');
  if (navBadge) {
    navBadge.innerText = totalQty;
    navBadge.classList.toggle('hidden', totalQty === 0);
  }
  const countBadge = document.getElementById('orderItemsCountBadge');
  if (countBadge) countBadge.innerText = `${totalQty} ítems`;

  const extrasBox = document.getElementById('checkoutExtrasBox');
  const sendBtn = document.getElementById('btnSendOrder');
  const notesCard = document.getElementById('orderCustomerNotes')?.closest('.bg-white');
  if (extrasBox) extrasBox.classList.toggle('hidden', !hasItems);
  if (sendBtn) {
    sendBtn.classList.toggle('hidden', !hasItems || !orderingEnabled);
    sendBtn.disabled = hasUnavailable || isSubmittingOrder;
  }
  if (notesCard) notesCard.classList.toggle('hidden', !hasItems);

  const list = document.getElementById('orderItemsList');
  if (!list) return;

  if (!hasItems) {
    list.innerHTML = `
      <div class="text-center py-8 space-y-2">
        <p class="text-xs text-stone-500 font-medium">${activeOrder ? 'Tu pedido ya fue enviado a cocina ✓' : 'No hay platillos pendientes por enviar.'}</p>
        <p class="text-[11px] text-stone-400">Si deseas agregar algo más a tu ticket, selecciónalo desde el menú.</p>
        <button onclick="window.switchView('menu')" class="mt-2 px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold">
          📖 Volver al Menú
        </button>
      </div>
    `;
  } else {
    const byGuest = {};
    items.forEach((it, idx) => {
      const g = it.guest_name || 'General';
      if (!byGuest[g]) byGuest[g] = [];
      byGuest[g].push({ ...it, _idx: idx });
    });

    list.innerHTML = Object.entries(byGuest).map(([guest, gItems]) => {
      const gSub = gItems.reduce((acc, x) => acc + Number(x.unit_price) * Number(x.qty), 0);
      return `
        <div class="py-2 space-y-2">
          <div class="flex justify-between items-center text-[11px] font-black text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg">
            <span>👤 ${escapeHtml(guest)}</span>
            <span class="font-mono">$${gSub.toFixed(2)}</span>
          </div>
          ${gItems.map(it => {
            const title = it.products?.title || it.title || 'Platillo';
            const modsTxt = (it.selected_modifiers || []).map(m => m.name).join(', ');
            const itemKey = it.id || it._idx;
            const outOfStock = isCartItemUnavailable(it);
            return `
              <div class="flex justify-between items-start gap-2 text-xs px-1 ${outOfStock ? 'bg-rose-50 border border-rose-200 rounded-xl p-2' : ''}">
                <div class="flex-grow">
                  <h4 class="font-bold ${outOfStock ? 'text-rose-800 line-through' : 'text-stone-900'}">${escapeHtml(title)}</h4>
                  ${outOfStock ? '<p class="text-[10px] font-black text-rose-600">⚠️ Agotado en cocina — Retira este platillo para enviar</p>' : ''}
                  ${modsTxt ? `<p class="text-[10px] text-amber-800">+ ${escapeHtml(modsTxt)}</p>` : ''}
                  ${it.notes ? `<p class="text-[10px] text-stone-500 italic">"${escapeHtml(it.notes)}"</p>` : ''}
                  <span class="font-mono font-bold text-stone-700">$${(Number(it.unit_price) * Number(it.qty)).toFixed(2)}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  ${!outOfStock ? `<button onclick="window.updateCartQty('${itemKey}', -1)" class="w-6 h-6 rounded-lg bg-stone-100 font-bold">−</button>
                  <span class="font-mono font-bold w-4 text-center">${it.qty}</span>
                  <button onclick="window.updateCartQty('${itemKey}', 1)" class="w-6 h-6 rounded-lg bg-stone-100 font-bold">+</button>` : ''}
                  <button onclick="window.removeCartItem('${itemKey}')" class="text-rose-600 font-bold ml-1 px-1.5 py-0.5 rounded bg-rose-100">✕</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');
  }

  const { subtotal, discount, appliedPromos, deliveryFee, total } = getCurrentTotals();
  const subEl = document.getElementById('orderSubtotal');
  const totEl = document.getElementById('orderTotal');
  const discBox = document.getElementById('appliedDiscountsBox');
  const discList = document.getElementById('appliedDiscountsList');
  const discRow = document.getElementById('orderDiscountRow');
  const discAmt = document.getElementById('orderDiscountAmount');

  if (subEl) subEl.innerText = `$${subtotal.toFixed(2)}${deliveryFee > 0 ? ` (+ $${deliveryFee.toFixed(2)} envío)` : ''}`;
  if (totEl) totEl.innerText = `$${total.toFixed(2)} MXN`;

  if (discBox && discList) {
    discBox.classList.toggle('hidden', discount <= 0);
    discList.innerHTML = appliedPromos.map(a => `<p>• ${escapeHtml(a)}</p>`).join('');
  }
  if (discRow && discAmt) {
    discRow.classList.toggle('hidden', discount <= 0);
    discAmt.innerText = `-$${discount.toFixed(2)}`;
  }

  updateSendButtonLabel();
  updateCashChangePreview();
}

async function updateCartQty(itemKey, delta) {
  if (context.order_type === 'DINE_IN' && getActiveTableSession()) {
    const found = groupCartSummary.items.find(x => x.id === itemKey);
    if (found) await updateGroupCartItemQty(found.id, Number(found.qty) + delta);
  } else {
    const idx = Number(itemKey);
    if (!localCart[idx]) return;
    localCart[idx].qty += delta;
    if (localCart[idx].qty <= 0) localCart.splice(idx, 1);
    renderCart();
  }
}

async function removeCartItem(itemKey) {
  if (context.order_type === 'DINE_IN' && getActiveTableSession()) await removeGroupCartItem(itemKey);
  else { localCart.splice(Number(itemKey), 1); renderCart(); }
}

function buildLocalOrderSummaryForWhatsApp(items, cashTendered) {
  const { subtotal, discount, deliveryFee, total } = getCurrentTotals();
  const guestSubtotals = {};
  const snapshot = items.map(it => {
    const guest = it.guest_name || context.guest_name || 'General';
    const lineTotal = Number(it.unit_price) * Number(it.qty);
    guestSubtotals[guest] = (guestSubtotals[guest] || 0) + lineTotal;
    return {
      title: it.products?.title || it.title || 'Platillo',
      qty: Number(it.qty),
      guest_name: guest,
      line_total: lineTotal,
      modifiers: it.selected_modifiers || [],
      note: it.notes || ''
    };
  });
  const tendered = Number(cashTendered || 0);
  return {
    order_number: null, subtotal, discount, delivery_fee: deliveryFee, total,
    change_due: tendered > total ? tendered - total : 0,
    items_snapshot: snapshot, guest_subtotals: guestSubtotals
  };
}

async function sendOrder() {
  if (isSubmittingOrder) return;
  const items = getActiveCartItems();
  if (items.length === 0) { showToast('No tienes platillos nuevos por enviar.', 'warning'); return; }
  if (items.some(isCartItemUnavailable)) { showToast('Retira los platillos agotados (en rojo) antes de enviar tu orden.', 'warning'); return; }

  const deliveryMode = restaurant?.order_delivery_mode || 'KDS';
  const whatsappNumber = restaurant?.whatsapp_number || '';
  if ((deliveryMode === 'WHATSAPP' || deliveryMode === 'BOTH') && !whatsappNumber) {
    showToast('El restaurante aún no ha configurado su número de WhatsApp en el Admin.', 'error');
    return;
  }

  const paymentMethod = document.getElementById('checkoutPaymentMethod')?.value || 'CASH';
  const cashTendered = document.getElementById('checkoutCashTendered')?.value || null;
  const deliveryAddress = document.getElementById('checkoutDeliveryAddress')?.value?.trim() || null;
  const customerPhone = document.getElementById('checkoutCustomerPhone')?.value?.trim() || null;
  const customerNotes = document.getElementById('orderCustomerNotes')?.value?.trim() || '';

  if (context.order_type === 'DELIVERY' && (!deliveryAddress || !deliveryState.lat)) {
    showToast('Ingresa tu dirección y presiona "Usar mi ubicación" para validar envío.', 'warning');
    return;
  }

  isSubmittingOrder = true;
  const btn = document.getElementById('btnSendOrder');
  if (btn) { btn.disabled = true; btn.innerText = 'Enviando...'; }

  try {
    let orderResult = null;
    const itemsCopy = [...items];

    if (deliveryMode === 'KDS' || deliveryMode === 'BOTH') {
      const onesignalPlayerId = window.OneSignal?.User?.PushSubscription?.id || null;
      orderResult = await submitOrderViaRPC({
        context, itemsToOrder: itemsCopy,
        customerName: context.guest_name || 'Cliente',
        customerPhone, deliveryAddress,
        deliveryLat: deliveryState.lat, deliveryLng: deliveryState.lng,
        paymentMethod, cashTendered,
        requiresCardTerminal: paymentMethod === 'CARD_TERMINAL',
        customerNotes, onesignalPlayerId, closeSession: false
      });

      const msg = orderResult.merged
        ? `➕ ¡Platillos sumados a tu ticket #${orderResult.order_number}!`
        : `¡Pedido #${orderResult.order_number} enviado a cocina!`;
      showToast(msg, 'success');
    } else {
      orderResult = buildLocalOrderSummaryForWhatsApp(itemsCopy, cashTendered);
      await clearActiveGroupCart();
      showToast('Abriendo WhatsApp con tu pedido...', 'success');
    }

    localCart = [];
    groupCartSummary = resetGroupCartLocal();
    if (document.getElementById('orderCustomerNotes')) document.getElementById('orderCustomerNotes').value = '';
    renderCart();

    if (deliveryMode === 'WHATSAPP' || deliveryMode === 'BOTH') {
      const waUrl = buildWhatsAppOrderUrl({
        whatsappNumber, restaurantName: restaurant?.name || 'Restaurante',
        orderResult, orderType: context.order_type, tableLabel: context.table_label,
        customerName: context.guest_name, deliveryAddress,
        deliveryLat: deliveryState.lat, deliveryLng: deliveryState.lng,
        paymentMethod, cashTendered,
        requiresCardTerminal: paymentMethod === 'CARD_TERMINAL', customerNotes
      });
      window.open(waUrl, '_blank');
    }

    await loadMenuData();
    renderAll();
    switchView('menu');
  } catch (err) {
    showToast(err.message || 'No se pudo procesar tu pedido', 'error');
  } finally {
    isSubmittingOrder = false;
    if (btn) btn.disabled = false;
    updateSendButtonLabel();
  }
}

function renderPromos() {
  const list = document.getElementById('promosList');
  if (!list) return;
  if (promotions.length === 0) {
    list.innerHTML = '<div class="bg-white rounded-2xl p-8 text-center text-xs text-stone-400 border border-stone-200">No hay promociones activas.</div>';
    return;
  }
  list.innerHTML = promotions.map(p => `
    <div class="rounded-3xl p-5 shadow-md text-white space-y-1.5" style="background-color: ${p.bg_color || '#b45309'}; color: ${p.text_color || '#ffffff'}">
      <span class="text-[10px] uppercase tracking-wider font-black bg-white/20 px-2.5 py-0.5 rounded-full">
        ${p.promo_type === '2x1' ? '2x1 Automático en Carrito' : `${p.discount_percentage}% de Descuento Automático`}
      </span>
      <h3 class="font-serif text-xl font-bold pt-1">${escapeHtml(p.title)}</h3>
      <p class="text-xs opacity-90">${escapeHtml(p.description || '')}</p>
    </div>
  `).join('');
}

function handleNavLeft() {
  if (restaurant?.bottom_left_type === 'url' && restaurant?.bottom_left_url) window.open(restaurant.bottom_left_url, '_blank');
  else switchView('promos');
}

function switchView(view) {
  currentView = view;
  document.getElementById('menuToolsWrapper')?.classList.toggle('hidden', view !== 'menu');
  document.getElementById('menuContainer')?.classList.toggle('hidden', view !== 'menu');
  document.getElementById('promosView')?.classList.toggle('hidden', view !== 'promos');
  document.getElementById('orderView')?.classList.toggle('hidden', view !== 'order');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function connectWifi() {
  const ssid = restaurant?.wifi_ssid || 'WiFi_Restaurante';
  const pass = restaurant?.wifi_password || '';
  if (navigator.clipboard && pass) navigator.clipboard.writeText(pass).catch(() => {});
  alert(`📶 Red Wi-Fi:\nRed: ${ssid}\nContraseña: ${pass}`);
}

async function callWaiter(forceImmediate = false, customToastMsg = null, reasonText = 'Atención en mesa') {
  if (!forceImmediate && waiterCooldownSecs > 0) return showToast(`Espera ${waiterCooldownSecs}s para volver a llamar.`, 'info');
  const { error } = await dbWrite(client.from('waiter_calls').insert([{
    id: generateUUID(), restaurant_id: context.restaurant_id,
    table_number: context.table_number, reason: reasonText,
    status: 'pending', called_at: new Date().toISOString()
  }]), 'llamar al mesero');
  if (error) return false;

  showToast(customToastMsg || `🔔 Mesero notificado (${context.table_label})`, 'success');
  waiterCooldownSecs = 45;
  clearInterval(waiterCooldownTimer);
  waiterCooldownTimer = setInterval(() => {
    waiterCooldownSecs--;
    const btnTxt = document.getElementById('waiterBtnText');
    if (waiterCooldownSecs <= 0) {
      clearInterval(waiterCooldownTimer);
      if (btnTxt) btnTxt.innerText = '🔔 Mesero';
    } else if (btnTxt) btnTxt.innerText = `⏱ ${waiterCooldownSecs}s`;
  }, 1000);
  return true;
}

function requestBillFromTable() {
  if (billRequestedRecently) { showToast('Ya avisamos al mesero para llevar tu cuenta. Enseguida te atiende.', 'info'); return; }
  openPayBillChoiceModal();
}

async function confirmPayBillRequest(paymentChoiceLabel) {
  closePayBillChoiceModal();
  const payBtn = document.getElementById('btnPayBillNow');
  if (payBtn) { payBtn.disabled = true; payBtn.innerHTML = '<span>⏳ Avisando al mesero...</span>'; }

  try {
    await client.from('tables').update({ status: 'bill_requested' }).eq('restaurant_id', context.restaurant_id).eq('table_number', context.table_number);
    await callWaiter(true, `💳 ¡Cuenta solicitada (${paymentChoiceLabel})! El mesero va en camino.`, `💳 Pagar Cuenta — ${paymentChoiceLabel}`);

    billRequestedRecently = true;
    if (payBtn) {
      payBtn.innerHTML = '<span>✓ Cuenta Solicitada — Mesero en Camino</span>';
      payBtn.className = 'w-full bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm';
    }
    setTimeout(() => {
      billRequestedRecently = false;
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.innerHTML = '<span>💳 Pagar la Cuenta (Llamar al Mesero)</span>';
        payBtn.className = 'w-full bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition';
      }
    }, 30000);
  } catch {
    showToast('No se pudo solicitar la cuenta. Intenta de nuevo.', 'error');
    if (payBtn) { payBtn.disabled = false; payBtn.innerHTML = '<span>💳 Pagar la Cuenta (Llamar al Mesero)</span>'; }
  }
}

async function handleClientModifyOrder() {
  if (!activeOrder) return;
  const wantWaiter = confirm('¿Quieres avisar al mesero para modificar tu orden?');
  if (wantWaiter) callWaiter(true, '🔔 Avisamos al mesero para modificar tu orden.', '✏️ Modificar orden');
}

function buildOrderUnits(order) {
  const items = (order?.items?.length ? order.items : order?.items_snapshot) || [];
  const units = [];
  items.forEach((it, idx) => {
    const qty = Math.max(1, Number(it.qty || 1));
    const unitPrice = Number(it.price || it.unit_price || 0);
    for (let q = 0; q < qty; q++) {
      units.push({ unitId: `u_${idx}_${q}`, title: it.title || 'Platillo', price: unitPrice, guest_name: it.guest_name || '' });
    }
  });
  return units;
}

function openSplitBillModal() {
  if (!activeOrder) return;
  ensureSplitSubModeUI();
  document.getElementById('splitModalTableBadge').innerText = context.table_number;
  document.getElementById('splitModalTotalBadge').innerText = `$${Number(activeOrder.total || 0).toFixed(2)}`;

  splitOrderUnits = buildOrderUnits(activeOrder);

  if (Array.isArray(activeOrder.split_details) && activeOrder.split_details.length > 0 && activeOrder.split_type === 'by_person') {
    splitPersons = activeOrder.split_details.map((p, idx) => ({
      id: p.id || `p_${idx}_${Date.now()}`, name: p.name,
      amount: Number(p.amount || 0), paid: Boolean(p.paid),
      unitIds: Array.isArray(p.unitIds) ? [...p.unitIds] : []
    }));
    splitPersonSubMode = splitPersons.some(p => p.unitIds.length > 0) ? 'items' : 'amount';
  } else {
    const guestNames = [...new Set(splitOrderUnits.map(u => u.guest_name).filter(Boolean))];
    splitPersons = guestNames.length > 0
      ? guestNames.map((gName, idx) => {
          const myUnits = splitOrderUnits.filter(u => u.guest_name === gName);
          return {
            id: `p_${idx}_${Date.now()}`, name: gName,
            amount: Number(myUnits.reduce((s, u) => s + u.price, 0).toFixed(2)),
            paid: false, unitIds: myUnits.map(u => u.unitId)
          };
        })
      : [];
    splitPersonSubMode = 'items';
  }

  selectSplitMode(activeOrder.split_type === 'by_person' ? 'by_person' : 'equal');
  selectSplitPersonSubMode(splitPersonSubMode);
  calculateEqualSplit();
  renderSplitPersons();
  document.getElementById('splitBillModal').classList.remove('hidden');
}

function closeSplitBillModal() { document.getElementById('splitBillModal')?.classList.add('hidden'); }

function selectSplitMode(mode) {
  splitMode = mode;
  document.getElementById('splitEqualArea')?.classList.toggle('hidden', mode !== 'equal');
  document.getElementById('splitByPersonArea')?.classList.toggle('hidden', mode !== 'by_person');
  const btnEq = document.getElementById('btnSplitEqual');
  const btnIt = document.getElementById('btnSplitItems');
  if (btnEq) btnEq.className = mode === 'equal' ? 'p-3 border-2 border-amber-600 bg-amber-50 rounded-2xl text-amber-950 text-center transition font-bold shadow-xs' : 'p-3 border-2 border-stone-200 bg-white rounded-2xl text-stone-700 text-center transition font-bold';
  if (btnIt) btnIt.className = mode === 'by_person' ? 'p-3 border-2 border-amber-600 bg-amber-50 rounded-2xl text-amber-950 text-center transition font-bold shadow-xs' : 'p-3 border-2 border-stone-200 bg-white rounded-2xl text-stone-700 text-center transition font-bold';
}

function selectSplitPersonSubMode(subMode) {
  splitPersonSubMode = subMode;
  const bItems = document.getElementById('btnSubModeItems');
  const bAmount = document.getElementById('btnSubModeAmount');
  if (bItems) bItems.className = subMode === 'items' ? 'py-1.5 rounded-lg bg-white text-stone-900 shadow-xs transition' : 'py-1.5 rounded-lg text-stone-500 transition';
  if (bAmount) bAmount.className = subMode === 'amount' ? 'py-1.5 rounded-lg bg-white text-stone-900 shadow-xs transition' : 'py-1.5 rounded-lg text-stone-500 transition';
  renderSplitPersons();
}

function calculateEqualSplit() {
  if (!activeOrder) return;
  const count = Math.max(2, parseInt(document.getElementById('splitCountInput')?.value) || 2);
  const el = document.getElementById('equalSplitPerPerson');
  if (el) el.innerText = `$${(Number(activeOrder.total || 0) / count).toFixed(2)} MXN`;
}

function addSplitPerson() {
  const inp = document.getElementById('splitPersonNameInput');
  const name = inp?.value?.trim();
  if (!name) return;
  splitPersons.push({ id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, amount: 0, paid: false, unitIds: [] });
  inp.value = '';
  renderSplitPersons();
}

function removeSplitPerson(idx) { splitPersons.splice(idx, 1); renderSplitPersons(); }

function toggleUnitForPerson(personIdx, unitId) {
  const person = splitPersons[personIdx];
  if (!person) return;
  const alreadyMine = person.unitIds.includes(unitId);
  splitPersons.forEach(p => { p.unitIds = (p.unitIds || []).filter(id => id !== unitId); });
  if (!alreadyMine) person.unitIds.push(unitId);

  splitPersons.forEach(p => {
    const sum = (p.unitIds || []).reduce((acc, uId) => {
      const u = splitOrderUnits.find(x => x.unitId === uId);
      return acc + (u ? u.price : 0);
    }, 0);
    p.amount = Number(sum.toFixed(2));
  });
  renderSplitPersons();
}

function updatePersonAmount(idx, val) {
  if (!splitPersons[idx]) return;
  splitPersons[idx].amount = Math.max(0, parseFloat(val) || 0);
  updateSplitTotalsAndBanner();
}

function updateSplitTotalsAndBanner() {
  if (!activeOrder) return;
  const orderTotal = Number(activeOrder.total || 0);
  const assignedSum = splitPersons.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const remaining = Number((orderTotal - assignedSum).toFixed(2));

  const elAssigned = document.getElementById('splitAssignedTotal');
  const elRemaining = document.getElementById('splitRemainingTotal');
  if (elAssigned) elAssigned.innerText = `$${assignedSum.toFixed(2)} MXN`;
  if (elRemaining) {
    if (remaining > 0.01) { elRemaining.innerText = `Faltan $${remaining.toFixed(2)} MXN`; elRemaining.className = 'text-rose-600 font-black'; }
    else if (remaining < -0.01) { elRemaining.innerText = `Excedido por $${Math.abs(remaining).toFixed(2)} MXN`; elRemaining.className = 'text-rose-600 font-black'; }
    else { elRemaining.innerText = '$0.00 (Cuenta cuadrada ✓)'; elRemaining.className = 'text-emerald-700 font-black'; }
  }

  const banner = document.getElementById('splitMissingBanner');
  if (!banner) return;

  if (splitPersonSubMode === 'items') {
    const assignedIds = new Set(splitPersons.flatMap(p => p.unitIds || []));
    const missingUnits = splitOrderUnits.filter(u => !assignedIds.has(u.unitId));
    const missingTotal = missingUnits.reduce((acc, u) => acc + u.price, 0);

    if (missingUnits.length > 0) {
      banner.className = 'rounded-2xl p-3 border border-amber-300 bg-amber-50 text-amber-950 text-xs space-y-1.5';
      banner.innerHTML = `
        <div class="font-bold flex justify-between items-center">
          <span>⚠️ Faltan ${missingUnits.length} artículo(s) por asignar</span>
          <span class="font-mono">$${missingTotal.toFixed(2)}</span>
        </div>
        <ul class="list-disc pl-4 space-y-0.5 text-[11px] text-amber-900">
          ${missingUnits.map(u => `<li>${escapeHtml(u.title)} — <b class="font-mono">$${u.price.toFixed(2)}</b></li>`).join('')}
        </ul>
      `;
    } else {
      banner.className = 'rounded-2xl p-3 border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold';
      banner.innerHTML = '✅ Todos los artículos están asignados. La cuenta está lista para liquidar.';
    }
  } else {
    if (remaining > 0.01) {
      banner.className = 'rounded-2xl p-3 border border-rose-300 bg-rose-50 text-rose-900 text-xs font-bold';
      banner.innerHTML = `⚠️ Faltan <span class="font-mono">$${remaining.toFixed(2)} MXN</span> por agregar para liquidar la cuenta total ($${orderTotal.toFixed(2)}).`;
    } else if (remaining < -0.01) {
      banner.className = 'rounded-2xl p-3 border border-rose-300 bg-rose-50 text-rose-900 text-xs font-bold';
      banner.innerHTML = `⚠️ La suma se pasa por <span class="font-mono">$${Math.abs(remaining).toFixed(2)} MXN</span> respecto al total de la cuenta.`;
    } else {
      banner.className = 'rounded-2xl p-3 border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold';
      banner.innerHTML = `✅ Cuenta liquidada exacta ($${orderTotal.toFixed(2)} MXN).`;
    }
  }
}

function renderSplitPersons() {
  const cont = document.getElementById('splitPersonsList');
  if (!cont) return;

  if (splitPersons.length === 0) {
    cont.innerHTML = '<p class="text-center text-stone-400 py-4 text-xs">Añade el nombre de cada comensal arriba para empezar a dividir.</p>';
    updateSplitTotalsAndBanner();
    return;
  }

  if (splitPersonSubMode === 'items') {
    const unitOwnerMap = {};
    splitPersons.forEach(p => { (p.unitIds || []).forEach(uId => { unitOwnerMap[uId] = p.name; }); });

    cont.innerHTML = splitPersons.map((p, idx) => `
      <div class="p-3 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
        <div class="flex items-center justify-between border-b border-stone-200 pb-1.5">
          <span class="font-black text-stone-900 text-xs">👤 ${escapeHtml(p.name)}</span>
          <div class="flex items-center gap-2">
            <span class="font-mono font-black text-emerald-700 text-xs">$${Number(p.amount || 0).toFixed(2)}</span>
            <button type="button" onclick="window.removeSplitPerson(${idx})" class="text-rose-500 font-bold px-1">✕</button>
          </div>
        </div>
        <div class="space-y-1">
          ${splitOrderUnits.map(u => {
            const isMine = (p.unitIds || []).includes(u.unitId);
            const owner = unitOwnerMap[u.unitId];
            const ownedByOther = owner && !isMine;
            return `
              <label class="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl border text-[11px] cursor-pointer transition ${
                isMine ? 'bg-amber-50 border-amber-400 font-bold text-stone-900'
                  : (ownedByOther ? 'bg-stone-100 border-stone-200 text-stone-400' : 'bg-white border-stone-200 text-stone-700 hover:border-amber-300')
              }">
                <div class="flex items-center gap-2 min-w-0">
                  <input type="checkbox" ${isMine ? 'checked' : ''} onchange="window.toggleUnitForPerson(${idx}, '${u.unitId}')" class="accent-amber-600 w-3.5 h-3.5 flex-shrink-0">
                  <span class="truncate">${escapeHtml(u.title)}</span>
                  ${ownedByOther ? `<span class="text-[9px] bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded-full flex-shrink-0">de ${escapeHtml(owner)}</span>` : ''}
                </div>
                <span class="font-mono font-bold flex-shrink-0">$${u.price.toFixed(2)}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
  } else {
    cont.innerHTML = splitPersons.map((p, idx) => `
      <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-200">
        <span class="font-bold text-stone-800 flex-grow text-xs">👤 ${escapeHtml(p.name)}</span>
        <div class="flex items-center gap-1">
          <span class="text-stone-400 font-mono text-xs">$</span>
          <input type="number" step="0.5" min="0" value="${p.amount || ''}" placeholder="0.00"
            oninput="window.updatePersonAmount(${idx}, this.value)"
            class="w-24 border rounded-lg px-2 py-1.5 font-mono text-right bg-white text-xs font-bold outline-none focus:border-amber-600">
        </div>
        <button type="button" onclick="window.removeSplitPerson(${idx})" class="text-rose-500 font-bold px-1">✕</button>
      </div>
    `).join('');
  }

  updateSplitTotalsAndBanner();
}

async function saveSplitBill() {
  if (!activeOrder) return;
  const orderTotal = Number(activeOrder.total || 0);

  if (splitMode === 'by_person') {
    if (splitPersons.length === 0) { showToast('Añade al menos un comensal para dividir la cuenta.', 'warning'); return; }
    if (splitPersonSubMode === 'items') {
      const assignedIds = new Set(splitPersons.flatMap(p => p.unitIds || []));
      const missingCount = splitOrderUnits.filter(u => !assignedIds.has(u.unitId)).length;
      if (missingCount > 0) { showToast(`Aún faltan ${missingCount} artículo(s) por asignar a un comensal.`, 'warning'); return; }
    } else {
      const assignedSum = splitPersons.reduce((acc, p) => acc + Number(p.amount || 0), 0);
      const diff = Number((orderTotal - assignedSum).toFixed(2));
      if (diff > 0.01) { showToast(`Faltan $${diff.toFixed(2)} MXN por asignar para liquidar la cuenta.`, 'warning'); return; }
      if (diff < -0.01) { showToast(`La suma excede la cuenta por $${Math.abs(diff).toFixed(2)} MXN.`, 'warning'); return; }
    }
  }

  const count = Math.max(2, parseInt(document.getElementById('splitCountInput')?.value) || 2);
  const details = splitMode === 'equal'
    ? Array.from({ length: count }, (_, i) => ({
        name: `Comensal ${i + 1}`, amount: Number((orderTotal / count).toFixed(2)), paid: false, payment_method: 'cash'
      }))
    : splitPersons.map(p => ({
        id: p.id, name: p.name, amount: Number(Number(p.amount || 0).toFixed(2)),
        paid: Boolean(p.paid), payment_method: 'cash', unitIds: p.unitIds || [],
        items: (p.unitIds || []).map(uId => {
          const u = splitOrderUnits.find(x => x.unitId === uId);
          return u ? { title: u.title, price: u.price } : null;
        }).filter(Boolean)
      }));

  const { error } = await dbWrite(
    client.from('orders').update({ split_type: splitMode, split_details: details }).eq('id', activeOrder.id),
    'dividir cuenta'
  );

  if (!error) {
    activeOrder.split_type = splitMode;
    activeOrder.split_details = details;
    renderLiveOrderTracker();
    closeSplitBillModal();
    showToast('División de cuenta guardada ✓', 'success');
  }
}

function sendTicketToMyWhatsApp() {
  if (!activeOrder) return;
  window.open(buildTicketWhatsAppUrl(restaurant?.name, context.table_label, activeOrder), '_blank');
}

initMenu();
