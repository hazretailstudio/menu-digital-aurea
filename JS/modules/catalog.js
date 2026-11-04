import { state, client } from '../state.js';
import { REST_ID } from '../config.js';

export function renderTaxonomies() {
  const catCont = document.getElementById('categoriesListAdmin');
  if (catCont) catCont.innerHTML = state.categories.map(c => `<div class="border rounded-xl p-2.5 bg-stone-50 flex items-center justify-between text-xs"><span class="font-bold text-stone-900">${c.icon || '🍽️'} ${c.name}</span></div>`).join('');
  const typCont = document.getElementById('typesListAdmin');
  if (typCont) typCont.innerHTML = state.types.map(t => `<div class="border rounded-xl p-2.5 bg-amber-50/50 flex items-center justify-between text-xs"><span class="font-bold text-amber-950">${t.icon || '🏷️'} ${t.name}</span></div>`).join('');
}

export async function createCategory() {
  const name = document.getElementById('newCategoryInput')?.value?.trim();
  const icon = document.getElementById('newCatIcon')?.value?.trim() || '🍽️';
  if (!name) return;

  const newCat = { id: 'cat-' + Date.now(), restaurant_id: REST_ID, name, icon, order_index: state.categories.length + 1 };
  state.categories.push(newCat);
  document.getElementById('newCategoryInput').value = '';
  renderTaxonomies();
  if (client) await client.from('categories').insert([{ restaurant_id: REST_ID, name, icon, order_index: newCat.order_index }]);
}

export async function createType() {
  const name = document.getElementById('newTypeInput')?.value?.trim();
  const icon = document.getElementById('newTypeIcon')?.value?.trim() || '☕';
  if (!name) return;

  const newTyp = { id: 'typ-' + Date.now(), restaurant_id: REST_ID, name, icon, order_index: state.types.length + 1 };
  state.types.push(newTyp);
  document.getElementById('newTypeInput').value = '';
  renderTaxonomies();
  if (client) await client.from('product_types').insert([{ restaurant_id: REST_ID, name, icon, order_index: newTyp.order_index }]);
}

export function renderProducts() {
  const cont = document.getElementById('adminProductsList');
  const countEl = document.getElementById('prodCount');
  if (countEl) countEl.innerText = `${state.products.length} platillos`;

  const selectCat = document.getElementById('newProdCategory');
  const selectType = document.getElementById('newProdType');
  if (selectCat) selectCat.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');
  if (selectType) selectType.innerHTML = `<option value="">-- Sin tipo --</option>` + state.types.map(t => `<option value="${t.id}">${t.icon || ''} ${t.name}</option>`).join('');
  if (!cont) return;

  cont.innerHTML = state.products.map(p => `
    <div class="p-3 border rounded-xl bg-stone-50 flex items-center justify-between gap-3 text-xs">
      <div>
        <h4 class="font-bold text-sm text-stone-900">${p.title}</h4>
        <span class="font-mono font-bold text-stone-700">$${Number(p.price).toFixed(2)}</span>
      </div>
      <span class="px-2.5 py-1 rounded-lg font-bold bg-emerald-100 text-emerald-800">Disponible</span>
    </div>
  `).join('');
}

export async function createProduct() {
  const title = document.getElementById('newProdTitle')?.value?.trim();
  const price = parseFloat(document.getElementById('newProdPrice')?.value) || 0;
  const catId = document.getElementById('newProdCategory')?.value;
  const typeId = document.getElementById('newProdType')?.value || null;
  const desc = document.getElementById('newProdDesc')?.value?.trim();
  if (!title || price <= 0) return;

  const newProd = {
    id: 'prod-' + Date.now(),
    restaurant_id: REST_ID,
    category_id: catId,
    type_id: typeId,
    title,
    description: desc,
    price,
    media: [{ type: 'image', url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80' }],
    is_available: true
  };

  state.products.unshift(newProd);
  renderProducts();
  document.getElementById('newProdTitle').value = '';
  document.getElementById('newProdPrice').value = '';
  document.getElementById('newProdDesc').value = '';
  if (client) await client.from('products').insert([newProd]);
}