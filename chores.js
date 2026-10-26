// Household COO: Chores. A parent assigns a chore with steps and a deadline. The person does it and sends a photo.
// Nothing counts as done until a parent approves the photo. Overdue chores show on the Command Center and the TV board,
// and phone reminders go out from /api/push (owner at the deadline, again a few hours later, parents the next day).
(function () {
  const pad = n => String(n).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const mgr = () => S.me && ['owner', 'adult'].includes(S.me.role);
  const BUCKET = 'chore-photos';
  const DEFAULT_TIME = '20:00';

  // Starter chore library. Each one has the steps and the photo that proves it is done.
  const LIB = [
    { key: 'bathroom', title: 'Clean the bathroom', proof: 'One photo of the whole bathroom from the door: sink, toilet, tub and floor all in the shot.',
      steps: ['Pick up towels, clothes and trash. Take the trash out of the can.', 'Spray the sink, counter, toilet (inside and out) and tub or shower. Let it sit 2 minutes.', 'Scrub the toilet bowl with the brush. Wipe the seat, lid, tank and base.', 'Scrub the sink and counter. Wipe the faucet and mirror until there are no spots.', 'Scrub the tub or shower walls and floor. Rinse.', 'Sweep, then mop the floor. Put a clean towel and a new trash bag in.'] },
    { key: 'kitchen', title: 'Clean the kitchen', proof: 'One photo of the counters, sink and stove together. The sink must be empty.',
      steps: ['Put away everything that is out: food, dishes, mail.', 'Load the dishwasher or wash the dishes. Dry and put them away. The sink is empty when you are done.', 'Scrub the sink and wipe the faucet.', 'Wipe the counters, the stove top and the front of the fridge and microwave.', 'Wipe the inside of the microwave.', 'Take the trash out if it is more than half full.', 'Sweep the floor.'] },
    { key: 'trash', title: 'Take out the trash and recycling', proof: 'One photo of the empty cans inside with new bags in them.',
      steps: ['Tie up the kitchen trash bag and take it to the outside can.', 'Empty every small trash can in the house (bathrooms, bedrooms, office) into one bag and take it out.', 'Take the recycling out.', 'Put a new bag in every can.', 'On pickup day, roll the cans to the curb. The next day, bring them back.'] },
    { key: 'laundry', title: 'Do the laundry', proof: 'One photo of the clean clothes folded and put away, with the laundry basket empty.',
      steps: ['Sort into darks and lights. Check pockets.', 'Wash one load. Use the right amount of detergent.', 'Move it to the dryer right away so it does not sour. Clean the lint screen first.', 'Take it out as soon as the dryer stops so it does not wrinkle.', 'Fold or hang everything and put it away in the right place.', 'Leave the basket empty and the laundry area clean.'] },
    { key: 'floors', title: 'Vacuum and mop the floors', proof: 'One photo of the biggest floor area, clean, with nothing left on it.',
      steps: ['Pick up everything on the floor: shoes, bags, toys, cords.', 'Vacuum every room, including under the edges of furniture. Empty the vacuum when it is full.', 'Sweep the hard floors.', 'Mop the hard floors with the floor cleaner. Start at the far end and work toward the door.', 'Let the floor dry before anyone walks on it.', 'Put the vacuum and mop away.'] },
    { key: 'bedroom', title: 'Clean your bedroom', proof: 'One photo from the door showing the bed made and the floor clear.',
      steps: ['Make the bed. Pull the sheet and blanket flat. Pillows at the top.', 'Pick up all clothes. Dirty ones go to the laundry. Clean ones get put away.', 'Take all dishes, cups and trash out of the room.', 'Clear the floor and the top of the dresser and nightstand.', 'Vacuum or sweep the floor.'] },
    { key: 'living', title: 'Clean the living room', proof: 'One photo of the whole room from the doorway: couch straight, tables clear, floor clear.',
      steps: ['Pick up everything that does not belong: cups, dishes, shoes, mail, chargers. Put each thing where it goes.', 'Straighten the couch cushions and fold the blankets.', 'Wipe the coffee table and end tables.', 'Dust the TV stand and shelves.', 'Vacuum or sweep the floor, including under the coffee table.'] }
  ];

  const css = document.createElement('style');
  css.textContent = [
    '.ch-pill{display:inline-block;font-size:12px;font-weight:600;border-radius:99px;padding:3px 10px;margin-left:6px;color:#fff;background:var(--blue)}',
    '.ch-pill.od{background:var(--red)}.ch-pill.wait{background:var(--gold);color:#14213d}.ch-pill.redo{background:#a33}.ch-pill.ok{background:#2f8f4e}',
    '.ch-photo{width:120px;height:120px;object-fit:cover;border-radius:10px;border:1px solid var(--line);background:#eef2f8;cursor:pointer}',
    '.ch-steps{padding-left:20px;line-height:1.5;margin:6px 0}',
    '.ch-row{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--track)}.ch-row:first-child{border-top:0}',
    '.ch-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ch-acts .btn{min-height:38px;padding:0 14px}',
    '.ch-banner{background:#fbeeea;border:1px solid #e3b7ae;border-left:5px solid var(--red);border-radius:12px;padding:12px 16px;margin-bottom:18px}'
  ].join('');
  document.head.appendChild(css);

  const nmOf = id => { const m = S.members.find(x => x.user_id === id); return m ? (m.display_name || m.role) : 'Someone'; };
  const chores = () => (S.tasks || []).filter(t => t.kind === 'chore');
  const isOverdue = t => (t.status === 'open' || t.status === 'redo') && t.due_at && new Date(t.due_at).getTime() < Date.now();
  window.choreOverdue = () => chores().filter(isOverdue);
  window.choreWaiting = () => chores().filter(t => t.status === 'submitted');
  const fmtDue = t => {
    if (!t.due_at) return t.due_date || '';
    const d = new Date(t.due_at);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const stepsList = t => { const s = String(t.steps || '').split('\n').map(x => x.trim()).filter(Boolean); return s.length ? '<ol class="ch-steps">' + s.map(x => '<li>' + esc(x.replace(/^\d+[.)]\s*/, '')) + '</li>').join('') + '</ol>' : '<p class="note">No steps were added.</p>'; };
  window.chorePill = t => {
    if (t.status === 'done') return '<span class="ch-pill ok">Approved</span>';
    if (t.status === 'submitted') return '<span class="ch-pill wait">Waiting for approval</span>';
    if (t.status === 'redo') return '<span class="ch-pill redo">Sent back</span>';
    if (isOverdue(t)) return '<span class="ch-pill od">Overdue</span>';
    return '<span class="ch-pill">Chore</span>';
  };

  async function photoUrl(path) {
    if (!path) return '';
    try { const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600); return (data && data.signedUrl) || ''; } catch (e) { return ''; }
  }
  async function tellPush(task_id, event) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : '') }, body: JSON.stringify({ mode: 'notify', task_id, event }) });
    } catch (e) { /* reminders are extra; the chore is already saved */ }
  }
  function overlay(body) {
    let o = document.getElementById('ch_ov');
    if (!o) { o = document.createElement('div'); o.id = 'ch_ov'; o.style.cssText = 'position:fixed;inset:0;background:rgba(20,33,61,.6);z-index:9999;overflow:auto;padding:20px 12px'; document.body.appendChild(o); o.onclick = e => { if (e.target === o) o.remove(); }; }
    o.innerHTML = '<div style="background:#fff;max-width:' + (S.tv ? '1100px' : '640px') + ';margin:0 auto;border-radius:14px;padding:22px 24px;line-height:1.45;font-size:' + (S.tv ? 'clamp(20px,3vh,32px)' : '16px') + '">' + body + '<div style="margin-top:16px"><button class="btn ghost" id="ch_x">Close</button></div></div>';
    document.getElementById('ch_x').onclick = () => o.remove();
    return o;
  }
  window.choreOpen = function (id) {
    const t = chores().find(x => x.id === id); if (!t) return;
    const body = chorePill(t) + '<h2 style="margin:8px 0 4px">' + esc(t.title) + '</h2><div class="note">' + esc(nmOf(t.assigned_to)) + ' · due ' + esc(fmtDue(t)) + '</div>' +
      '<h3 style="margin-top:14px">How to do it</h3>' + stepsList(t) +
      (t.proof_hint ? '<h3>The photo that proves it</h3><p>' + esc(t.proof_hint) + '</p>' : '') +
      (t.redo_note ? '<p style="color:var(--red)"><b>Sent back:</b> ' + esc(t.redo_note) + '</p>' : '') +
      (t.photo_path ? '<div id="ch_ovp"></div>' : '');
    overlay(body);
    if (t.photo_path) photoUrl(t.photo_path).then(u => { const p = document.getElementById('ch_ovp'); if (p && u) p.innerHTML = '<h3>Photo</h3><img src="' + u + '" style="max-width:100%;border-radius:10px">'; });
  };

  // ---------- phone reminders ----------
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = (s + p).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(r); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
  const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && !!(window.COO_CONFIG && COO_CONFIG.VAPID_PUBLIC_KEY);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  async function pushState() {
    if (!canPush()) return 'no';
    if (Notification.permission === 'denied') return 'denied';
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); return sub ? 'on' : 'off'; } catch (e) { return 'off'; }
  }
  async function pushOn() {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(COO_CONFIG.VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert({ user_id: S.user.id, household_id: S.me.household_id, endpoint: j.endpoint, keys: j.keys }, { onConflict: 'endpoint' });
    if (error) { console.warn(error.message); return false; }
    return true;
  }
  async function pushOff() {
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); } } catch (e) { }
  }
  function pushCard(state) {
    const iphone = /iPhone|iPad/.test(navigator.userAgent) && !standalone();
    let body;
    if (state === 'no') body = iphone ? '<p>To get chore reminders on this iPhone: tap the Share button in Safari, tap <b>Add to Home Screen</b>, then open Household COO from your home screen and come back here.</p>' : '<p class="note">This browser cannot show reminders.</p>';
    else if (state === 'denied') body = '<p class="note">Reminders are blocked for this site in your phone settings. Allow notifications for Household COO there, then come back.</p>';
    else if (state === 'on') body = '<p>Reminders are on for this phone.</p><button class="btn ghost" id="ch_pushoff">Turn off on this phone</button>';
    else body = '<p>Get a reminder on this phone when a chore is due, when it is overdue, and when a photo is waiting for you.</p><button class="btn" id="ch_pushon">Turn on reminders</button>';
    return '<div class="card" style="margin-top:18px"><h2>Phone reminders</h2>' + body + '<div class="note" id="ch_pushmsg"></div></div>';
  }

  // ---------- views ----------
  function rowParent(t, photo) {
    return '<div class="ch-row"><div style="flex:1"><div style="font-weight:600">' + esc(t.title) + chorePill(t) + '<span class="chip">' + esc(nmOf(t.assigned_to)) + '</span></div>' +
      '<div class="note">Due ' + esc(fmtDue(t)) + (t.repeat && t.repeat !== 'none' ? ' · repeats ' + (t.repeat === 'daily' ? 'every day' : 'every week') : '') + '</div>' +
      (t.redo_note && t.status === 'redo' ? '<div class="note" style="color:var(--red)">Sent back: ' + esc(t.redo_note) + '</div>' : '') +
      '<div class="ch-acts"><button class="btn ghost" data-chopen="' + t.id + '">Steps</button>' +
      (t.status === 'submitted' ? '<button class="btn" data-chok="' + t.id + '">Approve</button><button class="btn ghost" data-chredo="' + t.id + '">Send back</button>' : '') +
      '<button class="btn ghost" data-chdel="' + t.id + '" aria-label="Remove">&#10005;</button></div></div>' +
      (photo && t.photo_path ? '<img class="ch-photo" data-chpic="' + esc(t.photo_path) + '" alt="Photo sent in" data-chopen2="' + t.id + '">' : '') + '</div>';
  }
  function rowMine(t) {
    const open = t.status === 'open' || t.status === 'redo';
    return '<div class="ch-row"><div style="flex:1"><div style="font-weight:600">' + esc(t.title) + chorePill(t) + '</div>' +
      '<div class="note">Due ' + esc(fmtDue(t)) + '</div>' +
      (t.redo_note && t.status === 'redo' ? '<div class="note" style="color:var(--red)">Sent back: ' + esc(t.redo_note) + '. Fix it today and send a new photo.</div>' : '') +
      (t.proof_hint && open ? '<div class="note">Photo needed: ' + esc(t.proof_hint) + '</div>' : '') +
      '<div class="ch-acts"><button class="btn ghost" data-chopen="' + t.id + '">Steps</button>' +
      (open ? '<button class="btn" data-chsend="' + t.id + '">Done. Add my photo</button>' : '') + '</div></div></div>';
  }
  const byDue = (a, b) => String(a.due_at || a.due_date || '').localeCompare(String(b.due_at || b.due_date || ''));

  window.choresView = function () {
    const all = chores().slice().sort(byDue);
    const head = '<div class="eyebrow">' + esc(S.hh.name) + '</div><h1>Chores.</h1><div class="rule"></div>';
    const od = all.filter(isOverdue);
    const banner = od.length ? '<div class="ch-banner"><b>' + od.length + ' overdue.</b> ' + od.map(t => esc(t.title) + ' (' + esc(nmOf(t.assigned_to)) + ')').join(', ') + '</div>' : '';
    if (!mgr()) {
      const mine = all.filter(t => t.assigned_to === S.user.id);
      const open = mine.filter(t => t.status !== 'done'), done = mine.filter(t => t.status === 'done').slice(-10).reverse();
      return head + banner + '<div class="card"><h2>My chores · ' + open.length + '</h2>' + (open.map(rowMine).join('') || '<p class="note">Nothing right now.</p>') +
        (done.length ? '<h2 style="margin-top:18px">Approved</h2>' + done.map(rowMine).join('') : '') + '</div>' + '<div id="ch_push"></div>';
    }
    const waiting = all.filter(t => t.status === 'submitted');
    const open = all.filter(t => t.status === 'open' || t.status === 'redo');
    const done = all.filter(t => t.status === 'done').sort((a, b) => String(b.approved_at || '').localeCompare(String(a.approved_at || ''))).slice(0, 15);
    const people = S.members.filter(m => m.user_id !== S.user.id).concat(S.members.filter(m => m.user_id === S.user.id));
    const add = '<div class="card" style="margin-top:18px"><h2>Add a chore</h2>' +
      '<label for="ch_lib">Chore</label><select id="ch_lib">' + LIB.map(c => '<option value="' + c.key + '">' + esc(c.title) + '</option>').join('') + '<option value="custom">Something else</option></select>' +
      '<div id="ch_customwrap" style="display:none"><label for="ch_title">What is the chore</label><input id="ch_title" placeholder="Clean the garage"><div style="margin-top:8px"><button class="btn ghost" id="ch_write">Write the steps for me</button> <span class="note" id="ch_writemsg"></span></div></div>' +
      '<label for="ch_steps">Steps (one per line). Change anything to fit your house.</label><textarea id="ch_steps" style="min-height:150px"></textarea>' +
      '<label for="ch_proof">The photo that proves it is done</label><input id="ch_proof">' +
      '<div class="cal-two"><div><label for="ch_who">Who does it</label><select id="ch_who">' + people.map(m => '<option value="' + m.user_id + '">' + (m.user_id === S.user.id ? 'Me' : esc(nmOf(m.user_id))) + '</option>').join('') + '</select></div>' +
      '<div><label for="ch_rep">Repeats</label><select id="ch_rep"><option value="none">Just once</option><option value="daily">Every day</option><option value="weekly">Every week</option></select></div></div>' +
      '<div class="cal-two"><div><label for="ch_date">Due date</label><input id="ch_date" type="date" value="' + todayISO() + '"></div><div><label for="ch_time">Due by</label><input id="ch_time" type="time" value="' + DEFAULT_TIME + '"></div></div>' +
      '<p class="note">A photo is required on every chore. It is not done until you approve the photo. Reminders go to them at the deadline and a few hours later; if it is still not done the next day you get the reminder too.</p>' +
      '<div style="margin-top:12px"><button class="btn" id="ch_add">Add chore</button></div></div>';
    return head + banner +
      '<div class="card"><h2>Needs your approval · ' + waiting.length + '</h2>' + (waiting.map(t => rowParent(t, true)).join('') || '<p class="note">No photos waiting.</p>') + '</div>' +
      '<div class="card" style="margin-top:18px"><h2>Open · ' + open.length + '</h2>' + (open.map(t => rowParent(t, false)).join('') || '<p class="note">No open chores.</p>') + '</div>' +
      add + '<div id="ch_push"></div>' +
      (done.length ? '<div class="card" style="margin-top:18px"><h2>Approved</h2>' + done.map(t => '<div class="ch-row"><div style="flex:1"><div class="done-t" style="font-weight:600">' + esc(t.title) + '</div><div class="note">' + esc(nmOf(t.assigned_to)) + ' · approved ' + esc(fmtDue({ due_at: t.approved_at })) + '</div></div><button class="btn ghost" style="min-height:32px;padding:0 10px" data-chdel="' + t.id + '" aria-label="Remove">&#10005;</button></div>').join('') + '</div>' : '');
  };

  // Short summary for the Command Center and the kids' task page.
  window.choreSummary = function () {
    const od = choreOverdue(), w = mgr() ? choreWaiting() : [];
    if (!od.length && !w.length) return '';
    const mine = x => mgr() || x.assigned_to === S.user.id;
    const a = od.filter(mine).map(t => esc(t.title) + ' (' + esc(nmOf(t.assigned_to)) + ')');
    return '<div class="ch-banner">' + (a.length ? '<div><b>Overdue chores:</b> ' + a.join(', ') + '</div>' : '') + (w.length ? '<div><b>' + w.length + ' photo' + (w.length > 1 ? 's' : '') + ' waiting for your approval.</b></div>' : '') +
      '<div style="margin-top:8px"><button class="btn ghost" style="min-height:34px;padding:0 12px" id="ch_go">Open chores</button></div></div>';
  };

  // ---------- actions ----------
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const m = 1400, s = Math.min(1, m / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => b ? res(b) : rej(new Error('bad')), 'image/jpeg', 0.82); };
      img.onerror = () => rej(new Error('That picture could not be opened.'));
      img.src = url;
    });
  }
  function sendPhoto(t) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment';
    i.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.appendChild(i);
    i.addEventListener('change', async () => {
      const f = i.files && i.files[0]; setTimeout(() => { try { i.remove(); } catch (e) { } }, 60000);
      if (!f) return;
      overlay('<h2 style="margin-top:0">Sending your photo</h2><p>One moment.</p>');
      try {
        const blob = await shrink(f);
        const path = S.me.household_id + '/' + t.id + '-' + Date.now() + '.jpg';
        const { error: ue } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (ue) throw new Error('The photo could not be saved. Try again.');
        const { error } = await sb.from('tasks').update({ status: 'submitted', photo_path: path, submitted_at: new Date().toISOString(), submitted_by: S.user.id }).eq('id', t.id);
        if (error) throw new Error('The photo was saved but the chore could not be updated. Try again.');
        tellPush(t.id, 'submitted');
        const o = document.getElementById('ch_ov'); if (o) o.remove();
        await loadTasks(); render();
      } catch (e) { overlay('<h2 style="margin-top:0">That did not work</h2><p>' + esc(e.message) + '</p>'); }
    });
    i.click();
  }
  async function approve(t) {
    const { error } = await sb.from('tasks').update({ status: 'done', approved_at: new Date().toISOString(), approved_by: S.user.id, redo_note: null }).eq('id', t.id);
    if (error) { alert('That did not save. Please try again.'); return; }
    tellPush(t.id, 'approved');
    if (t.repeat === 'daily' || t.repeat === 'weekly') {
      // Line up the next one from the same deadline.
      const d = t.due_at ? new Date(t.due_at) : new Date();
      d.setDate(d.getDate() + (t.repeat === 'daily' ? 1 : 7));
      while (d.getTime() < Date.now()) d.setDate(d.getDate() + (t.repeat === 'daily' ? 1 : 7));
      const due_date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      await sb.from('tasks').insert({ household_id: S.me.household_id, title: t.title, kind: 'chore', steps: t.steps, proof_hint: t.proof_hint, assigned_to: t.assigned_to, shared: true, due_date, due_time: pad(d.getHours()) + ':' + pad(d.getMinutes()), due_at: d.toISOString(), repeat: t.repeat, status: 'open', reminders: {} });
    }
    await loadTasks(); render();
  }
  async function sendBack(t) {
    const note = window.prompt('What needs to be fixed? This goes to ' + nmOf(t.assigned_to) + '.');
    if (note === null) return;
    const { error } = await sb.from('tasks').update({ status: 'redo', redo_note: note.trim() || 'Please do it again.', reminders: {} }).eq('id', t.id);
    if (error) { alert('That did not save. Please try again.'); return; }
    tellPush(t.id, 'redo');
    await loadTasks(); render();
  }
  async function writeSteps(title, msgEl) {
    msgEl.textContent = 'Writing.';
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : '') }, body: JSON.stringify({
        systemPrompt: 'You write household chore instructions for a family app. Plain words a teenager or adult can follow with no questions. No health or safety claims. Reply with JSON only: {"steps":["..."],"proof":"..."}. steps: 4 to 8 short steps in order, each one thing to do, each a full sentence. proof: one sentence describing the single photo that proves the chore is finished.',
        userPrompt: 'Chore: ' + title }) });
      const j = await r.json();
      const text = (j.content && j.content[0] && j.content[0].text) || '';
      const m = text.match(/\{[\s\S]*\}/); const o = m ? JSON.parse(m[0]) : null;
      if (!o || !Array.isArray(o.steps)) throw new Error('x');
      document.getElementById('ch_steps').value = o.steps.join('\n');
      if (o.proof) document.getElementById('ch_proof').value = o.proof;
      msgEl.textContent = 'Done. Change anything you like.';
    } catch (e) { msgEl.textContent = 'Could not write them. Type the steps yourself.'; }
  }

  window.choresBind = function () {
    const go = document.getElementById('ch_go'); if (go) go.onclick = () => { S.page = 'chores'; shell(); };
    document.querySelectorAll('[data-chopen],[data-chopen2]').forEach(b => b.onclick = () => choreOpen(b.dataset.chopen || b.dataset.chopen2));
    document.querySelectorAll('[data-chpic]').forEach(img => photoUrl(img.dataset.chpic).then(u => { if (u) img.src = u; }));
    document.querySelectorAll('[data-chsend]').forEach(b => b.onclick = () => { const t = chores().find(x => x.id === b.dataset.chsend); if (t) sendPhoto(t); });
    document.querySelectorAll('[data-chok]').forEach(b => b.onclick = () => { const t = chores().find(x => x.id === b.dataset.chok); if (t && confirm('Approve "' + t.title + '"?')) approve(t); });
    document.querySelectorAll('[data-chredo]').forEach(b => b.onclick = () => { const t = chores().find(x => x.id === b.dataset.chredo); if (t) sendBack(t); });
    document.querySelectorAll('[data-chdel]').forEach(b => b.onclick = async () => {
      const t = chores().find(x => x.id === b.dataset.chdel); if (!t || !confirm('Remove "' + t.title + '"?')) return;
      await sb.from('tasks').delete().eq('id', t.id); await loadTasks(); render();
    });
    if (S.page !== 'chores') return;
    const ph = document.getElementById('ch_push');
    if (ph) pushState().then(st => {
      ph.innerHTML = pushCard(st);
      const on = document.getElementById('ch_pushon'), off = document.getElementById('ch_pushoff'), msg = document.getElementById('ch_pushmsg');
      if (on) on.onclick = async () => { on.disabled = true; const ok = await pushOn().catch(() => false); if (ok) render(); else { on.disabled = false; msg.textContent = 'Reminders could not be turned on. Check that notifications are allowed for this site.'; } };
      if (off) off.onclick = async () => { await pushOff(); render(); };
    });
    const lib = document.getElementById('ch_lib');
    if (lib) {
      const fill = () => {
        const c = LIB.find(x => x.key === lib.value);
        document.getElementById('ch_customwrap').style.display = c ? 'none' : '';
        document.getElementById('ch_steps').value = c ? c.steps.join('\n') : '';
        document.getElementById('ch_proof').value = c ? c.proof : '';
      };
      lib.onchange = fill; fill();
      document.getElementById('ch_write').onclick = () => { const t = document.getElementById('ch_title').value.trim(); if (!t) { alert('Type what the chore is first.'); return; } writeSteps(t, document.getElementById('ch_writemsg')); };
      document.getElementById('ch_add').onclick = async () => {
        const c = LIB.find(x => x.key === lib.value);
        const title = c ? c.title : document.getElementById('ch_title').value.trim();
        const steps = document.getElementById('ch_steps').value.trim(), proof = document.getElementById('ch_proof').value.trim();
        const who = document.getElementById('ch_who').value, date = document.getElementById('ch_date').value, time = document.getElementById('ch_time').value || DEFAULT_TIME, repeat = document.getElementById('ch_rep').value;
        if (!title) { alert('Type what the chore is.'); return; }
        if (!steps) { alert('Add the steps so they know how it is supposed to be done.'); return; }
        if (!who) { alert('Pick who does it. A chore needs one person.'); return; }
        if (!date) { alert('Pick a due date.'); return; }
        const due_at = new Date(date + 'T' + time + ':00');
        const b = document.getElementById('ch_add'); b.disabled = true;
        const { data, error } = await sb.from('tasks').insert({ household_id: S.me.household_id, title, kind: 'chore', steps, proof_hint: proof || null, assigned_to: who, shared: true, due_date: date, due_time: time, due_at: due_at.toISOString(), repeat, status: 'open', reminders: {} }).select('id').single();
        b.disabled = false;
        if (error) { alert('That did not save. Please try again.'); return; }
        if (data && data.id) tellPush(data.id, 'assigned');
        await loadTasks(); render();
      };
    }
  };
})();
