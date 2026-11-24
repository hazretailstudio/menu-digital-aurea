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
  addItemToGroupCart,
  updateGroupCartItemQty,
  removeGroupCartItem,
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
let splitMode = 'equal';
let splitPersons = [];

const STATUS_LABELS = {
  pending: { text: 'Recibido en Cocina', cls: 'bg-amber-100 text-amber-900 border-amber-200' },
  PENDING_CONFIRMATION: { text: '⏳ Por Confirmar', cls: 'bg-amber-100 text-amber-900 border-amber-200' },
  preparing: { text: '🍳 En Preparación', cls: 'bg-orange-100 text-orange-900 border-orange-200' },
  CONFIRMED_PREPARING: { text: '🔥 En Preparación', cls: 'bg-orange-100 text-orange-900 border-orange-200' },
  READY_FOR_PICKUP: { text: '✅ Listo para Entregar', cls: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  OUT_FOR_DELIVERY: { text: '🛵 En Camino', cls: 'bg-blue-100 text-blue-900 border-blue-200' },
  delivered: { text: '🍽️ Servido en Mesa', cls: 'bg-blue-100 text-blue-900 border-blue-200' },
  COMPLETED: { text: '✓ Completado', cls: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  paid: { text: '✓ Pagado', cls: 'bg-emerald-100 text-emerald-900 border-emerald-200' }
};

Object.assign(window, {
  connectWifi, callWaiter, requestBillFromTable, handleClientModifyOrder,
  openSplitBillModal, closeSplitBillModal, selectSplitMode, calculateEqualSplit,
  addSplitPerson, removeSplitPerson, updatePersonAmount, saveSplitBill,
  sendTicketToMyWhatsApp, handleSearch, clearSearchInput, filterByType,
  scrollToCategory, openProductModal, closeProductModal, toggleModifierOption,
  changeModalQty, addCurrentModalToCart, updateCartQty, removeCartItem,
  sendOrder, handleNavLeft, switchView, changeOrderType, captureCustomerLocation,
  handlePaymentMethodChange, updateCashChangePreview, promptChangeGuestName
});

async function initMenu() {
  window.addEventListener('online', () => setConnectionBanner(true));
  window.addEventListener('offline', () => setConnectionBanner(false, 'Sin Wi-Fi. Reconecta para enviar tu pedido.'));

  restaurant = await resolveRestaurantBySlug(context);
  if (restaurant?.is_active === false) {
    document.body.innerHTML = '<div class="min-h-screen flex items-center justify-center p-6 text-center"><div class="bg-white p-8 rounded-3xl shadow-xl max-w-sm"><h1 class="font-bold text-lg text-stone-900">Menú temporalmente suspendido</h1><p class="text-xs text-stone-500 mt-2">Consulta directamente con el restaurante.</p></div></div>';
    return;
  }

  const badge = document.getElementById('tableBadge');
  if (badge) badge.innerText = context.order_type === 'DINE_IN' ? context.table_label : (context.order_type === 'DELIVERY' ? '🛵 Domicilio' : '🛍️ Recoger');

  orderingEnabled = applyReadOnlyMode(restaurant);
  ensureCheckoutExtrasUI();
  await loadMenuData();

  if (orderingEnabled && context.order_type === 'DINE_IN') {
    await initTableSession(context, {
      onRequireGuestName: async (isExisting) => {
        const msg = isExisting
          ? `Esta mesa ya tiene un pedido grupal abierto (${context.table_label}). ¿Cuál es tu nombre para etiquetar tus platillos?`
          : `Bienvenido a ${context.table_label}. Ingresa tu nombre para tu cuenta:`;
        return prompt(msg, context.guest_name || '') || 'Invitado';
      },
      onCartChange: (summary) => {
        groupCartSummary = summary;
        renderCart();
      }
    });
  }

  renderAll();
  subscribeMenuRealtime();
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
      .not('status', 'in', '("paid","cancelled","COMPLETED","CANCELLED","REJECTED")')
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
        .not('status', 'in', '("paid","cancelled","COMPLETED","CANCELLED","REJECTED")')
        .order('created_at', { ascending: false })
        .limit(1);
      activeOrder = data?.[0] || null;
      renderLiveOrderTracker();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `restaurant_id=eq.${rId}` }, async () => {
      const { data } = await client.from('products').select('*').eq('restaurant_id', rId).order('created_at', { ascending: false });
      if (data) { products = data; renderCatalog(); }
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
  if (sendBtn && sendBtn.parentNode) {
    sendBtn.parentNode.insertBefore(box, sendBtn);
  } else {
    orderView.appendChild(box);
  }
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
  syncOrderTypeButtons();
  renderCart();
}

function promptChangeGuestName() {
  const name = prompt('Ingresa tu nombre:', context.guest_name || '');
  if (name && name.trim()) {
    context.guest_name = setGuestName(name);
    const el = document.getElementById('guestNameDisplay');
    if (el) el.innerText = context.guest_name;
  }
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
  if (!navigator.geolocation) {
    showToast('Tu navegador no soporta geolocalización.', 'error');
    return;
  }
  if (statusEl) statusEl.innerText = 'Obteniendo ubicación...';

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const { subtotal } = getCurrentTotals();
      const res = await calculateDeliveryFeeRPC(context.restaurant_id, lat, lng, subtotal);
      deliveryState = {
        lat,
        lng,
        fee: Number(res.fee || 0),
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

  box.classList.remove('hidden');
  document.getElementById('trackerOrderId').innerText = `#${activeOrder.order_number || (activeOrder.id || '').substring(0, 6).toUpperCase()}`;
  const stInfo = STATUS_LABELS[activeOrder.status] || { text: activeOrder.status, cls: 'bg-stone-100 text-stone-800 border-stone-200' };
  const badge = document.getElementById('trackerStatusBadge');
  badge.innerText = stInfo.text;
  badge.className = `px-3 py-1 rounded-full text-xs font-bold border ${stInfo.cls}`;

  const items = (activeOrder.items_snapshot?.length ? activeOrder.items_snapshot : activeOrder.items) || [];
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
  document.getElementById('trackerTotalAmount').innerText = `$${Number(activeOrder.total || 0).toFixed(2)} MXN`;
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
          const img = (p.media && p.media[0]?.url) || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
          const disabled = p.is_available === false || !sec.inHours;
          return `
            <div onclick="${disabled ? '' : `window.openProductModal('${p.id}')`}" class="bg-white rounded-2xl p-3 border border-stone-200/80 shadow-xs flex gap-3 items-center transition ${disabled ? 'opacity-60 grayscale cursor-not-allowed' : 'cursor-pointer hover:border-amber-400'}">
              <div class="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-stone-100 relative">
                <img src="${img}" alt="${escapeHtml(p.title)}" class="w-full h-full object-cover">
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

function openProductModal(prodId) {
  const p = products.find(x => x.id === prodId);
  if (!p || p.is_available === false) return;
  currentModalProduct = p;
  currentModalGroups = modifierGroups.filter(g => g.product_id === p.id);
  modalSelections = [];
  modalQty = 1;

  const imgs = (p.media && p.media.length > 0) ? p.media : [{ url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80' }];
  document.getElementById('modalMediaCarousel').innerHTML = imgs.map(m => `<img src="${m.url}" class="w-full h-full object-cover flex-shrink-0 snap-center">`).join('');
  document.getElementById('modalTitle').innerText = p.title;
  document.getElementById('modalPrice').innerText = `$${Number(p.price).toFixed(2)}`;
  document.getElementById('modalDesc').innerText = p.description || '';
  document.getElementById('modalItemNote').value = '';
  document.getElementById('modalQtyDisplay').innerText = '1';

  const modSec = document.getElementById('modalModifiersSection');
  const modList = document.getElementById('modifiersList');

  if (currentModalGroups.length > 0) {
    modSec.classList.remove('hidden');
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
  } else {
    const applicable = legacyModifiers.filter(m => !m.applies_to_products || m.applies_to_products.length === 0 || m.applies_to_products.includes(p.id));
    if (applicable.length > 0) {
      modSec.classList.remove('hidden');
      modList.innerHTML = applicable.map(m => `
        <label class="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer text-xs">
          <div class="flex items-center gap-2">
            <input type="checkbox" onchange="window.toggleModifierOption('', '${m.id}', this.checked, false)" class="accent-amber-600 w-4 h-4">
            <span class="font-semibold text-stone-800">${escapeHtml(m.name)}</span>
          </div>
          <span class="font-mono font-bold text-amber-800">${Number(m.price) > 0 ? `+$${Number(m.price).toFixed(2)}` : 'Sin costo'}</span>
        </label>
      `).join('');
    } else {
      modSec.classList.add('hidden');
    }
  }

  updateModalFinalPrice();
  document.getElementById('productModal').classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
  currentModalProduct = null;
}

function toggleModifierOption(groupId, optionId, checked, isSingle) {
  if (isSingle) {
    modalSelections = modalSelections.filter(s => s.group_id !== groupId);
  } else {
    modalSelections = modalSelections.filter(s => !(s.group_id === groupId && s.option_id === optionId));
  }
  if (checked) {
    modalSelections.push({ group_id: groupId || null, option_id: optionId, qty: 1 });
  }
  updateModalFinalPrice();
}

function changeModalQty(delta) {
  modalQty = Math.max(1, modalQty + delta);
  document.getElementById('modalQtyDisplay').innerText = modalQty;
  updateModalFinalPrice();
}

function updateModalFinalPrice() {
  if (!currentModalProduct) return;
  const pricing = validateAndPriceModifiers(currentModalProduct, currentModalGroups, legacyModifiers, modalSelections);
  document.getElementById('modalFinalPrice').innerText = `$${(pricing.unitPrice * modalQty).toFixed(2)}`;
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
    if (!context.guest_name) {
      context.guest_name = setGuestName(prompt('Ingresa tu nombre para etiquetar tu platillo:') || 'Invitado');
    }
    try {
      await addItemToGroupCart({
        restaurantId: context.restaurant_id,
        guestName: context.guest_name,
        productId: currentModalProduct.id,
        qty: modalQty,
        selectedModifiers: pricing.selectedModifiers,
        unitPrice: pricing.unitPrice,
        notes: note
      });
      closeProductModal();
      showToast(`Agregado al carrito grupal (${context.guest_name})`, 'success');
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
  if (context.order_type === 'DINE_IN' && getActiveTableSession()) {
    return groupCartSummary.items;
  }
  return localCart;
}

function getCurrentTotals() {
  const items = getActiveCartItems();
  const subtotal = items.reduce((acc, it) => acc + (Number(it.unit_price) * Number(it.qty)), 0);
  const deliveryFee = context.order_type === 'DELIVERY' ? Number(deliveryState.fee || 0) : 0;
  return { subtotal, deliveryFee, total: subtotal + deliveryFee };
}

function renderCart() {
  const items = getActiveCartItems();
  const totalQty = items.reduce((acc, it) => acc + Number(it.qty), 0);
  const navBadge = document.getElementById('navOrderBadge');
  if (navBadge) {
    navBadge.innerText = totalQty;
    navBadge.classList.toggle('hidden', totalQty === 0);
  }
  const countBadge = document.getElementById('orderItemsCountBadge');
  if (countBadge) countBadge.innerText = `${totalQty} ítems`;

  const list = document.getElementById('orderItemsList');
  if (!list) return;

  if (items.length === 0) {
    list.innerHTML = '<p class="text-xs text-stone-400 text-center py-8">Tu orden está vacía.</p>';
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
            return `
              <div class="flex justify-between items-start gap-2 text-xs px-1">
                <div class="flex-grow">
                  <h4 class="font-bold text-stone-900">${escapeHtml(title)}</h4>
                  ${modsTxt ? `<p class="text-[10px] text-amber-800">+ ${escapeHtml(modsTxt)}</p>` : ''}
                  ${it.notes ? `<p class="text-[10px] text-stone-500 italic">"${escapeHtml(it.notes)}"</p>` : ''}
                  <span class="font-mono font-bold text-stone-700">$${(Number(it.unit_price) * Number(it.qty)).toFixed(2)}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button onclick="window.updateCartQty('${itemKey}', -1)" class="w-6 h-6 rounded-lg bg-stone-100 font-bold">−</button>
                  <span class="font-mono font-bold w-4 text-center">${it.qty}</span>
                  <button onclick="window.updateCartQty('${itemKey}', 1)" class="w-6 h-6 rounded-lg bg-stone-100 font-bold">+</button>
                  <button onclick="window.removeCartItem('${itemKey}')" class="text-rose-500 font-bold ml-1 px-1">✕</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');
  }

  const { subtotal, deliveryFee, total } = getCurrentTotals();
  const subEl = document.getElementById('orderSubtotal');
  const totEl = document.getElementById('orderTotal');
  if (subEl) subEl.innerText = `$${subtotal.toFixed(2)}${deliveryFee > 0 ? ` (+ $${deliveryFee.toFixed(2)} envío)` : ''}`;
  if (totEl) totEl.innerText = `$${total.toFixed(2)} MXN`;
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
  if (context.order_type === 'DINE_IN' && getActiveTableSession()) {
    await removeGroupCartItem(itemKey);
  } else {
    localCart.splice(Number(itemKey), 1);
    renderCart();
  }
}

async function sendOrder() {
  const items = getActiveCartItems();
  if (items.length === 0) {
    showToast('Agrega al menos un platillo antes de confirmar.', 'warning');
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

  const btn = document.getElementById('btnSendOrder');
  if (btn) btn.disabled = true;

  try {
    const onesignalPlayerId = window.OneSignal?.User?.PushSubscription?.id || null;
    const orderResult = await submitOrderViaRPC({
      context,
      itemsToOrder: items,
      customerName: context.guest_name || 'Cliente',
      customerPhone,
      deliveryAddress,
      deliveryLat: deliveryState.lat,
      deliveryLng: deliveryState.lng,
      paymentMethod,
      cashTendered,
      requiresCardTerminal: paymentMethod === 'CARD_TERMINAL',
      customerNotes,
      onesignalPlayerId,
      closeSession: false
    });

    localCart = [];
    if (document.getElementById('orderCustomerNotes')) document.getElementById('orderCustomerNotes').value = '';
    showToast(`¡Pedido #${orderResult.order_number} enviado con éxito!`, 'success');

    if (restaurant?.whatsapp_number) {
      const waUrl = buildWhatsAppOrderUrl({
        whatsappNumber: restaurant.whatsapp_number,
        restaurantName: restaurant.name,
        orderResult,
        orderType: context.order_type,
        tableLabel: context.table_label,
        customerName: context.guest_name,
        deliveryAddress,
        deliveryLat: deliveryState.lat,
        deliveryLng: deliveryState.lng,
        paymentMethod,
        cashTendered,
        requiresCardTerminal: paymentMethod === 'CARD_TERMINAL',
        customerNotes
      });
      window.open(waUrl, '_blank');
    }

    await loadMenuData();
    renderAll();
    switchView('menu');
  } catch (err) {
    showToast(err.message || 'No se pudo procesar tu pedido', 'error');
  } finally {
    if (btn) btn.disabled = false;
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
        ${p.promo_type === '2x1' ? '2x1 Automático' : `${p.discount_percentage}% de Descuento`}
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

async function callWaiter() {
  if (waiterCooldownSecs > 0) return showToast(`Espera ${waiterCooldownSecs}s para volver a llamar.`, 'info');
  const { error } = await dbWrite(client.from('waiter_calls').insert([{
    id: generateUUID(),
    restaurant_id: context.restaurant_id,
    table_number: context.table_number,
    status: 'pending',
    called_at: new Date().toISOString()
  }]), 'llamar al mesero');
  if (error) return;
  showToast(`🔔 Mesero notificado (${context.table_label})`, 'success');
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
}

async function requestBillFromTable() {
  await client.from('tables').update({ status: 'bill_requested' }).eq('restaurant_id', context.restaurant_id).eq('table_number', context.table_number);
  await callWaiter();
  showToast('💳 Solicitud de cuenta enviada.', 'success');
}

async function handleClientModifyOrder() {
  if (!activeOrder) return;
  const wantWaiter = confirm('¿Quieres avisar al mesero para modificar tu orden?');
  if (wantWaiter) callWaiter();
}

function openSplitBillModal() {
  if (!activeOrder) return;
  document.getElementById('splitModalTableBadge').innerText = context.table_number;
  document.getElementById('splitModalTotalBadge').innerText = `$${Number(activeOrder.total || 0).toFixed(2)}`;
  splitPersons = Array.isArray(activeOrder.split_details) ? JSON.parse(JSON.stringify(activeOrder.split_details)) : [];
  selectSplitMode(activeOrder.split_type === 'by_person' ? 'by_person' : 'equal');
  calculateEqualSplit();
  renderSplitPersons();
  document.getElementById('splitBillModal').classList.remove('hidden');
}

function closeSplitBillModal() { document.getElementById('splitBillModal')?.classList.add('hidden'); }
function selectSplitMode(mode) {
  splitMode = mode;
  document.getElementById('splitEqualArea')?.classList.toggle('hidden', mode !== 'equal');
  document.getElementById('splitByPersonArea')?.classList.toggle('hidden', mode !== 'by_person');
}
function calculateEqualSplit() {
  if (!activeOrder) return;
  const count = Math.max(2, parseInt(document.getElementById('splitCountInput')?.value) || 2);
  const per = Number(activeOrder.total || 0) / count;
  const el = document.getElementById('equalSplitPerPerson');
  if (el) el.innerText = `$${per.toFixed(2)} MXN`;
}
function addSplitPerson() {
  const inp = document.getElementById('splitPersonNameInput');
  if (!inp?.value?.trim()) return;
  splitPersons.push({ name: inp.value.trim(), amount: 0, paid: false });
  inp.value = '';
  renderSplitPersons();
}
function removeSplitPerson(idx) { splitPersons.splice(idx, 1); renderSplitPersons(); }
function updatePersonAmount(idx, val) { if (splitPersons[idx]) splitPersons[idx].amount = Math.max(0, parseFloat(val) || 0); }
function renderSplitPersons() {
  const cont = document.getElementById('splitPersonsList');
  if (!cont) return;
  cont.innerHTML = splitPersons.map((p, idx) => `
    <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-50 border">
      <span class="font-bold text-stone-800 flex-grow">${escapeHtml(p.name)}</span>
      <input type="number" step="0.5" value="${p.amount}" oninput="window.updatePersonAmount(${idx}, this.value)" class="w-24 border rounded-lg px-2 py-1 font-mono text-right bg-white">
      <button onclick="window.removeSplitPerson(${idx})" class="text-rose-500 font-bold px-1">✕</button>
    </div>
  `).join('');
}
async function saveSplitBill() {
  if (!activeOrder) return;
  const count = Math.max(2, parseInt(document.getElementById('splitCountInput')?.value) || 2);
  const details = splitMode === 'equal'
    ? Array.from({ length: count }, (_, i) => ({
        name: `Comensal ${i + 1}`,
        amount: Number((Number(activeOrder.total || 0) / count).toFixed(2)),
        paid: false
      }))
    : splitPersons;
  const { error } = await dbWrite(client.from('orders').update({ split_type: splitMode, split_details: details }).eq('id', activeOrder.id), 'dividir cuenta');
  if (!error) { activeOrder.split_type = splitMode; activeOrder.split_details = details; closeSplitBillModal(); showToast('División guardada ✓', 'success'); }
}

function sendTicketToMyWhatsApp() {
  if (!activeOrder) return;
  window.open(buildTicketWhatsAppUrl(restaurant?.name, context.table_label, activeOrder), '_blank');
}

initMenu();
