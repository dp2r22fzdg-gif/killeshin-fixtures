/* Pitch Bookings link for killeshingaa.ie
   Adds a "Pitch bookings" tile at the top of the Club page and a button in
   the More menu. Lives in its own file so updating index.html never loses it.
   Loaded by one line at the bottom of index.html:
     <script src="pitch.js"></script>                                          */
(function(){
  "use strict";
  var URL = 'bookings.html';
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
    '<path d="M12 4v16M3 12h4M17 12h4"/><circle cx="12" cy="12" r="2.6"/></svg>';

  /* Same look as the Tickets and Shop tiles */
  var css = document.createElement('style');
  css.textContent =
    '.ptile{display:flex;align-items:center;gap:15px;padding:16px 17px;margin-bottom:10px;' +
      'border-radius:20px;position:relative;overflow:hidden;text-decoration:none;color:inherit;' +
      'background:linear-gradient(158deg,#FFFFFF 0%,#FFFFFF 48%,#EDF8F1 100%);' +
      'border:1px solid rgba(31,130,74,.22);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 5px 18px -7px rgba(17,73,46,.28)}' +
    '.ptile::after{content:"";position:absolute;right:-30px;top:-34px;width:132px;height:132px;' +
      'border-radius:50%;background:radial-gradient(circle,rgba(58,205,119,.16),transparent 68%);' +
      'pointer-events:none}' +
    '.ptile .tile{width:52px;height:52px;flex:none;border-radius:15px;display:grid;place-items:center;' +
      'position:relative;z-index:1;background:linear-gradient(160deg,var(--green),var(--green-dk));' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 4px 10px -3px rgba(31,130,74,.6)}' +
    '.ptile .tile svg{width:25px;height:25px;stroke:#fff;stroke-width:1.9;fill:none;' +
      'stroke-linecap:round;stroke-linejoin:round}' +
    '.ptile .tx{flex:1;min-width:0;position:relative;z-index:1}' +
    '.ptile .tx b{display:block;font-size:17.5px;font-weight:800;line-height:1.25;' +
      'font-family:"Bricolage Grotesque",Archivo,sans-serif;letter-spacing:-.01em}' +
    '.ptile .tx span{display:block;font-size:13px;color:var(--grey);margin-top:3px;line-height:1.4}' +
    '.ptile .go{flex:none;position:relative;z-index:1;width:30px;height:30px;border-radius:50%;' +
      'display:grid;place-items:center;background:var(--green-lt);color:var(--green-dk);' +
      'font-size:15px;font-weight:800}' +
    '.ptile:active{transform:translateY(1px)}' +
    '.sheet a.pbtn{display:flex;align-items:center;gap:14px;width:100%;text-align:left;' +
      'padding:15px 17px;margin-bottom:9px;border-radius:14px;font-size:16.5px;font-weight:700;' +
      'background:var(--green-lt);color:var(--green-dk);border:1.5px solid #BFDFCD;' +
      'box-shadow:0 3px 0 #BFDFCD;text-decoration:none}' +
    '.sheet a.pbtn svg{width:22px;height:22px;stroke:currentColor;stroke-width:1.9;fill:none;' +
      'stroke-linecap:round;stroke-linejoin:round;flex:none}';
  document.head.appendChild(css);

  function tile(){
    var wrap = document.createElement('div');
    wrap.id = 'pitchBookings';
    wrap.innerHTML =
      '<div class="sec"><span class="lbl">Pitch bookings</span></div>' +
      '<a class="ptile" href="' + URL + '">' +
        '<span class="tile">' + ICON + '</span>' +
        '<span class="tx"><b>Pitch Bookings</b>' +
        '<span>Book a pitch for training or a practice match, and see what\u2019s on</span></span>' +
        '<span class="go">\u203A</span></a>' +
      '<a class="ptile" href="' + URL + '?view=today">' +
        '<span class="tile"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>' +
        '<span class="tx"><b>What\u2019s on today</b>' +
        '<span>Training, practice matches and home games on the club pitches</span></span>' +
        '<span class="go">\u203A</span></a>';
    return wrap;
  }

  /* The Club page is the only one with the Tickets/Shop tiles and club links */
  function addToClub(){
    var out = document.getElementById('out');
    if(!out || document.getElementById('pitchBookings')) return;
    if(!out.querySelector('.feat[data-feat], a.act')) return;
    out.insertBefore(tile(), out.firstChild);
  }

  function addToMore(){
    var panel = document.querySelector('#sheet .panel');
    if(!panel || panel.querySelector('.pbtn')) return;
    var a = document.createElement('a');
    a.className = 'pbtn';
    a.href = URL;
    a.innerHTML = ICON + 'Pitch bookings';
    panel.appendChild(a);
  }

  function start(){
    addToMore();
    addToClub();
    var out = document.getElementById('out');
    if(out && window.MutationObserver){
      new MutationObserver(addToClub).observe(out, {childList: true});
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
