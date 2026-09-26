/* Live score banner for the club website.
   Reads what the scorer page saves. A match shows only after the scorer
   taps Go live, and comes off by itself 5 minutes after full time.

   The banner is pinned to the bottom of the screen, sitting just above the
   tab bar, so the score stays in view while the page scrolls behind it. */
(function () {
  var C = window.KGAA_LIVE || {};
  var DB = (C.dbUrl || '').replace(/\/$/, '');
  if (!DB || DB.indexOf('YOUR-') > -1) return;

  var AFTER_FT = 5 * 60000;          /* how long the final score stays up */
  var TOO_OLD = 12 * 3600000;        /* forgotten matches never linger */
  var PULL_EVERY = 15000;            /* fetch new scores from the scorer */
  var TICK_EVERY = 10000;            /* move the match clock on screen */
  var matches = {}, box = null;

  var css =
    /* Fixed above the tab bar. Its bottom offset is set in layout() once the
       tab bar's real height is known, so it never overlaps the tabs. */
    '.lv{position:fixed;left:0;right:0;bottom:0;z-index:58;max-width:600px;margin:0 auto;' +
      'padding:0 10px 8px;pointer-events:none}' +
    '.lv.nobar{padding-bottom:calc(8px + env(safe-area-inset-bottom))}' +
    '.lv-stack{max-height:46vh;overflow-y:auto;-webkit-overflow-scrolling:touch;pointer-events:auto;' +
      'border-radius:18px}' +
    /* White scoreboard with a green frame: stands out against both the dark
       match panel and the pale page behind it, and keeps club colours. */
    '.lv-card{background:#fff;color:#101A14;border-radius:18px;position:relative;overflow:hidden;' +
      'padding:14px 15px 12px;margin-top:8px;border:2px solid #1F824A;' +
      'box-shadow:0 -8px 28px rgba(10,30,20,.35),0 4px 14px rgba(10,30,20,.25);' +
      'font-family:Archivo,-apple-system,"Helvetica Neue",Arial,sans-serif}' +
    '.lv-card:first-child{margin-top:0}' +
    '.lv-card::before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:#3ACD77}' +
    '.lv-top{display:flex;align-items:center;gap:10px;margin-bottom:8px;min-width:0}' +
    '.lv-pill{flex:none;display:inline-flex;align-items:center;gap:7px;background:#E5484D;color:#fff;' +
      'font-size:11.5px;font-weight:800;letter-spacing:.06em;padding:5px 11px;border-radius:999px;white-space:nowrap}' +
    '.lv-pill.idle{background:#E8F6EE;color:#12703F;border:1px solid #BFDFCD}' +
    '.lv-pill i{width:7px;height:7px;border-radius:50%;background:#fff;animation:lvp 1.4s infinite}' +
    '@keyframes lvp{50%{opacity:.25}}' +
    '.lv-comp{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:#4E5A53;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.lv-row{display:flex;justify-content:space-between;gap:14px}' +
    '.lv-side{flex:1;min-width:0;display:flex;flex-direction:column}' +
    '.lv-side.r{text-align:right;align-items:flex-end}' +
    '.lv-id{display:flex;align-items:center;gap:8px;min-width:0;max-width:100%;margin-bottom:3px}' +
    '.lv-side.r .lv-id{flex-direction:row-reverse}' +
    '.lv-c{width:30px;height:30px;flex:none;border-radius:50%;background:#fff;display:grid;place-items:center;' +
      'overflow:hidden;box-shadow:0 0 0 1.5px #C2D0C7}' +
    '.lv-c img{width:76%;height:76%;object-fit:contain;display:block}' +
    '.lv-c b{font-family:"Bricolage Grotesque",Archivo,sans-serif;font-weight:800;font-size:10.5px;' +
      'color:#11492E;letter-spacing:.01em;line-height:1}' +
    '.lv-n{min-width:0;font-size:14px;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.lv-s{font-family:"Bricolage Grotesque",Archivo,sans-serif;font-weight:800;font-size:28px;line-height:1.1;' +
      'letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;color:#11492E}' +
    '.lv-s small{font-size:16px;font-weight:700;color:#6B7A72;margin-left:6px;letter-spacing:0}' +
    '@media (prefers-reduced-motion:reduce){.lv-pill i{animation:none}}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(g, p) { return g + '-' + (p < 10 ? '0' : '') + p; }
  function club(m) { return m.branch === 'ladies' ? 'Killeshin' : 'Gleann Uise\u00e1n'; }
  function tally(m) { var r = { kg: 0, kp: 0, og: 0, op: 0 }, ev = m.events || {}; for (var k in ev) { var e = ev[k]; if (e && r[e.s + e.v] != null) r[e.s + e.v]++; } return r; }
  /* Worked out from the half's start time on every tick, so the clock keeps
     moving on its own between score fetches. */
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

  /* ---- crests ----
     Our own crest comes with the site. The opposition's is looked up in
     crests.json by a loose version of the name the scorer typed, so
     "Portarlington GAA" and "portarlington" both find it. Initials stand in
     when there is no crest, or the image fails to load. */
  var CRESTS = {};
  function looseKey(n) {
    return String(n || '').toLowerCase()
      .replace(/\b(gaa|clg|club|lgfa|ladies)\b/g, ' ')
      .replace(/[^a-z0-9]/g, '');
  }
  function initials(name) {
    var clean = String(name || '').replace(/\b(GAA|CLG|Club|Gaels|Parish)\b/gi, ' ').trim();
    var words = clean.split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.slice(0, 3).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }
  function crestImg(url, name) {
    var t = initials(name).replace(/[^A-Z0-9?]/g, '');
    return '<span class="lv-c"><img src="' + esc(url) + '" alt="" ' +
      'onerror="this.parentNode.innerHTML=\'<b>' + t + '</b>\'"></span>';
  }
  function ourCrest(m) { return crestImg(m.branch === 'ladies' ? 'crest-ladies.png' : 'crest.png', club(m)); }
  function theirCrest(name) {
    var url = CRESTS[looseKey(name)];
    return url ? crestImg(url, name) : '<span class="lv-c"><b>' + esc(initials(name)) + '</b></span>';
  }
  function loadCrests() {
    fetch('crests.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        if (!j || typeof j !== 'object') return;
        for (var k in j) CRESTS[looseKey(k)] = j[k];
        render();
      })
      .catch(function () { /* initials stand in */ });
  }

  function side(name, g, p, right, crest) {
    return '<div class="lv-side' + (right ? ' r' : '') + '"><span class="lv-id">' + crest +
      '<span class="lv-n">' + esc(name) + '</span></span>' +
      '<span class="lv-s">' + fmt(g, p) + '<small>(' + (g * 3 + p) + ')</small></span></div>';
  }

  function card(m) {
    var t = tally(m), s = state(m);
    var opp = m.opp || 'Opposition', away = m.venue === 'away';
    var mine = ourCrest(m), theirs = theirCrest(opp);
    /* home team always on the left */
    var us = side(club(m), t.kg, t.kp, away, mine);
    var them = side(opp, t.og, t.op, !away, theirs);
    var info = [m.team, m.comp].filter(Boolean).map(esc).join(' \u00b7 ');
    return '<div class="lv-card">' +
      '<div class="lv-top"><span class="lv-pill' + (s.on ? '' : ' idle') + '">' + (s.on ? '<i></i>' : '') + esc(s.t) + '</span>' +
      '<span class="lv-comp">' + info + '</span></div>' +
      '<div class="lv-row">' + (m.venue === 'away' ? them + us : us + them) + '</div></div>';
  }

  /* Sit just above the tab bar, and pad the page so the last card can
     always be scrolled clear of the banner. */
  function layout() {
    if (!box) return;
    var bar = document.getElementById('bar');
    var barH = bar ? bar.offsetHeight : 0;
    box.style.bottom = barH + 'px';
    box.classList.toggle('nobar', !bar);
    document.body.style.paddingBottom = box.hidden ? '' : (barH + box.offsetHeight + 10) + 'px';
  }

  function render() {
    if (!box) return;
    var ids = Object.keys(matches).filter(function (k) { return showing(matches[k]); })
      .sort(function (a, b) { return (matches[a].created || 0) - (matches[b].created || 0); });
    if (!ids.length) {
      box.hidden = true; box.innerHTML = '';
    } else {
      box.innerHTML = '<div class="lv-stack">' + ids.map(function (k) { return card(matches[k]); }).join('') + '</div>';
      box.hidden = false;
    }
    layout();
  }

  function pull() {
    fetch(DB + '/live/matches.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { matches = j || {}; render(); })
      .catch(function () { render(); /* keep the last score, but keep the clock moving */ });
  }

  function mount() {
    box = document.createElement('section');
    box.className = 'lv';
    box.id = 'liveBanner';
    box.hidden = true;
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-label', 'Live scores');
    document.body.appendChild(box);
  }

  mount();
  loadCrests();
  pull();
  setInterval(function () { if (!document.hidden) pull(); }, PULL_EVERY);
  setInterval(render, TICK_EVERY);                              /* moves the clock and drops finished games */
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pull(); });
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 300); });
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(layout);
    ro.observe(box);
    var bar = document.getElementById('bar');
    if (bar) ro.observe(bar);
  }
})();
