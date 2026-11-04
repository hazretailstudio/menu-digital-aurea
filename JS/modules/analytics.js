import { state } from '../state.js';
import { WAITERS_LIST } from '../config.js';
import { formatElapsed } from './kanban.js';
import { openOrderDetailModal } from './orders-modal.js';

export function setAnalyticsDateFilter(type) {
  state.currentAnalyticsFilter = type;
  renderAnalyticsDashboard();
}

export function applyCustomDateRange() {
  const fromVal = document.getElementById('analyticsDateFrom')?.value;
  const toVal = document.getElementById('analyticsDateTo')?.value;
  if (!fromVal) return;
  state.customDateFrom = fromVal;
  state.customDateTo = toVal || fromVal;
  state.currentAnalyticsFilter = 'custom';
  renderAnalyticsDashboard();
}

export function getFilteredOrdersForAnalytics() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  if (state.currentAnalyticsFilter === 'today') return state.orders.filter(o => o.created_at && o.created_at.startsWith(todayStr));
  if (state.currentAnalyticsFilter === 'yesterday') {
    const yStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
    return state.orders.filter(o => o.created_at && o.created_at.startsWith(yStr));
  }
  if (state.currentAnalyticsFilter === 'week') {
    const sevenAgo = new Date(now.getTime() - 7 * 86400000);
    return state.orders.filter(o => new Date(o.created_at) >= sevenAgo);
  }
  if (state.currentAnalyticsFilter === 'custom' && state.customDateFrom) {
    const fromDate = new Date(state.customDateFrom + 'T00:00:00');
    const toDate = new Date((state.customDateTo || state.customDateFrom) + 'T23:59:59');
    return state.orders.filter(o => { const d = new Date(o.created_at); return d >= fromDate && d <= toDate; });
  }
  return state.orders;
}

export function renderAnalyticsDashboard() {
  const filtered = getFilteredOrdersForAnalytics();
  const paidOrders = filtered.filter(o => o.status === 'paid');
  const totalRevenue = paidOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);
  const avgTicket = paidOrders.length > 0 ? (totalRevenue / paidOrders.length) : 0;

  document.getElementById('kpiRevenue').innerText = `$${totalRevenue.toFixed(2)} MXN`;
  document.getElementById('kpiAvgTicket').innerText = `$${avgTicket.toFixed(2)}`;

  let dineRev = 0, takeRev = 0, delivRev = 0;
  paidOrders.forEach(o => {
    const tot = Number(o.total || 0);
    if (!o.order_channel || o.order_channel === 'dine_in') dineRev += tot;
    else if (o.order_channel === 'takeout') takeRev += tot;
    else delivRev += tot;
  });
  document.getElementById('kpiChanDine').innerText = `$${dineRev.toFixed(2)}`;
  document.getElementById('kpiChanTakeout').innerText = `$${takeRev.toFixed(2)}`;
  document.getElementById('kpiChanDelivery').innerText = `$${delivRev.toFixed(2)}`;

  let theoreticalCost = 0;
  paidOrders.forEach(o => {
    (o.items || []).forEach(it => {
      const recipes = state.recipes.filter(r => r.product_id === it.id || r.product_title === it.title);
      recipes.forEach(rcp => {
        const sup = state.supplies.find(s => s.id === rcp.supply_id);
        if (sup) theoreticalCost += Number(rcp.quantity_per_portion) * Number(it.qty) * Number(sup.unit_cost);
      });
    });
  });
  const foodCostPct = totalRevenue > 0 ? ((theoreticalCost / totalRevenue) * 100) : 31.2;
  document.getElementById('kpiFoodCostPct').innerText = `${foodCostPct.toFixed(1)}%`;
  document.getElementById('kpiFoodCostAmount').innerText = `Costo insumos: $${theoreticalCost.toFixed(2)}`;

  calculateMenuEngineering(paidOrders);
  renderTopProducts(filtered);
  renderWaitersPerformance(filtered);
  calculateSlaTimes(filtered);
  renderHistoryTable(filtered);
}

function calculateMenuEngineering(paidOrders) {
  const itemStats = {};
  paidOrders.forEach(o => {
    (o.items || []).forEach(it => {
      if (!itemStats[it.title]) itemStats[it.title] = { qty: 0, revenue: 0, cost: 0 };
      itemStats[it.title].qty += Number(it.qty || 1);
      itemStats[it.title].revenue += Number(it.qty || 1) * Number(it.price || 0);
      itemStats[it.title].cost += Number(it.qty || 1) * (Number(it.price || 0) * 0.32);
    });
  });
  const list = Object.entries(itemStats).map(([title, st]) => ({ title, qty: st.qty, margin: st.revenue - st.cost }));
  if (list.length === 0) {
    document.getElementById('matrixStarItems').innerText = 'Tostón de Aguacate Trufado';
    document.getElementById('matrixPuzzleItems').innerText = 'Flat White Pluma';
    document.getElementById('matrixPlowItems').innerText = 'Croissant Almendra';
    document.getElementById('matrixDogItems').innerText = 'Pan Francés';
    return;
  }
  const avgQty = list.reduce((acc, i) => acc + i.qty, 0) / list.length;
  const avgMargin = list.reduce((acc, i) => acc + i.margin, 0) / list.length;
  document.getElementById('matrixStarItems').innerText = list.filter(i => i.qty >= avgQty && i.margin >= avgMargin).map(i => i.title).join(', ') || 'Sin clasificar';
  document.getElementById('matrixPuzzleItems').innerText = list.filter(i => i.qty < avgQty && i.margin >= avgMargin).map(i => i.title).join(', ') || 'Sin clasificar';
  document.getElementById('matrixPlowItems').innerText = list.filter(i => i.qty >= avgQty && i.margin < avgMargin).map(i => i.title).join(', ') || 'Sin clasificar';
  document.getElementById('matrixDogItems').innerText = list.filter(i => i.qty < avgQty && i.margin < avgMargin).map(i => i.title).join(', ') || 'Sin clasificar';
}

function renderTopProducts(filteredOrders) {
  const sales = {};
  filteredOrders.forEach(o => {
    (o.items || []).forEach(it => {
      if (!sales[it.title]) sales[it.title] = { qty: 0, rev: 0 };
      sales[it.title].qty += Number(it.qty || 1);
      sales[it.title].rev += Number(it.qty || 1) * Number(it.price || 0);
    });
  });
  const sorted = Object.entries(sales).sort((a,b) => b[1].qty - a[1].qty).slice(0, 5);
  const cont = document.getElementById('topProductsList');
  if (!cont) return;
  if (sorted.length === 0) { cont.innerHTML = '<p class="text-xs text-stone-400 py-6 text-center">Sin registros.</p>'; return; }
  cont.innerHTML = sorted.map(([title, st], idx) => `
    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-stone-50 border border-stone-100 text-xs">
      <div class="flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center text-[10px]">${idx + 1}</span><span class="font-bold text-stone-800">${title}</span></div>
      <span class="font-mono font-extrabold text-stone-900">${st.qty} vendidos</span>
    </div>
  `).join('');
}

function renderWaitersPerformance(filteredOrders) {
  const stats = {};
  WAITERS_LIST.forEach(w => stats[w] = { orders: 0, revenue: 0, responseSecs: [] });
  filteredOrders.forEach(o => {
    const w = o.waiter_name;
    if (stats[w]) {
      stats[w].orders++;
      if (o.status === 'paid') stats[w].revenue += Number(o.total || 0);
    }
  });
  state.calls.forEach(c => {
    if (c.status === 'resolved' && c.waiter_name && stats[c.waiter_name]) {
      if (c.called_at && c.resolved_at) {
        const secs = (new Date(c.resolved_at).getTime() - new Date(c.called_at).getTime()) / 1000;
        if (secs > 0) stats[c.waiter_name].responseSecs.push(secs);
      }
    }
  });
  const tbody = document.getElementById('waitersPerformanceBody');
  if (!tbody) return;
  tbody.innerHTML = WAITERS_LIST.map(w => {
    const st = stats[w];
    const avg = st.orders > 0 ? (st.revenue / st.orders).toFixed(2) : '0.00';
    const avgResp = st.responseSecs.length > 0 ? formatElapsed(Math.round(st.responseSecs.reduce((a,b)=>a+b, 0) / st.responseSecs.length)) : '35s (Prom.)';
    return `
      <tr class="hover:bg-stone-50 text-stone-700">
        <td class="py-2 font-bold text-stone-900">${w}</td>
        <td class="py-2 font-mono">${st.orders}</td>
        <td class="py-2 font-mono font-bold text-emerald-700">$${st.revenue.toFixed(2)}</td>
        <td class="py-2 font-mono text-stone-500">$${avg}</td>
        <td class="py-2 font-mono font-semibold text-amber-800">⏱ ${avgResp}</td>
      </tr>
    `;
  }).join('');
}

function calculateSlaTimes(filteredOrders) {
  let wait = [], kitchen = [], table = [];
  filteredOrders.forEach(o => {
    const cMs = new Date(o.created_at).getTime();
    if (o.preparing_at) wait.push((new Date(o.preparing_at).getTime() - cMs) / 1000);
    if (o.preparing_at && o.delivered_at) kitchen.push((new Date(o.delivered_at).getTime() - new Date(o.preparing_at).getTime()) / 1000);
    if (o.delivered_at && o.paid_at) table.push((new Date(o.paid_at).getTime() - new Date(o.delivered_at).getTime()) / 1000);
  });
  const avgW = wait.length > 0 ? Math.round(wait.reduce((a,b)=>a+b,0)/wait.length) : 180;
  const avgK = kitchen.length > 0 ? Math.round(kitchen.reduce((a,b)=>a+b,0)/kitchen.length) : 720;
  const avgT = table.length > 0 ? Math.round(table.reduce((a,b)=>a+b,0)/table.length) : 1800;
  document.getElementById('slaWaitTime').innerText = formatElapsed(avgW);
  document.getElementById('slaKitchenTime').innerText = formatElapsed(avgK);
  document.getElementById('slaTableTime').innerText = formatElapsed(avgT);
}

function renderHistoryTable(filteredOrders) {
  const tbody = document.getElementById('historyTableBody');
  const countEl = document.getElementById('historyOrdersCount');
  if (countEl) countEl.innerText = `${filteredOrders.length} comandas`;
  if (!tbody) return;

  if (filteredOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-stone-400">Sin comandas registradas.</td></tr>';
    return;
  }
  tbody.innerHTML = filteredOrders.map(o => {
    const itemsSummary = (o.items || []).map(i => `${i.qty}x ${i.title}`).join(', ');
    const dateFormatted = new Date(o.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    let statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${o.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${o.status}</span>`;
    if (o.status === 'cancelled') statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">🚫 Cancelada / Eliminada</span>`;
    return `
      <tr onclick="window.openOrderDetailModal('${o.id}')" class="hover:bg-amber-50 cursor-pointer text-stone-700 transition">
        <td class="py-2.5 font-bold font-mono">Mesa ${o.table_number}</td>
        <td class="py-2.5 font-mono text-stone-500">${dateFormatted}</td>
        <td class="py-2.5 font-semibold text-stone-800">${o.waiter_name || 'Sin asignar'}</td>
        <td class="py-2.5 max-w-xs truncate" title="${itemsSummary}">${itemsSummary}</td>
        <td class="py-2.5 font-mono text-emerald-600 font-semibold">${o.discount > 0 ? `-$${Number(o.discount).toFixed(2)}` : '-'}</td>
        <td class="py-2.5 font-mono font-bold text-stone-900">$${Number(o.total).toFixed(2)}</td>
        <td class="py-2.5">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

export function exportHistoryToCSV() {
  const filtered = getFilteredOrdersForAnalytics();
  if (filtered.length === 0) return;
  let csv = "data:text/csv;charset=utf-8,ID,Mesa,Canal,Fecha,Hora,Mesero,Platillos,Total,Estatus\n";
  filtered.forEach(o => {
    const d = new Date(o.created_at);
    const items = (o.items || []).map(i => `${i.qty}x ${i.title}`).join(' | ').replace(/"/g, '""');
    csv += `"${o.id}","${o.table_number}","${o.order_channel || 'dine_in'}","${d.toLocaleDateString()}","${d.toLocaleTimeString()}","${o.waiter_name || ''}","${items}",${o.total},"${o.status}"\n`;
  });
  const encodedUri = encodeURI(csv);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `comandas_${state.currentAnalyticsFilter}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}