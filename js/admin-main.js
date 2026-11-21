import { REST_ID, escapeHtml, normalizeTableNumber } from './config.js';
import { state, client, fetchAllData, setConnectionBanner, getActiveShift } from './state.js';
import { playSoundByName } from './audio.js';
import {
  resolveTenant,
  applyTenantBrandingToAdmin,
  isTenantModuleEnabled,
  showTenantBlockOverlay
} from './tenant.js';

import {
  ROLE_META, openSwitchStaffPinModal, closePinModal, pressPinDigit, clearPinInput,
  submitPinCode, applyActiveStaffPermissions, renderStaffTab,
  createStaffMember, toggleStaffActive, deleteStaffMember
} from './modules/auth-pin.js';

import {
  renderTablesFloorPlan, openTableActionsModal, closeTableActionsModal,
  setTableStatus, moveOrderToAnotherTable, mergeOrdersIntoTable,
  transferSingleItemToTable, createNewTableRecord, deleteTableRecord
} from './modules/tables.js';

import {
  renderKanbanBoard, updateKanbanTimers, filterByChannel, filterByStation,
  setKanbanDisplayMode, selectSingleStage, toggleOrderItemDone, fireNextCourse,
  advanceOrderStatus, archiveOrder, openStatusConfigModal, closeStatusConfigModal,
  saveStatusConfiguration
} from './modules/kanban.js';

import {
  requestRetrocesoOrder, handleRetrocesoInventoryChoice,
  setRetrocesoPreparedDestination, finalizeRetrocesoOrderAction, closeRetrocesoModal
} from './modules/retroceso.js';

import {
  openNewOrderModal, closeNewOrderModal, handleManualChannelChange,
  filterManualProductDropdown, selectProductToAddManual, changeManualItemQty,
  renderManualOrderItems, removeManualOrderItem, submitManualOrder,
  openEditOrderModal, closeEditOrderModal, filterEditProductDropdown,
  selectProductToAddEdit, changeEditItemQty, removeEditOrderItem,
  saveOrderEditsWithConfirm, openOrderDetailModal, closeOrderDetailModal,
  togglePersonPaid, printCurrentOrderTicket, printKitchenChit,
  toggleQuickConfigMod, closeItemQuickConfig, confirmItemQuickConfig
} from './modules/orders-modal.js';

import {
  openCheckoutModal, closeCheckoutModal, selectCheckoutMethod,
  setCheckoutTipPct, recalcCheckoutTotals, confirmOrderCheckout,
  renderCashboxTab, openCashShift, addCashMovement, closeCashShift, printShiftReport
} from './modules/cashbox.js';

import {
  renderInventoryTab, quickStockAdjust, loadProductRecipe, addIngredientToRecipe,
  deleteRecipeIngredient, openNewSupplyModal, closeNewSupplyModal, saveNewSupply
} from './modules/inventory.js';

import {
  renderReservationsList, createReservation, updateReservationStatus,
  renderCalls, resolveCall, testSimulateCall
} from './modules/reservations.js';

import {
  renderTaxonomies, createCategory, deleteCategory, createType, deleteType,
  renderProducts, createProduct, startEditProduct, cancelEditProduct, deleteProduct,
  toggleProductAvailability, createModifier, deleteModifier,
  renderPromotionsTab, createPromotion, togglePromotionActive, deletePromotion
} from './modules/catalog.js';

import {
  renderAnalyticsDashboard, setAnalyticsDateFilter, applyCustomDateRange, exportHistoryToCSV
} from './modules/analytics.js';

import { saveGoogleMapsEmbed } from './modules/marketing.js';

let currentOpenTab = null;

const CARD_CATALOG = {
  tables:       { title: 'Mesas',          icon: '🪑', tint: 'bg-amber-50 text-amber-700' },
  orders:       { title: 'Comandas',       icon: '📋', tint: 'bg-orange-50 text-orange-700' },
  inventory:    { title: 'Inventario',     icon: '🥫', tint: 'bg-emerald-50 text-emerald-700' },
  promos:       { title: 'Promos',         icon: '🏷️', tint: 'bg-rose-50 text-rose-700' },
  products:     { title: 'Carta y 86',     icon: '🍽️', tint: 'bg-stone-100 text-stone-800' },
  cashbox:      { title: 'Caja',           icon: '💵', tint: 'bg-emerald-50 text-emerald-800' },
  calls:        { title: 'Llamadas',       icon: '🔔', tint: 'bg-rose-50 text-rose-700' },
  reservations: { title: 'Reservas',       icon: '📅', tint: 'bg-blue-50 text-blue-700' },
  analytics:    { title: 'Métricas',       icon: '📈', tint: 'bg-indigo-50 text-indigo-700' },
  taxonomies:   { title: 'Categorías',     icon: '📑', tint: 'bg-amber-50 text-amber-800' },
  staff:        { title: 'Personal y PIN', icon: '🛡️', tint: 'bg-stone-100 text-stone-800' },
  marketing:    { title: 'Maps y Lealtad', icon: '⭐', tint: 'bg-yellow-50 text-yellow-700' }
};

const TAB_TITLES = {
  tables: 'Mapa de Mesas & Sala',
  orders: 'Comandas / Tablero KDS',
  calls: 'Llamadas de Mesero en Vivo',
  reservations: 'Agenda de Reservas',
  cashbox: 'Caja, Turnos y Cortes X / Z',
  inventory: 'Inventario, Escandallos & Mermas',
  products: 'Carta, Control 86 & Modificadores',
  promos: 'Promociones Automáticas',
  taxonomies: 'Categorías y Tipos de Menú',
  analytics: 'Métricas, Food Cost & Matriz Boston',
  staff: 'Personal, PINs & Auditoría',
  marketing: 'Google Maps & Lealtad'
};

Object.assign(window, {
  isTenantModuleEnabled,
  goHome, renderHomeHub, switchTab, toggleFocusMode, toggleSidebar, playSoundByName,
  openSwitchStaffPinModal, closePinModal, pressPinDigit, clearPinInput,
  submitPinCode, createStaffMember, toggleStaffActive, deleteStaffMember,
  renderTablesFloorPlan, openTableActionsModal, closeTableActionsModal,
  setTableStatus, moveOrderToAnotherTable, mergeOrdersIntoTable,
  transferSingleItemToTable, createNewTableRecord, deleteTableRecord,
  renderKanbanBoard, filterByChannel, filterByStation,
  setKanbanDisplayMode, selectSingleStage, toggleOrderItemDone, fireNextCourse,
  advanceOrderStatus, archiveOrder, openStatusConfigModal, closeStatusConfigModal,
  saveStatusConfiguration,
  requestRetrocesoOrder, handleRetrocesoInventoryChoice,
  setRetrocesoPreparedDestination, finalizeRetrocesoOrderAction, closeRetrocesoModal,
  openNewOrderModal, closeNewOrderModal, handleManualChannelChange,
  filterManualProductDropdown, selectProductToAddManual, changeManualItemQty,
  renderManualOrderItems, removeManualOrderItem, submitManualOrder,
  openEditOrderModal, closeEditOrderModal, filterEditProductDropdown,
  selectProductToAddEdit, changeEditItemQty, removeEditOrderItem,
  saveOrderEditsWithConfirm, openOrderDetailModal, closeOrderDetailModal,
  togglePersonPaid, printCurrentOrderTicket, printKitchenChit,
  toggleQuickConfigMod, closeItemQuickConfig, confirmItemQuickConfig,
  openCheckoutModal, closeCheckoutModal, selectCheckoutMethod,
  setCheckoutTipPct, recalcCheckoutTotals, confirmOrderCheckout,
  openCashShift, addCashMovement, closeCashShift, printShiftReport,
  quickStockAdjust, loadProductRecipe, addIngredientToRecipe,
  deleteRecipeIngredient, openNewSupplyModal, closeNewSupplyModal, saveNewSupply,
  renderReservationsList, createReservation, updateReservationStatus,
  resolveCall, testSimulateCall,
  createCategory, deleteCategory, createType, deleteType,
  createProduct, startEditProduct, cancelEditProduct, deleteProduct,
  toggleProductAvailability, createModifier, deleteModifier,
  createPromotion, togglePromotionActive, deletePromotion,
  setAnalyticsDateFilter, applyCustomDateRange, exportHistoryToCSV,
  saveGoogleMapsEmbed
});

export function toggleSidebar() {}

export function toggleFocusMode() {
  document.body.classList.toggle('focus-mode');
  if (document.body.classList.contains('focus-mode')) {
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
}

function getLiveStatsSnapshot() {
  const todayStr = new Date().toISOString().split('T')[0];
  const activeOrders = state.orders.filter(o => !o.is_archived && o.status !== 'paid' && o.status !== 'cancelled');
  const pendingOrders = activeOrders.filter(o => o.status === 'pending');
  const preparingOrders = activeOrders.filter(o => o.status === 'preparing');
  const deliveredOrders = activeOrders.filter(o => o.status === 'delivered');

  const paidToday = state.orders.filter(o => o.status === 'paid' && (o.paid_at || o.created_at || '').startsWith(todayStr));
  const salesToday = paidToday.reduce((a, o) => a + Number(o.total || 0), 0);

  const occupiedNums = new Set();
  activeOrders.forEach(o => {
    if (!o.order_channel || o.order_channel === 'dine_in') {
      occupiedNums.add(normalizeTableNumber(o.table_number));
    }
  });
  const totalTables = Math.max(state.tables.length, occupiedNums.size);
  const occupiedTables = occupiedNums.size;

  const pendingCalls = state.calls.length;
  const lowStockCount = state.supplies.filter(s => Number(s.current_stock) <= Number(s.min_stock_alert)).length;
  const soldOutCount = state.products.filter(p => p.is_available === false).length;
  const activePromosCount = state.promotions.filter(p => p.is_active).length;
  const confirmedResCount = state.reservations.filter(r => r.status === 'confirmed').length;
  const openShift = getActiveShift();

  return {
    activeOrders: activeOrders.length,
    pendingOrders: pendingOrders.length,
    preparingOrders: preparingOrders.length,
    deliveredOrders: deliveredOrders.length,
    salesToday,
    occupiedTables,
    totalTables,
    pendingCalls,
    lowStockCount,
    soldOutCount,
    activePromosCount,
    confirmedResCount,
    openShift
  };
}

function getRoleTopMetrics(role, st) {
  if (role === 'kitchen') {
    return [
      { label: 'Por Cocinar', value: String(st.pendingOrders + st.preparingOrders), cls: st.pendingOrders > 0 ? 'text-amber-600' : 'text-stone-900' },
      { label: 'En Fuego', value: String(st.preparingOrders), cls: 'text-orange-600' },
      { label: 'Stock Bajo', value: String(st.lowStockCount), cls: st.lowStockCount > 0 ? 'text-rose-600' : 'text-emerald-700' }
    ];
  }
  if (role === 'waiter') {
    return [
      { label: 'Mesas Ocup.', value: `${st.occupiedTables}/${st.totalTables}`, cls: 'text-stone-900' },
      { label: 'Llamadas', value: String(st.pendingCalls), cls: st.pendingCalls > 0 ? 'text-rose-600' : 'text-emerald-700' },
      { label: 'Por Servir', value: String(st.activeOrders), cls: 'text-amber-700' }
    ];
  }
  if (role === 'cashier') {
    return [
      { label: 'Caja Turno', value: st.openShift ? 'Abierta' : 'Cerrada', cls: st.openShift ? 'text-emerald-700' : 'text-rose-600' },
      { label: 'Por Cobrar', value: String(st.deliveredOrders), cls: st.deliveredOrders > 0 ? 'text-blue-700' : 'text-stone-900' },
      { label: 'Ventas Hoy', value: `$${st.salesToday.toFixed(0)}`, cls: 'text-stone-900' }
    ];
  }
  return [
    { label: 'Ventas Hoy', value: `$${st.salesToday.toFixed(0)}`, cls: 'text-emerald-700' },
    { label: 'Mesas', value: `${st.occupiedTables}/${st.totalTables}`, cls: 'text-stone-900' },
    { label: 'Comandas', value: String(st.activeOrders), cls: st.activeOrders > 0 ? 'text-amber-700' : 'text-stone-900' }
  ];
}

function getCardBadge(tabId, st) {
  if (tabId === 'tables') return { text: `${st.occupiedTables}/${st.totalTables}`, cls: st.occupiedTables > 0 ? 'bg-amber-100 text-amber-900' : 'bg-stone-100 text-stone-500' };
  if (tabId === 'orders') return st.activeOrders > 0 ? { text: `${st.activeOrders} activas`, cls: 'bg-orange-100 text-orange-900' } : null;
  if (tabId === 'calls') return st.pendingCalls > 0 ? { text: `${st.pendingCalls} nueva${st.pendingCalls > 1 ? 's' : ''}`, cls: 'bg-rose-600 text-white animate-pulse' } : null;
  if (tabId === 'inventory') return st.lowStockCount > 0 ? { text: `${st.lowStockCount} bajo`, cls: 'bg-rose-100 text-rose-800' } : null;
  if (tabId === 'products') return st.soldOutCount > 0 ? { text: `${st.soldOutCount} en 86`, cls: 'bg-rose-100 text-rose-800' } : null;
  if (tabId === 'promos') return st.activePromosCount > 0 ? { text: `${st.activePromosCount} activas`, cls: 'bg-emerald-100 text-emerald-800' } : null;
  if (tabId === 'reservations') return st.confirmedResCount > 0 ? { text: `${st.confirmedResCount}`, cls: 'bg-blue-100 text-blue-800' } : null;
  if (tabId === 'cashbox') return { text: st.openShift ? 'Abierta' : 'Cerrada', cls: st.openShift ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600' };
  return null;
}

export function renderTopRelevantBar() {
  const cont = document.getElementById('topRelevantMetrics');
  if (!cont) return;
  const role = state.activeStaff?.role || 'admin';
  const st = getLiveStatsSnapshot();
  const metrics = getRoleTopMetrics(role, st);

  cont.innerHTML = metrics.map(m => `
    <div class="min-w-0">
      <span class="text-[10px] font-bold uppercase tracking-wider text-stone-400 block truncate">${escapeHtml(m.label)}</span>
      <span class="text-sm sm:text-lg font-black font-mono leading-tight block truncate ${m.cls}">${escapeHtml(m.value)}</span>
    </div>
  `).join('');

  const dot = document.getElementById('connDot');
  if (dot) {
    dot.className = state.isOnline
      ? 'absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#F6F5F2]'
      : 'absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-[#F6F5F2] animate-pulse';
  }
}

export function renderHomeHub() {
  renderTopRelevantBar();
  const grid = document.getElementById('homeCardsGrid');
  if (!grid) return;

  const role = state.activeStaff?.role || 'admin';
  const meta = ROLE_META[role] || ROLE_META.admin;
  const st = getLiveStatsSnapshot();
  const allowedTabs = meta.tabs.filter(tabId => isTenantModuleEnabled(tabId));

  grid.innerHTML = allowedTabs.map(tabId => {
    const card = CARD_CATALOG[tabId];
    if (!card) return '';
    const badge = getCardBadge(tabId, st);
    return `
      <button onclick="window.switchTab('${tabId}')" class="group relative bg-white hover:bg-amber-50/40 border-2 border-stone-200/90 hover:border-amber-500 rounded-3xl p-5 sm:p-6 min-h-[132px] sm:min-h-[156px] flex flex-col items-center justify-center gap-3 shadow-xs hover:shadow-md transition active:scale-[0.98] text-center">
        ${badge ? `<span class="absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono ${badge.cls}">${escapeHtml(badge.text)}</span>` : ''}
        <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl transition-transform group-hover:scale-105 ${card.tint}">
          ${card.icon}
        </div>
        <span class="font-extrabold text-sm sm:text-base text-stone-900 tracking-tight leading-tight">${escapeHtml(card.title)}</span>
      </button>
    `;
  }).join('');
}

export function goHome() {
  currentOpenTab = null;
  if (document.body.classList.contains('focus-mode')) toggleFocusMode();

  const homeView = document.getElementById('homeHubView');
  const modWrap = document.getElementById('moduleViewWrapper');
  const mainCont = document.getElementById('appMainContainer');

  if (homeView) homeView.classList.remove('hidden');
  if (modWrap) modWrap.classList.add('hidden');
  if (mainCont) {
    mainCont.classList.remove('max-w-[1600px]');
    mainCont.classList.add('max-w-5xl');
  }
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.add('hidden'));
  renderHomeHub();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function switchTab(tabId) {
  const role = state.activeStaff?.role || 'admin';
  const meta = ROLE_META[role] || ROLE_META.admin;
  if (!meta.tabs.includes(tabId) || !isTenantModuleEnabled(tabId)) {
    goHome();
    return;
  }

  currentOpenTab = tabId;
  const homeView = document.getElementById('homeHubView');
  const modWrap = document.getElementById('moduleViewWrapper');
  const mainCont = document.getElementById('appMainContainer');

  if (homeView) homeView.classList.add('hidden');
  if (modWrap) modWrap.classList.remove('hidden');

  const wideTabs = ['orders', 'analytics', 'inventory', 'tables', 'cashbox'];
  if (mainCont) {
    if (wideTabs.includes(tabId)) {
      mainCont.classList.remove('max-w-5xl');
      mainCont.classList.add('max-w-[1600px]');
    } else {
      mainCont.classList.remove('max-w-[1600px]');
      mainCont.classList.add('max-w-5xl');
    }
  }

  document.querySelectorAll('.tab-panel').forEach(el => el.classList.add('hidden'));
  const targetPanel = document.getElementById(`tab-${tabId}`);
  if (targetPanel) targetPanel.classList.remove('hidden');

  const topTitle = document.getElementById('topbarTitle');
  if (topTitle) topTitle.innerText = TAB_TITLES[tabId] || 'Estación de Trabajo';

  const focusBtn = document.getElementById('modFocusBtn');
  const flowBtn = document.getElementById('modFlowBtn');
  if (focusBtn) focusBtn.classList.toggle('hidden', tabId !== 'orders');
  if (flowBtn) flowBtn.classList.toggle('hidden', !(tabId === 'orders' && meta.canConfigFlow));

  if (tabId === 'tables') renderTablesFloorPlan();
  if (tabId === 'orders') renderKanbanBoard();
  if (tabId === 'cashbox') renderCashboxTab();
  if (tabId === 'analytics') renderAnalyticsDashboard();
  if (tabId === 'inventory') renderInventoryTab();
  if (tabId === 'reservations') renderReservationsList();
  if (tabId === 'calls') renderCalls();
  if (tabId === 'products') renderProducts();
  if (tabId === 'taxonomies') renderTaxonomies();
  if (tabId === 'promos') renderPromotionsTab();
  if (tabId === 'staff') renderStaffTab();

  renderTopRelevantBar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAllViews() {
  renderHomeHub();
  renderTablesFloorPlan();
  renderKanbanBoard();
  renderCashboxTab();
  renderAnalyticsDashboard();
  renderInventoryTab();
  renderReservationsList();
  renderCalls();
  renderTaxonomies();
  renderProducts();
  renderPromotionsTab();
  renderStaffTab();
}

async function init() {
  try {
    window.addEventListener('online', () => { setConnectionBanner(true); renderTopRelevantBar(); });
    window.addEventListener('offline', () => { setConnectionBanner(false, '⚠️ Sin conexión Wi-Fi. No cierres esta ventana hasta reconectar.'); renderTopRelevantBar(); });

    // 1. Resolver restaurante activo por ?r=slug ANTES de cargar datos
    const resolved = await resolveTenant(client);
    if (resolved.notFound) {
      showTenantBlockOverlay(
        'Restaurante no encontrado',
        `No existe ningún negocio registrado con el identificador "${resolved.slug}". Verifica el enlace con tu administrador.`
      );
      return;
    }
    if (resolved.tenant && resolved.tenant.is_active === false) {
      showTenantBlockOverlay(
        'Servicio Suspendido Temporalmente',
        `El acceso para "${resolved.tenant.name}" se encuentra pausado. Contacta al administrador de la plataforma.`
      );
      return;
    }
    applyTenantBrandingToAdmin(resolved.tenant);

    // 2. Cargar toda la operación del restaurante resuelto
    await fetchAllData();

    const savedStaffId = sessionStorage.getItem(`aurea_active_staff_id_${REST_ID}`);
    if (savedStaffId && state.staff?.length) {
      const found = state.staff.find(s => s.id === savedStaffId && s.is_active !== false);
      if (found) state.activeStaff = found;
    }

    applyActiveStaffPermissions(false);
    renderAllViews();
    goHome();

    if (client) {
      client.channel(`kds_realtime_${REST_ID}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${REST_ID}` }, async (payload) => {
          const { data } = await client.from('orders').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false });
          if (data) {
            if (payload.eventType === 'INSERT') playSoundByName('bell');
            state.orders = data;
            renderHomeHub();
            renderKanbanBoard();
            renderTablesFloorPlan();
            renderCashboxTab();
            renderAnalyticsDashboard();
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls', filter: `restaurant_id=eq.${REST_ID}` }, async (payload) => {
          const { data } = await client.from('waiter_calls').select('*').eq('restaurant_id', REST_ID).order('called_at', { ascending: false });
          if (data) {
            if (payload.eventType === 'INSERT') playSoundByName('dingdong');
            state.allCalls = data;
            state.calls = data.filter(c => c.status === 'pending');
            renderHomeHub();
            renderCalls();
            renderTablesFloorPlan();
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
          const { data } = await client.from('tables').select('*').eq('restaurant_id', REST_ID).order('table_number', { ascending: true });
          if (data) {
            state.tables = data;
            renderHomeHub();
            renderTablesFloorPlan();
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
          const { data } = await client.from('products').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false });
          if (data) {
            state.products = data;
            renderHomeHub();
            renderProducts();
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'promotions', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
          const { data } = await client.from('promotions').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false });
          if (data) {
            state.promotions = data;
            renderHomeHub();
            renderPromotionsTab();
          }
        })
        .subscribe();
    }

    setInterval(() => {
      if (currentOpenTab === 'orders') {
        updateKanbanTimers();
      } else if (currentOpenTab === 'calls' && state.calls.length > 0) {
        renderCalls();
      }
      renderTopRelevantBar();
    }, 1000);
  } catch (err) {
    console.error('Error crítico al iniciar Admin:', err);
    setConnectionBanner(false, `Error al iniciar: ${err.message || err}`);
    renderTopRelevantBar();
  }
}

init();
