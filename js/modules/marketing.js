import { client } from '../state.js';
import { REST_ID, showToast } from '../config.js';

export function saveGoogleMapsEmbed() {
  const val = document.getElementById('gmapsEmbedInput')?.value?.trim();
  if (!val) return;
  const prev = document.getElementById('gmapsPreviewContainer');
  if (prev) prev.innerHTML = val;
  if (client) {
    client.from('restaurants').update({ google_maps_embed: val }).eq('id', REST_ID);
  }
  showToast('Ficha de Google Maps vinculada correctamente ✓', 'success');
}

export function toggleWhatsappInputVisibility() {
  const mode = document.getElementById('adminOrderDeliveryMode')?.value || 'KDS';
  const waBox = document.getElementById('adminWhatsappNumberBox');
  if (waBox) {
    waBox.classList.toggle('hidden', mode === 'KDS');
  }
}

export async function loadOrderChannelSettings() {
  if (!client) return;
  const { data } = await client
    .from('restaurants')
    .select('order_delivery_mode, whatsapp_number, is_ordering_enabled')
    .eq('id', REST_ID)
    .maybeSingle();

  if (!data) return;
  const modeSel = document.getElementById('adminOrderDeliveryMode');
  const waInput = document.getElementById('adminWhatsappNumber');
  const enabledChk = document.getElementById('adminIsOrderingEnabled');

  if (modeSel) modeSel.value = data.order_delivery_mode || 'KDS';
  if (waInput) waInput.value = data.whatsapp_number || '';
  if (enabledChk) enabledChk.checked = data.is_ordering_enabled !== false;
  toggleWhatsappInputVisibility();
}

export async function saveOrderChannelSettings() {
  if (!client) return;
  const mode = document.getElementById('adminOrderDeliveryMode')?.value || 'KDS';
  const rawPhone = (document.getElementById('adminWhatsappNumber')?.value || '').replace(/\D/g, '');
  const isOrderingEnabled = Boolean(document.getElementById('adminIsOrderingEnabled')?.checked);

  if ((mode === 'WHATSAPP' || mode === 'BOTH') && rawPhone.length < 10) {
    showToast('Ingresa un número de WhatsApp válido (con lada, ej. 523312345678).', 'warning');
    return;
  }

  const { error } = await client
    .from('restaurants')
    .update({
      order_delivery_mode: mode,
      whatsapp_number: rawPhone || null,
      is_ordering_enabled: isOrderingEnabled
    })
    .eq('id', REST_ID);

  if (error) {
    showToast(`No se pudo guardar: ${error.message}`, 'error');
    return;
  }
  showToast('Configuración de pedidos del Menú QR guardada ✓', 'success');
}

function injectOrderSettingsCard() {
  const tabMarketing = document.getElementById('tab-marketing');
  if (!tabMarketing || document.getElementById('orderChannelSettingsCard')) return;

  const card = document.createElement('div');
  card.id = 'orderChannelSettingsCard';
  card.className = 'bg-white rounded-2xl p-5 shadow-sm border border-stone-200 space-y-4';
  card.innerHTML = `
    <div class="border-b pb-3 flex flex-wrap justify-between items-center gap-2">
      <div>
        <h3 class="font-bold text-base text-stone-900">📲 Recepción de Pedidos del Menú QR</h3>
        <p class="text-xs text-stone-500">Elige si los pedidos entran directo al tablero de Comandas del Admin, se envían por WhatsApp, o ambos.</p>
      </div>
      <label class="inline-flex items-center gap-2 text-xs font-bold text-stone-800 bg-stone-100 px-3 py-1.5 rounded-xl cursor-pointer">
        <input type="checkbox" id="adminIsOrderingEnabled" checked class="accent-amber-600 w-4 h-4">
        <span>Permitir pedidos en el menú</span>
      </label>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs items-end">
      <div>
        <label class="block font-bold text-stone-700 mb-1">¿A dónde llegan los pedidos del cliente?</label>
        <select id="adminOrderDeliveryMode" onchange="window.toggleWhatsappInputVisibility()" class="w-full border rounded-xl p-2.5 bg-stone-50 font-semibold text-stone-800 outline-none focus:border-amber-600">
          <option value="KDS">📋 Directo a Comandas (Admin)</option>
          <option value="WHATSAPP">💬 Solo por WhatsApp</option>
          <option value="BOTH">📋 + 💬 Comandas en Admin y WhatsApp</option>
        </select>
      </div>

      <div id="adminWhatsappNumberBox" class="hidden">
        <label class="block font-bold text-stone-700 mb-1">Número de WhatsApp destino (con código de país):</label>
        <input type="tel" id="adminWhatsappNumber" placeholder="Ej: 523312345678" class="w-full border rounded-xl p-2.5 bg-stone-50 font-mono outline-none focus:border-amber-600">
      </div>
    </div>

    <div class="flex justify-end pt-2 border-t border-stone-100">
      <button onclick="window.saveOrderChannelSettings()" class="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-sm">
        Guardar Configuración de Pedidos ✓
      </button>
    </div>
  `;

  tabMarketing.prepend(card);
  loadOrderChannelSettings();
}

// Exponer funciones en window sin necesidad de editar admin-main.js ni admin.html
window.saveOrderChannelSettings = saveOrderChannelSettings;
window.toggleWhatsappInputVisibility = toggleWhatsappInputVisibility;
window.loadOrderChannelSettings = loadOrderChannelSettings;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(injectOrderSettingsCard, 350));
} else {
  setTimeout(injectOrderSettingsCard, 350);
}
