/* Click-to-solve Rubik's cube logo with a Cayley-graph walk.
 *
 * Click 1: the static logo becomes a live cube, is scrambled quickly and then
 *          solved (~3.5 s) while a panel shows the same walk in the Cayley
 *          graph of the cube group (nodes = cube states, edges = face turns).
 * Click 2: scramble again (and stay scrambled).  Click 3: solve.  And so on.
 * After 1 scramble -> solve cycle, the next click navigates to the main page.
 *
 * The panel opens on the "sticker circles" view (54 stickers as the crossings
 * of 9 circles, where a face turn slides one circle); a toggle switches it to
 * the Cayley graph view.
 *
 * No dependencies. Ctrl/Cmd/Shift/middle-click on the logo still navigates.
 */
(function () {
  "use strict";

  // ---- configuration -------------------------------------------------------
  var SOLVE_MS = 330;      // per quarter turn while solving
  var SCRAMBLE_MS = 95;    // per quarter turn while scrambling
  var HALF_FACTOR = 1.4;   // half turns take this much longer
  var MIN_MOVES = 9, MAX_MOVES = 11;
  var CARD_W = 300, CARD_H = 290, CARD_LINGER_MS = 4000;

  // Logo orientation: red on top, yellow front-left, blue right.
  var FACES = {
    U: { axis: 1, sign: 1, color: "#e3211f" },
    R: { axis: 0, sign: 1, color: "#1b98dc" },
    F: { axis: 2, sign: 1, color: "#f6d21b" },
    D: { axis: 1, sign: -1, color: "#f28a1c" },
    L: { axis: 0, sign: -1, color: "#2fae4e" },
    B: { axis: 2, sign: -1, color: "#f3f3f0" }
  };
  var FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
  var BODY = "#0d0d0f";

  // ---- cube model ----------------------------------------------------------
  function rot(v, a, c, s) {
    var x = v[0], y = v[1], z = v[2];
    if (a === 0) return [x, y * c - z * s, y * s + z * c];
    if (a === 1) return [x * c + z * s, y, -x * s + z * c];
    return [x * c - y * s, x * s + y * c, z];
  }
  function rotInt(v, a, quarter) {            // quarter = +1 / -1 (90 deg steps)
    var r = rot(v, a, 0, quarter);
    return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2])];
  }

  function solvedCube() {
    var cubies = [];
    for (var x = -1; x <= 1; x++)
      for (var y = -1; y <= 1; y++)
        for (var z = -1; z <= 1; z++) {
          var p = [x, y, z], st = [];
          FACE_ORDER.forEach(function (f) {
            var F = FACES[f];
            if (p[F.axis] === F.sign) {
              var n = [0, 0, 0];
              n[F.axis] = F.sign;
              st.push({ n: n, c: F.color });
            }
          });
          cubies.push({ p: p, st: st });
        }
    return cubies;
  }

  // move = {f: 'U', t: 1 | -1 | 2}   (1 = clockwise seen from outside)
  function moveAngle(m) { return -FACES[m.f].sign * m.t * Math.PI / 2; }
  function inverse(m) { return { f: m.f, t: m.t === 2 ? 2 : -m.t }; }
  function moveName(m) { return m.f + (m.t === 2 ? "2" : m.t === -1 ? "'" : ""); }
  function moveSlot(m) {
    return FACE_ORDER.indexOf(m.f) * 3 + (m.t === 1 ? 0 : m.t === -1 ? 1 : 2);
  }

  function applyMove(cubies, m) {
    var F = FACES[m.f];
    var q = -F.sign * (m.t === 2 ? 1 : m.t);
    var reps = m.t === 2 ? 2 : 1;
    cubies.forEach(function (cb) {
      if (cb.p[F.axis] !== F.sign) return;
      for (var i = 0; i < reps; i++) {
        cb.p = rotInt(cb.p, F.axis, q);
        cb.st.forEach(function (s) { s.n = rotInt(s.n, F.axis, q); });
      }
    });
  }

  function randomScramble() {
    var n = MIN_MOVES + Math.floor(Math.random() * (MAX_MOVES - MIN_MOVES + 1));
    var out = [];
    while (out.length < n) {
      var f = FACE_ORDER[Math.floor(Math.random() * 6)];
      var a = FACES[f].axis, k = out.length;
      if (k && out[k - 1].f === f) continue;
      if (k > 1 && FACES[out[k - 1].f].axis === a && FACES[out[k - 2].f].axis === a) continue;
      out.push({ f: f, t: [1, -1, 2][Math.floor(Math.random() * 3)] });
    }
    return out;
  }

  // ---- cube rendering ------------------------------------------------------
  var C30 = Math.cos(Math.PI / 6);
  var NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  function drawCube(ctx, w, h, cubies, turning, angle) {
    ctx.clearRect(0, 0, w, h);
    var S = 0.159 * h, cx = w * 0.497, cy = h * 0.505;
    var ax = turning ? FACES[turning.f].axis : -1;
    var layer = turning ? FACES[turning.f].sign : 0;
    var c = Math.cos(angle), s = Math.sin(angle);

    function tf(v, moving) { return moving ? rot(v, ax, c, s) : v; }
    function px(v) {
      return [cx + S * (v[0] - v[2]) * C30, cy + S * ((v[0] + v[2]) * 0.5 - v[1])];
    }
    function quad(center, n, half, moving) {
      var u = [n[1], n[2], n[0]], v = [n[2], n[0], n[1]], pts = [];
      [[1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(function (k) {
        pts.push(px(tf([
          center[0] + half * (k[0] * u[0] + k[1] * v[0]),
          center[1] + half * (k[0] * u[1] + k[1] * v[1]),
          center[2] + half * (k[0] * u[2] + k[1] * v[2])
        ], moving)));
      });
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }

    // Painter's order: slabs along the turning axis back-to-front, then depth.
    var order = cubies.map(function (cb) {
      var moving = ax >= 0 && cb.p[ax] === layer;
      var q = tf(cb.p, moving);
      return { cb: cb, moving: moving, key: (ax >= 0 ? cb.p[ax] * 100 : 0) + q[0] + q[1] + q[2] };
    }).sort(function (a, b) { return a.key - b.key; });

    ctx.lineJoin = "round";
    order.forEach(function (o) {
      var cb = o.cb;
      NORMALS.forEach(function (n) {
        var nn = tf(n, o.moving);
        if (nn[0] + nn[1] + nn[2] <= 1e-6) return;          // back-facing
        var fc = [cb.p[0] + n[0] * 0.5, cb.p[1] + n[1] * 0.5, cb.p[2] + n[2] * 0.5];
        quad(fc, n, 0.5, o.moving);
        ctx.fillStyle = BODY; ctx.strokeStyle = BODY; ctx.lineWidth = 0.6;
        ctx.fill(); ctx.stroke();
        for (var i = 0; i < cb.st.length; i++) {
          var st = cb.st[i];
          if (st.n[0] === n[0] && st.n[1] === n[1] && st.n[2] === n[2]) {
            quad(fc, n, 0.37, o.moving);
            ctx.fillStyle = st.c; ctx.strokeStyle = st.c; ctx.lineWidth = S * 0.1;
            ctx.fill(); ctx.stroke();
          }
        }
      });
    });
  }

  // ---- Cayley graph rendering ---------------------------------------------
  // Node 0 is the identity (solved); node i is the state after i scramble
  // moves. Nodes sit on an Archimedean spiral so every edge (= one move) has
  // roughly the same length. Each node also shows stubs for its other
  // neighbours: every state has 18 neighbours (6 faces x 3 turns).
  function makeGraph(moves) {
    var n = moves.length, R = 112;
    var th0 = Math.random() * Math.PI * 2, dir = Math.random() < 0.5 ? 1 : -1;
    var nodes = [];
    for (var i = 0; i <= n; i++) {
      var r = R * Math.sqrt(i / n), th = th0 + dir * 2.4 * Math.sqrt(i);
      nodes.push({ x: r * Math.cos(th), y: r * Math.sin(th), base: Math.random() * Math.PI * 2 });
    }
    // centre the bounding box (stubs included) in the panel
    var xs = nodes.map(function (q) { return q.x; }), ys = nodes.map(function (q) { return q.y; });
    var mx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
    var my = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
    nodes.forEach(function (q) { q.x -= mx; q.y -= my; });
    return { moves: moves, nodes: nodes, n: n };
  }

  // Face colour for thin lines / text on the white panel.
  function ink(hex) {
    return hex === FACES.B.color ? "#8f96a0" : hex === FACES.F.color ? "#d1a800" : hex;
  }

  function rgba(hex, a) {
    var v = parseInt(hex.slice(1), 16);
    return "rgba(" + (v >> 16) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
  }

  // pos: fractional node index of the walker; built: nodes revealed so far;
  // solving: when true, edges already walked back (index >= pos) are lit.
  function drawGraph(ctx, g, pos, built, solving) {
    var w = CARD_W, h = CARD_H, ox = w / 2, oy = h / 2;
    ctx.clearRect(0, 0, w, h);
    if (!g) return;
    var N = g.nodes, i, a, b;

    function reveal(i) { return Math.max(0, Math.min(1, built - i + 1)); }

    // neighbour stubs
    ctx.lineCap = "round";
    for (i = 0; i <= g.n; i++) {
      var k = reveal(i);
      if (k <= 0) continue;
      var skipA = i < g.n ? moveSlot(g.moves[i]) : -1;
      var skipB = i > 0 ? moveSlot(inverse(g.moves[i - 1])) : -1;
      for (var sl = 0; sl < 18; sl++) {
        if (sl === skipA || sl === skipB) continue;
        var ang = N[i].base + sl * Math.PI / 9, len = 12 * k;
        var col = ink(FACES[FACE_ORDER[Math.floor(sl / 3)]].color);
        var x1 = ox + N[i].x + Math.cos(ang) * len, y1 = oy + N[i].y + Math.sin(ang) * len;
        ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ox + N[i].x, oy + N[i].y); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.fillStyle = rgba(col, 0.8);
        ctx.beginPath(); ctx.arc(x1, y1, 1.3, 0, 6.3); ctx.fill();
      }
    }

    // path edges
    for (i = 0; i < g.n; i++) {
      var f = Math.max(0, Math.min(1, built - i));       // how much of edge exists
      if (f <= 0) continue;
      a = N[i]; b = N[i + 1];
      var col2 = FACES[g.moves[i].f].color;
      var lit = solving ? Math.max(0, Math.min(1, i + 1 - pos)) : 1;  // lit from far end
      var ex = ox + a.x + (b.x - a.x) * f, ey = oy + a.y + (b.y - a.y) * f;
      if (!solving) {                                    // dark outline, then colour
        ctx.strokeStyle = BODY; ctx.lineWidth = 4.2;
        ctx.beginPath(); ctx.moveTo(ox + a.x, oy + a.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = col2; ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(ox + a.x, oy + a.y); ctx.lineTo(ex, ey); ctx.stroke();
      } else {
        ctx.strokeStyle = rgba(ink(col2), 0.4); ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(ox + a.x, oy + a.y); ctx.lineTo(ex, ey); ctx.stroke();
        if (lit > 0) {
          var lx = ox + b.x + (a.x - b.x) * lit, ly = oy + b.y + (a.y - b.y) * lit;
          ctx.strokeStyle = BODY; ctx.lineWidth = 4.6;
          ctx.beginPath(); ctx.moveTo(ox + b.x, oy + b.y); ctx.lineTo(lx, ly); ctx.stroke();
          ctx.strokeStyle = col2; ctx.lineWidth = 3.2;
          ctx.beginPath(); ctx.moveTo(ox + b.x, oy + b.y); ctx.lineTo(lx, ly); ctx.stroke();
        }
      }
    }

    // path nodes
    for (i = 0; i <= g.n; i++) {
      if (reveal(i) <= 0) continue;
      ctx.fillStyle = i === 0 ? BODY : "#4a505a";
      ctx.beginPath(); ctx.arc(ox + N[i].x, oy + N[i].y, i === 0 ? 5 : 3, 0, 6.3); ctx.fill();
    }
    ctx.fillStyle = "#ffffff"; ctx.font = "italic 700 8px Georgia, serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("e", ox + N[0].x, oy + N[0].y + 0.5);

    // walker (current cube state)
    var i0 = Math.max(0, Math.min(g.n, Math.floor(pos))), i1 = Math.min(g.n, i0 + 1), t = pos - i0;
    var wx = ox + N[i0].x + (N[i1].x - N[i0].x) * t, wy = oy + N[i0].y + (N[i1].y - N[i0].y) * t;
    ctx.strokeStyle = BODY; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(wx, wy, 7.5, 0, 6.3); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.14)"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(wx, wy, 11, 0, 6.3); ctx.stroke();
  }

  // ---- sticker-circle rendering --------------------------------------------
  // The cube drawn as 9 circles: one family of 3 concentric circles per axis,
  // one circle per layer. Any two circles of different families cross twice,
  // giving 3 * 9 * 2 = 54 crossings = the 54 stickers. A face turn slides the
  // 12 stickers on that layer's circle a quarter of the way round and spins
  // the 9 stickers of the face enclosed by it.
  var RING_C = [[295, 258], [220, 128], [145, 258]];     // centres for x, y, z
  var RING_R = { "1": 112, "0": 136, "-1": 160 };        // layer +1 / 0 / -1

  function ringPoint(p, n) {
    var k = n[0] ? 0 : n[1] ? 1 : 2, i = (k + 1) % 3, j = (k + 2) % 3;
    var A = RING_C[i], B = RING_C[j], K = RING_C[k], ra = RING_R[p[i]], rb = RING_R[p[j]];
    var dx = B[0] - A[0], dy = B[1] - A[1], d = Math.sqrt(dx * dx + dy * dy);
    var a = (ra * ra - rb * rb + d * d) / (2 * d), h = Math.sqrt(ra * ra - a * a);
    var mx = A[0] + a * dx / d, my = A[1] + a * dy / d;
    var P1 = [mx - h * dy / d, my + h * dx / d], P2 = [mx + h * dy / d, my - h * dx / d];
    var d1 = Math.pow(P1[0] - K[0], 2) + Math.pow(P1[1] - K[1], 2);
    var d2 = Math.pow(P2[0] - K[0], 2) + Math.pow(P2[1] - K[1], 2);
    return ((d1 < d2) === (n[k] > 0)) ? P1 : P2;      // + face: crossing nearer centre k
  }

  // Move from P0 to P1 on an arc around C (angle and radius interpolated).
  function arcLerp(P0, P1, C, t) {
    var a0 = Math.atan2(P0[1] - C[1], P0[0] - C[0]), a1 = Math.atan2(P1[1] - C[1], P1[0] - C[0]);
    var r0 = Math.sqrt(Math.pow(P0[0] - C[0], 2) + Math.pow(P0[1] - C[1], 2));
    var r1 = Math.sqrt(Math.pow(P1[0] - C[0], 2) + Math.pow(P1[1] - C[1], 2));
    var da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da <= -Math.PI) da += 2 * Math.PI;
    var a = a0 + da * t, r = r0 + (r1 - r0) * t;
    return [C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)];
  }

  var RING_FIT = (function () {                          // fit all 9 circles in the panel
    var lo = [1e9, 1e9], hi = [-1e9, -1e9], pad = 8;
    RING_C.forEach(function (c) {
      for (var i = 0; i < 2; i++) {
        lo[i] = Math.min(lo[i], c[i] - RING_R["-1"]); hi[i] = Math.max(hi[i], c[i] + RING_R["-1"]);
      }
    });
    var k = Math.min((CARD_W - 2 * pad) / (hi[0] - lo[0]), (CARD_H - 2 * pad) / (hi[1] - lo[1]));
    return { k: k, ox: CARD_W / 2 - k * (lo[0] + hi[0]) / 2, oy: CARD_H / 2 - k * (lo[1] + hi[1]) / 2 };
  })();

  // cubies: state before the turn; m: move in progress (or null); e: 0..1.
  function drawCircles(ctx, cubies, m, e) {
    var k = RING_FIT.k, ox = RING_FIT.ox, oy = RING_FIT.oy, a, key;
    ctx.clearRect(0, 0, CARD_W, CARD_H);
    var F = m ? FACES[m.f] : null;
    for (a = 0; a < 3; a++)
      for (key in RING_R) {
        var hot = F && F.axis === a && String(F.sign) === key;
        ctx.strokeStyle = hot ? ink(F.color) : "rgba(0,0,0,.2)";
        ctx.lineWidth = hot ? 2 : 1;
        ctx.beginPath();
        ctx.arc(ox + k * RING_C[a][0], oy + k * RING_C[a][1], k * RING_R[key], 0, 6.3);
        ctx.stroke();
      }

    var steps = m && m.t === 2 ? 2 : 1, q = m ? -F.sign * (m.t === 2 ? 1 : m.t) : 0;
    var u = e * steps, step = Math.min(steps - 1, Math.floor(u)), t = u - step;
    var faceN = [0, 0, 0], faceC = null;
    if (m) { faceN[F.axis] = F.sign; faceC = ringPoint(faceN, faceN); }

    var still = [], moving = [];
    cubies.forEach(function (cb) {
      var mv = m && cb.p[F.axis] === F.sign;
      cb.st.forEach(function (st) {
        if (!mv) { still.push([ringPoint(cb.p, st.n), st.c]); return; }
        var p = cb.p, n = st.n;
        for (var i = 0; i < step; i++) { p = rotInt(p, F.axis, q); n = rotInt(n, F.axis, q); }
        var P0 = ringPoint(p, n), P1 = ringPoint(rotInt(p, F.axis, q), rotInt(n, F.axis, q));
        var C = n[F.axis] !== 0 ? faceC : RING_C[F.axis];   // face sticker vs belt sticker
        moving.push([arcLerp(P0, P1, C, t), st.c]);
      });
    });
    still.concat(moving).forEach(function (d) {
      ctx.fillStyle = d[1]; ctx.strokeStyle = BODY; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(ox + k * d[0][0], oy + k * d[0][1], 3.9, 0, 6.3);
      ctx.fill(); ctx.stroke();
    });
  }

  // ---- DOM wiring ----------------------------------------------------------
  function init() {
    var link = document.querySelector("a.navbar-brand-logo");
    if (!link) return;
    var imgs = Array.prototype.slice.call(link.querySelectorAll("img"));
    var img = imgs.filter(function (el) { return el.offsetWidth > 0; })[0] || imgs[0];
    if (!img) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    link.style.position = "relative";
    link.style.cursor = "pointer";
    link.title = "Click: scramble / solve";
    imgs.forEach(function (el) { el.style.transition = "opacity .25s"; });

    var cubeCv = document.createElement("canvas");
    cubeCv.setAttribute("aria-hidden", "true");
    cubeCv.style.cssText = "position:absolute;opacity:0;transition:opacity .25s;pointer-events:none;";
    link.appendChild(cubeCv);
    var cubeCtx = cubeCv.getContext("2d"), cw = 0, ch = 0;

    function fitCube() {
      cw = img.offsetWidth; ch = img.offsetHeight;
      cubeCv.style.left = img.offsetLeft + "px"; cubeCv.style.top = img.offsetTop + "px";
      cubeCv.style.width = cw + "px"; cubeCv.style.height = ch + "px";
      cubeCv.width = Math.round(cw * dpr); cubeCv.height = Math.round(ch * dpr);
      cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    var card = document.createElement("div");
    card.setAttribute("aria-hidden", "true");
    card.style.cssText =
      "position:fixed;z-index:2000;width:" + CARD_W + "px;box-sizing:border-box;padding:8px 0 8px;" +
      "background:#ffffff;border:1px solid rgba(0,0,0,.14);border-radius:12px;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.25);color:#3a3f47;pointer-events:none;opacity:0;" +
      "transform:translateY(-6px);transition:opacity .3s, transform .3s;" +
      "font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;";
    var mode = "circles";
    try { if (localStorage.getItem("cubeLogoView") === "graph") mode = "graph"; } catch (e) {}
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;justify-content:flex-end;padding:0 10px 6px;";
    var modeBtns = {};
    [["circles", "sticker circles"], ["graph", "Cayley graph"]].forEach(function (d, i) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = d[1];
      b.style.cssText = "font:inherit;font-size:10px;padding:2px 8px;cursor:pointer;color:#3a3f47;" +
        "border:1px solid rgba(0,0,0,.22);background:transparent;" +
        (i ? "border-left:0;border-radius:0 6px 6px 0;" : "border-radius:6px 0 0 6px;");
      b.addEventListener("click", function () { setMode(d[0]); });
      modeBtns[d[0]] = b; bar.appendChild(b);
    });
    var head = document.createElement("div");
    head.style.cssText = "padding:0 12px;min-height:30px;font-size:12px;";
    var graphCv = document.createElement("canvas");
    graphCv.width = CARD_W * dpr; graphCv.height = CARD_H * dpr;
    graphCv.style.cssText = "display:block;width:" + CARD_W + "px;height:" + CARD_H + "px;";
    var graphCtx = graphCv.getContext("2d");
    graphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var foot = document.createElement("div");
    foot.style.cssText = "padding:0 12px;font-size:10px;color:#6b7280;";
    card.appendChild(bar); card.appendChild(head); card.appendChild(graphCv); card.appendChild(foot);
    document.body.appendChild(card);

    var hideTimer = null, hovered = false;
    function setMode(mo) {
      mode = mo;
      try { localStorage.setItem("cubeLogoView", mo); } catch (e) {}
      for (var key in modeBtns) {
        modeBtns[key].style.background = key === mo ? "rgba(0,0,0,.09)" : "transparent";
        modeBtns[key].style.color = key === mo ? "#111111" : "#6b7280";
        modeBtns[key].setAttribute("aria-pressed", key === mo ? "true" : "false");
      }
      foot.textContent = mo === "graph"
        ? "4.3×10¹⁹ states · 18 edges per state"
        : "54 stickers · 9 circles · a turn slides one";
      if (!busy) { render(null, 0, 0); if (card.style.opacity === "1") hideCardLater(); }
    }
    card.addEventListener("mouseenter", function () { hovered = true; clearTimeout(hideTimer); });
    card.addEventListener("mouseleave", function () { hovered = false; if (!busy) hideCardLater(); });
    function placeCard() {
      var r = link.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      card.style.left = Math.max(8, Math.min(r.left, vw - CARD_W - 8)) + "px";
      card.style.top = Math.max(8, r.bottom + 8) + "px";
    }
    function showCard() {
      clearTimeout(hideTimer); placeCard();
      card.style.opacity = "1"; card.style.transform = "none"; card.style.pointerEvents = "auto";
    }
    function hideCardLater() {
      clearTimeout(hideTimer);
      if (hovered) return;
      hideTimer = setTimeout(function () {
        card.style.opacity = "0"; card.style.transform = "translateY(-6px)";
        card.style.pointerEvents = "none";
      }, CARD_LINGER_MS);
    }
    function showCanvas(on) {
      cubeCv.style.opacity = on ? "1" : "0";
      imgs.forEach(function (el) { el.style.opacity = on ? "0" : "1"; });
    }
    function setHead(label, list, done, current) {
      head.innerHTML = '<span style="color:#6b7280">' + label + "</span> " +
        list.map(function (m, i) {
          var col = ink(FACES[m.f].color);
          var style = i < done ? "color:" + col
            : i === current ? "color:" + col + ";border-bottom:2px solid " + col
            : "color:#b4b9c1";
          return '<span style="' + style + '">' + moveName(m) + "</span>";
        }).join(" ");
    }

    // ---- animation state ----
    var cubies = solvedCube(), graph = null, scrambled = false, busy = false;
    var cycles = 0, MAX_CYCLES = 1;   // after this many solves, the logo link works normally
    var gPos = 0, gBuilt = 0, gSolving = false;

    function render(turning, angle, e) {
      if (cw) drawCube(cubeCtx, cw, ch, cubies, turning, angle || 0);
      if (mode === "circles") drawCircles(graphCtx, cubies, turning, e || 0);
      else drawGraph(graphCtx, graph, gPos, gBuilt, gSolving);
    }
    setMode(mode);
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

    // Animate one face turn; `onProgress(e)` gets eased progress 0..1.
    function turn(m, ms, onProgress) {
      var dur = ms * (m.t === 2 ? HALF_FACTOR : 1), total = moveAngle(m);
      return new Promise(function (res) {
        var t0 = null;
        function frame(now) {
          if (t0 === null) t0 = now;
          var t = Math.min(1, (now - t0) / dur), e = ease(t);
          onProgress(e);
          if (t < 1) { render(m, total * e, e); requestAnimationFrame(frame); }
          else { applyMove(cubies, m); render(null, 0); res(); }
        }
        requestAnimationFrame(frame);
      });
    }

    async function scramble() {
      var moves = randomScramble();
      graph = makeGraph(moves);
      gPos = 0; gBuilt = 0; gSolving = false;
      for (var i = 0; i < moves.length; i++) {
        setHead("scramble", moves, i, i);
        await turn(moves[i], SCRAMBLE_MS, function (e) { gPos = gBuilt = i + e; });
      }
      setHead("scramble", moves, moves.length, -1);
      scrambled = true;
    }

    async function solve() {
      var n = graph.n, sol = graph.moves.slice().reverse().map(inverse);
      gSolving = true;
      for (var j = 0; j < n; j++) {
        setHead("solve", sol, j, j);
        await turn(sol[j], SOLVE_MS, function (e) { gPos = n - j - e; });
      }
      setHead("solved in " + n + " moves:", sol, n, -1);
      scrambled = false;
      cycles++;
    }

    async function onClick() {
      if (busy) return;
      busy = true;
      try {
        fitCube(); render(null, 0); showCanvas(true); showCard();
        if (!scrambled) {
          var first = !graph;
          await scramble();
          if (first) { await wait(350); await solve(); }   // first click: full demo
        } else {
          await solve();
        }
        if (!scrambled) { await wait(500); showCanvas(false); }  // back to the real logo
        hideCardLater();
      } finally { busy = false; }
    }

    link.addEventListener("click", function (ev) {
      if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
      if (!busy && !scrambled && cycles >= MAX_CYCLES) return;   // let the link go to the main page
      ev.preventDefault();
      onClick();
    });
    window.addEventListener("resize", function () {
      if (cubeCv.style.opacity === "1" && !busy) { fitCube(); render(null, 0); }
      if (card.style.opacity === "1") placeCard();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
