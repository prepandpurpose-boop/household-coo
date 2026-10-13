// Household COO: People. Parents add people, choose a role, and choose who can see money or add to the Command Center.
(function () {
  const ROLE = { owner: 'Owner', adult: 'Parent', kid: 'Household member', helper: 'Helper', staff: 'Staff' };
  const mgr = () => S.me && ['owner', 'adult'].includes(S.me.role);
  const ppcss = document.createElement('style');
  ppcss.textContent = 'label.pp-chk{display:flex;flex-direction:row;gap:10px;align-items:center;justify-content:flex-start;text-align:left;font-size:15px}label.pp-chk input[type=checkbox]{width:22px;height:22px;min-height:22px;min-width:22px;flex:0 0 22px;margin:0;padding:0}';
  document.head.appendChild(ppcss);

  // Household member type: adult (own private money) or child, 13 and under (parents manage their money).
  // Kept in its own record so it is never overwritten by calendar saves.
  const lc = x => String(x || '').trim().toLowerCase();
  async function readTypes() {
    try {
      const { data } = await sb.from('app_data').select('data').eq('household_id', S.me.household_id).eq('module', 'member_types').maybeSingle();
      const t = (data && data.data) || {};
      t.adult = t.adult || {}; t.adultEmail = t.adultEmail || {};
      return t;
    } catch (e) { return { adult: {}, adultEmail: {} }; }
  }
  async function writeTypes(change) {
    const t = await readTypes(); change(t); S.types = t;
    const { error } = await sb.from('app_data').upsert({ household_id: S.me.household_id, module: 'member_types', data: t, updated_at: new Date().toISOString() }, { onConflict: 'household_id,module' });
    if (error) { alert('That change did not save. Please try again.'); return false; }
    return true;
  }
  window.isAdultRec = function (m) {
    const t = S.types || {};
    return !!(m && m.role === 'kid' && ((t.adult || {})[m.user_id] || (m.user_id === (S.user && S.user.id) && (t.adultEmail || {})[lc(S.user.email)])));
  };
  window.isAdultMember = function () { return isAdultRec(S.me); };
  window.loadTypes = async function () {
    S.types = await readTypes();
    // An adult who was invited by email: record their account so parents see the right type.
    if (S.me.role === 'kid' && !S.types.adult[S.user.id] && S.types.adultEmail[lc(S.user.email)]) {
      await writeTypes(t => { t.adult[S.user.id] = true; });
    }
  };

  // Sends the invitation email. Returns 'sent', 'exists', 'limit' or 'failed'.
  async function sendInvite(email) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch('/api/invite', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : '') }, body: JSON.stringify({ email, household_id: S.me.household_id }) });
      const j = await r.json().catch(() => ({}));
      return j.status || 'failed';
    } catch (e) { return 'failed'; }
  }
  const inviteMsg = (st, who, email) => st === 'sent' ? 'An invitation email was sent to ' + email + '. ' + who + ' opens it, taps the button, and chooses a password.'
    : st === 'limit' ? who + ' is added, but the email could not be sent right now because too many were sent. Wait a few minutes and tap Send email again.'
    : st === 'exists' ? who + ' already has an account. They open household-coo.vercel.app and sign in with ' + email + '.'
    : who + ' is added, but the email did not send. Tap Send email again, or tell them to open household-coo.vercel.app, tap Create an account, and use ' + email + '.';

  window.loadInvites = async function () {
    try {
      const { data } = await sb.from('household_invites').select('*').eq('household_id', S.me.household_id).order('created_at');
      S.invites = data || [];
    } catch (e) { S.invites = []; }
  };
  async function reloadMembers() {
    const { data } = await sb.from('household_members').select('*').eq('household_id', S.me.household_id);
    S.members = data || S.members;
    const me = S.members.find(m => m.user_id === S.user.id);
    if (me) S.me = me;
  }
  async function saveCal() {
    const { error } = await sb.from('app_data').upsert({ household_id: S.me.household_id, module: 'calendar', data: S.cal, updated_at: new Date().toISOString() }, { onConflict: 'household_id,module' });
    if (error) alert(error.message);
  }
  const roleOpts = sel => ['adult', 'kid', 'helper', 'staff'].map(r => '<option value="' + r + '"' + (r === sel ? ' selected' : '') + '>' + ROLE[r] + '</option>').join('');

  window.peopleView = function () {
    if (!mgr()) return '<div class="eyebrow">Household</div><h1>People.</h1><div class="rule"></div><div class="card"><p class="note">Only parents can add and manage people.</p></div>';
    if (!S.invites) { loadInvites().then(() => { if (S.page === 'people') render(); }); return '<div class="eyebrow">Household</div><h1>Loading.</h1>'; }
    S.cal = S.cal || {}; S.cal.perms = S.cal.perms || {};
    const rows = S.members.map(m => {
      const id = m.user_id, me = id === S.user.id, owner = m.role === 'owner';
      const name = esc(nm(id)) + (me ? ' (you)' : '');
      if (owner || me) {
        return '<div class="row"><div style="flex:1"><div style="font-weight:600">' + name + '</div><div class="note">' + (isAdultRec(m) ? 'Adult household member · private money' : ROLE[m.role]) + (m.can_see_money ? ' · sees money' : '') + '</div></div></div>';
      }
      return '<div class="card" style="margin:10px 0;padding:14px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div style="font-weight:600">' + name + '</div>' +
        '<button class="btn ghost" style="min-height:32px;padding:0 12px" data-ppdel="' + id + '">Remove</button></div>' +
        '<label for="r_' + id + '">Role</label><select id="r_' + id + '" data-pprole="' + id + '">' + roleOpts(m.role) + '</select>' +
        (m.role === 'kid' ? '<label for="t_' + id + '">Type</label><select id="t_' + id + '" data-pptype="' + id + '"><option value="adult"' + (isAdultRec(m) ? ' selected' : '') + '>Adult</option><option value="child"' + (isAdultRec(m) ? '' : ' selected') + '>Child, 13 and under</option></select>' : '') +
        (m.role === 'adult' ? '<label class="pp-chk" style="margin-top:10px"><input type="checkbox" data-ppmoney="' + id + '"' + (m.can_see_money ? ' checked' : '') + '> Can see money</label>'
          : (m.role === 'kid' && isAdultRec(m) ? '<p class="note" style="margin:8px 0 0">Has their own private Money and Receipts. You cannot see them.</p>'
          : (m.role === 'kid' ? '<p class="note" style="margin:8px 0 0">Their money is in Members\' money. You manage it.</p>' : '<p class="note" style="margin:8px 0 0">Cannot see money.</p>'))) +
        (m.role !== 'adult' ? '<label class="pp-chk" style="margin-top:10px"><input type="checkbox" data-ppadd="' + id + '"' + (S.cal.perms[id] ? ' checked' : '') + '> Can add to the Command Center for everyone</label>' : '') +
(m.role !== 'adult' ? '<label class="pp-chk" style="margin-top:10px"><input type="checkbox" data-pptv="' + id + '"' + ((S.cal.tv || {})[id] ? ' checked' : '') + '> This is the TV screen account. It opens only the family board and cannot leave it.</label>' : '') +
        '</div>';
    }).join('');
    const pend = S.invites.length ? '<div class="card" style="margin-top:18px"><h2>Waiting to sign in</h2><p class="note">They join your household the first time they sign in with this email.</p>' +
      S.invites.map(i => '<div class="row"><div style="flex:1"><div style="font-weight:600">' + esc(i.display_name || i.email) + '</div><div class="note">' + esc(i.email) + ' · ' + esc(ROLE[i.role] || i.role) + '</div></div><button class="btn ghost" style="min-height:32px;padding:0 12px;margin-right:8px" data-ppresend="' + esc(i.email) + '" data-ppname="' + esc(i.display_name || i.email) + '">Send email</button><button class="btn ghost" style="min-height:32px;padding:0 12px" data-ppcancel="' + i.id + '">Cancel</button></div>').join('') + '</div>' : '';
    const msg = S.ppMsg ? '<div class="card" style="margin-top:18px;border-left:4px solid var(--gold)"><p style="margin:0">' + esc(S.ppMsg) + '</p></div>' : '';
    const form = '<div class="card" style="margin-top:18px"><h2>Add a person</h2>' +
      '<label for="pp_name">Name</label><input id="pp_name" placeholder="First name">' +
      '<label for="pp_email">Email they will sign in with</label><input id="pp_email" type="email" autocomplete="off">' +
      '<label for="pp_role">Role</label><select id="pp_role">' + roleOpts('kid') + '</select>' +
      '<div id="pp_trow"><label for="pp_type">Is this person an adult or a child?</label><select id="pp_type"><option value="adult">Adult</option><option value="child">Child, 13 and under</option></select>' +
      '<p class="note" id="pp_tnote"></p></div>' +
      '<label id="pp_mrow" class="pp-chk" style="display:none;margin-top:10px"><input type="checkbox" id="pp_money"> Can see money</label>' +
      '<p class="note">Helpers and staff never see money.</p>' +
      '<div style="margin-top:12px"><button class="btn" id="pp_add">Add person</button></div></div>';
    const ex = 'yourname+tv@gmail.com';
const tvHelp = '<div class="card" style="margin-top:18px"><h2>Set up a TV screen</h2>' +
'<p class="note">Show the family board on a TV without putting a parent account on it. The TV gets its own sign-in that can only see the board.</p>' +
'<ol style="padding-left:20px;line-height:1.6;margin:10px 0">' +
'<li><b>Add a person</b> in the form above. Name: TV. Role: Staff. Email: use your own email and type +tv before the @ sign. For example, if your email is yourname@gmail.com, the TV email is <b>' + esc(ex) + '</b>. You do not need to create a new email. Mail sent to that address arrives in your regular inbox.</li>' +
'<li><b>On the TV</b>, open household-coo.vercel.app. Tap Create an account. Type the same TV email and make a password. Write the password down.</li>' +
'<li><b>Back on this screen</b>, find TV under Your household and tick This is the TV screen account.</li>' +
'<li><b>Reload the TV.</b> It shows the family board only. It cannot open anything else.</li></ol>' +
'<p class="note">The + sign works with Gmail and Google Workspace email. If your email provider does not accept it, use a different email address that you can receive mail at.</p></div>';
return '<div class="eyebrow">' + esc(S.hh.name) + '</div><h1>People.</h1><div class="rule"></div>' +
      '<div class="card"><h2>Your household</h2>' + (rows || '<p class="note">Just you so far.</p>') + '</div>' + msg + form + pend + tvHelp;
  };

  window.peopleBind = function () {
    if (S.page !== 'people' || !S.invites) return;
    const $$ = s => document.querySelector(s);
    const rs = $$('#pp_role');
    const ts = $$('#pp_type'), tnote = () => {
      const kid = rs.value === 'kid';
      $$('#pp_trow').style.display = kid ? 'block' : 'none';
      $$('#pp_tnote').textContent = ts.value === 'adult'
        ? 'Adults get their own private Money and Receipts. Parents cannot see them.'
        : 'Children use Members\' money, which parents manage.';
    };
    if (rs) rs.onchange = () => { $$('#pp_mrow').style.display = rs.value === 'adult' ? 'flex' : 'none'; tnote(); };
    if (ts) ts.onchange = tnote;
    if (rs) tnote();
    const add = $$('#pp_add');
    if (add) add.onclick = async () => {
      const email = $$('#pp_email').value.trim(), name = $$('#pp_name').value.trim(), role = $$('#pp_role').value;
      if (!email) { alert('Type their email.'); return; }
      add.disabled = true;
      const before = S.members.map(x => x.user_id), isAdultKid = role === 'kid' && $$('#pp_type').value === 'adult';
      const { data, error } = await sb.rpc('invite_member', { h: S.me.household_id, p_email: email, p_name: name, p_role: role, p_money: role === 'adult' && $$('#pp_money').checked });
      add.disabled = false;
      if (error) { alert(error.message); return; }
      if (data === 'added') S.ppMsg = (name || email) + ' is now in your household.';
      else { S.ppMsg = 'Sending the invitation email.'; const st = await sendInvite(email); S.ppMsg = inviteMsg(st, name || email, email); }
      await reloadMembers();
      if (isAdultKid) {
        const fresh = S.members.filter(x => !before.includes(x.user_id)).map(x => x.user_id);
        await writeTypes(t => { fresh.forEach(u => { t.adult[u] = true; }); if (data !== 'added') t.adultEmail[lc(email)] = true; });
      }
      await loadInvites(); render();
    };
    document.querySelectorAll('[data-pprole]').forEach(s => s.onchange = async () => {
      const m = S.members.find(x => x.user_id === s.dataset.pprole);
      const { error } = await sb.rpc('update_member', { h: S.me.household_id, u: m.user_id, p_role: s.value, p_money: false });
      if (error) alert(error.message);
      if (s.value !== 'adult') { delete S.cal.perms[m.user_id]; }
      await reloadMembers(); render();
    });
    document.querySelectorAll('[data-pptype]').forEach(s => s.onchange = async () => {
      const u = s.dataset.pptype, adult = s.value === 'adult';
      if (!adult && !confirm('Make ' + nm(u) + ' a child? Their private money stays private and will not be shown to you. They will use Members\' money instead.')) { render(); return; }
      await writeTypes(t => { if (adult) t.adult[u] = true; else delete t.adult[u]; });
      render();
    });
    document.querySelectorAll('[data-ppmoney]').forEach(c => c.onchange = async () => {
      const m = S.members.find(x => x.user_id === c.dataset.ppmoney);
      const { error } = await sb.rpc('update_member', { h: S.me.household_id, u: m.user_id, p_role: m.role, p_money: c.checked });
      if (error) alert(error.message);
      await reloadMembers(); render();
    });
    document.querySelectorAll('[data-ppadd]').forEach(c => c.onchange = async () => {
      if (c.checked) S.cal.perms[c.dataset.ppadd] = true; else delete S.cal.perms[c.dataset.ppadd];
      await saveCal(); render();
    });
    document.querySelectorAll('[data-pptv]').forEach(c => c.onchange = async () => {
S.cal.tv = S.cal.tv || {}; if (c.checked) S.cal.tv[c.dataset.pptv] = true; else delete S.cal.tv[c.dataset.pptv];
await saveCal(); render();
});
document.querySelectorAll('[data-ppdel]').forEach(b => b.onclick = async () => {
      if (!confirm('Remove ' + nm(b.dataset.ppdel) + ' from your household?')) return;
      const { error } = await sb.rpc('remove_member', { h: S.me.household_id, u: b.dataset.ppdel });
      if (error) alert(error.message);
      await reloadMembers(); render();
    });
    document.querySelectorAll('[data-ppresend]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Sending';
      const st = await sendInvite(b.dataset.ppresend);
      S.ppMsg = inviteMsg(st, b.dataset.ppname, b.dataset.ppresend); render();
    });
    document.querySelectorAll('[data-ppcancel]').forEach(b => b.onclick = async () => {
      await sb.from('household_invites').delete().eq('id', b.dataset.ppcancel);
      await loadInvites(); render();
    });
  };
})();
