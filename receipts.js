// Household COO: Receipts (Money side). Scan a receipt, sort each line into a spending category, and see what is left this month.
(function () {
  const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(+n || 0).toFixed(2);
  const ymNow = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); };
  const dayNow = () => { const n = new Date(); return ymNow() + '-' + String(n.getDate()).padStart(2, '0'); };
  const OTHER = 'Other';
  let RC = null;

  // Spending categories come from the budget lines already in Money. Rent and tithe are bills, not receipts.
  function cats() {
    const seen = {}, out = [];
    ((S.mdata && S.mdata.overhead) || []).forEach(o => {
      const name = String(o.category || '').trim();
      if (!name || seen[name] || !(+o.cost > 0)) return;
      if (/tithe|\brent\b|mortgage/i.test(name + ' ' + (o.tier || ''))) return;
      seen[name] = 1; out.push({ name, budget: +o.cost });
    });
    return out;
  }
  const grocCat = () => (cats().find(c => /grocer/i.test(c.name)) || {}).name || OTHER;
  const fuelCat = () => (cats().find(c => /fuel|gas/i.test(c.name)) || {}).name || OTHER;
  const isGroc = c => /grocer/i.test(c || '');
  function guess(name) {
    if (/fuel|gasoline|unleaded|diesel|regular|premium|pump/i.test(name)) return fuelCat();
    return grocCat();
  }
  function spentThisMonth() {
    const m = {}, ym = ymNow();
    ((S.mdata && S.mdata.receipts) || []).forEach(r => {
      if (String(r.date).slice(0, 7) !== ym) return;
      (r.lines || []).forEach(l => { m[l.cat] = (m[l.cat] || 0) + (+l.amount || 0); });
    });
    return m;
  }

  function tiers() {
    const seen = {}, out = [];
    ((S.mdata && S.mdata.overhead) || []).forEach(o => { const t = o.tier || ''; if (!t || seen[t] || /tithe|shelter/i.test(t)) return; seen[t] = 1; out.push(t); });
    return out;
  }
  window.receiptsView = function () {
    if (!S.mdata) return '<div class="eyebrow">Money</div><h1>Receipts.</h1><div class="card"><p class="note">Loading.</p></div>';
    const sp = spentThisMonth(), cs = cats();
    const show = cs.filter(c => sp[c.name] > 0 || /grocer|fuel|gas/i.test(c.name));
    const rows = show.map(c => {
      const left = c.budget - (sp[c.name] || 0), pct = Math.max(0, Math.min(100, Math.round((sp[c.name] || 0) / c.budget * 100)));
      return '<div style="padding:10px 0;border-bottom:1px solid #E7ECF5"><div style="display:flex;justify-content:space-between;gap:10px"><b>' + esc(c.name) + '</b><span style="font-weight:600;color:' + (left < 0 ? '#a33' : '#2f8f4e') + '">' + money(left) + ' left</span></div>' +
        '<div class="note">Spent ' + money(sp[c.name] || 0) + ' of ' + money(c.budget) + ' this month</div>' +
        '<div style="background:#E7ECF5;border-radius:99px;height:10px;overflow:hidden;margin-top:6px"><div style="background:' + (left < 0 ? '#a33' : 'var(--gold)') + ';height:10px;width:' + pct + '%"></div></div></div>';
    }).join('');
    const other = sp[OTHER] > 0 ? '<div style="padding:10px 0"><b>Other</b> <span class="note">Spent ' + money(sp[OTHER]) + ' this month, not tied to a budget line</span></div>' : '';
    const ym = ymNow();
    const recent = ((S.mdata.receipts || []).filter(r => String(r.date).slice(0, 7) === ym)).slice().reverse().slice(0, 12).map(r =>
      '<div class="row"><div style="flex:1"><div style="font-weight:600">' + esc(r.store || 'Receipt') + '</div><div class="note">' + esc(r.date) + ' · ' + (r.lines || []).length + ' items</div></div><div style="font-weight:600">' + money(r.total) + '</div><button class="btn ghost" style="min-height:32px;padding:0 10px" data-rcrm="' + r.id + '" aria-label="Remove">&#10005;</button></div>').join('');
    return '<div class="eyebrow">' + esc(S.hh.name) + '</div><h1>Receipts.</h1><div class="rule"></div>' +
      '<div class="card"><h2>Scan a receipt</h2>' +
      '<p style="margin:8px 0">Take one clear picture of the whole receipt. I read each item and its price and sort every line into a spending category, like groceries or fuel. You check it and fix anything before it is saved.</p>' +
      '<p style="margin:8px 0">When you save: the amounts come off what is left in each category below, and the items you tick Add to inventory update your Kitchen prices and inventory.</p>' +
      '<div style="margin-top:12px"><button class="btn" id="rc_scan">Take or choose a receipt photo</button></div></div>' +
      '<div class="card" style="margin-top:18px"><h2>What is left this month</h2>' + (rows || '<p class="note">Nothing scanned yet.</p>') + other + '</div>' +
      '<div class="card" style="margin-top:18px"><h2>Add a budget line</h2><p class="note">Need a place to budget something, like household items or gas? Add it here. It shows up in Money and in the receipt categories.</p>' +
      '<label for="bl_name">What is it for</label><input id="bl_name" placeholder="Household items">' +
      '<label for="bl_amt">Monthly amount</label><input id="bl_amt" type="number" min="0" step="0.01">' +
      '<label for="bl_tier">Group</label><select id="bl_tier">' + tiers().map(x => '<option>' + esc(x) + '</option>').join('') + '</select>' +
      '<div style="margin-top:12px"><button class="btn ghost" id="bl_add">Add budget line</button></div></div>' +
      '<div class="card" style="margin-top:18px"><h2>Receipts this month</h2>' + (recent || '<p class="note">None yet.</p>') + '</div>';
  };

  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const m = 1800, s = Math.min(1, m / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82).split(',')[1]); };
      img.onerror = () => rej(new Error('That picture could not be opened.'));
      img.src = url;
    });
  }
  function overlay(html) {
    let o = document.getElementById('rc_ov');
    if (!o) { o = document.createElement('div'); o.id = 'rc_ov'; o.style.cssText = 'position:fixed;inset:0;background:rgba(20,33,61,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px'; document.body.appendChild(o); }
    o.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:18px">' + html + '</div>';
  }
  const closeOv = () => { const o = document.getElementById('rc_ov'); if (o) o.remove(); };
  function failure(msg) {
    overlay('<h2 style="margin-top:0">Could not read it</h2><p>' + esc(msg) + '</p><button class="btn" id="rc_x">Close</button>');
    document.getElementById('rc_x').onclick = closeOv;
  }
  function pick() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.appendChild(i);
    i.addEventListener('change', async () => {
      const f = i.files && i.files[0]; setTimeout(() => { try { i.remove(); } catch (e) { } }, 60000);
      if (!f) return;
      overlay('<h2 style="margin-top:0">Reading your receipt</h2><p>This takes about 15 seconds. Keep this open.</p>');
      try {
        const data = await shrink(f);
        const { data: { session } } = await sb.auth.getSession();
        const r = await fetch('/api/receipt', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : '') }, body: JSON.stringify({ mode: 'receipt', mediaType: 'image/jpeg', data }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.result) throw new Error(j.error || 'Could not read that picture.');
        RC = j.result; RC.items = (RC.items || []).map(it => ({ ...it, use: true, cat: guess(it.name), inv: isGroc(guess(it.name)) }));
        review();
      } catch (e) { failure(e.message); }
    });
    i.click();
  }
  function factor() {
    const used = RC.items.filter(i => i.use), sum = used.reduce((t, i) => t + (+i.price || 0), 0);
    const all = RC.items.reduce((t, i) => t + (+i.price || 0), 0);
    // Tax and fees: spread the difference between the receipt total and the item prices across the items.
    return +RC.total > 0 && all > 0 && +RC.total >= all ? { f: +RC.total / all, sum } : { f: 1, sum };
  }
  function catOpts(sel) {
    const names = cats().map(c => c.name).concat([OTHER]);
    return names.map(n => '<option value="' + esc(n) + '"' + (n === sel ? ' selected' : '') + '>' + esc(n) + '</option>').join('');
  }
  function review() {
    const fx = factor();
    const rows = RC.items.map((it, i) =>
      '<div style="display:flex;gap:8px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #E7ECF5">' +
      '<input type="checkbox" data-rcuse="' + i + '"' + (it.use ? ' checked' : '') + ' style="margin-top:8px;width:18px;height:18px">' +
      '<div style="flex:1;min-width:0"><input data-rcname="' + i + '" value="' + esc(it.name) + '" style="margin-bottom:4px">' +
      '<select data-rccat="' + i + '">' + catOpts(it.cat) + '</select>' +
'<label style="display:flex;gap:8px;align-items:center;margin:8px 0 0;font-size:14px;color:var(--blue)"><input type="checkbox" data-rcinv="' + i + '"' + (it.inv ? ' checked' : '') + ' style="width:20px;height:20px;min-height:0;flex:0 0 20px"> Add to inventory</label></div>' +
      '<div style="font-weight:700;font-size:14px;padding-top:8px">' + money(it.price) + '</div></div>').join('');
    const used = RC.items.filter(i => i.use);
    overlay('<h2 style="margin-top:0">' + esc(RC.store || 'Receipt') + '</h2>' +
      '<p class="note" style="margin:0 0 8px">' + esc(RC.date || 'No date on the receipt') + (+RC.total > 0 ? ' · Total ' + money(RC.total) : '') + '. Check each line. The left box counts the line in your spending. Tick Add to inventory only for items you want in your Kitchen inventory.' + (fx.f > 1.001 ? ' Tax is shared across the items so the amounts add up to what you paid.' : '') + '</p>' +
      '<div style="max-height:50vh;overflow:auto">' + (rows || '<p>No items were found. Try a clearer photo.</p>') + '</div>' +
      '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"><button class="btn" id="rc_save">Save receipt (' + used.length + ' in spending, ' + RC.items.filter(i => i.inv).length + ' to inventory)</button><button class="btn ghost" id="rc_cancel">Cancel</button></div>');
    document.getElementById('rc_cancel').onclick = closeOv;
    document.querySelectorAll('[data-rcuse]').forEach(c => c.onchange = () => { RC.items[+c.dataset.rcuse].use = c.checked; review(); });
    document.querySelectorAll('[data-rcname]').forEach(c => c.onchange = () => { RC.items[+c.dataset.rcname].name = c.value; });
    document.querySelectorAll('[data-rccat]').forEach(c => c.onchange = () => { RC.items[+c.dataset.rccat].cat = c.value; });
    document.querySelectorAll('[data-rcinv]').forEach(c => c.onchange = () => { RC.items[+c.dataset.rcinv].inv = c.checked; const b = document.getElementById('rc_save'); if (b) b.textContent = 'Save receipt (' + RC.items.filter(i => i.use).length + ' in spending, ' + RC.items.filter(i => i.inv).length + ' to inventory)'; });
document.getElementById('rc_save').onclick = save;
  }
  async function save() {
    const used = RC.items.filter(i => i.use); if (!used.length && !RC.items.some(i => i.inv)) { closeOv(); return; }
    const { f } = factor();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(RC.date || '') ? RC.date : dayNow();
    const lines = used.map(i => ({ name: i.name, cat: i.cat, amount: Math.round((+i.price || 0) * f * 100) / 100 }));
    const total = Math.round(lines.reduce((t, l) => t + l.amount, 0) * 100) / 100;
    S.mdata.receipts = S.mdata.receipts || [];
    if (used.length) S.mdata.receipts.push({ id: 'r' + Date.now().toString(36), date, store: RC.store || '', total, lines });
    S.mdata.receipts = S.mdata.receipts.slice(-300);
    const groc = RC.items.filter(i => i.inv).map(i => ({ name: i.name, sizeValue: i.sizeValue, sizeUnit: i.sizeUnit, qty: i.qty, price: i.price }));
    if (groc.length) {
      S.kdata = S.kdata || {};
      S.kdata.rcQueue = (S.kdata.rcQueue || []).concat([{ date, store: RC.store || '', items: groc }]);
      try { await saveKitchen(S.kdata); } catch (e) { console.warn(e); }
    }
    await saveMoney(S.mdata);
    closeOv(); render();
  }

  window.receiptsBind = function () {
    if (S.page !== 'receipts') return;
    const s = document.getElementById('rc_scan'); if (s) s.onclick = pick;
    const bl = document.getElementById('bl_add');
    if (bl) bl.onclick = async () => {
      const name = document.getElementById('bl_name').value.trim(), amt = parseFloat(document.getElementById('bl_amt').value), tier = document.getElementById('bl_tier').value;
      if (!name || !(amt > 0)) { alert('Type what it is for and a monthly amount.'); return; }
      const sample = (S.mdata.overhead || []).find(o => o.tier === tier) || {};
      S.mdata.overhead = S.mdata.overhead || [];
      S.mdata.overhead.push({ due: 0, cost: amt, kind: sample.kind || 'wall', tier, action: 'Keep (Essential)', category: name });
      await saveMoney(S.mdata); render();
    };
    document.querySelectorAll('[data-rcrm]').forEach(b => b.onclick = async () => {
      if (!confirm('Remove this receipt from your spending?')) return;
      S.mdata.receipts = (S.mdata.receipts || []).filter(r => r.id !== b.dataset.rcrm);
      await saveMoney(S.mdata); render();
    });
  };
})();
