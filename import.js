// Household COO · Money · Import bank statements.
// Reads statements once, shows what it found, and only adds what you approve.
(function () {
  const panel = document.getElementById('import');
  if (!panel) return;
  const st = document.createElement('style');
  st.textContent = '.impRow input,.impRow select,#impList input{width:auto;min-width:0}.impRow input.ck{flex:0 0 22px;width:22px}.impRow input.dd{width:80px}.impRow select{max-width:230px}';
  document.head.appendChild(st);

  const TIERS_WALL = ['10% Tithe', 'Shelter (Wall 1)', 'Food (Wall 2)', 'Utilities (Wall 3)', 'Transportation (Wall 4)', 'Health Insurance', 'Life Insurance', 'Debt Minimums'];
  const TIERS_EXP = ['Phone & Internet', 'Streaming & Subscriptions', 'Memberships & Dues', 'Insurance (Other)', 'Personal & Discretionary', 'Other Recurring'];
  const FREQ = [['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly']];
  const MAX_BYTES = 3 * 1024 * 1024;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let files = []; // {file, label}
  let found = null;
  let pendingSpend = null, spendFailed = false;

  panel.innerHTML = `
  <div class="section-head"><h2>Import your bank statements</h2>
    <div class="sub">Add your last three months of statements and Household COO fills in your income, bills, and debts for you. You look it over, change anything you want, and choose what to add.</div></div>
  <div class="card">
    <div class="card-title">1. Choose your statements</div>
    <div class="card-note">PDF statements work best. Pictures and CSV downloads work too. You can add more than one account. Each file must be under 3 MB.</div>
    <input type="file" id="impFiles" multiple accept="application/pdf,image/png,image/jpeg,image/webp,.csv,text/csv" style="display:none">
    <button class="btn btn-green btn-sm" id="impPick">+ Choose files</button>
    <div id="impList" style="margin-top:14px"></div>
    <div class="card-note" style="margin-top:14px">Your files are sent once to be read and are not saved. Only the numbers you approve below are added to your Money.</div>
    <div style="margin-top:12px"><button class="btn btn-green" id="impRead" disabled>Read my statements</button> <span id="impStatus" class="card-note" style="margin-left:10px"></span></div>
  </div>
  <div id="impReview"></div>`;

  const $ = id => document.getElementById(id);

  function renderList() {
    $('impList').innerHTML = files.map((f, i) => `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <div style="flex:1 1 220px;min-width:180px"><strong>${esc(f.file.name)}</strong> <span class="card-note">${(f.file.size / 1024).toFixed(0)} KB</span></div>
        <input data-i="${i}" class="impLabel" value="${esc(f.label)}" placeholder="Account name (optional)" style="flex:1 1 200px;min-width:160px">
        <button class="btn btn-ghost btn-sm" data-rm="${i}">Remove</button>
      </div>`).join('') || '<div class="card-note">No files yet.</div>';
    $('impRead').disabled = !files.length;
    document.querySelectorAll('.impLabel').forEach(inp => inp.oninput = () => { files[+inp.dataset.i].label = inp.value; });
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { files.splice(+b.dataset.rm, 1); renderList(); });
  }
  renderList();

  $('impPick').onclick = () => $('impFiles').click();
  $('impFiles').onchange = e => {
    const msgs = [];
    for (const f of e.target.files) {
      if (f.size > MAX_BYTES) { msgs.push(f.name + ' is over 3 MB. Try a smaller file or a picture of the page.'); continue; }
      files.push({ file: f, label: '' });
    }
    e.target.value = '';
    renderList();
    $('impStatus').textContent = msgs.join(' ');
  };

  const toBase64 = file => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('read'));
    r.readAsDataURL(file);
  });

  async function call(payload) {
    const r = await fetch('/api/statement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    let data = {};
    try { data = await r.json(); } catch (e) { }
    if (!r.ok) {
      const m = r.status === 401 ? 'Please sign in again.' : r.status === 403 ? 'Money is not available for this account.' : (data.error || 'Something went wrong. Please try again.');
      throw new Error(m);
    }
    return data.text || '';
  }

  function cleanLines(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(l => /^\d{4}-\d{2}-\d{2}\|/.test(l));
  }

  function parseJson(text) {
    let t = String(text || '').replace(/```json|```/g, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < 0) throw new Error('parse');
    return JSON.parse(t.slice(a, b + 1));
  }

  $('impRead').onclick = async () => {
    const status = $('impStatus');
    $('impRead').disabled = true;
    $('impReview').innerHTML = '';
    let all = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        status.textContent = 'Step 1 of 3: reading file ' + (i + 1) + ' of ' + files.length + '. This takes a minute or two. Please wait and do not press the button again.';
        const name = f.file.name.toLowerCase();
        let payload;
        if (name.endsWith('.csv') || f.file.type === 'text/csv') {
          payload = { mode: 'extract', text: await f.file.text(), label: f.label || f.file.name };
        } else {
          payload = { mode: 'extract', mediaType: f.file.type || (name.endsWith('.pdf') ? 'application/pdf' : ''), data: await toBase64(f.file) };
        }
        const lines = cleanLines(await call(payload));
        if (!lines.length) throw new Error('I could not find transactions in ' + f.file.name + '. Try a PDF statement or a clear picture of the transaction list.');
        const tag = (f.label || '').replace(/\|/g, ' ').trim();
        all = all.concat(lines.map(l => tag ? l + '|' + tag : l));
      }
      status.textContent = 'Found ' + all.length + ' transactions. Step 2 of 3: putting your money picture together. Please keep waiting.';
      const today = new Date().toISOString().slice(0, 10);
      found = parseJson(await call({ mode: 'summarize', today, lines: all.join('\n') }));
      pendingSpend = null; spendFailed = false;
      try {
        status.textContent = 'Step 3 of 3: sorting your spending by store. Almost done, please keep waiting.';
        const agg = HC.prepSpend(all), keys = Object.keys(agg), cats = {}, unknown = [];
        keys.forEach(k => { const c = HC.knownCat(k); if (c) cats[k] = c; else unknown.push(k); });
        for (let i = 0; i < unknown.length; i += 120) {
          const chunk = unknown.slice(i, i + 120);
          const list = chunk.map((k, n) => (n + 1) + '|' + k + '|' + agg[k].count + '|' + agg[k].total.toFixed(2)).join('\n');
          const txt = await call({ mode: 'categorize', list });
          txt.split('\n').forEach(l => { const q = l.split('|'); const n = parseInt(q[0], 10); const c = (q[1] || '').trim(); if (n >= 1 && n <= chunk.length) cats[chunk[n - 1]] = HC.ALL_CATS.includes(c) ? c : 'Other everyday'; });
        }
        pendingSpend = { agg, cats };
      } catch (e2) { pendingSpend = null; spendFailed = true; }
      status.textContent = 'Done. I read ' + all.length + ' transactions. Your results are right below. Look them over, fix anything, then press the green button at the very bottom.';
      renderReview();
      try { $('impReview').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { }
    } catch (e) {
      status.textContent = (e.message === 'parse' ? 'I could not put that together.' : e.message) + ' Your files were not saved anywhere. Press the button to try again.';
    }
    $('impRead').disabled = !files.length;
  };

  const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  const sel = (opts, cur, cls) => `<select class="${cls}">${opts.map(o => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;

  function renderReview() {
    const f = found || {};
        const inc = f.income || [], debts = f.debts || [], notes = (f.notes || []).slice();
    let bills = (f.bills || []).slice();
    // Tithe: statements only show it if it was paid. Offer 10% of regular income as a starting line, editable.
    const hasTithe = bills.some(b => /tith|church|offering/i.test(String(b.name || '')) || b.tier === '10% Tithe');
    if (!hasTithe && inc.length) {
      const mult = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1 };
      const monthly = inc.reduce((t, r) => t + num(r.amount) * (mult[r.freq] || 1), 0);
      if (monthly > 0) {
        bills.unshift({ name: 'Tithe (10%)', monthlyCost: Math.round(monthly * 10) / 100, dueDay: 1, kind: 'wall', tier: '10% Tithe', variable: false });
        notes.push('I added a Tithe line at 10% of the deposits I found. Change the amount or uncheck it if that is not how you figure it.');
      }
    }
    $('impReview').innerHTML = `
    <div class="card">
      <div class="card-title">2. Here is what I found <span class="badge">Change anything</span></div>
      <div class="card-note">Uncheck anything you do not want. Fix any name or number. Nothing is added until you press the button at the bottom.</div>
      ${notes.length ? `<div class="priority-note">${notes.map(esc).join('<br>')}</div>` : ''}
      <h3 style="margin:14px 0 6px">Income</h3>
      ${inc.length ? inc.map((r, i) => `<div class="impRow" data-k="inc" data-i="${i}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <input type="checkbox" checked class="ck" style="width:22px;height:22px">
        <input class="nm" value="${esc(r.source)}" style="flex:2 1 180px">
        <input class="am" value="${esc(num(r.amount).toFixed(2))}" style="flex:1 1 100px">
        ${sel(FREQ, r.freq, 'fq')}
        <input type="date" class="dt" value="${esc(r.lastDate || '')}" style="flex:1 1 140px">
        ${sel(['Primary', 'Secondary/Side-Hustle'], r.type, 'ty')}
      </div>`).join('') : '<div class="card-note">No regular income found.</div>'}
      <h3 style="margin:18px 0 6px">Bills and regular spending (monthly)</h3>
      ${bills.length ? bills.map((r, i) => `<div class="impRow" data-k="bill" data-i="${i}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <input type="checkbox" checked class="ck" style="width:22px;height:22px">
        <input class="nm" value="${esc(r.name)}" style="flex:2 1 180px">
        <input class="am" value="${esc(num(r.monthlyCost).toFixed(2))}" style="flex:1 1 100px">
        <input class="dd" type="number" min="0" max="31" value="${esc(Math.max(0, Math.min(31, Math.round(num(r.dueDay)))))}" title="Day of the month it is paid. 0 means no set day." style="flex:0 1 80px">
        ${sel(r.kind === 'wall' ? TIERS_WALL : TIERS_EXP, r.tier, 'tr')}
        ${sel([['wall', 'Wall'], ['expense', 'Expense']], r.kind, 'kd')}
      </div>`).join('') : '<div class="card-note">No regular bills found.</div>'}
      ${bills.length ? '<div class="card-note">The small number is the day of the month it is paid. 0 means it does not have a set day.</div>' : ''}
      <h3 style="margin:18px 0 6px">Debt payments</h3>
      ${debts.length ? debts.map((r, i) => `<div class="impRow" data-k="debt" data-i="${i}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <input type="checkbox" checked class="ck" style="width:22px;height:22px">
        <input class="nm" value="${esc(r.name)}" style="flex:2 1 180px">
        <input class="am" value="${esc(num(r.minPayment).toFixed(2))}" style="flex:1 1 100px">
      </div>`).join('') + '<div class="card-note">Balances and interest rates are not on statements. You can fill them in on the Goals &amp; Debt tab.</div>' : '<div class="card-note">No debt payments found.</div>'}
      ${pendingSpend ? '<label style="display:flex;gap:10px;align-items:center;margin-top:18px;cursor:pointer"><input type="checkbox" id="impSpend" checked style="width:22px;height:22px"><span>Also save my spending totals by store, so I can see where my money really goes on the Spending tab. The statements themselves are not kept.</span></label>' : (spendFailed ? '<div class="card-note" style="margin-top:14px">I could not sort your spending this time. Your bills and income below still work.</div>' : '')}
      <div style="margin-top:18px"><button class="btn btn-green" id="impAdd">Add what is checked to my Money</button> <span id="impDone" class="card-note" style="margin-left:10px"></span></div>
    </div>`;
    document.querySelectorAll('.impRow[data-k="bill"]').forEach(row => {
      row.querySelector('.kd').onchange = () => {
        const list = row.querySelector('.kd').value === 'wall' ? TIERS_WALL : TIERS_EXP;
        row.querySelector('.tr').innerHTML = list.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
      };
    });
    $('impAdd').onclick = addChecked;
  }

  function addChecked() {
    const rows = [...document.querySelectorAll('.impRow')].filter(r => r.querySelector('.ck').checked);
    const have = (list, key, name) => list.some(x => String(x[key] || '').trim().toLowerCase() === name.trim().toLowerCase());
    let added = 0, skipped = 0;
    rows.forEach(r => {
      const k = r.dataset.k, name = r.querySelector('.nm').value.trim(), amt = num(r.querySelector('.am').value);
      if (!name) return;
      if (k === 'inc') {
        if (have(state.income, 'source', name)) { skipped++; return; }
        state.income.push({ source: name, amount: amt, freq: r.querySelector('.fq').value, anchor: r.querySelector('.dt').value || new Date().toISOString().slice(0, 10), type: r.querySelector('.ty').value, actuals: {} });
        added++;
      } else if (k === 'bill') {
        if (have(state.overhead, 'category', name)) { skipped++; return; }
        state.overhead.push({ category: name, cost: amt, tier: r.querySelector('.tr').value, action: 'Keep (Essential)', due: Math.max(0, Math.min(31, Math.round(num(r.querySelector('.dd').value)))), kind: r.querySelector('.kd').value });
        added++;
      } else if (k === 'debt') {
        if (have(state.debts, 'name', name)) { skipped++; return; }
        state.debts.push({ name, balance: 0, apr: 0, min: amt });
        added++;
      }
    });
    let spendSaved = false;
    const sp = document.getElementById('impSpend');
    if (pendingSpend && sp && sp.checked) { HC.mergeSpend(pendingSpend.agg, pendingSpend.cats); spendSaved = true; }
    save();
    renderAll();
    $('impDone').textContent = (spendSaved ? 'Spending totals saved. ' : '') + added + ' added' + (skipped ? ', ' + skipped + ' already in your Money and left alone' : '') + '. Open the Treasury tab to adjust anything.';
  }
})();
