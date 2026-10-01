// Ragdoll Lab design system builder. Runs once inside Figma and creates:
// variables, text/effect styles, game-element components, UI components and two example screens.
// Re-running updates variables/styles in place and rebuilds the generated page content.

var MARK = 'rdl';
var PAGE_NAME = 'Ragdoll Lab — Design System';
var issues = [];
var notes = [];

var V = {};   // semantic color token -> Variable
var VID = {}; // variable id -> semantic color token
var PV = {};  // primitive -> Variable
var DV = {};  // dimension token -> Variable
var TS = {};  // text style name -> TextStyle
var ES = {};  // effect style name -> EffectStyle
var FONTS = {};
var ICON = {}, WICON = {};
var K = {};   // component property keys
var C = {};   // components and variant maps

// ------------------------------------------------------------------ color helpers

function hexRgb(hex) {
  var n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
function tokenHex(token) {
  var s = RDL_COLORS[token];
  if (!s) throw new Error('Unknown color token "' + token + '"');
  return RDL_PRIMITIVES[s[0]];
}
function rgbOf(token) { return hexRgb(tokenHex(token)); }

// SVG art is imported with a unique marker color per token, then every marker paint is
// rebound to its variable. This keeps art colors unambiguous even when tokens share a value.
var CARRIER = {}, CARRIER_LIST = [];
Object.keys(RDL_COLORS).forEach(function (t, i) {
  var rgb = [3, 1 + 3 * Math.floor(i / 80), 1 + 3 * (i % 80)];
  CARRIER[t] = '#' + rgb.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  CARRIER_LIST.push({ token: t, rgb: rgb });
});
function cc(t) {
  if (!CARRIER[t]) throw new Error('Unknown color token "' + t + '"');
  return CARRIER[t];
}
function ccFlash(t) { return t.indexOf('subject/') === 0 ? cc('subject/flash') : cc(t); }
function carrierToken(color) {
  var r = Math.round(color.r * 255), g = Math.round(color.g * 255), b = Math.round(color.b * 255);
  for (var i = 0; i < CARRIER_LIST.length; i++) {
    var k = CARRIER_LIST[i].rgb;
    if (Math.abs(k[0] - r) <= 1 && Math.abs(k[1] - g) <= 1 && Math.abs(k[2] - b) <= 1) return CARRIER_LIST[i].token;
  }
  return null;
}

function solid(token, opacity) {
  var v = V[token];
  if (!v) throw new Error('Unknown color token "' + token + '"');
  return figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: rgbOf(token), opacity: opacity == null ? 1 : opacity }, 'color', v);
}

function bindNum(node, field, token) {
  var v = DV[token];
  if (!v) throw new Error('Unknown dimension token "' + token + '"');
  node[field] = RDL_DIMENSIONS[token][0];
  node.setBoundVariable(field, v);
}
function radius(node, token) {
  ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach(function (f) { bindNum(node, f, token); });
}
function padAll(node, pad) {
  var p = typeof pad === 'string' ? [pad, pad, pad, pad] : pad;
  bindNum(node, 'paddingTop', p[0]);
  bindNum(node, 'paddingRight', p[1]);
  bindNum(node, 'paddingBottom', p[2]);
  bindNum(node, 'paddingLeft', p[3]);
}

// Applies frame options to any frame-like node (frame, component).
function layout(node, o) {
  o = o || {};
  if (o.name) node.name = o.name;
  node.fills = [];
  node.clipsContent = !!o.clip;
  if (o.dir) {
    node.layoutMode = o.dir;
    node.primaryAxisSizingMode = 'AUTO';
    node.counterAxisSizingMode = 'AUTO';
    node.primaryAxisAlignItems = o.justify || 'MIN';
    node.counterAxisAlignItems = o.align || 'MIN';
    if (o.gap) bindNum(node, 'itemSpacing', o.gap);
    if (o.pad) padAll(node, o.pad);
  }
  if (o.fill) node.fills = [solid(o.fill, o.fillOpacity)];
  if (o.stroke) {
    node.strokes = [solid(o.stroke)];
    bindNum(node, 'strokeWeight', o.strokeW || 'stroke/outline');
    node.strokeAlign = o.strokeAlign || 'INSIDE';
  }
  if (o.radius) radius(node, o.radius);
  if (o.w || o.h) {
    node.resize(Math.max(1, o.w || node.width), Math.max(1, o.h || node.height));
    if (o.dir) {
      var horiz = o.dir === 'HORIZONTAL';
      node.primaryAxisSizingMode = (horiz ? o.w : o.h) ? 'FIXED' : 'AUTO';
      node.counterAxisSizingMode = (horiz ? o.h : o.w) ? 'FIXED' : 'AUTO';
    }
  }
  return node;
}
function frame(o) { return layout(figma.createFrame(), o); }
function component(o) { return layout(figma.createComponent(), o); }

function fill(parent, child) {
  parent.appendChild(child);
  child.layoutSizingHorizontal = 'FILL';
  return child;
}
function absolute(parent, child, x, y) {
  parent.appendChild(child);
  child.layoutPositioning = 'ABSOLUTE';
  child.x = x;
  child.y = y;
  return child;
}

async function text(chars, style, color, o) {
  o = o || {};
  var s = TS[style];
  if (!s) throw new Error('Unknown text style "' + style + '"');
  var t = figma.createText();
  t.fontName = s.fontName;
  t.characters = String(chars);
  await t.setTextStyleIdAsync(s.id);
  if (color) t.fills = [solid(color)];
  t.name = o.name || String(chars).slice(0, 40);
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.width) {
    t.resize(o.width, t.height);
    t.textAutoResize = 'HEIGHT';
  }
  if (o.outline) {
    t.strokes = [solid(o.outline[0])];
    bindNum(t, 'strokeWeight', o.outline[1]);
    try { t.strokeAlign = 'OUTSIDE'; } catch (e) { /* older editors only support CENTER on text */ }
    try { t.strokeJoin = 'ROUND'; } catch (e) { /* not critical */ }
  }
  if (o.effect) await t.setEffectStyleIdAsync(ES[o.effect].id);
  return t;
}

async function effect(node, name) { await node.setEffectStyleIdAsync(ES[name].id); }

// Swap bound colors on a node tree. Maps are { fromToken: toToken } and may use '*' for "any".
function recolor(node, fillMap, strokeMap) {
  strokeMap = strokeMap || fillMap;
  var nodes = [node];
  if ('findAll' in node) nodes = nodes.concat(node.findAll(function () { return true; }));
  nodes.forEach(function (n) {
    if ('fills' in n && Array.isArray(n.fills)) n.fills = n.fills.map(function (p) { return swapPaint(p, fillMap); });
    if ('strokes' in n && Array.isArray(n.strokes)) n.strokes = n.strokes.map(function (p) { return swapPaint(p, strokeMap); });
  });
}
function swapPaint(p, map) {
  if (p.type !== 'SOLID') return p;
  var bv = p.boundVariables && p.boundVariables.color;
  var tok = bv ? VID[bv.id] : null;
  var to = (tok && map[tok]) || map['*'];
  return to ? solid(to, p.opacity) : p;
}
var SILHOUETTE_FILLS = { '*': 'ui/silhouette' };
var SILHOUETTE_STROKES = { '*': 'ui/text-muted' };

// ------------------------------------------------------------------ SVG import

function bindTree(root) {
  var nodes = [root].concat(root.findAll(function () { return true; }));
  nodes.forEach(function (n) {
    if ('fills' in n && Array.isArray(n.fills)) n.fills = n.fills.map(rebind);
    if ('strokes' in n && Array.isArray(n.strokes)) n.strokes = n.strokes.map(rebind);
  });
}
function rebind(p) {
  if (p.type !== 'SOLID') return p;
  var tok = carrierToken(p.color);
  if (!tok) return p;
  return solid(tok, p.opacity);
}
function svgNode(svgString, name) {
  var fr = figma.createNodeFromSvg(svgString);
  fr.name = name;
  fr.fills = [];
  fr.clipsContent = false;
  bindTree(fr);
  return fr;
}
// Imports SVG art into `parent` as one tightly-bounded group named `name`.
function svgGroup(svgString, parent, name) {
  var fr = svgNode(svgString, name);
  parent.appendChild(fr);
  fr.x = 0;
  fr.y = 0;
  var kids = fr.children.slice();
  if (!kids.length) return fr;
  var g = figma.group(kids, parent);
  g.name = name;
  fr.remove();
  return g;
}

// ------------------------------------------------------------------ components

function combine(comps, parent, name, desc, cols) {
  var set = figma.combineAsVariants(comps, parent);
  set.name = name;
  if (desc) set.description = desc;
  var g = 32, p = 32, n = set.children.length;
  cols = cols || n;
  var mw = 0, mh = 0;
  set.children.forEach(function (ch) { mw = Math.max(mw, ch.width); mh = Math.max(mh, ch.height); });
  set.children.forEach(function (ch, i) {
    ch.x = p + (i % cols) * (mw + g);
    ch.y = p + Math.floor(i / cols) * (mh + g);
  });
  var rows = Math.ceil(n / cols);
  set.resizeWithoutConstraints(p * 2 + cols * mw + (cols - 1) * g, p * 2 + rows * mh + (rows - 1) * g);
  set.fills = [solid('ui/surface')];
  radius(set, 'radius/lg');
  return set;
}
function byValue(set) {
  var m = {};
  set.children.forEach(function (ch) { m[ch.name.split('=').pop()] = ch; });
  return m;
}
function prefer(map) {
  return /** @type {InstanceSwapPreferredValue[]} */ (Object.keys(map).map(function (k) { return { type: 'COMPONENT', key: map[k].key }; }));
}
function linkText(owner, label, defaultValue, layerName) {
  var key = owner.addComponentProperty(label, 'TEXT', defaultValue);
  owner.findAll(function (n) { return n.type === 'TEXT' && n.name === layerName; })
    .forEach(function (n) { n.componentPropertyReferences = { characters: key }; });
  return key;
}
function linkSwap(owner, label, defaultComp, preferred, layerName) {
  var key = owner.addComponentProperty(label, 'INSTANCE_SWAP', defaultComp.id, { preferredValues: prefer(preferred) });
  owner.findAll(function (n) { return n.type === 'INSTANCE' && n.name === layerName; })
    .forEach(function (n) { n.componentPropertyReferences = { mainComponent: key }; });
  return key;
}
function linkBool(owner, label, defaultValue, layerName) {
  var key = owner.addComponentProperty(label, 'BOOLEAN', defaultValue);
  owner.findAll(function (n) { return n.name === layerName; })
    .forEach(function (n) { n.componentPropertyReferences = { visible: key }; });
  return key;
}
function findInst(node, name) {
  return /** @type {InstanceNode} */ (node.findOne(function (n) { return n.type === 'INSTANCE' && n.name === name; }));
}
function findText(node, name) {
  return /** @type {TextNode} */ (node.findOne(function (n) { return n.type === 'TEXT' && n.name === name; }));
}
function icon(name, scale, color) {
  var i = ICON[name].createInstance();
  i.name = 'icon';
  if (scale && scale !== 1) i.rescale(scale);
  if (color) recolor(i, { 'ui/icon': color });
  return i;
}
function titleCase(s) { return s.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }

// ------------------------------------------------------------------ foundations: fonts, variables, styles

async function resolveFonts() {
  var list = await figma.listAvailableFontsAsync();
  var map = {};
  list.forEach(function (f) {
    if (!map[f.fontName.family]) map[f.fontName.family] = {};
    map[f.fontName.family][f.fontName.style] = true;
  });
  function pick(fams, styles) {
    for (var i = 0; i < fams.length; i++) {
      var m = map[fams[i]];
      if (!m) continue;
      for (var j = 0; j < styles.length; j++) if (m[styles[j]]) return { family: fams[i], style: styles[j] };
    }
    return null;
  }
  var interBold = { family: 'Inter', style: 'Bold' };
  FONTS.heavy = pick(['Lilita One'], ['Regular']) || pick(['Inter'], ['Black', 'Extra Bold', 'Bold']) || interBold;
  FONTS.black = pick(['Nunito'], ['Black', 'ExtraBold', 'Extra Bold']) || pick(['Inter'], ['Black', 'Extra Bold', 'Bold']) || interBold;
  FONTS.extrabold = pick(['Nunito'], ['ExtraBold', 'Extra Bold', 'Bold']) || pick(['Inter'], ['Extra Bold', 'Bold']) || interBold;
  FONTS.semibold = pick(['Nunito'], ['SemiBold', 'Semi Bold', 'Bold']) || pick(['Inter'], ['Semi Bold', 'Medium', 'Regular']) || interBold;
  if (FONTS.heavy.family !== 'Lilita One') notes.push('Lilita One is not available here, so Display styles use ' + FONTS.heavy.family + ' ' + FONTS.heavy.style + '.');
  if (FONTS.semibold.family !== 'Nunito') notes.push('Nunito is not available here, so Label/Body styles use ' + FONTS.semibold.family + '.');
  var load = [{ family: 'Inter', style: 'Regular' }, FONTS.heavy, FONTS.black, FONTS.extrabold, FONTS.semibold];
  for (var i = 0; i < load.length; i++) await figma.loadFontAsync(load[i]);
}

function cssName(name) { return name.replace(/\//g, '-'); }
function colorScopes(token) {
  if (token === 'art/outline' || token === 'fx/outline' || token === 'ui/outline') return ['STROKE_COLOR', 'SHAPE_FILL'];
  if (token.indexOf('ui/text') === 0 || token === 'ui/icon' || token === 'ui/silhouette') return ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'];
  if (token.indexOf('ui/surface') === 0) return ['FRAME_FILL', 'SHAPE_FILL'];
  if (token.indexOf('fx/') === 0) return ['TEXT_FILL', 'SHAPE_FILL', 'FRAME_FILL', 'STROKE_COLOR'];
  return ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR'];
}

async function buildVariables() {
  var cols = await figma.variables.getLocalVariableCollectionsAsync();
  var vars = await figma.variables.getLocalVariablesAsync();
  function collection(name, modeName) {
    var c = cols.filter(function (x) { return x.name === name && x.getPluginData(MARK) === '1'; })[0];
    if (!c) {
      c = figma.variables.createVariableCollection(name);
      c.setPluginData(MARK, '1');
    }
    c.renameMode(c.modes[0].modeId, modeName);
    return c;
  }
  function upsert(c, name, type) {
    var v = vars.filter(function (x) { return x.name === name && x.variableCollectionId === c.id; })[0];
    return v || figma.variables.createVariable(name, c, type);
  }

  var prim = collection('Primitives', 'Value'), pm = prim.modes[0].modeId;
  Object.keys(RDL_PRIMITIVES).forEach(function (name) {
    var v = upsert(prim, name, 'COLOR'), rgb = hexRgb(RDL_PRIMITIVES[name]);
    v.setValueForMode(pm, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
    v.scopes = [];
    v.hiddenFromPublishing = true;
    v.setVariableCodeSyntax('WEB', 'var(--' + cssName(name) + ')');
    PV[name] = v;
  });

  var col = collection('Color', 'Default'), cm = col.modes[0].modeId;
  Object.keys(RDL_COLORS).forEach(function (name) {
    var spec = RDL_COLORS[name], v = upsert(col, name, 'COLOR');
    v.setValueForMode(cm, figma.variables.createVariableAlias(PV[spec[0]]));
    v.description = spec[1];
    v.scopes = /** @type {VariableScope[]} */ (colorScopes(name));
    v.setVariableCodeSyntax('WEB', 'var(--color-' + cssName(name) + ')');
    V[name] = v;
    VID[v.id] = name;
  });

  var dim = collection('Dimension', 'Value'), dm = dim.modes[0].modeId;
  Object.keys(RDL_DIMENSIONS).forEach(function (name) {
    var spec = RDL_DIMENSIONS[name], v = upsert(dim, name, 'FLOAT');
    v.setValueForMode(dm, spec[0]);
    v.scopes = /** @type {VariableScope[]} */ (spec[1]);
    v.setVariableCodeSyntax('WEB', 'var(--' + cssName(name) + ')');
    DV[name] = v;
  });
}

async function buildTextStyles() {
  var existing = await figma.getLocalTextStylesAsync();
  Object.keys(RDL_TEXT_STYLES).forEach(function (name) {
    var spec = RDL_TEXT_STYLES[name];
    var s = existing.filter(function (x) { return x.name === name && x.getPluginData(MARK) === '1'; })[0];
    if (!s) {
      s = figma.createTextStyle();
      s.name = name;
      s.setPluginData(MARK, '1');
    }
    s.fontName = FONTS[spec.weight];
    s.fontSize = spec.size;
    s.lineHeight = { unit: 'PERCENT', value: spec.line };
    s.letterSpacing = { unit: 'PERCENT', value: spec.track };
    s.textCase = spec.upper ? 'UPPER' : 'ORIGINAL';
    s.description = spec.family === 'display' ? 'Chunky display face for numbers, titles and buttons.' : 'Rounded UI face for labels and body copy.';
    TS[name] = s;
  });
}

/** @returns {DropShadowEffect} */
function drop(x, y, blur, token, alpha) {
  var c = rgbOf(token);
  return { type: 'DROP_SHADOW', color: { r: c.r, g: c.g, b: c.b, a: alpha }, offset: { x: x, y: y }, radius: blur, spread: 0, visible: true, blendMode: 'NORMAL' };
}
/** @returns {InnerShadowEffect} */
function innerShadow(x, y, blur, token, alpha) {
  var c = rgbOf(token);
  return { type: 'INNER_SHADOW', color: { r: c.r, g: c.g, b: c.b, a: alpha }, offset: { x: x, y: y }, radius: blur, spread: 0, visible: true, blendMode: 'NORMAL' };
}
function bound(e, token) { return figma.variables.setBoundVariableForEffect(e, 'color', V[token]); }

async function buildEffectStyles() {
  var defs = {
    'Shadow/Hard S': [bound(drop(0, 4, 0, 'ui/outline', 1), 'ui/outline')],
    'Shadow/Hard M': [bound(drop(0, 6, 0, 'ui/outline', 1), 'ui/outline')],
    'Shadow/Soft': [drop(0, 16, 32, 'ui/outline', 0.22)],
    'Glow/Selected': [bound(drop(0, 6, 0, 'ui/outline', 1), 'ui/outline'), drop(0, 0, 28, 'ui/accent', 0.85)],
    'Button/Raised': [innerShadow(0, -6, 0, 'ui/outline', 0.22), bound(drop(0, 6, 0, 'ui/outline', 1), 'ui/outline')],
    'Button/Pressed': [innerShadow(0, -2, 0, 'ui/outline', 0.22), bound(drop(0, 2, 0, 'ui/outline', 1), 'ui/outline')],
    'Text/Pop': [bound(drop(0, 5, 0, 'fx/outline', 1), 'fx/outline')],
  };
  var desc = {
    'Shadow/Hard S': 'Hard cartoon drop for small chips and buttons.',
    'Shadow/Hard M': 'Hard cartoon drop for cards and HUD panels.',
    'Shadow/Soft': 'Soft lift for floating hints.',
    'Glow/Selected': 'Selected weapon card.',
    'Button/Raised': 'Chunky raised button with bottom lip.',
    'Button/Pressed': 'Button while held down.',
    'Text/Pop': 'Hard drop under floating numbers and combo text.',
  };
  var existing = await figma.getLocalEffectStylesAsync();
  Object.keys(defs).forEach(function (name) {
    var s = existing.filter(function (x) { return x.name === name && x.getPluginData(MARK) === '1'; })[0];
    if (!s) {
      s = figma.createEffectStyle();
      s.name = name;
      s.setPluginData(MARK, '1');
    }
    s.effects = defs[name];
    s.description = desc[name];
    ES[name] = s;
  });
}

// ------------------------------------------------------------------ page + documentation scaffolding

async function preparePage() {
  var page = figma.root.children.filter(function (p) { return p.getPluginData(MARK) === 'page'; })[0];
  if (page) {
    await figma.setCurrentPageAsync(page);
    page.children.slice().forEach(function (n) { if (n.getPluginData(MARK)) n.remove(); });
    return { x: 0, y: 0 };
  }
  try {
    page = figma.createPage();
    page.name = PAGE_NAME;
    page.setPluginData(MARK, 'page');
    await figma.setCurrentPageAsync(page);
    return { x: 0, y: 0 };
  } catch (e) {
    var cur = figma.currentPage;
    cur.children.slice().forEach(function (n) { if (n.getPluginData(MARK)) n.remove(); });
    var maxX = 0;
    cur.children.forEach(function (n) { maxX = Math.max(maxX, n.x + n.width); });
    notes.push('Could not add a page (the Starter plan allows 3), so everything was built on "' + cur.name + '".');
    return { x: cur.children.length ? maxX + 400 : 0, y: 0 };
  }
}

async function newSection(name, kicker, title, desc) {
  var s = figma.createSection();
  s.name = name;
  s.setPluginData(MARK, '1');
  s.fills = [solid('ui/surface-alt')];
  var board = frame({ name: 'Board', dir: 'VERTICAL', gap: 'space/64', pad: 'space/64' });
  s.appendChild(board);
  board.x = 0;
  board.y = 0;
  var h = frame({ name: 'Header', dir: 'VERTICAL', gap: 'space/12' });
  board.appendChild(h);
  h.appendChild(await text(kicker, 'Label/M', 'ui/accent'));
  h.appendChild(await text(title, 'Display/XL', 'ui/text'));
  if (desc) h.appendChild(await text(desc, 'Body/M', 'ui/text-muted', { width: 980 }));
  return { section: s, board: board };
}

async function block(parent, title, note, dir, gapToken) {
  var b = frame({ name: title, dir: 'VERTICAL', gap: 'space/16' });
  parent.appendChild(b);
  b.appendChild(await text(title, 'Label/L', 'ui/text'));
  if (note) b.appendChild(await text(note, 'Body/S', 'ui/text-muted', { width: 820 }));
  var body = frame({ name: 'Content', dir: dir || 'HORIZONTAL', gap: gapToken || 'space/32' });
  b.appendChild(body);
  return body;
}

async function caption(node, label, note) {
  var w = frame({ name: label, dir: 'VERTICAL', gap: 'space/8' });
  w.appendChild(node);
  w.appendChild(await text(label, 'Label/S', 'ui/text-muted'));
  if (note) w.appendChild(await text(note, 'Body/S', 'ui/text-muted', { width: Math.max(160, Math.min(420, node.width)) }));
  return w;
}

async function keyValues(title, rows, width) {
  var card = frame({ name: title, dir: 'VERTICAL', gap: 'space/10', pad: 'space/24', fill: 'ui/surface', stroke: 'ui/track', strokeW: 'stroke/thin', radius: 'radius/md', w: width || 560 });
  fill(card, await text(title, 'Label/M', 'ui/accent'));
  for (var i = 0; i < rows.length; i++) {
    var r = frame({ name: rows[i][0], dir: 'HORIZONTAL', gap: 'space/16' });
    fill(card, r);
    var k = await text(rows[i][0], 'Label/S', 'ui/text-muted', { width: 120 });
    r.appendChild(k);
    var v = await text(rows[i][1], 'Body/S', 'ui/text');
    fill(r, v);
    v.textAutoResize = 'HEIGHT';
  }
  return card;
}

// ------------------------------------------------------------------ Foundations

async function buildFoundations(sec) {
  // Primitive ramps
  var prims = await block(sec.board, 'Color · Primitives', 'Raw palette. Hidden from pickers — always use a semantic token from the Color collection.', 'HORIZONTAL', 'space/32');
  var groups = {};
  Object.keys(RDL_PRIMITIVES).forEach(function (n) {
    var g = n.split('/')[0];
    (groups[g] = groups[g] || []).push(n);
  });
  prims.layoutWrap = 'WRAP';
  prims.resize(1900, prims.height);
  prims.primaryAxisSizingMode = 'FIXED';
  bindNum(prims, 'counterAxisSpacing', 'space/32');
  for (var g in groups) {
    var col = frame({ name: g, dir: 'VERTICAL', gap: 'space/8' });
    prims.appendChild(col);
    col.appendChild(await text(g, 'Label/M', 'ui/text'));
    var row = frame({ name: 'ramp', dir: 'HORIZONTAL', gap: 'space/8' });
    col.appendChild(row);
    for (var i = 0; i < groups[g].length; i++) {
      var name = groups[g][i];
      var sw = frame({ name: name, dir: 'VERTICAL', gap: 'space/4' });
      row.appendChild(sw);
      var chip = figma.createRectangle();
      chip.resize(104, 72);
      radius(chip, 'radius/sm');
      chip.fills = [{ type: 'SOLID', color: hexRgb(RDL_PRIMITIVES[name]) }];
      try { chip.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: hexRgb(RDL_PRIMITIVES[name]) }, 'color', PV[name])]; } catch (e) { /* raw fill is fine */ }
      chip.strokes = [solid('ui/track')];
      chip.strokeWeight = 2;
      sw.appendChild(chip);
      sw.appendChild(await text(name, 'Body/S', 'ui/text'));
      sw.appendChild(await text(RDL_PRIMITIVES[name], 'Body/S', 'ui/text-muted'));
    }
  }

  // Semantic tokens
  var sem = await block(sec.board, 'Color · Semantic tokens', 'Every fill and stroke in the system is bound to one of these. Name pattern: <domain>/<role>. Domains: art, room, subject, rig, weapon, ui, fx.', 'VERTICAL', 'space/32');
  var cats = {};
  Object.keys(RDL_COLORS).forEach(function (n) {
    var c = n.split('/')[0];
    (cats[c] = cats[c] || []).push(n);
  });
  for (var cat in cats) {
    var grp = frame({ name: cat, dir: 'VERTICAL', gap: 'space/12' });
    sem.appendChild(grp);
    grp.appendChild(await text(cat, 'Label/M', 'ui/text'));
    var wrap = frame({ name: 'tokens', dir: 'HORIZONTAL', gap: 'space/12', w: 1900 });
    grp.appendChild(wrap);
    wrap.layoutWrap = 'WRAP';
    bindNum(wrap, 'counterAxisSpacing', 'space/12');
    for (var j = 0; j < cats[cat].length; j++) {
      var tok = cats[cat][j];
      var tchip = frame({ name: tok, dir: 'HORIZONTAL', gap: 'space/10', align: 'CENTER', pad: 'space/8', fill: 'ui/surface', stroke: 'ui/track', strokeW: 'stroke/thin', radius: 'radius/sm', w: 300 });
      wrap.appendChild(tchip);
      var s = figma.createRectangle();
      s.resize(40, 40);
      radius(s, 'radius/xs');
      s.fills = [solid(tok)];
      s.strokes = [solid('ui/track')];
      s.strokeWeight = 2;
      tchip.appendChild(s);
      var tc = frame({ name: 'text', dir: 'VERTICAL', gap: 'space/2' });
      fill(tchip, tc);
      fill(tc, await text(tok, 'Body/S', 'ui/text'));
      fill(tc, await text('→ ' + RDL_COLORS[tok][0] + ' · ' + RDL_COLORS[tok][1], 'Body/S', 'ui/text-muted'));
      tc.children.forEach(function (n) { if (n.type === 'TEXT') n.textAutoResize = 'HEIGHT'; });
    }
  }

  // Typography
  var samples = {
    'Display/Hero': 'x12 BRUTAL!', 'Display/XL': '-240', 'Display/L': '12 480', 'Display/M': 'START',
    'Display/S': 'Circular Saw 1 250', 'Label/L': 'Drag a weapon into the room', 'Label/M': 'Damage · Weapons',
    'Label/S': 'Goal 20 000', 'Body/M': 'Upgrade weapons with coins to break the damage threshold faster.',
    'Body/S': 'Hitbox is editor-only and never rendered in game.',
  };
  var type = await block(sec.board, 'Typography', 'Display = ' + FONTS.heavy.family + ' (numbers, titles, buttons). Label/Body = ' + FONTS.semibold.family + ' (UI copy). Labels are always uppercase.', 'VERTICAL', 'space/20');
  for (var ts in RDL_TEXT_STYLES) {
    var sp = RDL_TEXT_STYLES[ts];
    var tr = frame({ name: ts, dir: 'HORIZONTAL', gap: 'space/32', align: 'CENTER' });
    type.appendChild(tr);
    tr.appendChild(await text(ts, 'Label/S', 'ui/text-muted', { width: 140 }));
    tr.appendChild(await text(samples[ts], ts, 'ui/text'));
    var f = FONTS[sp.weight];
    tr.appendChild(await text(f.family + ' ' + f.style + ' · ' + sp.size + ' / ' + sp.line + '% · ' + sp.track + '%' + (sp.upper ? ' · UPPER' : ''), 'Body/S', 'ui/text-muted'));
  }

  // Spacing, radius, stroke
  var dims = await block(sec.board, 'Spacing · Radius · Stroke', 'Dimension collection. Padding and gaps bind to space/*, corners to radius/*, outlines to stroke/*.', 'HORIZONTAL', 'space/64');
  var spc = frame({ name: 'space', dir: 'HORIZONTAL', gap: 'space/16', align: 'MAX' });
  dims.appendChild(spc);
  var rad = frame({ name: 'radius', dir: 'HORIZONTAL', gap: 'space/16', align: 'MAX' });
  dims.appendChild(rad);
  var stk = frame({ name: 'stroke', dir: 'HORIZONTAL', gap: 'space/16', align: 'MAX' });
  dims.appendChild(stk);
  for (var d in RDL_DIMENSIONS) {
    var val = RDL_DIMENSIONS[d][0];
    var box = figma.createRectangle();
    if (d.indexOf('space/') === 0) {
      box.resize(Math.max(2, val), 48);
      box.fills = [solid('ui/accent')];
      spc.appendChild(await caption(box, d, String(val)));
    } else if (d.indexOf('radius/') === 0) {
      box.resize(80, 80);
      box.fills = [solid('ui/surface')];
      box.strokes = [solid('ui/outline')];
      box.strokeWeight = 2;
      radius(box, d);
      rad.appendChild(await caption(box, d, String(val)));
    } else {
      box.resize(96, 56);
      box.fills = [solid('ui/surface')];
      box.strokes = [solid('ui/outline')];
      bindNum(box, 'strokeWeight', d);
      radius(box, 'radius/sm');
      stk.appendChild(await caption(box, d, val + 'px'));
    }
  }

  // Effects
  var fx = await block(sec.board, 'Effects', 'Hard, un-blurred shadows are the default — they keep the flat 2D vector look. Soft shadow only for floating hints.', 'HORIZONTAL', 'space/32');
  for (var e in ES) {
    var card = frame({ name: e, fill: 'ui/surface', stroke: 'ui/outline', radius: 'radius/md', w: 180, h: 100 });
    await effect(card, e);
    var wrapE = await caption(card, e, ES[e].description);
    fx.appendChild(wrapE);
    bindNum(wrapE, 'paddingBottom', 'space/8');
  }

  // Art rules
  var rules = await block(sec.board, 'Vector art rules', null, 'HORIZONTAL', 'space/24');
  rules.appendChild(await keyValues('In-world sprites', [
    ['Outline', '4px art/outline, round joins and caps, drawn on top of fills.'],
    ['Shading', 'Flat 2-tone: base color + shade band on the right/bottom; one small highlight top-left. No gradients.'],
    ['Light', 'Always from top-left.'],
    ['Palette', 'Only room/*, subject/*, weapon/* and fx/* tokens. Never raw hex.'],
    ['Scale', '1 unit = 1px at 1920×1080. Grid cell = 64px; weapon cell = 256px.'],
  ]));
  rules.appendChild(await keyValues('UI', [
    ['Outline', '4px ui/outline on every interactive surface (2px on chips and pips).'],
    ['Depth', 'Shadow/Hard M on panels, Button/Raised on buttons, Glow/Selected for the active card.'],
    ['Corners', 'radius/md for cards, radius/lg for panels, radius/pill for buttons and counters.'],
    ['Type', 'Numbers and buttons in Display, everything else in Label (uppercase) or Body.'],
    ['Feedback', 'Green = allowed / go, red = blocked / danger, gold = coins and goal, blue = selection.'],
  ]));
}

// ------------------------------------------------------------------ Icons

async function buildIcons(sec) {
  var row = await block(sec.board, 'Icons', '32×32, single color through ui/icon (coin is multi-color). Use as instances; recolor by overriding the bound variable.', 'HORIZONTAL', 'space/24');
  for (var i = 0; i < RDL_ART.ICONS.length; i++) {
    var n = RDL_ART.ICONS[i];
    var c = figma.createComponentFromNode(svgNode(RDL_ART.icon(n, cc), 'Icon / ' + titleCase(n)));
    c.name = 'Icon / ' + titleCase(n);
    c.description = '32×32 UI icon.';
    ICON[n] = c;
    row.appendChild(await caption(c, n));
  }
}

async function buildWeaponIcons(parent) {
  for (var i = 0; i < RDL_ART.WEAPON_ICONS.length; i++) {
    var n = RDL_ART.WEAPON_ICONS[i];
    var c = figma.createComponentFromNode(svgNode(RDL_ART.weaponIcon(n, cc), 'Icon / Weapon / ' + titleCase(n)));
    c.name = 'Icon / Weapon / ' + titleCase(n);
    c.description = '80×80 weapon icon for the selection panel. Every weapon needs one.';
    WICON[n] = c;
    parent.appendChild(await caption(c, n));
  }
}

// ------------------------------------------------------------------ Game elements

async function buildRoom(sec) {
  var b = await block(sec.board, 'Test Room', 'Rectangular chamber, 1920×1080. Ceiling 0–88, side walls 88px, floor top at y=840. Playfield (where weapons can be mounted) is x 88–1832, y 88–840 with a 64px snap grid. Toggle Show Grid for the placement phase.', 'HORIZONTAL', 'space/48');
  var c = figma.createComponent();
  c.name = 'Test Room';
  c.resize(1920, 1080);
  c.fills = [];
  c.clipsContent = true;
  svgGroup(RDL_ART.room(cc), c, 'room');
  svgGroup(RDL_ART.roomGrid(cc), c, 'placement-grid');
  K.roomGrid = linkBool(c, 'Show Grid', false, 'placement-grid');
  c.description = 'Test chamber background. Layers: room (static art) and placement-grid (Show Grid). Floor top y=840 is the physics ground line; side walls and ceiling are colliders.';
  b.appendChild(c);
  C.room = c;
  b.appendChild(await keyValues('Room zones', [
    ['Ceiling', 'y 0–88 · collider · lamps can host ceiling mounts'],
    ['Side walls', 'x 0–88 and 1832–1920 · colliders · wall mounts on the inner edge'],
    ['Back wall', 'Decorative panels, hazard sign, observation window. Not a collider.'],
    ['Floor', 'Top at y=840 (ground line). Hazard band 864–896 is decoration.'],
    ['Snap grid', '64px cells inside the playfield, shown only while placing weapons.'],
    ['Safe HUD area', 'Top 120px and bottom 240px are reserved for HUD and the weapon panel.'],
  ], 520));
}

async function buildRagdoll(sec) {
  var b = await block(sec.board, 'Test Subject · Ragdoll', 'Crash-test dummy built from 15 separate parts so each maps 1:1 to a physics body. Layer names are the part IDs. Hurt adds damage decals; Hit Flash is the 1–2 frame white flash on impact.', 'HORIZONTAL', 'space/48');
  var states = [['Default', {}, cc], ['Hurt', { hurt: true }, cc], ['Hit Flash', {}, ccFlash]];
  var comps = states.map(function (s) {
    var c = figma.createComponent();
    c.name = 'State=' + s[0];
    c.resize(RDL_ART.RAG.w, RDL_ART.RAG.h);
    c.fills = [];
    c.clipsContent = false;
    RDL_ART.DRAW_ORDER.forEach(function (id) { svgGroup(RDL_ART.ragdollPart(id, s[2], s[1]), c, RDL_ART.PART_NAMES[id]); });
    return c;
  });
  var set = combine(comps, b, 'Subject / Ragdoll', 'Ragdoll test subject, 300×470. Parts: head, torso, pelvis, upper-arm-L/R, lower-arm-L/R, hand-L/R, thigh-L/R, shin-L/R, foot-L/R. Export each part group as its own sprite; pivots are shown on the rig reference.');
  C.rag = byValue(set);

  var rig = frame({ name: 'Rig Reference', w: RDL_ART.RAG.w, h: RDL_ART.RAG.h });
  rig.appendChild(C.rag['Default'].createInstance());
  var ov = svgNode(RDL_ART.rigOverlay(cc), 'rig-overlay');
  rig.appendChild(ov);
  ov.x = 0;
  ov.y = 0;
  b.appendChild(await caption(rig, 'Rig reference', 'Blue dots are joint pivots (parent → child). Dashed lines are bones.'));

  var sheet = await block(sec.board, 'Ragdoll · Parts sheet', 'One sprite per part, pivot marked in blue. Left/right limbs share art; the left foot is mirrored.', 'HORIZONTAL', 'space/16');
  var kinds = Object.keys(RDL_ART.CELL_PIVOT);
  for (var i = 0; i < kinds.length; i++) {
    var cell = frame({ name: kinds[i], dir: 'VERTICAL', gap: 'space/8', pad: 'space/8', fill: 'ui/surface', stroke: 'ui/track', strokeW: 'stroke/thin', radius: 'radius/md' });
    sheet.appendChild(cell);
    cell.appendChild(svgNode(RDL_ART.partCell(kinds[i], cc), kinds[i] + '-sprite'));
    cell.appendChild(await text(kinds[i], 'Label/S', 'ui/text'));
  }
}

// ------------------------------------------------------------------ Weapons

async function weaponVariant(kind, state) {
  var c = figma.createComponent();
  c.name = 'State=' + state;
  c.resize(RDL_ART.CELLW, RDL_ART.CELLW);
  c.fills = [];
  c.clipsContent = false;
  var art = [];
  if (kind === 'template') {
    var mount = frame({ name: 'mount', dir: 'HORIZONTAL', justify: 'CENTER', align: 'CENTER', fill: 'weapon/frame', stroke: 'art/outline', radius: 'radius/sm', w: 152, h: 30 });
    c.appendChild(mount);
    mount.x = 52;
    mount.y = 222;
    mount.appendChild(await text('MOUNT', 'Label/S', 'ui/text-inverse'));
    var body = frame({ name: 'body', dir: 'VERTICAL', justify: 'CENTER', align: 'CENTER', gap: 'space/4', fill: 'ui/surface-sunken', stroke: 'weapon/frame', radius: 'radius/lg', w: 176, h: 184 });
    body.dashPattern = [12, 8];
    c.appendChild(body);
    body.x = 40;
    body.y = 20;
    var ph = WICON['placeholder'].createInstance();
    ph.name = 'art';
    body.appendChild(ph);
    body.appendChild(await text('BODY', 'Label/M', 'ui/text-muted'));
    art.push(mount, body);
    if (state === 'Active') art.push(svgGroup(RDL_ART.templateFx(cc), c, 'fx'));
  } else {
    art.push(svgGroup(RDL_ART.sawMount(cc), c, 'mount'));
    art.push(svgGroup(RDL_ART.sawBody(cc, { spin: state === 'Active' }), c, 'body'));
    if (state === 'Active') art.push(svgGroup(RDL_ART.sawFx(cc), c, 'fx'));
  }

  // guides: hitbox + pivot (editor only)
  var px = kind === 'template' ? 128 : RDL_ART.SAW.cx;
  var py = kind === 'template' ? 112 : RDL_ART.SAW.cy;
  var hit;
  if (kind === 'template') {
    hit = figma.createRectangle();
    hit.resize(192, 200);
    hit.x = 32;
    hit.y = 12;
    radius(hit, 'radius/lg');
  } else {
    var r = RDL_ART.SAW.tip + 4;
    hit = figma.createEllipse();
    hit.resize(r * 2, r * 2);
    hit.x = px - r;
    hit.y = py - r;
  }
  hit.name = 'hitbox';
  c.appendChild(hit);
  hit.fills = [solid('weapon/hitbox', 0.14)];
  hit.strokes = [solid('weapon/hitbox')];
  hit.strokeWeight = 3;
  hit.dashPattern = [10, 8];
  var lh = figma.createRectangle(), lv = figma.createRectangle(), dot = figma.createEllipse();
  [lh, lv, dot].forEach(function (n) { c.appendChild(n); n.fills = [solid('weapon/pivot')]; });
  lh.resize(40, 3); lh.x = px - 20; lh.y = py - 1.5;
  lv.resize(3, 40); lv.x = px - 1.5; lv.y = py - 20;
  dot.resize(16, 16); dot.x = px - 8; dot.y = py - 8;
  dot.strokes = [solid('rig/pivot-ring')];
  dot.strokeWeight = 3;
  var pivot = figma.group([lh, lv, dot], c);
  pivot.name = 'pivot';
  var guides = figma.group([hit, pivot], c);
  guides.name = 'guides';

  if (state.indexOf('Ghost') === 0) {
    art.forEach(function (n) { n.opacity = 0.55; });
    var ok = state === 'Ghost Valid', tok = ok ? 'fx/place-valid' : 'fx/place-invalid';
    var fp = frame({ name: 'placement', fill: tok, fillOpacity: 0.14, stroke: tok, radius: 'radius/lg', w: 256, h: 256 });
    fp.dashPattern = [14, 10];
    c.appendChild(fp);
    fp.x = 0;
    fp.y = 0;
    var badge = frame({ name: 'status', dir: 'HORIZONTAL', justify: 'CENTER', align: 'CENTER', fill: tok, stroke: 'ui/outline', radius: 'radius/pill', w: 44, h: 44 });
    c.appendChild(badge);
    badge.x = 204;
    badge.y = 8;
    badge.appendChild(icon(ok ? 'check' : 'close', 0.75, 'ui/text-inverse'));
  }
  return c;
}

var WEAPON_STATES = ['Idle', 'Active', 'Ghost Valid', 'Ghost Invalid'];

async function buildWeapons(sec) {
  var tb = await block(sec.board, 'Weapon · Universal template', 'Every weapon is a 256×256 component set with the same layers and the same four states. Duplicate this set to start a new weapon.', 'HORIZONTAL', 'space/48');
  var tcomps = [];
  for (var i = 0; i < WEAPON_STATES.length; i++) tcomps.push(await weaponVariant('template', WEAPON_STATES[i]));
  var tset = combine(tcomps, tb, 'Weapon / _Template', 'Universal weapon template. Layers (bottom→top): mount, body, fx (Active only), guides (hitbox + pivot, editor only), placement (Ghost states). States: Idle = placed, Active = experiment running, Ghost Valid/Invalid = while dragging.');
  K.tplGuides = linkBool(tset, 'Show Guides', true, 'guides');
  C.tpl = byValue(tset);

  var anatomy = frame({ name: 'Anatomy', dir: 'HORIZONTAL', gap: 'space/32', align: 'CENTER', pad: 'space/24', fill: 'ui/surface', stroke: 'ui/track', strokeW: 'stroke/thin', radius: 'radius/md' });
  tb.appendChild(anatomy);
  var ai = C.tpl['Idle'].createInstance();
  anatomy.appendChild(ai);
  ai.rescale(1.25);
  anatomy.appendChild(await keyValues('Layers', [
    ['mount', 'Static attachment. Bottom edge of the cell touches the surface; the whole weapon rotates to the surface normal (floor 0°, walls ±90°, ceiling 180°).'],
    ['body', 'Moving art. Spins or swings around the pivot. weapon/* colors + 4px art/outline.'],
    ['fx', 'Motion arcs and sparks. Visible in State=Active only.'],
    ['guides / hitbox', 'Damage collider shape. Exported as data, never rendered in game.'],
    ['guides / pivot', 'Motion origin: rotation center or swing anchor.'],
    ['placement', 'Ghost overlay while dragging: green = valid mount, red = blocked.'],
  ], 520));

  var sb = await block(sec.board, 'Weapon · Circular Saw (reference weapon)', 'Built on the template. Starter weapon: unlocked by default.', 'HORIZONTAL', 'space/48');
  var scomps = [];
  for (var j = 0; j < WEAPON_STATES.length; j++) scomps.push(await weaponVariant('saw', WEAPON_STATES[j]));
  var sset = combine(scomps, sb, 'Weapon / Circular Saw', 'Circular saw on a floor bracket. body spins around pivot (128,102) at 720°/s in Active. Hitbox: circle r=92.');
  K.sawGuides = linkBool(sset, 'Show Guides', false, 'guides');
  C.saw = byValue(sset);
  sb.appendChild(await keyValues('weapon.circular_saw', [
    ['Category', 'Blade · continuous contact damage'],
    ['Mount', 'Floor, wall or ceiling'],
    ['Damage', '12 per tick · 8 ticks/s while touching'],
    ['Unlock', 'Starter (free)'],
    ['Upgrades', 'Lv1 12 · Lv2 15 (120c) · Lv3 19 (240c) · Lv4 24 (480c) · Lv5 30 (960c)'],
    ['Combo', 'Each tick within 0.6s of the last adds +1 to the combo'],
    ['Motion', 'body: rotate 720°/s · fx: sparks at contact point'],
  ], 520));

  var ib = await block(sec.board, 'Weapon icons', '80×80 icons for the weapon panel. Locked weapons reuse the same icon as a silhouette (fills → ui/silhouette).', 'HORIZONTAL', 'space/24');
  await buildWeaponIcons(ib);

  var steps = await block(sec.board, 'How to add a weapon', null, 'VERTICAL', 'space/8');
  var lines = [
    '1. Duplicate the Weapon / _Template set and rename it Weapon / <Name>. Keep the 256×256 cell and the four states.',
    '2. Replace mount and body with your art (weapon/* tokens, 4px art/outline). Keep the layer names.',
    '3. Move guides/pivot to the motion origin and reshape guides/hitbox to the damaging part only.',
    '4. Active: add fx (motion arcs, sparks). Ghost states: art at 55% opacity + placement overlay.',
    '5. Create Icon / Weapon / <Name> at 80×80 and add a Weapon Card to the panel (Locked until bought).',
    '6. Fill a spec card: id, category, mount, damage, unlock cost, 5 upgrade levels, combo rule, motion.',
  ];
  for (var k = 0; k < lines.length; k++) steps.appendChild(await text(lines[k], 'Body/M', 'ui/text', { width: 1100 }));
}

// ------------------------------------------------------------------ UI components

async function buildButtons(sec) {
  var b = await block(sec.board, 'Buttons', 'Chunky pill buttons: 4px outline, Button/Raised. Press = Button/Pressed + darker fill.', 'HORIZONTAL', 'space/48');

  var start = { Default: ['ui/primary', 'ui/text-inverse', 'Button/Raised'], Pressed: ['ui/primary-shade', 'ui/text-inverse', 'Button/Pressed'], Disabled: ['ui/disabled', 'ui/text-muted', null] };
  var sc = [];
  for (var st in start) {
    var s = start[st];
    var c = component({ name: 'State=' + st, dir: 'HORIZONTAL', align: 'CENTER', gap: 'space/16', pad: ['space/20', 'space/48', 'space/20', 'space/32'], fill: s[0], stroke: 'ui/outline', radius: 'radius/pill' });
    c.appendChild(icon('play', 1.5, s[1]));
    c.appendChild(await text('START', 'Display/L', s[1], { name: 'label', outline: st === 'Disabled' ? null : ['fx/outline', 'stroke/outline'] }));
    if (s[2]) await effect(c, s[2]);
    sc.push(c);
  }
  var sset = combine(sc, b, 'Button / Start', 'Starts the experiment. Disabled until at least one weapon is placed.', 1);
  K.startLabel = linkText(sset, 'Label', 'START', 'label');
  C.start = byValue(sset);

  var styles = { Neutral: 'ui/surface', Confirm: 'ui/primary', Danger: 'ui/danger' };
  var ic = [];
  for (var sty in styles) {
    var c2 = component({ name: 'Style=' + sty, dir: 'HORIZONTAL', justify: 'CENTER', align: 'CENTER', fill: styles[sty], stroke: 'ui/outline', radius: 'radius/md', w: 64, h: 64 });
    c2.appendChild(icon('plus', 1, sty === 'Neutral' ? null : 'ui/text-inverse'));
    await effect(c2, 'Button/Raised');
    ic.push(c2);
  }
  var iset = combine(ic, b, 'Button / Icon', '64×64 action button. Swap the glyph with the Icon property; on Confirm/Danger keep the glyph on ui/text-inverse.', 1);
  K.iconBtnIcon = linkSwap(iset, 'Icon', ICON['plus'], ICON, 'icon');
  C.iconBtn = byValue(iset);

  var upg = {
    'Upgrade': { fill: 'ui/primary', fg: 'ui/text-inverse', glyph: 'arrow-up' },
    'Too Expensive': { fill: 'ui/disabled', fg: 'ui/text-muted', glyph: 'arrow-up', dim: true },
    'Unlock': { fill: 'ui/accent', fg: 'ui/text-inverse', glyph: 'lock' },
    'Max': { fill: 'ui/coin', fg: 'ui/text', glyph: null },
  };
  var uc = [];
  for (var u in upg) {
    var o = upg[u];
    var c3 = component({ name: 'State=' + u, dir: 'HORIZONTAL', align: 'CENTER', gap: 'space/4', pad: o.glyph ? ['space/6', 'space/16', 'space/6', 'space/10'] : ['space/6', 'space/24', 'space/6', 'space/24'], fill: o.fill, stroke: 'ui/outline', radius: 'radius/pill' });
    if (o.glyph) {
      c3.appendChild(icon(o.glyph, 0.75, o.fg));
      var coin = icon('coin', 0.75);
      coin.name = 'coin';
      if (o.dim) coin.opacity = 0.5;
      c3.appendChild(coin);
      c3.appendChild(await text('120', 'Label/L', o.fg, { name: 'cost' }));
    } else {
      c3.appendChild(await text('MAX', 'Label/L', o.fg, { name: 'label' }));
    }
    await effect(c3, 'Shadow/Hard S');
    uc.push(c3);
  }
  var uset = combine(uc, b, 'Button / Upgrade', 'Coin button on each weapon card. Upgrade = affordable, Too Expensive = not enough coins, Unlock = locked weapon, Max = level 5.', 1);
  K.upgCost = linkText(uset, 'Cost', '120', 'cost');
  C.upg = byValue(uset);
}

async function buildWeaponPanel(sec) {
  var b = await block(sec.board, 'Weapon selection', 'Cards show icon, name, level (5 pips) and the coin action. Locked cards show a silhouette, a lock badge and the unlock price.', 'HORIZONTAL', 'space/48');

  var pc = [];
  ['On', 'Off'].forEach(function (on) {
    pc.push(component({ name: 'Filled=' + on, fill: on === 'On' ? 'ui/coin' : 'ui/track', stroke: 'ui/outline', strokeW: 'stroke/thin', radius: 'radius/pill', w: 14, h: 14 }));
  });
  var pset = combine(pc, b, 'Level Pip', 'One upgrade level. Cards show 5.', 1);
  C.pip = byValue(pset);

  var cards = { Default: {}, Selected: { sel: true }, Locked: { locked: true } };
  var cc2 = [];
  for (var st in cards) {
    var o = cards[st];
    var c = component({ name: 'State=' + st, dir: 'VERTICAL', align: 'CENTER', gap: 'space/6', pad: 'space/10', fill: o.locked ? 'ui/surface-locked' : 'ui/surface', stroke: o.sel ? 'ui/accent' : 'ui/outline', strokeW: o.sel ? 'stroke/bold' : 'stroke/outline', radius: 'radius/md', w: 156 });
    var well = frame({ name: 'well', dir: 'HORIZONTAL', justify: 'CENTER', align: 'CENTER', fill: o.sel ? 'ui/accent-soft' : 'ui/surface-sunken', radius: 'radius/sm', h: 88 });
    fill(c, well);
    var wi = WICON['circular-saw'].createInstance();
    wi.name = 'icon';
    well.appendChild(wi);
    if (o.locked) {
      recolor(wi, SILHOUETTE_FILLS, SILHOUETTE_STROKES);
      var badge = frame({ name: 'lock-badge', dir: 'HORIZONTAL', justify: 'CENTER', align: 'CENTER', fill: 'ui/surface-inverse', stroke: 'ui/outline', strokeW: 'stroke/thin', radius: 'radius/pill', w: 34, h: 34 });
      badge.appendChild(icon('lock', 0.625, 'ui/text-inverse'));
      absolute(well, badge, 110, -8);
    }
    var nm = await text('CIRCULAR SAW', 'Label/M', o.locked ? 'ui/text-muted' : 'ui/text', { name: 'name', align: 'CENTER' });
    fill(c, nm);
    nm.textAutoResize = 'HEIGHT';
    var pips = frame({ name: 'level', dir: 'HORIZONTAL', gap: 'space/4' });
    c.appendChild(pips);
    for (var i = 0; i < 5; i++) {
      var p = C.pip[i < (o.locked ? 0 : 2) ? 'On' : 'Off'].createInstance();
      p.name = 'pip-' + (i + 1);
      pips.appendChild(p);
    }
    var btn = C.upg[o.locked ? 'Unlock' : 'Upgrade'].createInstance();
    btn.name = 'upgrade';
    c.appendChild(btn);
    await effect(c, o.sel ? 'Glow/Selected' : 'Shadow/Hard M');
    cc2.push(c);
  }
  var cset = combine(cc2, b, 'Weapon Card', 'Weapon selection card, 156px wide. Properties: Name, Icon. For locked cards re-apply the silhouette after swapping the icon (fills → ui/silhouette).');
  K.cardName = linkText(cset, 'Name', 'CIRCULAR SAW', 'name');
  K.cardIcon = linkSwap(cset, 'Icon', WICON['circular-saw'], WICON, 'icon');
  C.card = byValue(cset);

  var panel = component({ name: 'Weapon Panel', dir: 'HORIZONTAL', gap: 'space/12', pad: ['space/24', 'space/16', 'space/16', 'space/16'], fill: 'ui/surface-inverse', stroke: 'ui/outline', radius: 'radius/lg' });
  panel.description = 'Bottom tray in the placement phase. Drag a card into the room to place that weapon.';
  var list = [
    ['Selected', 'CIRCULAR SAW', 'circular-saw', null, 2],
    ['Default', 'SPIKE TRAP', 'spike-trap', null, 1],
    ['Locked', 'SWING HAMMER', 'swing-hammer', '500', 0],
    ['Locked', 'BOXING PISTON', 'boxing-piston', '1 200', 0],
    ['Locked', 'BOMB', 'bomb', '2 500', 0],
  ];
  for (var k = 0; k < list.length; k++) {
    var it = list[k];
    var inst = C.card[it[0]].createInstance();
    panel.appendChild(inst);
    var props = {};
    props[K.cardName] = it[1];
    props[K.cardIcon] = WICON[it[2]].id;
    inst.setProperties(props);
    if (it[0] === 'Locked') {
      recolor(findInst(inst, 'icon'), SILHOUETTE_FILLS, SILHOUETTE_STROKES);
      var bp = {};
      bp[K.upgCost] = it[3];
      findInst(inst, 'upgrade').setProperties(bp);
    } else {
      for (var q = 1; q <= 5; q++) findInst(inst, 'pip-' + q).setProperties({ Filled: q <= it[4] ? 'On' : 'Off' });
    }
  }
  var tab = frame({ name: 'tab', dir: 'HORIZONTAL', pad: ['space/4', 'space/16', 'space/4', 'space/16'], fill: 'ui/coin', stroke: 'ui/outline', radius: 'radius/pill' });
  tab.appendChild(await text('WEAPONS', 'Label/M', 'ui/text'));
  absolute(panel, tab, 24, -18);
  await effect(panel, 'Shadow/Hard M');
  b.appendChild(panel);
  C.panel = panel;
}

async function buildHud(sec) {
  var b = await block(sec.board, 'HUD', 'Damage meter (progress to the damage goal), experiment timer and coin balance. Top-left / top-center / top-right.', 'HORIZONTAL', 'space/48');

  var bars = [];
  ['Filling', 'Complete'].forEach(function (st) {
    var W = 480, H = 28, frac = st === 'Filling' ? 0.62 : 1;
    var c = component({ name: 'State=' + st, fill: 'ui/track', stroke: 'ui/outline', strokeAlign: 'OUTSIDE', radius: 'radius/pill', w: W, h: H, clip: true });
    var f = figma.createRectangle();
    f.name = 'fill';
    c.appendChild(f);
    f.resize(W * frac, H);
    f.fills = [solid(st === 'Filling' ? 'ui/progress' : 'ui/progress-complete')];
    radius(f, 'radius/pill');
    f.constraints = { horizontal: 'SCALE', vertical: 'STRETCH' };
    var sh = figma.createRectangle();
    sh.name = 'shine';
    c.appendChild(sh);
    sh.resize(W * frac - 24, 6);
    sh.x = 12;
    sh.y = 5;
    sh.fills = [solid('ui/surface', 0.45)];
    radius(sh, 'radius/pill');
    sh.constraints = { horizontal: 'SCALE', vertical: 'MIN' };
    [0.25, 0.5, 0.75].forEach(function (t) {
      var tick = figma.createRectangle();
      tick.name = 'tick';
      c.appendChild(tick);
      tick.resize(3, H);
      tick.x = W * t - 1.5;
      tick.fills = [solid('ui/outline', 0.18)];
      tick.constraints = { horizontal: 'SCALE', vertical: 'STRETCH' };
    });
    bars.push(c);
  });
  var bset = combine(bars, b, 'HUD / Progress Bar', 'Resize freely — fill, shine and ticks scale. Set the fill width to damage / goal.', 1);
  C.bar = byValue(bset);

  var meters = [];
  var mstates = ['Progress', 'Goal Reached'];
  for (var i = 0; i < mstates.length; i++) {
    var st = mstates[i], done = st === 'Goal Reached';
    var c = component({ name: 'State=' + st, dir: 'VERTICAL', gap: 'space/8', pad: ['space/12', 'space/20', 'space/16', 'space/20'], fill: 'ui/surface', stroke: 'ui/outline', radius: 'radius/lg', w: 520 });
    var head = frame({ name: 'header', dir: 'HORIZONTAL', justify: 'SPACE_BETWEEN', align: 'CENTER' });
    fill(c, head);
    var lab = frame({ name: 'title', dir: 'HORIZONTAL', gap: 'space/6', align: 'CENTER' });
    head.appendChild(lab);
    lab.appendChild(icon('bolt', 1, 'ui/progress'));
    lab.appendChild(await text('DAMAGE', 'Label/M', 'ui/text-muted'));
    head.appendChild(await text(done ? '20 640' : '12 480', 'Display/L', 'ui/text', { name: 'value' }));
    var bar = C.bar[done ? 'Complete' : 'Filling'].createInstance();
    bar.name = 'progress';
    fill(c, bar);
    var foot = frame({ name: 'footer', dir: 'HORIZONTAL', justify: 'SPACE_BETWEEN', align: 'CENTER' });
    fill(c, foot);
    if (done) {
      var pill = frame({ name: 'goal-badge', dir: 'HORIZONTAL', pad: ['space/2', 'space/10', 'space/2', 'space/10'], fill: 'ui/progress-complete', stroke: 'ui/outline', strokeW: 'stroke/thin', radius: 'radius/pill' });
      pill.appendChild(await text('GOAL REACHED!', 'Label/S', 'ui/text'));
      foot.appendChild(pill);
    } else {
      foot.appendChild(await text('62%', 'Label/S', 'ui/text-muted', { name: 'percent' }));
    }
    var g = frame({ name: 'goal', dir: 'HORIZONTAL', gap: 'space/4', align: 'CENTER' });
    foot.appendChild(g);
    g.appendChild(icon('target', 0.5, 'ui/text-muted'));
    g.appendChild(await text('GOAL 20 000', 'Label/S', 'ui/text-muted', { name: 'goal' }));
    await effect(c, 'Shadow/Hard M');
    meters.push(c);
  }
  var mset = combine(meters, b, 'HUD / Damage Meter', 'Total damage dealt this experiment vs. the damage threshold. Edit value; switch to Goal Reached when value ≥ goal.', 1);
  K.meterGoal = linkText(mset, 'Goal', 'GOAL 20 000', 'goal');
  C.meter = byValue(mset);

  var timers = [];
  var tstates = ['Running', 'Warning'];
  for (var j = 0; j < tstates.length; j++) {
    var warn = tstates[j] === 'Warning';
    var fg = warn ? 'ui/text-inverse' : 'ui/text', muted = warn ? 'ui/text-inverse' : 'ui/text-muted';
    var t = component({ name: 'State=' + tstates[j], dir: 'HORIZONTAL', align: 'CENTER', gap: 'space/12', pad: ['space/8', 'space/24', 'space/8', 'space/12'], fill: warn ? 'ui/danger' : 'ui/surface', stroke: 'ui/outline', radius: 'radius/pill' });
    t.appendChild(icon('timer', 1.5, fg));
    var col = frame({ name: 'text', dir: 'VERTICAL', gap: 'space/2' });
    t.appendChild(col);
    col.appendChild(await text('EXPERIMENT', 'Label/S', muted));
    col.appendChild(await text(warn ? '00:04' : '00:27', 'Display/L', fg, { name: 'time' }));
    await effect(t, 'Shadow/Hard M');
    timers.push(t);
  }
  var tset = combine(timers, b, 'HUD / Timer', 'Experiment duration countdown. Switch to Warning for the last 5 seconds.', 1);
  C.timer = byValue(tset);

  var coins = component({ name: 'HUD / Coin Balance', dir: 'HORIZONTAL', align: 'CENTER', gap: 'space/8', pad: ['space/6', 'space/20', 'space/6', 'space/6'], fill: 'ui/surface', stroke: 'ui/outline', radius: 'radius/pill' });
  coins.description = 'Wallet used to unlock and upgrade weapons.';
  coins.appendChild(icon('coin', 1.25));
  coins.appendChild(await text('1 250', 'Display/S', 'ui/text', { name: 'amount' }));
  await effect(coins, 'Shadow/Hard M');
  K.coinAmount = linkText(coins, 'Amount', '1 250', 'amount');
  b.appendChild(coins);
  C.coins = coins;
}

async function buildPlacement(sec) {
  var b = await block(sec.board, 'Weapon placement', 'Shown while dragging a weapon: mount points on walls/floor/ceiling, the ghost weapon (Weapon / * Ghost states), a floating toolbar and a hint banner.', 'HORIZONTAL', 'space/48');

  var mp = {
    Available: { fill: 'fx/place-valid', op: 0.18, stroke: 'fx/place-valid', dash: true, glyph: 'plus', color: 'fx/place-valid' },
    Hover: { fill: 'fx/place-valid', op: 0.45, stroke: 'fx/place-valid', dash: false, glyph: 'plus', color: 'ui/icon' },
    Occupied: { fill: 'ui/disabled', op: 0.55, stroke: 'ui/text-muted', dash: true, glyph: 'close', color: 'ui/text-muted' },
  };
  var mc = [];
  for (var st in mp) {
    var o = mp[st];
    var c = component({ name: 'State=' + st, dir: 'HORIZONTAL', justify: 'CENTER', align: 'CENTER', fill: o.fill, fillOpacity: o.op, stroke: o.stroke, radius: 'radius/pill', w: 48, h: 48 });
    if (o.dash) c.dashPattern = [8, 6];
    c.appendChild(icon(o.glyph, 0.75, o.color));
    if (st === 'Hover') await effect(c, 'Shadow/Hard S');
    mc.push(c);
  }
  var mset = combine(mc, b, 'Placement / Mount Point', 'Socket where a weapon can attach. Center it on the surface edge (floor top, wall inner edge, ceiling bottom).', 1);
  C.mount = byValue(mset);

  var tb = component({ name: 'Placement / Toolbar', dir: 'HORIZONTAL', gap: 'space/8', pad: 'space/8', fill: 'ui/surface-inverse', stroke: 'ui/outline', radius: 'radius/lg' });
  tb.description = 'Floats 16px above the weapon being placed: rotate, flip, remove, confirm.';
  var tools = [['Neutral', 'rotate'], ['Neutral', 'flip'], ['Danger', 'trash'], ['Confirm', 'check']];
  for (var i = 0; i < tools.length; i++) {
    var bi = C.iconBtn[tools[i][0]].createInstance();
    tb.appendChild(bi);
    var props = {};
    props[K.iconBtnIcon] = ICON[tools[i][1]].id;
    bi.setProperties(props);
    if (tools[i][0] !== 'Neutral') recolor(findInst(bi, 'icon'), { 'ui/icon': 'ui/text-inverse' });
  }
  await effect(tb, 'Shadow/Hard M');
  b.appendChild(tb);
  C.toolbar = tb;

  var hint = component({ name: 'Placement / Hint', dir: 'HORIZONTAL', align: 'CENTER', gap: 'space/12', pad: ['space/12', 'space/24', 'space/12', 'space/16'], fill: 'ui/surface-inverse', fillOpacity: 0.92, radius: 'radius/pill' });
  hint.description = 'Instruction banner, top-center during placement.';
  hint.appendChild(icon('target', 1, 'fx/place-valid'));
  hint.appendChild(await text('DRAG A WEAPON ONTO A GREEN MOUNT POINT', 'Label/L', 'ui/text-inverse', { name: 'hint' }));
  await effect(hint, 'Shadow/Soft');
  K.hint = linkText(hint, 'Hint', 'DRAG A WEAPON ONTO A GREEN MOUNT POINT', 'hint');
  b.appendChild(hint);
  C.hint = hint;
}

async function buildFloating(sec) {
  var b = await block(sec.board, 'Floating damage & combo', 'Spawn at the hit point, rise ~80px and fade over 0.7s. Size and color escalate with damage; criticals get a starburst. Combo counter sits near the action and pulses on every increment; the bar is the time left to keep the combo alive.', 'HORIZONTAL', 'space/48');

  var dmg = [];
  var n = component({ name: 'Type=Normal', dir: 'HORIZONTAL', pad: 'space/8' });
  n.appendChild(await text('-12', 'Display/L', 'fx/damage-normal', { name: 'value', outline: ['fx/outline', 'stroke/outline'], effect: 'Text/Pop' }));
  dmg.push(n);
  var h = component({ name: 'Type=Heavy', dir: 'HORIZONTAL', pad: 'space/8' });
  h.appendChild(await text('-48', 'Display/XL', 'fx/damage-heavy', { name: 'value', outline: ['fx/outline', 'stroke/bold'], effect: 'Text/Pop' }));
  dmg.push(h);
  var cr = component({ name: 'Type=Critical', w: 260, h: 190 });
  var star = figma.createStar();
  star.name = 'burst';
  cr.appendChild(star);
  star.pointCount = 12;
  star.innerRadius = 0.74;
  star.resize(220, 170);
  star.x = 20;
  star.y = 10;
  star.fills = [solid('fx/crit-burst')];
  star.strokes = [solid('fx/outline')];
  bindNum(star, 'strokeWeight', 'stroke/outline');
  star.strokeJoin = 'ROUND';
  var cv = await text('-240', 'Display/XL', 'fx/damage-crit', { name: 'value', outline: ['fx/outline', 'stroke/bold'], effect: 'Text/Pop' });
  cr.appendChild(cv);
  cv.x = (260 - cv.width) / 2;
  cv.y = (190 - cv.height) / 2 + 4;
  var tag = await text('CRIT!', 'Display/S', 'ui/text-inverse', { name: 'tag', outline: ['fx/outline', 'stroke/outline'] });
  cr.appendChild(tag);
  tag.rotation = 10;
  tag.x = 22;
  tag.y = 40;
  dmg.push(cr);
  var dset = combine(dmg, b, 'FX / Floating Damage', 'Normal < 30, Heavy 30–99, Critical ≥ 100 or a crit roll. Edit the value text.');
  C.dmg = byValue(dset);

  var tiers = { 1: ['x3', 'COMBO!', 'fx/combo-1', 0.35], 2: ['x7', 'GREAT COMBO!', 'fx/combo-2', 0.6], 3: ['x12', 'BRUTAL!', 'fx/combo-3', 0.85] };
  var cc3 = [];
  for (var k in tiers) {
    var t = tiers[k];
    var c = component({ name: 'Tier=' + k, dir: 'VERTICAL', align: 'CENTER', gap: 'space/4', pad: 'space/8' });
    c.appendChild(await text(t[0], 'Display/XL', t[2], { name: 'multiplier', outline: ['fx/outline', 'stroke/bold'], effect: 'Text/Pop' }));
    c.appendChild(await text(t[1], 'Display/S', 'ui/text-inverse', { name: 'title', outline: ['fx/outline', 'stroke/outline'], effect: 'Text/Pop' }));
    var bar = frame({ name: 'timeout', fill: 'ui/outline', fillOpacity: 0.35, radius: 'radius/pill', w: 160, h: 12, clip: true });
    var bf = figma.createRectangle();
    bf.name = 'fill';
    bar.appendChild(bf);
    bf.resize(160 * t[3], 12);
    bf.fills = [solid(t[2])];
    radius(bf, 'radius/pill');
    c.appendChild(bar);
    cc3.push(c);
  }
  var kset = combine(cc3, b, 'FX / Combo Counter', 'Tier 1 x2–x4, Tier 2 x5–x9, Tier 3 x10+. Edit multiplier and title.');
  C.combo = byValue(kset);
}

// ------------------------------------------------------------------ Screens + cover

function put(parent, node, x, y, scale) {
  parent.appendChild(node);
  if (scale && scale !== 1) node.rescale(scale);
  node.x = x;
  node.y = y;
  return node;
}
function shadow(parent, cx, y, w) {
  var e = figma.createEllipse();
  e.name = 'contact-shadow';
  parent.appendChild(e);
  e.resize(w, 18);
  e.x = cx - w / 2;
  e.y = y - 9;
  e.fills = [solid('room/shadow', 0.22)];
  return e;
}
function setText(inst, name, value) {
  var t = findText(inst, name);
  if (t) t.characters = value;
}

async function buildScreens(sec) {
  var row = await block(sec.board, 'Example screens', 'Composed only from instances. Left: placement phase. Right: experiment running.', 'HORIZONTAL', 'space/64');
  var floor = RDL_ART.ROOM.floorTop;

  // Placement phase
  var s1 = frame({ name: 'Screen / Placement Phase', w: 1920, h: 1080, clip: true });
  row.appendChild(s1);
  var room1 = put(s1, C.room.createInstance(), 0, 0);
  var gp = {};
  gp[K.roomGrid] = true;
  room1.setProperties(gp);
  [[360, floor], [620, floor], [1560, floor], [88, 420], [1832, 300], [720, 88]].forEach(function (p, i) {
    put(s1, C.mount[i === 5 ? 'Hover' : 'Available'].createInstance(), p[0] - 24, p[1] - 24);
  });
  shadow(s1, 960, floor, 170);
  put(s1, C.rag['Default'].createInstance(), 960 - 120, floor - 366, 0.8);
  put(s1, C.mount['Occupied'].createInstance(), 1308 - 24, floor - 24);
  var ghost = put(s1, C.saw['Ghost Valid'].createInstance(), 1180, floor - 252);
  var tb = put(s1, C.toolbar.createInstance(), 0, 0);
  tb.x = ghost.x + 128 - tb.width / 2;
  tb.y = ghost.y - tb.height - 16;
  var hint = put(s1, C.hint.createInstance(), 0, 128);
  hint.x = (1920 - hint.width) / 2;
  var m1 = put(s1, C.meter['Progress'].createInstance(), 32, 24);
  setText(m1, 'value', '0');
  setText(m1, 'percent', '0%');
  try {
    var f1 = findInst(m1, 'progress').findOne(function (n) { return n.name === 'fill'; });
    if (f1 && 'resize' in f1) f1.resize(28, f1.height);
  } catch (e) { /* size override not critical */ }
  var t1 = put(s1, C.timer['Running'].createInstance(), 0, 24);
  t1.x = (1920 - t1.width) / 2;
  setText(t1, 'time', '00:30');
  var co1 = put(s1, C.coins.createInstance(), 0, 32);
  co1.x = 1920 - co1.width - 32;
  var panel = put(s1, C.panel.createInstance(), 0, 0);
  panel.x = (1920 - panel.width) / 2;
  panel.y = 1080 - panel.height - 20;
  var sb = put(s1, C.start['Default'].createInstance(), 0, 0);
  sb.x = 1920 - sb.width - 40;
  sb.y = 1080 - sb.height - 44;

  // Experiment running
  var s2 = frame({ name: 'Screen / Experiment Running', w: 1920, h: 1080, clip: true });
  row.appendChild(s2);
  put(s2, C.room.createInstance(), 0, 0);
  put(s2, C.saw['Active'].createInstance(), 1180, floor - 252);
  shadow(s2, 1150, floor, 140);
  var rag = put(s2, C.rag['Hurt'].createInstance(), 1010, 300, 0.8);
  rag.rotation = 38;
  put(s2, C.dmg['Normal'].createInstance(), 1070, 470);
  put(s2, C.dmg['Heavy'].createInstance(), 1390, 420);
  put(s2, C.dmg['Critical'].createInstance(), 1420, 560);
  var combo = put(s2, C.combo['2'].createInstance(), 1500, 200);
  combo.rotation = -8;
  put(s2, C.meter['Progress'].createInstance(), 32, 24);
  var t2 = put(s2, C.timer['Running'].createInstance(), 0, 24);
  t2.x = (1920 - t2.width) / 2;
  setText(t2, 'time', '00:17');
  var co2 = put(s2, C.coins.createInstance(), 0, 32);
  co2.x = 1920 - co2.width - 32;
}

async function buildCover(sec) {
  var cv = frame({ name: 'Cover', w: 1800, h: 760, fill: 'ui/surface-inverse', radius: 'radius/lg', clip: true });
  sec.board.appendChild(cv);
  var intro = frame({ name: 'Intro', dir: 'VERTICAL', gap: 'space/16' });
  cv.appendChild(intro);
  intro.x = 96;
  intro.y = 96;
  intro.appendChild(await text('DESIGN SYSTEM · V1 · 2D VECTOR', 'Label/L', 'ui/coin'));
  intro.appendChild(await text('RAGDOLL LAB', 'Display/Hero', 'ui/text-inverse', { outline: ['fx/outline', 'stroke/bold'], effect: 'Text/Pop' }));
  intro.appendChild(await text('Tokens, game elements and HUD for a 2D vector ragdoll sandbox: a rectangular test room, a crash-test subject, a universal weapon template with the circular saw as the reference weapon, and the full placement + experiment UI.', 'Body/M', 'ui/text-inverse-muted', { width: 720 }));
  intro.appendChild(await text('Foundations · Game Elements · Weapons · UI Components · Screens', 'Label/M', 'ui/text-inverse-muted'));
  var dots = frame({ name: 'palette', dir: 'HORIZONTAL', gap: 'space/8' });
  intro.appendChild(dots);
  ['subject/body', 'weapon/paint', 'ui/primary', 'ui/accent', 'fx/combo-3', 'room/wall', 'room/ceiling'].forEach(function (t) {
    var d = frame({ name: t, fill: t, stroke: 'ui/outline', radius: 'radius/pill', w: 40, h: 40 });
    dots.appendChild(d);
  });
  put(cv, C.saw['Active'].createInstance(), 1140, 250, 1.7);
  var rag = put(cv, C.rag['Hurt'].createInstance(), 1010, 90, 1.05);
  rag.rotation = 24;
  put(cv, C.dmg['Critical'].createInstance(), 1460, 70);
  var combo = put(cv, C.combo['3'].createInstance(), 930, 470);
  combo.rotation = 8;
  if (issues.length || notes.length) {
    var log = frame({ name: 'Build log', dir: 'VERTICAL', gap: 'space/8', pad: 'space/24', fill: 'ui/surface', stroke: issues.length ? 'ui/danger' : 'ui/track', radius: 'radius/md', w: 1800 });
    sec.board.appendChild(log);
    log.appendChild(await text(issues.length ? 'BUILD LOG · ' + issues.length + ' ISSUE(S)' : 'BUILD LOG', 'Label/M', issues.length ? 'ui/danger' : 'ui/text-muted'));
    var all = notes.concat(issues);
    for (var i = 0; i < all.length; i++) log.appendChild(await text(all[i], 'Body/S', 'ui/text', { width: 1750 }));
  }
}

// ------------------------------------------------------------------ main

async function step(label, fn) {
  try {
    return await fn();
  } catch (e) {
    issues.push(label + ': ' + (e && e.message ? e.message : String(e)));
    return null;
  }
}

async function main() {
  figma.notify('Building Ragdoll Lab design system…', { timeout: 4000 });
  await resolveFonts();
  await buildVariables();
  await buildTextStyles();
  await buildEffectStyles();
  var origin = await preparePage();

  var cover = await newSection('00 Cover', 'RAGDOLL LAB', 'Overview', null);
  var found = await newSection('01 Foundations', 'FOUNDATIONS', 'Tokens & styles', 'Three variable collections (Primitives → Color, Dimension), 10 text styles and 7 effect styles. Everything below is bound to them.');
  var game = await newSection('02 Game Elements', 'GAME ELEMENTS', 'Room & test subject', 'The physical world: a rectangular test chamber and the ragdoll that gets hurt in it.');
  var weap = await newSection('03 Weapons', 'WEAPONS', 'Weapon system', 'One universal template, one reference weapon (circular saw), icons and the recipe for adding more.');
  var ui = await newSection('04 UI Components', 'UI COMPONENTS', 'Interface', 'Weapon selection with coins and locks, HUD, placement tools, floating damage and combos.');
  var scr = await newSection('05 Screens', 'SCREENS', 'Example screens', null);

  await step('Foundations', function () { return buildFoundations(found); });
  await step('Icons', function () { return buildIcons(ui); });
  await step('Buttons', function () { return buildButtons(ui); });
  await step('Weapons', function () { return buildWeapons(weap); });
  await step('Weapon selection', function () { return buildWeaponPanel(ui); });
  await step('HUD', function () { return buildHud(ui); });
  await step('Placement UI', function () { return buildPlacement(ui); });
  await step('Floating damage & combo', function () { return buildFloating(ui); });
  await step('Test room', function () { return buildRoom(game); });
  await step('Ragdoll', function () { return buildRagdoll(game); });
  await step('Screens', function () { return buildScreens(scr); });
  await step('Cover', function () { return buildCover(cover); });

  var y = origin.y;
  [cover, found, game, weap, ui, scr].forEach(function (s) {
    s.section.resizeWithoutConstraints(Math.max(400, s.board.width), Math.max(200, s.board.height));
    s.section.x = origin.x;
    s.section.y = y;
    y += s.section.height + 240;
  });
  figma.viewport.scrollAndZoomIntoView([cover.section]);
  return issues.length
    ? 'Ragdoll Lab built with ' + issues.length + ' issue(s) — see the Build log on the cover.'
    : 'Ragdoll Lab design system built.';
}

main().then(function (msg) {
  figma.closePlugin(msg);
}, function (e) {
  figma.closePlugin('Ragdoll Lab failed: ' + (e && e.message ? e.message : String(e)));
});
