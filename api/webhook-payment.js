export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const signature = req.headers['x-payment-signature'];
  if (process.env.PAYMENT_WEBHOOK_SECRET && signature !== process.env.PAYMENT_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid payment webhook signature' });
  }

  const { order_id, payment_status, payment_reference } = req.body || {};
  const allowedStatuses = ['PAID', 'FAILED', 'REFUNDED'];

  if (!order_id || !allowedStatuses.includes(payment_status)) {
    return res.status(400).json({ error: 'Missing or invalid order_id / payment_status' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase server credentials' });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        payment_status,
        payment_reference: payment_reference || null
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Supabase update failed', details: data });
    }

    return res.status(200).json({ ok: true, updated: data[0] || null });
  } catch (err) {
    console.error('Payment webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
