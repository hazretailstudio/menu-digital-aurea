import { state, client } from '../state.js';
import { REST_ID, STATIONS, generateUUID, escapeHtml, showToast } from '../config.js';

const STORAGE_BUCKET = 'menu-media';

const DEFAULT_MENU_THEME = {
  layout: 'list',           // 'list' | 'grid_cards' | 'large_cards'
  image_size: 'md',         // 'sm' | 'md' | 'lg'
  font_preset: 'editorial', // 'editorial' | 'modern' | 'classic' | 'minimal' | 'rounded'
  accent_color: '#b45309',
  bg_color: '#faf7f2'
};

let draftMedia = [];              // [{ type: 'image'|'video', url: '...' }]
let draftModifierIds = new Set();
let draftRecommendedIds = new Set();
let currentEditingProductId = null;
let editingModifierId = null;
let currentMenuTheme = { ...DEFAULT_MENU_THEME };

const catalogFilters = {
  search: '',
  category_id: 'all',
  type_id: 'all',
  station: 'all'
};

// ============================================================================
// 1. LIMPIEZA DE TÍTULOS ("Carta y 86" -> "Carta")
// ============================================================================
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

// ============================================================================
// 2. SUBIDA DE IMÁGENES Y VIDEOS A SUPABASE STORAGE
// ============================================================================
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
    throw new Error(`No se pudo subir el video (${error.message}). Ejecuta primero v6_carta_diseno_y_relacionados.sql.`);
  }

  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ============================================================================
// 3. GALERÍA MULTIMEDIA (MÚLTIPLES FOTOS + VIDEO POR ARCHIVO O URL)
// ============================================================================
function renderMediaGalleryEditor() {
  const grid = document.getElementById('cartaMediaPreviewGrid');
  if (!grid) return;

  if (draftMedia.length === 0) {
    grid.innerHTML = '<p class="text-[11px] text-stone-400 col-span-full text-center py-3">Sin fotos ni videos todavía. Agrega imágenes o un video abajo.</p>';
    return;
  }

  grid.innerHTML = draftMedia.map((m, idx) => {
    const isCover = idx === 0 && m.type !== 'video';
    if (m.type === 'video') {
      return `
        <div class="relative rounded-xl border border-stone-300 bg-stone-900 overflow-hidden aspect-square flex flex-col items-center justify-center p-2 text-center">
          <span class="text-2xl">🎬</span>
          <span class="text-[10px] font-bold text-amber-300 mt-1">Video</span>
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
          : `<button type="button" onclick="window.setCartaMediaCover(${idx})" class="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md hover:bg-amber-600">Portada</button>`
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

// ============================================================================
// 4. BARRA SUPERIOR DE CARTA: [🧩 Modificadores y Extras] [🎨 Diseño del Menú]
// ============================================================================
function injectCartaTopToolbar() {
  const tabProducts = document.getElementById('tab-products');
  if (!tabProducts || document.getElementById('cartaTopActionsBar')) return;

  // Si existe un recuadro lateral viejo de Modificadores dentro de #tab-products, ocultarlo
  // para que el formulario de producto quede limpio y la gestión sea independiente en el modal
  const legacyModList = document.getElementById('adminModifiersList') || document.getElementById('modifiersAdminList');
  if (legacyModList) {
    const legacyCard = legacyModList.closest('.bg-white') || legacyModList.parentElement;
    if (legacyCard && tabProducts.contains(legacyCard)) {
      legacyCard.classList.add('hidden');
      const gridParent = legacyCard.parentElement;
      if (gridParent) {
        const siblingCard = Array.from(gridParent.children).find(el => el !== legacyCard && !el.classList.contains('hidden'));
        if (siblingCard) {
          siblingCard.classList.remove('lg:col-span-8', 'lg:col-span-7');
          siblingCard.classList.add('lg:col-span-12', 'col-span-full');
        }
      }
    }
  }

  const bar = document.createElement('div');
  bar.id = 'cartaTopActionsBar';
  bar.className = 'bg-white border border-stone-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 mb-4';
  bar.innerHTML = `
    <div>
      <h3 class="font-black text-base text-stone-900">📖 Gestión de Carta</h3>
      <p class="text-xs text-stone-500">Administra platillos, recomendaciones, extras y el diseño visual del menú QR.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" onclick="window.openModifiersManagerModal()"
        class="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition">
        <span>🧩 Modificadores y Extras</span>
      </button>
      <button type="button" onclick="window.openMenuDesignModal()"
        class="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition">
        <span>🎨 Diseño del Menú</span>
      </button>
    </div>
  `;

  tabProducts.prepend(bar);
}

// ============================================================================
// 5. MODAL INDEPENDIENTE DE MODIFICADORES Y EXTRAS (CRUD + INVENTARIO)
// ============================================================================
function ensureModifiersManagerModal() {
  if (document.getElementById('cartaModifiersManagerModal')) return;

  const modal = document.createElement('div');
  modal.id = 'cartaModifiersManagerModal';
  modal.className = 'fixed inset-0 z-[75] bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white w-full max-w-2xl rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
      <div class="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50">
        <div>
          <h3 class="font-black text-base text-stone-900">🧩 Modificadores y Extras</h3>
          <p class="text-xs text-stone-500">Crea, edita, elimina o desactiva extras. Vincúlalos a un insumo para control automático de inventario.</p>
        </div>
        <button type="button" onclick="window.closeModifiersManagerModal()" class="w-8 h-8 rounded-xl bg-white border text-stone-500 hover:text-stone-900 font-bold">✕</button>
      </div>

      <div class="p-5 overflow-y-auto space-y-4">
        <div class="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3 text-xs">
          <span class="font-bold text-stone-800 block">+ Crear nuevo modificador / extra</span>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" id="mgrModName" placeholder="Nombre (Ej. Leche de Avena, Extra Queso)" class="sm:col-span-2 border rounded-xl px-3 py-2 bg-white outline-none focus:border-amber-600">
            <input type="number" step="0.5" min="0" id="mgrModPrice" placeholder="Precio extra $" class="border rounded-xl px-3 py-2 bg-white font-mono outline-none focus:border-amber-600">
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
            <select id="mgrModSupplySelect" class="sm:col-span-2 border rounded-xl px-3 py-2 bg-white text-xs outline-none"></select>
            <input type="number" step="0.01" min="0" id="mgrModQty" placeholder="Cant. a descontar" class="border rounded-xl px-3 py-2 bg-white font-mono outline-none">
          </div>
          <button type="button" onclick="window.createManagedModifier()"
            class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition">
            + Guardar Nuevo Modificador / Extra
          </button>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-stone-700">Todos los modificadores y extras guardados</span>
            <span id="mgrModifiersCount" class="font-mono text-stone-400">0 extras</span>
          </div>
          <div id="mgrModifiersList" class="space-y-2"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
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

export async function openModifiersManagerModal() {
  ensureModifiersManagerModal();
  await fetchModifiersIntoState();
  const supSel = document.getElementById('mgrModSupplySelect');
  if (supSel) supSel.innerHTML = getSuppliesOptionsHtml();
  renderModifiersManagerList();
  document.getElementById('cartaModifiersManagerModal')?.classList.remove('hidden');
}

export function closeModifiersManagerModal() {
  editingModifierId = null;
  document.getElementById('cartaModifiersManagerModal')?.classList.add('hidden');
  renderCompactProductExtrasPicker();
}

function renderModifiersManagerList() {
  const list = document.getElementById('mgrModifiersList');
  const countEl = document.getElementById('mgrModifiersCount');
  const mods = Array.isArray(state.modifiers) ? state.modifiers : [];
  if (countEl) countEl.innerText = `${mods.length} extras`;
  if (!list) return;

  if (mods.length === 0) {
    list.innerHTML = '<p class="text-xs text-stone-400 text-center py-6 border border-dashed rounded-2xl">No tienes modificadores ni extras creados todavía.</p>';
    return;
  }

  list.innerHTML = mods.map(m => {
    const isAvail = m.is_available !== false;
    const linkedSup = m.supply_id ? (state.supplies || []).find(s => s.id === m.supply_id) : null;

    if (editingModifierId === m.id) {
      return `
        <div class="p-3 rounded-2xl border-2 border-amber-400 bg-amber-50/70 space-y-2 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" id="editModName_${m.id}" value="${escapeHtml(m.name)}" class="sm:col-span-2 border rounded-xl px-2.5 py-2 bg-white font-bold">
            <input type="number" step="0.5" min="0" id="editModPrice_${m.id}" value="${Number(m.price || 0)}" class="border rounded-xl px-2.5 py-2 bg-white font-mono">
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select id="editModSupply_${m.id}" class="sm:col-span-2 border rounded-xl px-2.5 py-2 bg-white text-xs">
              ${getSuppliesOptionsHtml(m.supply_id || '')}
            </select>
            <input type="number" step="0.01" min="0" id="editModQty_${m.id}" value="${Number(m.quantity_per_portion || 0)}" placeholder="Cant." class="border rounded-xl px-2.5 py-2 bg-white font-mono">
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" onclick="window.cancelEditInlineModifier()" class="px-3 py-1.5 rounded-xl border bg-white text-stone-600 font-bold">Cancelar</button>
            <button type="button" onclick="window.saveEditInlineModifier('${m.id}')" class="px-4 py-1.5 rounded-xl bg-emerald-600 text-white font-bold">Guardar ✓</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="flex items-center justify-between gap-3 p-3 rounded-2xl border border-stone-200 bg-white text-xs">
        <div class="min-w-0 flex-grow">
          <div class="font-bold text-stone-900 flex items-center gap-2 flex-wrap">
            <span class="${!isAvail ? 'line-through text-stone-400' : ''}">${escapeHtml(m.name)}</span>
            <span class="font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg">+$${Number(m.price || 0).toFixed(2)}</span>
          </div>
          ${linkedSup
            ? `<span class="text-[11px] text-stone-500 block mt-0.5">📦 Insumo: ${escapeHtml(linkedSup.name)} (-${m.quantity_per_portion || 0} ${escapeHtml(linkedSup.unit)} · Stock: ${linkedSup.current_stock})</span>`
            : '<span class="text-[10px] text-stone-400 block mt-0.5">Control manual de disponibilidad</span>'
          }
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" onclick="window.toggleInlineModifierAvailability('${m.id}')"
            class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition ${isAvail ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-rose-100 text-rose-800 hover:bg-rose-200'}">
            ${isAvail ? '✓ Activo' : '✕ Agotado'}
          </button>
          <button type="button" onclick="window.startEditInlineModifier('${m.id}')" class="p-1.5 rounded-xl border hover:bg-stone-100 text-stone-700" title="Editar">✏️</button>
          <button type="button" onclick="window.deleteInlineModifier('${m.id}')" class="p-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600" title="Eliminar">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

export async function createManagedModifier() {
  const nameEl = document.getElementById('mgrModName');
  const priceEl = document.getElementById('mgrModPrice');
  const supEl = document.getElementById('mgrModSupplySelect');
  const qtyEl = document.getElementById('mgrModQty');

  const name = (nameEl?.value || '').trim();
  const price = Math.max(0, parseFloat(priceEl?.value) || 0);
  const supplyId = supEl?.value || null;
  const qty = supplyId ? Math.max(0, parseFloat(qtyEl?.value) || 0) : 0;

  if (!name) return showToast('Escribe el nombre del extra.', 'warning');

  const newMod = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    name,
    price,
    is_available: true,
    supply_id: supplyId,
    quantity_per_portion: qty,
    applies_to_products: []
  };

  if (client) {
    const { error } = await client.from('product_modifiers').insert([newMod]);
    if (error) return showToast(`Error: ${error.message}`, 'error');
  }

  state.modifiers = state.modifiers || [];
  state.modifiers.push(newMod);
  if (nameEl) nameEl.value = '';
  if (priceEl) priceEl.value = '';
  if (qtyEl) qtyEl.value = '';

  renderModifiersManagerList();
  renderCompactProductExtrasPicker();
  showToast(`Extra "${name}" guardado ✓`, 'success');
}

export function startEditInlineModifier(modId) {
  editingModifierId = modId;
  renderModifiersManagerList();
}

export function cancelEditInlineModifier() {
  editingModifierId = null;
  renderModifiersManagerList();
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
  renderModifiersManagerList();
  renderCompactProductExtrasPicker();

  if (client) {
    const { error } = await client.from('product_modifiers').update(updates).eq('id', modId);
    if (error) showToast(`Error: ${error.message}`, 'error');
    else showToast('Modificador actualizado ✓', 'success');
  }
}

export async function toggleInlineModifierAvailability(modId) {
  const mod = (state.modifiers || []).find(m => m.id === modId);
  if (!mod) return;

  const nextState = mod.is_available === false ? true : false;
  mod.is_available = nextState;
  renderModifiersManagerList();
  renderCompactProductExtrasPicker();

  if (client) {
    const { error } = await client.from('product_modifiers').update({ is_available: nextState }).eq('id', modId);
    if (error) showToast(`Error: ${error.message}`, 'error');
    else showToast(`"${mod.name}" ahora está ${nextState ? 'Activo ✓' : 'Agotado'}`, 'info');
  }
}

export async function deleteInlineModifier(modId) {
  const mod = (state.modifiers || []).find(m => m.id === modId);
  if (!mod || !confirm(`¿Eliminar el extra "${mod.name}"?`)) return;

  state.modifiers = (state.modifiers || []).filter(m => m.id !== modId);
  draftModifierIds.delete(modId);
  renderModifiersManagerList();
  renderCompactProductExtrasPicker();

  if (client) {
    await client.from('product_modifiers').delete().eq('id', modId);
    showToast('Extra eliminado ✓', 'info');
  }
}

// ============================================================================
// 6. MODAL DE DISEÑO PERSONALIZABLE DEL MENÚ QR
// ============================================================================
function ensureMenuDesignModal() {
  if (document.getElementById('cartaMenuDesignModal')) return;

  const modal = document.createElement('div');
  modal.id = 'cartaMenuDesignModal';
  modal.className = 'fixed inset-0 z-[75] bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white w-full max-w-lg rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
      <div class="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50">
        <div>
          <h3 class="font-black text-base text-stone-900">🎨 Diseño Visual del Menú QR</h3>
          <p class="text-xs text-stone-500">Elige presentación, tamaño de fotos, tipografía y colores de tu menú.</p>
        </div>
        <button type="button" onclick="window.closeMenuDesignModal()" class="w-8 h-8 rounded-xl bg-white border text-stone-500 hover:text-stone-900 font-bold">✕</button>
      </div>

      <div class="p-5 overflow-y-auto space-y-4 text-xs">
        <div>
          <label class="block font-bold text-stone-800 mb-1.5">1. Presentación de los platillos</label>
          <div class="grid grid-cols-3 gap-2">
            <label class="cursor-pointer">
              <input type="radio" name="menuThemeLayout" value="list" class="peer hidden">
              <div class="p-3 rounded-2xl border-2 border-stone-200 peer-checked:border-amber-600 peer-checked:bg-amber-50 text-center space-y-1 transition">
                <div class="text-lg">☰</div>
                <div class="font-bold text-stone-900">Lista</div>
                <div class="text-[10px] text-stone-500">Clásica horizontal</div>
              </div>
            </label>
            <label class="cursor-pointer">
              <input type="radio" name="menuThemeLayout" value="grid_cards" class="peer hidden">
              <div class="p-3 rounded-2xl border-2 border-stone-200 peer-checked:border-amber-600 peer-checked:bg-amber-50 text-center space-y-1 transition">
                <div class="text-lg">▦</div>
                <div class="font-bold text-stone-900">Tarjetas (2x)</div>
                <div class="text-[10px] text-stone-500">Cuadrícula visual</div>
              </div>
            </label>
            <label class="cursor-pointer">
              <input type="radio" name="menuThemeLayout" value="large_cards" class="peer hidden">
              <div class="p-3 rounded-2xl border-2 border-stone-200 peer-checked:border-amber-600 peer-checked:bg-amber-50 text-center space-y-1 transition">
                <div class="text-lg">▭</div>
                <div class="font-bold text-stone-900">Tarjetas XL</div>
                <div class="text-[10px] text-stone-500">Foto ancha arriba</div>
              </div>
            </label>
          </div>
        </div>

        <div>
          <label class="block font-bold text-stone-800 mb-1.5">2. Tamaño de las imágenes</label>
          <select id="menuThemeImageSize" class="w-full border rounded-xl p-2.5 bg-stone-50 font-semibold outline-none focus:border-amber-600">
            <option value="sm">Compacto (más platillos visibles)</option>
            <option value="md">Mediano (equilibrado)</option>
            <option value="lg">Grande (fotografía protagonista)</option>
          </select>
        </div>

        <div>
          <label class="block font-bold text-stone-800 mb-1.5">3. Tipografía del menú</label>
          <select id="menuThemeFont" class="w-full border rounded-xl p-2.5 bg-stone-50 font-semibold outline-none focus:border-amber-600">
            <option value="editorial">Editorial Elegante (Playfair Display + Inter)</option>
            <option value="modern">Moderna Limpia (Plus Jakarta Sans)</option>
            <option value="classic">Clásica Bistro (Lora + DM Sans)</option>
            <option value="minimal">Minimalista Geométrica (Outfit)</option>
            <option value="rounded">Amigable / Cafetería (Quicksand)</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-stone-800 mb-1.5">4. Color de acento</label>
            <div class="flex items-center gap-2">
              <input type="color" id="menuThemeAccent" value="#b45309" class="w-11 h-10 rounded-xl border cursor-pointer p-0.5 bg-white">
              <div class="flex flex-wrap gap-1">
                <button type="button" onclick="document.getElementById('menuThemeAccent').value='#b45309'" class="w-6 h-6 rounded-full bg-amber-700 border"></button>
                <button type="button" onclick="document.getElementById('menuThemeAccent').value='#1c1917'" class="w-6 h-6 rounded-full bg-stone-900 border"></button>
                <button type="button" onclick="document.getElementById('menuThemeAccent').value='#047857'" class="w-6 h-6 rounded-full bg-emerald-700 border"></button>
                <button type="button" onclick="document.getElementById('menuThemeAccent').value='#9f1239'" class="w-6 h-6 rounded-full bg-rose-800 border"></button>
              </div>
            </div>
          </div>
          <div>
            <label class="block font-bold text-stone-800 mb-1.5">5. Color de fondo</label>
            <select id="menuThemeBg" class="w-full border rounded-xl p-2.5 bg-stone-50 font-semibold outline-none">
              <option value="#faf7f2">Crema Cálido</option>
              <option value="#ffffff">Blanco Puro</option>
              <option value="#f5f5f4">Piedra Suave</option>
              <option value="#18181b">Modo Oscuro Elegante</option>
            </select>
          </div>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-stone-200 bg-stone-50 flex gap-2">
        <button type="button" onclick="window.closeMenuDesignModal()" class="px-4 py-2.5 rounded-xl border bg-white text-stone-600 font-bold text-xs">Cancelar</button>
        <button type="button" onclick="window.saveMenuDesignSettings()"
          class="flex-grow py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition">
          Guardar Diseño del Menú ✓
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export async function openMenuDesignModal() {
  ensureMenuDesignModal();
  if (client) {
    const { data } = await client.from('restaurants').select('menu_theme').eq('id', REST_ID).maybeSingle();
    if (data?.menu_theme && typeof data.menu_theme === 'object') {
      currentMenuTheme = { ...DEFAULT_MENU_THEME, ...data.menu_theme };
    }
  }

  document.querySelectorAll('input[name="menuThemeLayout"]').forEach(r => {
    r.checked = r.value === currentMenuTheme.layout;
  });
  const imgSel = document.getElementById('menuThemeImageSize');
  const fontSel = document.getElementById('menuThemeFont');
  const accInput = document.getElementById('menuThemeAccent');
  const bgSel = document.getElementById('menuThemeBg');

  if (imgSel) imgSel.value = currentMenuTheme.image_size || 'md';
  if (fontSel) fontSel.value = currentMenuTheme.font_preset || 'editorial';
  if (accInput) accInput.value = currentMenuTheme.accent_color || '#b45309';
  if (bgSel) bgSel.value = currentMenuTheme.bg_color || '#faf7f2';

  document.getElementById('cartaMenuDesignModal')?.classList.remove('hidden');
}

export function closeMenuDesignModal() {
  document.getElementById('cartaMenuDesignModal')?.classList.add('hidden');
}

export async function saveMenuDesignSettings() {
  const layout = document.querySelector('input[name="menuThemeLayout"]:checked')?.value || 'list';
  const image_size = document.getElementById('menuThemeImageSize')?.value || 'md';
  const font_preset = document.getElementById('menuThemeFont')?.value || 'editorial';
  const accent_color = document.getElementById('menuThemeAccent')?.value || '#b45309';
  const bg_color = document.getElementById('menuThemeBg')?.value || '#faf7f2';

  currentMenuTheme = { layout, image_size, font_preset, accent_color, bg_color };

  if (client) {
    const { error } = await client
      .from('restaurants')
      .update({ menu_theme: currentMenuTheme })
      .eq('id', REST_ID);

    if (error) {
      showToast(`No se pudo guardar el diseño: ${error.message}`, 'error');
      return;
    }
  }

  closeMenuDesignModal();
  showToast('Diseño del menú actualizado ✓ Recarga el Menú QR para verlo.', 'success');
}

// ============================================================================
// 7. REDISEÑO LIMPIO DEL FORMULARIO "CREAR / EDITAR PRODUCTO"
// ============================================================================
function renderCompactProductExtrasPicker() {
  const cont = document.getElementById('cartaCompactExtrasPicker');
  if (!cont) return;

  const mods = Array.isArray(state.modifiers) ? state.modifiers : [];
  if (mods.length === 0) {
    cont.innerHTML = '<p class="text-[11px] text-stone-400">Aún no hay extras. Créalos en el botón "🧩 Modificadores y Extras".</p>';
    return;
  }

  cont.innerHTML = mods.map(m => {
    const checked = draftModifierIds.has(m.id);
    const isAvail = m.is_available !== false;
    return `
      <label class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] cursor-pointer transition ${
        checked ? 'border-amber-500 bg-amber-50 text-amber-950 font-bold' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
      }">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="window.toggleDraftProductModifier('${m.id}', this.checked)" class="accent-amber-600 w-3.5 h-3.5">
        <span class="${!isAvail ? 'line-through text-stone-400' : ''}">${escapeHtml(m.name)}</span>
        <span class="font-mono text-[10px] text-amber-800">+$${Number(m.price || 0).toFixed(0)}</span>
      </label>
    `;
  }).join('');
}

export function toggleDraftProductModifier(modId, checked) {
  if (checked) draftModifierIds.add(modId);
  else draftModifierIds.delete(modId);
  renderCompactProductExtrasPicker();
}

export function renderRelatedProductsPicker(searchTerm = '') {
  const cont = document.getElementById('cartaRelatedProductsList');
  if (!cont) return;

  const q = String(searchTerm || '').toLowerCase().trim();
  const others = (state.products || []).filter(p => {
    if (currentEditingProductId && p.id === currentEditingProductId) return false;
    if (q && !(p.title || '').toLowerCase().includes(q)) return false;
    return true;
  });

  if (others.length === 0) {
    cont.innerHTML = '<p class="text-[11px] text-stone-400 text-center py-2">No hay otros platillos disponibles para recomendar.</p>';
    return;
  }

  cont.innerHTML = others.map(p => {
    const checked = draftRecommendedIds.has(p.id);
    return `
      <label class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] cursor-pointer transition ${
        checked ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-950' : 'border-stone-200 bg-white text-stone-700'
      }">
        <div class="flex items-center gap-2 min-w-0">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="window.toggleDraftRelatedProduct('${p.id}', this.checked)" class="accent-emerald-600 w-3.5 h-3.5">
          <span class="truncate">${escapeHtml(p.title)}</span>
        </div>
        <span class="font-mono text-stone-500 flex-shrink-0">$${Number(p.price || 0).toFixed(2)}</span>
      </label>
    `;
  }).join('');
}

export function toggleDraftRelatedProduct(prodId, checked) {
  if (checked) draftRecommendedIds.add(prodId);
  else draftRecommendedIds.delete(prodId);
  const searchVal = document.getElementById('cartaRelatedSearchInput')?.value || '';
  renderRelatedProductsPicker(searchVal);
}

function findProductFormCard() {
  const titleInput = document.getElementById('newProdTitle');
  if (!titleInput) return null;
  return titleInput.closest('.bg-white') || titleInput.closest('form') || document.getElementById('tab-products');
}

function injectCartaProductEnhancements() {
  const formCard = findProductFormCard();
  if (!formCard || document.getElementById('cartaMultimediaSection')) return;

  // Ocultar el viejo campo de URL de imagen
  const oldImgInput =
    document.getElementById('newProdImage') ||
    document.getElementById('newProdImg') ||
    document.getElementById('newProdImageUrl') ||
    formCard.querySelector('input[placeholder*="http"], input[placeholder*="URL"], input[placeholder*="imagen" i]');
  if (oldImgInput) {
    const wrapper = oldImgInput.closest('div');
    if (wrapper && wrapper !== formCard) wrapper.classList.add('hidden');
    else oldImgInput.classList.add('hidden');
  }

  // Bloque 1: Galería Multimedia (Fotos + Video)
  const mediaSection = document.createElement('div');
  mediaSection.id = 'cartaMultimediaSection';
  mediaSection.className = 'w-full border border-stone-200 bg-stone-50/70 rounded-2xl p-4 space-y-3 text-xs';
  mediaSection.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="font-bold text-stone-800">📸 Imágenes y Video del Platillo</span>
      <span id="cartaMediaUploadStatus" class="text-[11px] font-bold text-amber-700"></span>
    </div>
    <div id="cartaMediaPreviewGrid" class="grid grid-cols-3 sm:grid-cols-5 gap-2"></div>
    <div class="flex flex-wrap gap-2">
      <label class="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-[11px] transition">
        <span>📷 + Agregar nueva imagen</span>
        <input type="file" accept="image/*" multiple class="hidden" onchange="window.handleCartaImageFilesSelected(this)">
      </label>
      <label class="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition">
        <span>🎬 Subir video</span>
        <input type="file" accept="video/mp4,video/webm,video/quicktime" class="hidden" onchange="window.handleCartaVideoFileSelected(this)">
      </label>
    </div>
    <div class="flex gap-1.5 pt-1 border-t border-stone-200">
      <input type="url" id="cartaVideoUrlInput" placeholder="O pega una URL de video (MP4, YouTube, Vimeo)..."
        class="flex-grow border rounded-xl px-3 py-2 bg-white text-[11px] outline-none focus:border-amber-600">
      <button type="button" onclick="window.addCartaVideoUrl()"
        class="px-3.5 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold text-[11px] whitespace-nowrap">
        + URL Video
      </button>
    </div>
  `;

  // Bloque 2: Selector compacto de Extras aplicables (el CRUD está aparte en el modal)
  const extrasSection = document.createElement('div');
  extrasSection.id = 'cartaExtrasPickerSection';
  extrasSection.className = 'w-full border border-stone-200 bg-stone-50/70 rounded-2xl p-4 space-y-2.5 text-xs';
  extrasSection.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="font-bold text-stone-800">🧩 Extras aplicables a este platillo</span>
      <button type="button" onclick="window.openModifiersManagerModal()" class="text-[11px] font-bold text-amber-700 hover:underline">
        Administrar / Crear extras →
      </button>
    </div>
    <div id="cartaCompactExtrasPicker" class="flex flex-wrap gap-1.5"></div>
  `;

  // Bloque 3: Productos recomendados ("Frecuentemente pedidos juntos")
  const relatedSection = document.createElement('div');
  relatedSection.id = 'cartaRelatedPickerSection';
  relatedSection.className = 'w-full border border-stone-200 bg-stone-50/70 rounded-2xl p-4 space-y-2.5 text-xs';
  relatedSection.innerHTML = `
    <div>
      <span class="font-bold text-stone-800 block">🤝 Frecuentemente pedidos juntos (Recomendaciones)</span>
      <span class="text-[10px] text-stone-500">Elige los platillos o bebidas que se sugerirán al abrir este artículo en el menú.</span>
    </div>
    <input type="text" id="cartaRelatedSearchInput" oninput="window.renderRelatedProductsPicker(this.value)"
      placeholder="Buscar platillo para recomendar..." class="w-full border rounded-xl px-3 py-2 bg-white text-xs outline-none focus:border-emerald-600">
    <div id="cartaRelatedProductsList" class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-0.5"></div>
  `;

  // Bloque 4: Botón Guardar Platillo SIEMPRE abajo del todo, ancho completo, horizontal y VERDE
  const saveBtn = formCard.querySelector('button[onclick*="createProduct"]');
  const cancelBtn = formCard.querySelector('button[onclick*="cancelEditProduct"]');
  const oldSaveWrapper = saveBtn?.parentElement;

  const actionsFooter = document.createElement('div');
  actionsFooter.id = 'cartaProductSaveFooter';
  actionsFooter.className = 'w-full pt-3 mt-1 border-t border-stone-200 flex flex-col sm:flex-row gap-2';

  // Insertar los 4 bloques como hijos directos de formCard (fuera de rejillas internas para que nada se descuadre)
  formCard.appendChild(mediaSection);
  formCard.appendChild(extrasSection);
  formCard.appendChild(relatedSection);
  formCard.appendChild(actionsFooter);

  if (saveBtn) {
    saveBtn.className = 'w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black text-sm shadow-md transition flex items-center justify-center gap-2';
    actionsFooter.appendChild(saveBtn);
  }
  if (cancelBtn) {
    cancelBtn.className = 'sm:w-auto px-5 py-3.5 rounded-2xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs transition whitespace-nowrap';
    actionsFooter.appendChild(cancelBtn);
  }
  if (oldSaveWrapper && oldSaveWrapper !== formCard && oldSaveWrapper.children.length === 0) {
    oldSaveWrapper.remove();
  }

  renderMediaGalleryEditor();
  renderRelatedProductsPicker();
  fetchModifiersIntoState().then(renderCompactProductExtrasPicker);
}

// ============================================================================
// 8. FILTROS COMBINABLES EN EL LISTADO DE CARTA (CATEGORÍA, TIPO, ESTACIÓN)
// ============================================================================
function injectCatalogFiltersBar() {
  const listEl = document.getElementById('adminProductsList');
  if (!listEl || document.getElementById('cartaCatalogFiltersBar')) return;

  const bar = document.createElement('div');
  bar.id = 'cartaCatalogFiltersBar';
  bar.className = 'bg-stone-50 border border-stone-200 rounded-2xl p-3 mb-3 space-y-2 text-xs';
  bar.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
      <input type="text" id="filterProdSearch" oninput="window.applyCatalogFilters()" placeholder="🔍 Buscar platillo..."
        class="border rounded-xl px-3 py-2 bg-white outline-none focus:border-amber-600">
      <select id="filterProdCategory" onchange="window.applyCatalogFilters()" class="border rounded-xl px-2.5 py-2 bg-white font-semibold outline-none"></select>
      <select id="filterProdType" onchange="window.applyCatalogFilters()" class="border rounded-xl px-2.5 py-2 bg-white font-semibold outline-none"></select>
      <select id="filterProdStation" onchange="window.applyCatalogFilters()" class="border rounded-xl px-2.5 py-2 bg-white font-semibold outline-none">
        <option value="all">Todas las estaciones</option>
        ${STATIONS.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('')}
      </select>
    </div>
    <div class="flex items-center justify-between text-[11px] text-stone-500">
      <span id="filterProdResultCount" class="font-bold"></span>
      <button type="button" onclick="window.resetCatalogFilters()" class="text-amber-700 font-bold hover:underline">Limpiar filtros</button>
    </div>
  `;

  listEl.parentNode.insertBefore(bar, listEl);
  populateCatalogFilterOptions();
}

function populateCatalogFilterOptions() {
  const catSel = document.getElementById('filterProdCategory');
  const typSel = document.getElementById('filterProdType');
  if (catSel) {
    const prev = catSel.value || 'all';
    catSel.innerHTML = `<option value="all">Todas las categorías</option>` +
      (state.categories || []).map(c => `<option value="${c.id}">${escapeHtml(c.icon || '🍽️')} ${escapeHtml(c.name)}</option>`).join('');
    catSel.value = prev;
  }
  if (typSel) {
    const prev = typSel.value || 'all';
    typSel.innerHTML = `<option value="all">Todos los tipos</option>` +
      (state.types || []).map(t => `<option value="${t.id}">${escapeHtml(t.icon || '🏷️')} ${escapeHtml(t.name)}</option>`).join('');
    typSel.value = prev;
  }
}

export function applyCatalogFilters() {
  catalogFilters.search = (document.getElementById('filterProdSearch')?.value || '').trim().toLowerCase();
  catalogFilters.category_id = document.getElementById('filterProdCategory')?.value || 'all';
  catalogFilters.type_id = document.getElementById('filterProdType')?.value || 'all';
  catalogFilters.station = document.getElementById('filterProdStation')?.value || 'all';
  renderFilteredProductsList();
}

export function resetCatalogFilters() {
  catalogFilters.search = '';
  catalogFilters.category_id = 'all';
  catalogFilters.type_id = 'all';
  catalogFilters.station = 'all';
  if (document.getElementById('filterProdSearch')) document.getElementById('filterProdSearch').value = '';
  if (document.getElementById('filterProdCategory')) document.getElementById('filterProdCategory').value = 'all';
  if (document.getElementById('filterProdType')) document.getElementById('filterProdType').value = 'all';
  if (document.getElementById('filterProdStation')) document.getElementById('filterProdStation').value = 'all';
  renderFilteredProductsList();
}

function renderFilteredProductsList() {
  const cont = document.getElementById('adminProductsList');
  if (!cont) return;

  populateCatalogFilterOptions();

  const allProds = Array.isArray(state.products) ? state.products : [];
  const filtered = allProds.filter(p => {
    if (catalogFilters.search && !(p.title || '').toLowerCase().includes(catalogFilters.search)) return false;
    if (catalogFilters.category_id !== 'all' && p.category_id !== catalogFilters.category_id) return false;
    if (catalogFilters.type_id !== 'all' && p.type_id !== catalogFilters.type_id) return false;
    if (catalogFilters.station !== 'all' && (p.station || 'cocina') !== catalogFilters.station) return false;
    return true;
  });

  const resCount = document.getElementById('filterProdResultCount');
  if (resCount) resCount.innerText = `Mostrando ${filtered.length} de ${allProds.length} platillos`;

  const countEl = document.getElementById('prodCount');
  if (countEl) countEl.innerText = `${allProds.length} platillos`;

  if (filtered.length === 0) {
    cont.innerHTML = '<div class="text-center py-8 text-xs text-stone-400 border border-dashed rounded-2xl">No hay platillos que coincidan con esos filtros.</div>';
    return;
  }

  cont.innerHTML = filtered.map(p => {
    const cat = (state.categories || []).find(c => c.id === p.category_id);
    const typ = (state.types || []).find(t => t.id === p.type_id);
    const st = STATIONS.find(s => s.id === (p.station || 'cocina')) || STATIONS[0];
    const firstImg = (p.media || []).find(m => m.type !== 'video') || p.media?.[0];
    const imgUrl = firstImg?.url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80';
    const isAvail = p.is_available !== false;
    const mediaCount = Array.isArray(p.media) ? p.media.length : 0;
    const relCount = Array.isArray(p.recommended_product_ids) ? p.recommended_product_ids.length : 0;

    return `
      <div class="p-3 border border-stone-200 rounded-2xl bg-white flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs shadow-xs">
        <div class="flex items-center gap-3 min-w-0 flex-grow">
          <img src="${imgUrl}" class="w-12 h-12 rounded-xl object-cover bg-stone-100 flex-shrink-0 ${!isAvail ? 'grayscale opacity-50' : ''}">
          <div class="min-w-0">
            <div class="font-bold text-sm text-stone-900 truncate">${escapeHtml(p.title)}</div>
            <div class="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
              <span class="font-mono font-black text-amber-800">$${Number(p.price || 0).toFixed(2)}</span>
              ${cat ? `<span class="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">${escapeHtml(cat.icon || '')} ${escapeHtml(cat.name)}</span>` : ''}
              ${typ ? `<span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">${escapeHtml(typ.name)}</span>` : ''}
              <span class="px-1.5 py-0.5 rounded border ${st.badgeClass}">${st.icon} ${st.name}</span>
              ${mediaCount > 1 ? `<span class="text-stone-400">📸 ${mediaCount}</span>` : ''}
              ${relCount > 0 ? `<span class="text-emerald-700">🤝 ${relCount}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" onclick="window.toggleProductAvailability('${p.id}')"
            class="px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition ${isAvail ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-rose-100 text-rose-800 hover:bg-rose-200'}">
            ${isAvail ? 'Disponible' : 'Agotado'}
          </button>
          <button type="button" onclick="window.startEditProduct('${p.id}')" class="p-1.5 rounded-xl border hover:bg-stone-100 text-stone-700" title="Editar">✏️</button>
          <button type="button" onclick="window.deleteProduct('${p.id}')" class="p-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600" title="Eliminar">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// 9. CRUD DE PRODUCTO + SINCRONIZACIÓN DE EXTRAS Y RECOMENDADOS
// ============================================================================
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
  draftRecommendedIds = new Set();
  ['newProdTitle', 'newProdPrice', 'newProdDesc', 'cartaRelatedSearchInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderMediaGalleryEditor();
  renderCompactProductExtrasPicker();
  renderRelatedProductsPicker();
}

function wrapProductCrudFunctions() {
  if (window.__cartaCrudWrapped) return;
  window.__cartaCrudWrapped = true;

  const origStartEdit = window.startEditProduct;
  const origCancelEdit = window.cancelEditProduct;
  const origRenderProducts = window.renderProducts;

  window.renderProducts = function (...args) {
    if (typeof origRenderProducts === 'function') origRenderProducts.call(this, ...args);
    renderFilteredProductsList();
    renderRelatedProductsPicker(document.getElementById('cartaRelatedSearchInput')?.value || '');
  };

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
    draftRecommendedIds = new Set(Array.isArray(prod?.recommended_product_ids) ? prod.recommended_product_ids : []);

    renderMediaGalleryEditor();
    renderCompactProductExtrasPicker();
    renderRelatedProductsPicker();

    document.getElementById('newProdTitle')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const recommendedPayload = Array.from(draftRecommendedIds);

    if (currentEditingProductId) {
      const updates = {
        category_id: catId,
        type_id: typeId,
        title,
        description: desc,
        price,
        station,
        media: mediaPayload,
        recommended_product_ids: recommendedPayload
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
        recommended_product_ids: recommendedPayload,
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
    renderFilteredProductsList();
  };
}

function subscribeCartaRealtime() {
  if (!client || window.__cartaRealtimeSub) return;
  window.__cartaRealtimeSub = true;

  client.channel(`carta_mods_supplies_${REST_ID}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_modifiers', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
      await fetchModifiersIntoState();
      renderModifiersManagerList();
      renderCompactProductExtrasPicker();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'supplies', filter: `restaurant_id=eq.${REST_ID}` }, async () => {
      const { data } = await client.from('supplies').select('*').eq('restaurant_id', REST_ID).order('name', { ascending: true });
      if (data) {
        state.supplies = data;
        renderModifiersManagerList();
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
  openModifiersManagerModal,
  closeModifiersManagerModal,
  createManagedModifier,
  startEditInlineModifier,
  cancelEditInlineModifier,
  saveEditInlineModifier,
  toggleInlineModifierAvailability,
  deleteInlineModifier,
  openMenuDesignModal,
  closeMenuDesignModal,
  saveMenuDesignSettings,
  toggleDraftProductModifier,
  renderRelatedProductsPicker,
  toggleDraftRelatedProduct,
  applyCatalogFilters,
  resetCatalogFilters
});

export function initCartaEnhancer() {
  cleanCartaTitles();
  injectCartaTopToolbar();
  injectCartaProductEnhancements();
  injectCatalogFiltersBar();
  wrapProductCrudFunctions();
  subscribeCartaRealtime();

  const topTitle = document.getElementById('topbarTitle');
  if (topTitle) {
    new MutationObserver(cleanCartaTitles).observe(topTitle, { childList: true, characterData: true, subtree: true });
  }

  setTimeout(() => {
    cleanCartaTitles();
    injectCartaTopToolbar();
    injectCartaProductEnhancements();
    injectCatalogFiltersBar();
    wrapProductCrudFunctions();
    fetchModifiersIntoState().then(renderCompactProductExtrasPicker);
    renderFilteredProductsList();
    renderRelatedProductsPicker();
  }, 600);
}
