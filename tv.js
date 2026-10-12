// Household COO: TV mode. A big, read-only family board for a TV or monitor. Shared items and meals only. No money.
(function () {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let timer = null, clock = null;
const TVN = [];

  const CSS = '<style>' +
    'body{background:#14213d}' +
    '#tv{min-height:100vh;color:#fff;padding:2.2vh 2.2vw;font-family:"Inter",system-ui,sans-serif}' +
    '#tv .top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:2vh;border-bottom:3px solid #C59B27;padding-bottom:1.4vh}' +
    '#tv .nm{font-family:"Cormorant Garamond",serif;font-size:clamp(28px,4.2vh,56px);font-weight:700}' +
    '#tv .dt{font-size:clamp(16px,2.6vh,34px);color:#e8d9a8}' +
    '#tv .tm{font-family:"Cormorant Garamond",serif;font-size:clamp(34px,6.4vh,84px);font-weight:700;color:#C59B27;line-height:1}' +
    '#tv .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1.4vh 1vw}' +
    '#tv .day{background:#1d2d52;border-radius:14px;padding:1.4vh 1vw;min-height:72vh}' +
    '#tv .day.today{background:#fff;color:#14213d;box-shadow:0 0 0 4px #C59B27}' +
    '#tv .dh{display:flex;justify-content:space-between;align-items:baseline;font-weight:800;font-size:clamp(17px,2.7vh,32px);margin-bottom:1vh;border-bottom:2px solid #C59B27;padding-bottom:.6vh}' +
    '#tv .dh span{font-size:.7em;font-weight:600;opacity:.75}' +
    '#tv .ml{font-size:clamp(14px,2.1vh,26px);margin:.6vh 0;line-height:1.25}' +
    '#tv .ml b{display:inline-block;min-width:1.4em;text-align:center;background:#2f7d4f;color:#fff;border-radius:6px;padding:0 .3em;margin-right:.4em;font-size:.8em}' +
    '#tv .it{font-size:clamp(15px,2.3vh,28px);margin:.8vh 0;line-height:1.25;font-weight:600}' +
    '#tv .it.done{text-decoration:line-through;opacity:.5}' +
    '#tv .none{opacity:.5;font-size:clamp(13px,1.9vh,22px)}' +
    '#tv .x{position:fixed;right:10px;top:8px;background:transparent;border:0;color:#fff;opacity:.15;font-size:22px;cursor:pointer}' +
    '#tv .x:hover{opacity:.9}' +
'#tv .tvc{cursor:pointer;border-radius:8px}' +
'#tv .tvc:focus{outline:4px solid #C59B27;outline-offset:2px}' +
'#tv .more{opacity:.7;font-size:.8em}' +
'#tv .tabs{display:flex;gap:1vw;align-items:center;margin-bottom:1.2vh;flex-wrap:wrap}' +
'#tv .tvb{min-height:5vh;padding:0 1.6vw;border-radius:10px;border:2px solid #C59B27;background:transparent;color:#fff;font-size:clamp(14px,2.4vh,28px);font-weight:700;cursor:pointer}' +
'#tv .tvb.on{background:#C59B27;color:#14213d}' +
'#tv .tvb:focus{outline:4px solid #fff;outline-offset:2px}' +
'#tv .mt{font-family:"Cormorant Garamond",serif;font-size:clamp(22px,4vh,48px);font-weight:700;color:#C59B27;margin:0 1vw}' +
'#tv .mg{display:grid;grid-template-columns:repeat(7,1fr);gap:.8vh .5vw}' +
'#tv .mh{text-align:center;font-weight:700;color:#e8d9a8;font-size:clamp(14px,2.2vh,26px)}' +
'#tv .mc{background:#1d2d52;border-radius:10px;padding:.8vh .5vw;min-height:11.5vh;overflow:hidden}' +
'#tv .mc.out{opacity:.45}' +
'#tv .mc.today{background:#fff;color:#14213d;box-shadow:0 0 0 4px #C59B27}' +
'#tv .mc>b{font-size:clamp(14px,2.4vh,28px)}' +
'#tv .mi{font-size:clamp(11px,1.7vh,20px);line-height:1.2;margin-top:.4vh;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
'#tv .mi b{color:#2f7d4f}' +
'#tv .mi.done{text-decoration:line-through;opacity:.5}' +
    '</style>';

  function monthHtml() {
const now = new Date(), base = new Date(now.getFullYear(), now.getMonth() + (S.tvMo || 0), 1);
const start = new Date(base.getFullYear(), base.getMonth(), 1 - base.getDay());
const todayS = iso(now);
let cells = DAYS.map(d => '<div class="mh">' + d.slice(0, 3) + '</div>').join('');
for (let i = 0; i < 42; i++) {
const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
if (i >= 35 && d.getMonth() !== base.getMonth()) break;
const ds = iso(d), r = (typeof cooDay === 'function') ? cooDay(ds) : { items: [], meals: [] };
const lines = r.items.map(x => '<div class="mi' + (x.done ? ' done' : '') + '">' + esc(x.title) + '</div>').concat(r.meals.map(x => '<div class="mi"><b>' + esc(x.slot[0].toUpperCase()) + '</b> ' + esc(x.m.title || 'Meal') + '</div>'));
cells += '<div class="mc tvc' + (d.getMonth() !== base.getMonth() ? ' out' : '') + (ds === todayS ? ' today' : '') + '" tabindex="0" data-mday="' + ds + '"><b>' + d.getDate() + '</b>' + lines.slice(0, 3).join('') + (lines.length > 3 ? '<div class="mi">+' + (lines.length - 3) + ' more</div>' : '') + '</div>';
}
return '<div class="mg">' + cells + '</div>';
}

function html() {
    const now = new Date();
    let cols = ''; TVN.length = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i), ds = iso(d);
      const r = (typeof cooDay === 'function') ? cooDay(ds) : { items: [], meals: [] };
      const meals = r.meals.map(x => '<div class="ml tvc" tabindex="0" data-slot="' + x.slot + '" data-day="' + ds + '"><b>' + esc(x.slot[0].toUpperCase()) + '</b>' + esc(x.m.title || 'Meal') + (x.m.steps && x.m.steps.length ? ' <span class="more">&#9656; recipe</span>' : '') + '</div>').join('');
      const items = r.items.map(x => { TVN.push({ it: x, ds }); return '<div class="it tvc' + (x.done ? ' done' : '') + '" tabindex="0" data-tn="' + (TVN.length - 1) + '">' + esc(x.title) + (x.notes ? ' <span class="more">&#9656; how to</span>' : '') + '</div>'; }).join('');
      cols += '<div class="day' + (i === 0 ? ' today' : '') + '"><div class="dh">' + (i === 0 ? 'Today' : DAYS[d.getDay()]) + '<span>' + (d.getMonth() + 1) + '/' + d.getDate() + '</span></div>' +
        meals + items + (!meals && !items ? '<div class="none">Nothing planned</div>' : '') + '</div>';
    }
    const mo = new Date(now.getFullYear(), now.getMonth() + (S.tvMo || 0), 1), wk = S.tvView === 'week';
const tabs = '<div class="tabs"><button class="tvb' + (wk ? '' : ' on') + '" data-tvv="month">Month</button><button class="tvb' + (wk ? ' on' : '') + '" data-tvv="week">Next 7 days</button>' + (wk ? '' : '<button class="tvb" data-tvm="-1">&#8249;</button><span class="mt">' + MONTHS[mo.getMonth()] + ' ' + mo.getFullYear() + '</span><button class="tvb" data-tvm="1">&#8250;</button>') + '</div>';
return CSS + '<div id="tv">' + (S.tvLocked ? '' : '<button class="x" id="tvx" aria-label="Close TV view">&#10005;</button>') +
      '<div class="top"><div><div class="nm">' + esc((S.hh && S.hh.name) || 'Household') + '</div><div class="dt" id="tvdate"></div></div><div class="tm" id="tvtime"></div></div>' +
      tabs + (wk ? '<div class="grid">' + cols + '</div>' : monthHtml()) + '</div>';
  }
  function tick() {
    const n = new Date(), t = document.getElementById('tvtime'), d = document.getElementById('tvdate');
    if (t) { let h = n.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; t.textContent = h + ':' + pad(n.getMinutes()) + ' ' + ap; }
    if (d) d.textContent = DAYS[n.getDay()] + ', ' + MONTHS[n.getMonth()] + ' ' + n.getDate();
  }
  function draw() {
    document.getElementById('root').innerHTML = html();
    const xb = document.getElementById('tvx'); if (xb) xb.onclick = stop;
document.querySelectorAll('#tv .tvb').forEach(b => b.onclick = () => {
if (b.dataset.tvv) S.tvView = b.dataset.tvv; else S.tvMo = (S.tvMo || 0) + (+b.dataset.tvm);
const sel = b.dataset.tvv ? '[data-tvv="' + b.dataset.tvv + '"]' : '[data-tvm="' + b.dataset.tvm + '"]';
draw();
const nb = document.querySelector('#tv ' + sel); if (nb) nb.focus();
});
document.querySelectorAll('#tv .tvc').forEach(el => {
el.onclick = () => { if (el.dataset.tn !== undefined) { const q = TVN[+el.dataset.tn]; if (q && window.cooItem) cooItem(q.it, q.ds); } else if (el.dataset.mday) { if (window.cooDayView) cooDayView(el.dataset.mday); } else if (window.cooRecipe) cooRecipe(el.dataset.day, el.dataset.slot); };
el.onkeydown = e => { if (e.key === 'Enter') el.click(); };
});
    tick();
  }
  function stop() {
if (S.tvLocked) return;
    clearInterval(timer); clearInterval(clock);
    S.tv = false;
    if (/[?&]tv=1/.test(location.search)) location.href = location.pathname; else { shell(); render(); }
  }
  async function refresh() {
    try { await loadTasks(); await loadKitchen(); await loadCal(); } catch (e) { console.warn(e); }
    if (S.tv && !document.getElementById('coo-ov')) draw();
  }
  window.tvStart = function () {
    S.tv = true; draw();
const f0 = document.querySelector('#tv .mc.today') || document.querySelector('#tv .tvc'); if (f0) f0.focus();
    clearInterval(timer); clearInterval(clock);
    timer = setInterval(refresh, 60000);
    clock = setInterval(tick, 15000);
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => { }); } catch (e) { }
  };
})();
