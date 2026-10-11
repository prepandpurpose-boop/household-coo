// Household COO · Money · Pay Plan (what to do with each paycheck) and Spending (plan vs. real).
// Reads the same Treasury, goals, and sinking-fund data as the rest of Money, so anything you add shows up here.
(function () {
  const CATS = {
    wall: ['10% Tithe', 'Shelter (Wall 1)', 'Food (Wall 2)', 'Utilities (Wall 3)', 'Transportation (Wall 4)', 'Health Insurance', 'Life Insurance', 'Debt Minimums'],
    exp: ['Phone & Internet', 'Streaming & Subscriptions', 'Memberships & Dues', 'Insurance (Other)', 'Personal & Discretionary', 'Other Recurring'],
    life: ['Eating out & coffee', 'Shopping & household', 'Other everyday'],
    skip: ['Transfers & savings', 'Income & refunds']
  };
  const ALL_CATS = [].concat(CATS.wall, CATS.exp, CATS.life, CATS.skip);
  const GROUP_NAME = { wall: 'The Four Walls and obligations', exp: 'Recurring expenses', life: 'Everyday and fun', skip: 'Not spending' };
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- shared helpers other files use ---------- */
  function merchantKey(desc) {
    let t = String(desc || '').toUpperCase();
    t = t.replace(/\b(PURCHASE AUTHORIZED ON|PURCHASE|CHECKCARD|CHECK CARD|DEBIT CARD|POS DEBIT|POS|ACH|RECURRING|PAYMENT|AUTOPAY|WEB ID|PPD ID|ONLINE|CARD|DEBIT|CREDIT|TST\*|SQ \*|PAYPAL \*)\b/g, ' ');
    t = t.replace(/[#*\/\\\-_.,:;()]/g, ' ');
    const w = t.split(/\s+/).filter(x => x && !/\d/.test(x) && x.length > 1);
    return w.slice(0, 3).join(' ') || String(desc || '').toUpperCase().slice(0, 20) || 'UNKNOWN';
  }
  function ensure() {
    if (!state.spend || typeof state.spend !== 'object') state.spend = { merchants: {} };
    if (!state.spend.merchants) state.spend.merchants = {};
    if (state.tithePct == null) state.tithePct = 10;
    if (!state.ppDone) state.ppDone = {};
  }
  // Turn statement lines (date|description|amount[|account]) into totals per merchant per month.
  function prepSpend(lines) {
    ensure();
    const agg = {};
    lines.forEach(l => {
      const p = l.split('|');
      const d = p[0], amt = parseFloat(String(p[2]).replace(/[^0-9.\-]/g, ''));
      if (!/^\d{4}-\d{2}/.test(d) || !isFinite(amt)) return;
      const key = merchantKey(p[1]);
      const mk = d.slice(0, 7) + '|' + (p[3] || '').trim();
      const a = agg[key] || (agg[key] = { name: key, count: 0, total: 0, months: {} });
      a.count++; a.total += amt;
      a.months[mk] = Math.round(((a.months[mk] || 0) + amt) * 100) / 100;
    });
    return agg;
  }
  function knownCat(key) { const m = state.spend && state.spend.merchants[key]; return m ? m.cat : null; }
  // agg: from prepSpend; cats: {key: category}. Replaces the same month+account, keeps everything else.
  function mergeSpend(agg, cats) {
    ensure();
    const touched = new Set();
    Object.values(agg).forEach(a => Object.keys(a.months).forEach(k => touched.add(k)));
    Object.values(state.spend.merchants).forEach(m => touched.forEach(k => { delete m.months[k]; }));
    Object.keys(agg).forEach(key => {
      const m = state.spend.merchants[key] || (state.spend.merchants[key] = { name: agg[key].name, cat: cats[key] || 'Other everyday', months: {} });
      if (cats[key] && !m.userSet) m.cat = cats[key];
      Object.assign(m.months, agg[key].months);
    });
    Object.keys(state.spend.merchants).forEach(k => { if (!Object.keys(state.spend.merchants[k].months).length) delete state.spend.merchants[k]; });
    state.spend.updated = new Date().toISOString().slice(0, 10);
  }
  window.HC = { CATS, ALL_CATS, merchantKey, prepSpend, knownCat, mergeSpend, ensure };

  /* ---------- tabs ---------- */
  const st = document.createElement('style');
  st.textContent = '.ppstep{display:flex;gap:10px;align-items:center;padding:9px 4px;border-bottom:1px solid #e3e8f1}.ppstep label{flex:1;display:flex;gap:10px;align-items:center;cursor:pointer}.ppstep input[type=checkbox]{width:22px;height:22px;flex:0 0 22px}.ppstep .a{font-weight:700;white-space:nowrap}.ppstep.done .t{text-decoration:line-through;color:var(--muted)}.ppstep .n{color:var(--muted);font-size:.8rem}.ppfree{display:flex;justify-content:space-between;gap:10px;padding:14px 6px;font-weight:700;font-size:1.05rem;border-top:2px solid var(--green)}.ppfree.neg{color:#b3261e}.spmer{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #eef1f7;flex-wrap:wrap}.spmer .nm{flex:1 1 160px}.spmer select{max-width:230px}.sprow{display:flex;gap:10px;justify-content:space-between;padding:8px 2px;border-bottom:1px solid #e3e8f1}.sprow b{white-space:nowrap}details.spd summary{cursor:pointer;list-style:none}details.spd summary::-webkit-details-marker{display:none}';
  document.head.appendChild(st);
  const nav = document.querySelector('.tabs-inner');
  function addTab(id, icon, label, first) {
    const b = document.createElement('button');
    b.className = 'tab'; b.dataset.panel = id; b.innerHTML = '<span class="ic">' + icon + '</span>' + label;
    const sec = document.createElement('section'); sec.className = 'panel'; sec.id = id;
    const anchor = document.getElementById('treasury');
    anchor.parentNode.insertBefore(sec, anchor);
    if (first) nav.insertBefore(b, nav.firstChild); else nav.insertBefore(b, document.querySelector('.tab[data-panel="import"]'));
    b.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); sec.classList.add('active');
      renderBoth(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return sec;
  }
  const ppSec = addTab('payplan', '💵', 'Pay Plan', true);
  const spSec = addTab('spending', '🧭', 'Spending', false);

  /* ---------- Pay Plan ---------- */
  const today0 = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const fmtD = d => DOW[d.getDay()] + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();

  function upcomingChecks() {
    const start = today0(), end = addDays(start, 80), cs = [];
    state.income.forEach((r, ri) => {
      if (!r.anchor) return;
      genPaydays(r, start, end).forEach(d => {
        const key = dISO(d), planned = +r.amount || 0;
        const actual = (r.actuals && r.actuals[key] != null) ? +r.actuals[key] : null;
        cs.push({ date: d, key, name: r.source || 'Paycheck', planned, actual, amt: actual != null ? actual : planned });
      });
    });
    cs.sort((a, b) => a.date - b.date);
    // Two incomes landing the same day count as one pay day.
    const out = [];
    cs.forEach(c => {
      const last = out[out.length - 1];
      if (last && last.key === c.key) {
        last.name += ' + ' + c.name; last.planned += c.planned; last.amt += c.amt;
        last.actual = (last.actual != null && c.actual != null) ? last.amt : null;
      } else out.push(Object.assign({}, c));
    });
    return out;
  }

  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  function stepsFor(c, next, M) {
    // Every check puts aside its own share of every monthly bill, so a bill is covered whenever its due date arrives.
    const share = M > 0 ? (c.planned || c.amt) / M : 0;
    const steps = [];
    const pct = +state.tithePct || 0;
    if (pct > 0) steps.push({ g: 'First', id: 'tithe', label: 'Tithe (' + pct + '% of this check)', amt: c.amt * pct / 100, note: 'Set this aside first.' });
    const live = state.overhead.filter(o => o.action !== 'Prune (Cancel)' && o.tier !== '10% Tithe' && (+o.cost || 0) > 0);
    const wallRank = o => { const i = CATS.wall.indexOf(o.tier); return i < 0 ? 99 : i; };
    const walls = live.filter(o => o.kind !== 'expense').sort((x, y) => wallRank(x) - wallRank(y));
    const exps = live.filter(o => o.kind === 'expense');
    const line = (g, o) => ({ g, id: 'b:' + o.category, label: o.category, amt: (+o.cost || 0) * share, note: (+o.due >= 1 ? 'Due on the ' + ord(+o.due) : 'No set date') + '. Month total ' + money0(+o.cost || 0) + '.' });
    walls.forEach(o => steps.push(line('Your Four Walls', o)));
    exps.forEach(o => steps.push(line('Other recurring expenses', o)));
    const G = 'Savings and goals';
    const p = emergencyPlan();
    if (!p.full && p.efMonthly > 0) steps.push({ g: G, id: 'ef', label: 'Emergency Fund', amt: p.efMonthly * share, note: 'Move to savings.' });
    const extra = +state.debtExtra || 0;
    if (extra > 0) steps.push({ g: G, id: 'debt', label: 'Extra debt payment', amt: extra * share, note: 'On top of minimums.' });
    (state.goals.sinking || []).forEach(g => { const mo = monthsUntil(g.due); const need = mo ? Math.max(0, (+g.target || 0) - (+g.saved || 0)) / mo : 0; if (need > 0) steps.push({ g: G, id: 'sk:' + g.name, label: (g.name || 'Sinking fund') + ' (sinking fund)', amt: need * share, note: 'Move to this fund.' }); });
    (state.goals.savings || []).forEach(g => { if (!g.date) return; const mo = monthsUntil(g.date); const need = mo ? Math.max(0, (+g.target || 0) - (+g.saved || 0)) / mo : 0; if (need > 0) steps.push({ g: G, id: 'sv:' + g.name, label: (g.name || 'Savings goal') + ' (savings goal)', amt: need * share, note: 'Move to this goal.' }); });
    return steps;
  }

  function renderPayPlan() {
    ensure();
    const M = calc().income;
    const cs = upcomingChecks();
    const titheCard = '<div class="card"><div class="card-note" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><strong>Tithe</strong> <span>Plan to give</span> <input id="ppTithe" type="number" min="0" max="100" step="0.5" value="' + E(state.tithePct) + '" style="width:80px"> <span>% of every paycheck. It is the first step on every check below.</span></div></div>';
    const bindTithe = () => { const ti = document.getElementById('ppTithe'); if (ti) ti.onchange = () => { state.tithePct = Math.max(0, Math.min(100, parseFloat(ti.value) || 0)); save(); renderPayPlan(); }; };
    if (!state.income.length || M <= 0 || !cs.length) {
      ppSec.innerHTML = '<div class="section-head"><h2>Pay Plan</h2></div>' + titheCard + '<div class="card"><div class="card-note">Add your income on the Treasury tab (what each check is, how often, and one real payday). Then this page tells you exactly what to do with every check.</div></div>';
      bindTithe();
      return;
    }
    const show = cs.slice(0, 3);
    const cards = show.map((c, i) => {
      const next = cs[i + 1] ? cs[i + 1].date : addDays(c.date, 14);
      const steps = stepsFor(c, next, M);
      const used = steps.reduce((t, s) => t + Math.round(s.amt), 0);
      const free = Math.round(c.amt) - used;
      const days = Math.max(1, Math.round((next - c.date) / 86400000));
      const weekly = free / (days / 7);
      const GNOTE = { 'Your Four Walls': 'Shelter, food, utilities, transportation, insurance, and minimum debt payments. Move this money into the account you pay bills from.', 'Other recurring expenses': 'Phone, internet, subscriptions, and other monthly bills. Same account.' };
      let lastG = '';
      const rows = steps.map((s, n) => {
        const k = c.key + '|' + s.id, done = !!state.ppDone[k];
        const head = s.g !== lastG ? '<div style="margin:14px 0 2px;font-weight:700;color:var(--green)">' + E(s.g === 'First' ? 'First' : s.g) + '</div>' + (GNOTE[s.g] ? '<div class="card-note" style="margin:0 0 4px">' + E(GNOTE[s.g]) + '</div>' : '') : '';
        lastG = s.g;
        return head + '<div class="ppstep' + (done ? ' done' : '') + '"><label><input type="checkbox" data-k="' + E(k) + '" ' + (done ? 'checked' : '') + '><span class="t">' + (n + 1) + '. ' + E(s.label) + ' <span class="n">' + E(s.note || '') + '</span></span></label><span class="a">' + money0(s.amt) + '</span></div>';
      }).join('');
      const noWalls = !state.overhead.some(o => o.kind !== 'expense' && o.tier !== '10% Tithe' && (+o.cost || 0) > 0);
      const title = i === 0 ? 'Your next paycheck' : 'Following paycheck';
      return '<div class="card"><div class="card-title">' + title + ': ' + fmtD(c.date) + ' <span class="badge">' + E(c.name) + '</span></div>' +
        '<div class="card-note">' + (c.actual != null ? 'Confirmed amount ' : 'Planned amount ') + '<strong>' + money0(c.amt) + '</strong>. This check covers ' + fmtD(c.date) + ' up to ' + fmtD(next) + '. Do these in order, and check each one off when it is done. Every check puts aside its own share of each monthly bill, so each bill is covered when its due date comes.</div>' +
        (noWalls ? '<div class="priority-note">Your Four Walls are not on the Treasury tab yet (rent or mortgage, food, utilities, transportation, insurance, minimum debt payments). Until they are, the amount to spend below is too high. Add them on Treasury, or read your statements on Import.</div>' : '') +
        rows +
        '<div class="ppfree' + (free < 0 ? ' neg' : '') + '"><span>' + (free < 0 ? 'Short by this amount' : 'Left for everyday spending until ' + fmtD(next)) + '</span><span>' + money0(Math.abs(free)) + '</span></div>' +
        (free >= 0 ? '<div class="card-note">That is about ' + money0(weekly) + ' a week for everyday spending that is not listed above, like eating out, gas, and fun.</div>' : '<div class="card-note">This check does not cover everything on this list. Pick the items lowest on the list to trim or move, or change a due date on Treasury. Nothing is wrong with you or your plan. It is just math, and you can change it.</div>') +
        '</div>';
    }).join('');
    ppSec.innerHTML = '<div class="section-head"><h2>Pay Plan</h2><div class="sub">What to do with each paycheck, in order. It is built from your Treasury bills, sinking funds, savings goals, Emergency Fund, and extra debt payment. Add or change any of them and this page updates.</div></div>' +
      titheCard + cards;
    bindTithe();
    ppSec.querySelectorAll('input[type=checkbox][data-k]').forEach(cb => cb.onchange = () => { if (cb.checked) state.ppDone[cb.dataset.k] = true; else delete state.ppDone[cb.dataset.k]; save(false); renderPayPlan(); });
  }

  /* ---------- Spending: plan vs. real ---------- */
  function groupOf(cat) { for (const g of Object.keys(CATS)) if (CATS[g].includes(cat)) return g; return 'life'; }

  function renderSpending() {
    ensure();
    const ms = state.spend.merchants, keys = Object.keys(ms);
    if (!keys.length) {
      spSec.innerHTML = '<div class="section-head"><h2>Spending: your plan and where it really went</h2></div><div class="card"><div class="card-note">Nothing here yet, and that is fine. Statements are optional. When you want to see where your money really goes, open the Import tab, read your statements, and leave the box checked that saves spending totals. Only totals by store are saved. The statements themselves are not kept.</div></div>';
      return;
    }
    const monthSet = new Set(); const byCat = {};
    keys.forEach(k => {
      const m = ms[k];
      Object.keys(m.months).forEach(mk => {
        const ym = mk.split('|')[0]; monthSet.add(ym);
        const cat = m.cat; (byCat[cat] = byCat[cat] || { total: 0, items: {} });
        byCat[cat].total += -m.months[mk];
        byCat[cat].items[k] = (byCat[cat].items[k] || 0) + (-m.months[mk]);
      });
    });
    const nM = Math.max(1, monthSet.size);
    const c = calc();
    const planOf = cat => {
      if (cat === '10% Tithe') return c.income * (+state.tithePct || 0) / 100;
      return state.overhead.filter(o => o.action !== 'Prune (Cancel)' && o.tier === cat).reduce((t, o) => t + (+o.cost || 0), 0);
    };
    const avg = cat => ((byCat[cat] && byCat[cat].total) || 0) / nM;
    const diffTxt = (a, p) => { const d = a - p; if (Math.abs(d) < 1) return 'on plan'; return (d > 0 ? money0(d) + ' over' : money0(-d) + ' under'); };
    const catBlock = cat => {
      const a = avg(cat), p = planOf(cat);
      const items = Object.keys((byCat[cat] || { items: {} }).items).sort((x, y) => byCat[cat].items[y] - byCat[cat].items[x]);
      return '<details class="spd"><summary><div class="sprow"><span>' + E(cat) + ' <span class="card-note">(' + items.length + (items.length === 1 ? ' store' : ' stores') + ')</span></span><span><b>' + money0(a) + '</b> real &nbsp; <span class="card-note">plan ' + money0(p) + ' · ' + diffTxt(a, p) + '</span></span></div></summary>' +
        items.map(k => '<div class="spmer"><span class="nm">' + E(ms[k].name) + '</span><span>' + money0(byCat[cat].items[k] / nM) + '/mo</span><select data-m="' + E(k) + '">' + ALL_CATS.map(o => '<option value="' + E(o) + '"' + (o === ms[k].cat ? ' selected' : '') + '>' + E(o) + '</option>').join('') + '</select></div>').join('') +
        '</details>';
    };
    let html = '<div class="section-head"><h2>Spending: your plan and where it really went</h2><div class="sub">Real spending is the average per month from the ' + nM + ' month' + (nM === 1 ? '' : 's') + ' of statements you imported. Tap any line to see the stores in it. If a store is in the wrong place, change it and every month moves with it. The app remembers your choice.</div></div>';
    // Plain-language gaps
    const notes = [];
    ['wall', 'exp'].forEach(g => CATS[g].forEach(cat => { const a = avg(cat), p = planOf(cat); if (p > 0 || a > 0) { const d = a - p; if (Math.abs(d) >= Math.max(25, p * 0.15)) notes.push({ d: Math.abs(d), t: cat + ' averaged ' + money0(a) + ' a month. Your plan has ' + money0(p) + '.' }); } }));
    const lifeReal = CATS.life.reduce((t, k) => t + avg(k), 0), lifePlan = c.lifestyle.monthly;
    if (lifeReal > 0) notes.push({ d: Math.abs(lifeReal - lifePlan), t: 'Everyday and fun spending averaged ' + money0(lifeReal) + ' a month. Your plan has ' + money0(Math.max(0, lifePlan)) + ' for it.' });
    notes.sort((a, b) => b.d - a.d);
    if (notes.length) html += '<div class="card"><div class="card-title">Where you planned versus where it went</div>' + notes.slice(0, 5).map(n => '<div class="card-note" style="margin:6px 0">' + E(n.t) + '</div>').join('') + '<div class="card-note">These are just numbers to learn from. A gap can mean the plan needs updating, not that anything went wrong.</div></div>';
    ['wall', 'exp', 'life'].forEach(g => {
      const list = CATS[g].filter(k => byCat[k] || planOf(k) > 0);
      if (!list.length) return;
      html += '<div class="card"><div class="card-title">' + GROUP_NAME[g] + '</div>' + list.map(catBlock).join('') +
        (g === 'life' ? '<div class="card-note">Plan for everyday and fun, all together: ' + money0(Math.max(0, lifePlan)) + ' a month. Real: ' + money0(lifeReal) + '.</div>' : '') + '</div>';
    });
    const skips = CATS.skip.filter(k => byCat[k]);
    if (skips.length) html += '<div class="card"><div class="card-title">Not counted as spending</div><div class="card-note">Moves between your own accounts, paychecks, and refunds. Open a line to move a store if it landed here by mistake.</div>' + skips.map(catBlock).join('') + '</div>';
    html += '<div class="card"><div class="card-note">Saved: totals by store and month only (updated ' + E(state.spend.updated || '') + '). <button class="btn btn-ghost btn-sm" id="spClear">Remove saved spending totals</button></div></div>';
    spSec.innerHTML = html;
    spSec.querySelectorAll('select[data-m]').forEach(s => s.onchange = () => { const m = ms[s.dataset.m]; m.cat = s.value; m.userSet = true; save(); renderSpending(); });
    const clr = document.getElementById('spClear');
    if (clr) clr.onclick = () => { if (confirm('Remove all saved spending totals? Your bills and goals are not touched.')) { state.spend = { merchants: {} }; save(); renderSpending(); } };
  }

  function renderBoth() { try { renderPayPlan(); renderSpending(); } catch (e) { console.warn(e); } }
  // Keep a Tithe line in The Four Walls on Treasury, figured from your income. Type your own amount there and it stops updating.
  function syncTithe() {
    try {
      ensure();
      const pct = +state.tithePct || 0;
      const inc = calc().income;
      const line = state.overhead.find(o => o.tier === '10% Tithe');
      if (!line) {
        if (pct > 0 && inc > 0 && !state.titheLineAdded) {
          const cost = Math.round(inc * pct) / 100;
          state.overhead.unshift({ category: 'Tithe (' + pct + '%)', cost, tier: '10% Tithe', action: 'Keep (Essential)', due: 1, kind: 'wall', auto: true, autoCost: cost });
          state.titheLineAdded = true; save(false);
        }
        return;
      }
      state.titheLineAdded = true;
      if (line.auto) {
        if (Math.abs((+line.cost || 0) - (+line.autoCost || 0)) > 0.005) { delete line.auto; delete line.autoCost; save(false); return; }
        const cost = Math.round(inc * pct) / 100;
        if (Math.abs(cost - (+line.cost || 0)) > 0.005) { line.cost = cost; line.autoCost = cost; line.category = 'Tithe (' + pct + '%)'; save(false); }
      }
    } catch (e) { console.warn(e); }
  }
  const origSave = save; let rbT = 0;
  save = function () { const r = origSave.apply(this, arguments); clearTimeout(rbT); rbT = setTimeout(function () { syncTithe(); renderBoth(); }, 0); return r; };
  const origAll = renderAll;
  renderAll = function () { syncTithe(); origAll(); renderBoth(); };
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'money-init') return;
    setTimeout(() => { if (state.income && state.income.length) { const t = document.querySelector('.tab[data-panel="payplan"]'); if (t) t.click(); } }, 50);
  });
})();
