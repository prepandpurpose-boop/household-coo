// Household COO: Command Center. One place for the whole house.
// Shows tasks, appointments, birthdays, anniversaries, maintenance, and (for people who see money) bills and paydays.
(function () {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const pd = s => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const dayDiff = (a, b) => Math.round((pd(a) - pd(b)) / 86400000);
  const addDays = (ds, n) => { const d = pd(ds); d.setDate(d.getDate() + n); return iso(d); };
  const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const money = n => '$' + Math.round(+n || 0).toLocaleString();
  const TYPES = {
    todo: ['Task', '#2f5fa0'], appointment: ['Appointment', '#C59B27'], event: ['Event', '#C59B27'], birthday: ['Birthday', '#c0508a'],
    anniversary: ['Anniversary', '#8a5cc0'], maintenance: ['Maintenance', '#3a8a6a'],
    bill: ['Bill', '#14213d'], payday: ['Payday', '#2f8f4e']
  };
  const todayISO = () => iso(new Date());
  const tm = v => { if (!v) return ''; const p = String(v).split(':'), h = +p[0]; return ((h + 11) % 12 + 1) + ':' + pad(+p[1] || 0) + (h >= 12 ? ' PM' : ' AM'); };
  const canManage = () => S.me && ['owner', 'adult'].includes(S.me.role);
  const canAdd = () => canManage() || !!(S.cal && S.cal.perms && S.me && S.cal.perms[S.user.id]);
  const isKid = () => !!(S.me && S.me.role === 'kid');
  const moneyOK = () => S.me && S.me.can_see_money && S.mdata;

  const css = document.createElement('style');
  css.textContent = [
    '.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}',
    '.cal-h{font-size:12px;color:var(--mute);text-align:center;padding:4px 0;font-weight:600}',
    '.cal-d{min-height:78px;padding:5px;border:1px solid var(--line);border-radius:10px;background:#fff;text-align:left;cursor:pointer;overflow:hidden;display:block;width:100%}',
    '.cal-d.out{background:#f6f4ec;color:var(--mute)}.cal-d.today{border:2px solid var(--gold)}.cal-d.sel{background:#fff7dc}',
    '.cal-d b{font-size:13px}.cal-t{display:block;font-size:11px;line-height:1.25;margin-top:2px;padding:1px 4px;border-radius:5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.cal-more{font-size:11px;color:var(--mute);margin-top:2px}',
    '.cal-row{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--track)}.cal-row:first-child{border-top:0}',
    '.cal-tag{display:inline-block;color:#fff;font-size:11px;font-weight:600;border-radius:99px;padding:2px 9px;margin-right:6px}',
    '.cal-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}',
    '.cal-nav .btn{min-height:38px;padding:0 14px}',
    '.cal-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '@media(max-width:760px){.cal-d{min-height:60px}.cal-t{font-size:10px}.cal-two{grid-template-columns:1fr}}'
  ].join('');
  document.head.appendChild(css);

  window.loadCal = async function () {
    try {
      const { data } = await sb.from('app_data').select('data').eq('household_id', S.me.household_id).eq('module', 'calendar').maybeSingle();
      S.cal = (data && data.data) || {};
    } catch (e) { S.cal = {}; }
    if (!Array.isArray(S.cal.items)) S.cal.items = [];
    if (!S.cal.done) S.cal.done = {};
    if (!S.cal.perms) S.cal.perms = {};
    if (!S.calM) { const n = new Date(); S.calM = { y: n.getFullYear(), m: n.getMonth() }; }
    if (!S.calSel) S.calSel = todayISO();
  };
  async function saveCal() {
    const { error } = await sb.from('app_data').upsert({ household_id: S.me.household_id, module: 'calendar', data: S.cal, updated_at: new Date().toISOString() }, { onConflict: 'household_id,module' });
    if (error) alert(error.message);
  }

  function occurs(it, ds) {
    const b = it.date; if (!b || ds < b) return false;
    const r = it.repeat || 'none';
    if (r === 'none') return ds === b;
    const d = pd(ds), bd = pd(b), dom = Math.min(bd.getDate(), dim(d.getFullYear(), d.getMonth()));
    if (r === 'yearly') return d.getMonth() === bd.getMonth() && d.getDate() === dom;
    if (r === 'monthly') return d.getDate() === dom;
    if (r === 'weekly') return dayDiff(ds, b) % 7 === 0;
    if (r === 'months') {
      const n = Math.max(1, +it.every || 1), md = (d.getFullYear() - bd.getFullYear()) * 12 + d.getMonth() - bd.getMonth();
      return md % n === 0 && d.getDate() === dom;
    }
    return false;
  }
  function paydayOn(r, ds) {
    if (!r.anchor || !(+r.amount > 0)) return false;
    const a = pd(r.anchor), d = pd(ds);
    if (r.freq === 'weekly') return dayDiff(ds, r.anchor) % 7 === 0;
    if (r.freq === 'biweekly') return dayDiff(ds, r.anchor) % 14 === 0;
    return d.getDate() === Math.min(a.getDate(), dim(d.getFullYear(), d.getMonth()));
  }
  const who = id => { if (!id) return ''; if (id === S.user.id) return 'Me'; const m = S.members.find(x => x.user_id === id); return m ? (m.display_name || m.role) : 'Member'; };

  function itemsOn(ds, withMoney) {
    const out = [];
    (S.cal.items || []).forEach(it => {
      if (it.who && it.who !== S.user.id && !canManage()) return;
      if (!occurs(it, ds)) return;
      let title = it.title;
      if (it.type === 'birthday' || it.type === 'anniversary') {
        const y = pd(ds).getFullYear() - pd(it.date).getFullYear();
        if (y > 0) title += it.type === 'birthday' ? ' (turns ' + y + ')' : ' (' + y + ' years)';
      }
      const key = it.type === 'maintenance' ? 'm:' + it.id + '|' + ds : '';
      out.push({ type: it.type, title, who: it.who, rm: it.id, key, notes: it.notes, done: !!(key && S.cal.done[key]) });
    });
    (S.tasks || []).forEach(t => { if (t.due_date === ds) out.push({ type: t.kind === 'appointment' ? 'appointment' : 'todo', title: (t.due_time ? tm(t.due_time) + ' ' : '') + t.title, who: t.assigned_to, tid: t.id, notes: t.handoff_notes, done: t.status === 'done' }); });
    if (moneyOK()) {
      const d = pd(ds);
      (S.mdata.overhead || []).forEach(o => {
        if (o.action === 'Prune (Cancel)' || !(+o.cost > 0) || !(+o.due >= 1)) return;
        if (o.sys === 'coo' && o.plan === 'yearly' && +o.dueMonth !== d.getMonth()) return;
        if (d.getDate() === Math.min(+o.due, dim(d.getFullYear(), d.getMonth()))) { const key = 'b:' + o.category + '|' + ds; const amt = (o.sys === 'coo' && o.plan === 'yearly') ? (+o.amount || 0) : o.cost; if (withMoney) out.push({ type: 'bill', title: 'Pay ' + o.category + ' ' + money(amt), key, done: !!S.cal.done[key] }); }
      });
      (S.mdata.income || []).forEach(r => { if (withMoney && paydayOn(r, ds)) out.push({ type: 'payday', title: 'Payday: ' + (r.source || 'Pay') + ' ' + money(r.amount) }); });
      (S.mdata.maint || []).forEach(m => {
        if (!m.last || !m.interval) return;
        const nd = pd(m.last); nd.setMonth(nd.getMonth() + (+m.interval));
        if (iso(nd) === ds) { const key = 'cm:' + m.asset + '|' + ds; out.push({ type: 'maintenance', title: (m.asset || '') + (m.action ? ': ' + m.action : ''), key, done: !!S.cal.done[key] }); }
      });
    }
    return out;
  }

  function rowHtml(it, ds, showDate) {
    const t = TYPES[it.type] || ['', '#666'];
    const can = (it.tid && (canManage() || it.who === S.user.id)) || (it.key && canManage());
    const box = can ? '<button class="chk ' + (it.done ? 'done' : '') + '" ' + (it.tid ? 'data-tk="' + it.tid + '"' : 'data-ck="' + esc(it.key) + '"') + ' aria-label="Mark done">' + (it.done ? '&#10003;' : '') + '</button>' : '<span style="flex:0 0 28px"></span>';
    const dl = showDate ? '<div class="note">' + DN[pd(ds).getDay()] + ' ' + MN[pd(ds).getMonth()].slice(0, 3) + ' ' + pd(ds).getDate() + '</div>' : '';
    const nk = it.tid || it.rm; if (it.notes && nk) NOTES[nk] = { title: it.title, notes: it.notes, who: it.who };
const hb = it.notes && nk ? '<button class="btn ghost" style="min-height:32px;padding:0 12px" data-note="' + esc(nk) + '">How to do it</button>' : '';
const rm = it.rm && (canAdd() || it.who === S.user.id) ? '<button class="btn ghost" style="min-height:32px;padding:0 10px" data-rm="' + esc(it.rm) + '" aria-label="Remove">&#10005;</button>' : '';
    return '<div class="cal-row">' + box + '<div style="flex:1"><div class="' + (it.done ? 'done-t' : '') + '" style="font-weight:600"><span class="cal-tag" style="background:' + t[1] + '">' + t[0] + '</span>' + esc(it.title) + (it.who ? '<span class="chip">' + esc(who(it.who)) + '</span>' : '') + '</div>' + dl + '</div>' + hb + rm + '</div>';
  }

  function overdue() {
    const t = todayISO(), out = [];
    (S.tasks || []).forEach(x => { if (x.due_date && x.due_date < t && x.status !== 'done') out.push({ ds: x.due_date, it: { type: x.kind === 'appointment' ? 'appointment' : 'todo', title: x.title, who: x.assigned_to, tid: x.id, notes: x.handoff_notes, done: false } }); });
    if (false) for (let i = 7; i >= 1; i--) { const ds = addDays(t, -i); itemsOn(ds).forEach(it => { if (it.type === 'bill' && !it.done) out.push({ ds, it }); }); }
    return out;
  }

  const NOTES = {};
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  function mealsOn(ds) {
    const k = S.kdata && S.kdata.calendar_by_date, day = (k && k[ds]) || {};
    return SLOTS.filter(x => day[x]).map(x => { const m = day[x]; return { slot: x, m: typeof m === 'object' ? m : { title: String(m) } }; });
  }
  function mealsHtml(ds) {
    const ms = mealsOn(ds);
    if (!ms.length) return '';
    return '<h3 style="margin:14px 0 2px;font-size:20px">Meals</h3>' + ms.map(x => '<div class="cal-row"><span style="flex:0 0 28px"></span><div style="flex:1"><div style="font-weight:600"><span class="cal-tag" style="background:#2f7d4f">' + x.slot[0].toUpperCase() + x.slot.slice(1) + '</span>' + esc(x.m.title || 'Meal') + '</div></div><button class="btn ghost" style="min-height:32px;padding:0 12px" data-meal="' + x.slot + '" data-mday="' + ds + '">' + (x.m.steps && x.m.steps.length ? 'See recipe' : 'Details') + '</button></div>').join('');
  }
  function showRecipe(ds, slot, big) {
    const r = (mealsOn(ds).find(x => x.slot === slot) || {}).m; if (!r) return;
    const mac = r.macros ? '<div style="display:flex;gap:14px;flex-wrap:wrap;margin:10px 0"><span><b>' + esc(r.macros.cal) + '</b> cal</span><span><b>' + esc(r.macros.protein) + 'g</b> protein</span><span><b>' + esc(r.macros.carbs) + 'g</b> carbs</span><span><b>' + esc(r.macros.fat) + 'g</b> fat</span></div>' : '';
    const pull = (r.pull || []).map(p => '<li>' + esc(p.qty || '') + ' ' + esc(p.item || '') + (p.prepNote ? ' <span class="note">(' + esc(p.prepNote) + ')</span>' : '') + '</li>').join('');
    const steps = (r.steps || []).map(t => '<li style="margin-bottom:6px">' + esc(t) + '</li>').join('');
    const body = '<h2 style="margin:0 0 4px">' + esc(r.title || 'Meal') + '</h2>' + (r.servings ? '<div class="note">Serves ' + esc(r.servings) + '</div>' : '') + (r.description ? '<p>' + esc(r.description) + '</p>' : '') + mac +
      (r.cookTime ? '<p><b>' + esc(r.cookTime) + '</b></p>' : '') + (pull ? '<h3>What you need</h3><ul>' + pull + '</ul>' : '') + (steps ? '<h3>Steps</h3><ol>' + steps + '</ol>' : '<p class="note">No recipe was saved for this one. Open it in the Kitchen to add details.</p>') + (r.tip ? '<p class="note">' + esc(r.tip) + '</p>' : '');
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;background:rgba(20,33,61,.6);z-index:9999;overflow:auto;padding:20px 12px';
    overlay(body, big);
  }


  function overlay(body, big) {
const prev = document.getElementById('coo-ov'); if (prev) prev.remove();
const o = document.createElement('div');
o.id = 'coo-ov'; o.tabIndex = -1;
o.style.cssText = 'position:fixed;inset:0;background:rgba(20,33,61,.85);z-index:9999;overflow:auto;padding:20px 12px 110px;outline:none;-webkit-overflow-scrolling:touch';
const bs = 'min-height:56px;padding:0 22px;font-size:20px';
o.innerHTML = '<div style="background:#fff;max-width:' + (big ? '1100px' : '640px') + ';margin:0 auto;border-radius:12px;padding:22px 26px;font-size:' + (big ? 'clamp(20px,3.2vh,34px)' : '16px') + ';line-height:1.45">' + body + '</div>' +
'<div style="position:fixed;right:16px;bottom:16px;display:flex;gap:10px;z-index:10000"><button class="btn" id="ovup" style="' + bs + '">&#9650; Up</button><button class="btn" id="ovdn" style="' + bs + '">&#9660; Down</button><button class="btn" id="ovx" style="' + bs + ';background:#C59B27;color:#14213d">Close</button></div>';
const step = () => Math.round(window.innerHeight * 0.6);
const close = () => { o.remove(); document.removeEventListener('keydown', onKey, true); };
const onKey = e => {
if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack' || e.key === 'GoBack') { e.preventDefault(); close(); }
else if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); const L = Array.from(o.querySelectorAll('[data-dm],[data-di]')); if (L.length) { L[Math.min(L.length - 1, L.indexOf(document.activeElement) + 1)].focus(); } else o.scrollBy({ top: step(), behavior: 'smooth' }); }
else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); const L = Array.from(o.querySelectorAll('[data-dm],[data-di]')); if (L.length) { L[Math.max(0, L.indexOf(document.activeElement) - 1)].focus(); } else o.scrollBy({ top: -step(), behavior: 'smooth' }); }
};
document.addEventListener('keydown', onKey, true);
o.onclick = e => { if (e.target === o) close(); };
document.body.appendChild(o);
o.querySelector('#ovup').onclick = () => o.scrollBy({ top: -step(), behavior: 'smooth' });
o.querySelector('#ovdn').onclick = () => o.scrollBy({ top: step(), behavior: 'smooth' });
o.querySelector('#ovx').onclick = close;
o.focus();
return o;
}
function noteBody(title, notes, w) {
return '<h2 style="margin:0 0 4px">' + esc(title) + '</h2>' + (w ? '<div class="note">' + esc(who(w)) + '</div>' : '') + '<h3>How to do it</h3><div style="white-space:pre-wrap">' + esc(notes) + '</div>';
}
function showNotes(k, big) { const n = NOTES[k]; if (n) overlay(noteBody(n.title, n.notes, n.who), big); }
window.cooRecipe = (ds, slot) => showRecipe(ds, slot, true);
window.cooItem = (it, ds) => {
const t = TYPES[it.type] || ['Item', '#666'];
const d = ds ? pd(ds) : null;
const when = d ? DN[d.getDay()] + ', ' + MN[d.getMonth()] + ' ' + d.getDate() : '';
const body = '<span class="cal-tag" style="background:' + t[1] + '">' + t[0] + '</span>' + (it.done ? '<span class="chip">Done</span>' : '') + '<h2 style="margin:8px 0 4px">' + esc(it.title) + '</h2><div class="note">' + esc(when) + (it.who ? ' &middot; ' + esc(who(it.who)) : '') + '</div>' + (it.notes ? '<h3>How to do it</h3><div style="white-space:pre-wrap">' + esc(it.notes) + '</div>' : '<p class="note">No instructions were added for this one.</p>');
overlay(body, true);
};

window.cooDayView = function (ds) {
const r = cooDay(ds), d = pd(ds);
const tag = (c, t) => '<span class="cal-tag" style="background:' + c + '">' + t + '</span>';
const bst = 'display:block;width:100%;text-align:left;margin:8px 0;min-height:56px;font-size:inherit';
const rows = r.meals.map((x, i) => '<button class="btn ghost" style="' + bst + '" data-dm="' + i + '">' + tag('#2f7d4f', x.slot[0].toUpperCase() + x.slot.slice(1)) + esc(x.m.title || 'Meal') + '</button>')
.concat(r.items.map((x, i) => '<button class="btn ghost" style="' + bst + '" data-di="' + i + '">' + tag((TYPES[x.type] || ['', '#666'])[1], (TYPES[x.type] || ['Item'])[0]) + (x.done ? '<s>' + esc(x.title) + '</s>' : esc(x.title)) + '</button>')).join('');
const o = overlay('<h2 style="margin:0 0 8px">' + DN[d.getDay()] + ', ' + MN[d.getMonth()] + ' ' + d.getDate() + '</h2>' + (rows || '<p class="note">Nothing planned.</p>'), true);
o.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => showRecipe(ds, r.meals[+b.dataset.dm].slot, true));
o.querySelectorAll('[data-di]').forEach(b => b.onclick = () => window.cooItem(r.items[+b.dataset.di], ds));
};

function myMoney() {
    if (!moneyOK()) return '';
    const t = todayISO(), past = [], now = [], up = [];
    for (let i = -7; i <= 7; i++) {
      const ds = addDays(t, i);
      itemsOn(ds, true).forEach(it => {
        if (it.type !== 'bill' && it.type !== 'payday') return;
        if (i < 0) { if (it.type === 'bill' && !it.done) past.push({ ds, it }); } else if (i === 0) now.push({ ds, it }); else up.push({ ds, it });
      });
    }
    const sec = (h, list) => list.length ? '<h3 style="margin:14px 0 2px;font-size:20px">' + h + '</h3>' + list.map(x => rowHtml(x.it, x.ds, true)).join('') : '';
    const body = sec('Past due', past) + sec('Today', now) + sec('Next 7 days', up);
    return '<div class="card" style="margin-bottom:18px"><h2>Only you: bills and paydays</h2><p class="note">Nobody else in the house sees this.</p>' + (body || '<p class="note">Nothing coming up.</p>') + '</div>';
  }

  window.calToday = function () {
    if (!S.cal) return '';
    const t = todayISO(), od = overdue(), now = itemsOn(t);
    let up = [];
    for (let i = 1; i <= 7; i++) { const ds = addDays(t, i); itemsOn(ds).forEach(it => { if (it.type !== 'payday') up.push({ ds, it }); }); }
    const sec = (h, body) => body ? '<h3 style="margin:14px 0 2px;font-size:20px">' + h + '</h3>' + body : '';
    const html = sec('Overdue', od.map(x => rowHtml(x.it, x.ds, true)).join('')) +
      mealsHtml(t) + sec('Today', now.map(it => rowHtml(it, t, false)).join('')) +
      sec('Next 7 days', up.map(x => rowHtml(x.it, x.ds, true)).join(''));
    return '<div class="card" style="margin-bottom:18px"><h2>Today</h2>' + (html || '<p class="note">Nothing due today or this week.</p>') + '</div>';
  };

  window.calView = function () {
    if (!S.cal) { loadCal().then(() => { if (S.page === 'cal') render(); }); return '<div class="eyebrow">Command Center</div><h1>Command Center.</h1><div class="rule"></div><p class="note">Loading.</p>'; }
    const { y, m } = S.calM, first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay()), t = todayISO();
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), ds = iso(d), its = itemsOn(ds);
      if (i >= 35 && d.getMonth() !== m) break;
      const tags = its.slice(0, 2).map(it => '<span class="cal-t" style="background:' + (TYPES[it.type] || ['', '#666'])[1] + '">' + esc(it.title) + '</span>').join('');
      cells += '<button class="cal-d' + (d.getMonth() !== m ? ' out' : '') + (ds === t ? ' today' : '') + (ds === S.calSel ? ' sel' : '') + '" data-day="' + ds + '"><b>' + d.getDate() + '</b>' + tags + (its.length > 2 ? '<div class="cal-more">+' + (its.length - 2) + ' more</div>' : '') + '</button>';
    }
    const sel = S.calSel, selItems = itemsOn(sel);
    const selLabel = DN[pd(sel).getDay()] + ', ' + MN[pd(sel).getMonth()] + ' ' + pd(sel).getDate();
    const add = !(canAdd() || isKid()) ? '' : '<div class="card" style="margin-top:18px"><h2>Add to the Command Center</h2>' +
      '<label for="cf_title">What</label><input id="cf_title" placeholder="Dentist, Mom birthday, change air filter">' +
      '<div class="cal-two"><div><label for="cf_type">Type</label><select id="cf_type">' + (canManage() || isKid() ? '<option value="todo">Task</option><option value="appointment">Appointment</option>' : '<option value="event">Family activity</option>') + '<option value="birthday">Birthday</option><option value="anniversary">Anniversary</option><option value="maintenance">Maintenance</option></select></div>' +
      '<div><label for="cf_date">Date (use the real date for a birthday or anniversary)</label><input id="cf_date" type="date" value="' + sel + '"></div></div>' +
      '<div id="cf_timewrap" style="display:none"><label for="cf_time">Time</label><input id="cf_time" type="time"></div>' +
      '<div class="cal-two"><div><label for="cf_who">Who</label><select id="cf_who"><option value="">Everyone</option>' + S.members.map(x => '<option value="' + x.user_id + '">' + (x.user_id === S.user.id ? 'Me' : esc(who(x.user_id))) + '</option>').join('') + '</select></div>' +
      '<div id="cf_repwrap"><label for="cf_rep">Repeats</label><select id="cf_rep"><option value="none">Does not repeat</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option><option value="months">Every few months</option></select></div></div>' +
      '<div id="cf_everywrap" style="display:none"><label for="cf_every">Every how many months</label><input id="cf_every" type="number" min="1" value="6"></div>' +
      '<label for="cf_notes">How to do it (notes people can open from the calendar)</label><textarea id="cf_notes" placeholder="Step by step, so whoever has it knows exactly how"></textarea>' +
'<div style="margin-top:14px"><button class="btn" id="cf_add">Add</button></div></div>';
    const others = S.members.filter(x => !['owner', 'adult'].includes(x.role) && x.user_id !== S.user.id);
    const perm = !canManage() || !others.length ? '' : '<div class="card" style="margin-top:18px"><h2>Who else can add</h2><p class="note">Only you can add to the Command Center unless you tick someone here.</p>' + others.map(x => '<label style="display:flex;gap:10px;align-items:center;margin:8px 0"><input type="checkbox" style="width:22px;min-height:22px" data-perm="' + x.user_id + '" ' + (S.cal.perms[x.user_id] ? 'checked' : '') + '>' + esc(who(x.user_id)) + ' (' + esc(x.role) + ')</label>').join('') + '</div>';
    return '<div class="eyebrow">' + esc(S.hh.name) + '</div><h1>Command Center.</h1><div class="rule"></div>' + calToday() + myMoney() +
      '<div class="card"><div class="cal-nav"><button class="btn ghost" data-cm="-1">&#8249;</button><h2 style="min-width:190px">' + MN[m] + ' ' + y + '</h2><button class="btn ghost" data-cm="1">&#8250;</button><button class="btn ghost" data-cm="0">Today</button></div>' +
      '<div class="cal-grid">' + DN.map(d => '<div class="cal-h">' + d + '</div>').join('') + cells + '</div></div>' +
      '<div class="card" style="margin-top:18px"><h2>' + selLabel + '</h2>' + (selItems.map(it => rowHtml(it, sel, false)).join('') || '<p class="note">Nothing on this day.</p>') + '</div>' + add + perm;
  };

  window.calBind = function () {
    if (S.page === 'cal') {
      document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => {
        const v = +b.dataset.cm;
        if (v === 0) { const n = new Date(); S.calM = { y: n.getFullYear(), m: n.getMonth() }; S.calSel = todayISO(); }
        else { let mm = S.calM.m + v, yy = S.calM.y; if (mm < 0) { mm = 11; yy--; } if (mm > 11) { mm = 0; yy++; } S.calM = { y: yy, m: mm }; }
        render();
      });
      document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { S.calSel = b.dataset.day; render(); });
      const ty = document.getElementById('cf_type');
      if (ty) {
        if (!canAdd()) { const wh = document.getElementById('cf_who'); if (wh && wh.parentNode) wh.parentNode.style.display = 'none'; }
        const sync = () => {
          const v = ty.value, rep = document.getElementById('cf_rep');
          const plain = (v === 'birthday' || v === 'anniversary' || v === 'todo' || v === 'appointment');
          document.getElementById('cf_timewrap').style.display = v === 'appointment' ? '' : 'none';
          document.getElementById('cf_repwrap').style.display = plain ? 'none' : '';
          document.getElementById('cf_everywrap').style.display = (!plain && rep.value === 'months') ? '' : 'none';
        };
        ty.onchange = sync; document.getElementById('cf_rep').onchange = sync; sync();
        document.getElementById('cf_add').onclick = async () => {
          const title = document.getElementById('cf_title').value.trim(), date = document.getElementById('cf_date').value, type = ty.value, w = canAdd() ? document.getElementById('cf_who').value : S.user.id;
          if (!title || !date) { alert('Type what it is and pick a date.'); return; }
          if (type === 'todo' || type === 'appointment') {
            const { error } = await sb.from('tasks').insert({ household_id: S.me.household_id, title, handoff_notes: document.getElementById('cf_notes').value.trim() || null, assigned_to: w || null, shared: canManage(), due_date: date, kind: type === 'appointment' ? 'appointment' : 'task', due_time: type === 'appointment' ? (document.getElementById('cf_time').value || null) : null });
            if (error) { alert(error.message); return; }
            await loadTasks();
          } else {
            const rep = (type === 'birthday' || type === 'anniversary') ? 'yearly' : document.getElementById('cf_rep').value;
            S.cal.items.push({ id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, title, date, who: w, notes: document.getElementById('cf_notes').value.trim() || null, repeat: rep, every: +document.getElementById('cf_every').value || 6 });
            await saveCal();
          }
          S.calSel = date; const d = pd(date); S.calM = { y: d.getFullYear(), m: d.getMonth() };
          render();
        };
      }
    }
    document.querySelectorAll('[data-perm]').forEach(b => b.onchange = async () => { S.cal.perms[b.dataset.perm] = b.checked; await saveCal(); render(); });
    document.querySelectorAll('[data-note]').forEach(b => b.onclick = () => showNotes(b.dataset.note));
document.querySelectorAll('[data-meal]').forEach(b => b.onclick = () => showRecipe(b.dataset.mday, b.dataset.meal));
    document.querySelectorAll('[data-ck]').forEach(b => b.onclick = async () => {
      const k = b.dataset.ck; if (S.cal.done[k]) delete S.cal.done[k]; else S.cal.done[k] = true;
      await saveCal(); render();
    });
    document.querySelectorAll('[data-tk]').forEach(b => b.onclick = async () => {
      const t = S.tasks.find(x => x.id === b.dataset.tk); if (!t) return;
      await sb.from('tasks').update({ status: t.status === 'done' ? 'open' : 'done' }).eq('id', t.id);
      await loadTasks(); render();
    });
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      if (!confirm('Remove this? If it repeats, every date is removed.')) return;
      S.cal.items = S.cal.items.filter(x => x.id !== b.dataset.rm); await saveCal(); render();
    });
  };
  window.cooDay = function (ds) {
    const items = itemsOn(ds, false).filter(x => x.tid ? !!((S.tasks || []).find(t => t.id === x.tid) || {}).shared : !x.who);
    return { items, meals: mealsOn(ds) };
  };
})();
