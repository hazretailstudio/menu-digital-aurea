import { REST_ID, generateUUID, normalizeTableNumber, escapeHtml, showToast } from './config.js';
import { client, dbWrite, setConnectionBanner } from './state.js';

const params = new URLSearchParams(window.location.search);
const currentTable = normalizeTableNumber(params.get('mesa') || '01');

let restaurant = null;
let categories = [];
let types = [];
let products = [];
let modifiers = [];
let promotions = [];
let activeOrder = null;
let cart = [];

let selectedTypeId = 'all';
let searchQuery = '';
let currentView = 'menu';

// Estado modal producto
let currentModalProduct = null;
let selectedModIds = new Set();
let modalQty = 1;

// Estado cooldown mesero
let waiterCooldownTimer = null;
let waiterCooldownSecs = 0;

// Estado Split Bill
let splitMode = 'equal';
let splitPersons = []; // [{ name, amount, items: [], paid: false }]

const STATUS_LABELS = {
  pending: { text: 'Recibido en Cocina', cls: 'bg-amber-100 text-amber-900 border-amber-200' },
  preparing: { text: '🍳 En Preparación', cls: 'bg-orange-100 text-orange-900 border-orange-200' },
  delivered: { text: '🍽️ Servido en Mesa', cls: 'bg-blue-100 text-blue-900 border-blue-200' },
  paid: { text: '✓ Pagado', cls: 'bg-emerald-100 text-emerald-900 border-emerald-200' }
};

// Exposición a window para eventos HTML
window.connectWifi = connectWifi;
window.callWaiter = callWaiter;
window.requestBillFromTable = requestBillFromTable;
window.handleClientModifyOrder = handleClientModifyOrder;
window.openSplitBillModal = openSplitBillModal;
window.closeSplitBillModal = closeSplitBillModal;
window.selectSplitMode = selectSplitMode;
window.calculateEqualSplit = calculateEqualSplit;
window.addSplitPerson = addSplitPerson;
window.removeSplitPerson = removeSplitPerson;
window.updatePersonAmount = updatePersonAmount;
window.saveSplitBill = saveSplitBill;
window.sendTicketToMyWhatsApp = sendTicketToMyWhatsApp;
window.handleSearch = handleSearch;
window.clearSearchInput = clearSearchInput;
window.filterByType = filterByType;
window.scrollToCategory = scrollToCategory;
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.toggleModifier = toggleModifier;
window.changeModalQty = changeModalQty;
window.addCurrentModalToCart = addCurrentModalToCart;
window.updateCartQty = updateCartQty;
window.removeCartItem = removeCartItem;
window.sendOrder = sendOrder;
window.handleNavLeft = handleNavLeft;
window.switchView = switchView;

async function initMenu() {
  const badge = document.getElementById('tableBadge');
  if (badge) badge.innerText = `Mesa ${currentTable}`;

  window.addEventListener('online', () => setConnectionBanner(true));
  window.addEventListener('offline', () => setConnectionBanner(false, 'Sin Wi-Fi. Reconecta para enviar tu pedido.'));

  await loadMenuData();
  renderAll();
  subscribeMenuRealtime();
}

async function loadMenuData() {
  if (!client) return;
  try {
    const [restRes, catRes, typRes, prodRes, modRes, promoRes, ordRes] = await Promise.all([
      client.from('restaurants').select('*').eq('id', REST_ID).maybeSingle(),
      client.from('categories').select('*').eq('restaurant_id', REST_ID).order('order_index', { ascending: true }),
      client.from('product_types').select('*').eq('restaurant_id', REST_ID).order('order_index', { ascending: true }),
      client.from('products').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false }),
      client.from('product_modifiers').select('*').eq('restaurant_id', REST_ID).order('name', { ascending: true }),
      client.from('promotions').select('*').eq('restaurant_id', REST_ID).eq('is_active', true),
      client.from('orders').select('*')
        .eq('restaurant_id', REST_ID)
        .eq('table_number', currentTable)
        .eq('is_archived', false)
        .not('status', 'in', '("paid","cancelled")')
        .order('created_at', { ascending: false })
        .limit(1)
    ]);

    if (restRes?.data) {
      restaurant = restRes.data;
      document.getElementById('restName').innerText = restaurant.name || 'Café & Bistro Áurea';
      document.getElementById('restDesc').innerText = restaurant.description || '';
      if (restaurant.logo_url) document.getElementById('restLogo').src = restaurant.logo_url;
      if (restaurant.banner_url) document.getElementById('restBanner').src = restaurant.banner_url;
      if (restaurant.cross_sell_title) document.getElementById('crossSellTitle').innerText = restaurant.cross_sell_title;
      if (restaurant.bottom_left_label) document.getElementById('navLeftLabel').innerText = restaurant.bottom_left_label;
    }
    if (catRes?.data) categories = catRes.data;
    if (typRes?.data) types = typRes.data;
    if (prodRes?.data) products = prodRes.data;
    if (modRes?.data) modifiers = modRes.data;
    if (promoRes?.data) promotions = promoRes.data;
    activeOrder = (ordRes?.data && ordRes.data.length > 0) ? ordRes.data[0] : null;
  } catch (e) {
    console.error('Error cargando menú:', e);
    showToast('Error al cargar el menú. Revisa tu conexión.', 'error');
  }
}

function subscribeMenuRealtime() {
  if (!client) return;
  client.channel(`menu_mesa_${currentTable}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
      const { data } = await client.from('orders').select('*')
        .eq('restaurant_id', REST_ID)
        .eq('table_number', currentTable)
        .eq('is_archived', false)
        .not('status', 'in', '("paid","cancelled")')
        .order('created_at', { ascending: false })
        .limit(1);
      activeOrder = (data && data.length > 0) ? data[0] : null;
      renderLiveOrderTracker();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
      const { data } = await client.from('products').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false });
      if (data) {
        products = data;
        renderCatalog();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promotions', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
      const { data } = await client.from('promotions').select('*').eq('restaurant_id', REST_ID).eq('is_active', true);
      if (data) {
        promotions = data;
        renderPromos();
        renderCart();
      }
    })
    .subscribe();
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
  if (!activeOrder) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  document.getElementById('trackerOrderId').innerText = `#${(activeOrder.id || '').substring(0, 6).toUpperCase()}`;

  const stInfo = STATUS_LABELS[activeOrder.status] || { text: activeOrder.status, cls: 'bg-stone-100 text-stone-800 border-stone-200' };
  const badge = document.getElementById('trackerStatusBadge');
  badge.innerText = stInfo.text;
  badge.className = `px-3 py-1 rounded-full text-xs font-bold border ${stInfo.cls}`;

  const items = Array.isArray(activeOrder.items) ? activeOrder.items : [];
  document.getElementById('trackerItemsList').innerHTML = items.map(it => {
    const mods = (it.modifiers || []).map(m => m.name).join(', ');
    return `
      <div class="py-1.5 flex justify-between items-start gap-2">
        <div>
          <span class="font-bold text-stone-800">${it.qty}x ${escapeHtml(it.title)}</span>
          ${it.done ? '<span class="ml-1 text-[10px] text-emerald-700 font-bold">✓ Listo</span>' : ''}
          ${mods ? `<span class="block text-[10px] text-amber-800">+ ${escapeHtml(mods)}</span>` : ''}
          ${it.note ? `<span class="block text-[10px] text-stone-500 italic">"${escapeHtml(it.note)}"</span>` : ''}
        </div>
        <span class="font-mono font-bold text-stone-700">$${(Number(it.price) * Number(it.qty)).toFixed(2)}</span>
      </div>
    `;
  }).join('');

  document.getElementById('trackerTotalAmount').innerText = `$${Number(activeOrder.total || 0).toFixed(2)} MXN`;

  const splitBadge = document.getElementById('trackerSplitSummaryBadge');
  const splitText = document.getElementById('trackerSplitSummaryText');
  if (activeOrder.split_type && activeOrder.split_type !== 'single' && Array.isArray(activeOrder.split_details) && activeOrder.split_details.length > 0) {
    splitBadge.classList.remove('hidden');
    splitText.innerText = `${activeOrder.split_details.length} partes configuradas`;
  } else {
    splitBadge.classList.add('hidden');
  }
}

function renderTypesFilter() {
  const cont = document.getElementById('typesFilterContainer');
  if (!cont) return;
  const allBtn = `<button onclick="window.filterByType('all')" class="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border ${selectedTypeId === 'all' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200'}">Todos</button>`;
  const typeBtns = types.map(t => `
    <button onclick="window.filterByType('${t.id}')" class="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border ${selectedTypeId === t.id ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-stone-700 border-stone-200'}">
      ${escapeHtml(t.icon || '🏷️')} ${escapeHtml(t.name)}
    </button>
  `).join('');
  cont.innerHTML = allBtn + typeBtns;
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
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchDesc = (p.description || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    return true;
  });
}

function renderCatalog() {
  const cont = document.getElementById('menuContainer');
  if (!cont) return;
  const filtered = getFilteredProducts();

  if (filtered.length === 0) {
    cont.innerHTML = '<div class="text-center py-12 bg-white rounded-3xl border border-stone-200 text-xs text-stone-400">No encontramos platillos con ese filtro.</div>';
    return;
  }

  // Agrupar por categoría
  const sections = [];
  categories.forEach(cat => {
    const items = filtered.filter(p => p.category_id === cat.id);
    if (items.length > 0) sections.push({ id: cat.id, title: `${cat.icon || '🍽️'} ${cat.name}`, items });
  });
  const uncategorized = filtered.filter(p => !categories.some(c => c.id === p.category_id));
  if (uncategorized.length > 0) sections.push({ id: 'other', title: '🍽️ Especialidades', items: uncategorized });

  cont.innerHTML = sections.map(sec => `
    <section id="cat-section-${sec.id}" class="space-y-3 scroll-mt-16">
      <h2 class="font-serif text-xl font-bold text-stone-900 flex items-center gap-2">${escapeHtml(sec.title)}</h2>
      <div class="space-y-3">
        ${sec.items.map(p => {
          const img = (p.media && p.media[0]?.url) || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
          const soldOut = p.is_available === false;
          return `
            <div onclick="${soldOut ? '' : `window.openProductModal('${p.id}')`}" class="bg-white rounded-2xl p-3 border border-stone-200/80 shadow-xs flex gap-3 items-center transition ${soldOut ? 'opacity-60 grayscale cursor-not-allowed' : 'cursor-pointer active:scale-[0.99] hover:border-amber-400'}">
              <div class="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-stone-100 relative">
                <img src="${img}" alt="${escapeHtml(p.title)}" class="w-full h-full object-cover">
                ${soldOut ? '<div class="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] font-black text-white uppercase tracking-wider">Agotado</div>' : ''}
              </div>
              <div class="flex-grow min-w-0">
                <h3 class="font-bold text-sm text-stone-900 leading-snug">${escapeHtml(p.title)}</h3>
                <p class="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">${escapeHtml(p.description || '')}</p>
                <div class="flex items-center justify-between mt-2">
                  <span class="font-mono font-extrabold text-sm text-amber-800">$${Number(p.price).toFixed(2)}</span>
                  ${soldOut
                    ? '<span class="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-lg">No disponible</span>'
                    : '<span class="text-[11px] font-bold bg-stone-900 text-white px-2.5 py-1 rounded-xl">+ Ver</span>'}
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
  const predBox = document.getElementById('predictiveBox');
  if (clearBtn) clearBtn.classList.toggle('hidden', !searchQuery);

  if (searchQuery.length >= 2) {
    const matches = getFilteredProducts().filter(p => p.is_available !== false).slice(0, 4);
    if (matches.length > 0 && predBox) {
      predBox.classList.remove('hidden');
      predBox.innerHTML = matches.map(p => `
        <div onclick="window.openProductModal('${p.id}')" class="py-2 px-1 flex justify-between items-center cursor-pointer hover:bg-amber-50 rounded-lg">
          <span class="font-bold text-stone-800">${escapeHtml(p.title)}</span>
          <span class="font-mono font-bold text-amber-700">$${Number(p.price).toFixed(2)}</span>
        </div>
      `).join('');
    } else if (predBox) {
      predBox.classList.add('hidden');
    }
  } else if (predBox) {
    predBox.classList.add('hidden');
  }
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
  selectedModIds = new Set();
  modalQty = 1;

  const predBox = document.getElementById('predictiveBox');
  if (predBox) predBox.classList.add('hidden');

  const imgs = (p.media && p.media.length > 0) ? p.media : [{ type: 'image', url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80' }];
  document.getElementById('modalMediaCarousel').innerHTML = imgs.map(m => `
    <img src="${m.url}" class="w-full h-full object-cover flex-shrink-0 snap-center">
  `).join('');

  document.getElementById('modalTitle').innerText = p.title;
  document.getElementById('modalPrice').innerText = `$${Number(p.price).toFixed(2)}`;
  document.getElementById('modalDesc').innerText = p.description || '';
  document.getElementById('modalItemNote').value = '';
  document.getElementById('modalQtyDisplay').innerText = '1';

  const stLabel = p.station === 'barra' ? '☕ Barra' : (p.station === 'panaderia' ? '🥐 Panadería' : '🍳 Cocina');
  document.getElementById('modalTags').innerHTML = `<span class="text-[10px] font-bold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">${stLabel}</span>`;

  // Modificadores aplicables (globales si applies_to_products está vacío, o específicos)
  const applicableMods = modifiers.filter(m => !m.applies_to_products || m.applies_to_products.length === 0 || m.applies_to_products.includes(p.id));
  const modSec = document.getElementById('modalModifiersSection');
  const modList = document.getElementById('modifiersList');
  if (applicableMods.length > 0) {
    modSec.classList.remove('hidden');
    modList.innerHTML = applicableMods.map(m => `
      <label class="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer text-xs">
        <div class="flex items-center gap-2">
          <input type="checkbox" onchange="window.toggleModifier('${m.id}')" class="accent-amber-600 w-4 h-4">
          <span class="font-semibold text-stone-800">${escapeHtml(m.name)}</span>
        </div>
        <span class="font-mono font-bold text-amber-800">${Number(m.price) > 0 ? `+$${Number(m.price).toFixed(2)}` : 'Sin costo'}</span>
      </label>
    `).join('');
  } else {
    modSec.classList.add('hidden');
  }

  // Cross-sell
  const crossSec = document.getElementById('modalCrossSellSection');
  const crossCont = document.getElementById('crossSellContainer');
  const recommended = products.filter(x => x.id !== p.id && x.is_available !== false).slice(0, 4);
  if (recommended.length > 0) {
    crossSec.classList.remove('hidden');
    crossCont.innerHTML = recommended.map(r => {
      const rImg = (r.media && r.media[0]?.url) || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';
      return `
        <div onclick="window.openProductModal('${r.id}')" class="w-32 flex-shrink-0 bg-stone-50 border border-stone-200 rounded-2xl p-2 cursor-pointer">
          <img src="${rImg}" class="w-full h-16 object-cover rounded-xl mb-1.5">
          <p class="text-[11px] font-bold text-stone-900 truncate">${escapeHtml(r.title)}</p>
          <span class="text-[10px] font-mono font-bold text-amber-800">$${Number(r.price).toFixed(2)}</span>
        </div>
      `;
    }).join('');
  } else {
    crossSec.classList.add('hidden');
  }

  updateModalFinalPrice();
  document.getElementById('productModal').classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
  currentModalProduct = null;
}

function toggleModifier(modId) {
  if (selectedModIds.has(modId)) selectedModIds.delete(modId);
  else selectedModIds.add(modId);
  updateModalFinalPrice();
}

function changeModalQty(delta) {
  modalQty = Math.max(1, modalQty + delta);
  document.getElementById('modalQtyDisplay').innerText = modalQty;
  updateModalFinalPrice();
}

function getModalUnitPrice() {
  if (!currentModalProduct) return 0;
  let extra = 0;
  selectedModIds.forEach(id => {
    const m = modifiers.find(x => x.id === id);
    if (m) extra += Number(m.price || 0);
  });
  return Number(currentModalProduct.price) + extra;
}

function updateModalFinalPrice() {
  const total = getModalUnitPrice() * modalQty;
  document.getElementById('modalFinalPrice').innerText = `$${total.toFixed(2)}`;
}

function addCurrentModalToCart() {
  if (!currentModalProduct) return;
  const chosenMods = Array.from(selectedModIds).map(id => {
    const m = modifiers.find(x => x.id === id);
    return m ? { id: m.id, name: m.name, price: Number(m.price || 0) } : null;
  }).filter(Boolean);

  const unitPrice = getModalUnitPrice();
  const note = document.getElementById('modalItemNote')?.value?.trim() || '';

  cart.push({
    id: currentModalProduct.id,
    title: currentModalProduct.title,
    base_price: Number(currentModalProduct.price),
    price: unitPrice,
    qty: modalQty,
    station: currentModalProduct.station || 'cocina',
    course: 1,
    modifiers: chosenMods,
    note,
    done: false,
    inventory_deducted: false
  });

  renderCart();
  closeProductModal();
  showToast(`Agregado: ${modalQty}x ${currentModalProduct.title}`, 'success');
}

function calculatePromosForCart() {
  const subtotal = cart.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
  let discount = 0;
  const applied = [];

  promotions.forEach(pr => {
    if (!pr.is_active) return;
    if (pr.promo_type === 'percentage' && Number(pr.discount_percentage) > 0) {
      const d = subtotal * (Number(pr.discount_percentage) / 100);
      if (d > 0) {
        discount += d;
        applied.push(`${pr.title} (-$${d.toFixed(2)})`);
      }
    } else if (pr.promo_type === '2x1') {
      // 2x1 aplica a pares del mismo producto
      let pairSavings = 0;
      cart.forEach(it => {
        const freeUnits = Math.floor(Number(it.qty) / 2);
        if (freeUnits > 0) pairSavings += freeUnits * Number(it.base_price || it.price);
      });
      if (pairSavings > 0) {
        discount += pairSavings;
        applied.push(`${pr.title} (-$${pairSavings.toFixed(2)})`);
      }
    }
  });

  discount = Math.min(subtotal, discount);
  return { subtotal, discount, total: Math.max(0, subtotal - discount), applied };
}

function renderCart() {
  const totalQty = cart.reduce((acc, it) => acc + Number(it.qty), 0);
  const navBadge = document.getElementById('navOrderBadge');
  if (navBadge) {
    navBadge.innerText = totalQty;
    navBadge.classList.toggle('hidden', totalQty === 0);
  }
  const countBadge = document.getElementById('orderItemsCountBadge');
  if (countBadge) countBadge.innerText = `${totalQty} ítems`;

  const list = document.getElementById('orderItemsList');
  if (!list) return;

  if (cart.length === 0) {
    list.innerHTML = '<p class="text-xs text-stone-400 text-center py-8">Tu orden está vacía. Explora el menú y agrega tus platillos favoritos.</p>';
  } else {
    list.innerHTML = cart.map((it, idx) => {
      const modsTxt = (it.modifiers || []).map(m => m.name).join(', ');
      return `
        <div class="py-3 flex justify-between items-start gap-2 text-xs">
          <div class="flex-grow">
            <h4 class="font-bold text-stone-900">${escapeHtml(it.title)}</h4>
            ${modsTxt ? `<p class="text-[10px] text-amber-800">+ ${escapeHtml(modsTxt)}</p>` : ''}
            ${it.note ? `<p class="text-[10px] text-stone-500 italic">"${escapeHtml(it.note)}"</p>` : ''}
            <span class="font-mono font-bold text-stone-700 mt-1 block">$${(Number(it.price) * Number(it.qty)).toFixed(2)}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="window.updateCartQty(${idx}, -1)" class="w-6 h-6 rounded-lg bg-stone-100 font-bold">−</button>
            <span class="font-mono font-bold w-4 text-center">${it.qty}</span>
            <button onclick="window.updateCartQty(${idx}, 1)" class="w-6 h-6 rounded-lg bg-stone-100 font-bold">+</button>
            <button onclick="window.removeCartItem(${idx})" class="text-rose-500 font-bold ml-1 px-1">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }

  const { subtotal, discount, total, applied } = calculatePromosForCart();
  document.getElementById('orderSubtotal').innerText = `$${subtotal.toFixed(2)}`;
  document.getElementById('orderTotal').innerText = `$${total.toFixed(2)} MXN`;

  const discRow = document.getElementById('orderDiscountRow');
  const discBox = document.getElementById('appliedDiscountsBox');
  if (discount > 0) {
    discRow.classList.remove('hidden');
    document.getElementById('orderDiscountAmount').innerText = `-$${discount.toFixed(2)}`;
    discBox.classList.remove('hidden');
    document.getElementById('appliedDiscountsList').innerHTML = applied.map(a => `<p>• ${escapeHtml(a)}</p>`).join('');
  } else {
    discRow.classList.add('hidden');
    discBox.classList.add('hidden');
  }
}

function updateCartQty(idx, delta) {
  if (!cart[idx]) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  renderCart();
}

function removeCartItem(idx) {
  cart.splice(idx, 1);
  renderCart();
}

async function sendOrder() {
  if (cart.length === 0) {
    showToast('Agrega al menos un platillo antes de confirmar.', 'warning');
    return;
  }
  const btn = document.getElementById('btnSendOrder');
  if (btn) btn.disabled = true;

  const notes = document.getElementById('orderCustomerNotes')?.value?.trim() || '';
  const { subtotal, discount, total, applied } = calculatePromosForCart();

  // Si ya hay cuenta activa en la mesa, unificamos automáticamente
  if (activeOrder) {
    const newItemsTagged = cart.map(it => ({ ...it, is_new: true, done: false, inventory_deducted: false }));
    const mergedItems = [...newItemsTagged, ...(activeOrder.items || [])];
    const mergedSubtotal = Number(activeOrder.subtotal || activeOrder.total || 0) + subtotal;
    const mergedDiscount = Number(activeOrder.discount || 0) + discount;
    const mergedTotal = Math.max(0, mergedSubtotal - mergedDiscount);
    const mergedNotes = [activeOrder.customer_notes, notes].filter(Boolean).join(' | ');
    const nextStatus = activeOrder.status === 'delivered' ? 'preparing' : activeOrder.status;

    const { error } = await dbWrite(
      client.from('orders').update({
        items: mergedItems,
        subtotal: mergedSubtotal,
        discount: mergedDiscount,
        total: mergedTotal,
        customer_notes: mergedNotes,
        has_new_additions: true,
        notes_updated: Boolean(notes),
        status: nextStatus,
        kitchen_cycle_started_at: new Date().toISOString()
      }).eq('id', activeOrder.id),
      'añadir platillos a tu cuenta'
    );

    if (btn) btn.disabled = false;
    if (error) return;

    cart = [];
    document.getElementById('orderCustomerNotes').value = '';
    await loadMenuData();
    renderAll();
    switchView('menu');
    showToast('¡Platillos agregados y enviados a cocina!', 'success');
    return;
  }

  // Nueva orden con UUID válido
  const newOrder = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    table_number: currentTable,
    order_channel: 'dine_in',
    waiter_name: 'Menú QR',
    items: cart,
    subtotal,
    discount,
    total,
    applied_promotions: applied,
    status: 'pending',
    customer_notes: notes,
    is_archived: false,
    active_course: 1,
    created_at: new Date().toISOString()
  };

  const { error } = await dbWrite(client.from('orders').insert([newOrder]), 'enviar pedido a cocina');
  if (btn) btn.disabled = false;
  if (error) return;

  // Marcar mesa como ocupada si existe en tabla tables
  await client.from('tables').update({ status: 'occupied' }).eq('restaurant_id', REST_ID).eq('table_number', currentTable);

  activeOrder = newOrder;
  cart = [];
  document.getElementById('orderCustomerNotes').value = '';
  renderAll();
  switchView('menu');
  showToast('¡Pedido enviado directo a cocina!', 'success');
}

function renderPromos() {
  const list = document.getElementById('promosList');
  if (!list) return;
  if (promotions.length === 0) {
    list.innerHTML = '<div class="bg-white rounded-2xl p-8 text-center text-xs text-stone-400 border border-stone-200">No hay promociones activas en este momento.</div>';
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
  if (restaurant?.bottom_left_type === 'url' && restaurant?.bottom_left_url) {
    window.open(restaurant.bottom_left_url, '_blank');
  } else {
    switchView('promos');
  }
}

function switchView(view) {
  currentView = view;
  const menuTools = document.getElementById('menuToolsWrapper');
  const menuCont = document.getElementById('menuContainer');
  const promosView = document.getElementById('promosView');
  const orderView = document.getElementById('orderView');

  menuTools.classList.toggle('hidden', view !== 'menu');
  menuCont.classList.toggle('hidden', view !== 'menu');
  promosView.classList.toggle('hidden', view !== 'promos');
  orderView.classList.toggle('hidden', view !== 'order');

  ['navLeftBtn', 'navMenuBtn', 'navOrderBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('text-amber-600', 'font-bold');
    el.classList.add('text-stone-500');
  });
  const activeBtnId = view === 'promos' ? 'navLeftBtn' : (view === 'order' ? 'navOrderBtn' : 'navMenuBtn');
  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) {
    activeBtn.classList.remove('text-stone-500');
    activeBtn.classList.add('text-amber-600', 'font-bold');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function connectWifi() {
  const ssid = restaurant?.wifi_ssid || 'Aurea_HighSpeed';
  const pass = restaurant?.wifi_password || 'Brunch2026';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(pass).catch(() => {});
  }
  alert(`📶 Red Wi-Fi del Restaurante:

Red: ${ssid}
Contraseña: ${pass}

(Contraseña copiada al portapapeles)`);
}

async function callWaiter() {
  if (waiterCooldownSecs > 0) {
    showToast(`Ya avisamos al mesero. Espera ${waiterCooldownSecs}s para volver a llamar.`, 'info');
    return;
  }
  const newCall = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    table_number: currentTable,
    status: 'pending',
    called_at: new Date().toISOString()
  };
  const { error } = await dbWrite(client.from('waiter_calls').insert([newCall]), 'llamar al mesero');
  if (error) return;

  showToast(`🔔 Mesero notificado para la Mesa ${currentTable}`, 'success');
  waiterCooldownSecs = 45;
  const btnTxt = document.getElementById('waiterBtnText');
  clearInterval(waiterCooldownTimer);
  waiterCooldownTimer = setInterval(() => {
    waiterCooldownSecs--;
    if (waiterCooldownSecs <= 0) {
      clearInterval(waiterCooldownTimer);
      if (btnTxt) btnTxt.innerText = '🔔 Mesero';
    } else if (btnTxt) {
      btnTxt.innerText = `⏱ ${waiterCooldownSecs}s`;
    }
  }, 1000);
}

async function requestBillFromTable() {
  await client.from('tables').update({ status: 'bill_requested' }).eq('restaurant_id', REST_ID).eq('table_number', currentTable);
  await callWaiter();
  showToast('💳 Solicitud de cuenta enviada al mesero y caja.', 'success');
}

async function handleClientModifyOrder() {
  if (!activeOrder) return;
  if (activeOrder.status === 'pending') {
    const extraNote = prompt('Tu orden aún no entra a fuego. Agrega o actualiza una nota para cocina:', activeOrder.customer_notes || '');
    if (extraNote !== null) {
      const { error } = await dbWrite(
        client.from('orders').update({ customer_notes: extraNote.trim(), notes_updated: true }).eq('id', activeOrder.id),
        'actualizar nota'
      );
      if (!error) {
        activeOrder.customer_notes = extraNote.trim();
        showToast('Nota actualizada en cocina ✓', 'success');
      }
    }
  } else {
    const wantWaiter = confirm('Tu orden ya está en preparación o servida. Para cambios o cancelaciones debemos avisar al mesero.

¿Quieres llamar al mesero ahora? (Para agregar más platillos simplemente añádelos desde el menú).');
    if (wantWaiter) callWaiter();
  }
}

// SPLIT BILL
function openSplitBillModal() {
  if (!activeOrder) return;
  document.getElementById('splitModalTableBadge').innerText = currentTable;
  document.getElementById('splitModalTotalBadge').innerText = `$${Number(activeOrder.total || 0).toFixed(2)}`;
  splitPersons = Array.isArray(activeOrder.split_details) && activeOrder.split_details.length > 0
    ? JSON.parse(JSON.stringify(activeOrder.split_details))
    : [];
  selectSplitMode(activeOrder.split_type === 'by_person' ? 'by_person' : 'equal');
  calculateEqualSplit();
  renderSplitPersons();
  document.getElementById('splitBillModal').classList.remove('hidden');
}

function closeSplitBillModal() {
  document.getElementById('splitBillModal').classList.add('hidden');
}

function selectSplitMode(mode) {
  splitMode = mode;
  document.getElementById('splitEqualArea').classList.toggle('hidden', mode !== 'equal');
  document.getElementById('splitByPersonArea').classList.toggle('hidden', mode !== 'by_person');
  document.getElementById('btnSplitEqual').className = mode === 'equal'
    ? 'p-3 border-2 border-amber-600 bg-amber-50 rounded-2xl text-amber-950 text-center transition font-bold shadow-xs'
    : 'p-3 border-2 border-stone-200 bg-white rounded-2xl text-stone-700 text-center transition font-bold';
  document.getElementById('btnSplitItems').className = mode === 'by_person'
    ? 'p-3 border-2 border-amber-600 bg-amber-50 rounded-2xl text-amber-950 text-center transition font-bold shadow-xs'
    : 'p-3 border-2 border-stone-200 bg-white rounded-2xl text-stone-700 text-center transition font-bold';
}

function calculateEqualSplit() {
  if (!activeOrder) return;
  const count = Math.max(2, parseInt(document.getElementById('splitCountInput')?.value) || 2);
  const total = Number(activeOrder.total || 0);
  const per = total / count;
  document.getElementById('equalSplitPerPerson').innerText = `$${per.toFixed(2)} MXN`;
  const breakdown = document.getElementById('equalPersonsBreakdown');
  if (breakdown) {
    breakdown.innerHTML = Array.from({ length: count }, (_, i) => `
      <div class="flex justify-between"><span>Comensal ${i + 1}</span><b class="font-mono">$${per.toFixed(2)}</b></div>
    `).join('');
  }
}

function addSplitPerson() {
  const inp = document.getElementById('splitPersonNameInput');
  const name = inp?.value?.trim();
  if (!name) return;
  splitPersons.push({ name, amount: 0, paid: false });
  inp.value = '';
  renderSplitPersons();
}

function removeSplitPerson(idx) {
  splitPersons.splice(idx, 1);
  renderSplitPersons();
}

function updatePersonAmount(idx, val) {
  if (!splitPersons[idx]) return;
  splitPersons[idx].amount = Math.max(0, parseFloat(val) || 0);
  updateSplitTotals();
}

function renderSplitPersons() {
  const cont = document.getElementById('splitPersonsList');
  if (!cont) return;
  if (splitPersons.length === 0) {
    cont.innerHTML = '<p class="text-stone-400 text-center py-4">Agrega los nombres de quienes dividen la cuenta.</p>';
  } else {
    cont.innerHTML = splitPersons.map((p, idx) => `
      <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-50 border">
        <span class="font-bold text-stone-800 flex-grow">${escapeHtml(p.name)}</span>
        <input type="number" step="0.5" value="${p.amount}" oninput="window.updatePersonAmount(${idx}, this.value)" class="w-24 border rounded-lg px-2 py-1 font-mono text-right bg-white">
        <button onclick="window.removeSplitPerson(${idx})" class="text-rose-500 font-bold px-1">✕</button>
      </div>
    `).join('');
  }
  updateSplitTotals();
}

function updateSplitTotals() {
  const total = Number(activeOrder?.total || 0);
  const assigned = splitPersons.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const remaining = total - assigned;
  const aEl = document.getElementById('splitAssignedTotal');
  const rEl = document.getElementById('splitRemainingTotal');
  if (aEl) aEl.innerText = `$${assigned.toFixed(2)}`;
  if (rEl) rEl.innerText = `$${remaining.toFixed(2)}`;
}

async function saveSplitBill() {
  if (!activeOrder) return;
  let details = [];
  if (splitMode === 'equal') {
    const count = Math.max(2, parseInt(document.getElementById('splitCountInput')?.value) || 2);
    const per = Number((Number(activeOrder.total || 0) / count).toFixed(2));
    details = Array.from({ length: count }, (_, i) => ({ name: `Comensal ${i + 1}`, amount: per, paid: false }));
  } else {
    if (splitPersons.length < 2) {
      showToast('Agrega al menos 2 comensales.', 'warning');
      return;
    }
    details = splitPersons;
  }

  const { error } = await dbWrite(
    client.from('orders').update({ split_type: splitMode, split_details: details }).eq('id', activeOrder.id),
    'guardar división de cuenta'
  );
  if (error) return;

  activeOrder.split_type = splitMode;
  activeOrder.split_details = details;
  renderLiveOrderTracker();
  closeSplitBillModal();
  showToast('División de cuenta sincronizada con caja ✓', 'success');
}

function sendTicketToMyWhatsApp() {
  if (!activeOrder) return;
  const items = Array.isArray(activeOrder.items) ? activeOrder.items : [];
  const lines = [
    `*${restaurant?.name || 'Café & Bistro Áurea'}*`,
    `Mesa: ${currentTable} | Orden #${(activeOrder.id || '').substring(0, 6).toUpperCase()}`,
    `----------------------------`,
    ...items.map(it => `${it.qty}x ${it.title} - $${(Number(it.price) * Number(it.qty)).toFixed(2)}`),
    `----------------------------`,
    `*TOTAL: $${Number(activeOrder.total || 0).toFixed(2)} MXN*`
  ];
  const url = `https://wa.me/?text=${encodeURIComponent(lines.join('
'))}`;
  window.open(url, '_blank');
}

initMenu();
