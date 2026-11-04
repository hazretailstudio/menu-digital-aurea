import { state, client, fetchAllData } from './state.js';
import { playSoundByName } from './audio.js';
import { renderKanbanBoard, filterByChannel, setKanbanDisplayMode, advanceOrderStatus, archiveOrder, openStatusConfigModal, closeStatusConfigModal, saveStatusConfiguration } from './modules/kanban.js';
import { requestRetrocesoOrder, handleRetrocesoInventoryChoice, setRetrocesoPreparedDestination, finalizeRetrocesoOrderAction, closeRetrocesoModal } from './modules/retroceso.js';
import { openNewOrderModal, closeNewOrderModal, handleManualChannelChange, filterManualProductDropdown, selectProductToAddManual, renderManualOrderItems, removeManualOrderItem, submitManualOrder, openEditOrderModal, closeEditOrderModal, filterEditProductDropdown, selectProductToAddEdit, removeEditOrderItem, saveOrderEditsWithConfirm, openOrderDetailModal, closeOrderDetailModal, togglePersonPaid, printCurrentOrderTicket } from './modules/orders-modal.js';
import { renderInventoryTab, quickStockAdjust, loadProductRecipe, addIngredientToRecipe, openNewSupplyModal, closeNewSupplyModal, saveNewSupply } from './modules/inventory.js';
import { renderReservationsList, createReservation, updateReservationStatus, renderCalls, resolveCall, testSimulateCall } from './modules/reservations.js';
import { renderTaxonomies, createCategory, createType, renderProducts, createProduct } from './modules/catalog.js';
import { renderAnalyticsDashboard, setAnalyticsDateFilter, applyCustomDateRange, exportHistoryToCSV } from './modules/analytics.js';
import { saveGoogleMapsEmbed } from './modules/marketing.js';

// EXPOSICIÓN A WINDOW PARA INTERACCIÓN CON HTML
window.toggleSidebar = toggleSidebar;
window.toggleFocusMode = toggleFocusMode;
window.switchStationRole = switchStationRole;
window.switchTab = switchTab;
window.playSoundByName = playSoundByName;

window.filterByChannel = filterByChannel;
window.setKanbanDisplayMode = setKanbanDisplayMode;
window.advanceOrderStatus = advanceOrderStatus;
window.archiveOrder = archiveOrder;
window.openStatusConfigModal = openStatusConfigModal;
window.closeStatusConfigModal = closeStatusConfigModal;
window.saveStatusConfiguration = saveStatusConfiguration;

window.requestRetrocesoOrder = requestRetrocesoOrder;
window.handleRetrocesoInventoryChoice = handleRetrocesoInventoryChoice;
window.setRetrocesoPreparedDestination = setRetrocesoPreparedDestination;
window.finalizeRetrocesoOrderAction = finalizeRetrocesoOrderAction;
window.closeRetrocesoModal = closeRetrocesoModal;

window.openNewOrderModal = openNewOrderModal;
window.closeNewOrderModal = closeNewOrderModal;
window.handleManualChannelChange = handleManualChannelChange;
window.filterManualProductDropdown = filterManualProductDropdown;
window.selectProductToAddManual = selectProductToAddManual;
window.renderManualOrderItems = renderManualOrderItems;
window.removeManualOrderItem = removeManualOrderItem;
window.submitManualOrder = submitManualOrder;
window.openEditOrderModal = openEditOrderModal;
window.closeEditOrderModal = closeEditOrderModal;
window.filterEditProductDropdown = filterEditProductDropdown;
window.selectProductToAddEdit = selectProductToAddEdit;
window.removeEditOrderItem = removeEditOrderItem;
window.saveOrderEditsWithConfirm = saveOrderEditsWithConfirm;
window.openOrderDetailModal = openOrderDetailModal;
window.closeOrderDetailModal = closeOrderDetailModal;
window.togglePersonPaid = togglePersonPaid;
window.printCurrentOrderTicket = printCurrentOrderTicket;

window.quickStockAdjust = quickStockAdjust;
window.loadProductRecipe = loadProductRecipe;
window.addIngredientToRecipe = addIngredientToRecipe;
window.openNewSupplyModal = openNewSupplyModal;
window.closeNewSupplyModal = closeNewSupplyModal;
window.saveNewSupply = saveNewSupply;

window.renderReservationsList = renderReservationsList;
window.createReservation = createReservation;
window.updateReservationStatus = updateReservationStatus;
window.resolveCall = resolveCall;
window.testSimulateCall = testSimulateCall;

window.createCategory = createCategory;
window.createType = createType;
window.createProduct = createProduct;

window.setAnalyticsDateFilter = setAnalyticsDateFilter;
window.applyCustomDateRange = applyCustomDateRange;
window.exportHistoryToCSV = exportHistoryToCSV;

window.saveGoogleMapsEmbed = saveGoogleMapsEmbed;

export function toggleSidebar(forceState) {
  const sidebar = document.getElementById('appSidebar');
  const content = document.getElementById('mainContentArea');
  const backdrop = document.getElementById('sidebarBackdrop');
  const isClosed = (forceState !== undefined) ? !forceState : sidebar.classList.contains('sidebar-hidden');

  if (!isClosed) {
    sidebar.classList.add('sidebar-hidden');
    content.classList.add('sidebar-collapsed');
    backdrop.classList.add('hidden');
  } else {
    sidebar.classList.remove('sidebar-hidden');
    content.classList.remove('sidebar-collapsed');
    if (window.innerWidth < 768) backdrop.classList.remove('hidden');
  }
}

export function toggleFocusMode() {
  document.body.classList.toggle('focus-mode');
  if (document.body.classList.contains('focus-mode')) {
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{});
  } else {
    if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  }
}

export function switchStationRole(role) {
  const gLive = document.getElementById('navGroup-live');
  const gMgmt = document.getElementById('navGroup-management');
  const gAnal = document.getElementById('navGroup-analytics');
  const roleBadge = document.getElementById('topbarRoleBadge');

  if (role === 'kitchen') {
    gLive.classList.remove('hidden'); gMgmt.classList.add('hidden'); gAnal.classList.add('hidden');
    roleBadge.innerText = '🍳 Modo Cocina / KDS';
    switchTab('orders');
  } else if (role === 'waiter') {
    gLive.classList.remove('hidden'); gMgmt.classList.add('hidden'); gAnal.classList.add('hidden');
    roleBadge.innerText = '🛎️ Modo Meseros & Sala';
    switchTab('calls');
  } else if (role === 'management') {
    gLive.classList.add('hidden'); gMgmt.classList.remove('hidden'); gAnal.classList.remove('hidden');
    roleBadge.innerText = '📊 Modo Gerencia & Costes';
    switchTab('analytics');
  } else {
    gLive.classList.remove('hidden'); gMgmt.classList.remove('hidden'); gAnal.classList.remove('hidden');
    roleBadge.innerText = '👑 Todo Administrador';
  }
}

const TAB_TITLES = {
  orders: 'Tablero Kanban KDS',
  calls: 'Llamadas de Mesero en Vivo',
  reservations: 'Agenda de Reservas',
  inventory: 'Almacén, Escandallos & Mermas',
  products: 'Gestión de Platillos y Carta',
  taxonomies: 'Categorías y Tipos de Menú',
  analytics: 'Métricas, Food Cost & Ingeniería de Menús',
  marketing: 'Google Maps Reviews & Lealtad'
};

export function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-amber-600', 'text-white', 'shadow-sm', 'font-bold');
    btn.classList.add('text-stone-400', 'font-medium');
  });

  const targetPanel = document.getElementById(`tab-${tabId}`);
  const targetBtn = document.getElementById(`tabBtn-${tabId}`);
  if (targetPanel && targetBtn) {
    targetPanel.classList.remove('hidden');
    targetBtn.classList.remove('text-stone-400', 'font-medium');
    targetBtn.classList.add('bg-amber-600', 'text-white', 'shadow-sm', 'font-bold');
  }

  const topTitle = document.getElementById('topbarTitle');
  if (topTitle) topTitle.innerText = TAB_TITLES[tabId] || 'Estación de Trabajo';

  if (window.innerWidth < 768) toggleSidebar(false);

  if (tabId === 'analytics') renderAnalyticsDashboard();
  if (tabId === 'inventory') renderInventoryTab();
  if (tabId === 'reservations') renderReservationsList();
}

async function init() {
  await fetchAllData();

  renderKanbanBoard();
  renderAnalyticsDashboard();
  renderInventoryTab();
  renderReservationsList();
  renderCalls();
  renderTaxonomies();
  renderProducts();

  const conn = document.getElementById('connStatus');
  if (conn) conn.innerText = 'Sincronizado en tiempo real ✓';

  if (client) {
    client.channel('kds_full_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        const { data } = await client.from('orders').select('*').order('created_at', { ascending: false });
        if (data) {
          state.orders = data;
          renderKanbanBoard();
          renderAnalyticsDashboard();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls' }, async () => {
        const { data } = await client.from('waiter_calls').select('*').eq('status', 'pending');
        if (data) {
          state.calls = data;
          renderCalls();
        }
      })
      .subscribe();
  }

  setInterval(renderKanbanBoard, 1000);
}

// INICIAMOS EL SISTEMA DIRECTAMENTE
init();
