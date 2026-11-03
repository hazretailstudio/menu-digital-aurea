import { client, REST_ID } from '../config.js';

let adminProducts = [];

export function setProducts(prods, adminCategories, adminTypes) {
  adminProducts = prods;
  renderProducts(adminCategories, adminTypes);
}

export function getProducts() {
  return adminProducts;
}

export function renderProducts(adminCategories = [], adminTypes = []) {
  const cont = document.getElementById('adminProductsList');
  const selectCat = document.getElementById('newProdCategory');
  const selectType = document.getElementById('newProdType');
  const countEl = document.getElementById('prodCount');

  if (countEl) countEl.innerText = `${adminProducts.length} platillos`;
  if (selectCat) selectCat.innerHTML = adminCategories.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');
  if (selectType) selectType.innerHTML = `<option value="">-- Sin tipo --</option>` + adminTypes.map(t => `<option value="${t.id}">${t.icon || ''} ${t.name}</option>`).join('');

  if (!cont) return;

  cont.innerHTML = adminProducts.map(p => {
    const img = (p.media && p.media[0]) ? p.media[0].url : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';
    return `
      <div class="p-3 border rounded-xl bg-stone-50 flex items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-3">
          <img src="${img}" class="w-12 h-12 rounded-xl object-cover bg-stone-200">
          <div>
            <h4 class="font-bold text-sm text-stone-900">${p.title}</h4>
            <span class="font-mono font-bold text-stone-700">$${Number(p.price).toFixed(2)}</span>
          </div>
        </div>
        <button onclick="window.app.toggleProductStock('${p.id}')" class="px-2.5 py-1 rounded-lg font-bold ${p.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
          ${p.is_available ? 'Disponible' : 'Agotado'}
        </button>
      </div>
    `;
  }).join('');
}

export async function toggleProductStock(prodId, adminCategories, adminTypes) {
  const p = adminProducts.find(item => item.id === prodId);
  if (!p) return;
  p.is_available = !p.is_available;
  renderProducts(adminCategories, adminTypes);
  if (client) await client.from('products').update({ is_available: p.is_available }).eq('id', prodId);
}

export async function createProduct(adminCategories, adminTypes) {
  const title = document.getElementById('newProdTitle')?.value?.trim();
  const price = parseFloat(document.getElementById('newProdPrice')?.value) || 0;
  const catId = document.getElementById('newProdCategory')?.value;
  const typeId = document.getElementById('newProdType')?.value || null;
  const desc = document.getElementById('newProdDesc')?.value?.trim();

  if (!title || price <= 0) {
    alert("Ingresa título y precio válidos.");
    return;
  }

  const newProd = {
    id: 'prod-' + Date.now(),
    restaurant_id: REST_ID, category_id: catId, type_id: typeId, title, description: desc, price,
    media: [{ type: 'image', url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80' }],
    is_available: true
  };

  adminProducts.unshift(newProd);
  renderProducts(adminCategories, adminTypes);

  if (document.getElementById('newProdTitle')) document.getElementById('newProdTitle').value = '';
  if (document.getElementById('newProdPrice')) document.getElementById('newProdPrice').value = '';
  if (document.getElementById('newProdDesc')) document.getElementById('newProdDesc').value = '';

  if (client) await client.from('products').insert([newProd]);
}
