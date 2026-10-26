// Household COO: sends the invitation email when a parent adds a person.
// Only a parent or owner of the household can use this, and only for an email that is on the household's waiting list.
const SUPABASE_URL = 'https://utqgmylsdzoqovadrwbg.supabase.co';
const SUPABASE_PUBLISHABLE = 'sb_publishable_dycz1DniVdRUep8rh--RMw_qkYH_uac';
const SITE = 'https://app.provisionhouse.org';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lc = s => String(s || '').trim().toLowerCase();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const asUser = { apikey: SUPABASE_PUBLISHABLE, Authorization: 'Bearer ' + token };
    const who = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: asUser });
    if (!who.ok) return res.status(401).json({ error: 'Please sign in again.' });
    const user = await who.json();

    const body = req.body || {};
    const email = lc(body.email), hid = String(body.household_id || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !UUID.test(hid)) return res.status(400).json({ error: 'That email does not look right.' });

    // The caller must be a parent or owner of this household.
    const mem = await fetch(SUPABASE_URL + '/rest/v1/household_members?select=role&user_id=eq.' + encodeURIComponent(user.id) + '&household_id=eq.' + encodeURIComponent(hid), { headers: asUser });
    const rows = mem.ok ? await mem.json() : [];
    if (!rows.some(m => m.role === 'owner' || m.role === 'adult')) return res.status(403).json({ error: 'Only parents can send invitations.' });

    // The email must already be waiting on the household's list.
    const inv = await fetch(SUPABASE_URL + '/rest/v1/household_invites?select=email&household_id=eq.' + encodeURIComponent(hid), { headers: asUser });
    const list = inv.ok ? await inv.json() : [];
    if (!list.some(i => lc(i.email) === email)) return res.status(404).json({ error: 'That person is not on your waiting list.' });

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(500).json({ error: 'Invitations are not set up yet.' });
    const r = await fetch(SUPABASE_URL + '/auth/v1/invite?redirect_to=' + encodeURIComponent(SITE), {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (r.ok) return res.status(200).json({ status: 'sent' });
    const txt = (await r.text()).toLowerCase();
    console.log('invite error', r.status, txt.slice(0, 200));
    if (r.status === 429 || txt.includes('rate limit')) return res.status(200).json({ status: 'limit' });
    if (txt.includes('already') || txt.includes('exists') || r.status === 422) return res.status(200).json({ status: 'exists' });
    return res.status(200).json({ status: 'failed' });
  } catch (e) {
    console.log('invite crash', e && e.message);
    return res.status(200).json({ status: 'failed' });
  }
};
