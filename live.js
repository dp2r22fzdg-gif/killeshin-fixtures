/* Killeshin GAA live scores - viewer bar for index.html.
   Load live-config.js before this file. Shows nothing when no match is live. */
(function () {
  var C = window.KGAA_LIVE || {};
  var DB = (C.dbUrl || '').replace(/\/$/, '');
  if (!DB || DB.indexOf('YOUR-') > -1) return;
  var BOTTOM = C.bottomOffset != null ? C.bottomOffset : 78;
  var FAST = 20000, SLOW = 90000, HOUR = 3600000;
  var matches = {}, timer = null, open = false;

  var css = '' +
    '.kl-bar{position:fixed;left:12px;right:12px;bottom:calc(' + BOTTOM + 'px + env(safe-area-inset-bottom,0px));z-index:9998;' +
    'display:none;align-items:center;gap:12px;padding:10px 14px;background:#11492E;color:#fff;border:1px solid rgba(58,205,119,.5);' +
    'border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.28);font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.kl-bar.on{display:flex}' +
    '.kl-dot{flex:none;width:9px;height:9px;border-radius:50%;background:#3ACD77;box-shadow:0 0 0 0 rgba(58,205,119,.7);animation:kl-p 1.8s infinite}' +
    '.kl-dot.ht{background:#F2B544;animation:none}.kl-dot.ft,.kl-dot.pre{background:#9FB5A8;animation:none}' +
    '@keyframes kl-p{70%{box-shadow:0 0 0 8px rgba(58,205,119,0)}100%{box-shadow:0 0 0 0 rgba(58,205,119,0)}}' +
    '@media (prefers-reduced-motion:reduce){.kl-dot{animation:none}}' +
    '.kl-main{flex:1;min-width:0}.kl-t{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.kl-c{font-size:12px;opacity:.75;margin-top:1px}' +
    '.kl-s{flex:none;font-weight:800;font-size:20px;font-variant-numeric:tabular-nums;letter-spacing:.01em}' +
    '.kl-s i{font-style:normal;opacity:.5;padding:0 5px}' +
    '.kl-more{font-size:11px;opacity:.7;margin-left:6px;font-weight:600}' +
    '.kl-veil{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:none}.kl-veil.on{display:block}' +
    '.kl-sheet{position:absolute;left:0;right:0;bottom:0;max-height:80vh;overflow:auto;background:#fff;color:#12261B;' +
    'border-radius:14px 14px 0 0;padding:6px 18px calc(18px + env(safe-area-inset-bottom,0px))}' +
    '@media (prefers-color-scheme:dark){.kl-sheet{background:#0F1F17;color:#EAF3EE}.kl-row{border-color:rgba(255,255,255,.12)!important}}' +
    '.kl-h{display:flex;justify-content:space-between;align-items:center;padding:12px 0 6px;font-weight:700;font-size:17px}' +
    '.kl-x{background:none;border:0;font:inherit;font-size:15px;color:#1F824A;font-weight:600;padding:6px 0 6px 12px}' +
    '.kl-row{padding:12px 0;border-top:1px solid rgba(0,0,0,.1)}' +
    '.kl-rt{display:flex;justify-content:space-between;font-size:13px;opacity:.7;margin-bottom:6px}' +
    '.kl-l{display:flex;justify-content:space-between;font-size:17px;padding:2px 0}.kl-l.us{font-weight:700}' +
    '.kl-l b{font-variant-numeric:tabular-nums}.kl-l small{font-weight:400;opacity:.6;margin-left:6px}';

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var bar = document.createElement('button'); bar.className = 'kl-bar'; bar.type = 'button';
  bar.setAttribute('aria-label', 'Live scores');
  var veil = document.createElement('div'); veil.className = 'kl-veil';
  veil.innerHTML = '<div class="kl-sheet" role="dialog" aria-label="Live scores"></div>';
  document.body.appendChild(bar); document.body.appendChild(veil);
  var sheet = veil.firstChild;
  bar.addEventListener('click', function () { open = true; draw(); });
  veil.addEventListener('click', function (e) {
    if (e.target === veil || e.target.classList.contains('kl-x')) { open = false; draw(); }
  });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tally(m) { var r = { kg: 0, kp: 0, og: 0, op: 0 }, ev = m.events || {}; for (var k in ev) { var e = ev[k]; if (e && r[e.s + e.v] != null) r[e.s + e.v]++; } return r; }
  function fmt(g, p) { return g + '-' + (p < 10 ? '0' : '') + p; }
  function club(m) { return m.branch === 'ladies' ? 'Killeshin' : 'Gleann Uise\u00e1n'; }
  function clock(m) {
    var now = Date.now();
    if (m.status === '1h' && m.t1h) return '1st half ' + (Math.floor((now - m.t1h) / 60000) + 1) + '\u2032';
    if (m.status === '2h' && m.t2h) return '2nd half ' + (Math.floor((now - m.t2h) / 60000) + 1) + '\u2032';
    if (m.status === 'ht') return 'Half-time';
    if (m.status === 'ft') return 'Full time';
    return 'Throw-in soon';
  }
  function visible() {
    var now = Date.now(), out = [], rank = { '1h': 0, '2h': 0, ht: 1, pre: 2, ft: 3 };
    for (var id in matches) {
      var m = matches[id]; if (!m || !m.created) continue;
      if (now - m.created > 12 * HOUR) continue;
      if (m.status === 'ft' && m.tft && now - m.tft > 2 * HOUR) continue;
      if (m.status === 'pre' && now - m.created > 3 * HOUR) continue;
      out.push(m);
    }
    return out.sort(function (a, b) { return (rank[a.status] - rank[b.status]) || (b.created - a.created); });
  }

  function draw() {
    var list = visible();
    if (!list.length) { bar.classList.remove('on'); veil.classList.remove('on'); return; }
    var m = list[0], t = tally(m);
    bar.innerHTML = '<span class="kl-dot ' + esc(m.status) + '"></span>' +
      '<span class="kl-main"><div class="kl-t">' + esc(m.team) + ' v ' + esc(m.opp) +
      (list.length > 1 ? '<span class="kl-more">+' + (list.length - 1) + ' more</span>' : '') + '</div>' +
      '<div class="kl-c">' + clock(m) + '</div></span>' +
      '<span class="kl-s">' + fmt(t.kg, t.kp) + '<i>:</i>' + fmt(t.og, t.op) + '</span>';
    bar.classList.add('on');
    if (!open) { veil.classList.remove('on'); return; }
    var h = '<div class="kl-h">Live scores<button class="kl-x" type="button">Close</button></div>';
    list.forEach(function (m) {
      var t = tally(m);
      var us = '<div class="kl-l us"><span>' + esc(club(m)) + '</span><b>' + fmt(t.kg, t.kp) + '<small>(' + (t.kg * 3 + t.kp) + ')</small></b></div>';
      var them = '<div class="kl-l"><span>' + esc(m.opp) + '</span><b>' + fmt(t.og, t.op) + '<small>(' + (t.og * 3 + t.op) + ')</small></b></div>';
      h += '<div class="kl-row"><div class="kl-rt"><span>' + esc(m.team) + (m.venue === 'away' ? ', away' : ', home') + '</span><span>' + clock(m) + '</span></div>' +
        (m.venue === 'away' ? them + us : us + them) + '</div>';
    });
    sheet.innerHTML = h; veil.classList.add('on');
  }

  function schedule() {
    clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(pull, visible().length ? FAST : SLOW);
  }
  function pull() {
    fetch(DB + '/live/matches.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j !== undefined) matches = j || {}; draw(); })
      .catch(function () {})
      .then(schedule);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pull(); else clearTimeout(timer); });
  setInterval(function () { if (visible().length) draw(); }, 30000); /* keeps the minute ticking between pulls */
  pull();
})();
