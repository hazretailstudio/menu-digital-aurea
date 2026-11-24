import { state, client } from '../state.js';
import { REST_ID, generateUUID, escapeHtml, showToast } from '../config.js';

const STORAGE_BUCKET = 'menu-media';

let draftMedia = [];           // [{ type: 'image'|'video', url: '...' }]
let draftModifierIds = new Set();
let currentEditingProductId = null;
let editingModifierId = null;

function cleanCartaTitles() {
  const replacements = [
    ['Carta, Control 86 & Modificadores', 'Carta'],
    ['Carta y 86', 'Carta'],
    ['Carta & 86', 'Carta']
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue) continue;
    let val = node.nodeValue;
    let changed = false;
    for (const [from, to] of replacements) {
      if (val.includes(from)) {
        val = val.split(from).join(to);
        changed = true;
      }
    }
    if (changed) node.nodeValue = val;
  }
}

function compressImageToDataUrl(file, maxWidth = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadFileToStorage(file, folder = 'images') {
  if (!client) throw new Error('Sin conexión a Supabase');

  const ext = (file.name.split('.').pop() || (folder === 'videos' ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${REST_ID}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) {
    if (folder === 'images') {
      console.warn('Storage fallback a DataURL:', error.message);
      return await compressImageToDataUrl(file);
    }
    throw new Error(`No se pudo subir el video (${error.message}). Ejecuta primero v5_carta_media_y_extras.sql.`);
  }

  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function renderMediaGalleryEditor() {
  const grid = document.getElementById('cartaMediaPreviewGrid');
  if (!grid) return;

  if (draftMedia.length === 0) {
    grid.innerHTML = '<p class="text-[11px] text-stone-400 col-span-full text-center py-3">Aún no has agregado fotos ni videos para este platillo.</p>';
    return;
  }

  grid.innerHTML = draftMedia.map((m, idx) => {
    const isCover = idx === 0 && m.type === 'image';
    if (m.type === 'video') {
      return `
        <div class="relative rounded-xl border border-stone-200 bg-stone-900 overflow-hidden aspect-square flex flex-col items-center justify-center p-2 text-center">
          <span class="text-2xl">🎬</span>
          <span class="text-[10px] font-bold text-amber-300 mt-1">Video adjunto</span>
          <span class="text-[9px] text-stone-400 truncate w-full px-1">${escapeHtml(m.url)}</span>
          <button type="button" onclick="window.removeCartaMediaItem(${idx})"
            class="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white text-xs font-black shadow">✕</button>
        </div>
      `;
    }
    return `
      <div class="relative rounded-xl border-2 ${isCover ? 'border-amber-500' : 'border-stone-200'} bg-stone-100 overflow-hidden aspect-square">
        <img src="${m.url}" class="w-full h-full object-cover" alt="Imagen ${idx + 1}">
        ${isCover
          ? '<span class="absolute bottom-1 left-1 bg-amber-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Portada</span>'
          : `<button type="button" onclick="window.setCartaMediaCover(${idx})" class="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md hover:bg-amber-600">Hacer portada</button>`
        }
        <button type="button" onclick="window.removeCartaMediaItem(${idx})"
          class="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white text-xs font-black shadow">✕</button>
      </div>
    `;
  }).join('');
}

export async function handleCartaImageFilesSelected(inputEl) {
  const files = Array.from(inputEl?.files || []);
  if (files.length === 0) return;

  const statusEl = document.getElementById('cartaMediaUploadStatus');
  if (statusEl) statusEl.innerText = `Subiendo ${files.length} imagen(es)...`;

  try {
    for (const file of files) {
      const url = await uploadFileToStorage(file, 'images');
      draftMedia.push({ type: 'image', url });
    }
    renderMediaGalleryEditor();
    showToast(`${files.length} imagen(es) cargada(s) ✓`, 'success');
  } catch (err) {
    showToast(err.message || 'Error al subir imagen', 'error');
  } finally {
    if (statusEl) statusEl.innerText = '';
    if (inputEl) inputEl.value = '';
  }
}

export async function handleCartaVideoFileSelected(inputEl) {
  const file = inputEl?.files?.[0];
  if (!file) return;

  if (file.size > 50 * 1024 * 1024) {
    showToast('El video supera el límite de 50 MB.', 'warning');
    inputEl.value = '';
    return;
  }

  const statusEl = document.getElementById('cartaMediaUploadStatus');
  if (statusEl) statusEl.innerText = 'Subiendo video... espera un momento.';

  try {
    const url = await uploadFileToStorage(file, 'videos');
    draftMedia.push({ type: 'video', url });
    renderMediaGalleryEditor();
    showToast('Video subido correctamente ✓', 'success');
  } catch (err) {
    showToast(err.message || 'Error al subir video', 'error');
  } finally {
    if (statusEl) statusEl.innerText = '';
    if (inputEl) inputEl.value = '';
  }
}

export function addCartaVideoUrl() {
  const input = document.getElementById('cartaVideoUrlInput');
  const url = (input?.value || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    showToast('Pega una URL válida que empiece con https://', 'warning');
    return;
  }
  draftMedia.push({ type: 'video', url });
  input.value = '';
  renderMediaGalleryEditor();
  showToast('URL de video agregada ✓', 'success');
}

export function removeCartaMediaItem(idx) {
  draftMedia.splice(idx, 1);
  renderMediaGalleryEditor();
}

export function setCartaMediaCover(idx) {
  if (!draftMedia[idx]) return;
  const [item] = draftMedia.splice(idx, 1);
  draftMedia.unshift(item);
  renderMediaGalleryEditor();
}

async function fetchModifiersIntoState() {
  if (!client) return;
  const { data } = await client
    .from('product_modifiers')
    .select('*')
    .eq('restaurant_id', REST_ID)
    .order('name', { ascending: true });
  if (data) state.modifiers = data;
}

function getSuppliesOptionsHtml(selectedId = '') {
  const supplies = Array.isArray(state.supplies) ? state.supplies : [];
  return `<option value="">-- Sin vincular a inventario --</option>` + supplies.map(s =>
    `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(s.name)} (Stock: ${s.current_stock} ${escapeHtml(s.unit)})</option>`
  ).join('');
}

export function renderInlineModifiersManager() {
  const list = document.getElementById('cartaInlineModifiersList');
  const supSel = document.getElementById('inlineModSupplySelect');
  if (supSel) {
    const prevVal = supSel.value;
    supSel.innerHTML = getSuppliesOptionsHtml(prevVal);
  }
  if (!list) return;

  const mods = Array.isArray(state.modifiers) ? state.modifiers : [];
  if (mods.length === 0) {
    list.innerHTML = '<p class="text-[11px] text-stone-400 text-center py-3">No hay extras creados aún. Crea uno arriba.</p>';
    return;
  }

  list.innerHTML = mods.map(m => {
    const isChecked = draftModifierIds.has(m.id);
    const isAvail = m.is_available !== false;
    const linkedSup = m.supply_id ? (state.supplies || []).find(s => s.id === m.supply_id) : null;

    if (editingModifierId === m.id) {
      return `
        <div class="p-2.5 rounded-xl border-2 border-amber-400 bg-amber-50/70 space-y-2 text-xs">
          <div class="grid grid-cols-2 gap-1.5">
            <input type="text" id="editModName_${m.id}" value="${escapeHtml(m.name)}" class="border rounded-lg px-2 py-1.5 bg-white font-bold">
            <input type="number" step="0.5" min="0" id="editModPrice_${m.id}" value="${Number(m.price || 0)}" class="border rounded-lg px-2 py-1.5 bg-white font-mono">
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <select id="editModSupply_${m.id}" class="col-span-2 border rounded-lg px-2 py-1.5 bg-white text-[11px]">
              ${getSuppliesOptionsHtml(m.supply_id || '')}
            </select>
            <input type="number" step="0.01" min="0" id="editModQty_${m.id}" value="${Number(m.quantity_per_portion || 0)}" placeholder="Cant." class="border rounded-lg px-2 py-1.5 bg-white font-mono text-[11px]">
          </div>
          <div class="flex justify-end gap-1.5">
            <button type="button" onclick="window.cancelEditInlineModifier()" class="px-2.5 py-1 rounded-lg border bg-white text-stone-600 font-bold text-[11px]">Cancelar</button>
            <button type="button" onclick="window.saveEditInlineModifier('${m.id}')" class="px-3 py-1 rounded-lg bg-amber-600 text-white font-bold text-[11px]">Guardar ✓</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="flex items-center justify-between gap-2 p-2 rounded-xl border ${isChecked ? 'border-amber-400 bg-amber-50/60' : 'border-stone-200 bg-white'} text-xs">
        <label class="flex items-start gap-2 cursor-pointer flex-grow min-w-0">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="window.toggleDraftProductModifier('${m.id}', this.checked)"
            class="accent-amber-600 w-4 h-4 mt-0.5 flex-shrink-0">
          <div class="min-w-0">
            <div class="font-bold text-stone-900 flex items-center gap-1.5 flex-wrap">
              <span class="${!isAvail ? 'line-through text-stone-400' : ''}">${escapeHtml(m.name)}</span>
              <span class="font-mono text-amber-800">+$${Number(m.price || 0).toFixed(2)}</span>
            </div>
            ${linkedSup ? `<span class="text-[10px] text-stone-500 block">📦 ${escapeHtml(linkedSup.name)} (-${m.quantity_per_portion || 0} ${escapeHtml(linkedSup.unit)} · Stock: ${linkedSup.current_stock})</span>` : ''}
          </div>
        </label>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button type="button" onclick="window.toggleInlineModifierAvailability('${m.id}')"
            class="px-2 py-1 rounded-lg text-[10px] font-bold transition ${isAvail ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-rose-100 text-rose-800 hover:bg-rose-200'}"
            title="Activar / Desactivar extra">
            ${isAvail ? 'Activo' : 'Agotado'}
          </button>
          <button type="button" onclick="window.startEditInlineModifier('${m.id}')" class="p-1 rounded-lg hover:bg-stone-100 text-stone-600" title="Editar extra">✏️</button>
          <button type="button" onclick="window.deleteInlineModifier('${m.id}')" class="p-1 rounded-lg hover:bg-rose-50 text-rose-600" title="Eliminar extra">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

export function toggleDraftProductModifier(modId, checked) {
  if (checked) draftModifierIds.add(modId);
  else draftModifierIds.delete(modId);
  renderInlineModifiersManager();
}

export async function createInlineModifier() {
  const nameEl = document.getElementById('inlineModName');
  const priceEl = document.getElementById('inlineModPrice');
  const supEl = document.getElementById('inlineModSupplySelect');
  const qtyEl = document.getElementById('inlineModQty');

  const name = (nameEl?.value || '').trim();
  const price = Math.max(0, parseFloat(priceEl?.value) || 0);
  const supplyId = supEl?.value || null;
  const qtyPerPortion = supplyId ? Math.max(0, parseFloat(qtyEl?.value) || 0) : 0;

  if (!name) {
    showToast('Escribe el nombre del extra (ej. Leche de Avena).', 'warning');
    return;
  }

  const newMod = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    name,
    price,
    is_available: true,
    supply_id: supplyId,
    quantity_per_portion: qtyPerPortion,
    applies_to_products: currentEditingProductId ? [currentEditingProductId] : []
  };

  if (client) {
    const { error } = await client.from('product_modifiers').insert([newMod]);
    if (error) {
      showToast(`No se pudo crear el extra: ${error.message}`, 'error');
      return;
    }
  }

  state.modifiers = state.modifiers || [];
  state.modifiers.push(newMod);
  draftModifierIds.add(newMod.id);

  if (nameEl) nameEl.value = '';
  if (priceEl) priceEl.value = '';
  if (qtyEl) qtyEl.value = '';

  renderInlineModifiersManager();
  showToast(`Extra "${name}" creado y seleccionado ✓`, 'success');
}

export function startEditInlineModifier(modId) {
  editingModifierId = modId;
  renderInlineModifiersManager();
}

export function cancelEditInlineModifier() {
  editingModifierId = null;
  renderInlineModifiersManager();
}

export async function saveEditInlineModifier(modId) {
  const mod = (state.modifiers || []).find(m => m.id === modId);
  if (!mod) return;

  const name = (document.getElementById(`editModName_${modId}`)?.value || '').trim();
  const price = Math.max(0, parseFloat(document.getElementById(`editModPrice_${modId}`)?.value) || 0);
  const supplyId = document.getElementById(`editModSupply_${modId}`)?.value || null;
  const qty = supplyId ? Math.max(0, parseFloat(document.getElementById(`editModQty_${modId}`)?.value) || 0) : 0;

  if (!name) return showToast('El nombre no puede estar vacío.', 'warning');

  const updates = { name, price, supply_id: supplyId, quantity_per_portion: qty };
  Object.assign(mod, updates);
  editingModifierId = null;
  renderInlineModifiersManager();

  if (client) {
    const { error } = await client.from('product_modifiers').update(updates).eq('id', modId);
    if (error) showToast(`Error al actualizar extra: ${error.message}`, 'error');
    else showToast('Extra actualizado ✓', 'success');
  }
}

export async function toggleInlineModifierAvailability(modId) {
  const mod = (state.modifiers || []).find(m => m.id === modId);
  if (!mod) return;

  const nextState = mod.is_available === false ? true : false;
  mod.is_available = nextState;
  renderInlineModifiersManager();

  if (client) {
    const { error } = await client.from('product_modifiers').update({ is_available: nextState }).eq('id', modId);
    if (error) showToast(`Error: ${error.message}`, 'error');
    else showToast(`"${mod.name}" marcado como ${nextState ? 'Activo ✓' : 'Agotado'}`, 'info');
  }
}

export async function deleteInlineModifier(modId) {
  const mod = (state.modifiers || []).find(m => m.id === modId);
  if (!mod || !confirm(`¿Eliminar el extra "${mod.name}"?`)) return;

  state.modifiers = (state.modifiers || []).filter(m => m.id !== modId);
  draftModifierIds.delete(modId);
  renderInlineModifiersManager();

  if (client) {
    await client.from('product_modifiers').delete().eq('id', modId);
    showToast('Extra eliminado ✓', 'info');
  }
}

function findProductFormContainer() {
  const titleInput = document.getElementById('newProdTitle');
  if (!titleInput) return null;
  return titleInput.closest('form') || titleInput.closest('.bg-white') || document.getElementById('tab-products');
}

function injectCartaProductEnhancements() {
  const formBox = findProductFormContainer();
  if (!formBox || document.getElementById('cartaMultimediaSection')) return;

  const oldImgInput =
    document.getElementById('newProdImage') ||
    document.getElementById('newProdImg') ||
    document.getElementById('newProdImageUrl') ||
    formBox.querySelector('input[placeholder*="http"], input[placeholder*="URL"], input[placeholder*="imagen" i]');
  if (oldImgInput) {
    const wrapper = oldImgInput.closest('div');
    if (wrapper && wrapper !== formBox) wrapper.classList.add('hidden');
    else oldImgInput.classList.add('hidden');
  }

  const mediaSection = document.createElement('div');
  mediaSection.id = 'cartaMultimediaSection';
  mediaSection.className = 'border border-stone-200 bg-stone-50/70 rounded-2xl p-3.5 space-y-3 text-xs';
  mediaSection.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="font-bold text-stone-800">📸 Imágenes y Video del Platillo</span>
      <span id="cartaMediaUploadStatus" class="text-[11px] font-bold text-amber-700"></span>
    </div>

    <div id="cartaMediaPreviewGrid" class="grid grid-cols-3 sm:grid-cols-4 gap-2"></div>

    <div class="flex flex-wrap gap-2">
      <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-[11px] transition shadow-xs">
        <span>📷 + Agregar nueva imagen</span>
        <input type="file" accept="image/*" multiple class="hidden" onchange="window.handleCartaImageFilesSelected(this)">
      </label>

      <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition shadow-xs">
        <span>🎬 Subir video</span>
        <input type="file" accept="video/mp4,video/webm,video/quicktime" class="hidden" onchange="window.handleCartaVideoFileSelected(this)">
      </label>
    </div>

    <div class="flex gap-1.5 pt-1 border-t border-stone-200">
      <input type="url" id="cartaVideoUrlInput" placeholder="O pega aquí una URL de video (MP4, YouTube, Vimeo)..."
        class="flex-grow border rounded-xl px-2.5 py-2 bg-white text-[11px] outline-none focus:border-amber-600">
      <button type="button" onclick="window.addCartaVideoUrl()"
        class="px-3 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold text-[11px] whitespace-nowrap">
        + URL Video
      </button>
    </div>
  `;

  const modSection = document.createElement('div');
  modSection.id = 'cartaInlineModifiersSection';
  modSection.className = 'border border-stone-200 bg-stone-50/70 rounded-2xl p-3.5 space-y-3 text-xs';
  modSection.innerHTML = `
    <div>
      <span class="font-bold text-stone-800 block">🧩 Extras / Modificadores aplicables a este platillo</span>
      <span class="text-[10px] text-stone-500">Marca los extras que aplican, edítalos, desactívalos si se agotan o vincúlalos a un insumo para descuento automático.</span>
    </div>

    <div class="bg-white border border-stone-200 rounded-xl p-2.5 space-y-2">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
        <input type="text" id="inlineModName" placeholder="Nuevo extra (Ej. Leche Avena)" class="sm:col-span-2 border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-600">
        <input type="number" step="0.5" min="0" id="inlineModPrice" placeholder="Precio $" class="border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-amber-600">
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5 items-center">
        <select id="inlineModSupplySelect" class="sm:col-span-2 border rounded-lg px-2 py-1.5 text-[11px] bg-stone-50 outline-none"></select>
        <div class="flex gap-1">
          <input type="number" step="0.01" min="0" id="inlineModQty" placeholder="Cant." title="Cantidad que descuenta del insumo por porción"
            class="w-20 border rounded-lg px-2 py-1.5 text-[11px] font-mono outline-none">
          <button type="button" onclick="window.createInlineModifier()"
            class="flex-grow bg-stone-900 hover:bg-stone-800 text-white font-bold px-2.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap">
            + Extra
          </button>
        </div>
      </div>
    </div>

    <div id="cartaInlineModifiersList" class="space-y-1.5 max-h-56 overflow-y-auto pr-0.5"></div>
  `;

  const saveBtn = formBox.querySelector('button[onclick*="createProduct"]');
  if (saveBtn && saveBtn.parentNode) {
    saveBtn.parentNode.insertBefore(mediaSection, saveBtn);
    saveBtn.parentNode.insertBefore(modSection, saveBtn);
  } else {
    formBox.appendChild(mediaSection);
    formBox.appendChild(modSection);
  }

  renderMediaGalleryEditor();
  fetchModifiersIntoState().then(renderInlineModifiersManager);
}

async function syncModifiersForProduct(productId) {
  if (!client || !productId) return;
  const mods = Array.isArray(state.modifiers) ? state.modifiers : [];

  for (const mod of mods) {
    const currentList = Array.isArray(mod.applies_to_products) ? [...mod.applies_to_products] : [];
    const shouldApply = draftModifierIds.has(mod.id);
    const alreadyIn = currentList.includes(productId);

    if (shouldApply && !alreadyIn) {
      const updated = [...currentList, productId];
      mod.applies_to_products = updated;
      await client.from('product_modifiers').update({ applies_to_products: updated }).eq('id', mod.id);
    } else if (!shouldApply && alreadyIn) {
      const updated = currentList.filter(id => id !== productId);
      mod.applies_to_products = updated;
      await client.from('product_modifiers').update({ applies_to_products: updated }).eq('id', mod.id);
    }
  }
}

function resetProductFormAfterSave() {
  currentEditingProductId = null;
  draftMedia = [];
  draftModifierIds = new Set();
  ['newProdTitle', 'newProdPrice', 'newProdDesc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderMediaGalleryEditor();
  renderInlineModifiersManager();
}

function wrapProductCrudFunctions() {
  if (window.__cartaCrudWrapped) return;
  window.__cartaCrudWrapped = true;

  const origStartEdit = window.startEditProduct;
  const origCancelEdit = window.cancelEditProduct;

  window.startEditProduct = function (prodId, ...args) {
    const res = typeof origStartEdit === 'function' ? origStartEdit.call(this, prodId, ...args) : undefined;
    const prod = (state.products || []).find(p => p.id === prodId);
    currentEditingProductId = prod ? prod.id : null;

    draftMedia = Array.isArray(prod?.media) ? prod.media.map(m => ({ type: m.type || 'image', url: m.url })) : [];
    draftModifierIds = new Set();
    (state.modifiers || []).forEach(m => {
      if (Array.isArray(m.applies_to_products) && m.applies_to_products.includes(prodId)) {
        draftModifierIds.add(m.id);
      }
    });

    renderMediaGalleryEditor();
    renderInlineModifiersManager();
    return res;
  };

  window.cancelEditProduct = function (...args) {
    const res = typeof origCancelEdit === 'function' ? origCancelEdit.call(this, ...args) : undefined;
    resetProductFormAfterSave();
    return res;
  };

  window.createProduct = async function () {
    const title = (document.getElementById('newProdTitle')?.value || '').trim();
    const price = parseFloat(document.getElementById('newProdPrice')?.value) || 0;
    const catId = document.getElementById('newProdCategory')?.value || null;
    const typeId = document.getElementById('newProdType')?.value || null;
    const desc = (document.getElementById('newProdDesc')?.value || '').trim();
    const station = document.getElementById('newProdStation')?.value || 'cocina';

    if (!title || price <= 0) {
      showToast('Ingresa el nombre y un precio mayor a $0.', 'warning');
      return;
    }

    const mediaPayload = draftMedia.length > 0
      ? draftMedia
      : [{ type: 'image', url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80' }];

    if (currentEditingProductId) {
      const updates = {
        category_id: catId,
        type_id: typeId,
        title,
        description: desc,
        price,
        station,
        media: mediaPayload
      };
      if (client) {
        const { error } = await client.from('products').update(updates).eq('id', currentEditingProductId);
        if (error) {
          showToast(`Error al actualizar platillo: ${error.message}`, 'error');
          return;
        }
      }
      const idx = (state.products || []).findIndex(p => p.id === currentEditingProductId);
      if (idx >= 0) Object.assign(state.products[idx], updates);
      await syncModifiersForProduct(currentEditingProductId);
      showToast(`Platillo "${title}" actualizado ✓`, 'success');
    } else {
      const newProd = {
        id: generateUUID(),
        restaurant_id: REST_ID,
        category_id: catId,
        type_id: typeId,
        title,
        description: desc,
        price,
        station,
        media: mediaPayload,
        is_available: true
      };
      if (client) {
        const { error } = await client.from('products').insert([newProd]);
        if (error) {
          showToast(`Error al crear platillo: ${error.message}`, 'error');
          return;
        }
      }
      state.products = state.products || [];
      state.products.unshift(newProd);
      await syncModifiersForProduct(newProd.id);
      showToast(`Platillo "${title}" agregado a la Carta ✓`, 'success');
    }

    resetProductFormAfterSave();
    if (typeof origCancelEdit === 'function') origCancelEdit();
    if (typeof window.renderProducts === 'function') window.renderProducts();
  };
}

function subscribeCartaRealtime() {
  if (!client || window.__cartaRealtimeSub) return;
  window.__cartaRealtimeSub = true;

  client.channel(`carta_mods_supplies_${REST_ID}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_modifiers', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
      await fetchModifiersIntoState();
      renderInlineModifiersManager();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'supplies', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
      const { data } = await client.from('supplies').select('*').eq('restaurant_id', REST_ID).order('name', { ascending: true });
      if (data) {
        state.supplies = data;
        renderInlineModifiersManager();
      }
    })
    .subscribe();
}

Object.assign(window, {
  handleCartaImageFilesSelected,
  handleCartaVideoFileSelected,
  addCartaVideoUrl,
  removeCartaMediaItem,
  setCartaMediaCover,
  toggleDraftProductModifier,
  createInlineModifier,
  startEditInlineModifier,
  cancelEditInlineModifier,
  saveEditInlineModifier,
  toggleInlineModifierAvailability,
  deleteInlineModifier
});

export function initCartaEnhancer() {
  cleanCartaTitles();
  injectCartaProductEnhancements();
  wrapProductCrudFunctions();
  subscribeCartaRealtime();

  const topTitle = document.getElementById('topbarTitle');
  if (topTitle) {
    new MutationObserver(cleanCartaTitles).observe(topTitle, { childList: true, characterData: true, subtree: true });
  }
  setTimeout(() => {
    cleanCartaTitles();
    injectCartaProductEnhancements();
    wrapProductCrudFunctions();
    fetchModifiersIntoState().then(renderInlineModifiersManager);
  }, 600);
}
