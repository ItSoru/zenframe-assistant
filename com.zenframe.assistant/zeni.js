/* Zenframe Assistant 1.3.0. Local PNG companion; no network or project access. */
(function () {
  'use strict';
  var pack = window.ZenframeZeniSprites, composer = document.querySelector('.composer');
  var activity = document.getElementById('activity'), setting = document.getElementById('showZeni');
  if (!pack || !composer || !activity || !setting) return;
  var html = document.documentElement, chat = document.getElementById('chatView');
  var settings = document.getElementById('settingsView'), effort = document.getElementById('effortPop');
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var storeKey = 'zenframeAssistant.showZeni', enabled = true, ready = false, disposed = false;
  var names = Object.keys(pack.poses), images = {}, currentSources = pack.poses;
  var cache = {}, cacheOrder = [], colorToken = 0, colorTimer = 0, lastColor = '';
  // Size: 100% is about 130 px wide; Settings > Zeni > Size goes from 60% to 160%.
  var sizeKey = 'zenframeAssistant.zeniSize', sizeInput = document.getElementById('zeniSize'), sizeValue = document.getElementById('zeniSizeValue');
  var hit = null, size = 100, w = 0, h = 0, seatX = 0, seatY = 0, pivotX = 0, pivotY = 0;
  try { size = clampSize(Number(localStorage.getItem(sizeKey)) || 100); } catch (ignore) {}
  function clampSize(v) { return Math.max(60, Math.min(160, Math.round(v))); }
  var x = 0, y = 0, theta = 0, omega = 0, stretch = 1, phase = 'seat', restAt = null, landedOn = null;
  try { restAt = JSON.parse(localStorage.getItem('zenframeAssistant.zeniSpot')) || null; } catch (ignore) {}
  var vx = 0, vy = 0, landY = 0, bounces = 0, phaseAt = 0, hopFrom = null;
  var frame = 0, lastTime = 0, layoutFrame = 0, pointer = null;
  var busy = false, baseMood = 'idle', flashMood = '', flashUntil = 0, moodTimer = 0;
  var failed = false, stopped = false, approval = false, shownMood = '', front = 0;
  var helloUntil = 0, helloTimer = 0, visible = false;
  var layer = document.createElement('div'); layer.id = 'zeni-layer'; layer.hidden = true;
  var button = document.createElement('button'); button.id = 'zeni-button'; button.type = 'button';
  button.setAttribute('aria-label', 'Zeni. Click to wave, or drag to pick up.');
  function measure() {
    var k = pack.displayScale * size / 100;
    w = pack.width * k; h = pack.height * k;
    seatX = pack.seat[0] * k; seatY = pack.seat[1] * k;
    pivotX = pack.pickupPivot[0] * k; pivotY = pack.pickupPivot[1] * k;
    button.style.width = w + 'px'; button.style.height = h + 'px';
    if (hit) hit.style.height = (seatY + 6) + 'px';
    button.style.transformOrigin = pivotX + 'px ' + pivotY + 'px';
    button.style.setProperty('--zeni-seat-x', seatX + 'px'); button.style.setProperty('--zeni-seat-y', seatY + 'px');
    html.style.setProperty('--zeni-w', w.toFixed(1) + 'px'); html.style.setProperty('--zeni-h', h.toFixed(1) + 'px');
    if (sizeInput) sizeInput.value = size;
    if (sizeValue) sizeValue.textContent = size + '%';
  }
  measure();
  var breathe = document.createElement('span'); breathe.className = 'zeni-breathe';
  // Only his head and body catch the mouse; clicks on his hanging legs go through to whatever is underneath.
  hit = document.createElement('span'); hit.className = 'zeni-hit'; hit.style.height = (seatY + 6) + 'px';
  var art = document.createElement('span'); art.className = 'zeni-art';
  var sprites = [document.createElement('img'), document.createElement('img')];
  sprites.forEach(function (img) { img.alt = ''; img.draggable = false; img.setAttribute('aria-hidden', 'true'); art.appendChild(img); });
  // Dance poses are drawn on their own layer: a solid base pose, the next pose dissolving in, and two soft smear ghosts.
  var dance = document.createElement('span'); dance.className = 'zeni-dance';
  var danceImgs = ['base', 'top', 'ghost1', 'ghost2'].map(function (n) { var i = document.createElement('img'); i.alt = ''; i.draggable = false; i.className = 'zeni-dance-' + n; i.setAttribute('aria-hidden', 'true'); dance.appendChild(i); return i; });
  breathe.appendChild(art); breathe.appendChild(dance); button.appendChild(breathe); button.appendChild(hit); layer.appendChild(button);
  var glow = document.createElement('div'); glow.className = 'zeni-perch-glow'; layer.insertBefore(glow, button);
  var bubble = document.createElement('div'); bubble.id = 'zeni-bubble'; bubble.hidden = true; bubble.setAttribute('aria-hidden', 'true');
  var bubbleText = document.createElement('span'); bubbleText.id = 'zeni-bubble-text';
  var dots = document.createElement('span'); dots.className = 'zeni-dots';
  for (var d = 0; d < 3; d++) dots.appendChild(document.createElement('i'));
  bubble.appendChild(bubbleText); bubble.appendChild(dots); layer.appendChild(bubble); document.body.appendChild(layer);
  try { enabled = localStorage.getItem(storeKey) !== 'false'; } catch (ignore) {}
  setting.checked = enabled;

  function clamp(n, a, b) { return Math.max(a, Math.min(Math.max(a, b), n)); }
  function now() { return performance.now(); }
  function reduced() { return motion.matches; }
  function seat() {
    var r = composer.getBoundingClientRect();
    return { x: clamp(r.right - w - 3, 0, innerWidth - w), y: clamp(r.top - seatY, 0, innerHeight - h), rect: r };
  }
  /* ---------- Places he can sit (1.3.0) ---------- */
  // Each perch is an edge he can sit on. Dropped close to one, he snaps onto it and stays attached when the layout moves.
  var spotKey = 'zenframeAssistant.zeniSpot';
  var PERCHES = [
    { id: 'composer', el: composer, edge: 'top' },
    { id: 'tabs', el: document.querySelector('.conv-bar'), edge: 'top' },
    { id: 'toggle', el: document.querySelector('.tab-track'), edge: 'top' },
    { id: 'header', el: document.querySelector('header'), edge: 'bottom' }
  ].filter(function (q) { return q.el; });
  function perchById(id) { for (var i = 0; i < PERCHES.length; i++) if (PERCHES[i].id === id) return PERCHES[i]; return null; }
  function perchRect(q) {
    if (!q || !q.el.offsetParent) return null;
    var r = q.el.getBoundingClientRect();
    if (r.width < 20 || r.height <= 0 || r.bottom < 0 || r.top > innerHeight) return null;
    return { left: r.left, right: r.right, y: q.edge === 'top' ? r.top : r.bottom };
  }
  function spotPosition(spot) {
    if (!spot) return null;
    if (!spot.perch) return { x: spot.x, y: spot.y };
    var r = perchRect(perchById(spot.perch));
    if (!r) return null; // what he sat on is hidden: he goes home to the message box
    return { x: clamp(r.left + spot.dx, r.left - seatX, Math.min(innerWidth - w, r.right - seatX)), y: r.y - seatY };
  }
  function saveSpot() { try { if (restAt) localStorage.setItem(spotKey, JSON.stringify(restAt)); else localStorage.removeItem(spotKey); } catch (ignore) {} }
  function showGlow(on) {
    glow.textContent = '';
    if (!on) return;
    PERCHES.forEach(function (q) {
      var r = perchRect(q); if (!r) return;
      var line = document.createElement('i'); line.style.left = r.left + 'px'; line.style.top = (r.y - 1) + 'px'; line.style.width = (r.right - r.left) + 'px';
      glow.appendChild(line);
    });
  }
  // Clamp the transformed corners, not just the unrotated box: a swinging sprite stays on-screen.
  function contain() {
    var c = Math.cos(theta), s = Math.sin(theta), minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    [[0,0],[w,0],[0,h],[w,h]].forEach(function (p) {
      var dx = p[0] - pivotX, dy = (p[1] - pivotY) * stretch;
      var px = x + pivotX + dx*c - dy*s, py = y + pivotY + dx*s + dy*c;
      minX = Math.min(minX,px); maxX = Math.max(maxX,px); minY = Math.min(minY,py); maxY = Math.max(maxY,py);
    });
    if (minX < 0) x -= minX; else if (maxX > innerWidth) x -= maxX - innerWidth;
    if (minY < 0) y -= minY; else if (maxY > innerHeight) y -= maxY - innerHeight;
  }
  function paint() {
    contain();
    button.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + theta.toFixed(5) + 'rad) scale(1,' + stretch.toFixed(3) + ')';
    button.setAttribute('data-phase', phase);
    button.classList.toggle('zeni-moving', !sitting());
    placeBubble();
  }
  function placeBubble() {
    if (bubble.hidden) return;
    var r = button.getBoundingClientRect();
    bubble.style.maxWidth = Math.max(90, Math.min(200, innerWidth - 16)) + 'px';
    var bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    // On the left half of the panel the bubble opens to his right, so it never runs off the edge.
    var flip = r.left + r.width / 2 < innerWidth / 2;
    bubble.classList.toggle('zeni-flip', flip);
    // The trail dots (6-12 px in from the bubble's corner) point at the top of his head at any size.
    bubble.style.left = clamp(flip ? r.left + pivotX - 9 : r.left + pivotX + 9 - bw, 8, innerWidth - bw - 8) + 'px';
    bubble.style.top = clamp(r.top + pivotY - bh - 16, 6, innerHeight - bh - 16) + 'px';
  }
  function syncBubble() {
    var hello = helloUntil > now();
    bubble.hidden = !visible || !sitting() || (!hello && activity.hidden);
    var text = hello ? 'Hey!' : activity.textContent;
    bubbleText.textContent = text;
    bubble.title = text;
    dots.hidden = hello;
    placeBubble();
  }
  function animateArt(name) {
    art.classList.remove('zeni-swap', 'zeni-land');
    if (!reduced()) { void art.offsetWidth; art.classList.add(name); }
  }
  function showPose(name) {
    if (!ready || !pack.poses[name] || shownMood === name) return;
    shownMood = name;
    front = 1 - front;
    sprites[front].src = currentSources[name] || pack.poses[name];
    sprites[front].classList.add('zeni-visible'); sprites[1-front].classList.remove('zeni-visible');
    button.setAttribute('data-pose', name);
    if (sitting()) animateArt('zeni-swap');
  }
  function updateMood() {
    clearTimeout(moodTimer);
    var left = flashUntil - now();
    if (left <= 0) flashMood = '';
    if (left > 0) moodTimer = setTimeout(updateMood, left + 5);
    if (phase === 'drag' || phase === 'fall') showPose('picked');
    else if (phase === 'land') showPose('dropped');
    else if (phase === 'hop') showPose('idle');
    else showPose(approval ? 'approval' : flashMood || baseMood);
  }
  function flash(name, duration) { flashMood = name; flashUntil = now() + duration; updateMood(); }
  function setBusy(value) {
    busy = !!value;
    if (busy) { failed = false; stopped = false; approval = false; flashUntil = 0; baseMood = 'thinking'; }
    else { approval = false; baseMood = 'idle'; }
    updateMood();
  }
  function event(e) {
    var data = e.data || {};
    if (e.type === 'start') { setBusy(true); return; }
    if (stopped && (e.type === 'text' || e.type === 'tool')) return;
    if (e.type === 'text') baseMood = 'thinking';
    if (e.type === 'tool') {
      if (data.status === 'running') baseMood = 'working';
      else if (data.status === 'error' || data.status === 'failed') flash('error',1500);
      else baseMood = busy ? 'thinking' : 'idle';
    }
    if (e.type === 'error') { failed = true; approval = false; baseMood = 'idle'; flash('error',2500); }
    if (e.type === 'end') {
      busy = false; approval = false; baseMood = 'idle';
      if (data.stopped || stopped) { if (!stopped) flash('error',1500); stopped = true; }
      else if (!failed && !(flashMood === 'error' && flashUntil > now())) flash('done',2500);
    }
    updateMood();
  }
  function confirm(value) { approval = !!value; if (value) flashUntil = 0; else baseMood = busy ? 'working' : 'idle'; updateMood(); }
  function stop() { stopped = true; approval = false; baseMood = 'idle'; flash('error',1500); }
  function greet() {
    if (!visible || !sitting()) return;
    helloUntil = now() + 1200; clearTimeout(helloTimer);
    flash('approval',1200); syncBubble();
    helloTimer = setTimeout(function () { helloUntil = 0; syncBubble(); },1205);
  }

  function canShow() {
    return enabled && ready && !document.hidden && chat.classList.contains('active') &&
      settings.hidden && effort.hidden && composer.getBoundingClientRect().width > 0;
  }
  // Zeni sits on the message box ('seat') or wherever you last dropped him ('rest').
  function sitting() { return phase === 'seat' || phase === 'rest'; }
  // Settles him: back where he was resting, or home on the message box when home is true or he has no resting spot.
  function resetPosition(home) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastTime = 0; theta = 0; omega = 0; vx = 0; vy = 0; stretch = 1;
    if (pointer) { var id = pointer.id; pointer = null; try { hit.releasePointerCapture(id); } catch (ignore) {} }
    if (home) { restAt = null; saveSpot(); }
    var spot = spotPosition(restAt);
    if (restAt && !spot) restAt = null;
    if (restAt) { phase = 'rest'; x = spot.x; y = spot.y; }
    else { phase = 'seat'; var p = seat(); x = p.x; y = p.y; }
    showGlow(false);
    updateMood(); paint(); syncBubble();
    if (restAt && !restAt.perch) restAt = { x: x, y: y };
  }
  function layout() {
    layoutFrame = 0;
    if (disposed) return;
    visible = canShow(); layer.hidden = !visible;
    html.classList.toggle('zeni-enabled', enabled && ready);
    if (!visible) resetPosition();
    else if (phase === 'seat' && !pointer) { var p = seat(); x = p.x; y = p.y; paint(); }
    else if (phase === 'rest' && !pointer) {
      var spot = spotPosition(restAt);
      if (!spot) { resetPosition(true); }
      else { x = spot.x; y = spot.y; contain(); paint(); if (!restAt.perch) restAt = { x: x, y: y }; }
    }
    else { contain(); paint(); }
    syncBubble();
  }
  function scheduleLayout() { if (!layoutFrame && !disposed) layoutFrame = requestAnimationFrame(layout); }
  function frameLoop(t) {
    frame = 0;
    if (!visible || disposed || sitting()) return;
    var dt = Math.min(.025, Math.max(.001, (t - (lastTime || t-16)) / 1000)); lastTime = t;
    if (phase === 'drag' && pointer) {
      var follow = 1 - Math.exp(-24 * dt);
      pointer.sx += (pointer.tx - pointer.sx) * follow;
      pointer.sy += (pointer.ty - pointer.sy) * follow;
      var nx = clamp((pointer.sx - pointer.px) / dt, -1400,1400);
      var ny = clamp((pointer.sy - pointer.py) / dt, -1400,1400);
      var accel = clamp((nx - pointer.vx) / dt, -9000,9000);
      pointer.ax += (accel - pointer.ax) * (1 - Math.exp(-12*dt));
      pointer.vx = nx; pointer.vy = ny; pointer.px = pointer.sx; pointer.py = pointer.sy;
      // Driven damped pendulum, radians and pixels/seconds. Semi-implicit Euler.
      // theta is the CSS rotation (positive = clockwise, feet swing left). Moving or speeding up to the right
      // must make his feet trail to the LEFT: inertia from the acceleration plus air drag from the speed.
      // theta'' = -(g/L) sin(theta) + ((a_x + k v_x)/L) cos(theta) - c theta'.
      if (!reduced()) {
        var length = Math.max(40,h*.65);
        var drive = clamp(pointer.ax + 1.3*nx, -9000, 9000);
        omega += (-1100/length*Math.sin(theta) + drive/length*Math.cos(theta) - 6*omega)*dt;
        omega = clamp(omega,-9,9); theta += omega*dt;
        var limit = 75*Math.PI/180;
        if (Math.abs(theta) > limit) { theta = clamp(theta,-limit,limit); omega = 0; }
        stretch = 1 + Math.min(.06,Math.sqrt(nx*nx+ny*ny)/16000);
      } else { theta = 0; omega = 0; stretch = 1; }
      x = pointer.sx-pivotX; y = pointer.sy-pivotY;
    } else if (phase === 'fall') {
      var oldContact = y + seatY;
      vy += 1200*dt; x += vx*dt; y += vy*dt; vx *= Math.exp(-1.2*dt);
      if (x < 0 || x > innerWidth-w) { x = clamp(x,0,innerWidth-w); vx *= -.25; }
      theta *= Math.exp(-12*dt); stretch += (1-stretch)*Math.min(1,dt*16);
      var center = x+seatX, hitPerch = null;
      if (vy >= 0) PERCHES.forEach(function (q) {
        var r = perchRect(q);
        if (r && !hitPerch && oldContact <= r.y + 2 && y+seatY >= r.y && center >= r.left && center <= r.right) hitPerch = { q: q, r: r };
      });
      if (hitPerch) { landedOn = { perch: hitPerch.q.id, left: hitPerch.r.left }; land(hitPerch.r.y-seatY,t); }
      else if (y+h >= innerHeight-2) { landedOn = null; land(innerHeight-h-2,t); }
    } else if (phase === 'land') {
      // Exactly one small bounce, followed by a resting landing pose.
      if (bounces === 1) {
        vy += 1200*dt; y += vy*dt;
        if (y >= landY && vy >= 0) { y = landY; vy = 0; bounces = 2; }
      }
      // He stays where he landed. Double-click him to send him home.
      if (t-phaseAt >= 1200) {
        restAt = landedOn ? { perch: landedOn.perch, dx: x - landedOn.left } : { x: x, y: y };
        saveSpot(); resetPosition(false); return;
      }
    } else if (phase === 'hop') {
      var target = seat(), progress = clamp((t-phaseAt)/(reduced()?1:480),0,1);
      var eased = progress*progress*(3-2*progress);
      x = hopFrom.x+(target.x-hopFrom.x)*eased;
      y = hopFrom.y+(target.y-hopFrom.y)*eased - (reduced()?0:Math.sin(Math.PI*progress)*Math.min(48,Math.max(0,Math.min(hopFrom.y,target.y))));
      if (progress >= 1) { resetPosition(true); return; }
    }
    paint();
    if (!sitting()) frame = requestAnimationFrame(frameLoop);
  }
  function runFrames() { if (!frame) { lastTime = 0; frame = requestAnimationFrame(frameLoop); } }
  function land(top,t) {
    phase = 'land'; phaseAt = t; landY = clamp(top,0,innerHeight-h); y = landY;
    theta = 0; omega = 0; stretch = 1; vx = 0;
    bounces = reduced()?2:1; vy = reduced()?0:-95;
    showGlow(false); updateMood(); animateArt('zeni-land'); syncBubble();
  }
  hit.addEventListener('pointerdown',function (e) {
    if (!visible || !sitting() || pointer || e.button !== 0 || e.isPrimary === false) return;
    e.preventDefault(); e.stopPropagation();
    pointer = {id:e.pointerId,startX:e.clientX,startY:e.clientY,tx:e.clientX,ty:e.clientY,sx:e.clientX,sy:e.clientY,px:e.clientX,py:e.clientY,vx:0,vy:0,ax:0,drag:false};
    try { hit.setPointerCapture(e.pointerId); } catch (ignore) { pointer = null; }
  });
  hit.addEventListener('pointermove',function (e) {
    if (!pointer || pointer.id !== e.pointerId) return;
    e.preventDefault(); e.stopPropagation();
    pointer.tx = clamp(e.clientX,0,innerWidth); pointer.ty = clamp(e.clientY,0,innerHeight);
    if (!pointer.drag && Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY) > 5) {
      pointer.drag = true; phase = 'drag'; theta = 0; omega = 0; showGlow(true);
      helloUntil = 0; updateMood(); syncBubble(); runFrames();
    }
  });
  function release(e,cancelled) {
    if (!pointer || (e.pointerId !== undefined && e.pointerId !== pointer.id)) return;
    var p = pointer; pointer = null;
    try { hit.releasePointerCapture(p.id); } catch (ignore) {}
    if (cancelled) { resetPosition(); return; }
    if (!p.drag) { greet(); return; }
    phase = 'fall'; vx = reduced()?0:clamp(p.vx,-700,700); vy = reduced()?0:clamp(p.vy,-500,700);
    if (reduced()) { theta = 0; stretch = 1; }
    updateMood(); runFrames();
  }
  hit.addEventListener('pointerup',function (e) { e.preventDefault(); e.stopPropagation(); release(e,false); });
  hit.addEventListener('pointercancel',function (e) { release(e,true); });
  hit.addEventListener('lostpointercapture',function (e) { if (pointer) release(e,true); });
  button.addEventListener('click',function (e) { e.preventDefault(); e.stopPropagation(); if (e.detail === 0) greet(); });
  button.addEventListener('dragstart',function(e){e.preventDefault();});
  button.addEventListener('keydown',function(e){if(e.key==='Escape'&&phase!=='seat'){resetPosition(true);e.preventDefault();e.stopPropagation();}});
  window.addEventListener('blur',function(){if(!sitting()||pointer)resetPosition(false);});
  window.addEventListener('resize',function(){if(!sitting()||pointer)resetPosition(false);scheduleLayout();});
  // Double-click sends him back to his seat on the message box with a hop.
  button.addEventListener('dblclick',function(e){
    e.preventDefault(); e.stopPropagation();
    if(phase!=='rest'||pointer)return;
    restAt=null; saveSpot(); helloUntil=0; phase='hop'; phaseAt=now(); hopFrom={x:x,y:y}; updateMood(); syncBubble(); runFrames();
  });
  document.addEventListener('visibilitychange',scheduleLayout);

  function rgbToHsl(r,g,b) {
    r/=255;g/=255;b/=255;
    var max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,l=(max+min)/2,hue=0,sat=0;
    if(delta){sat=delta/(1-Math.abs(2*l-1));if(max===r)hue=((g-b)/delta)%6;else if(max===g)hue=(b-r)/delta+2;else hue=(r-g)/delta+4;hue=(hue*60+360)%360;}
    return [hue,sat,l];
  }
  function hslToRgb(hue,sat,l) {
    var c=(1-Math.abs(2*l-1))*sat,hh=hue/60,z=c*(1-Math.abs(hh%2-1)),m=l-c/2;
    var a=hh<1?[c,z,0]:hh<2?[z,c,0]:hh<3?[0,c,z]:hh<4?[0,z,c]:hh<5?[z,0,c]:[c,0,z];
    return a.map(function(v){return Math.round((v+m)*255);});
  }
  function inside(px,py,poly) {
    var hit=false;
    for(var i=0,j=poly.length-1;i<poly.length;j=i++) {
      var a=poly[i],b=poly[j];
      if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])hit=!hit;
    }
    return hit;
  }
  function recolor(name,hue,neutral) {
    var canvas=document.createElement('canvas');canvas.width=pack.width;canvas.height=pack.height;
    var ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
    ctx.drawImage(images[name],0,0);
    var pixels=ctx.getImageData(0,0,canvas.width,canvas.height),a=pixels.data;
    for(var i=0;i<a.length;i+=4) {
      if(!a[i+3])continue;
      // Off-white shoe panels and outline antialiasing can have a faint violet hue.
      if(Math.min(a[i],a[i+1],a[i+2])>220)continue;
      var value=rgbToHsl(a[i],a[i+1],a[i+2]);
      if(value[0]<235||value[0]>300||value[1]<=.15)continue;
      // Hair streak, eyes, headphones and clothes all follow the accent. Skin, black hair, outline
      // and white shoe parts are outside the purple range and stay as drawn. Source lightness is kept.
      var rgb=hslToRgb(hue,neutral?0:value[1],value[2]);
      a[i]=rgb[0];a[i+1]=rgb[1];a[i+2]=rgb[2];
    }
    ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
  }
  function useSources(map) {
    currentSources=map;
    if(shownMood)sprites[front].src=map[shownMood]||pack.poses[shownMood];
  }
  function accent() {
    if(!ready||!enabled||disposed)return;
    var color=getComputedStyle(html).getPropertyValue('--accent').trim();
    if(color===lastColor)return;lastColor=color;
    var token=++colorToken;
    if(cache[color]){useSources(cache[color]);return;}
    try {
      var probe=document.createElement('canvas').getContext('2d');
      if(!probe)throw Error('Canvas unavailable');
      probe.fillStyle='#b4a0f7';probe.fillStyle=color;
      probe.fillRect(0,0,1,1);var rgba=probe.getImageData(0,0,1,1).data;
      if(rgba[0]===180&&rgba[1]===160&&rgba[2]===247){useSources(pack.poses);return;}
      var hsl=rgbToHsl(rgba[0],rgba[1],rgba[2]), result={}, index=0;
      function next() {
        if(token!==colorToken||disposed)return;
        var name=names[index++];
        try{result[name]=recolor(name,hsl[0],hsl[1]<.03);}catch(ignore){result[name]=pack.poses[name];}
        if(index<names.length){requestAnimationFrame(next);return;}
        cache[color]=result;cacheOrder.push(color);
        if(cacheOrder.length>8)delete cache[cacheOrder.shift()];
        useSources(result);
      }
      requestAnimationFrame(next);
    } catch(ignore) { useSources(pack.poses); }
  }
  function scheduleAccent() { clearTimeout(colorTimer);colorTimer=setTimeout(accent,90); }
  // Resizing keeps the spot he sits on: wherever he rests, his seat stays put and he grows or shrinks around it.
  if (sizeInput) sizeInput.addEventListener('input',function(){
    var oldX = seatX, oldY = seatY;
    size = clampSize(sizeInput.value); measure();
    try{localStorage.setItem(sizeKey,String(size));}catch(ignore){}
    if (restAt && !restAt.perch) restAt = { x: restAt.x + oldX - seatX, y: restAt.y + oldY - seatY };
    else if (restAt) restAt = { perch: restAt.perch, dx: restAt.dx + oldX - seatX };
    saveSpot();
    resetPosition(false); layout();
  });
  setting.addEventListener('change',function(){
    enabled=setting.checked;try{localStorage.setItem(storeKey,String(enabled));}catch(ignore){}
    if(!enabled){colorToken++;lastColor='';}else scheduleAccent();
    resetPosition(true);layout();
  });
  var activityObserver=new MutationObserver(syncBubble);
  activityObserver.observe(activity,{attributes:true,attributeFilter:['hidden'],childList:true,characterData:true,subtree:true});
  var rootObserver=new MutationObserver(scheduleAccent);rootObserver.observe(html,{attributes:true,attributeFilter:['style','class']});
  var layoutObserver=new MutationObserver(scheduleLayout);
  [chat,settings,effort].forEach(function(el){layoutObserver.observe(el,{attributes:true,attributeFilter:['class','hidden','aria-hidden']});});
  var resizeObserver=new ResizeObserver(scheduleLayout);resizeObserver.observe(composer);resizeObserver.observe(document.body);
  motion.addListener(function(){if(reduced()){theta=0;omega=0;stretch=1;}scheduleLayout();});
  /* ---------- Vibing to the comp's music (1.3.0) ---------- */
  // Settings > Zeni: Dance to music, Smear and Bounce. While he is busy (thinking, working, approval, error)
  // he keeps that pose so you can still read it, and only bounces on the beat.
  var danceKey = 'zenframeAssistant.zeniDance', smearKey = 'zenframeAssistant.zeniSmear', bounceKey = 'zenframeAssistant.zeniBounce';
  var danceInput = document.getElementById('zeniDance'), smearInput = document.getElementById('zeniSmear'), bounceInput = document.getElementById('zeniBounce');
  var smearValue = document.getElementById('zeniSmearValue'), bounceValue = document.getElementById('zeniBounceValue');
  var danceOn = true, smearAmt = 60, bounceAmt = 55, vibeFrame = 0, vibing = '', shownSrc = ['', '', '', ''];
  try { danceOn = localStorage.getItem(danceKey) !== 'false'; smearAmt = num(localStorage.getItem(smearKey), 60); bounceAmt = num(localStorage.getItem(bounceKey), 55); } catch (ignore) {}
  function num(v, d) { var n = Number(v); return v !== null && v !== '' && isFinite(n) ? Math.max(0, Math.min(100, n)) : d; }
  function syncVibeInputs() {
    if (danceInput) danceInput.checked = danceOn;
    if (smearInput) smearInput.value = smearAmt; if (smearValue) smearValue.textContent = smearAmt + '%';
    if (bounceInput) bounceInput.value = bounceAmt; if (bounceValue) bounceValue.textContent = bounceAmt + '%';
  }
  syncVibeInputs();
  function eio(v) { return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, v))); }
  function src(name) { return currentSources[name] || pack.poses[name]; }
  function setImg(i, name, opacity, transform, blur) {
    var img = danceImgs[i], s2 = name ? src(name) : '';
    if (s2 && shownSrc[i] !== s2) { img.src = s2; shownSrc[i] = s2; }
    img.style.opacity = name ? opacity.toFixed(3) : '0';
    img.style.transform = transform || '';
    img.style.filter = blur ? 'blur(' + blur.toFixed(2) + 'px)' : '';
  }
  function canDance() {
    return !busy && !approval && baseMood === 'idle' && !(flashMood && flashUntil > now()) && helloUntil <= now();
  }
  function stopVibe() {
    if (!vibing) return;
    vibing = ''; button.classList.remove('zeni-vibing', 'zeni-dancing');
    breathe.style.transform = '';
    for (var i = 0; i < 4; i++) setImg(i, '', 0);
  }
  function vibeLoop() {
    vibeFrame = 0;
    var api = window.ZenframeVibe;
    var on = api && enabled && danceOn && visible && !disposed;
    if (api) api.setEnabled(on);
    if (!on) { stopVibe(); return; }
    var st = sitting() && !reduced() ? api.state() : null;
    if (!st) stopVibe();
    else {
      var unit = h / 110, bnc = bounceAmt / 100 * (0.5 + 0.5 * st.energy), sm = smearAmt / 100, b = st.beat;
      var dancing = canDance();
      button.classList.add('zeni-vibing'); button.classList.toggle('zeni-dancing', dancing);
      vibing = dancing ? 'dance' : 'bounce';
      if (st.mode === 'chill') {
        var q = ((b / 2) % 1 + 1) % 1, sway = Math.sin(q * 2 * Math.PI);
        var bob = (1 - Math.cos(q * 4 * Math.PI)) * 0.5 * 4 * bnc * unit;
        var rot = sway * 0.025 * (0.6 + 0.4 * st.energy);
        breathe.style.transform = 'translateY(' + bob.toFixed(2) + 'px) rotate(' + (dancing ? rot : rot * 0.4).toFixed(4) + 'rad)';
        if (dancing) {
          var seq = pack.vibe.chill, side = sway >= 0 ? seq[1] : seq[3], amt = eio((Math.abs(sway) - 0.35) / 0.3);
          if (amt < 0.5) { setImg(0, seq[0], 1); setImg(1, side, amt * 2); }
          else { setImg(0, side, 1); setImg(1, seq[0], (1 - amt) * 2); }
          setImg(2, '', 0); setImg(3, '', 0);
        }
      } else {
        var cyc = st.mode === 'half' ? 2 : 1, p = ((b / cyc) % 1 + 1) % 1, first = p < 0.18;
        var wv = first ? eio(p / 0.18) : 1 - eio((p - 0.18) / 0.82);   // 0 = head up, 1 = head down on the beat
        var dip = wv * 10 * bnc * unit, sq = 1 - 0.035 * bnc * wv, sx = 1 + 0.02 * bnc * wv;
        var alt = (Math.floor(b / cyc) % 2) ? 1 : -1, tilt = (wv - 0.5) * 0.03 * st.energy * alt;
        breathe.style.transform = 'translateY(' + dip.toFixed(2) + 'px) rotate(' + (dancing ? tilt : 0).toFixed(4) + 'rad) scale(' + sx.toFixed(4) + ',' + sq.toFixed(4) + ')';
        if (dancing) {
          var up = pack.vibe.up, down = pack.vibe.down, mix = eio((wv - 0.42) / 0.16);
          if (mix < 0.5) { setImg(0, up, 1); setImg(1, down, mix * 2); } else { setImg(0, down, 1); setImg(1, up, (1 - mix) * 2); }
          // Smear: soft, stretched ghosts only during the fastest part of the head drop.
          var speed = Math.sin(Math.PI * (first ? p / 0.18 : (p - 0.18) / 0.82)) * (first ? 1 / 0.18 : 1 / 0.82);
          var s2 = sm * Math.min(1, speed / 6), dir = first ? 1 : -1;
          if (s2 > 0.02 && mix > 0.05 && mix < 0.95) {
            setImg(2, down, 0.12 * s2 * mix, 'translateY(' + (-dir * 5 * s2 * unit).toFixed(2) + 'px) scaleY(' + (1 + 0.04 * s2).toFixed(3) + ')', 1.1 * s2 * unit);
            setImg(3, down, 0.12 * s2 * mix, 'translateY(' + (-dir * 10 * s2 * unit).toFixed(2) + 'px) scaleY(' + (1 + 0.04 * s2).toFixed(3) + ')', 2.2 * s2 * unit);
          } else { setImg(2, '', 0); setImg(3, '', 0); }
        }
      }
      if (!dancing) for (var i = 0; i < 4; i++) setImg(i, '', 0);
    }
    vibeFrame = requestAnimationFrame(vibeLoop);
  }
  function startVibe() { if (!vibeFrame && !disposed) vibeFrame = requestAnimationFrame(vibeLoop); }
  // Keep watching for music while he is shown with dancing on; the loop stops itself otherwise.
  setInterval(function () { if (enabled && danceOn && visible) startVibe(); else if (window.ZenframeVibe) window.ZenframeVibe.setEnabled(false); }, 500);
  if (danceInput) danceInput.addEventListener('change', function () { danceOn = danceInput.checked; try { localStorage.setItem(danceKey, String(danceOn)); } catch (ignore) {} if (!danceOn) stopVibe(); startVibe(); });
  if (smearInput) smearInput.addEventListener('input', function () { smearAmt = num(smearInput.value, 60); try { localStorage.setItem(smearKey, String(smearAmt)); } catch (ignore) {} syncVibeInputs(); });
  if (bounceInput) bounceInput.addEventListener('input', function () { bounceAmt = num(bounceInput.value, 55); try { localStorage.setItem(bounceKey, String(bounceAmt)); } catch (ignore) {} syncVibeInputs(); });

  window.ZenframeZeni={onEvent:event,setBusy:setBusy,confirm:confirm,stop:stop};
  var loaded=0;
  names.forEach(function(name){
    var img=new Image();images[name]=img;
    img.onload=function(){loaded++;if(loaded===names.length){ready=true;updateMood();layout();scheduleAccent();}};
    img.onerror=function(){enabled=false;setting.checked=false;layer.hidden=true;html.classList.remove('zeni-enabled');};
    img.src=pack.poses[name];
  });
  window.addEventListener('unload',function(){
    disposed=true;colorToken++;cancelAnimationFrame(frame);cancelAnimationFrame(layoutFrame);cancelAnimationFrame(vibeFrame);
    if(window.ZenframeVibe)window.ZenframeVibe.setEnabled(false);
    clearTimeout(moodTimer);clearTimeout(helloTimer);clearTimeout(colorTimer);
    activityObserver.disconnect();rootObserver.disconnect();layoutObserver.disconnect();resizeObserver.disconnect();
  });
}());
