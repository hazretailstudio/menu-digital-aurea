import { client, REST_ID } from '../config.js';

let adminPromos = [];

export function setPromotions(promos) {
  adminPromos = promos;
  renderPromotionsHistory();
  renderPromoDynamicFields();
  updatePromoLivePreview();
}

export function renderPromoDynamicFields() {
  const type = document.getElementById('promoType')?.value;
  const box = document.getElementById('dynamicRuleBox');
  if (!box) return;

  if (type === '2x1') {
    box.innerHTML = `
      <div class="flex gap-3 text-xs">
        <div><label class="block font-bold mb-1">Compro (X):</label><input type="number" id="promoBuyQty" value="1" class="border rounded-xl p-2 w-20 text-center font-bold"></div>
        <div><label class="block font-bold mb-1">Me llevo (Y):</label><input type="number" id="promoGetQty" value="2" class="border rounded-xl p-2 w-20 text-center font-bold text-emerald-700"></div>
      </div>
    `;
  } else {
    box.innerHTML = `<p class="text-xs text-stone-500">Configuración estándar de promoción.</p>`;
  }
}

export function updatePromoLivePreview() {
  const title = document.getElementById('promoTitle')?.value?.trim() || 'Título de la Promoción';
  const desc = document.getElementById('promoDesc')?.value?.trim() || 'Detalles de la promoción...';
  const bgColor = document.getElementById('promoBgColor')?.value || '#b45309';
  const textColor = document.getElementById('promoTextColor')?.value || '#ffffff';

  const codeBg = document.getElementById('promoBgColorCode');
  if (codeBg) codeBg.innerText = bgColor;

  const codeTxt = document.getElementById('promoTextColorCode');
  if (codeTxt) codeTxt.innerText = textColor;

  const card = document.getElementById('promoLiveCard');
  if (card) {
    card.style.backgroundColor = bgColor;
    card.style.color = textColor;
  }

  const pTitle = document.getElementById('previewTitle');
  if (pTitle) pTitle.innerText = title;

  const pDesc = document.getElementById('previewDesc');
  if (pDesc) pDesc.innerText = desc;
}

export function renderPromotionsHistory() {
  const cont = document.getElementById('promotionsHistoryList');
  if (!cont) return;

  if (adminPromos.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-4 text-center">No hay promociones registradas.</p>';
    return;
  }
  cont.innerHTML = adminPromos.map(p => `
    <div class="border rounded-2xl p-3 bg-stone-50 flex justify-between items-center text-xs">
      <div>
        <h4 class="font-bold text-stone-900">${p.title}</h4>
        <span class="text-[10px] text-stone-500 font-mono">${p.promo_value || ''}</span>
      </div>
      <span class="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-lg">Activa ✓</span>
    </div>
  `).join('');
}

export async function savePromotion() {
  const title = document.getElementById('promoTitle')?.value?.trim();
  if (!title) { alert("Ingresa un título"); return; }
  const promoType = document.getElementById('promoType')?.value || '2x1';
  const buyQty = parseInt(document.getElementById('promoBuyQty')?.value) || 1;
  const getQty = parseInt(document.getElementById('promoGetQty')?.value) || 2;

  const payload = {
    restaurant_id: REST_ID, title, description: document.getElementById('promoDesc')?.value?.trim() || '',
    promo_type: promoType, promo_value: `${getQty}x${buyQty}`, buy_qty: buyQty, get_qty: getQty,
    bg_color: document.getElementById('promoBgColor')?.value || '#b45309',
    text_color: document.getElementById('promoTextColor')?.value || '#ffffff',
    is_active: true
  };

  adminPromos.unshift(payload);
  renderPromotionsHistory();
  if (client) await client.from('promotions').insert([payload]);
  alert("Promoción publicada.");
}
