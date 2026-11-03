import { client, REST_ID } from '../config.js';

let adminCategories = [];
let adminTypes = [];
let currentInspector = null;
const sectionStates = { categories: true, types: true };

export function setTaxonomies(cats, types) {
  adminCategories = cats;
  adminTypes = types;
  renderTaxonomies();
}

export function toggleSection(sectionKey) {
  const content = document.getElementById(`content-${sectionKey}`);
  const arrow = document.getElementById(`arrow-${sectionKey}`);
  sectionStates[sectionKey] = !sectionStates[sectionKey];
  if (content && arrow) {
    if (sectionStates[sectionKey]) {
      content.classList.remove('hidden');
      arrow.innerText = '▼';
    } else {
      content.classList.add('hidden');
      arrow.innerText = '▲';
    }
  }
}

export function renderTaxonomies() {
  renderCategoriesList();
  renderTypesList();
}

function renderCategoriesList() {
  const cont = document.getElementById('categoriesListAdmin');
  const badge = document.getElementById('badgeCatCount');
  if (badge) badge.innerText = adminCategories.length;
  if (!cont) return;

  if (adminCategories.length === 0) {
    cont.innerHTML = '<p class="text-xs text-stone-400 py-3 text-center">No hay categorías registradas.</p>';
    return;
  }
  cont.innerHTML = adminCategories.map((cat, idx) => `
    <div class="border rounded-xl p-2.5 bg-stone-50 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 flex-grow cursor-pointer" onclick="window.app.inspectItem('category', '${cat.id}')">
        <span class="text-base">${cat.icon || '🍽️'}</span>
        <span class="font-bold text-xs text-stone-900">${cat.name}</span>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="window.app.reorderTaxonomy('category', '${cat.id}', -1)" class="p-1 hover:bg-stone-200 rounded text-xs font-bold">▲</button>
        <button onclick="window.app.reorderTaxonomy('category', '${cat.id}', 1)" class="p-1 hover:bg-stone-200 rounded text-xs font-bold">▼</button>
        <button onclick="window.app.deleteTaxonomy('category', '${cat.id}')" class="p-1 text-rose-500 hover:text-rose-700 rounded text-xs font-bold">✕</button>
      </div>
    </div>
  `).join('');
}

function renderTypesList() {
  const cont = document.getElementById('typesListAdmin');
  const badge = document.getElementById('badgeTypeCount');
  if (badge) badge.innerText = adminTypes.length;
  if (!cont) return;

  if (adminTypes.length === 0) {
    cont.innerHTML = '<p class="text-xs text-amber-700/60 py-3 text-center">No hay tipos registrados.</p>';
    return;
  }
  cont.innerHTML = adminTypes.map((typ, idx) => `
    <div class="border rounded-xl p-2.5 bg-amber-50/50 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 flex-grow cursor-pointer" onclick="window.app.inspectItem('type', '${typ.id}')">
        <span class="text-base">${typ.icon || '🏷️'}</span>
        <span class="font-bold text-xs text-amber-950">${typ.name}</span>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="window.app.reorderTaxonomy('type', '${typ.id}', -1)" class="p-1 hover:bg-amber-100 rounded text-xs font-bold">▲</button>
        <button onclick="window.app.reorderTaxonomy('type', '${typ.id}', 1)" class="p-1 hover:bg-amber-100 rounded text-xs font-bold">▼</button>
        <button onclick="window.app.deleteTaxonomy('type', '${typ.id}')" class="p-1 text-rose-500 hover:text-rose-700 rounded text-xs font-bold">✕</button>
      </div>
    </div>
  `).join('');
}

export function inspectItem(mode, id, adminProducts) {
  const item = mode === 'category' ? adminCategories.find(c => c.id === id) : adminTypes.find(t => t.id === id);
  if (!item) return;
  currentInspector = { mode, id, name: item.name, icon: item.icon };

  const badge = document.getElementById('inspectorBadge');
  if (badge) badge.innerText = mode === 'category' ? 'Categoría' : 'Tipo';

  const title = document.getElementById('inspectorTitle');
  if (title) title.innerHTML = `<span>${item.icon || ''}</span> <span>${item.name}</span>`;

  const assignBox = document.getElementById('assignProductBox');
  if (assignBox) assignBox.classList.remove('hidden');

  const assigned = (adminProducts || []).filter(p => mode === 'category' ? p.category_id === id : p.type_id === id);
  const countEl = document.getElementById('inspectorCount');
  if (countEl) countEl.innerText = `${assigned.length} productos`;

  const listCont = document.getElementById('inspectorProductsList');
  if (!listCont) return;

  if (assigned.length === 0) {
    listCont.innerHTML = '<p class="text-xs text-stone-400 py-6 text-center">No hay productos asignados.</p>';
    return;
  }

  listCont.innerHTML = assigned.map(p => `
    <div class="flex items-center justify-between p-2 rounded-xl border bg-stone-50 text-xs">
      <span class="font-bold text-stone-900">${p.title}</span>
      <button onclick="window.app.unassignProductFromCurrent('${p.id}')" class="text-rose-600 font-bold px-2 py-0.5 rounded text-[11px]">Quitar</button>
    </div>
  `).join('');
}

export function getCurrentInspector() {
  return currentInspector;
}

export async function createCategory() {
  const nameInput = document.getElementById('newCategoryInput');
  const iconInput = document.getElementById('newCatIcon');
  const name = nameInput?.value?.trim();
  const icon = iconInput?.value?.trim() || '🍽️';
  if (!name) return;

  const newCat = { id: 'cat-' + Date.now(), restaurant_id: REST_ID, name, icon, order_index: adminCategories.length + 1 };
  adminCategories.push(newCat);
  if (nameInput) nameInput.value = '';
  renderCategoriesList();
  if (client) await client.from('categories').insert([{ restaurant_id: REST_ID, name, icon, order_index: newCat.order_index }]);
}

export async function createType() {
  const nameInput = document.getElementById('newTypeInput');
  const iconInput = document.getElementById('newTypeIcon');
  const name = nameInput?.value?.trim();
  const icon = iconInput?.value?.trim() || '☕';
  if (!name) return;

  const newTyp = { id: 'typ-' + Date.now(), restaurant_id: REST_ID, name, icon, order_index: adminTypes.length + 1 };
  adminTypes.push(newTyp);
  if (nameInput) nameInput.value = '';
  renderTypesList();
  if (client) await client.from('product_types').insert([{ restaurant_id: REST_ID, name, icon, order_index: newTyp.order_index }]);
}

export async function reorderTaxonomy(mode, id, dir) {
  const list = mode === 'category' ? adminCategories : adminTypes;
  const idx = list.findIndex(item => item.id === id);
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= list.length) return;
  const temp = list[idx];
  list[idx] = list[targetIdx];
  list[targetIdx] = temp;
  renderTaxonomies();
}

export async function deleteTaxonomy(mode, id) {
  if (!confirm("¿Eliminar este elemento?")) return;
  if (mode === 'category') adminCategories = adminCategories.filter(c => c.id !== id);
  else adminTypes = adminTypes.filter(t => t.id !== id);
  renderTaxonomies();
  if (client) {
    const table = mode === 'category' ? 'categories' : 'product_types';
    await client.from(table).delete().eq('id', id);
  }
}
