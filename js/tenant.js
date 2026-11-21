import {
  DEFAULT_REST_ID,
  DEFAULT_SLUG,
  getRequestedRestaurantSlug,
  setActiveRestaurantId
} from './config.js';

export const ALL_MODULE_KEYS = [
  'tables', 'orders', 'inventory', 'promos', 'products', 'cashbox',
  'calls', 'reservations', 'analytics', 'taxonomies', 'staff', 'marketing'
];

export const DEFAULT_ENABLED_MODULES = Object.fromEntries(
  ALL_MODULE_KEYS.map(k => [k, true])
);

export const DEFAULT_THEME_CONFIG = {
  primary: '#d97706',
  accent: '#1c1917',
  brandShort: 'Áurea',
  emoji: '☕'
};

export let activeTenant = null;

export function normalizeTenant(row) {
  const theme = {
    ...DEFAULT_THEME_CONFIG,
    ...(row?.theme_config && typeof row.theme_config === 'object' ? row.theme_config : {})
  };
  const modules = {
    ...DEFAULT_ENABLED_MODULES,
    ...(row?.enabled_modules && typeof row.enabled_modules === 'object' ? row.enabled_modules : {})
  };
  return {
    id: row?.id || DEFAULT_REST_ID,
    slug: row?.slug || DEFAULT_SLUG,
    name: row?.name || 'Café & Bistro Áurea',
    description: row?.description || 'Menú interactivo y servicio en mesa.',
    logo_url: row?.logo_url || '',
    banner_url: row?.banner_url || '',
    wifi_ssid: row?.wifi_ssid || '',
    wifi_password: row?.wifi_password || '',
    whatsapp_number: row?.whatsapp_number || '',
    currency: row?.currency || 'MXN',
    tax_rate: Number(row?.tax_rate || 0),
    plan_name: row?.plan_name || 'Pro',
    is_active: row?.is_active !== false,
    google_maps_embed: row?.google_maps_embed || '',
    theme_config: theme,
    enabled_modules: modules
  };
}

export async function resolveTenant(supabaseClient) {
  const slug = getRequestedRestaurantSlug();
  let row = null;

  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('restaurants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (!error && data) {
      row = data;
    } else if (slug === DEFAULT_SLUG) {
      const fallback = await supabaseClient
        .from('restaurants')
        .select('*')
        .eq('id', DEFAULT_REST_ID)
        .maybeSingle();
      if (!fallback.error && fallback.data) row = fallback.data;
    }
  }

  if (!row && slug !== DEFAULT_SLUG) {
    activeTenant = null;
    return { notFound: true, slug, tenant: null };
  }

  activeTenant = normalizeTenant(row);
  setActiveRestaurantId(activeTenant.id);
  window.activeTenant = activeTenant;
  return { notFound: false, slug: activeTenant.slug, tenant: activeTenant };
}

export function isTenantModuleEnabled(tabId) {
  if (!activeTenant || !activeTenant.enabled_modules) return true;
  if (!(tabId in activeTenant.enabled_modules)) return true;
  return activeTenant.enabled_modules[tabId] !== false;
}

export function applyTenantBrandingToAdmin(tenant) {
  if (!tenant) return;
  document.title = `Panel POS & KDS - ${tenant.name}`;

  const primary = tenant.theme_config?.primary || '#d97706';
  const accent = tenant.theme_config?.accent || '#1c1917';
  document.documentElement.style.setProperty('--brand-primary', primary);
  document.documentElement.style.setProperty('--brand-accent', accent);

  const logoBtn = document.getElementById('brandLogoBtn');
  if (logoBtn) {
    logoBtn.style.backgroundColor = accent;
    logoBtn.style.borderColor = primary;
  }

  const logoImg = document.getElementById('brandLogoImg');
  const logoFallback = document.getElementById('brandLogoFallback');
  const brandEmoji = document.getElementById('brandEmoji');
  const brandShort = document.getElementById('brandShortName');

  if (tenant.logo_url && logoImg && logoFallback) {
    logoImg.src = tenant.logo_url;
    logoImg.alt = tenant.name;
    logoImg.classList.remove('hidden');
    logoFallback.classList.add('hidden');
  } else {
    if (logoImg) logoImg.classList.add('hidden');
    if (logoFallback) logoFallback.classList.remove('hidden');
    if (brandEmoji) brandEmoji.textContent = tenant.theme_config?.emoji || '🍽️';
    if (brandShort) {
      const shortText = tenant.theme_config?.brandShort || tenant.name.split(' ')[0] || 'POS';
      brandShort.textContent = shortText.slice(0, 10);
      brandShort.style.color = primary;
    }
  }

  const qrLink = document.getElementById('homeMenuQrLink');
  if (qrLink) {
    qrLink.href = `index.html?r=${encodeURIComponent(tenant.slug)}&mesa=01`;
  }
}

export function applyTenantBrandingToMenu(tenant) {
  if (!tenant) return;
  document.title = `Menú Interactivo - ${tenant.name}`;

  const nameEl = document.getElementById('restName');
  const descEl = document.getElementById('restDesc');
  const logoEl = document.getElementById('restLogo');
  const bannerEl = document.getElementById('restBanner');

  if (nameEl) nameEl.textContent = tenant.name;
  if (descEl && tenant.description) descEl.textContent = tenant.description;
  if (logoEl && tenant.logo_url) logoEl.src = tenant.logo_url;
  if (bannerEl && tenant.banner_url) bannerEl.src = tenant.banner_url;
}

export function showTenantBlockOverlay(title, message) {
  let el = document.getElementById('tenantSuspendedOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tenantSuspendedOverlay';
    el.className = 'fixed inset-0 z-[200] bg-stone-950/95 backdrop-blur-md flex items-center justify-center p-6 text-center';
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="bg-white max-w-md w-full rounded-3xl p-8 shadow-2xl space-y-4">
      <div class="w-16 h-16 rounded-2xl bg-rose-100 text-rose-700 mx-auto flex items-center justify-center text-3xl">⛔</div>
      <h1 class="text-xl font-extrabold text-stone-900">${title}</h1>
      <p class="text-sm text-stone-600 leading-relaxed">${message}</p>
    </div>
  `;
}
