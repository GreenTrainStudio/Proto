// Ragdoll Lab vector art. Every function takes `c(token)` and returns an SVG string.
// Colors are never hardcoded: the plugin passes a resolver that returns marker colors
// and rebinds them to Figma variables after import; the preview passes real hex values.

var RDL_ART = (function () {
  var OUT = 4; // art/outline stroke width

  function f(n) { return Math.round(n * 100) / 100; }
  function rad(a) { return (a * Math.PI) / 180; }
  function pt(cx, cy, r, a) { return [f(cx + r * Math.cos(rad(a))), f(cy + r * Math.sin(rad(a)))]; }
  function svg(w, h, body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + body + '</svg>';
  }
  function outlineAttrs(c, w) {
    return ' fill="none" stroke="' + c('art/outline') + '" stroke-width="' + (w || OUT) + '" stroke-linejoin="round" stroke-linecap="round"';
  }
  function rect(x, y, w, h, r, fill, extra) {
    return '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx="' + f(r) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function circle(cx, cy, r, fill, extra) {
    return '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function path(d, extra) { return '<path d="' + d + '"' + extra + '/>'; }
  function arc(cx, cy, r, a0, a1) {
    var p0 = pt(cx, cy, r, a0), p1 = pt(cx, cy, r, a1);
    var large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return 'M' + p0[0] + ' ' + p0[1] + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0] + ' ' + p1[1];
  }
  function stroke(c, token, w, opacity) {
    return ' fill="none" stroke="' + c(token) + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + (opacity != null ? ' stroke-opacity="' + opacity + '"' : '');
  }

  // ---------------------------------------------------------------- Test room (1920 x 1080)
  var ROOM = { w: 1920, h: 1080, ceiling: 88, side: 88, floorTop: 840 };

  function room(c) {
    var W = ROOM.w, H = ROOM.h, C = ROOM.ceiling, S = ROOM.side, FT = ROOM.floorTop;
    var b = '';
    b += rect(0, 0, W, H, 0, c('room/wall'));
    // wall panels: 6 x 2 grid between side walls
    var cols = 6, rows = 2, pw = (W - 2 * S) / cols, ph = (FT - C) / rows;
    for (var r = 0; r < rows; r++) {
      for (var k = 0; k < cols; k++) {
        var x = S + k * pw, y = C + r * ph;
        b += rect(x + 14, y + 14, pw - 28, ph - 28, 14, c('room/wall-panel'), ' stroke="' + c('room/wall-seam') + '" stroke-width="3"');
        b += circle(x + 30, y + 30, 5, c('room/wall-seam'));
        b += circle(x + pw - 30, y + 30, 5, c('room/wall-seam'));
        b += circle(x + 30, y + ph - 30, 5, c('room/wall-seam'));
        b += circle(x + pw - 30, y + ph - 30, 5, c('room/wall-seam'));
      }
    }
    // baseboard
    b += rect(S, FT - 14, W - 2 * S, 14, 0, c('room/wall-seam'));
    // light cones
    [480, 960, 1440].forEach(function (cx) {
      b += path('M' + (cx - 110) + ' ' + (C + 18) + ' L' + (cx + 110) + ' ' + (C + 18) + ' L' + (cx + 320) + ' ' + FT + ' L' + (cx - 320) + ' ' + FT + ' Z', ' fill="' + c('room/light') + '" fill-opacity="0.16"');
    });
    // observation window (top right panel)
    b += rect(1500, 136, 280, 188, 26, c('room/side-wall'), outlineAttrs(c, 6).replace(' fill="none"', ''));
    b += rect(1518, 154, 244, 152, 16, c('room/glass'), outlineAttrs(c, 4).replace(' fill="none"', ''));
    b += path('M1560 300 L1640 160 L1676 160 L1596 300 Z', ' fill="' + c('room/light') + '" fill-opacity="0.55"');
    b += path('M1620 300 L1700 160 L1716 160 L1636 300 Z', ' fill="' + c('room/light') + '" fill-opacity="0.4"');
    // hazard sign (top left panel)
    b += path('M260 168 L320 272 L200 272 Z', ' fill="' + c('room/hazard-a') + '"' + outlineAttrs(c, 6).replace(' fill="none"', ''));
    b += rect(254, 198, 12, 44, 6, c('room/hazard-b'));
    b += circle(260, 256, 7, c('room/hazard-b'));
    // side walls
    b += rect(0, C, S, FT - C, 0, c('room/side-wall'));
    b += rect(S - 18, C, 18, FT - C, 0, c('room/side-wall-shade'));
    b += rect(W - S, C, S, FT - C, 0, c('room/side-wall'));
    b += rect(W - S, C, 18, FT - C, 0, c('room/side-wall-shade'));
    for (var i = 0; i < 6; i++) {
      var by = C + 60 + i * 124;
      b += circle(S / 2 - 8, by, 7, c('room/side-wall-shade'));
      b += circle(W - S / 2 + 8, by, 7, c('room/side-wall-shade'));
    }
    b += path('M' + S + ' ' + C + ' V' + FT + ' M' + (W - S) + ' ' + C + ' V' + FT, outlineAttrs(c, 4));
    // ceiling + lamps
    b += rect(0, 0, W, C, 0, c('room/ceiling'));
    b += path('M0 ' + C + ' H' + W, outlineAttrs(c, 4));
    [480, 960, 1440].forEach(function (cx) {
      b += rect(cx - 110, C - 4, 220, 22, 8, c('room/light'), outlineAttrs(c, 4).replace(' fill="none"', ''));
    });
    // floor
    b += rect(0, FT, W, H - FT, 0, c('room/floor'));
    for (var sx = 240; sx < W; sx += 240) {
      b += path('M' + sx + ' ' + (FT + 56) + ' V' + H, ' stroke="' + c('room/floor-shade') + '" stroke-width="4"');
      b += circle(sx - 20, FT + 80, 5, c('room/floor-shade'));
      b += circle(sx + 20, FT + 80, 5, c('room/floor-shade'));
    }
    b += rect(0, FT + 24, W, 32, 0, c('room/hazard-a'));
    for (var hx = -32; hx < W + 32; hx += 64) {
      b += path('M' + hx + ' ' + (FT + 24) + ' L' + (hx + 32) + ' ' + (FT + 24) + ' L' + hx + ' ' + (FT + 56) + ' L' + (hx - 32) + ' ' + (FT + 56) + ' Z', ' fill="' + c('room/hazard-b') + '"');
    }
    b += rect(0, FT, W, 24, 0, c('room/floor-top'));
    b += path('M0 ' + FT + ' H' + W + ' M0 ' + (FT + 24) + ' H' + W + ' M0 ' + (FT + 56) + ' H' + W, outlineAttrs(c, 4));
    return svg(W, H, b);
  }

  function roomGrid(c) {
    var S = ROOM.side, C = ROOM.ceiling, FT = ROOM.floorTop, W = ROOM.w;
    var b = '', d = '';
    for (var x = S + 64; x < W - S; x += 64) d += 'M' + x + ' ' + C + ' V' + FT + ' ';
    for (var y = C + 64; y < FT; y += 64) d += 'M' + S + ' ' + y + ' H' + (W - S) + ' ';
    b += path(d.trim(), ' stroke="' + c('room/grid') + '" stroke-opacity="0.35" stroke-width="2"');
    b += rect(S + 6, C + 6, W - 2 * S - 12, FT - C - 12, 12, 'none', ' stroke="' + c('room/grid') + '" stroke-width="4" stroke-dasharray="18 12"');
    return svg(W, ROOM.h, b);
  }

  // ---------------------------------------------------------------- Ragdoll (300 x 470)
  // Each part is drawn in local space with its joint pivot at (0, 0).
  var RAG = { w: 300, h: 470 };
  var RIG = {
    pelvis: { parent: null, at: [150, 266], rot: 0, kind: 'pelvis' },
    torso: { parent: 'pelvis', at: [0, -16], rot: 0, kind: 'torso' },
    head: { parent: 'torso', at: [0, -116], rot: 0, kind: 'head' },
    upperArmL: { parent: 'torso', at: [-40, -98], rot: 18, kind: 'upperArm' },
    lowerArmL: { parent: 'upperArmL', at: [0, 68], rot: 8, kind: 'lowerArm' },
    handL: { parent: 'lowerArmL', at: [0, 58], rot: 0, kind: 'hand' },
    upperArmR: { parent: 'torso', at: [40, -98], rot: -18, kind: 'upperArm' },
    lowerArmR: { parent: 'upperArmR', at: [0, 68], rot: -8, kind: 'lowerArm' },
    handR: { parent: 'lowerArmR', at: [0, 58], rot: 0, kind: 'hand' },
    thighL: { parent: 'pelvis', at: [-18, 14], rot: 4, kind: 'thigh' },
    shinL: { parent: 'thighL', at: [0, 84], rot: -5, kind: 'shin' },
    footL: { parent: 'shinL', at: [0, 74], rot: 1, kind: 'foot', mirror: true },
    thighR: { parent: 'pelvis', at: [18, 14], rot: -4, kind: 'thigh' },
    shinR: { parent: 'thighR', at: [0, 84], rot: 5, kind: 'shin' },
    footR: { parent: 'shinR', at: [0, 74], rot: -1, kind: 'foot' },
  };
  var DRAW_ORDER = ['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'torso', 'pelvis', 'head',
    'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR'];
  var PART_NAMES = {
    pelvis: 'pelvis', torso: 'torso', head: 'head',
    upperArmL: 'upper-arm-L', lowerArmL: 'lower-arm-L', handL: 'hand-L',
    upperArmR: 'upper-arm-R', lowerArmR: 'lower-arm-R', handR: 'hand-R',
    thighL: 'thigh-L', shinL: 'shin-L', footL: 'foot-L',
    thighR: 'thigh-R', shinR: 'shin-R', footR: 'foot-R',
  };

  function world(id) {
    var p = RIG[id];
    if (!p.parent) return { x: p.at[0], y: p.at[1], a: p.rot };
    var w = world(p.parent);
    var cs = Math.cos(rad(w.a)), sn = Math.sin(rad(w.a));
    return { x: w.x + p.at[0] * cs - p.at[1] * sn, y: w.y + p.at[0] * sn + p.at[1] * cs, a: w.a + p.rot };
  }

  function capsule(c, x, y, w, h) {
    var r = w / 2;
    return rect(x, y, w, h, r, c('subject/shade')) +
      rect(x, y, w - 7, h, r - 3.5, c('subject/body')) +
      rect(x + 5, y + 9, 4, Math.max(8, h * 0.34), 2, c('subject/highlight')) +
      rect(x, y, w, h, r, 'none', outlineAttrs(c));
  }
  function ball(c, cx, cy, r) {
    return circle(cx, cy, r, c('subject/joint'), ' stroke="' + c('art/outline') + '" stroke-width="' + OUT + '"') +
      circle(cx - r * 0.35, cy - r * 0.35, Math.max(2, r * 0.22), c('subject/joint-highlight'));
  }
  function crack(c, d) { return path(d, outlineAttrs(c, 3)); }
  function scuff(c, cx, cy, rx, ry) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + c('subject/scuff') + '" fill-opacity="0.6"/>';
  }

  function partInner(kind, c, o) {
    o = o || {};
    var b = '';
    if (kind === 'head') {
      b += rect(-11, -24, 22, 26, 6, c('subject/joint'), ' stroke="' + c('art/outline') + '" stroke-width="' + OUT + '"');
      b += rect(-38, -106, 76, 88, 34, c('subject/shade'));
      b += rect(-38, -106, 69, 88, 31, c('subject/body'));
      b += '<ellipse cx="-20" cy="-86" rx="7" ry="11" transform="rotate(25 -20 -86)" fill="' + c('subject/highlight') + '"/>';
      if (o.hurt) {
        b += path('M-18 -69 L-8 -59 M-8 -69 L-18 -59 M8 -69 L18 -59 M18 -69 L8 -59', outlineAttrs(c, 4));
        b += path('M-12 -38 Q-9 -44 -5 -38 T2 -38 T9 -38 T14 -40', outlineAttrs(c, 4));
        b += crack(c, 'M22 -103 L14 -92 L24 -84 L16 -72');
        b += '<g transform="rotate(-28 -20 -90)">' + rect(-34, -96, 28, 12, 4, c('subject/bandage'), ' stroke="' + c('art/outline') + '" stroke-width="3"') +
          circle(-24, -90, 1.6, c('art/outline')) + circle(-16, -90, 1.6, c('art/outline')) + '</g>';
      } else {
        b += circle(-13, -64, 5.5, c('art/outline'));
        b += circle(13, -64, 5.5, c('art/outline'));
        b += path('M-9 -40 Q0 -35 9 -40', outlineAttrs(c, 4));
      }
      b += rect(-38, -106, 76, 88, 34, 'none', outlineAttrs(c));
    } else if (kind === 'torso') {
      b += rect(-42, -120, 84, 124, 28, c('subject/shade'));
      b += rect(-42, -120, 76, 124, 26, c('subject/body'));
      b += rect(-33, -106, 6, 40, 3, c('subject/highlight'));
      b += circle(0, -74, 17, c('subject/body'));
      b += path('M0 -74 L0 -91 A17 17 0 0 1 17 -74 Z', ' fill="' + c('subject/marker') + '"');
      b += path('M0 -74 L0 -57 A17 17 0 0 1 -17 -74 Z', ' fill="' + c('subject/marker') + '"');
      b += circle(0, -74, 17, 'none', outlineAttrs(c, 3));
      b += path('M-22 -28 Q0 -20 22 -28', outlineAttrs(c, 3));
      if (o.hurt) {
        b += crack(c, 'M-26 -58 L-17 -48 L-25 -40 L-15 -30');
        b += scuff(c, 20, -40, 11, 6);
        b += scuff(c, -14, -14, 7, 4);
      }
      b += rect(-42, -120, 84, 124, 28, 'none', outlineAttrs(c));
    } else if (kind === 'pelvis') {
      b += rect(-36, -20, 72, 40, 16, c('subject/joint'), ' stroke="' + c('art/outline') + '" stroke-width="' + OUT + '"');
      b += path('M-30 -6 H30', ' stroke="' + c('subject/joint-highlight') + '" stroke-width="3" stroke-linecap="round"');
      b += rect(-9, -14, 18, 13, 3, c('subject/body'), ' stroke="' + c('art/outline') + '" stroke-width="3"');
    } else if (kind === 'upperArm') {
      b += capsule(c, -13, -12, 26, 82);
      b += ball(c, 0, 0, 15);
    } else if (kind === 'lowerArm') {
      b += capsule(c, -11, -6, 22, 66);
      if (o.hurt) b += scuff(c, -2, 30, 6, 4);
      b += ball(c, 0, 0, 11);
    } else if (kind === 'hand') {
      b += circle(0, 13, 15, c('subject/shade'));
      b += circle(-2.5, 12, 12.5, c('subject/body'));
      b += circle(-6, 7, 3, c('subject/highlight'));
      b += circle(0, 13, 15, 'none', outlineAttrs(c));
    } else if (kind === 'thigh') {
      b += capsule(c, -16, -10, 32, 96);
      if (o.hurt) b += scuff(c, 2, 48, 9, 5);
    } else if (kind === 'shin') {
      b += capsule(c, -14, -4, 28, 82);
      b += ball(c, 0, 0, 12);
    } else if (kind === 'foot') {
      b += rect(-16, -6, 50, 26, 11, c('subject/joint'), ' stroke="' + c('art/outline') + '" stroke-width="' + OUT + '"');
      b += path('M-10 13 H28', ' stroke="' + c('subject/joint-highlight') + '" stroke-width="3" stroke-linecap="round"');
    }
    return b;
  }

  function partTransform(id) {
    var w = world(id);
    return 'translate(' + f(w.x) + ' ' + f(w.y) + ') rotate(' + f(w.a) + ')' + (RIG[id].mirror ? ' scale(-1 1)' : '');
  }

  // One part, in assembled position, on the full ragdoll canvas.
  function ragdollPart(id, c, o) {
    return svg(RAG.w, RAG.h, '<g transform="' + partTransform(id) + '">' + partInner(RIG[id].kind, c, o) + '</g>');
  }

  function ragdoll(c, o) {
    var b = '';
    DRAW_ORDER.forEach(function (id) { b += '<g transform="' + partTransform(id) + '">' + partInner(RIG[id].kind, c, o) + '</g>'; });
    return svg(RAG.w, RAG.h, b);
  }

  // Part alone in a 180 x 220 cell, pivot marked. Used by the parts sheet.
  var CELL = { w: 180, h: 220 };
  var CELL_PIVOT = {
    head: [90, 196], torso: [90, 180], pelvis: [90, 110], upperArm: [90, 40], lowerArm: [90, 50],
    hand: [90, 80], thigh: [90, 40], shin: [90, 50], foot: [80, 100],
  };
  function partCell(kind, c) {
    var p = CELL_PIVOT[kind];
    var b = '<g transform="translate(' + p[0] + ' ' + p[1] + ')">' + partInner(kind, c, {}) + '</g>';
    b += pivotDot(c, p[0], p[1]);
    return svg(CELL.w, CELL.h, b);
  }
  function pivotDot(c, x, y) {
    return circle(x, y, 7, c('rig/pivot'), ' stroke="' + c('rig/pivot-ring') + '" stroke-width="3"');
  }

  function rigOverlay(c) {
    var J = {};
    Object.keys(RIG).forEach(function (id) { J[id] = world(id); });
    var neck = J.head, pel = J.pelvis;
    var bones = [
      [pel, J.torso], [J.torso, neck], [neck, { x: neck.x, y: neck.y - 62 }],
      [J.torso, J.upperArmL], [J.upperArmL, J.lowerArmL], [J.lowerArmL, J.handL],
      [J.torso, J.upperArmR], [J.upperArmR, J.lowerArmR], [J.lowerArmR, J.handR],
      [pel, J.thighL], [J.thighL, J.shinL], [J.shinL, J.footL],
      [pel, J.thighR], [J.thighR, J.shinR], [J.shinR, J.footR],
    ];
    var d = bones.map(function (s) { return 'M' + f(s[0].x) + ' ' + f(s[0].y) + ' L' + f(s[1].x) + ' ' + f(s[1].y); }).join(' ');
    var b = path(d, ' stroke="' + c('rig/bone') + '" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 6"');
    Object.keys(J).forEach(function (id) { b += pivotDot(c, J[id].x, J[id].y); });
    return svg(RAG.w, RAG.h, b);
  }

  // ---------------------------------------------------------------- Weapons (256 x 256 cell)
  var CELLW = 256;
  var SAW = { cx: 128, cy: 102, root: 72, tip: 88, teeth: 24 };

  function teethPath(cx, cy, root, tip, n, spin) {
    var step = 360 / n, d = '';
    for (var k = 0; k < n; k++) {
      var a = spin + k * step;
      var p0 = pt(cx, cy, root, a), p1 = pt(cx, cy, tip, a + step * 0.62), p2 = pt(cx, cy, root, a + step);
      d += (k === 0 ? 'M' + p0[0] + ' ' + p0[1] : '') + ' L' + p1[0] + ' ' + p1[1] + ' L' + p2[0] + ' ' + p2[1];
    }
    return d + ' Z';
  }

  function hazardBlock(c, x, y, w, h, prefix) {
    var b = rect(x, y, w, h, 8, c(prefix + '/hazard-a'));
    for (var sx = x + 14; sx + 22 < x + w - 6; sx += 30) {
      b += path('M' + (sx + 10) + ' ' + (y + 4) + ' L' + (sx + 22) + ' ' + (y + 4) + ' L' + (sx + 12) + ' ' + (y + h - 4) + ' L' + sx + ' ' + (y + h - 4) + ' Z', ' fill="' + c(prefix + '/hazard-b') + '"');
    }
    return b + rect(x, y, w, h, 8, 'none', outlineAttrs(c));
  }

  function sawMount(c) {
    var b = '';
    b += rect(114, 102, 28, 124, 9, c('weapon/paint-shade'));
    b += rect(114, 102, 20, 124, 8, c('weapon/paint'));
    b += rect(114, 102, 28, 124, 9, 'none', outlineAttrs(c));
    b += circle(128, 204, 4.5, c('weapon/metal'), ' stroke="' + c('art/outline') + '" stroke-width="2.5"');
    b += rect(70, 216, 116, 14, 6, c('weapon/frame'), ' stroke="' + c('art/outline') + '" stroke-width="' + OUT + '"');
    b += hazardBlock(c, 52, 226, 152, 26, 'weapon');
    return svg(CELLW, CELLW, b);
  }

  function sawBody(c, o) {
    o = o || {};
    var S = SAW, b = '';
    if (o.spin) {
      b += path(teethPath(S.cx, S.cy, S.root, S.tip, S.teeth, 6), ' fill="' + c('weapon/metal-shade') + '" fill-opacity="0.55"');
    }
    b += path(teethPath(S.cx, S.cy, S.root, S.tip, S.teeth, o.spin ? -3 : 0), ' fill="' + c('weapon/metal') + '"' + ' stroke="' + c('art/outline') + '" stroke-width="' + OUT + '" stroke-linejoin="round"');
    b += circle(S.cx, S.cy, 58, 'none', ' stroke="' + c('weapon/metal-shade') + '" stroke-width="6"');
    for (var k = 0; k < 8; k++) {
      var h = pt(S.cx, S.cy, 40, k * 45 + 22.5);
      b += circle(h[0], h[1], 5.5, c('weapon/metal-dark'));
    }
    b += path(arc(S.cx, S.cy, 65, 195, 245), stroke(c, 'weapon/motion', 6));
    b += path(arc(S.cx, S.cy, 65, 255, 265), stroke(c, 'weapon/motion', 6));
    b += circle(S.cx, S.cy, 26, c('weapon/paint'), ' stroke="' + c('art/outline') + '" stroke-width="' + OUT + '"');
    b += path(arc(S.cx, S.cy, 20, 200, 250), stroke(c, 'weapon/motion', 4, 0.8));
    b += circle(S.cx, S.cy, 11, c('weapon/metal-dark'), ' stroke="' + c('art/outline') + '" stroke-width="3"');
    for (var j = 0; j < 4; j++) {
      var q = pt(S.cx, S.cy, 19.5, 45 + j * 90);
      b += circle(q[0], q[1], 3.2, c('weapon/metal'));
    }
    return svg(CELLW, CELLW, b);
  }

  function sparks(c, x, y, a0, a1) {
    var b = '', n = 5;
    for (var k = 0; k < n; k++) {
      var a = a0 + (a1 - a0) * (k / (n - 1)), len = k % 2 ? 16 : 26;
      var p0 = pt(x, y, 8, a), p1 = pt(x, y, 8 + len, a);
      var d = 'M' + p0[0] + ' ' + p0[1] + ' L' + p1[0] + ' ' + p1[1];
      b += path(d, stroke(c, 'art/outline', 10));
      b += path(d, stroke(c, 'weapon/spark', 5));
    }
    return b;
  }

  function sawFx(c) {
    var S = SAW, b = '';
    b += path(arc(S.cx, S.cy, 96, -70, 0), stroke(c, 'weapon/motion', 6, 0.9));
    b += path(arc(S.cx, S.cy, 96, 110, 180), stroke(c, 'weapon/motion', 6, 0.9));
    b += path(arc(S.cx, S.cy, 102, -50, -20), stroke(c, 'weapon/motion', 4, 0.6));
    b += path(arc(S.cx, S.cy, 102, 130, 160), stroke(c, 'weapon/motion', 4, 0.6));
    var p = pt(S.cx, S.cy, 86, 38);
    b += sparks(c, p[0], p[1], 0, 80);
    return svg(CELLW, CELLW, b);
  }

  function templateFx(c) {
    var b = '';
    b += path('M18 78 H46 M10 112 H44 M18 146 H46', stroke(c, 'weapon/motion', 6, 0.9));
    b += sparks(c, 214, 52, -80, 0);
    return svg(CELLW, CELLW, b);
  }

  // ---------------------------------------------------------------- Weapon icons (80 x 80)
  function weaponIcon(name, c) {
    var b = '';
    if (name === 'circular-saw') {
      b += path(teethPath(40, 40, 26, 35, 16, 0), ' fill="' + c('weapon/metal') + '" stroke="' + c('art/outline') + '" stroke-width="3.5" stroke-linejoin="round"');
      b += circle(40, 40, 20, 'none', ' stroke="' + c('weapon/metal-shade') + '" stroke-width="4"');
      b += path(arc(40, 40, 24, 200, 250), stroke(c, 'weapon/motion', 4));
      b += circle(40, 40, 11, c('weapon/paint'), ' stroke="' + c('art/outline') + '" stroke-width="3.5"');
      b += circle(40, 40, 4, c('weapon/metal-dark'));
    } else if (name === 'spike-trap') {
      [[12, 22, 34], [28, 40, 52], [46, 56, 68]].forEach(function (s, i) {
        var top = i === 1 ? 10 : 20;
        b += path('M' + s[0] + ' 58 L' + s[1] + ' ' + top + ' L' + s[2] + ' 58 Z', ' fill="' + c('weapon/metal') + '" stroke="' + c('art/outline') + '" stroke-width="3.5" stroke-linejoin="round"');
        b += path('M' + (s[1] - 2) + ' ' + (top + 12) + ' L' + (s[1] - 6) + ' 50', stroke(c, 'weapon/motion', 3));
      });
      b += rect(6, 56, 68, 16, 5, c('weapon/frame'), ' stroke="' + c('art/outline') + '" stroke-width="3.5"');
    } else if (name === 'swing-hammer') {
      b += path('M40 8 V34', stroke(c, 'weapon/frame', 5));
      b += circle(40, 8, 5, c('weapon/metal-dark'), ' stroke="' + c('art/outline') + '" stroke-width="3"');
      b += rect(16, 32, 48, 34, 8, c('weapon/paint-shade'));
      b += rect(16, 32, 40, 34, 8, c('weapon/paint'));
      b += rect(16, 32, 48, 34, 8, 'none', outlineAttrs(c, 3.5));
      b += rect(8, 36, 10, 26, 4, c('weapon/metal'), ' stroke="' + c('art/outline') + '" stroke-width="3.5"');
      b += rect(62, 36, 10, 26, 4, c('weapon/metal'), ' stroke="' + c('art/outline') + '" stroke-width="3.5"');
    } else if (name === 'boxing-piston') {
      b += rect(4, 26, 14, 28, 4, c('weapon/frame'), ' stroke="' + c('art/outline') + '" stroke-width="3.5"');
      b += rect(16, 35, 16, 10, 3, c('weapon/metal'), ' stroke="' + c('art/outline') + '" stroke-width="3"');
      b += rect(30, 28, 10, 24, 4, c('weapon/motion'), ' stroke="' + c('art/outline') + '" stroke-width="3.5"');
      b += '<ellipse cx="56" cy="41" rx="20" ry="19" fill="' + c('weapon/paint') + '" stroke="' + c('art/outline') + '" stroke-width="3.5"/>';
      b += '<ellipse cx="50" cy="25" rx="9" ry="7" fill="' + c('weapon/paint') + '" stroke="' + c('art/outline') + '" stroke-width="3.5"/>';
      b += path(arc(56, 41, 13, 200, 250), stroke(c, 'weapon/motion', 3.5));
    } else if (name === 'bomb') {
      b += path('M50 20 Q58 6 68 10', stroke(c, 'weapon/frame', 4));
      b += path('M66 4 L70 8 L76 6 L72 11 L76 16 L70 14 L66 18 L66 12 L60 10 L66 8 Z', ' fill="' + c('weapon/spark') + '" stroke="' + c('art/outline') + '" stroke-width="2.5" stroke-linejoin="round"');
      b += '<g transform="rotate(40 50 22)">' + rect(43, 15, 14, 12, 3, c('weapon/frame'), ' stroke="' + c('art/outline') + '" stroke-width="3.5"') + '</g>';
      b += circle(36, 48, 26, c('weapon/hazard-b'), ' stroke="' + c('art/outline') + '" stroke-width="3.5"');
      b += path(arc(36, 48, 18, 200, 250), stroke(c, 'weapon/motion', 4, 0.9));
    } else {
      b += rect(8, 8, 64, 64, 14, 'none', ' stroke="' + c('ui/text-muted') + '" stroke-width="3.5" stroke-dasharray="8 6"');
      b += path('M30 31 Q30 20 40 20 Q50 20 50 30 Q50 37 41 41 V47', stroke(c, 'ui/text-muted', 6));
      b += circle(41, 57, 4, c('ui/text-muted'));
    }
    return svg(80, 80, b);
  }

  // ---------------------------------------------------------------- UI icons (32 x 32)
  function icon(name, c) {
    var I = 'ui/icon', b = '';
    var s = function (d, w) { return path(d, stroke(c, I, w || 3.5)); };
    var fl = ' fill="' + c(I) + '"';
    if (name === 'lock') {
      b += s('M11 15 V11 A5 5 0 0 1 21 11 V15');
      b += rect(7, 14, 18, 14, 4, c(I));
    } else if (name === 'coin') {
      b += circle(16, 16, 12, c('ui/coin'), ' stroke="' + c('art/outline') + '" stroke-width="3"');
      b += circle(16, 16, 7.5, 'none', ' stroke="' + c('ui/coin-shade') + '" stroke-width="2.5"');
      b += path('M16 12 V20', stroke(c, 'ui/coin-shade', 2.5));
    } else if (name === 'timer') {
      b += circle(16, 18, 10.5, 'none', stroke(c, I, 3.5));
      b += rect(13, 3, 6, 4, 2, c(I));
      b += s('M16 18 V12.5 M16 18 L19.5 20');
    } else if (name === 'rotate') {
      b += path(arc(16, 16, 9, -60, 210), stroke(c, I, 3.5));
      b += path('M20 3 L24.5 8.8 L17 9.6 Z', fl + ' stroke="' + c(I) + '" stroke-width="2" stroke-linejoin="round"');
    } else if (name === 'flip') {
      b += path('M13 8 L4 24 H13 Z', fl + ' stroke="' + c(I) + '" stroke-width="2.5" stroke-linejoin="round"');
      b += path('M19 8 L28 24 H19 Z', ' fill="none" stroke="' + c(I) + '" stroke-width="2.5" stroke-linejoin="round"');
      b += path('M16 4 V28', stroke(c, I, 2));
    } else if (name === 'check') {
      b += s('M7 17 L13 23 L25 9', 4.5);
    } else if (name === 'close') {
      b += s('M9 9 L23 23 M23 9 L9 23', 4.5);
    } else if (name === 'trash') {
      b += s('M6 9 H26 M13 9 V6 H19 V9');
      b += path('M8.5 12 H23.5 L22 27 H10 Z', fl + ' stroke="' + c(I) + '" stroke-width="2" stroke-linejoin="round"');
    } else if (name === 'play') {
      b += path('M11 7 L25 16 L11 25 Z', fl + ' stroke="' + c(I) + '" stroke-width="3" stroke-linejoin="round"');
    } else if (name === 'bolt') {
      b += path('M18 3 L7 18 H15 L13 29 L25 13 H17 Z', fl + ' stroke="' + c(I) + '" stroke-width="2" stroke-linejoin="round"');
    } else if (name === 'arrow-up') {
      b += s('M16 26 V7 M8.5 14.5 L16 7 L23.5 14.5', 4.5);
    } else if (name === 'target') {
      b += circle(16, 16, 11, 'none', stroke(c, I, 3));
      b += circle(16, 16, 5.5, 'none', stroke(c, I, 3));
      b += circle(16, 16, 1.8, c(I));
    } else if (name === 'plus') {
      b += s('M16 7 V25 M7 16 H25', 4.5);
    }
    return svg(32, 32, b);
  }

  return {
    ROOM: ROOM, RAG: RAG, RIG: RIG, DRAW_ORDER: DRAW_ORDER, PART_NAMES: PART_NAMES, CELL: CELL, CELL_PIVOT: CELL_PIVOT,
    SAW: SAW, CELLW: CELLW,
    room: room, roomGrid: roomGrid,
    ragdoll: ragdoll, ragdollPart: ragdollPart, partCell: partCell, rigOverlay: rigOverlay,
    sawMount: sawMount, sawBody: sawBody, sawFx: sawFx, templateFx: templateFx,
    weaponIcon: weaponIcon, icon: icon,
    WEAPON_ICONS: ['circular-saw', 'spike-trap', 'swing-hammer', 'boxing-piston', 'bomb', 'placeholder'],
    ICONS: ['lock', 'coin', 'timer', 'rotate', 'flip', 'check', 'close', 'trash', 'play', 'bolt', 'arrow-up', 'target', 'plus'],
  };
})();

if (typeof module !== 'undefined') module.exports = RDL_ART;
