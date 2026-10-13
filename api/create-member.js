// Household COO: a parent creates the sign-in for a person they added, so that person never has to create an account.
// Only a parent or owner can use it, and only for an email on their household's waiting list.
// It never changes the password of someone who has already signed in.
const SUPABASE_URL = 'https://utqgmylsdzoqovadrwbg.supabase.co';
const SUPABASE_PUBLISHABLE = 'sb_publishable_dycz1DniVdRUep8rh--RMw_qkYH_uac';
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
    const email = lc(body.email), hid = String(body.household_id || ''), password = String(body.password || '');
    if (!UUID.test(hid) || (!body.user_id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) return res.status(400).json({ error: 'That email does not look right.' });
    if (password.length < 8) return res.status(400).json({ error: 'The password needs at least 8 characters.' });

    const mem = await fetch(SUPABASE_URL + '/rest/v1/household_members?select=role&user_id=eq.' + encodeURIComponent(user.id) + '&household_id=eq.' + encodeURIComponent(hid), { headers: asUser });
    const rows = mem.ok ? await mem.json() : [];
    if (!rows.some(m => m.role === 'owner' || m.role === 'adult')) return res.status(403).json({ error: 'Only parents can do this.' });

    // A person already in the household as Staff or Helper (like the TV screen) can get a new password from a parent.
    if (body.user_id) {
      const uid = String(body.user_id);
      if (!UUID.test(uid)) return res.status(400).json({ error: 'Pick a person.' });
      const key0 = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!key0) return res.status(500).json({ error: 'This is not set up yet.' });
      const admin0 = { apikey: key0, Authorization: 'Bearer ' + key0, 'content-type': 'application/json' };
      const m2 = await fetch(SUPABASE_URL + '/rest/v1/household_members?select=role&user_id=eq.' + encodeURIComponent(uid) + '&household_id=eq.' + encodeURIComponent(hid), { headers: asUser });
      const r2 = m2.ok ? await m2.json() : [];
      if (!r2.some(x => x.role === 'staff' || x.role === 'helper')) return res.status(403).json({ error: 'You can only do this for Staff and Helpers.' });
      const up0 = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + uid, { method: 'PUT', headers: admin0, body: JSON.stringify({ password, email_confirm: true }) });
      return res.status(200).json({ status: up0.ok ? 'updated' : 'failed' });
    }

    const inv = await fetch(SUPABASE_URL + '/rest/v1/household_invites?select=email&household_id=eq.' + encodeURIComponent(hid), { headers: asUser });
    const list = inv.ok ? await inv.json() : [];
    if (!list.some(i => lc(i.email) === email)) return res.status(404).json({ error: 'That person is not on your waiting list.' });

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(500).json({ error: 'This is not set up yet.' });
    const admin = { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' };

    const made = await fetch(SUPABASE_URL + '/auth/v1/admin/users', { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) });
    if (made.ok) return res.status(200).json({ status: 'created' });

    const txt = (await made.text()).toLowerCase();
    console.log('create-member', made.status, txt.slice(0, 200));
    if (made.status === 422 || txt.includes('already') || txt.includes('exists')) {
      // The login exists. Only reset it if that person has never signed in.
      const all = await fetch(SUPABASE_URL + '/auth/v1/admin/users?per_page=1000', { headers: admin });
      const j = all.ok ? await all.json() : {};
      const found = (j.users || []).find(u => lc(u.email) === email);
      if (found && !found.last_sign_in_at) {
        const up = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + found.id, { method: 'PUT', headers: admin, body: JSON.stringify({ password, email_confirm: true }) });
        if (up.ok) return res.status(200).json({ status: 'updated' });
      }
      return res.status(200).json({ status: 'exists' });
    }
    return res.status(200).json({ status: 'failed' });
  } catch (e) {
    console.log('create-member crash', e && e.message);
    return res.status(200).json({ status: 'failed' });
  }
};
