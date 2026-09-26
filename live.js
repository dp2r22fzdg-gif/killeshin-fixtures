/* Live score banner for the club website.
   Reads what the scorer page saves. A match shows only after the scorer
   taps Go live, and comes off by itself 5 minutes after full time. */
(function () {
  var C = window.KGAA_LIVE || {};
  var DB = (C.dbUrl || '').replace(/\/$/, '');
  if (!DB || DB.indexOf('YOUR-') > -1) return;

  var AFTER_FT = 5 * 60000;          /* how long the final score stays up */
  var TOO_OLD = 12 * 3600000;        /* forgotten matches never linger */
  var matches = {}, box = null;

  var css =
    '.lv{padding:14px 16px 0}' +
    '.lv-card{background:linear-gradient(160deg,#1D5C3C 0%,#11492E 65%);color:#fff;border-radius:18px;' +
      'padding:13px 16px 15px;margin-bottom:10px;box-shadow:0 6px 20px rgba(17,73,46,.25);' +
      'font-family:Archivo,-apple-system,"Helvetica Neue",Arial,sans-serif}' +
    '.lv-top{display:flex;align-items:center;gap:10px;margin-bottom:10px;min-width:0}' +
    '.lv-pill{flex:none;display:inline-flex;align-items:center;gap:7px;background:#E5484D;color:#fff;' +
      'font-size:11.5px;font-weight:800;letter-spacing:.06em;padding:5px 11px;border-radius:999px;white-space:nowrap}' +
    '.lv-pill.idle{background:rgba(255,255,255,.18)}' +
    '.lv-pill i{width:7px;height:7px;border-radius:50%;background:#fff;animation:lvp 1.4s infinite}' +
    '@keyframes lvp{50%{opacity:.25}}' +
    '.lv-comp{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:#A9CFBB;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.lv-row{display:flex;justify-content:space-between;gap:14px}' +
    '.lv-side{flex:1;min-width:0;display:flex;flex-direction:column}' +
    '.lv-side.r{text-align:right;align-items:flex-end}' +
    '.lv-n{font-size:14.5px;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.lv-s{font-family:"Bricolage Grotesque",Archivo,sans-serif;font-weight:800;font-size:31px;line-height:1.1;' +
      'letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.lv-s small{font-size:17px;font-weight:700;color:#8FD6AE;margin-left:6px;letter-spacing:0}' +
    '@media (prefers-reduced-motion:reduce){.lv-pill i{animation:none}}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(g, p) { return g + '-' + (p < 10 ? '0' : '') + p; }
  function club(m) { return m.branch === 'ladies' ? 'Killeshin' : 'Gleann Uise\u00e1n'; }
  function tally(m) { var r = { kg: 0, kp: 0, og: 0, op: 0 }, ev = m.events || {}; for (var k in ev) { var e = ev[k]; if (e && r[e.s + e.v] != null) r[e.s + e.v]++; } return r; }
  function mins(t) { return t ? ' ' + (Math.floor((Date.now() - t) / 60000) + 1) + '\u2032' : ''; }

  function state(m) {
    switch (m.status) {
      case '1h': return { t: 'Live \u00b7 1st half' + mins(m.t1h), on: true };
      case 'ht': return { t: 'Half-time', on: false };
      case '2h': return { t: 'Live \u00b7 2nd half' + mins(m.t2h), on: true };
      case 'etb': return { t: 'Extra time to come', on: false };
      case 'et1': return { t: 'Live \u00b7 ET 1st half' + mins(m.tet1), on: true };
      case 'etht': return { t: 'Extra time half-time', on: false };
      case 'et2': return { t: 'Live \u00b7 ET 2nd half' + mins(m.tet2), on: true };
      case 'ft': return { t: 'Full time', on: false };
      default: return { t: 'Throw-in soon', on: false };
    }
  }

  function showing(m) {
    if (!m || m.live === false) return false;                  /* Go live not tapped yet */
    if (Date.now() - (m.created || 0) > TOO_OLD) return false;
    if (m.status === 'ft') return !!m.tft && Date.now() - m.tft < AFTER_FT;
    return true;
  }

  function side(name, g, p, right) {
    return '<div class="lv-side' + (right ? ' r' : '') + '"><span class="lv-n">' + esc(name) + '</span>' +
      '<span class="lv-s">' + fmt(g, p) + '<small>(' + (g * 3 + p) + ')</small></span></div>';
  }

  function card(m) {
    var t = tally(m), s = state(m);
    var us = side(club(m), t.kg, t.kp, false), them = side(m.opp || 'Opposition', t.og, t.op, true);
    if (m.venue === 'away') {                                   /* home team always on the left */
      us = side(club(m), t.kg, t.kp, true);
      them = side(m.opp || 'Opposition', t.og, t.op, false);
    }
    var info = [m.team, m.comp].filter(Boolean).map(esc).join(' \u00b7 ');
    return '<div class="lv-card">' +
      '<div class="lv-top"><span class="lv-pill' + (s.on ? '' : ' idle') + '">' + (s.on ? '<i></i>' : '') + esc(s.t) + '</span>' +
      '<span class="lv-comp">' + info + '</span></div>' +
      '<div class="lv-row">' + (m.venue === 'away' ? them + us : us + them) + '</div></div>';
  }

  function render() {
    if (!box) return;
    var ids = Object.keys(matches).filter(function (k) { return showing(matches[k]); })
      .sort(function (a, b) { return (matches[a].created || 0) - (matches[b].created || 0); });
    if (!ids.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = ids.map(function (k) { return card(matches[k]); }).join('');
    box.hidden = false;
  }

  function pull() {
    fetch(DB + '/live/matches.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { matches = j || {}; render(); })
      .catch(function () { /* keep showing the last score we had */ });
  }

  function mount() {
    box = document.createElement('section');
    box.className = 'lv';
    box.id = 'liveBanner';
    box.hidden = true;
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-label', 'Live scores');
    var after = document.getElementById('branch') || document.querySelector('.mast');
    if (after && after.parentNode) after.parentNode.insertBefore(box, after.nextSibling);
    else document.body.insertBefore(box, document.body.firstChild);
  }

  mount();
  pull();
  setInterval(function () { if (!document.hidden) pull(); }, 15000);
  setInterval(render, 20000);                                   /* moves the clock and drops finished games */
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pull(); });
})();
