import { STATUS_LABELS } from '../config.js';
import { formatElapsed } from './kds.js';

export function renderAnalyticsDashboard(adminOrders) {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayOrders = (adminOrders || []).filter(o => o.created_at && o.created_at.startsWith(todayStr));

  const paidOrders = todayOrders.filter(o => o.status === 'paid');
  const totalRevenue = paidOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);
  const avgTicket = paidOrders.length > 0 ? (totalRevenue / paidOrders.length) : 0;

  const activeOrders = todayOrders.filter(o => o.status !== 'paid' && !o.is_archived);
  const pendingRevenue = activeOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);

  const kpiRev = document.getElementById('kpiRevenue');
  if (kpiRev) kpiRev.innerText = `$${totalRevenue.toFixed(2)} MXN`;

  const kpiAvg = document.getElementById('kpiAvgTicket');
  if (kpiAvg) kpiAvg.innerText = `$${avgTicket.toFixed(2)}`;

  const kpiTot = document.getElementById('kpiTotalOrders');
  if (kpiTot) kpiTot.innerText = paidOrders.length;

  const kpiPend = document.getElementById('kpiPendingRevenue');
  if (kpiPend) kpiPend.innerText = `$${pendingRevenue.toFixed(2)}`;

  let waitTimes = [];
  let kitchenTimes = [];
  let tableTimes = [];

  todayOrders.forEach(o => {
    const created = new Date(o.created_at).getTime();
    if (o.preparing_at) waitTimes.push((new Date(o.preparing_at).getTime() - created) / 1000);
    if (o.preparing_at && o.delivered_at) kitchenTimes.push((new Date(o.delivered_at).getTime() - new Date(o.preparing_at).getTime()) / 1000);
    if (o.delivered_at && o.paid_at) tableTimes.push((new Date(o.paid_at).getTime() - new Date(o.delivered_at).getTime()) / 1000);
  });

  const avgWait = waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;
  const avgKitchen = kitchenTimes.length > 0 ? Math.round(kitchenTimes.reduce((a, b) => a + b, 0) / kitchenTimes.length) : 0;
  const avgTable = tableTimes.length > 0 ? Math.round(tableTimes.reduce((a, b) => a + b, 0) / tableTimes.length) : 0;

  const slaWait = document.getElementById('slaWaitTime');
  if (slaWait) slaWait.innerText = formatElapsed(avgWait);

  const slaKitchen = document.getElementById('slaKitchenTime');
  if (slaKitchen) slaKitchen.innerText = formatElapsed(avgKitchen);

  const slaTable = document.getElementById('slaTableTime');
  if (slaTable) slaTable.innerText = formatElapsed(avgTable);

  // Top Platillos
  const productSales = {};
  todayOrders.forEach(o => {
    (o.items || []).forEach(it => {
      if (!productSales[it.title]) productSales[it.title] = { qty: 0, revenue: 0 };
      productSales[it.title].qty += it.qty;
      productSales[it.title].revenue += it.qty * Number(it.price || 0);
    });
  });

  const sortedProducts = Object.entries(productSales).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
  const topListEl = document.getElementById('topProductsList');

  if (topListEl) {
    if (sortedProducts.length === 0) {
      topListEl.innerHTML = '<p class="text-xs text-stone-400 text-center py-6">Sin registros de ventas aún.</p>';
    } else {
      topListEl.innerHTML = sortedProducts.map(([title, data], idx) => `
        <div class="flex items-center justify-between p-2 rounded-xl bg-stone-50 border border-stone-100 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center text-[10px]">${idx + 1}</span>
            <span class="font-bold text-stone-800">${title}</span>
          </div>
          <div class="text-right font-mono">
            <span class="font-bold text-stone-900">${data.qty} vendidos</span>
          </div>
        </div>
      `).join('');
    }
  }

  // Tabla historial
  const tableBody = document.getElementById('historyTableBody');
  if (tableBody) {
    if (!adminOrders || adminOrders.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-stone-400">No hay comandas registradas</td></tr>';
      return;
    }

    tableBody.innerHTML = adminOrders.map(o => {
      const itemsSummary = (o.items || []).map(i => `${i.qty}x ${i.title}`).join(', ');
      return `
        <tr class="hover:bg-stone-50 text-stone-700">
          <td class="py-2.5 font-bold font-mono">Mesa ${o.table_number}</td>
          <td class="py-2.5 font-mono text-stone-500">${new Date(o.created_at).toLocaleTimeString().substring(0,5)}</td>
          <td class="py-2.5 font-semibold text-stone-800">${o.waiter_name || 'Sin asignar'}</td>
          <td class="py-2.5 max-w-xs truncate" title="${itemsSummary}">${itemsSummary}</td>
          <td class="py-2.5 font-mono text-emerald-600 font-semibold">${o.discount > 0 ? `-$${Number(o.discount).toFixed(2)}` : '-'}</td>
          <td class="py-2.5 font-mono font-bold text-stone-900">$${Number(o.total).toFixed(2)}</td>
          <td class="py-2.5">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${o.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
              ${o.is_archived ? 'Archivada' : STATUS_LABELS[o.status] || o.status}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }
}
