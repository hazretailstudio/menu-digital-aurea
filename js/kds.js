import { getRequestedRestaurantSlug, DEFAULT_REST_ID, escapeHtml, showToast } from './config.js';
import { client } from './state.js';
import { playSoundByName } from './audio.js';

const newOrderAudio = new Audio('/assets/sounds/new-order.mp3');

const ACTIVE_STATUSES = [
  'PENDING_CONFIRMATION',
  'CONFIRMED_PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'pending',
  'preparing'
];

const NEXT_ACTIONS = {
  PENDING_CONFIRMATION: () => [
    { status: 'CONFIRMED_PREPARING', label: '🔥 Confirmar y Preparar', cls: 'bg-amber-600 hover:bg-amber-500' },
    { status: 'REJECTED', label: '✕ Rechazar', cls: 'bg-rose-700 hover:bg-rose-600' }
  ],
  CONFIRMED_PREPARING: (order) => [
    order.order_type === 'DELIVERY'
      ? { status: 'OUT_FOR_DELIVERY', label: '🛵 Enviar a Reparto', cls: 'bg-blue-600 hover:bg-blue-500' }
      : { status: 'READY_FOR_PICKUP', label: '✅ Listo para Entregar', cls: 'bg-emerald-600 hover:bg-emerald-500' }
  ],
  READY_FOR_PICKUP: () => [{ status: 'COMPLETED', label: '🏁 Completar', cls: 'bg-stone-700 hover:bg-stone-600' }],
  OUT_FOR_DELIVERY: () => [{ status: 'COMPLETED', label: '🏁 Entregado', cls: 'bg-stone-700 hover:bg-stone-600' }],
  pending: () => [{ status: 'preparing', label: '🔥 Preparar', cls: 'bg-amber-600 hover:bg-amber-500' }],
  preparing: () => [{ status: 'delivered', label: '✅ Servido', cls: 'bg-emerald-600 hover:bg-emerald-500' }]
};

let kdsOrders = [];
let activeRestaurantId = DEFAULT_REST_ID;

function triggerAlert() {
  newOrderAudio.currentTime = 0;
  newOrderAudio.play().catch(() => playSoundByName('bell'));
}

async function initKDS() {
  const slug = getRequestedRestaurantSlug();
  const { data: rest } = await client.from('restaurants').select('id, name').eq('slug', slug).maybeSingle();
  if (rest?.id) {
    activeRestaurantId = rest.id;
    document.getElementById('kdsTitle').innerText = `🍳 KDS · ${rest.name}`;
  }

  document.getElementById('btnTestSound')?.addEventListener('click', triggerAlert);
  document.getElementById('btnEnablePush')?.addEventListener('click', subscribeKitchenOneSignal);

  await fetchKdsOrders();
  subscribeKdsRealtime();
}

async function fetchKdsOrders() {
  const { data, error } = await client
    .from('orders')
    .select('*')
    .eq('restaurant_id', activeRestaurantId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true });

  if (!error && data) {
    kdsOrders = data;
    document.getElementById('kdsStatus').innerText = `Sincronizado en tiempo real ✓ (${kdsOrders.length} activas)`;
    renderKDS();
  }
}

function subscribeKdsRealtime() {
  client
    .channel(`kds_standalone_${activeRestaurantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${activeRestaurantId}` },
      (payload) => {
        if (payload.eventType === 'INSERT' && ACTIVE_STATUSES.includes(payload.new.status)) {
          kdsOrders.push(payload.new);
          triggerAlert();
        } else if (payload.eventType === 'UPDATE') {
          const idx = kdsOrders.findIndex(o => o.id === payload.new.id);
          const stillActive = ACTIVE_STATUSES.includes(payload.new.status);
          if (idx >= 0 && stillActive) kdsOrders[idx] = payload.new;
          else if (idx >= 0 && !stillActive) kdsOrders.splice(idx, 1);
          else if (idx === -1 && stillActive) kdsOrders.push(payload.new);
        }
        document.getElementById('kdsStatus').innerText = `Sincronizado en tiempo real ✓ (${kdsOrders.length} activas)`;
        renderKDS();
      }
    )
    .subscribe();
}

async function subscribeKitchenOneSignal() {
  if (!window.OneSignalDeferred) {
    showToast('Configura tu OneSignal App ID en kds.html para activar Push.', 'warning');
    return;
  }
  window.OneSignalDeferred.push(async (OneSignal) => {
    await OneSignal.Notifications.requestPermission();
    await OneSignal.User.addTags({
      role: 'kitchen',
      restaurant_id: activeRestaurantId
    });
    showToast('Dispositivo suscrito a alertas de cocina ✓', 'success');
  });
}

async function transitionOrderStatus(orderId, nextStatus) {
  const { error } = await client.from('orders').update({ status: nextStatus }).eq('id', orderId);
  if (error) showToast(`Error: ${error.message}`, 'error');
}

function renderKDS() {
  const board = document.getElementById('kdsBoard');
  if (!board) return;

  if (kdsOrders.length === 0) {
    board.innerHTML = '<p class="text-stone-500 text-sm col-span-full text-center py-16">Sin comandas activas en cocina.</p>';
    return;
  }

  board.innerHTML = kdsOrders.map(order => {
    const items = (order.items_snapshot?.length ? order.items_snapshot : order.items) || [];
    const actions = NEXT_ACTIONS[order.status] ? NEXT_ACTIONS[order.status](order) : [];
    const timeStr = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <article class="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-lg">
        <div>
          <div class="flex justify-between items-center border-b border-stone-800 pb-2 mb-2">
            <span class="font-black text-base text-white">#${order.order_number || order.id.slice(0, 6)} · ${escapeHtml(order.table_number)}</span>
            <span class="text-[11px] font-mono text-amber-400">${timeStr}</span>
          </div>
          <div class="text-xs text-stone-400 mb-3">
            ${escapeHtml(order.order_type || order.order_channel || 'DINE_IN')} · ${escapeHtml(order.customer_name || 'Mesa')}
            ${order.requires_card_terminal ? ' · 💳 TPV' : ''}
          </div>
          <ul class="space-y-2 text-sm">
            ${items.map(it => `
              <li class="border-l-2 border-amber-500 pl-2.5">
                <div class="font-bold text-stone-100">${it.qty}x ${escapeHtml(it.title)}
                  ${it.guest_name ? `<span class="text-xs font-normal text-stone-400">(${escapeHtml(it.guest_name)})</span>` : ''}
                </div>
                ${it.modifiers?.length ? `<div class="text-xs text-amber-300">${escapeHtml(it.modifiers.map(m => m.name).join(', '))}</div>` : ''}
                ${it.note || it.notes ? `<div class="text-xs text-rose-400 italic">Nota: ${escapeHtml(it.note || it.notes)}</div>` : ''}
              </li>
            `).join('')}
          </ul>
          ${order.customer_notes ? `<p class="mt-3 text-xs bg-stone-800 p-2 rounded-xl text-amber-200">💬 ${escapeHtml(order.customer_notes)}</p>` : ''}
        </div>
        <div class="flex gap-2 pt-2 border-t border-stone-800">
          ${actions.map(act => `
            <button data-order-id="${order.id}" data-next-status="${act.status}"
              class="kds-btn flex-1 ${act.cls} text-white text-xs font-bold py-2.5 px-3 rounded-xl transition">
              ${act.label}
            </button>
          `).join('')}
        </div>
      </article>
    `;
  }).join('');

  board.querySelectorAll('.kds-btn').forEach(btn => {
    btn.addEventListener('click', () => transitionOrderStatus(btn.dataset.orderId, btn.dataset.nextStatus));
  });
}

initKDS();
