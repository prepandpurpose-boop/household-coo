// Household COO: Daily tracker. Each person keeps a short list of things they do every day and checks them off.
// A parent can open anyone's tracker and add or remove items. Only the person themselves checks items off.
// It is saved inside the Command Center data, one section per person, so one person's save never replaces another's.
(function () {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const KEEP_DAYS = 60;
  const canManage = () => S.me && ['owner', 'adult'].includes(S.me.role);
  const people = () => (S.members || []).filter(x => !['helper', 'staff'].includes(x.role));
  const nmOf = id => { const m = (S.members || []).find(x => x.user_id === id); return m ? (m.display_name || m.role) : 'Someone'; };
  const days = () => { const out = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(d); } return out; };

  const css = document.createElement('style');
  css.textContent = [
    '.trk-chk{flex:0 0 28px;width:28px;height:28px;border-radius:8px;border:2px solid var(--blue);background:#fff;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
    '.trk-chk.done{background:var(--blue)}.trk-chk[disabled]{cursor:default;opacity:.55}',
    '.trk-row{display:flex;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--track)}.trk-row:first-child{border-top:0}',
    '.trk-wrap{overflow-x:auto}.trk-tbl{border-collapse:collapse;width:100%;min-width:420px}',
    '.trk-tbl th,.trk-tbl td{padding:8px 6px;text-align:center;border-top:1px solid var(--track);font-size:14px}',
    '.trk-tbl th{font-size:12px;color:var(--mute);font-weight:600;border-top:0}.trk-tbl td:first-child,.trk-tbl th:first-child{text-align:left}',
    '.trk-yes{color:#2f8f4e;font-weight:700}.trk-no{color:var(--mute)}.trk-today{background:#fff7dc}'
  ].join('');
  document.head.appendChild(css);

  function whose() {
    if (!canManage()) return S.user.id;
    if (!S.trkWho || !people().some(x => x.user_id === S.trkWho)) S.trkWho = S.user.id;
    return S.trkWho;
  }
  function get(uid) {
    if (!S.cal) S.cal = {};
    if (!S.cal.trackers) S.cal.trackers = {};
    const t = S.cal.trackers[uid] || (S.cal.trackers[uid] = { items: [], log: {} });
    if (!Array.isArray(t.items)) t.items = [];
    if (!t.log) t.log = {};
    return t;
  }

  // Save only this one person's tracker on top of the newest saved data.
  async function save(uid) {
    const mine = get(uid);
    const cut = new Date(); cut.setDate(cut.getDate() - KEEP_DAYS); const cutISO = iso(cut);
    Object.keys(mine.log).forEach(k => { if (k < cutISO || !mine.log[k].length) delete mine.log[k]; });
    try {
      const { data, error: e1 } = await sb.from('app_data').select('data').eq('household_id', S.me.household_id).eq('module', 'calendar').maybeSingle();
      if (e1) throw e1;
      const latest = (data && data.data) || {};
      if (!latest.trackers) latest.trackers = {};
      latest.trackers[uid] = mine;
      const { error } = await sb.from('app_data').upsert({ household_id: S.me.household_id, module: 'calendar', data: latest, updated_at: new Date().toISOString() }, { onConflict: 'household_id,module' });
      if (error) throw error;
      Object.keys(latest.trackers).forEach(k => { if (k !== uid) S.cal.trackers[k] = latest.trackers[k]; });
      return true;
    } catch (e) { console.warn(e); alert('That did not save. Please try again.'); return false; }
  }

  window.trackerView = function () {
    const uid = whose(), t = get(uid), own = uid === S.user.id, today = iso(new Date());
    const doneToday = t.log[today] || [];
    const pick = canManage() && people().length > 1
      ? '<div class="card" style="margin-bottom:18px"><label for="trk_who">Whose tracker</label><select id="trk_who">' + people().map(x => '<option value="' + x.user_id + '"' + (x.user_id === uid ? ' selected' : '') + '>' + (x.user_id === S.user.id ? 'Me' : esc(nmOf(x.user_id))) + '</option>').join('') + '</select></div>'
      : '';
    const canEdit = own || canManage();
    const rows = t.items.map(it => {
      const d = doneToday.includes(it.id);
      return '<div class="trk-row"><button class="trk-chk ' + (d ? 'done' : '') + '" data-trk="' + esc(it.id) + '"' + (own ? '' : ' disabled') + ' aria-label="' + (d ? 'Done today' : 'Mark done today') + '">' + (d ? '&#10003;' : '') + '</button>' +
        '<div style="flex:1;font-weight:600" class="' + (d ? 'done-t' : '') + '">' + esc(it.title) + '</div>' +
        (canEdit ? '<button class="btn ghost" style="min-height:32px;padding:0 10px" data-trkrm="' + esc(it.id) + '" aria-label="Remove ' + esc(it.title) + '">&#10005;</button>' : '') + '</div>';
    }).join('');
    const todayCard = '<div class="card"><h2>Today · ' + doneToday.filter(id => t.items.some(i => i.id === id)).length + ' of ' + t.items.length + ' done</h2>' +
      (rows || '<p class="note">' + (own ? 'Nothing on your tracker yet. Add your first daily item below.' : 'Nothing on this tracker yet. Add a daily item below.') + '</p>') +
      (!own && t.items.length ? '<p class="note" style="margin-top:10px">Only ' + esc(nmOf(uid)) + ' can check these off.</p>' : '') + '</div>';
    const ds = days();
    const week = !t.items.length ? '' : '<div class="card" style="margin-top:18px"><h2>Last 7 days</h2><div class="trk-wrap"><table class="trk-tbl"><thead><tr><th>Daily item</th>' +
      ds.map(d => '<th class="' + (iso(d) === today ? 'trk-today' : '') + '">' + DN[d.getDay()] + '<br>' + d.getDate() + '</th>').join('') + '<th>Days done</th></tr></thead><tbody>' +
      t.items.map(it => { let n = 0; return '<tr><td>' + esc(it.title) + '</td>' + ds.map(d => { const k = iso(d), y = (t.log[k] || []).includes(it.id); if (y) n++; return '<td class="' + (k === today ? 'trk-today ' : '') + (y ? 'trk-yes' : 'trk-no') + '">' + (y ? '&#10003;<span class="sr" style="position:absolute;left:-9999px"> done</span>' : '&ndash;') + '</td>'; }).join('') + '<td><b>' + n + ' of 7</b></td></tr>'; }).join('') +
      '</tbody></table></div></div>';
    const add = !canEdit ? '' : '<div class="card" style="margin-top:18px"><h2>Add a daily item</h2><label for="trk_new">Something to do every day</label><input id="trk_new" maxlength="80" placeholder="Read for 20 minutes, drink water, make the bed">' +
      '<div style="margin-top:14px"><button class="btn" id="trk_add">Add</button></div></div>';
    return '<div class="eyebrow">' + esc(S.hh.name) + '</div><h1>Daily tracker.</h1><div class="rule"></div>' +
      '<p class="note" style="margin:0 0 16px">' + (own ? 'Your daily items. Check each one off when you do it. It starts fresh every day.' : esc(nmOf(uid)) + '’s daily items.') + '</p>' + pick + todayCard + week + add;
  };

  window.trackerBind = function () {
    if (S.page !== 'tracker') return;
    const uid = whose(), t = get(uid), today = iso(new Date());
    const w = document.getElementById('trk_who'); if (w) w.onchange = () => { S.trkWho = w.value; render(); };
    document.querySelectorAll('[data-trk]').forEach(b => b.onclick = async () => {
      if (uid !== S.user.id) return;
      const id = b.dataset.trk, list = t.log[today] || (t.log[today] = []), i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.push(id);
      render(); await save(uid);
    });
    document.querySelectorAll('[data-trkrm]').forEach(b => b.onclick = async () => {
      const it = t.items.find(x => x.id === b.dataset.trkrm); if (!it || !confirm('Remove "' + it.title + '" from the tracker?')) return;
      t.items = t.items.filter(x => x.id !== it.id);
      render(); await save(uid);
    });
    const add = document.getElementById('trk_add'), inp = document.getElementById('trk_new');
    const go = async () => {
      const title = inp.value.trim(); if (!title) { inp.focus(); return; }
      t.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title });
      render(); await save(uid);
    };
    if (add) add.onclick = go;
    if (inp) inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  };
})();
