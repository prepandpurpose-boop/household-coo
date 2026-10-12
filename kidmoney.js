// Household COO: kids' own money. Allowance, what they spend, and one savings goal. No family money here.
(function () {
  const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(+n || 0).toFixed(2);
  const mgr = () => S.me && ['owner', 'adult'].includes(S.me.role);
  const kidsList = () => S.members.filter(m => m.role === 'kid');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  window.loadKm = async function () {
    try {
      const { data } = await sb.from('app_data').select('data').eq('household_id', S.me.household_id).eq('module', 'kidmoney').maybeSingle();
      S.km = (data && data.data) || {};
    } catch (e) { S.km = {}; }
    if (!S.km.kids) S.km.kids = {};
  };
  async function saveKm() {
    const { error } = await sb.from('app_data').upsert({ household_id: S.me.household_id, module: 'kidmoney', data: S.km, updated_at: new Date().toISOString() }, { onConflict: 'household_id,module' });
    if (error) alert(error.message);
  }
  function rec(id) {
    if (!S.km.kids[id]) S.km.kids[id] = { entries: [], goal: null, allowance: 0 };
    return S.km.kids[id];
  }

  window.kmView = function () {
    if (!S.km) { loadKm().then(() => { if (S.page === 'km') render(); }); return '<div class="eyebrow">Money</div><h1>Loading.</h1>'; }
    const kids = mgr() ? kidsList() : [S.me];
    if (!kids.length) return '<div class="eyebrow">' + esc(S.hh.name) + '</div><h1>Household members\' money.</h1><div class="rule"></div><div class="card"><p class="note">No household members have been added yet.</p></div>';
    if (!S.kmSel || !kids.find(x => x.user_id === S.kmSel)) S.kmSel = kids[0].user_id;
    const id = S.kmSel, r = rec(id);
    const bal = r.entries.reduce((t, e) => t + (+e.amt || 0), 0);
    const tabs = kids.length > 1 ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' + kids.map(k => '<button class="btn ' + (k.user_id === id ? '' : 'ghost') + '" data-kmsel="' + k.user_id + '">' + esc(nm(k.user_id)) + '</button>').join('') + '</div>' : '';
    const g = r.goal, pct = g && +g.target > 0 ? Math.max(0, Math.min(100, Math.round(bal / +g.target * 100))) : 0;
    const goal = '<div class="card" style="margin-top:18px"><h2>My savings goal</h2>' +
      (g && g.name ? '<p style="margin:8px 0 4px;font-weight:600">' + esc(g.name) + ': ' + money(bal) + ' of ' + money(g.target) + '</p><div style="background:#E7ECF5;border-radius:99px;height:14px;overflow:hidden"><div style="background:var(--gold);height:14px;width:' + pct + '%"></div></div>' : '<p class="note">Pick something to save for.</p>') +
      '<div class="cal-two" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><label for="km_gn">What for</label><input id="km_gn" value="' + esc(g ? g.name : '') + '"></div><div><label for="km_gt">How much it costs</label><input id="km_gt" type="number" min="0" step="0.01" value="' + (g ? esc(g.target) : '') + '"></div></div>' +
      '<div style="margin-top:12px"><button class="btn ghost" id="km_gs">Save goal</button></div></div>';
    const form = '<div class="card" style="margin-top:18px"><h2>Add money in or out</h2>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><label for="km_dir">What happened</label><select id="km_dir"><option value="in">Money came in</option><option value="out">I spent money</option></select></div><div><label for="km_amt">Amount</label><input id="km_amt" type="number" min="0" step="0.01"></div></div>' +
      '<label for="km_note">What it was for</label><input id="km_note" placeholder="Allowance, birthday gift, snack, game">' +
      '<div style="margin-top:12px"><button class="btn" id="km_add">Add</button></div></div>';
    const allow = !mgr() ? '' : '<div class="card" style="margin-top:18px"><h2>Allowance</h2><p class="note">Set a weekly amount. Tap the button each week to add it.</p>' +
      '<label for="km_al">Weekly allowance</label><input id="km_al" type="number" min="0" step="0.01" value="' + (+r.allowance || '') + '">' +
      '<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn ghost" id="km_als">Save amount</button>' + (+r.allowance > 0 ? '<button class="btn" id="km_ala">Add this week\'s ' + money(r.allowance) + '</button>' : '') + '</div></div>';
    const list = r.entries.slice().reverse().slice(0, 30).map(e => '<div class="row"><div style="flex:1"><div style="font-weight:600">' + esc(e.note || (e.amt < 0 ? 'Spent' : 'Money in')) + '</div><div class="note">' + esc(e.date) + '</div></div><div style="font-weight:600;color:' + (e.amt < 0 ? '#a33' : '#2f8f4e') + '">' + money(e.amt) + '</div>' + (mgr() ? '<button class="btn ghost" style="min-height:32px;padding:0 10px" data-kmrm="' + e.id + '" aria-label="Remove">&#10005;</button>' : '') + '</div>').join('');
    return '<div class="eyebrow">' + esc(S.hh.name) + '</div><h1>' + (mgr() ? 'Household members\' money.' : 'My money.') + '</h1><div class="rule"></div>' + tabs +
      '<div class="card"><div class="note">' + (mgr() ? esc(nm(id)) + ' has' : 'I have') + '</div><div style="font-family:\'Cormorant Garamond\',serif;font-size:52px;font-weight:700;color:var(--navy)">' + money(bal) + '</div></div>' +
      goal + form + allow + '<div class="card" style="margin-top:18px"><h2>What happened</h2>' + (list || '<p class="note">Nothing yet.</p>') + '</div>';
  };

  window.kmBind = function () {
    if (S.page !== 'km' || !S.km) return;
    const $$ = s => document.querySelector(s);
    document.querySelectorAll('[data-kmsel]').forEach(b => b.onclick = () => { S.kmSel = b.dataset.kmsel; render(); });
    const id = S.kmSel; if (!id) return;
    const r = rec(id), mk = (amt, note) => ({ id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: today(), amt, note });
    const a = $$('#km_add');
    if (a) a.onclick = async () => {
      const v = Math.abs(parseFloat($$('#km_amt').value)); if (!(v > 0)) { alert('Type an amount.'); return; }
      r.entries.push(mk($$('#km_dir').value === 'out' ? -v : v, $$('#km_note').value.trim()));
      await saveKm(); render();
    };
    const gs = $$('#km_gs');
    if (gs) gs.onclick = async () => { r.goal = { name: $$('#km_gn').value.trim(), target: parseFloat($$('#km_gt').value) || 0 }; await saveKm(); render(); };
    const als = $$('#km_als');
    if (als) als.onclick = async () => { r.allowance = parseFloat($$('#km_al').value) || 0; await saveKm(); render(); };
    const ala = $$('#km_ala');
    if (ala) ala.onclick = async () => { r.entries.push(mk(+r.allowance, 'Weekly allowance')); await saveKm(); render(); };
    document.querySelectorAll('[data-kmrm]').forEach(b => b.onclick = async () => { r.entries = r.entries.filter(e => e.id !== b.dataset.kmrm); await saveKm(); render(); });
  };
})();
