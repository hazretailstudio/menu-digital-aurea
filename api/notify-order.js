export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secret = req.headers['x-webhook-secret'];
  if (process.env.SUPABASE_WEBHOOK_SECRET && secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }

  const { type, record, old_record } = req.body || {};
  if (!record || !record.id) {
    return res.status(400).json({ error: 'Invalid Supabase webhook payload' });
  }

  const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
  const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return res.status(500).json({ error: 'Missing OneSignal environment variables' });
  }

  const notificationsToSend = [];

  // Nuevo pedido -> Notifica a cocina/caja y abre directo tu panel /admin
  if (type === 'INSERT') {
    notificationsToSend.push({
      app_id: ONESIGNAL_APP_ID,
      filters: [
        { field: 'tag', key: 'restaurant_id', relation: '=', value: record.restaurant_id },
        { operator: 'AND' },
        { field: 'tag', key: 'role', relation: '=', value: 'kitchen' }
      ],
      headings: { es: `🔔 Nueva Comanda #${record.order_number || ''}`, en: `New Order #${record.order_number || ''}` },
      contents: {
        es: `${record.order_type || 'Mesa'} · ${record.table_number} — Total $${Number(record.total || 0).toFixed(2)} MXN`,
        en: `${record.order_type || 'Table'} · ${record.table_number} — Total $${Number(record.total || 0).toFixed(2)}`
      },
      data: { order_id: record.id, status: record.status, restaurant_id: record.restaurant_id },
      url: '/admin'
    });
  }

  // Cambio de estado en Comandas del Admin -> Notifica al cliente si se suscribió
  if (type === 'UPDATE' && old_record?.status !== record.status && record.onesignal_player_id) {
    const statusMessages = {
      preparing: '🔥 Tu pedido ya está en preparación en cocina.',
      delivered: '✅ ¡Tu pedido está listo!',
      paid: '✓ Gracias por tu visita. Tu cuenta fue liquidada.'
    };

    const bodyText = statusMessages[record.status];
    if (bodyText) {
      notificationsToSend.push({
        app_id: ONESIGNAL_APP_ID,
        include_subscription_ids: [record.onesignal_player_id],
        headings: { es: `Pedido #${record.order_number || ''}`, en: `Order #${record.order_number || ''}` },
        contents: { es: bodyText, en: bodyText },
        data: { order_id: record.id, status: record.status }
      });
    }
  }

  if (notificationsToSend.length === 0) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  try {
    const results = await Promise.all(
      notificationsToSend.map(async (payload) => {
        const response = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Key ${ONESIGNAL_REST_API_KEY}`
          },
          body: JSON.stringify(payload)
        });
        return { status: response.status, body: await response.json() };
      })
    );

    return res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error('OneSignal error:', err);
    return res.status(500).json({ error: 'Failed to dispatch OneSignal notification' });
  }
}
