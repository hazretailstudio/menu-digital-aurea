import { REST_ID, generateUUID, escapeHtml, showToast } from '../config.js';
import { state, client, dbWrite, logAudit } from '../state.js';

let pinBuffer = '';
let pinMode = 'switch'; // 'switch' | 'authorize'
let pinRequiredRoles = [];
let pinCallback = null;
let pinSubtitle = '';

export const ROLE_META = {
  admin: { label: '👑 Administrador', tabs: ['tables', 'orders', 'calls', 'reservations', 'cashbox', 'inventory', 'products', 'taxonomies', 'promos', 'analytics', 'marketing', 'staff'] },
  management: { label: '📊 Gerencia & Costes', tabs: ['tables', 'orders', 'cashbox', 'inventory', 'products', 'taxonomies', 'promos', 'analytics', 'marketing', 'staff'] },
  cashier: { label: '💵 Caja & Barra', tabs: ['tables', 'orders', 'calls', 'cashbox', 'reservations'] },
  waiter: { label: '🛎️ Mesero / Sala', tabs: ['tables', 'orders', 'calls', 'reservations'] },
  kitchen: { label: '🍳 Cocina / KDS', tabs: ['orders', 'inventory'] }
};

export function ensurePinModal() {
  if (document.getElementById('pinPadModal')) return;
  const modal = document.createElement('div');
  modal.id = 'pinPadModal';
  modal.className = 'fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl space-y-4">
      <div class="flex justify-between items-start border-b pb-3">
        <div>
          <h3 id="pinModalTitle" class="font-extrabold text-base text-stone-900">🔐 Ingresa tu PIN</h3>
          <p id="pinModalSub" class="text-[11px] text-stone-500 mt-0.5">Identifícate para cambiar de estación</p>
        </div>
        <button onclick="window.closePinModal()" class="text-stone-400 hover:text-stone-700 font-bold text-lg">✕</button>
      </div>

      <div class="bg-stone-100 rounded-2xl p-3 text-center">
        <div id="pinDotsDisplay" class="text-2xl tracking-[0.6em] font-mono font-black text-stone-900 h-8 flex items-center justify-center">••••</div>
        <p id="pinErrorMsg" class="text-[11px] text-rose-600 font-bold min-h-[16px] mt-1"></p>
      </div>

      <div class="grid grid-cols-3 gap-2 text-base font-black">
        ${[1,2,3,4,5,6,7,8,9].map(n => `
          <button onclick="window.pressPinDigit('${n}')" class="py-3 rounded-2xl bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-900 transition">${n}</button>
        `).join('')}
        <button onclick="window.clearPinInput()" class="py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition">Borrar</button>
        <button onclick="window.pressPinDigit('0')" class="py-3 rounded-2xl bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-900 transition">0</button>
        <button onclick="window.submitPinCode()" class="py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition">Entrar ✓</button>
      </div>

      <div id="pinDemoHint" class="bg-stone-50 border border-stone-200 rounded-xl p-2 text-[10px] text-stone-500 leading-relaxed">
        <b>PINs iniciales:</b> Admin <code>1234</code> • Gerente <code>2222</code> • Cocina <code>3333</code> • Mesero <code>4444</code> • Caja <code>6666</code>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export function openSwitchStaffPinModal() {
  ensurePinModal();
  pinBuffer = '';
  pinMode = 'switch';
  pinRequiredRoles = [];
  pinCallback = null;
  document.getElementById('pinModalTitle').innerText = '🔐 Cambiar Estación / Usuario';
  document.getElementById('pinModalSub').innerText = 'Teclea tu PIN de 4 dígitos para activar tu turno.';
  document.getElementById('pinErrorMsg').innerText = '';
  updatePinDots();
  document.getElementById('pinPadModal').classList.remove('hidden');
}

/**
 * Solicita autorización por PIN (Admin o Gerente) antes de ejecutar una acción sensible
 */
export function requirePinAuthorization(reasonText, allowedRoles, onAuthorized) {
  const curRole = state.activeStaff?.role;
  // Si el usuario actual ya tiene privilegio suficiente y solo queremos registrar auditoría rápida
  if (allowedRoles.includes(curRole)) {
    onAuthorized(state.activeStaff);
    return;
  }
  ensurePinModal();
  pinBuffer = '';
  pinMode = 'authorize';
  pinRequiredRoles = allowedRoles;
  pinCallback = onAuthorized;
  pinSubtitle = reasonText;
  document.getElementById('pinModalTitle').innerText = '🛡️ Autorización Requerida';
  document.getElementById('pinModalSub').innerText = reasonText;
  document.getElementById('pinErrorMsg').innerText = '';
  updatePinDots();
  document.getElementById('pinPadModal').classList.remove('hidden');
}

export function closePinModal() {
  const m = document.getElementById('pinPadModal');
  if (m) m.classList.add('hidden');
  pinBuffer = '';
  pinCallback = null;
}

export function pressPinDigit(d) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += d;
  updatePinDots();
  if (pinBuffer.length === 4) {
    setTimeout(submitPinCode, 120);
  }
}

export function clearPinInput() {
  pinBuffer = '';
  document.getElementById('pinErrorMsg').innerText = '';
  updatePinDots();
}

function updatePinDots() {
  const el = document.getElementById('pinDotsDisplay');
  if (!el) return;
  el.innerText = '●'.repeat(pinBuffer.length) + '○'.repeat(4 - pinBuffer.length);
}

export function submitPinCode() {
  const staff = state.staff.find(s => s.is_active !== false && String(s.pin) === pinBuffer);
  if (!staff) {
    document.getElementById('pinErrorMsg').innerText = 'PIN incorrecto. Intenta de nuevo.';
    pinBuffer = '';
    updatePinDots();
    return;
  }

  if (pinMode === 'authorize') {
    if (pinRequiredRoles.length > 0 && !pinRequiredRoles.includes(staff.role)) {
      document.getElementById('pinErrorMsg').innerText = `${staff.name} no tiene permiso para autorizar esto.`;
      pinBuffer = '';
      updatePinDots();
      return;
    }
    const cb = pinCallback;
    closePinModal();
    showToast(`Autorizado por ${staff.name} ✓`, 'success');
    if (cb) cb(staff);
    return;
  }

  // Modo cambio de usuario / estación
  state.activeStaff = staff;
  sessionStorage.setItem('aurea_active_staff_id', staff.id);
  applyActiveStaffPermissions();
  closePinModal();
  showToast(`Sesión activa: ${staff.name} (${ROLE_META[staff.role]?.label || staff.role})`, 'success');
}

export function applyActiveStaffPermissions() {
  const staff = state.activeStaff || state.staff[0];
  if (!staff) return;
  const meta = ROLE_META[staff.role] || ROLE_META.admin;

  const badge = document.getElementById('topbarRoleBadge');
  if (badge) badge.innerText = `${meta.label} • ${staff.name}`;

  const sideUser = document.getElementById('activeStaffDisplay');
  if (sideUser) sideUser.innerText = `${staff.name}`;

  const sideRole = document.getElementById('activeRoleDisplay');
  if (sideRole) sideRole.innerText = meta.label;

  // Mostrar/ocultar botones de navegación según permisos
  document.querySelectorAll('[data-tab-id]').forEach(btn => {
    const tId = btn.getAttribute('data-tab-id');
    const allowed = meta.tabs.includes(tId);
    btn.classList.toggle('hidden', !allowed);
  });

  // Si la pestaña visible ya no está permitida, saltar a la primera permitida
  const currentActivePanel = document.querySelector('.tab-panel:not(.hidden)');
  const currentTabId = currentActivePanel ? currentActivePanel.id.replace('tab-', '') : null;
  if (!currentTabId || !meta.tabs.includes(currentTabId)) {
    if (window.switchTab) window.switchTab(meta.tabs[0]);
  }
}

// GESTIÓN DE PERSONAL (TAB STAFF)
export function renderStaffTab() {
  const tbody = document.getElementById('staffTableBody');
  if (!tbody) return;
  tbody.innerHTML = state.staff.map(s => `
    <tr class="hover:bg-stone-50 text-xs">
      <td class="py-2.5 font-bold text-stone-900">${escapeHtml(s.name)}</td>
      <td class="py-2.5">${ROLE_META[s.role]?.label || escapeHtml(s.role)}</td>
      <td class="py-2.5 font-mono font-bold text-amber-800">${escapeHtml(s.pin)}</td>
      <td class="py-2.5">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${s.is_active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-500'}">
          ${s.is_active !== false ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td class="py-2.5 flex gap-1.5">
        <button onclick="window.toggleStaffActive('${s.id}')" class="px-2 py-1 rounded-lg border text-[10px] font-bold hover:bg-stone-100">
          ${s.is_active !== false ? 'Desactivar' : 'Activar'}
        </button>
        <button onclick="window.deleteStaffMember('${s.id}')" class="px-2 py-1 rounded-lg border border-rose-200 text-rose-700 text-[10px] font-bold hover:bg-rose-50">
          Borrar
        </button>
      </td>
    </tr>
  `).join('');

  // Bitácora de auditoría reciente
  const auditBody = document.getElementById('auditLogsBody');
  if (auditBody) {
    if (state.auditLogs.length === 0) {
      auditBody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-stone-400">Sin eventos auditados aún.</td></tr>';
    } else {
      auditBody.innerHTML = state.auditLogs.slice(0, 30).map(a => `
        <tr class="text-xs text-stone-700">
          <td class="py-2 font-mono text-[11px] text-stone-500">${new Date(a.created_at).toLocaleString()}</td>
          <td class="py-2 font-bold text-stone-900">${escapeHtml(a.staff_name)}</td>
          <td class="py-2"><span class="bg-stone-100 border px-2 py-0.5 rounded-md font-mono text-[10px] font-bold">${escapeHtml(a.action)}</span></td>
          <td class="py-2 text-[11px] text-stone-600">${escapeHtml(typeof a.details === 'string' ? a.details : JSON.stringify(a.details))}</td>
        </tr>
      `).join('');
    }
  }
}

export async function createStaffMember() {
  const name = document.getElementById('newStaffName')?.value?.trim();
  const role = document.getElementById('newStaffRole')?.value || 'waiter';
  const pin = document.getElementById('newStaffPin')?.value?.trim();
  if (!name || !/^\d{4}$/.test(pin || '')) {
    showToast('Ingresa un nombre y un PIN numérico de exactamente 4 dígitos.', 'warning');
    return;
  }
  if (state.staff.some(s => String(s.pin) === pin && s.is_active !== false)) {
    showToast('Ese PIN ya está en uso por otro empleado.', 'warning');
    return;
  }
  const newMember = {
    id: generateUUID(),
    restaurant_id: REST_ID,
    name,
    role,
    pin,
    is_active: true,
    created_at: new Date().toISOString()
  };
  const { error } = await dbWrite(client.from('staff_members').insert([newMember]), 'crear empleado');
  if (error) return;

  state.staff.push(newMember);
  document.getElementById('newStaffName').value = '';
  document.getElementById('newStaffPin').value = '';
  renderStaffTab();
  await logAudit('create_staff', { name, role });
  showToast(`Empleado ${name} agregado ✓`, 'success');
}

export async function toggleStaffActive(id) {
  const s = state.staff.find(x => x.id === id);
  if (!s) return;
  const nextVal = s.is_active === false;
  const { error } = await dbWrite(client.from('staff_members').update({ is_active: nextVal }).eq('id', id), 'actualizar empleado');
  if (error) return;
  s.is_active = nextVal;
  renderStaffTab();
}

export async function deleteStaffMember(id) {
  if (state.activeStaff?.id === id) {
    showToast('No puedes eliminar el usuario con sesión activa.', 'warning');
    return;
  }
  if (!confirm('¿Eliminar este miembro del personal?')) return;
  const { error } = await dbWrite(client.from('staff_members').delete().eq('id', id), 'eliminar empleado');
  if (error) return;
  state.staff = state.staff.filter(x => x.id !== id);
  renderStaffTab();
  showToast('Personal eliminado ✓', 'info');
}
