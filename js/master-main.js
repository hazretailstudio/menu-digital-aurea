import { SUPABASE_URL, SUPABASE_KEY, generateUUID, escapeHtml, showToast } from './config.js';
import { DEFAULT_ENABLED_MODULES, DEFAULT_THEME_CONFIG } from './tenant.js';

const MODULE_LABELS = [
  { key: 'tables',       icon: '🪑', label: 'Mapa de Mesas' },
  { key: 'orders',       icon: '📋', label: 'Comandas / KDS' },
  { key: 'cashbox',      icon: '💵', label: 'Caja & Cortes X/Z' },
  { key: 'products',     icon: '🍽️', label: 'Carta y Botón 86' },
  { key: 'taxonomies',   icon: '📑', label: 'Categorías y Tipos' },
  { key: 'calls',        icon: '🔔', label: 'Llamadas Mesero' },
  { key: 'reservations', icon: '📅', label: 'Reservas' },
  { key: 'promos',       icon: '🏷️', label: 'Promociones' },
  { key: 'inventory',    icon: '🥫', label: 'Inventario & Recetas' },
  { key: 'analytics',    icon: '📈', label: 'Métricas & Boston' },
  { key: 'staff',        icon: '🛡️', label: 'Personal y PINs' },
  { key: 'marketing',    icon: '⭐', label: 'Maps y Lealtad' }
];

const MODULE_PRESETS = {
  basic: ['tables', 'orders', 'products', 'taxonomies', 'staff'],
  pro:   ['tables', 'orders', 'cashbox', 'products', 'taxonomies', 'calls', 'reservations', 'promos', 'staff'],
  full:  MODULE_LABELS.map(m => m.key)
};

let supa = null;
let tenants = [];

function initSupabaseClient() {
  if (!window.supabase) {
    showToast('No se pudo cargar Supabase JS.', 'error');
    return null;
  }
  if (!SUPABASE_URL || SUPABASE_URL.includes('PEGA_AQUI')) {
    const err = document.getElementById('masterLoginError');
    if (err) {
      err.textContent = 'Falta pegar tus credenciales reales SUPABASE_URL y SUPABASE_KEY en js/config.js.';
      err.classList.remove('hidden');
    }
    return null;
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function verifyIsMasterAdmin(email) {
  if (!supa || !email) return false;
  const { data, error } = await supa
    .from('master_admins')
    .select('email')
    .ilike('email', email.trim())
    .maybeSingle();
  return !error && Boolean(data?.email);
}

function showLoginScreen(errorMsg = '') {
  document.getElementById('masterLoginView')?.classList.remove('hidden');
  document.getElementById('masterAppView')?.classList.add('hidden');
  const errEl = document.getElementById('masterLoginError');
  if (errEl) {
    if (errorMsg) {
      errEl.textContent = errorMsg;
      errEl.classList.remove('hidden');
    } else {
      errEl.classList.add('hidden');
    }
  }
}

function showMasterApp(email) {
  document.getElementById('masterLoginView')?.classList.add('hidden');
  document.getElementById('masterAppView')?.classList.remove('hidden');
  const emailEl = document.getElementById('masterUserEmail');
  if (emailEl) emailEl.textContent = email;
  const baseDom = document.getElementById('kpiBaseDomain');
  if (baseDom) baseDom.textContent = window.location.origin;
  loadTenants();
}

export async function handleMasterLogin(e) {
  e.preventDefault();
  if (!supa) supa = initSupabaseClient();
  if (!supa) return;

  const email = document.getElementById('masterEmailInput')?.value?.trim();
  const password = document.getElementById('masterPasswordInput')?.value || '';
  const btn = document.getElementById('btnMasterLogin');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verificando...';
  }

  try {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error || !data?.user) {
      showLoginScreen('Credenciales inválidas. Verifica correo y contraseña.');
      return;
    }

    const isMaster = await verifyIsMasterAdmin(data.user.email);
    if (!isMaster) {
      await supa.auth.signOut();
      showLoginScreen('Acceso denegado: este correo no está autorizado en la tabla master_admins.');
      return;
    }

    showMasterApp(data.user.email);
  } catch (err) {
    showLoginScreen(`Error de conexión: ${err.message || err}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Iniciar Sesión Master';
    }
  }
}

export async function handleMasterLogout() {
  if (supa) await supa.auth.signOut();
  showLoginScreen('');
}

export async function loadTenants() {
  if (!supa) return;
  const { data, error } = await supa
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    showToast(`Error al cargar negocios: ${error.message}`, 'error');
    return;
  }

  tenants = data || [];
  updateKPIs();
  renderTenantsGrid();
}

function updateKPIs() {
  const total = tenants.length;
  const active = tenants.filter(t => t.is_active !== false).length;
  const suspended = total - active;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };
  set('kpiTotalTenants', total);
  set('kpiActiveTenants', active);
  set('kpiSuspendedTenants', suspended);
}

export function renderTenantsGrid() {
  const grid = document.getElementById('tenantsGrid');
  if (!grid) return;

  const query = (document.getElementById('tenantSearchInput')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('tenantStatusFilter')?.value || 'all';

  const filtered = tenants.filter(t => {
    const isAct = t.is_active !== false;
    if (statusFilter === 'active' && !isAct) return false;
    if (statusFilter === 'suspended' && isAct) return false;
    if (query) {
      const hay = `${t.name || ''} ${t.slug || ''} ${t.plan_name || ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-3xl p-10 border border-stone-200 text-center space-y-2">
        <div class="text-3xl">🏪</div>
        <p class="font-bold text-stone-700 text-sm">No hay restaurantes que coincidan con el filtro.</p>
        <button onclick="window.openTenantModal(null)" class="mt-2 bg-stone-900 text-white font-bold text-xs px-4 py-2 rounded-xl">+ Crear primer negocio</button>
      </div>
    `;
    return;
  }

  const origin = window.location.origin;

  grid.innerHTML = filtered.map(t => {
    const isAct = t.is_active !== false;
    const theme = { ...DEFAULT_THEME_CONFIG, ...(t.theme_config || {}) };
    const mods = { ...DEFAULT_ENABLED_MODULES, ...(t.enabled_modules || {}) };
    const enabledCount = Object.values(mods).filter(Boolean).length;
    const adminUrl = `${origin}/admin.html?r=${encodeURIComponent(t.slug)}`;
    const qrUrl = `${origin}/index.html?r=${encodeURIComponent(t.slug)}&mesa=01`;

    return `
      <article class="bg-white rounded-3xl border ${isAct ? 'border-stone-200' : 'border-rose-300 bg-rose-50/20'} p-5 shadow-xs flex flex-col justify-between gap-4">
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              ${t.logo_url
                ? `<img src="${escapeHtml(t.logo_url)}" alt="${escapeHtml(t.name)}" class="w-12 h-12 rounded-2xl object-cover border border-stone-200 flex-shrink-0">`
                : `<div class="w-12 h-12 rounded-2xl flex items-center justify-center text-xl text-white flex-shrink-0" style="background:${escapeHtml(theme.accent)}">${escapeHtml(theme.emoji || '🍽️')}</div>`
              }
              <div class="min-w-0">
                <h3 class="font-extrabold text-sm text-stone-900 truncate">${escapeHtml(t.name)}</h3>
                <p class="text-[11px] font-mono text-stone-500 truncate">?r=${escapeHtml(t.slug)}</p>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${isAct ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'} flex-shrink-0">
              ${isAct ? 'Activo' : 'Suspendido'}
            </span>
          </div>

          <div class="flex flex-wrap gap-1.5 text-[10px] font-bold">
            <span class="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">Plan ${escapeHtml(t.plan_name || 'Pro')}</span>
            <span class="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700">${enabledCount}/12 módulos</span>
            <span class="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 font-mono">${escapeHtml(t.currency || 'MXN')}</span>
          </div>
        </div>

        <div class="space-y-2 pt-2 border-t border-stone-100 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <a href="${adminUrl}" target="_blank" class="bg-stone-900 hover:bg-stone-800 text-white font-bold py-2 px-3 rounded-xl text-center transition">
              🖥️ Abrir POS ↗
            </a>
            <button onclick="window.copyTenantUrl('${escapeHtml(qrUrl)}', 'Menú QR')" class="bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold py-2 px-3 rounded-xl transition">
              🔗 Copiar QR
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button onclick="window.openTenantModal('${t.id}')" class="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold py-2 px-3 rounded-xl transition">
              ✏️ Configurar
            </button>
            <button onclick="window.toggleTenantStatus('${t.id}')" class="border ${isAct ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'} font-bold py-2 px-3 rounded-xl transition">
              ${isAct ? '⏸️ Suspender' : '▶️ Activar'}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

export async function copyTenantUrl(url, label) {
  try {
    await navigator.clipboard.writeText(url);
    showToast(`Link de ${label} copiado al portapapeles ✓`, 'success');
  } catch {
    prompt(`Copia el enlace de ${label}:`, url);
  }
}

export async function toggleTenantStatus(id) {
  const t = tenants.find(x => x.id === id);
  if (!t || !supa) return;
  const nextVal = t.is_active === false;
  const actionTxt = nextVal ? 'reactivar' : 'suspender';
  if (!confirm(`¿Seguro que deseas ${actionTxt} "${t.name}"?`)) return;

  const { error } = await supa
    .from('restaurants')
    .update({ is_active: nextVal, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    showToast(`Error al actualizar: ${error.message}`, 'error');
    return;
  }
  t.is_active = nextVal;
  updateKPIs();
  renderTenantsGrid();
  showToast(`Restaurante ${nextVal ? 'activado' : 'suspendido'} ✓`, 'success');
}

function renderModulesCheckboxes(enabledMap) {
  const cont = document.getElementById('modulesCheckboxesGrid');
  if (!cont) return;
  cont.innerHTML = MODULE_LABELS.map(m => {
    const checked = enabledMap[m.key] !== false;
    return `
      <label class="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-amber-50/40 cursor-pointer">
        <input type="checkbox" data-mod-key="${m.key}" ${checked ? 'checked' : ''} class="w-4 h-4 accent-amber-600 rounded">
        <span class="font-bold text-stone-800">${m.icon} ${m.label}</span>
      </label>
    `;
  }).join('');
}

export function applyModulePreset(presetName) {
  const allowed = new Set(MODULE_PRESETS[presetName] || MODULE_PRESETS.full);
  document.querySelectorAll('#modulesCheckboxesGrid input[data-mod-key]').forEach(cb => {
    cb.checked = allowed.has(cb.dataset.modKey);
  });
}

export function autoGenerateSlugIfNew() {
  const isEditing = Boolean(document.getElementById('editTenantId')?.value);
  if (isEditing) return;
  const name = document.getElementById('tenName')?.value || '';
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const slugEl = document.getElementById('tenSlug');
  if (slugEl) slugEl.value = slug;
}

export function syncBrandingPreview() {
  const logoUrl = document.getElementById('tenLogoUrl')?.value?.trim();
  const bannerUrl = document.getElementById('tenBannerUrl')?.value?.trim();

  const pLogo = document.getElementById('previewLogoImg');
  const pLogoEmpty = document.getElementById('previewLogoEmpty');
  if (logoUrl && pLogo && pLogoEmpty) {
    pLogo.src = logoUrl;
    pLogo.classList.remove('hidden');
    pLogoEmpty.classList.add('hidden');
  } else if (pLogo && pLogoEmpty) {
    pLogo.classList.add('hidden');
    pLogoEmpty.classList.remove('hidden');
  }

  const pBan = document.getElementById('previewBannerImg');
  const pBanEmpty = document.getElementById('previewBannerEmpty');
  if (bannerUrl && pBan && pBanEmpty) {
    pBan.src = bannerUrl;
    pBan.classList.remove('hidden');
    pBanEmpty.classList.add('hidden');
  } else if (pBan && pBanEmpty) {
    pBan.classList.add('hidden');
    pBanEmpty.classList.remove('hidden');
  }
}

export async function uploadTenantAsset(kind, inputEl) {
  const file = inputEl?.files?.[0];
  if (!file || !supa) return;

  const slug = (document.getElementById('tenSlug')?.value || 'negocio').trim().toLowerCase() || 'negocio';
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${slug}/${kind}-${Date.now()}.${ext}`;

  showToast(`Subiendo ${kind === 'logo' ? 'logotipo' : 'banner'}...`, 'info');
  const { error } = await supa.storage.from('branding').upload(path, file, { upsert: true });

  if (error) {
    showToast(`No se pudo subir imagen (${error.message}). Verifica el bucket "branding".`, 'error');
    return;
  }

  const { data: pub } = supa.storage.from('branding').getPublicUrl(path);
  const publicUrl = pub?.publicUrl || '';
  if (kind === 'logo') {
    document.getElementById('tenLogoUrl').value = publicUrl;
  } else {
    document.getElementById('tenBannerUrl').value = publicUrl;
  }
  syncBrandingPreview();
  showToast(`${kind === 'logo' ? 'Logotipo' : 'Banner'} subido correctamente ✓`, 'success');
}

export function openTenantModal(id) {
  const modal = document.getElementById('tenantEditorModal');
  if (!modal) return;
  const existing = id ? tenants.find(t => t.id === id) : null;

  document.getElementById('editTenantId').value = existing?.id || '';
  document.getElementById('tenantModalTitle').textContent = existing ? `Configurar: ${existing.name}` : 'Crear Nuevo Restaurante';
  document.getElementById('onboardingSection').classList.toggle('hidden', Boolean(existing));

  const theme = { ...DEFAULT_THEME_CONFIG, ...(existing?.theme_config || {}) };
  const mods = { ...DEFAULT_ENABLED_MODULES, ...(existing?.enabled_modules || {}) };

  document.getElementById('tenName').value = existing?.name || '';
  document.getElementById('tenSlug').value = existing?.slug || '';
  document.getElementById('tenBrandShort').value = theme.brandShort || '';
  document.getElementById('tenEmoji').value = theme.emoji || '🍽️';
  document.getElementById('tenPlan').value = existing?.plan_name || 'Pro';
  document.getElementById('tenDesc').value = existing?.description || '';
  document.getElementById('tenLogoUrl').value = existing?.logo_url || '';
  document.getElementById('tenBannerUrl').value = existing?.banner_url || '';
  document.getElementById('tenPrimaryColor').value = theme.primary || '#d97706';
  document.getElementById('tenAccentColor').value = theme.accent || '#1c1917';
  document.getElementById('tenCurrency').value = existing?.currency || 'MXN';
  document.getElementById('tenTaxRate').value = existing?.tax_rate ?? 0;
  document.getElementById('tenWhatsapp').value = existing?.whatsapp_number || '';
  document.getElementById('tenWifiSsid').value = existing?.wifi_ssid || '';
  document.getElementById('tenWifiPass').value = existing?.wifi_password || '';
  document.getElementById('tenIsActive').checked = existing ? existing.is_active !== false : true;

  const fLogo = document.getElementById('tenLogoFile');
  const fBan = document.getElementById('tenBannerFile');
  if (fLogo) fLogo.value = '';
  if (fBan) fBan.value = '';

  renderModulesCheckboxes(mods);
  syncBrandingPreview();
  modal.classList.remove('hidden');
}

export function closeTenantModal() {
  document.getElementById('tenantEditorModal')?.classList.add('hidden');
}

export async function saveTenantForm() {
  if (!supa) return;
  const editId = document.getElementById('editTenantId').value.trim();
  const name = document.getElementById('tenName').value.trim();
  const slug = document.getElementById('tenSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (!name || !slug) {
    showToast('Nombre y Slug URL son obligatorios.', 'warning');
    return;
  }

  const enabled_modules = {};
  document.querySelectorAll('#modulesCheckboxesGrid input[data-mod-key]').forEach(cb => {
    enabled_modules[cb.dataset.modKey] = cb.checked;
  });

  const payload = {
    name,
    slug,
    description: document.getElementById('tenDesc').value.trim(),
    plan_name: document.getElementById('tenPlan').value,
    logo_url: document.getElementById('tenLogoUrl').value.trim() || null,
    banner_url: document.getElementById('tenBannerUrl').value.trim() || null,
    currency: document.getElementById('tenCurrency').value,
    tax_rate: Number(document.getElementById('tenTaxRate').value || 0),
    whatsapp_number: document.getElementById('tenWhatsapp').value.trim() || null,
    wifi_ssid: document.getElementById('tenWifiSsid').value.trim() || null,
    wifi_password: document.getElementById('tenWifiPass').value.trim() || null,
    is_active: document.getElementById('tenIsActive').checked,
    theme_config: {
      primary: document.getElementById('tenPrimaryColor').value || '#d97706',
      accent: document.getElementById('tenAccentColor').value || '#1c1917',
      brandShort: document.getElementById('tenBrandShort').value.trim() || name.split(' ')[0].slice(0, 10),
      emoji: document.getElementById('tenEmoji').value.trim() || '🍽️'
    },
    enabled_modules,
    updated_at: new Date().toISOString()
  };

  const btn = document.getElementById('btnSaveTenant');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Guardando...';
  }

  try {
    if (editId) {
      const { error } = await supa.from('restaurants').update(payload).eq('id', editId);
      if (error) throw error;
      showToast(`Restaurante "${name}" actualizado ✓`, 'success');
    } else {
      const newId = generateUUID();
      const { error } = await supa.from('restaurants').insert([{ id: newId, ...payload }]);
      if (error) throw error;

      const tablesCount = Math.max(0, Math.min(60, parseInt(document.getElementById('onboardTablesCount')?.value || '8', 10)));
      if (tablesCount > 0) {
        const tableRows = Array.from({ length: tablesCount }, (_, i) => ({
          id: generateUUID(),
          restaurant_id: newId,
          table_number: String(i + 1).padStart(2, '0'),
          zone: 'Salón Principal',
          capacity: 4,
          status: 'available'
        }));
        await supa.from('tables').insert(tableRows);
      }

      const adminName = document.getElementById('onboardAdminName')?.value?.trim() || 'Admin General';
      const adminPin = /^\d{4}$/.test(document.getElementById('onboardAdminPin')?.value?.trim() || '')
        ? document.getElementById('onboardAdminPin').value.trim()
        : '1234';

      await supa.from('staff_members').insert([{
        id: generateUUID(),
        restaurant_id: newId,
        name: adminName,
        role: 'admin',
        pin: adminPin,
        is_active: true
      }]);

      if (document.getElementById('onboardCreateBaseCategories')?.checked) {
        await supa.from('categories').insert([
          { id: generateUUID(), restaurant_id: newId, name: 'Alimentos', icon: '🍽️' },
          { id: generateUUID(), restaurant_id: newId, name: 'Bebidas', icon: '🥤' },
          { id: generateUUID(), restaurant_id: newId, name: 'Postres', icon: '🍰' }
        ]);
      }

      showToast(`Restaurante "${name}" creado con ${tablesCount} mesas y PIN ${adminPin} ✓`, 'success');
    }

    closeTenantModal();
    await loadTenants();
  } catch (err) {
    showToast(`Error al guardar: ${err.message || err}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Guardar Restaurante ✓';
    }
  }
}

Object.assign(window, {
  handleMasterLogin,
  handleMasterLogout,
  loadTenants,
  renderTenantsGrid,
  copyTenantUrl,
  toggleTenantStatus,
  openTenantModal,
  closeTenantModal,
  saveTenantForm,
  applyModulePreset,
  autoGenerateSlugIfNew,
  syncBrandingPreview,
  uploadTenantAsset
});

async function bootMaster() {
  supa = initSupabaseClient();
  if (!supa) return;

  const { data } = await supa.auth.getSession();
  const user = data?.session?.user;
  if (user?.email) {
    const isMaster = await verifyIsMasterAdmin(user.email);
    if (isMaster) {
      showMasterApp(user.email);
      return;
    }
    await supa.auth.signOut();
  }
  showLoginScreen('');
}

bootMaster();
