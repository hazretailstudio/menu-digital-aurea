/**
 * Valida horarios JSONB en America/Mexico_City para reflejar disponibilidad en UI.
 * La validación definitiva siempre ocurre en PostgreSQL (create_order).
 */
export function isWithinScheduleUI(schedule, timeZone = 'America/Mexico_City') {
  if (!schedule || typeof schedule !== 'object' || Object.keys(schedule).length === 0) {
    return true;
  }

  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const dowMap = { Sun: '0', Mon: '1', Tue: '2', Wed: '3', Thu: '4', Fri: '5', Sat: '6' };
  const dow = dowMap[parts.weekday];
  const currentTime = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;

  const slots = schedule[dow];
  if (!Array.isArray(slots) || slots.length === 0) return false;

  return slots.some(slot => currentTime >= slot.open && currentTime <= slot.close);
}

/**
 * Valida y calcula precio de modificadores avanzados (ADDITIVE, OVERRIDE, FREE_UP_TO_N)
 * con fallback automático a product_modifiers legacy de tu Admin V2.
 */
export function validateAndPriceModifiers(product, modifierGroups = [], legacyModifiers = [], selections = []) {
  const errors = [];
  let basePrice = Number(product.price || 0);
  let modifiersTotal = 0;
  const normalizedSelections = [];

  if (modifierGroups && modifierGroups.length > 0) {
    for (const group of modifierGroups) {
      const groupPicks = selections.filter(s => s.group_id === group.id && Number(s.qty || 1) > 0);
      const totalQty = groupPicks.reduce((acc, s) => acc + Number(s.qty || 1), 0);

      if (group.is_required && totalQty < Math.max(group.min_selections || 1, 1)) {
        errors.push(`"${group.name}" es obligatorio (mínimo ${Math.max(group.min_selections || 1, 1)}).`);
        continue;
      }
      if (totalQty < (group.min_selections || 0)) {
        errors.push(`Selecciona al menos ${group.min_selections} en "${group.name}".`);
        continue;
      }
      if (totalQty > (group.max_selections || 1)) {
        errors.push(`Máximo ${group.max_selections} selecciones en "${group.name}".`);
        continue;
      }

      let freeRemaining = Number(group.free_up_to || 0);

      for (const pick of groupPicks) {
        const opt = (group.modifier_options || []).find(o => o.id === pick.option_id);
        if (!opt || opt.is_available === false) {
          errors.push(`Una opción elegida en "${group.name}" no está disponible.`);
          continue;
        }
        const qty = Number(pick.qty || 1);
        if (qty > (group.max_qty_per_option || 1)) {
          errors.push(`Máximo ${group.max_qty_per_option} unidades de "${opt.name}".`);
          continue;
        }

        if (group.pricing_type === 'OVERRIDE') {
          basePrice = Number(opt.price);
        } else if (group.pricing_type === 'FREE_UP_TO_N') {
          const chargeable = Math.max(0, qty - freeRemaining);
          freeRemaining = Math.max(0, freeRemaining - qty);
          modifiersTotal += Number(opt.price) * chargeable;
        } else {
          modifiersTotal += Number(opt.price) * qty;
        }

        normalizedSelections.push({
          group_id: group.id,
          option_id: opt.id,
          name: opt.name,
          qty,
          price: Number(opt.price)
        });
      }
    }
  } else {
    for (const pick of selections) {
      const m = legacyModifiers.find(x => x.id === (pick.option_id || pick.id));
      if (!m) continue;
      const qty = Number(pick.qty || 1);
      modifiersTotal += Number(m.price || 0) * qty;
      normalizedSelections.push({
        id: m.id,
        option_id: m.id,
        name: m.name,
        qty,
        price: Number(m.price || 0)
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    unitPrice: Number((basePrice + modifiersTotal).toFixed(2)),
    selectedModifiers: normalizedSelections
  };
}
