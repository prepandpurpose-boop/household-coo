// Household COO: People. Parents add people, choose a role, and choose who can see money or add to the Command Center.
(function () {
  const ROLE = { owner: 'Owner', adult: 'Parent', kid: 'Household member', helper: 'Helper', staff: 'Staff' };
  const mgr = () => S.me && ['owner', 'adult'].includes(S.me.role);

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
        return '<div class="row"><div style="flex:1"><div style="font-weight:600">' + name + '</div><div class="note">' + ROLE[m.role] + (m.can_see_money ? ' · sees money' : '') + '</div></div></div>';
      }
      return '<div class="card" style="margin:10px 0;padding:14px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div style="font-weight:600">' + name + '</div>' +
        '<button class="btn ghost" style="min-height:32px;padding:0 12px" data-ppdel="' + id + '">Remove</button></div>' +
        '<label for="r_' + id + '">Role</label><select id="r_' + id + '" data-pprole="' + id + '">' + roleOpts(m.role) + '</select>' +
        (m.role === 'adult' ? '<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" data-ppmoney="' + id + '"' + (m.can_see_money ? ' checked' : '') + '> Can see money</label>' : '<p class="note" style="margin:8px 0 0">Cannot see money.</p>') +
        (m.role !== 'adult' ? '<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" data-ppadd="' + id + '"' + (S.cal.perms[id] ? ' checked' : '') + '> Can add to the Command Center for everyone</label>' : '') +
(m.role !== 'adult' ? '<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" data-pptv="' + id + '"' + ((S.cal.tv || {})[id] ? ' checked' : '') + '> This is the TV screen account. It opens only the family board and cannot leave it.</label>' : '') +
        '</div>';
    }).join('');
    const pend = S.invites.length ? '<div class="card" style="margin-top:18px"><h2>Waiting to sign in</h2><p class="note">They join your household the first time they sign in with this email.</p>' +
      S.invites.map(i => '<div class="row"><div style="flex:1"><div style="font-weight:600">' + esc(i.display_name || i.email) + '</div><div class="note">' + esc(i.email) + ' · ' + esc(ROLE[i.role] || i.role) + '</div></div><button class="btn ghost" style="min-height:32px;padding:0 12px" data-ppcancel="' + i.id + '">Cancel</button></div>').join('') + '</div>' : '';
    const msg = S.ppMsg ? '<div class="card" style="margin-top:18px;border-left:4px solid var(--gold)"><p style="margin:0">' + esc(S.ppMsg) + '</p></div>' : '';
    const form = '<div class="card" style="margin-top:18px"><h2>Add a person</h2>' +
      '<label for="pp_name">Name</label><input id="pp_name" placeholder="First name">' +
      '<label for="pp_email">Email they will sign in with</label><input id="pp_email" type="email" autocomplete="off">' +
      '<label for="pp_role">Role</label><select id="pp_role">' + roleOpts('kid') + '</select>' +
      '<label id="pp_mrow" style="display:none;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="pp_money"> Can see money</label>' +
      '<p class="note">Household members, helpers and staff never see money.</p>' +
      '<div style="margin-top:12px"><button class="btn" id="pp_add">Add person</button></div></div>';
    return '<div class="eyebrow">' + esc(S.hh.name) + '</div><h1>People.</h1><div class="rule"></div>' +
      '<div class="card"><h2>Your household</h2>' + (rows || '<p class="note">Just you so far.</p>') + '</div>' + msg + form + pend;
  };

  window.peopleBind = function () {
    if (S.page !== 'people' || !S.invites) return;
    const $$ = s => document.querySelector(s);
    const rs = $$('#pp_role');
    if (rs) rs.onchange = () => { $$('#pp_mrow').style.display = rs.value === 'adult' ? 'flex' : 'none'; };
    const add = $$('#pp_add');
    if (add) add.onclick = async () => {
      const email = $$('#pp_email').value.trim(), name = $$('#pp_name').value.trim(), role = $$('#pp_role').value;
      if (!email) { alert('Type their email.'); return; }
      add.disabled = true;
      const { data, error } = await sb.rpc('invite_member', { h: S.me.household_id, p_email: email, p_name: name, p_role: role, p_money: role === 'adult' && $$('#pp_money').checked });
      add.disabled = false;
      if (error) { alert(error.message); return; }
      S.ppMsg = data === 'added'
        ? (name || email) + ' is now in your household.'
        : (name || email) + ' is added. Tell them to open household-coo.vercel.app and sign in with ' + email + '. They will land in your household.';
      await reloadMembers(); await loadInvites(); render();
    };
    document.querySelectorAll('[data-pprole]').forEach(s => s.onchange = async () => {
      const m = S.members.find(x => x.user_id === s.dataset.pprole);
      const { error } = await sb.rpc('update_member', { h: S.me.household_id, u: m.user_id, p_role: s.value, p_money: false });
      if (error) alert(error.message);
      if (s.value !== 'adult') { delete S.cal.perms[m.user_id]; }
      await reloadMembers(); render();
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
    document.querySelectorAll('[data-ppcancel]').forEach(b => b.onclick = async () => {
      await sb.from('household_invites').delete().eq('id', b.dataset.ppcancel);
      await loadInvites(); render();
    });
  };
})();
