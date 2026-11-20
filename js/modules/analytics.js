import { escapeHtml } from '../config.js';
import { state, getWaiterNames } from '../state.js';
import { formatElapsed } from './kanban.js';

export function setAnalyticsDateFilter(type) {
  state.currentAnalyticsFilter = type;
  ['today', 'yesterday', 'week', 'all'].forEach(t => {
    const btn = document.getElementById(`btnDate-${t}`);
    if (!btn) return;
    btn.className = (t === type)
      ? 'px-3 py-1.5 rounded-xl text-xs font-bold transition bg-stone-900 text-white shadow-sm'
      : 'px-3 py-1.5 rounded-xl text-xs font-bold transition bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200';
  });
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
  const totalTips = paidOrders.reduce((acc, o) => acc + Number(o.tip_amount || 0), 0);
  const avgTicket = paidOrders.length > 0 ? (totalRevenue / paidOrders.length) : 0;

  const revEl = document.getElementById('kpiRevenue');
  const avgEl = document.getElementById('kpiAvgTicket');
  if (revEl) revEl.innerText = `$${totalRevenue.toFixed(2)} MXN`;
  if (avgEl) avgEl.innerText = `$${avgTicket.toFixed(2)}`;

  let dineRev = 0, takeRev = 0, delivRev = 0;
  let cashRev = 0, cardRev = 0, transferRev = 0;
  paidOrders.forEach(o => {
    const tot = Number(o.total || 0);
    if (!o.order_channel || o.order_channel === 'dine_in') dineRev += tot;
    else if (o.order_channel === 'takeout') takeRev += tot;
    else delivRev += tot;

    const pd = o.payment_details || {};
    if (o.payment_method === 'mixed') {
      cashRev += Number(pd.cash || 0);
      cardRev += Number(pd.card || 0);
      transferRev += Number(pd.transfer || 0);
    } else if (o.payment_method === 'card') cardRev += tot;
    else if (o.payment_method === 'transfer') transferRev += tot;
    else cashRev += tot;
  });

  if (document.getElementById('kpiChanDine')) document.getElementById('kpiChanDine').innerText = `$${dineRev.toFixed(2)}`;
  if (document.getElementById('kpiChanTakeout')) document.getElementById('kpiChanTakeout').innerText = `$${takeRev.toFixed(2)}`;
  if (document.getElementById('kpiChanDelivery')) document.getElementById('kpiChanDelivery').innerText = `$${delivRev.toFixed(2)}`;

  const paySub = document.getElementById('kpiPaymentBreakdown');
  if (paySub) paySub.innerText = `Efec: $${cashRev.toFixed(0)} • Tarj: $${cardRev.toFixed(0)} • Transf: $${transferRev.toFixed(0)} • Propinas: $${totalTips.toFixed(0)}`;

  let theoreticalCost = 0;
  paidOrders.forEach(o => {
    (o.items || []).forEach(it => {
      const recipes = state.recipes.filter(r => r.product_id === it.id);
      recipes.forEach(rcp => {
        const sup = state.supplies.find(s => s.id === rcp.supply_id);
        if (sup) theoreticalCost += Number(rcp.quantity_per_portion) * Number(it.qty) * Number(sup.unit_cost);
      });
    });
  });
  const foodCostPct = totalRevenue > 0 ? ((theoreticalCost / totalRevenue) * 100) : 0;
  if (document.getElementById('kpiFoodCostPct')) document.getElementById('kpiFoodCostPct').innerText = `${foodCostPct.toFixed(1)}%`;
  if (document.getElementById('kpiFoodCostAmount')) document.getElementById('kpiFoodCostAmount').innerText = `Costo insumos: $${theoreticalCost.toFixed(2)}`;

  calculateMenuEngineering(paidOrders);
  renderTopProducts(filtered.filter(o => o.status !== 'cancelled'));
  renderWaitersPerformance(filtered);
  calculateSlaTimes(filtered);
  renderHistoryTable(filtered);
}

function calculateMenuEngineering(paidOrders) {
  const itemStats = {};
  paidOrders.forEach(o => {
    (o.items || []).forEach(it => {
      if (!itemStats[it.title]) itemStats[it.title] = { qty: 0, revenue: 0, cost: 0 };
      const qty = Number(it.qty || 1);
      itemStats[it.title].qty += qty;
      itemStats[it.title].revenue += qty * Number(it.price || 0);
      // Costo real desde escandallos si existe, o 32% estimado
      let unitCost = 0;
      const rcps = state.recipes.filter(r => r.product_id === it.id);
      if (rcps.length > 0) {
        rcps.forEach(r => {
          const s = state.supplies.find(x => x.id === r.supply_id);
          if (s) unitCost += Number(r.quantity_per_portion) * Number(s.unit_cost);
        });
      } else {
        unitCost = Number(it.price || 0) * 0.32;
      }
      itemStats[it.title].cost += qty * unitCost;
    });
  });

  const list = Object.entries(itemStats).map(([title, st]) => ({ title, qty: st.qty, margin: st.revenue - st.cost }));
  if (list.length === 0) {
    ['matrixStarItems', 'matrixPuzzleItems', 'matrixPlowItems', 'matrixDogItems'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = 'Sin ventas cobradas en este periodo';
    });
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
  const sorted = Object.entries(sales).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
  const cont = document.getElementById('topProductsList');
  if (!cont) return;
  if (sorted.length === 0) { cont.innerHTML = '<p class="text-xs text-stone-400 py-6 text-center">Sin registros.</p>'; return; }
  cont.innerHTML = sorted.map(([title, st], idx) => `
    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-stone-50 border border-stone-100 text-xs">
      <div class="flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center text-[10px]">${idx + 1}</span><span class="font-bold text-stone-800">${escapeHtml(title)}</span></div>
      <span class="font-mono font-extrabold text-stone-900">${st.qty} vendidos</span>
    </div>
  `).join('');
}

function renderWaitersPerformance(filteredOrders) {
  const stats = {};
  const names = new Set(getWaiterNames());
  filteredOrders.forEach(o => { if (o.waiter_name) names.add(o.waiter_name); });
  names.forEach(w => stats[w] = { orders: 0, revenue: 0, tips: 0, responseSecs: [] });

  filteredOrders.forEach(o => {
    const w = o.waiter_name;
    if (stats[w] && o.status !== 'cancelled') {
      stats[w].orders++;
      if (o.status === 'paid') {
        stats[w].revenue += Number(o.total || 0);
        stats[w].tips += Number(o.tip_amount || 0);
      }
    }
  });

  // Usar state.allCalls (incluye resueltas) para métricas reales de tiempo de respuesta
  (state.allCalls || []).forEach(c => {
    if (c.status === 'resolved' && c.waiter_name && stats[c.waiter_name]) {
      const secs = Number(c.response_time_seconds) || ((c.called_at && c.resolved_at) ? (new Date(c.resolved_at).getTime() - new Date(c.called_at).getTime()) / 1000 : 0);
      if (secs > 0) stats[c.waiter_name].responseSecs.push(secs);
    }
  });

  const tbody = document.getElementById('waitersPerformanceBody');
  if (!tbody) return;
  tbody.innerHTML = Array.from(names).map(w => {
    const st = stats[w];
    const avg = st.orders > 0 ? (st.revenue / st.orders).toFixed(2) : '0.00';
    const avgResp = st.responseSecs.length > 0
      ? formatElapsed(Math.round(st.responseSecs.reduce((a, b) => a + b, 0) / st.responseSecs.length))
      : 'Sin llamadas';
    return `
      <tr class="hover:bg-stone-50 text-stone-700">
        <td class="py-2 font-bold text-stone-900">${escapeHtml(w)}</td>
        <td class="py-2 font-mono">${st.orders}</td>
        <td class="py-2 font-mono font-bold text-emerald-700">$${st.revenue.toFixed(2)}</td>
        <td class="py-2 font-mono text-stone-500">$${avg} <span class="text-[10px] text-amber-700">(Prop: $${st.tips.toFixed(0)})</span></td>
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
  const avgW = wait.length > 0 ? Math.round(wait.reduce((a, b) => a + b, 0) / wait.length) : 0;
  const avgK = kitchen.length > 0 ? Math.round(kitchen.reduce((a, b) => a + b, 0) / kitchen.length) : 0;
  const avgT = table.length > 0 ? Math.round(table.reduce((a, b) => a + b, 0) / table.length) : 0;
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
    tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-stone-400">Sin comandas registradas en este periodo.</td></tr>';
    return;
  }
  tbody.innerHTML = filteredOrders.map(o => {
    const itemsSummary = (o.items || []).map(i => `${i.qty}x ${i.title}`).join(', ');
    const dateFormatted = new Date(o.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    let statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${o.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${escapeHtml(o.status)}</span>`;
    if (o.status === 'cancelled') statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">🚫 Cancelada</span>`;
    return `
      <tr onclick="window.openOrderDetailModal('${o.id}')" class="hover:bg-amber-50 cursor-pointer text-stone-700 transition">
        <td class="py-2.5 font-bold font-mono">Mesa ${escapeHtml(o.table_number)}</td>
        <td class="py-2.5 font-mono text-stone-500">${dateFormatted}</td>
        <td class="py-2.5 font-semibold text-stone-800">${escapeHtml(o.waiter_name || 'Sin asignar')}</td>
        <td class="py-2.5 max-w-xs truncate" title="${escapeHtml(itemsSummary)}">${escapeHtml(itemsSummary)}</td>
        <td class="py-2.5 font-mono text-emerald-600 font-semibold">${o.discount > 0 ? `-$${Number(o.discount).toFixed(2)}` : '-'}</td>
        <td class="py-2.5 font-mono font-bold text-stone-900">$${Number(o.total).toFixed(2)}</td>
        <td class="py-2.5 font-mono text-[10px] uppercase text-stone-600">${escapeHtml(o.payment_method || '-')}</td>
        <td class="py-2.5">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

export function exportHistoryToCSV() {
  const filtered = getFilteredOrdersForAnalytics();
  if (filtered.length === 0) return;
  let csv = "data:text/csv;charset=utf-8,ID,Mesa,Canal,Fecha,Hora,Mesero,Platillos,Descuento,Total,Propina,MetodoPago,Estatus
";
  filtered.forEach(o => {
    const d = new Date(o.created_at);
    const items = (o.items || []).map(i => `${i.qty}x ${i.title}`).join(' | ').replace(/"/g, '""');
    csv += `"${o.id}","${o.table_number}","${o.order_channel || 'dine_in'}","${d.toLocaleDateString()}","${d.toLocaleTimeString()}","${o.waiter_name || ''}","${items}",${o.discount || 0},${o.total || 0},${o.tip_amount || 0},"${o.payment_method || ''}","${o.status}"
`;
  });
  const encodedUri = encodeURI(csv);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `comandas_${state.currentAnalyticsFilter}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
