import { REST_ID, STATIONS, generateUUID, escapeHtml, showToast } from '../config.js';
import { state, client, dbWrite } from '../state.js';

let editingProductId = null;

// TAXONOMÍAS
export function renderTaxonomies() {
  const catCont = document.getElementById('categoriesListAdmin');
  if (catCont) {
    catCont.innerHTML = state.categories.map(c => `
      <div class="border rounded-xl p-2.5 bg-stone-50 flex items-center justify-between text-xs">
        <span class="font-bold text-stone-900">${escapeHtml(c.icon || '🍽️')} ${escapeHtml(c.name)}</span>
        <button onclick="window.deleteCategory('${c.id}')" class="text-rose-600 hover:bg-rose-50 px-2 py-0.5 rounded font-bold text-[10px]">Eliminar</button>
      </div>
    `).join('');
  }
  const typCont = document.getElementById('typesListAdmin');
  if (typCont) {
    typCont.innerHTML = state.types.map(t => `
      <div class="border rounded-xl p-2.5 bg-amber-50/50 flex items-center justify-between text-xs">
        <span class="font-bold text-amber-950">${escapeHtml(t.icon || '🏷️')} ${escapeHtml(t.name)}</span>
        <button onclick="window.deleteType('${t.id}')" class="text-rose-600 hover:bg-rose-50 px-2 py-0.5 rounded font-bold text-[10px]">Eliminar</button>
      </div>
    `).join('');
  }
}

export async function createCategory() {
  const name = document.getElementById('newCategoryInput')?.value?.trim();
  const icon = document.getElementById('newCatIcon')?.value?.trim() || '🍽️';
  if (!name) return;

  const newCat = { id: generateUUID(), restaurant_id: REST_ID, name, icon, order_index: state.categories.length + 1 };
  const { error } = await dbWrite(client.from('categories').insert([newCat]), 'crear categoría');
  if (error) return;

  state.categories.push(newCat);
  document.getElementById('newCategoryInput').value = '';
  renderTaxonomies();
  renderProducts();
  showToast(`Categoría "${name}" creada ✓`, 'success');
}

export async function deleteCategory(id) {
  if (!confirm('¿Eliminar esta categoría?')) return;
  const { error } = await dbWrite(client.from('categories').delete().eq('id', id), 'eliminar categoría');
  if (error) return;
  state.categories = state.categories.filter(c => c.id !== id);
  renderTaxonomies();
  renderProducts();
}

export async function createType() {
  const name = document.getElementById('newTypeInput')?.value?.trim();
  const icon = document.getElementById('newTypeIcon')?.value?.trim() || '☕';
  if (!name) return;

  const newTyp = { id: generateUUID(), restaurant_id: REST_ID, name, icon, order_index: state.types.length + 1 };
  const { error } = await dbWrite(client.from('product_types').insert([newTyp]), 'crear tipo');
  if (error) return;

  state.types.push(newTyp);
  document.getElementById('newTypeInput').value = '';
  renderTaxonomies();
  renderProducts();
  showToast(`Tipo "${name}" creado ✓`, 'success');
}

export async function deleteType(id) {
  if (!confirm('¿Eliminar este tipo de platillo?')) return;
  const { error } = await dbWrite(client.from('product_types').delete().eq('id', id), 'eliminar tipo');
  if (error) return;
  state.types = state.types.filter(t => t.id !== id);
  renderTaxonomies();
  renderProducts();
}

// PLATILLOS + BOTÓN 86 (AGOTADO EN 1 CLIC) + EDICIÓN + MODIFICADORES
export function renderProducts() {
  const cont = document.getElementById('adminProductsList');
  const countEl = document.getElementById('prodCount');
  if (countEl) countEl.innerText = `${state.products.length} platillos`;

  const selectCat = document.getElementById('newProdCategory');
  const selectType = document.getElementById('newProdType');
  if (selectCat) selectCat.innerHTML = state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
  if (selectType) selectType.innerHTML = `<option value="">-- Sin tipo --</option>` + state.types.map(t => `<option value="${t.id}">${escapeHtml(t.icon || '')} ${escapeHtml(t.name)}</option>`).join('');

  if (cont) {
    cont.innerHTML = state.products.map(p => {
      const avail = p.is_available !== false;
      const stObj = STATIONS.find(s => s.id === (p.station || 'cocina')) || STATIONS[0];
      return `
        <div class="p-3 border rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs transition ${avail ? 'bg-stone-50 border-stone-200' : 'bg-rose-50/70 border-rose-300'}">
          <div class="flex items-center gap-3 min-w-0">
            <img src="${(p.media && p.media[0]?.url) || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80'}" class="w-11 h-11 rounded-xl object-cover bg-stone-200 ${avail ? '' : 'grayscale opacity-60'}">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="font-bold text-sm text-stone-900 ${avail ? '' : 'line-through text-stone-500'}">${escapeHtml(p.title)}</h4>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${stObj.badgeClass}">${stObj.icon} ${stObj.name.split(' ')[0]}</span>
              </div>
              <span class="font-mono font-black text-amber-800">$${Number(p.price).toFixed(2)}</span>
              ${p.description ? `<span class="text-[11px] text-stone-500 ml-2">${escapeHtml(p.description).substring(0, 60)}</span>` : ''}
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <button onclick="window.toggleProductAvailability('${p.id}')" class="px-3 py-1.5 rounded-xl font-extrabold transition shadow-xs ${avail ? 'bg-emerald-100 hover:bg-rose-100 text-emerald-800 hover:text-rose-800' : 'bg-rose-600 hover:bg-emerald-600 text-white'}">
              ${avail ? '✓ Disponible (Marcar 86)' : '🚫 AGOTADO 86 (Reactivar)'}
            </button>
            <button onclick="window.startEditProduct('${p.id}')" class="px-2.5 py-1.5 rounded-xl bg-white border border-stone-300 hover:bg-stone-100 font-bold text-stone-700">✏️</button>
            <button onclick="window.deleteProduct('${p.id}')" class="px-2.5 py-1.5 rounded-xl bg-white border border-rose-200 hover:bg-rose-50 font-bold text-rose-700">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderModifiersAdmin();
}

export async function toggleProductAvailability(prodId) {
  const p = state.products.find(x => x.id === prodId);
  if (!p) return;
  const nextVal = p.is_available === false;
  const { error } = await dbWrite(client.from('products').update({ is_available: nextVal }).eq('id', p.id), 'cambiar disponibilidad 86');
  if (error) return;
  p.is_available = nextVal;
  renderProducts();
  showToast(nextVal ? `"${p.title}" reactivado en carta ✓` : `🚫 "${p.title}" marcado AGOTADO (86) en menú y POS`, nextVal ? 'success' : 'warning');
}

export function startEditProduct(prodId) {
  const p = state.products.find(x => x.id === prodId);
  if (!p) return;
  editingProductId = p.id;
  document.getElementById('newProdTitle').value = p.title || '';
  document.getElementById('newProdPrice').value = p.price || 0;
  document.getElementById('newProdCategory').value = p.category_id || '';
  document.getElementById('newProdType').value = p.type_id || '';
  const stSel = document.getElementById('newProdStation');
  if (stSel) stSel.value = p.station || 'cocina';
  const imgInp = document.getElementById('newProdImgUrl');
  if (imgInp) imgInp.value = (p.media && p.media[0]?.url) || '';
  document.getElementById('newProdDesc').value = p.description || '';

  const formTitle = document.getElementById('prodFormTitle');
  const saveBtn = document.getElementById('btnSaveProduct');
  const cancelBtn = document.getElementById('btnCancelEditProduct');
  if (formTitle) formTitle.innerText = `✏️ Editando: ${p.title}`;
  if (saveBtn) saveBtn.innerText = 'Actualizar Platillo ✓';
  if (cancelBtn) cancelBtn.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function cancelEditProduct() {
  editingProductId = null;
  ['newProdTitle', 'newProdPrice', 'newProdDesc', 'newProdImgUrl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const formTitle = document.getElementById('prodFormTitle');
  const saveBtn = document.getElementById('btnSaveProduct');
  const cancelBtn = document.getElementById('btnCancelEditProduct');
  if (formTitle) formTitle.innerText = 'Crear Nuevo Producto';
  if (saveBtn) saveBtn.innerText = 'Guardar Platillo';
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

export async function createProduct() {
  const title = document.getElementById('newProdTitle')?.value?.trim();
  const price = parseFloat(document.getElementById('newProdPrice')?.value) || 0;
  const catId = document.getElementById('newProdCategory')?.value || null;
  const typeId = document.getElementById('newProdType')?.value || null;
  const station = document.getElementById('newProdStation')?.value || 'cocina';
  const imgUrl = document.getElementById('newProdImgUrl')?.value?.trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
  const desc = document.getElementById('newProdDesc')?.value?.trim() || '';

  if (!title || price <= 0) {
    showToast('Ingresa título y precio válido.', 'warning');
    return;
  }

  if (editingProductId) {
    const updatePayload = {
      category_id: catId,
      type_id: typeId,
      title,
      description: desc,
      price,
      station,
      media: [{ type: 'image', url: imgUrl }]
    };
    const { error } = await dbWrite(client.from('products').update(updatePayload).eq('id', editingProductId), 'actualizar platillo');
    if (error) return;
    const p = state.products.find(x => x.id === editingProductId);
    if (p) Object.assign(p, updatePayload);
    cancelEditProduct();
    renderProducts();
    showToast(`Platillo "${title}" actualizado ✓`, 'success');
    return;
  }

  const newProd = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    category_id: catId,
    type_id: typeId,
    title,
    description: desc,
    price,
    station,
    media: [{ type: 'image', url: imgUrl }],
    is_available: true
  };

  const { error } = await dbWrite(client.from('products').insert([newProd]), 'crear platillo');
  if (error) return;

  state.products.unshift(newProd);
  cancelEditProduct();
  renderProducts();
  showToast(`Platillo "${title}" agregado a la carta ✓`, 'success');
}

export async function deleteProduct(prodId) {
  if (!confirm('¿Eliminar permanentemente este platillo de la carta?')) return;
  const { error } = await dbWrite(client.from('products').delete().eq('id', prodId), 'eliminar platillo');
  if (error) return;
  state.products = state.products.filter(p => p.id !== prodId);
  renderProducts();
  showToast('Platillo eliminado ✓', 'info');
}

// MODIFICADORES (EXTRAS / PERSONALIZACIONES)
export function renderModifiersAdmin() {
  const cont = document.getElementById('adminModifiersList');
  if (!cont) return;
  if (state.modifiers.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-3 text-center">Sin modificadores creados.</p>';
    return;
  }
  cont.innerHTML = state.modifiers.map(m => `
    <div class="flex justify-between items-center p-2.5 rounded-xl bg-stone-50 border text-xs">
      <div>
        <span class="font-bold text-stone-900">${escapeHtml(m.name)}</span>
        <span class="ml-2 font-mono font-bold text-amber-800">${Number(m.price) > 0 ? `+$${Number(m.price).toFixed(2)}` : 'Gratis'}</span>
      </div>
      <button onclick="window.deleteModifier('${m.id}')" class="text-rose-600 font-bold text-[10px] hover:bg-rose-50 px-2 py-0.5 rounded">Eliminar</button>
    </div>
  `).join('');
}

export async function createModifier() {
  const name = document.getElementById('newModName')?.value?.trim();
  const price = Math.max(0, parseFloat(document.getElementById('newModPrice')?.value) || 0);
  if (!name) {
    showToast('Escribe el nombre del modificador (ej: Leche de Avena).', 'warning');
    return;
  }
  const newMod = { id: generateUUID(), restaurant_id: REST_ID, name, price, applies_to_products: [] };
  const { error } = await dbWrite(client.from('product_modifiers').insert([newMod]), 'crear modificador');
  if (error) return;
  state.modifiers.push(newMod);
  document.getElementById('newModName').value = '';
  document.getElementById('newModPrice').value = '0';
  renderModifiersAdmin();
  showToast(`Modificador "${name}" creado ✓`, 'success');
}

export async function deleteModifier(modId) {
  const { error } = await dbWrite(client.from('product_modifiers').delete().eq('id', modId), 'eliminar modificador');
  if (error) return;
  state.modifiers = state.modifiers.filter(m => m.id !== modId);
  renderModifiersAdmin();
}

// PROMOCIONES (PANEL COMPLETO)
export function renderPromotionsTab() {
  const list = document.getElementById('adminPromosList');
  if (!list) return;
  if (state.promotions.length === 0) {
    list.innerHTML = '<p class="text-xs text-stone-400 text-center py-6">No hay promociones configuradas todavía.</p>';
    return;
  }
  list.innerHTML = state.promotions.map(pr => `
    <div class="p-4 rounded-2xl border flex flex-wrap justify-between items-center gap-3 text-xs ${pr.is_active ? 'bg-amber-50/60 border-amber-300' : 'bg-stone-50 border-stone-200 opacity-70'}">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" style="background:${pr.bg_color || '#b45309'}"></span>
          <h4 class="font-extrabold text-sm text-stone-900">${escapeHtml(pr.title)}</h4>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-900 text-white">
            ${pr.promo_type === '2x1' ? '2x1' : `${pr.discount_percentage}% OFF`}
          </span>
        </div>
        <p class="text-stone-500">${escapeHtml(pr.description || '')}</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window.togglePromotionActive('${pr.id}')" class="px-3 py-1.5 rounded-xl font-bold ${pr.is_active ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-700'}">
          ${pr.is_active ? 'Activa ✓' : 'Pausada'}
        </button>
        <button onclick="window.deletePromotion('${pr.id}')" class="px-2.5 py-1.5 rounded-xl border border-rose-200 text-rose-700 font-bold hover:bg-rose-50">🗑️</button>
      </div>
    </div>
  `).join('');
}

export async function createPromotion() {
  const title = document.getElementById('newPromoTitle')?.value?.trim();
  const desc = document.getElementById('newPromoDesc')?.value?.trim() || '';
  const type = document.getElementById('newPromoType')?.value || 'percentage';
  const pct = parseInt(document.getElementById('newPromoPct')?.value) || 0;
  const color = document.getElementById('newPromoColor')?.value || '#b45309';

  if (!title) {
    showToast('Escribe el título de la promoción.', 'warning');
    return;
  }

  const promo = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    title,
    description: desc,
    promo_type: type,
    discount_percentage: type === 'percentage' ? pct : 0,
    bg_color: color,
    text_color: '#ffffff',
    is_active: true,
    created_at: new Date().toISOString()
  };
  const { error } = await dbWrite(client.from('promotions').insert([promo]), 'crear promoción');
  if (error) return;

  state.promotions.unshift(promo);
  document.getElementById('newPromoTitle').value = '';
  document.getElementById('newPromoDesc').value = '';
  renderPromotionsTab();
  showToast(`Promoción "${title}" activada ✓`, 'success');
}

export async function togglePromotionActive(id) {
  const pr = state.promotions.find(x => x.id === id);
  if (!pr) return;
  const nextVal = !pr.is_active;
  const { error } = await dbWrite(client.from('promotions').update({ is_active: nextVal }).eq('id', id), 'actualizar promoción');
  if (error) return;
  pr.is_active = nextVal;
  renderPromotionsTab();
}

export async function deletePromotion(id) {
  if (!confirm('¿Eliminar esta promoción?')) return;
  const { error } = await dbWrite(client.from('promotions').delete().eq('id', id), 'eliminar promoción');
  if (error) return;
  state.promotions = state.promotions.filter(x => x.id !== id);
  renderPromotionsTab();
}
