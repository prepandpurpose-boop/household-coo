// Household COO: Stripe tells us who has paid. Verifies Stripe's signature, then records the household's plan status and next billing date.
const crypto = require('crypto');

const SUPABASE_URL = 'https://utqgmylsdzoqovadrwbg.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verify(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = {};
  String(header).split(',').forEach(p => { const i = p.indexOf('='); if (i > 0) { (parts[p.slice(0, i)] = parts[p.slice(0, i)] || []).push(p.slice(i + 1)); } });
  const t = (parts.t || [])[0];
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(t + '.' + raw.toString('utf8')).digest('hex');
  return (parts.v1 || []).some(sig => {
    try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); } catch (e) { return false; }
  });
}

async function db(path, method, body, extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' }, extra || {}),
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) { console.log('db error', r.status, (await r.text()).slice(0, 200)); throw new Error('db'); }
}

// Stripe sends the end of the current billing period as seconds since 1970.
// Newer Stripe versions put it on the subscription item instead of the subscription.
function periodEnd(sub) {
  const secs = sub && (sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end));
  return secs ? new Date(Number(secs) * 1000).toISOString() : null;
}

// After checkout, ask Stripe for the subscription so the next billing date is saved right away.
// Needs STRIPE_SECRET_KEY in Vercel. If it is not set, the date is saved when Stripe sends its next subscription event.
async function fetchPeriodEnd(subscriptionId) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !subscriptionId) return null;
  try {
    const r = await fetch('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(subscriptionId), { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) return null;
    return periodEnd(await r.json());
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const raw = await readRaw(req);
    if (!verify(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).json({ error: 'Bad signature' });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Not set up' });
    const ev = JSON.parse(raw.toString('utf8'));
    const o = (ev.data && ev.data.object) || {};

    if (ev.type === 'checkout.session.completed' && o.mode === 'subscription' && UUID.test(o.client_reference_id || '')) {
      const plan = (o.amount_total || 0) >= 99700 ? 'yearly' : 'monthly';
      const row = { household_id: o.client_reference_id, status: 'active', stripe_customer: o.customer || null, plan, updated_at: new Date().toISOString() };
      const end = await fetchPeriodEnd(o.subscription);
      if (end) row.current_period_end = end;
      await db('subscriptions?on_conflict=household_id', 'POST', row, { Prefer: 'resolution=merge-duplicates,return=minimal' });
    } else if ((ev.type === 'customer.subscription.created' || ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') && o.customer) {
      const status = ev.type === 'customer.subscription.deleted' ? 'canceled' : (o.status || 'active');
      const patch = { status, updated_at: new Date().toISOString() };
      const end = periodEnd(o);
      if (end) patch.current_period_end = end;
      await db('subscriptions?stripe_customer=eq.' + encodeURIComponent(o.customer), 'PATCH', patch, { Prefer: 'return=minimal' });
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: 'Could not record that.' });
  }
};

module.exports.config = { api: { bodyParser: false } };
