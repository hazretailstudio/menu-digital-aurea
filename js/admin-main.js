import { REST_ID } from './config.js';
import { state, client, fetchAllData, setConnectionBanner } from './state.js';
import { playSoundByName } from './audio.js';

import {
  openSwitchStaffPinModal, closePinModal, pressPinDigit, clearPinInput,
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

// EXPOSICIÓN A WINDOW PARA INTERACCIÓN CON HTML
Object.assign(window, {
  toggleSidebar, toggleFocusMode, switchTab, playSoundByName,

  // PIN & Staff
  openSwitchStaffPinModal, closePinModal, pressPinDigit, clearPinInput,
  submitPinCode, createStaffMember, toggleStaffActive, deleteStaffMember,

  // Mesas
  renderTablesFloorPlan, openTableActionsModal, closeTableActionsModal,
  setTableStatus, moveOrderToAnotherTable, mergeOrdersIntoTable,
  transferSingleItemToTable, createNewTableRecord, deleteTableRecord,

  // Kanban KDS
  renderKanbanBoard, filterByChannel, filterByStation,
  setKanbanDisplayMode, selectSingleStage, toggleOrderItemDone, fireNextCourse,
  advanceOrderStatus, archiveOrder, openStatusConfigModal, closeStatusConfigModal,
  saveStatusConfiguration,

  // Retroceso
  requestRetrocesoOrder, handleRetrocesoInventoryChoice,
  setRetrocesoPreparedDestination, finalizeRetrocesoOrderAction, closeRetrocesoModal,

  // Comandas & Modales
  openNewOrderModal, closeNewOrderModal, handleManualChannelChange,
  filterManualProductDropdown, selectProductToAddManual, changeManualItemQty,
  renderManualOrderItems, removeManualOrderItem, submitManualOrder,
  openEditOrderModal, closeEditOrderModal, filterEditProductDropdown,
  selectProductToAddEdit, changeEditItemQty, removeEditOrderItem,
  saveOrderEditsWithConfirm, openOrderDetailModal, closeOrderDetailModal,
  togglePersonPaid, printCurrentOrderTicket, printKitchenChit,
  toggleQuickConfigMod, closeItemQuickConfig, confirmItemQuickConfig,

  // Cobro & Caja
  openCheckoutModal, closeCheckoutModal, selectCheckoutMethod,
  setCheckoutTipPct, recalcCheckoutTotals, confirmOrderCheckout,
  openCashShift, addCashMovement, closeCashShift, printShiftReport,

  // Inventario
  quickStockAdjust, loadProductRecipe, addIngredientToRecipe,
  deleteRecipeIngredient, openNewSupplyModal, closeNewSupplyModal, saveNewSupply,

  // Reservas & Llamadas
  renderReservationsList, createReservation, updateReservationStatus,
  resolveCall, testSimulateCall,

  // Carta, 86, Modificadores & Promociones
  createCategory, deleteCategory, createType, deleteType,
  createProduct, startEditProduct, cancelEditProduct, deleteProduct,
  toggleProductAvailability, createModifier, deleteModifier,
  createPromotion, togglePromotionActive, deletePromotion,

  // Analytics & Marketing
  setAnalyticsDateFilter, applyCustomDateRange, exportHistoryToCSV,
  saveGoogleMapsEmbed
});

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
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
}

const TAB_TITLES = {
  tables: 'Mapa Visual de Mesas & Sala',
  orders: 'Tablero Kanban KDS (Cocina / Barra / Panadería)',
  calls: 'Llamadas de Mesero en Vivo',
  reservations: 'Agenda de Reservas',
  cashbox: 'Caja, Turnos y Cortes X / Z',
  inventory: 'Almacén, Escandallos & Mermas',
  products: 'Carta, Control 86 & Modificadores',
  promos: 'Promociones Automáticas',
  taxonomies: 'Categorías y Tipos de Menú',
  analytics: 'Métricas, Food Cost & Ingeniería de Menús',
  staff: 'Personal, PINs & Auditoría',
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

  if (tabId === 'tables') renderTablesFloorPlan();
  if (tabId === 'orders') renderKanbanBoard();
  if (tabId === 'cashbox') renderCashboxTab();
  if (tabId === 'analytics') renderAnalyticsDashboard();
  if (tabId === 'inventory') renderInventoryTab();
  if (tabId === 'reservations') renderReservationsList();
  if (tabId === 'promos') renderPromotionsTab();
  if (tabId === 'staff') renderStaffTab();
}

function renderAllViews() {
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
  window.addEventListener('online', () => setConnectionBanner(true));
  window.addEventListener('offline', () => setConnectionBanner(false, '⚠️ Sin conexión Wi-Fi. No cierres esta ventana hasta reconectar.'));

  await fetchAllData();
  applyActiveStaffPermissions();
  renderAllViews();

  // REALTIME FILTRADO POR REST_ID (Aislamiento Multi-Restaurante)
  if (client) {
    client.channel(`kds_realtime_${REST_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${REST_ID}` }, async (payload) => {
        const { data } = await client.from('orders').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false });
        if (data) {
          if (payload.eventType === 'INSERT') playSoundByName('bell');
          state.orders = data;
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
          renderCalls();
          renderTablesFloorPlan();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
        const { data } = await client.from('tables').select('*').eq('restaurant_id', REST_ID).order('table_number', { ascending: true });
        if (data) {
          state.tables = data;
          renderTablesFloorPlan();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
        const { data } = await client.from('products').select('*').eq('restaurant_id', REST_ID).order('created_at', { ascending: false });
        if (data) {
          state.products = data;
          renderProducts();
        }
      })
      .subscribe();
  }

  // SOLO ACTUALIZAMOS LOS RELOJES CADA SEGUNDO (SIN PARPADEO NI PÉRDIDA DE CLICS)
  setInterval(() => {
    updateKanbanTimers();
    if (state.calls.length > 0 && !document.getElementById('tab-calls')?.classList.contains('hidden')) {
      renderCalls();
    }
  }, 1000);
}

init();
