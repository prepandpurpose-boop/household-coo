// Household COO · Money · the Household COO subscription as a default bill.
// Every paying household gets one line in Recurring Expenses ("Household COO subscription") at its real plan:
// $39 a month or $349 a year. It counts in the budget and the Pay Plan like any other bill.
// The household can edit the amount, due date or plan, or remove it. The original default is kept next to the edit.
// Comped (free) households never get the line. The default follows the plan in the subscription record unless the household edited it.
(function () {
  const NAME = 'Household COO subscription';
  const PRICE = { monthly: 39, yearly: 349 };
  const r2 = n => Math.round(n * 100) / 100;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toISOString();
  const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + d.getFullYear(); };
  const per = plan => plan === 'yearly' ? 'a year' : 'a month';
  const usd = n => '$' + (Math.round(n * 100) % 100 === 0 ? Math.round(n).toLocaleString('en-US') : (+n).toFixed(2));
  const idx = () => state.overhead.findIndex(o => o.sys === 'coo');

  // The budget works in months, so a yearly plan counts as one twelfth of the year until it is paid.
  function monthly(e) { return e.plan === 'yearly' ? r2((+e.amount || 0) / 12) : r2(+e.amount || 0); }
  function apply(e) { e.cost = monthly(e); }

  // Billing day (and month, for yearly) from the subscription record's next billing date.
  function billing(sub) {
    const d = sub && sub.current_period_end ? new Date(sub.current_period_end) : null;
    if (!d || isNaN(d)) return { due: 0, dueMonth: 0 };
    return { due: d.getDate(), dueMonth: d.getMonth() };
  }

  function newEntry(plan, b) {
    const e = {
      category: NAME, tier: 'Streaming & Subscriptions', action: 'Keep (Essential)', kind: 'expense', sys: 'coo',
      plan, amount: PRICE[plan], due: b.due, dueMonth: b.dueMonth,
      defaultPlan: plan, defaultAmount: PRICE[plan], defaultDue: b.due, defaultDueMonth: b.dueMonth,
      edited: false, edits: [], note: ''
    };
    apply(e); return e;
  }

  // Returns true when the saved data changed.
  function sync(sub) {
    if (!sub || sub.status === 'unknown' || !state.overhead) return false;
    const i = idx();
    if (sub.status === 'comped') {
      if (i >= 0) { state.overhead.splice(i, 1); return true; }
      return false;
    }
    if (sub.status === 'canceled' || state.cooRemoved) return false;
    const plan = sub.plan === 'yearly' ? 'yearly' : 'monthly', b = billing(sub);
    if (i < 0) { state.overhead.push(newEntry(plan, b)); return true; }
    const e = state.overhead[i], before = JSON.stringify(e);
    // Keep the plan's current default on record, always.
    e.defaultPlan = plan; e.defaultAmount = PRICE[plan]; e.defaultDue = b.due; e.defaultDueMonth = b.dueMonth;
    // Follow Stripe unless the household changed it.
    if (!e.edited) { e.plan = plan; e.amount = PRICE[plan]; e.due = b.due; e.dueMonth = b.dueMonth; apply(e); }
    return JSON.stringify(e) !== before;
  }

  function log(e, what, from, to) { (e.edits = e.edits || []).push({ at: today(), what, from, to, note: '' }); e.edited = true; }
  function commit() { save(); renderAll(); }

  window.cooEdit = function (i, field, val) {
    const e = state.overhead[i]; if (!e || e.sys !== 'coo') return;
    if (field === 'amount') {
      const v = Math.max(0, parseFloat(val) || 0); if (v === +e.amount) return;
      log(e, 'Amount', usd(e.amount) + ' ' + per(e.plan), usd(v) + ' ' + per(e.plan)); e.amount = v;
    } else if (field === 'plan') {
      const p = val === 'yearly' ? 'yearly' : 'monthly'; if (p === e.plan) return;
      log(e, 'Plan', usd(e.amount) + ' ' + per(e.plan), usd(PRICE[p]) + ' ' + per(p)); e.plan = p; e.amount = PRICE[p];
    } else if (field === 'due') {
      const v = Math.max(0, Math.min(31, Math.round(parseFloat(val) || 0))); if (v === +e.due) return;
      log(e, 'Due day', e.due ? 'the ' + e.due : 'no date', v ? 'the ' + v : 'no date'); e.due = v;
    } else if (field === 'dueMonth') {
      const v = Math.max(0, Math.min(11, parseInt(val, 10) || 0)); if (v === +e.dueMonth) return;
      log(e, 'Due month', MONTHS[+e.dueMonth || 0], MONTHS[v]); e.dueMonth = v;
    }
    apply(e); commit();
  };
  window.cooReset = function (i) {
    const e = state.overhead[i]; if (!e || e.sys !== 'coo') return;
    log(e, 'Reset to default', usd(e.amount) + ' ' + per(e.plan), usd(e.defaultAmount) + ' ' + per(e.defaultPlan));
    e.plan = e.defaultPlan; e.amount = e.defaultAmount; e.due = e.defaultDue; e.dueMonth = e.defaultDueMonth;
    e.edited = false; apply(e); commit();
  };
  window.cooNote = function (i, v) {
    const e = state.overhead[i]; if (!e || e.sys !== 'coo') return;
    e.note = String(v || '').slice(0, 200);
    if (e.edits && e.edits.length) e.edits[e.edits.length - 1].note = e.note;
    save();
  };

  // How the Pay Plan describes this bill.
  window.cooBillNote = function (o) {
    if (o.plan === 'yearly') return 'Yearly bill of ' + usd(o.amount) + (+o.due >= 1 ? ' due ' + MONTHS[+o.dueMonth || 0].slice(0, 3) + ' ' + o.due : '') + '. Setting aside ' + usd(o.cost) + ' a month until it is paid.';
    return (+o.due >= 1 ? 'Due on the ' + (o.due + (o.due % 100 >= 11 && o.due % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[o.due % 10] || 'th'))) : 'No set date') + '. Month total ' + usd(o.cost) + '.';
  };

  // The row on Treasury under Recurring Expenses.
  const origRow = overheadRow;
  overheadRow = function (r, i, tiers, placeholder) {
    if (r.sys !== 'coo') return origRow(r, i, tiers, placeholder);
    const pruned = r.action === 'Prune (Cancel)', yearly = r.plan === 'yearly';
    const main = '<tr style="' + (pruned ? 'opacity:.6' : '') + '">' +
      '<td><input value="' + E(r.category) + '" disabled style="font-weight:700"></td>' +
      '<td><input type="number" step="0.01" min="0" value="' + (+r.amount || 0) + '" title="What you pay ' + per(r.plan) + '" onchange="cooEdit(' + i + ',\'amount\',this.value)"><div style="font-size:.75rem;color:var(--muted);margin-top:2px">' + per(r.plan) + '</div></td>' +
      '<td><input type="number" min="0" max="31" step="1" value="' + (r.due || 0) + '" title="Day of month it is due (0 = no fixed date)" onchange="cooEdit(' + i + ',\'due\',this.value)"></td>' +
      '<td><select onchange="cooEdit(' + i + ',\'plan\',this.value)"><option value="monthly"' + (yearly ? '' : ' selected') + '>Monthly plan</option><option value="yearly"' + (yearly ? ' selected' : '') + '>Yearly plan</option></select></td>' +
      '<td><select onchange="upd(\'overhead\',' + i + ',\'action\',this.value)">' + ACTIONS.map(t => '<option ' + (t === r.action ? 'selected' : '') + '>' + t + '</option>').join('') + '</select></td>' +
      '<td><button class="icon-btn" title="Remove" onclick="cooRemove(' + i + ')">✕</button></td></tr>';
    const dflt = usd(r.defaultAmount) + ' ' + per(r.defaultPlan);
    const monthSel = yearly ? '<div style="margin-top:6px">Yearly bill month <select style="width:auto;display:inline-block" onchange="cooEdit(' + i + ',\'dueMonth\',this.value)">' + MONTHS.map((m, k) => '<option value="' + k + '"' + (k === (+r.dueMonth || 0) ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>' : '';
    const last = (r.edits || []).slice(-3).reverse().map(x => '<div>' + E(fmtDate(x.at)) + ': ' + E(x.what) + ' ' + E(x.from) + ' to ' + E(x.to) + (x.note ? '. Note: ' + E(x.note) : '') + '</div>').join('');
    const detail = '<tr><td colspan="6" style="padding:0 8px 12px;font-size:.85rem;color:var(--muted)">' +
      '<div>Default from your plan: <strong>' + E(dflt) + '</strong>.' + (r.edited ? ' You changed it to <strong>' + E(usd(r.amount) + ' ' + per(r.plan)) + '</strong>. <button class="btn btn-sm" onclick="cooReset(' + i + ')">Use the default again</button>' : '') + '</div>' +
      (yearly ? '<div style="margin-top:6px">The budget and Pay Plan set aside <strong>' + E(usd(r.cost)) + ' a month</strong> until it is paid.</div>' : '') + monthSel +
      (r.edited ? '<div style="margin-top:6px"><label>Note (optional)<input value="' + E(r.note || '') + '" maxlength="200" placeholder="Why did you change it?" onchange="cooNote(' + i + ',this.value)" style="margin-top:4px"></label></div>' : '') +
      (last ? '<div style="margin-top:8px">' + last + '</div>' : '') + '</td></tr>';
    return main + detail;
  };

  window.cooRemove = function (i) {
    const e = state.overhead[i]; if (!e || e.sys !== 'coo') return;
    if (!confirm('Remove the Household COO subscription from your bills? It will not come back.')) return;
    state.overhead.splice(i, 1); state.cooRemoved = true; commit();
  };

  window.addEventListener('message', ev => {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== 'money-init') return;
    try { if (sync(ev.data.sub)) { save(false); renderAll(); } } catch (e) { console.warn(e); }
  });

  // Draw it once now in case data arrived before this file loaded.
  try { renderOverhead(); } catch (e) { /* not ready yet */ }
})();
