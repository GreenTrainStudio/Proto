const { SLICE_CONFIG, GAMEPLAY_CONFIG, REVEAL_CONFIG, ANIMATION_CONFIG, PUZZLES = [] } = window.GAME_CONFIG;

const ROWS = SLICE_CONFIG.rows;
const COLS = SLICE_CONFIG.cols;
const TOTAL = ROWS * COLS;
const INITIAL_OPEN = GAMEPLAY_CONFIG.initialOpen;
const SNAP = GAMEPLAY_CONFIG.snap;
const MOVE_DURATION_MS = ANIMATION_CONFIG?.moveDurationMs ?? 300;
const ANIM_ENABLED = ANIMATION_CONFIG?.enabled !== false;
const PROGRESS_COOKIE = 'jigsawPuzzleProgress';
const PROGRESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const PROGRESS_STORAGE = 'jigsawPuzzleProgress.v2';
const ASSET_CACHE = 'jigsawFullAssets-v1';
const THUMB_CACHE = 'jigsawPreviewAssets-v1';

const board = document.getElementById('board');
const statusEl = document.getElementById('status');
const menuScreen = document.getElementById('menuScreen');
const gameScreen = document.getElementById('gameScreen');
const loadingScreen = document.getElementById('loadingScreen');
const loadingProgressFill = document.getElementById('loadingProgressFill');
const puzzleGrid = document.getElementById('puzzleGrid');
const menuStatus = document.getElementById('menuStatus');
document.getElementById('newGameBtn').addEventListener('click', () => restartCurrentPuzzle());
document.getElementById('backToMenuBtn').addEventListener('click', () => showMenu());
window.addEventListener('pagehide', () => saveCurrentPuzzleProgress());
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden') saveCurrentPuzzleProgress();
});

const state = {
  imgUrl: null,
  imgObjectUrl: null,
  thumbObjectUrls: [],
  selectedPuzzle: null,
  pieces: [],
  parent: [],
  drag: null,
  mergeSuppression: new Set(),
};

function idx(r, c) { return r * COLS + c; }
function rc(i) { return [Math.floor(i / COLS), i % COLS]; }
function find(a){ while(state.parent[a]!==a){ state.parent[a]=state.parent[state.parent[a]]; a=state.parent[a]; } return a; }
function union(a,b){ a=find(a); b=find(b); if(a!==b) state.parent[b]=a; }

function mergePairKey(a, b){
  const ai = typeof a === 'number' ? a : a.i;
  const bi = typeof b === 'number' ? b : b.i;
  return ai < bi ? `${ai}|${bi}` : `${bi}|${ai}`;
}

function neighbors(i){
  const [r,c]=rc(i); const n=[];
  if(r>0)n.push(idx(r-1,c)); if(r<ROWS-1)n.push(idx(r+1,c));
  if(c>0)n.push(idx(r,c-1)); if(c<COLS-1)n.push(idx(r,c+1));
  return n;
}

function cellSize(){
  return { w: board.clientWidth / COLS, h: board.clientHeight / ROWS };
}

function getSnapDistance(){
  if(typeof SNAP === 'number' && SNAP > 0) return SNAP;
  const { w, h } = cellSize();
  return Math.max(8, Math.round(Math.min(w, h) * 0.35));
}

function setAnimationEnabled(enabled){
  state.pieces.forEach(p=>p.el.classList.toggle('no-anim', !enabled));
}

function gridCellFromPos(x, y){
  const { w, h } = cellSize();
  const c = Math.max(0, Math.min(COLS - 1, Math.round(x / w)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.round(y / h)));
  return { r, c };
}

function gridKeyFromPos(x, y){
  const { r, c } = gridCellFromPos(x, y);
  return `${r}|${c}`;
}

function randomAdjacentPair(){
  const a = (Math.random() * TOTAL) | 0;
  const nbs = neighbors(a);
  return [a, nbs[(Math.random() * nbs.length) | 0]];
}

function correctAdjacencyDelta(a, b){
  const { w, h } = cellSize();
  return {
    x: (b.c - a.c) * w,
    y: (b.r - a.r) * h,
  };
}

function isCorrectlyPlacedNextTo(a, b, ax = a.x, ay = a.y, bx = b.x, by = b.y){
  if(!neighbors(a.i).includes(b.i)) return false;
  const target = correctAdjacencyDelta(a, b);
  const dx = (bx - ax) - target.x;
  const dy = (by - ay) - target.y;
  return Math.hypot(dx, dy) <= getSnapDistance();
}

function wouldAutoMergeAt(piece, x, y){
  return state.pieces.some(other => (
    other.i !== piece.i &&
    other.open &&
    find(other.i) !== find(piece.i) &&
    isCorrectlyPlacedNextTo(piece, other, x, y)
  ));
}

function normalizeImagePath(path = ''){
  return path.startsWith('images/') ? path : `images/${path}`;
}

function thumbnailPathForImage(path = ''){
  const normalized = normalizeImagePath(path);
  const file = normalized.split('/').pop() || '';
  const stem = file.replace(/\.[^.]+$/, '');
  return `images/thumbs/${stem}.webp`;
}

function normalizePuzzleEntry(entry){
  if(typeof entry === 'string') {
    const image = normalizeImagePath(entry);
    return { image, thumb: thumbnailPathForImage(image), title: titleFromImagePath(image) };
  }
  if(entry && typeof entry.image === 'string') {
    const image = normalizeImagePath(entry.image);
    const thumb = entry.thumb ? normalizeImagePath(entry.thumb) : thumbnailPathForImage(image);
    return { ...entry, image, thumb, title: entry.title || titleFromImagePath(image) };
  }
  return null;
}

function readProgressCookie(){
  const item = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${PROGRESS_COOKIE}=`));
  if(!item) return {};

  try {
    const value = decodeURIComponent(item.slice(PROGRESS_COOKIE.length + 1));
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeProgressCookie(progress){
  const value = encodeURIComponent(JSON.stringify(progress));
  document.cookie = `${PROGRESS_COOKIE}=${value}; max-age=${PROGRESS_COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

function readStoredProgress(){
  try {
    const stored = localStorage.getItem(PROGRESS_STORAGE);
    if(stored){
      const parsed = JSON.parse(stored);
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch {
    // Fall through to cookie migration/fallback.
  }
  const cookieProgress = readProgressCookie();
  if(Object.keys(cookieProgress).length){
    writeStoredProgress(cookieProgress);
  }
  return cookieProgress;
}

function writeStoredProgress(progress){
  try {
    localStorage.setItem(PROGRESS_STORAGE, JSON.stringify(progress));
    return;
  } catch {
    writeProgressCookie(progress);
  }
}

function progressKeyForPuzzle(puzzle){
  return puzzle?.image || '';
}

function getSavedPuzzleProgress(puzzle){
  const progress = readStoredProgress();
  const saved = progress[progressKeyForPuzzle(puzzle)];
  const value = typeof saved === 'object' && saved ? Number(saved.percent) : Number(saved);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function calculateCurrentProgress(){
  if(!state.pieces.length) return 0;
  const counts = new Map();
  for(const piece of state.pieces){
    const root = find(piece.i);
    counts.set(root, (counts.get(root) || 0) + 1);
  }

  let mergedPieces = 0;
  counts.forEach((count) => {
    if(count > 1) mergedPieces += count;
  });
  return Math.round((mergedPieces / TOTAL) * 100);
}

function saveCurrentPuzzleProgress(forcePercent = null){
  const key = progressKeyForPuzzle(state.selectedPuzzle);
  if(!key) return;
  if(!state.pieces.length) return;

  const nextPercent = forcePercent ?? calculateCurrentProgress();
  const progress = readStoredProgress();
  const savedState = {
    percent: Math.max(0, Math.min(100, nextPercent)),
    pieces: state.pieces.map((piece) => ({
      i: piece.i,
      x: piece.x,
      y: piece.y,
      open: piece.open,
      group: find(piece.i),
    })),
  };
  progress[key] = savedState;
  writeStoredProgress(progress);
}

function clearCurrentPuzzleProgress(){
  const key = progressKeyForPuzzle(state.selectedPuzzle);
  if(!key) return;
  const progress = readStoredProgress();
  delete progress[key];
  writeStoredProgress(progress);
}

function setLoadingProgress(percent){
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  loadingProgressFill.style.width = `${value}%`;
  loadingProgressFill.parentElement.setAttribute('aria-valuenow', String(value));
}

function showLoadingScreen(){
  menuScreen.hidden = true;
  gameScreen.hidden = true;
  loadingScreen.hidden = false;
  document.body.classList.remove('playing');
  setLoadingProgress(0);
}

function hideLoadingScreen(){
  loadingScreen.hidden = true;
}

async function responseToBlobWithProgress(response){
  const total = Number(response.headers.get('content-length')) || 0;
  if(!response.body || !total){
    setLoadingProgress(72);
    return response.blob();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  while(true){
    const { done, value } = await reader.read();
    if(done) break;
    chunks.push(value);
    loaded += value.byteLength;
    setLoadingProgress(10 + (loaded / total) * 78);
  }

  return new Blob(chunks, {
    type: response.headers.get('content-type') || 'application/octet-stream',
  });
}

async function blobToImageUrl(blob){
  if(state.imgObjectUrl){
    URL.revokeObjectURL(state.imgObjectUrl);
  }
  state.imgObjectUrl = URL.createObjectURL(blob);
  const loaded = await canLoadImage(state.imgObjectUrl);
  if(!loaded) throw new Error('Asset could not be decoded.');
  return state.imgObjectUrl;
}

async function loadFullAsset(puzzle){
  const assetUrl = puzzle.image;
  setLoadingProgress(8);

  if('caches' in window){
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(assetUrl);
    if(cached){
      setLoadingProgress(86);
      const blob = await cached.blob();
      const objectUrl = await blobToImageUrl(blob);
      setLoadingProgress(100);
      return objectUrl;
    }

    const response = await fetch(assetUrl);
    if(!response.ok) throw new Error('Asset could not be loaded.');
    const blob = await responseToBlobWithProgress(response);
    await cache.put(assetUrl, new Response(blob, {
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    }));
    const objectUrl = await blobToImageUrl(blob);
    setLoadingProgress(100);
    return objectUrl;
  }

  const response = await fetch(assetUrl);
  if(!response.ok) throw new Error('Asset could not be loaded.');
  const blob = await responseToBlobWithProgress(response);
  const objectUrl = await blobToImageUrl(blob);
  setLoadingProgress(100);
  return objectUrl;
}

function clearThumbObjectUrls(){
  state.thumbObjectUrls.forEach(url => URL.revokeObjectURL(url));
  state.thumbObjectUrls = [];
}

async function loadThumbAsset(puzzle){
  const thumbUrl = puzzle.thumb;
  if(!thumbUrl) return '';

  if('caches' in window){
    const cache = await caches.open(THUMB_CACHE);
    const cached = await cache.match(thumbUrl);
    if(cached){
      const blob = await cached.blob();
      const objectUrl = URL.createObjectURL(blob);
      state.thumbObjectUrls.push(objectUrl);
      return objectUrl;
    }

    const response = await fetch(thumbUrl);
    if(!response.ok) return `${thumbUrl}?v=${Date.now()}`;
    const blob = await response.blob();
    await cache.put(thumbUrl, new Response(blob, {
      headers: { 'Content-Type': blob.type || 'image/webp' },
    }));
    const objectUrl = URL.createObjectURL(blob);
    state.thumbObjectUrls.push(objectUrl);
    return objectUrl;
  }

  return `${thumbUrl}?v=${Date.now()}`;
}

function getSavedPuzzleState(puzzle){
  const progress = readStoredProgress();
  const saved = progress[progressKeyForPuzzle(puzzle)];
  if(!saved || typeof saved !== 'object' || !Array.isArray(saved.pieces)) return null;
  if(saved.pieces.length !== TOTAL) return null;
  return saved;
}

function restoreSavedPuzzleState(saved){
  const byId = new Map(saved.pieces.map(piece => [piece.i, piece]));
  for(const piece of state.pieces){
    const savedPiece = byId.get(piece.i);
    if(!savedPiece) return false;
    const x = Number(savedPiece.x);
    const y = Number(savedPiece.y);
    if(!Number.isFinite(x) || !Number.isFinite(y)) return false;
    piece.x = x;
    piece.y = y;
    piece.open = Boolean(savedPiece.open);
    position(piece);
    if(piece.open){
      applyOpenPieceVisual(piece);
    } else {
      piece.el.className = 'piece hidden';
      piece.el.style.backgroundImage = '';
    }
  }

  const groupRoots = new Map();
  for(const piece of state.pieces){
    const savedPiece = byId.get(piece.i);
    const legacyParent = Number.isInteger(savedPiece.parent) ? savedPiece.parent : piece.i;
    const group = Number.isInteger(savedPiece.group) ? savedPiece.group : legacyParent;
    if(!groupRoots.has(group)) groupRoots.set(group, piece.i);
    state.parent[piece.i] = groupRoots.get(group);
  }

  refreshMergedVisuals();
  checkWin();
  return true;
}

async function resolveImage(){
  if(state.imgUrl){
    return state.imgUrl;
  }
  throw new Error('Selected puzzle image could not be loaded.');
}

function canLoadImage(url){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url.startsWith('blob:') ? url : `${url}?v=${Date.now()}`;
  });
}

async function loadManifestPuzzles(){
  try {
    const response = await fetch(`images/manifest.json?v=${Date.now()}`);
    if(!response.ok) return [];
    const manifest = await response.json();
    if(!Array.isArray(manifest)) return [];
    return manifest
      .map(normalizePuzzleEntry)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function loadDirectoryPuzzles(){
  try {
    const response = await fetch(`images/?v=${Date.now()}`);
    if(!response.ok) return [];
    const html = await response.text();
    const matches = [...html.matchAll(/href=["']([^"']+\.(?:jpe?g|png|webp|gif|svg))["']/gi)];
    return matches.map((match) => {
      const file = decodeURIComponent(match[1]).split('/').pop();
      return normalizePuzzleEntry(file);
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function titleFromImagePath(path = ''){
  const file = path.split('/').pop() || 'Puzzle';
  const withoutExt = file.replace(/\.[^.]+$/, '');
  return withoutExt
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

async function discoverPuzzles(){
  setLoadingProgress(12);
  const configured = PUZZLES.map(normalizePuzzleEntry).filter(Boolean);
  setLoadingProgress(24);
  const manifest = await loadManifestPuzzles();
  setLoadingProgress(42);
  const directory = await loadDirectoryPuzzles();
  setLoadingProgress(58);
  const unique = new Map();
  [...manifest, ...configured, ...directory].forEach((puzzle) => {
    if(puzzle?.image && !unique.has(puzzle.image)) unique.set(puzzle.image, puzzle);
  });

  const puzzles = [...unique.values()];
  const checks = [];
  for(let i = 0; i < puzzles.length; i++){
    const puzzle = puzzles[i];
    checks.push({
      ...puzzle,
      exists: await canLoadImage(puzzle.thumb),
    });
    setLoadingProgress(58 + ((i + 1) / puzzles.length) * 34);
  }
  return checks.filter(puzzle => puzzle.exists);
}

async function renderMenu(){
  showLoadingScreen();
  clearThumbObjectUrls();
  puzzleGrid.innerHTML = '';
  menuStatus.textContent = 'Loading puzzles...';
  let puzzles = [];
  try {
    puzzles = await discoverPuzzles();
  } catch(e) {
    hideLoadingScreen();
    menuScreen.hidden = false;
    menuStatus.textContent = e.message || 'Puzzles could not be loaded.';
    return;
  }

  if(!puzzles.length){
    hideLoadingScreen();
    menuScreen.hidden = false;
    menuStatus.textContent = 'No puzzle images found. Add files to images/ and list them in game-config.js or images/manifest.json.';
    return;
  }

  const fragment = document.createDocumentFragment();
  for(let i = 0; i < puzzles.length; i++){
    const puzzle = puzzles[i];
    const card = document.createElement('div');
    card.className = 'puzzle-card';
    if(puzzle.premium) card.classList.add('is-premium');
    if(puzzle.locked) card.classList.add('is-locked');
    card.setAttribute('role', 'button');
    card.tabIndex = puzzle.locked ? -1 : 0;
    card.addEventListener('click', () => {
      if(!puzzle.locked) selectPuzzle(puzzle);
    });
    card.addEventListener('keydown', (event) => {
      if(puzzle.locked) return;
      if(event.key === 'Enter' || event.key === ' '){
        event.preventDefault();
        selectPuzzle(puzzle);
      }
    });

    const image = document.createElement('img');
    image.className = 'puzzle-thumb';
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = await loadThumbAsset(puzzle);

    const title = document.createElement('span');
    title.className = 'puzzle-card-title';
    title.textContent = puzzle.title;

    const savedProgress = getSavedPuzzleProgress(puzzle);

    const lockLabel = document.createElement('span');
    lockLabel.className = 'puzzle-card-lock';
    lockLabel.textContent = 'Coming soon';

    card.append(image, title);
    if(savedProgress > 0){
      const badge = document.createElement('span');
      badge.className = 'puzzle-card-badge has-progress';
      badge.textContent = `${savedProgress}%`;
      card.appendChild(badge);
    }
    if(puzzle.premium) {
      const premiumBadge = document.createElement('span');
      premiumBadge.className = 'puzzle-card-premium';
      premiumBadge.setAttribute('aria-hidden', 'true');
      card.appendChild(premiumBadge);
    }
    card.appendChild(lockLabel);
    fragment.appendChild(card);
    setLoadingProgress(92 + ((i + 1) / puzzles.length) * 7);
  }

  puzzleGrid.appendChild(fragment);
  menuStatus.textContent = '';
  setLoadingProgress(100);
  hideLoadingScreen();
  menuScreen.hidden = false;
}

async function selectPuzzle(puzzle){
  state.selectedPuzzle = puzzle;
  showLoadingScreen();
  try {
    state.imgUrl = await loadFullAsset(puzzle);
    gameScreen.hidden = false;
    document.body.classList.add('playing');
    await init();
    hideLoadingScreen();
  } catch(e) {
    hideLoadingScreen();
    gameScreen.hidden = true;
    menuScreen.hidden = false;
    menuStatus.textContent = e.message || 'Asset could not be loaded.';
  }
}

async function restartCurrentPuzzle(){
  clearCurrentPuzzleProgress();
  showLoadingScreen();
  gameScreen.hidden = false;
  document.body.classList.add('playing');
  try {
    await init();
  } finally {
    hideLoadingScreen();
  }
}

function showMenu(){
  saveCurrentPuzzleProgress();
  state.drag = null;
  board.innerHTML = '';
  state.pieces = [];
  state.parent = [];
  statusEl.textContent = '';
  statusEl.className = '';
  gameScreen.hidden = true;
  menuScreen.hidden = false;
  document.body.classList.remove('playing');
  renderMenu();
}

async function init(){
  statusEl.className='';
  statusEl.textContent='Loading...';
  board.innerHTML='';
  state.pieces=[]; state.parent=[];
  try { state.imgUrl = await resolveImage(); }
  catch(e){ statusEl.textContent=e.message; return; }
  setLoadingProgress(90);
  document.documentElement.style.setProperty('--move-duration', `${MOVE_DURATION_MS}ms`);
  applySliceConfigToLayout();
  await applyImageAspectToBoard();
  setLoadingProgress(94);

  const cellW = board.clientWidth / COLS;
  const cellH = board.clientHeight / ROWS;
  const shuffledSlots = shuffle([...Array(TOTAL).keys()]);

  for(let i=0;i<TOTAL;i++){
    const [r,c]=rc(i);
    const el=document.createElement('div');
    el.className='piece hidden';
    el.dataset.i=i;

    const slot = shuffledSlots[i];
    const [slotR, slotC] = rc(slot);
    const piece={i,r,c,open:false,el,x:slotC*cellW,y:slotR*cellH};

    state.parent[i]=i;
    position(piece);
    bindDrag(piece);
    state.pieces.push(piece);
    board.appendChild(el);
  }
  setAnimationEnabled(ANIM_ENABLED);
  setLoadingProgress(98);

  const savedState = getSavedPuzzleState(state.selectedPuzzle);
  if(savedState && restoreSavedPuzzleState(savedState)){
    statusEl.textContent='Progress restored.';
    setLoadingProgress(100);
    return;
  }

  const [pairA, pairB] = randomAdjacentPair();
  openPiece(pairA);
  openPiece(pairB);

  const remainingInitial = Math.max(0, INITIAL_OPEN - 2);
  const extra = shuffle([...Array(TOTAL).keys()].filter(i=>i!==pairA && i!==pairB)).slice(0, remainingInitial);
  extra.forEach(openPiece);
  statusEl.textContent='Match neighboring pieces to reveal more of the puzzle.';
  setLoadingProgress(100);
}

function openPiece(i){
  const p=state.pieces[i]; if(p.open) return true;
  if(!ensureVisiblePieceOnFreeSlot(p)) return false;
  p.open=true;
  applyOpenPieceVisual(p);
  playRevealAnimation(p);
  refreshMergedVisuals();
  return true;
}

function applyOpenPieceVisual(piece){
  piece.el.classList.remove('hidden');
  piece.el.classList.add('open');
  piece.el.style.backgroundImage=`url(${state.imgUrl})`;
  piece.el.style.backgroundSize=`${COLS * 100}% ${ROWS * 100}%`;
  const xDen = Math.max(COLS - 1, 1);
  const yDen = Math.max(ROWS - 1, 1);
  piece.el.style.backgroundPosition=`${(piece.c/xDen)*100}% ${(piece.r/yDen)*100}%`;
}

function playRevealAnimation(piece){
  piece.el.classList.remove('revealing');
  void piece.el.offsetWidth;
  piece.el.classList.add('revealing');
  piece.el.addEventListener('animationend', () => {
    piece.el.classList.remove('revealing');
  }, { once: true });
}

function applySliceConfigToLayout(){
  document.documentElement.style.setProperty('--cols', String(COLS));
  document.documentElement.style.setProperty('--rows', String(ROWS));
}

function applyImageAspectToBoard(){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = () => {
      if(img.naturalWidth && img.naturalHeight){
        document.documentElement.style.setProperty('--board-aspect', `${img.naturalWidth} / ${img.naturalHeight}`);
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = state.imgUrl.startsWith('blob:') ? state.imgUrl : `${state.imgUrl}?v=${Date.now()}`;
  });
}

function ensureVisiblePieceOnFreeSlot(piece){
  const occupied = new Set(
    state.pieces
      .filter(p=>p.open && p.i!==piece.i)
      .map(p=>gridKeyFromPos(p.x, p.y))
  );
  const ownKey = gridKeyFromPos(piece.x, piece.y);
  if(!occupied.has(ownKey) && !wouldAutoMergeAt(piece, piece.x, piece.y)) return true;

  const { w, h } = cellSize();
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const x = c*w;
      const y = r*h;
      const key = `${r}|${c}`;
      if(occupied.has(key)) continue;
      const d = Math.hypot(piece.x-x, piece.y-y);
      if(wouldAutoMergeAt(piece, x, y)) continue;
      if(d < bestDist){
        bestDist = d;
        best = {x,y};
      }
    }
  }
  if(best){
    piece.x = best.x;
    piece.y = best.y;
    position(piece);
    return true;
  }
  return false;
}

function clearPiecesUnderOpenAreas(preferredSlots = []){
  const occupiedByOpen = new Set(state.pieces.filter(p=>p.open).map(p=>gridKeyFromPos(p.x, p.y)));
  const occupiedAll = new Set(state.pieces.filter(p=>p.open).map(p=>gridKeyFromPos(p.x, p.y)));
  const { w, h } = cellSize();
  const preferredPool = preferredSlots
    .map(s=>{
      const { r, c } = gridCellFromPos(s.x, s.y);
      return { x:c*w, y:r*h, key:`${r}|${c}` };
    })
    .filter(s=>!occupiedAll.has(s.key));

  const hiddenPieces = state.pieces.filter(p=>!p.open);
  const conflicted = hiddenPieces.filter(h=>occupiedByOpen.has(gridKeyFromPos(h.x, h.y)));
  const freeHidden = hiddenPieces.filter(h=>!occupiedByOpen.has(gridKeyFromPos(h.x, h.y)));

  for(const hidden of freeHidden){
    const key = gridKeyFromPos(hidden.x, hidden.y);
    if(!occupiedAll.has(key)) {
      occupiedAll.add(key);
    }
  }

  for(const hidden of conflicted){
    let placedInPreferred = false;
    let preferredIdx = -1;
    let preferredDist = Number.POSITIVE_INFINITY;
    for(let i=0;i<preferredPool.length;i++){
      const slot = preferredPool[i];
      if(occupiedAll.has(slot.key)) continue;
      const d = Math.hypot(hidden.x-slot.x, hidden.y-slot.y);
      if(d < preferredDist){
        preferredDist = d;
        preferredIdx = i;
      }
    }
    if(preferredIdx !== -1){
      const slot = preferredPool[preferredIdx];
      hidden.x = slot.x;
      hidden.y = slot.y;
      position(hidden);
      occupiedAll.add(slot.key);
      preferredPool.splice(preferredIdx, 1);
      placedInPreferred = true;
    }
    if(placedInPreferred) continue;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const x = c*w;
        const y = r*h;
        const slotKey = `${r}|${c}`;
        if(occupiedAll.has(slotKey)) continue;
        const d = Math.hypot(hidden.x-x, hidden.y-y);
        if(d < bestDist){
          bestDist = d;
          best = {x,y};
        }
      }
    }
    if(best){
      hidden.x = best.x;
      hidden.y = best.y;
      position(hidden);
      occupiedAll.add(gridKeyFromPos(hidden.x, hidden.y));
    }
  }
}

function resolveAnyOverlaps(){
  const { w, h } = cellSize();
  const byCell = new Map();
  for(const p of state.pieces){
    const key = gridKeyFromPos(p.x, p.y);
    if(!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(p);
  }

  const used = new Set();
  const overlaps = [];
  for(const [key, pieces] of byCell.entries()){
    if(pieces.length === 1){
      used.add(key);
      continue;
    }

    const mergedAnchors = pieces.filter(p=>groupSizeByRoot(find(p.i)) > 1);
    const anchor = mergedAnchors[0] || pieces[0];
    used.add(gridKeyFromPos(anchor.x, anchor.y));

    for(const p of pieces){
      if(p.i !== anchor.i) overlaps.push(p);
    }
  }

  for(const p of overlaps){
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const slotKey = `${r}|${c}`;
        if(used.has(slotKey)) continue;
        const x = c*w;
        const y = r*h;
        const d = Math.hypot(p.x-x, p.y-y);
        if(d < bestDist){
          bestDist = d;
          best = { x, y, slotKey };
        }
      }
    }
    if(best){
      p.x = best.x;
      p.y = best.y;
      position(p);
      used.add(best.slotKey);
    }
  }
}

function mergeAllCorrectAdjacencies(){
  let merged = false;
  const mergedRoots = new Set();
  let changed = true;

  while(changed){
    changed = false;
    for(const a of state.pieces){
      if(!a.open) continue;
      for(const nb of neighbors(a.i)){
        const b = state.pieces[nb];
        if(!b.open || find(a.i) === find(b.i)) continue;
        if(state.mergeSuppression.has(mergePairKey(a, b))) continue;
        if(!isCorrectlyPlacedNextTo(a, b)) continue;

        const target = correctAdjacencyDelta(a, b);
        const dx = (b.x - a.x) - target.x;
        const dy = (b.y - a.y) - target.y;
        const rootA = find(a.i);
        const groupA = state.pieces.filter(p => find(p.i) === rootA);
        groupA.forEach(p => {
          p.x += dx;
          p.y += dy;
          position(p);
        });

        union(a.i, b.i);
        mergedRoots.add(find(a.i));
        merged = true;
        changed = true;
        break;
      }
      if(changed) break;
    }
  }

  return { merged, mergedRoots };
}

function processCorrectAdjacencyMerges(preferredSlots = []){
  let anyMerged = false;
  let slots = preferredSlots;

  for(let guard = 0; guard < TOTAL; guard++){
    const { merged, mergedRoots } = mergeAllCorrectAdjacencies();
    if(!merged) break;

    anyMerged = true;
    clearPiecesUnderOpenAreas(slots);
    revealAfterMerge(mergedRoots);
    refreshMergedVisuals();
    checkWin();
    resolveAnyOverlaps();
    slots = [];
  }

  return anyMerged;
}

function bindDrag(piece){
  piece.el.addEventListener('pointerdown',e=>{
    if(!piece.open) return;
    setAnimationEnabled(false);
    const root=find(piece.i);
    const group = state.pieces.filter(p=>find(p.i)===root);
    state.drag={group,startX:e.clientX,startY:e.clientY,orig:group.map(p=>({p,x:p.x,y:p.y}))};
    group.forEach(p=>p.el.classList.add('dragging'));
    piece.el.setPointerCapture(e.pointerId);
  });

  piece.el.addEventListener('pointermove',e=>{
    if(!state.drag) return;
    const { w, h } = cellSize();
    const rawDx=e.clientX-state.drag.startX, rawDy=e.clientY-state.drag.startY;
    let dx = rawDx;
    let dy = rawDy;

    const groupCells = state.drag.orig.map(o=>gridCellFromPos(o.x, o.y));
    const minCol = Math.min(...groupCells.map(c=>c.c));
    const maxCol = Math.max(...groupCells.map(c=>c.c));
    const minRow = Math.min(...groupCells.map(c=>c.r));
    const maxRow = Math.max(...groupCells.map(c=>c.r));

    const minDeltaCol = -minCol;
    const maxDeltaCol = (COLS - 1) - maxCol;
    const minDeltaRow = -minRow;
    const maxDeltaRow = (ROWS - 1) - maxRow;

    const minDx = minDeltaCol * w;
    const maxDx = maxDeltaCol * w;
    const minDy = minDeltaRow * h;
    const maxDy = maxDeltaRow * h;
    dx = Math.max(minDx, Math.min(maxDx, dx));
    dy = Math.max(minDy, Math.min(maxDy, dy));

    state.drag.orig.forEach(o=>{ o.p.x=o.x+dx; o.p.y=o.y+dy; position(o.p); });
  });

  piece.el.addEventListener('pointerup',()=>{ if(state.drag){ finishDrag(); } });
}

function finishDrag(){
  const drag = state.drag;
  const { w, h } = cellSize();
  const rawDx = drag.group[0].x - drag.orig[0].x;
  const rawDy = drag.group[0].y - drag.orig[0].y;
  const snapDx = Math.round(rawDx / w) * w;
  const snapDy = Math.round(rawDy / h) * h;
  drag.orig.forEach(o=>{ o.p.x=o.x+snapDx; o.p.y=o.y+snapDy; position(o.p); });
  setAnimationEnabled(ANIM_ENABLED);

  drag.group.forEach(p=>p.el.classList.remove('dragging'));
  state.mergeSuppression.clear();
  const swapped = applyGridSwapIfNeeded(drag);
  state.drag=null;
  resolveAnyOverlaps();
  if(!swapped){
    state.mergeSuppression.clear();
    saveCurrentPuzzleProgress();
    return;
  }
  processCorrectAdjacencyMerges(drag.orig.map(o=>({x:o.x,y:o.y})));
  resolveAnyOverlaps();
  processCorrectAdjacencyMerges();
  state.mergeSuppression.clear();
  saveCurrentPuzzleProgress();
}

function groupSizeByRoot(root){
  let count = 0;
  for(const p of state.pieces){
    if(find(p.i)===root) count++;
  }
  return count;
}

function rebuildPartiallyReplacedGroup(group, replacedPieces){
  if(group.length <= 1 || !replacedPieces.size) return false;
  const replaced = new Set(replacedPieces);
  const remaining = group.filter(piece => !replaced.has(piece));

  replaced.forEach(replacedPiece => {
    remaining.forEach(remainingPiece => {
      state.mergeSuppression.add(mergePairKey(replacedPiece, remainingPiece));
    });
  });

  group.forEach(piece => {
    state.parent[piece.i] = piece.i;
  });

  let changed = true;
  while(changed){
    changed = false;
    for(const piece of group){
      for(const nb of neighbors(piece.i)){
        const other = state.pieces[nb];
        if(!group.includes(other)) continue;
        if(find(piece.i) === find(other.i)) continue;
        if(state.mergeSuppression.has(mergePairKey(piece, other))) continue;
        if(!isCorrectlyPlacedNextTo(piece, other)) continue;
        union(piece.i, other.i);
        changed = true;
      }
    }
  }

  refreshMergedVisuals();
  return true;
}

function applyGridSwapIfNeeded(drag){
  const movedSet = new Set(drag.group.map(p=>p.i));
  const dx = drag.group[0].x - drag.orig[0].x;
  const dy = drag.group[0].y - drag.orig[0].y;

  if(dx===0 && dy===0){
    return true;
  }

  const collided = new Set();
  for(const p of drag.group){
    state.pieces.forEach(other => {
      if(!movedSet.has(other.i) && other.x===p.x && other.y===p.y) collided.add(other);
    });
  }

  if(!collided.size){
    return true;
  }

  const affectedGroups = new Map();
  for(const p of collided){
    const root = find(p.i);
    if(groupSizeByRoot(root) > 1){
      if(!affectedGroups.has(root)){
        affectedGroups.set(root, {
          group: state.pieces.filter(piece => find(piece.i) === root),
          replaced: new Set(),
        });
      }
      affectedGroups.get(root).replaced.add(p);
    }
  }

  const finalCells = new Map();
  for(const p of state.pieces){
    if(!p.open) continue;
    const x = collided.has(p) ? p.x - dx : p.x;
    const y = collided.has(p) ? p.y - dy : p.y;
    const key = `${x}|${y}`;
    if(finalCells.has(key)){
      drag.orig.forEach(o=>{ o.p.x=o.x; o.p.y=o.y; position(o.p); });
      return false;
    }
    finalCells.set(key, p);
  }

  collided.forEach(p=>{
    p.x -= dx;
    p.y -= dy;
    position(p);
  });
  affectedGroups.forEach(({ group, replaced }) => {
    rebuildPartiallyReplacedGroup(group, replaced);
  });
  return true;
}

function revealAfterMerge(mergedRoots = new Set()){
  const roots = REVEAL_CONFIG.onlyNearMergedArea
    ? [...mergedRoots]
    : [...new Set(state.pieces.filter(p=>p.open).map(p=>find(p.i)))];

  for(const root of roots){
    const group=state.pieces.filter(p=>find(p.i)===root && p.open);
    const frontier=[];
    group.forEach(p=>neighbors(p.i).forEach(n=>{ if(!state.pieces[n].open) frontier.push(n); }));
    const uniq=shuffle([...new Set(frontier)]);
    if(uniq.length){
      const mainToOpen = Math.min(REVEAL_CONFIG.mainPiecesCount, uniq.length);
      for(let i=0;i<mainToOpen;i++) openPiece(uniq[i]);

      const remaining = uniq.slice(mainToOpen);
      const extraToOpen = Math.min(REVEAL_CONFIG.extraPiecesCount, remaining.length);
      for(let i=0;i<extraToOpen;i++) openPiece(remaining[i]);
    }
  }
}

function refreshMergedVisuals(){
  for(const p of state.pieces){
    if(!p.open){
      p.el.classList.remove('merged');
      continue;
    }
    const root = find(p.i);
    const sameGroupNeighbors = neighbors(p.i).filter(n=>state.pieces[n].open && find(n)===root);
    const isMerged = sameGroupNeighbors.length > 0;
    p.el.classList.toggle('merged', isMerged);

    p.el.style.borderTopColor = '';
    p.el.style.borderRightColor = '';
    p.el.style.borderBottomColor = '';
    p.el.style.borderLeftColor = '';
    p.el.style.borderTopWidth = '';
    p.el.style.borderRightWidth = '';
    p.el.style.borderBottomWidth = '';
    p.el.style.borderLeftWidth = '';
    p.el.style.borderTopLeftRadius = '';
    p.el.style.borderTopRightRadius = '';
    p.el.style.borderBottomRightRadius = '';
    p.el.style.borderBottomLeftRadius = '';

    if(!isMerged) continue;

    const [r,c] = [p.r,p.c];
    const top = r>0 ? state.pieces[idx(r-1,c)] : null;
    const right = c<COLS-1 ? state.pieces[idx(r,c+1)] : null;
    const bottom = r<ROWS-1 ? state.pieces[idx(r+1,c)] : null;
    const left = c>0 ? state.pieces[idx(r,c-1)] : null;

    const connectedTop = top && top.open && find(top.i)===root;
    const connectedRight = right && right.open && find(right.i)===root;
    const connectedBottom = bottom && bottom.open && find(bottom.i)===root;
    const connectedLeft = left && left.open && find(left.i)===root;

    if(connectedTop){ p.el.style.borderTopWidth = '0px'; p.el.style.borderTopColor = 'transparent'; }
    if(connectedRight){ p.el.style.borderRightWidth = '0px'; p.el.style.borderRightColor = 'transparent'; }
    if(connectedBottom){ p.el.style.borderBottomWidth = '0px'; p.el.style.borderBottomColor = 'transparent'; }
    if(connectedLeft){ p.el.style.borderLeftWidth = '0px'; p.el.style.borderLeftColor = 'transparent'; }
  }
}

function checkWin(){
  const allOpen=state.pieces.every(p=>p.open);
  const oneGroup=state.pieces.every(p=>find(p.i)===find(0));
  if(allOpen && oneGroup){
    saveCurrentPuzzleProgress(100);
    statusEl.className='status-win';
    statusEl.textContent='Solved.';
  }
}

function position(p){
  p.el.style.left=`${p.x}px`; p.el.style.top=`${p.y}px`;
  p.el.style.zIndex = String(p.open ? 10 + p.r*COLS + p.c : 1);
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]];} return a; }

renderMenu();
