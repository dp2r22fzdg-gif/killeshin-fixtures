/* Pitch Bookings add-on for killeshingaa.ie
   1. "Today at the Club" strip on the home page, below Buy tickets and above
      Next match. Tap = full Today view. Long press = overview bubble.
   2. "Pitch bookings" and "What's on today" tiles at the top of the Club page.
   3. "Pitch bookings" button in the More menu.
   Loaded by one line at the bottom of index.html:  <script src="pitch.js"></script> */
(function(){
  "use strict";
  var BOOKINGS = 'bookings.html';
  var SUPA_URL = 'https://joyfilfyeruaifpwlkfo.supabase.co';
  var SUPA_KEY = 'sb_publishable_THA4FVrKQzkCl6TcAmhk-A_tyMYNdPJ';

  var PITCH = {1:'Old Pitch',2:'Old Pitch',3:'Juvenile Pitch',4:'Juvenile Pitch',5:'Senior Pitch',6:'Senior Pitch'};
  var SIDE  = {1:'Clubhouse',2:'Cappalug',3:'Front',4:'Back',5:'Back',6:'Front'};
  var PAIRS = [[1,2],[3,4],[5,6]];

  var ICON = {
    pitch: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h4M17 12h4"/><circle cx="12" cy="12" r="2.6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'
  };

  /* ---------- styles, matching the site ---------- */
  var css = document.createElement('style');
  css.textContent =
    /* club page tiles */
    '.ptile{display:flex;align-items:center;gap:15px;padding:16px 17px;margin-bottom:10px;border-radius:20px;position:relative;overflow:hidden;text-decoration:none;color:inherit;background:linear-gradient(158deg,#FFFFFF 0%,#FFFFFF 48%,#EDF8F1 100%);border:1px solid rgba(31,130,74,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 5px 18px -7px rgba(17,73,46,.28)}' +
    '.ptile::after{content:"";position:absolute;right:-30px;top:-34px;width:132px;height:132px;border-radius:50%;background:radial-gradient(circle,rgba(58,205,119,.16),transparent 68%);pointer-events:none}' +
    '.ptile .tile{width:52px;height:52px;flex:none;border-radius:15px;display:grid;place-items:center;position:relative;z-index:1;background:linear-gradient(160deg,var(--green),var(--green-dk));box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 4px 10px -3px rgba(31,130,74,.6)}' +
    '.ptile .tile svg{width:25px;height:25px;stroke:#fff;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round}' +
    '.ptile .tx{flex:1;min-width:0;position:relative;z-index:1}' +
    '.ptile .tx b{display:block;font-size:17.5px;font-weight:800;line-height:1.25;font-family:"Bricolage Grotesque",Archivo,sans-serif;letter-spacing:-.01em}' +
    '.ptile .tx span{display:block;font-size:13px;color:var(--grey);margin-top:3px;line-height:1.4}' +
    '.ptile .go{flex:none;position:relative;z-index:1;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--green-lt);color:var(--green-dk);font-size:15px;font-weight:800}' +
    '.ptile:active{transform:translateY(1px)}' +
    '.sheet a.pbtn{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:15px 17px;margin-bottom:9px;border-radius:14px;font-size:16.5px;font-weight:700;background:var(--green-lt);color:var(--green-dk);border:1.5px solid #BFDFCD;box-shadow:0 3px 0 #BFDFCD;text-decoration:none}' +
    '.sheet a.pbtn svg{width:22px;height:22px;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round;flex:none}' +
    /* the Today at the Club strip */
    '#tatc{display:flex;align-items:center;gap:13px;width:calc(100% - 32px);margin:12px 16px 2px;padding:13px 15px;text-align:left;border-radius:18px;cursor:pointer;color:#fff;position:relative;overflow:hidden;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;background:linear-gradient(150deg,var(--forest) 0%,var(--deep) 100%);border:1px solid rgba(17,73,46,.4);box-shadow:0 5px 16px -6px rgba(17,73,46,.45)}' +
    '#tatc::before{content:"";position:absolute;inset:-20%;pointer-events:none;background:repeating-linear-gradient(114deg,rgba(255,255,255,.05) 0 1px,transparent 1px 9px),repeating-linear-gradient(114deg,rgba(58,205,119,.14) 0 2px,transparent 2px 34px)}' +
    '#tatc>*{position:relative;z-index:1}' +
    '#tatc .ic{width:42px;height:42px;flex:none;border-radius:13px;display:grid;place-items:center;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18)}' +
    '#tatc .ic svg{width:22px;height:22px;stroke:#fff;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round}' +
    '#tatc .tx{flex:1;min-width:0}' +
    '#tatc .tx b{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;color:#8FD6AE}' +
    '#tatc .tx b i{width:8px;height:8px;border-radius:50%;background:var(--green);display:none;animation:tatcPulse 1.6s infinite}' +
    '#tatc.live .tx b i{display:inline-block}' +
    '#tatc .tx span{display:block;font-size:15px;font-weight:700;margin-top:3px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#tatc .tx small{display:block;font-size:12px;color:#A9CFBB;margin-top:2px}' +
    '#tatc .go{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(58,205,119,.22);color:#C9F0DA;font-weight:800;font-size:15px}' +
    '#tatc:active{transform:translateY(1px)}' +
    '#tatc.pressing{transform:scale(.985);transition:transform .35s}' +
    '@keyframes tatcPulse{0%{box-shadow:0 0 0 0 rgba(58,205,119,.6)}70%{box-shadow:0 0 0 8px rgba(58,205,119,0)}100%{box-shadow:0 0 0 0 rgba(58,205,119,0)}}' +
    '@media (prefers-reduced-motion:reduce){#tatc .tx b i{animation:none}}' +
    /* the overview bubble */
    '#tatcSheet .panel{max-height:80vh;overflow-y:auto}' +
    '#tatcSheet h3{font-family:"Bricolage Grotesque",Archivo,sans-serif;font-weight:800;font-size:20px;margin:0}' +
    '#tatcSheet .dt{font-size:13.5px;color:var(--grey);margin:3px 0 12px}' +
    '#tatcSheet .grp{font-size:10.5px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:var(--grey);margin:14px 2px 7px}' +
    '#tatcSheet .grp.now{color:var(--green-dk)}' +
    '#tatcSheet .it{display:grid;grid-template-columns:62px 1fr;gap:10px;padding:10px 12px;border-radius:13px;background:#fff;border:1px solid var(--line);margin-bottom:6px}' +
    '#tatcSheet .it.live{border-color:var(--green);box-shadow:0 0 0 3px rgba(58,205,119,.18)}' +
    '#tatcSheet .it.m{background:linear-gradient(180deg,#FFFDF6,#FBF1DC);border-color:rgba(184,125,18,.35)}' +
    '#tatcSheet .it.done{opacity:.55}' +
    '#tatcSheet .it .t{font-family:"Bricolage Grotesque",Archivo,sans-serif;font-weight:800;font-size:17px;color:var(--deep);line-height:1.1}' +
    '#tatcSheet .it .t small{display:block;font-family:Archivo,sans-serif;font-size:11px;color:var(--grey);font-weight:600}' +
    '#tatcSheet .it .k{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--green-dk)}' +
    '#tatcSheet .it.m .k{color:#7A5210}' +
    '#tatcSheet .it .w{display:block;font-weight:800;font-size:15px;line-height:1.3}' +
    '#tatcSheet .it .p{display:flex;gap:5px;align-items:center;font-size:12.5px;color:var(--grey);margin-top:2px}' +
    '#tatcSheet .it .p svg{width:12px;height:12px;stroke:var(--green-dk);stroke-width:2;fill:none;flex:none}' +
    '#tatcSheet .none{font-size:14.5px;color:var(--grey);padding:10px 2px}' +
    '#tatcSheet .open{display:block;text-align:center;margin-top:14px;padding:15px;border-radius:12px;background:var(--forest);color:#fff;font-weight:800;font-size:15px;border:1.5px solid #0F5C34;box-shadow:0 3px 0 #0F5C34;text-decoration:none}';
  document.head.appendChild(css);

  /* ---------- data ---------- */
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function todayStr(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
  function toMin(t){ var p = String(t).slice(0,5).split(':'); return (+p[0])*60 + (+p[1]); }
  function hm(t){ return String(t).slice(0,5); }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function where(h){
    if(!h || !h.length) return 'Club grounds \u00b7 pitch to be confirmed';
    var out = [];
    PAIRS.forEach(function(pr){
      var a = h.indexOf(pr[0]) > -1, b = h.indexOf(pr[1]) > -1;
      if(a && b) out.push(PITCH[pr[0]] + ' (whole pitch)');
      else if(a) out.push(PITCH[pr[0]] + ' \u00b7 ' + SIDE[pr[0]] + ' side');
      else if(b) out.push(PITCH[pr[1]] + ' \u00b7 ' + SIDE[pr[1]] + ' side');
    });
    return out.join(', ');
  }
  function kindOf(b){ return b.kind === 'match' ? 'Match' : b.practice ? 'Practice match' : 'Training'; }
  function title(b){ return b.team + (b.opponent ? ' v ' + b.opponent : ''); }

  var ITEMS = [], LOADED = false;

  function homeGamesFromSite(day){
    return fetch('data.json?t=' + Date.now(), {cache:'no-store'})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){
        return (j.fixtures || []).filter(function(f){
          if(f.date !== day || !/^\d{1,2}:\d{2}$/.test(f.time || '')) return false;
          var v = (f.venue || '').toLowerCase();
          return v.indexOf('killeshin') > -1 || v.indexOf('hearns') > -1 || v.indexOf('sonny byrne') > -1 ||
                 (f.isHome && (!f.venue || /^tbc/i.test(f.venue)));
        }).map(function(f){
          var st = toMin(f.time);
          return {kind:'match', start_time: pad(Math.floor(st/60)) + ':' + pad(st%60),
                  end_time: pad(Math.floor(Math.min(st+90,1439)/60)) + ':' + pad(Math.min(st+90,1439)%60),
                  team: (f.branch === 'ladies' ? 'Ladies ' : '') + f.grade + ' v ' + f.opponent, halves: []};
        });
      })
      .catch(function(){ return []; });
  }

  function load(){
    var day = todayStr();
    var bookings = fetch(SUPA_URL + '/rest/v1/public_schedule?select=*&day=eq.' + day + '&status=eq.confirmed&order=start_time',
        {headers: {apikey: SUPA_KEY}, cache: 'no-store'})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .catch(function(){ return null; });
    return Promise.all([bookings, homeGamesFromSite(day)]).then(function(res){
      var rows = res[0] || [];
      res[1].forEach(function(g){
        var st = toMin(g.start_time);
        var dup = rows.some(function(b){ return b.kind === 'match' && Math.abs(toMin(b.start_time) - st) <= 90; });
        if(!dup) rows.push(g);
      });
      rows.sort(function(a,b){ return toMin(a.start_time) - toMin(b.start_time); });
      ITEMS = rows; LOADED = res[0] !== null || rows.length > 0;
      paintStrip();
      if(document.getElementById('tatcSheet') && document.getElementById('tatcSheet').classList.contains('open')) paintSheet();
    });
  }

  function split(){
    var d = new Date(), n = d.getHours()*60 + d.getMinutes();
    return {
      live:  ITEMS.filter(function(b){ return toMin(b.start_time) <= n && n < toMin(b.end_time); }),
      later: ITEMS.filter(function(b){ return toMin(b.start_time) > n; }),
      done:  ITEMS.filter(function(b){ return toMin(b.end_time) <= n; })
    };
  }

  /* ---------- the strip ---------- */
  function strip(){
    var el = document.getElementById('tatc');
    if(el) return el;
    el = document.createElement('button');
    el.id = 'tatc';
    el.type = 'button';
    el.setAttribute('aria-label', 'Today at the Club. Tap for the full list, press and hold for an overview.');
    el.innerHTML = '<span class="ic">' + ICON.clock + '</span>' +
      '<span class="tx"><b><i></i>Today at the Club</b><span id="tatcLine">Checking what\u2019s on\u2026</span><small id="tatcSub"></small></span>' +
      '<span class="go">\u203A</span>';
    wirePress(el);
    return el;
  }

  function paintStrip(){
    var el = document.getElementById('tatc'); if(!el) return;
    var s = split(), line, sub;
    if(!ITEMS.length){
      line = LOADED ? 'Nothing on the club pitches today' : 'Tap to see what\u2019s on';
      sub = 'Tap to book a pitch';
    } else if(s.live.length){
      line = 'On now: ' + title(s.live[0]) + (s.live.length > 1 ? ' +' + (s.live.length-1) + ' more' : '');
      sub = s.later.length ? 'Next: ' + hm(s.later[0].start_time) + ' ' + title(s.later[0]) : 'Nothing else later today';
    } else if(s.later.length){
      line = 'Next: ' + hm(s.later[0].start_time) + ' \u00b7 ' + title(s.later[0]);
      sub = s.later.length > 1 ? (s.later.length - 1) + ' more later today' : kindOf(s.later[0]) + ' \u00b7 ' + where(s.later[0].halves);
    } else {
      line = 'All done for today';
      sub = ITEMS.length + (ITEMS.length === 1 ? ' session' : ' sessions') + ' earlier';
    }
    el.classList.toggle('live', s.live.length > 0);
    document.getElementById('tatcLine').textContent = line;
    document.getElementById('tatcSub').textContent = sub;
  }

  /* Tap opens the full view. Press and hold opens the overview bubble. */
  function wirePress(el){
    var timer = null, held = false, sx = 0, sy = 0;
    function clear(){ clearTimeout(timer); timer = null; el.classList.remove('pressing'); }
    el.addEventListener('pointerdown', function(e){
      held = false; sx = e.clientX; sy = e.clientY;
      el.classList.add('pressing');
      timer = setTimeout(function(){
        held = true; el.classList.remove('pressing');
        if(navigator.vibrate) try { navigator.vibrate(12); } catch(err){}
        openSheet();
      }, 450);
    });
    el.addEventListener('pointermove', function(e){
      if(timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear();
    });
    el.addEventListener('pointerup', clear);
    el.addEventListener('pointercancel', clear);
    el.addEventListener('pointerleave', clear);
    el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    el.addEventListener('click', function(e){
      if(held){ e.preventDefault(); held = false; return; }
      location.href = BOOKINGS + '?view=today';
    });
  }

  /* ---------- the overview bubble ---------- */
  function sheet(){
    var sh = document.getElementById('tatcSheet');
    if(sh) return sh;
    sh = document.createElement('div');
    sh.className = 'sheet';
    sh.id = 'tatcSheet';
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-label', 'Today at the Club');
    sh.innerHTML = '<div class="panel"><div class="grab"></div><div id="tatcBody"></div></div>';
    sh.addEventListener('click', function(e){ if(!e.target.closest('.panel')) sh.classList.remove('open'); });
    document.body.appendChild(sh);
    return sh;
  }
  function item(b, cls){
    var m = b.kind === 'match' || b.practice;
    return '<div class="it ' + cls + (m ? ' m' : '') + '"><div class="t">' + hm(b.start_time) +
      '<small>to ' + hm(b.end_time) + '</small></div><div><span class="k">' + kindOf(b) + '</span>' +
      '<span class="w">' + esc(title(b)) + '</span><span class="p">' + ICON.pin + esc(where(b.halves)) + '</span></div></div>';
  }
  function paintSheet(){
    var s = split(), html = '<h3>Today at the Club</h3><div class="dt">' +
      new Date().toLocaleDateString('en-IE', {weekday:'long', day:'numeric', month:'long'}) + '</div>';
    if(!ITEMS.length) html += '<p class="none">Nothing on the club pitches today.</p>';
    if(s.live.length)  html += '<div class="grp now">On now</div>' + s.live.map(function(b){ return item(b,'live'); }).join('');
    if(s.later.length) html += '<div class="grp">' + (s.live.length ? 'Later today' : 'Coming up') + '</div>' + s.later.map(function(b){ return item(b,''); }).join('');
    if(s.done.length)  html += '<div class="grp">Earlier today</div>' + s.done.map(function(b){ return item(b,'done'); }).join('');
    html += '<a class="open" href="' + BOOKINGS + '?view=today">Open full view</a>';
    document.getElementById('tatcBody').innerHTML = html;
  }
  function openSheet(){ var sh = sheet(); paintSheet(); requestAnimationFrame(function(){ sh.classList.add('open'); }); }

  /* Only on the home (Fixtures) page, between the filters and Next match */
  function placeStrip(){
    var top = document.getElementById('top');
    if(!top) return;
    var el = strip();
    if(el.nextSibling !== top) top.parentNode.insertBefore(el, top);
    el.hidden = !!top.hidden;
  }

  /* ---------- Club page tiles and More menu ---------- */
  function clubTiles(){
    var wrap = document.createElement('div');
    wrap.id = 'pitchBookings';
    wrap.innerHTML =
      '<div class="sec"><span class="lbl">Pitch bookings</span></div>' +
      '<a class="ptile" href="' + BOOKINGS + '"><span class="tile">' + ICON.pitch + '</span>' +
        '<span class="tx"><b>Pitch Bookings</b><span>Book a pitch for training or a practice match, and see what\u2019s on</span></span>' +
        '<span class="go">\u203A</span></a>' +
      '<a class="ptile" href="' + BOOKINGS + '?view=today"><span class="tile">' + ICON.clock + '</span>' +
        '<span class="tx"><b>Today at the Club</b><span>Training, practice matches and home games on the club pitches</span></span>' +
        '<span class="go">\u203A</span></a>';
    return wrap;
  }
  function addToClub(){
    var out = document.getElementById('out');
    if(!out || document.getElementById('pitchBookings')) return;
    if(!out.querySelector('.feat[data-feat], a.act')) return;
    out.insertBefore(clubTiles(), out.firstChild);
  }
  function addToMore(){
    var panel = document.querySelector('#sheet .panel');
    if(!panel || panel.querySelector('.pbtn')) return;
    var a = document.createElement('a');
    a.className = 'pbtn'; a.href = BOOKINGS; a.innerHTML = ICON.pitch + 'Pitch bookings';
    panel.appendChild(a);
  }

  function start(){
    addToMore();
    addToClub();
    placeStrip();
    var out = document.getElementById('out');
    if(out && window.MutationObserver) new MutationObserver(addToClub).observe(out, {childList: true});
    var top = document.getElementById('top');
    if(top && window.MutationObserver) new MutationObserver(placeStrip).observe(top, {attributes: true, attributeFilter: ['hidden']});
    load();
    setInterval(load, 60000);          /* fresh bookings every minute */
    setInterval(paintStrip, 30000);    /* "on now" rolls over between loads */
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
