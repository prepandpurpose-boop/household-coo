// Household COO: subscription gate. A household needs an active plan to use the app.
(function () {
  const MONTHLY = 'https://buy.stripe.com/bJe8wOgEndb8abR7S2ffy02';
  const YEARLY = 'https://buy.stripe.com/cNi8wO87Rgnkfwb0pAffy03';
  // active and trialing are paid. comped is a household we gave free access. past_due gets a grace period while the card is fixed.
  const OK = ['active', 'trialing', 'comped', 'past_due', 'unknown'];
  let poll = null;

  window.loadSub = async function () {
    try {
      const { data, error } = await sb.from('subscriptions').select('*').eq('household_id', S.me.household_id).maybeSingle();
      if (error) throw error;
      S.sub = data || null;
    } catch (e) {
      console.warn(e);
      S.sub = { status: 'unknown' }; // if we cannot check, never lock a family out
    }
  };
  window.subOk = function () { return !!(S.sub && OK.includes(S.sub.status)); };

  window.paywall = function () {
    clearInterval(poll);
    const mgr = S.me && ['owner', 'adult'].includes(S.me.role);
    const ref = '?client_reference_id=' + encodeURIComponent(S.me.household_id);
    const canceled = S.sub && S.sub.status === 'canceled';
    const head = '<div class="eyebrow">' + esc((S.hh && S.hh.name) || 'Household COO') + '</div><h1>' + (canceled ? 'Welcome back.' : 'One last step.') + '</h1><div class="rule"></div>';
    let body;
    if (mgr) {
      body = '<p style="margin:0 0 14px">' + (canceled ? 'Your plan has ended. Pick a plan to turn your household back on.' : 'Pick a plan to turn on Household COO for your whole household. Everyone you add is included.') + '</p>' +
        '<div class="card" style="margin:12px 0;padding:16px"><h2 style="margin:0">$97 a month</h2><p class="note" style="margin:6px 0 12px">Cancel any time.</p><a class="btn" style="display:inline-block;text-decoration:none;text-align:center" href="' + MONTHLY + ref + '">Choose monthly</a></div>' +
        '<div class="card" style="margin:12px 0;padding:16px;border:2px solid var(--gold)"><h2 style="margin:0">$997 a year</h2><p class="note" style="margin:6px 0 12px">Best value. Pay once for the year.</p><a class="btn" style="display:inline-block;text-decoration:none;text-align:center" href="' + YEARLY + ref + '">Choose yearly</a></div>' +
        '<p class="note" style="margin:14px 0 0">Payment is handled by Stripe. We never see your card. When you finish paying you come straight back here.</p>' +
        '<div style="margin-top:14px"><button class="btn ghost" id="pw_check">I have paid. Check again.</button></div>';
    } else {
      body = '<p>A parent needs to finish setting up Household COO before you can use it.</p><p class="note">Ask them to open household-coo.vercel.app and choose a plan.</p><div style="margin-top:14px"><button class="btn ghost" id="pw_check">Check again</button></div>';
    }
    document.getElementById('root').innerHTML = '<div class="center"><div class="card" style="max-width:520px">' + head + body +
      '<div style="margin-top:18px"><button class="btn ghost" id="pw_out" style="min-height:32px;padding:0 12px">Sign out</button></div><div class="note" id="pw_msg" style="margin-top:8px"></div></div></div>';
    const chk = async function (quiet) {
      await loadSub();
      if (subOk()) { clearInterval(poll); load(); return; }
      const m = document.getElementById('pw_msg'); if (m && !quiet) m.textContent = 'Not showing as paid yet. Give it a few seconds and try again.';
    };
    const b = document.getElementById('pw_check'); if (b) b.onclick = function () { chk(false); };
    document.getElementById('pw_out').onclick = async function () { await sb.auth.signOut(); location.href = location.pathname; };
    // after paying she lands back here, so keep checking quietly for a few minutes
    let n = 0; poll = setInterval(function () { if (++n > 40) { clearInterval(poll); return; } chk(true); }, 6000);
  };
})();
