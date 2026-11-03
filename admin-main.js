import { client, REST_ID } from './config.js';
import { changeSoundPreset, previewCurrentSound, playFlowSound } from './audio.js';
import * as KDS from './modules/kds.js';
import * as Analytics from './modules/analytics.js';
import * as Waiter from './modules/waiter.js';
import * as Taxonomies from './modules/taxonomies.js';
import * as Products from './modules/products.js';
import * as Promotions from './modules/promotions.js';

// Exponer funciones globales para los onclick del HTML sin romper nada
window.app = {
  switchTab,
  changeSoundPreset,
  previewCurrentSound,
  setKanbanDisplayMode: KDS.setKanbanDisplayMode,
  changeSingleStatusView: KDS.changeSingleStatusView,
  moveOrderStatus: KDS.moveOrderStatus,
  archiveOrder: KDS.archiveOrder,
  deleteOrder: KDS.deleteOrder,
  updateOrderWaiter: KDS.updateOrderWaiter,
  openEditOrderModal: KDS.openEditOrderModal,
  closeEditOrderModal: KDS.closeEditOrderModal,
  changeModalItemQty: KDS.changeModalItemQty,
  removeModalItem: KDS.removeModalItem,
  removeModalModifier: KDS.removeModalModifier,
  addModalModifierPrompt: KDS.addModalModifierPrompt,
  filterModalProductSearch: (q) => KDS.filterModalProductSearch(q, Products.getProducts()),
  addModalNewProduct: (id) => KDS.addModalNewProduct(Products.getProducts().find(p => p.id === id)),
  saveOrderEdits: KDS.saveOrderEdits,
  testSimulateOrder,
  resolveCall: Waiter.resolveCall,
  testSimulateCall: Waiter.testSimulateCall,
  toggleSection: Taxonomies.toggleSection,
  createCategory: Taxonomies.createCategory,
  createType: Taxonomies.createType,
  reorderTaxonomy: Taxonomies.reorderTaxonomy,
  deleteTaxonomy: Taxonomies.deleteTaxonomy,
  inspectItem: (mode, id) => Taxonomies.inspectItem(mode, id, Products.getProducts()),
  unassignProductFromCurrent: async (id) => {
    const insp = Taxonomies.getCurrentInspector();
    if (!insp) return;
    const p = Products.getProducts().find(x => x.id === id);
    if (p) {
      if (insp.mode === 'category') p.category_id = null;
      else p.type_id = null;
    }
    Taxonomies.inspectItem(insp.mode, insp.id, Products.getProducts());
  },
  toggleProductStock: (id) => Products.toggleProductStock(id),
  createProduct: () => Products.createProduct(),
  renderPromoDynamicFields: Promotions.renderPromoDynamicFields,
  updatePromoLivePreview: Promotions.updatePromoLivePreview,
  savePromotion: Promotions.savePromotion
};

// Cambio de pestaña limpio
export function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('border-stone-900', 'text-stone-900', 'font-bold');
    btn.classList.add('border-transparent', 'text-stone-500', 'font-medium');
  });

  const targetPanel = document.getElementById(`tab-${tabId}`);
  const targetBtn = document.getElementById(`tabBtn-${tabId}`);
  if (targetPanel && targetBtn) {
    targetPanel.classList.remove('hidden');
    targetBtn.classList.remove('border-transparent', 'text-stone-500', 'font-medium');
    targetBtn.classList.add('border-stone-900', 'text-stone-900', 'font-bold');
  }

  if (tabId === 'analytics') {
    Analytics.renderAnalyticsDashboard(KDS.getOrders());
  }
}

// Simular comanda con desbloqueo de audio seguro
async function testSimulateOrder() {
  const mockTable = '0' + (Math.floor(Math.random() * 8) + 1);
  const mockOrder = {
    id: 'ord-' + Date.now(),
    restaurant_id: REST_ID,
    table_number: mockTable,
    waiter_name: 'Carlos M.',
    items: [
      { title: 'Tostón de Aguacate Trufado', qty: 1, price: 165.00, modifiers: ['Sin Huevo Poché'] },
      { title: 'Flat White Oaxaca Pluma', qty: 2, price: 78.00, modifiers: ['Leche de Avena Barista'] }
    ],
    subtotal: 321.00,
    discount: 78.00,
    total: 243.00,
    status: 'pending',
    is_archived: false,
    customer_notes: 'Mesa con prisa',
    created_at: new Date().toISOString()
  };

  playFlowSound('new_order');

  const orders = KDS.getOrders();
  orders.unshift(mockOrder);
  KDS.setOrders(orders);

  if (client) {
    try {
      await client.from('orders').insert([mockOrder]);
    } catch(e) {
      console.warn("Insert simulated order failed:", e);
    }
  }
}

// Carga y sincronización inicial
async function initApp() {
  console.log("Iniciando Dashboard Modular...");

  // Inicializar componentes
  KDS.setOrders([]);
  Taxonomies.setTaxonomies([], []);
  Products.setProducts([], [], []);
  Promotions.setPromotions([]);
  Waiter.setCalls([]);

  // Consultar Supabase
  if (client) {
    try {
      const [ordersRes, prodsRes, catsRes, typesRes, promosRes, callsRes] = await Promise.all([
        client.from('orders').select('*').order('created_at', { ascending: false }),
        client.from('products').select('*').order('created_at', { ascending: false }),
        client.from('categories').select('*').order('order_index', { ascending: true }),
        client.from('product_types').select('*').order('order_index', { ascending: true }),
        client.from('promotions').select('*').order('created_at', { ascending: false }),
        client.from('waiter_calls').select('*').eq('status', 'pending').order('called_at', { ascending: true })
      ]);

      if (ordersRes?.data) KDS.setOrders(ordersRes.data);
      if (prodsRes?.data) Products.setProducts(prodsRes.data, catsRes?.data || [], typesRes?.data || []);
      if (catsRes?.data || typesRes?.data) Taxonomies.setTaxonomies(catsRes?.data || [], typesRes?.data || []);
      if (promosRes?.data) Promotions.setPromotions(promosRes.data);
      if (callsRes?.data) Waiter.setCalls(callsRes.data);

      const statusEl = document.getElementById('connStatus');
      if (statusEl) statusEl.innerText = 'Sincronizado en tiempo real ✓';

      // Realtime
      client
        .channel('kds_modular_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
          const { data } = await client.from('orders').select('*').order('created_at', { ascending: false });
          if (data) {
            playFlowSound('new_order');
            KDS.setOrders(data);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls' }, async () => {
          const { data } = await client.from('waiter_calls').select('*').eq('status', 'pending').order('called_at', { ascending: true });
          if (data) Waiter.setCalls(data);
        })
        .subscribe();

    } catch (err) {
      console.warn("Error cargando datos de Supabase:", err);
      const statusEl = document.getElementById('connStatus');
      if (statusEl) statusEl.innerText = 'Modo Local Activo';
    }
  }

  setInterval(KDS.updateOrderTimers, 1000);
}

window.addEventListener('DOMContentLoaded', initApp);
