export function buildWhatsAppOrderUrl({
  whatsappNumber,
  restaurantName,
  orderResult,
  orderType,
  tableLabel,
  customerName,
  deliveryAddress,
  deliveryLat,
  deliveryLng,
  paymentMethod,
  cashTendered,
  requiresCardTerminal,
  customerNotes
}) {
  const cleanPhone = String(whatsappNumber || '').replace(/\D/g, '');
  const lines = [];

  lines.push(`🍽️ *NUEVO PEDIDO #${orderResult.order_number || ''}* — ${restaurantName}`);
  const modeLabel = orderType === 'DINE_IN'
    ? `En Mesa (${tableLabel})`
    : (orderType === 'DELIVERY' ? 'Envío a Domicilio' : 'Recoger en Sucursal');
  lines.push(`📌 *Modalidad:* ${modeLabel}`);

  if (customerName) lines.push(`👤 *Cliente:* ${customerName}`);

  if (orderType === 'DELIVERY') {
    if (deliveryAddress) lines.push(`📍 *Dirección:* ${deliveryAddress}`);
    if (deliveryLat && deliveryLng) {
      lines.push(`🗺️ *Ubicación:* https://www.google.com/maps?q=${deliveryLat},${deliveryLng}`);
    }
  }

  lines.push('');
  lines.push('🧾 *DETALLE POR COMENSAL:*');

  const grouped = {};
  for (const item of orderResult.items_snapshot || []) {
    const g = item.guest_name || 'General';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(item);
  }

  for (const [guest, items] of Object.entries(grouped)) {
    const guestSub = Number(orderResult.guest_subtotals?.[guest] || 0).toFixed(2);
    lines.push(`\n👤 *${guest}* ($${guestSub})`);
    for (const item of items) {
      lines.push(`  • ${item.qty}x ${item.title} — $${Number(item.line_total).toFixed(2)}`);
      if (item.modifiers?.length) {
        const modText = item.modifiers.map(m => `${m.qty > 1 ? `${m.qty}x ` : ''}${m.name}`).join(', ');
        lines.push(`     ↳ _${modText}_`);
      }
      if (item.note || item.notes) lines.push(`     📝 _Nota: ${item.note || item.notes}_`);
    }
  }

  lines.push('');
  lines.push(`Subtotal: $${Number(orderResult.subtotal).toFixed(2)} MXN`);
  if (Number(orderResult.delivery_fee) > 0) {
    lines.push(`🛵 Envío: $${Number(orderResult.delivery_fee).toFixed(2)} MXN`);
  }
  lines.push(`💰 *TOTAL: $${Number(orderResult.total).toFixed(2)} MXN*`);

  lines.push('');
  if (paymentMethod === 'CASH') {
    lines.push('💵 *Pago:* Efectivo');
    if (cashTendered) {
      lines.push(`   Paga con: $${Number(cashTendered).toFixed(2)} MXN`);
      lines.push(`   Cambio a llevar: $${Number(orderResult.change_due || 0).toFixed(2)} MXN`);
    }
  } else if (paymentMethod === 'CARD_TERMINAL' || requiresCardTerminal) {
    lines.push('💳 *Pago:* Tarjeta (Llevar Terminal Física TPV)');
  } else if (paymentMethod === 'TRANSFER') {
    lines.push('🏦 *Pago:* Transferencia SPEI');
  } else {
    lines.push('💳 *Pago:* En línea');
  }

  if (customerNotes) lines.push(`💬 *Notas:* ${customerNotes}`);

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function buildTicketWhatsAppUrl(restaurantName, tableLabel, activeOrder) {
  const items = Array.isArray(activeOrder?.items_snapshot) && activeOrder.items_snapshot.length > 0
    ? activeOrder.items_snapshot
    : (Array.isArray(activeOrder?.items) ? activeOrder.items : []);

  const lines = [
    `*${restaurantName || 'Restaurante'}*`,
    `${tableLabel} | Orden #${activeOrder.order_number || (activeOrder.id || '').substring(0, 6).toUpperCase()}`,
    '----------------------------',
    ...items.map(it => `${it.qty}x ${it.title} - $${(Number(it.price || it.unit_price) * Number(it.qty)).toFixed(2)}`),
    '----------------------------',
    `*TOTAL: $${Number(activeOrder.total || 0).toFixed(2)} MXN*`
  ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}
