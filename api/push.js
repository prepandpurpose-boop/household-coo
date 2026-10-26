// Household COO: phone reminders for chores.
// Two ways in:
//   1. The hourly job (x-cron-secret header, body {mode:'cron'}): finds chores that are past due and sends the reminders.
//      At the deadline the owner of the chore is reminded. A few hours later they are reminded again.
//      If it is still not done the next day, the parents are told too, and then every day after that until it is done.
//   2. The app (signed-in user, body {mode:'notify', task_id, event}): tells the right people right away when
//      a chore is assigned, a photo is sent in, a chore is approved, or a chore is sent back.
const webpush = require('web-push');

const SUPABASE_URL = 'https://utqgmylsdzoqovadrwbg.supabase.co';
const SUPABASE_PUBLISHABLE = 'sb_publishable_dycz1DniVdRUep8rh--RMw_qkYH_uac';
const SITE = 'https://app.provisionhouse.org';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const H = 3600 * 1000;

// The server key. A legacy service_role key is a JWT (starts with eyJ) and goes in both headers;
// a newer secret key (sb_secret_...) goes in the apikey header only.
function admin() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const h = { apikey: key, 'content-type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;
  return h;
}
async function fail(r, what) {
  const t = await r.text().catch(() => '');
  console.log('db', what, r.status, t.slice(0, 200));
  throw new Error('db ' + r.status);
}
async function get(path) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: admin() });
  if (!r.ok) await fail(r, 'get ' + path.split('?')[0]);
  return r.json();
}
async function patch(path, body) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { method: 'PATCH', headers: Object.assign(admin(), { Prefer: 'return=minimal' }), body: JSON.stringify(body) });
  if (!r.ok) await fail(r, 'patch');
}
async function del(path) {
  await fetch(SUPABASE_URL + '/rest/v1/' + path, { method: 'DELETE', headers: Object.assign(admin(), { Prefer: 'return=minimal' }) });
}

function ready() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  webpush.setVapidDetails('mailto:support@provisionhouse.org', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

// Send one message to every device of each person in `userIds`.
async function send(userIds, msg) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return 0;
  const subs = await get('push_subscriptions?select=id,endpoint,keys&user_id=in.(' + ids.join(',') + ')');
  let n = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), { TTL: 6 * 3600 });
      n++;
    } catch (e) {
      // 404 and 410 mean the phone removed the sign-up. Forget it.
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await del('push_subscriptions?id=eq.' + s.id);
    }
  }
  return n;
}

const name = (members, id) => { const m = members.find(x => x.user_id === id); return m ? (m.display_name || 'Someone') : 'Someone'; };
const parents = members => members.filter(m => m.role === 'owner' || m.role === 'adult').map(m => m.user_id);
const when = iso => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-US', { timeZone: process.env.HOUSEHOLD_TZ || 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
};

async function cron() {
  const now = Date.now();
  const tasks = await get('tasks?select=id,household_id,title,assigned_to,due_at,status,reminders,submitted_at&kind=eq.chore&status=in.(open,redo,submitted)&due_at=lte.' + encodeURIComponent(new Date(now).toISOString()));
  let sent = 0;
  const memCache = {};
  const membersOf = async hid => memCache[hid] || (memCache[hid] = await get('household_members?select=user_id,role,display_name&household_id=eq.' + hid));
  for (const t of tasks) {
    const r = Object.assign({}, t.reminders || {});
    const members = await membersOf(t.household_id);
    const due = new Date(t.due_at).getTime();
    const url = SITE + '/?page=chores';
    if (t.status === 'submitted') {
      // Waiting on a parent for a day or more: nudge the parents once a day.
      const sub = t.submitted_at ? new Date(t.submitted_at).getTime() : due;
      const last = r.wait ? new Date(r.wait).getTime() : sub;
      if (now - last >= 24 * H) {
        sent += await send(parents(members), { title: 'Waiting for your approval', body: name(members, t.assigned_to) + ' sent a photo for "' + t.title + '". Open it to approve.', url });
        r.wait = new Date(now).toISOString();
        await patch('tasks?id=eq.' + t.id, { reminders: r });
      }
      continue;
    }
    const who = name(members, t.assigned_to);
    let stage = null;
    if (!r.r1) stage = 'r1';
    else if (!r.r2 && now >= due + 3 * H) stage = 'r2';
    else if (!r.r3 && now >= due + 16 * H) stage = 'r3';
    else if (r.r3 && now - new Date(r.last || r.r3).getTime() >= 24 * H) stage = 'again';
    if (!stage) continue;
    if (stage === 'r1') sent += await send([t.assigned_to], { title: 'Chore due now', body: '"' + t.title + '" was due ' + when(t.due_at) + '. Do it, then send a photo in the app.', url });
    else if (stage === 'r2') sent += await send([t.assigned_to], { title: 'Still not done', body: '"' + t.title + '" is overdue. Send a photo when it is done.', url });
    else sent += await send([t.assigned_to].concat(parents(members)), { title: 'Overdue chore', body: '"' + t.title + '" (' + who + ') was due ' + when(t.due_at) + ' and is still not done.', url });
    r[stage === 'again' ? 'last' : stage] = new Date(now).toISOString();
    await patch('tasks?id=eq.' + t.id, { reminders: r });
  }
  return { checked: tasks.length, sent };
}

async function notify(user, body) {
  const id = String(body.task_id || '');
  if (!UUID.test(id)) return { error: 'Pick a chore.' };
  const t = (await get('tasks?select=id,household_id,title,assigned_to,due_at,status,redo_note&id=eq.' + id))[0];
  if (!t) return { error: 'That chore is gone.' };
  const members = await get('household_members?select=user_id,role,display_name&household_id=eq.' + t.household_id);
  const me = members.find(m => m.user_id === user.id);
  if (!me) return { error: 'Not your household.' };
  const isParent = me.role === 'owner' || me.role === 'adult';
  const url = SITE + '/?page=chores';
  const ev = String(body.event || '');
  let n = 0;
  if (ev === 'assigned' && isParent && t.assigned_to && t.assigned_to !== user.id) {
    n = await send([t.assigned_to], { title: 'New chore for you', body: '"' + t.title + '" is due ' + when(t.due_at) + '. Open it for the steps.', url });
  } else if (ev === 'submitted' && (t.assigned_to === user.id || isParent)) {
    n = await send(parents(members).filter(x => x !== user.id), { title: 'Photo sent in', body: name(members, user.id) + ' marked "' + t.title + '" done. Look at the photo and approve it.', url });
  } else if (ev === 'approved' && isParent && t.assigned_to) {
    n = await send([t.assigned_to], { title: 'Approved', body: '"' + t.title + '" is approved. Thank you.', url });
  } else if (ev === 'redo' && isParent && t.assigned_to) {
    n = await send([t.assigned_to], { title: 'Sent back', body: '"' + t.title + '" needs to be done again today.' + (t.redo_note ? ' ' + t.redo_note : ''), url });
  } else return { error: 'Nothing to send.' };
  return { sent: n };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (!ready()) return res.status(500).json({ error: 'Reminders are not set up yet.' });
    const body = req.body || {};
    if (body.mode === 'cron') {
      if (!process.env.CRON_SECRET || req.headers['x-cron-secret'] !== process.env.CRON_SECRET) return res.status(401).json({ error: 'No.' });
      return res.status(200).json(await cron());
    }
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const who = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: 'Bearer ' + token } });
    if (!who.ok) return res.status(401).json({ error: 'Please sign in again.' });
    const out = await notify(await who.json(), body);
    return res.status(out.error ? 400 : 200).json(out);
  } catch (e) {
    console.log('push error', e && e.message);
    return res.status(500).json({ error: 'Could not send that.' });
  }
};
