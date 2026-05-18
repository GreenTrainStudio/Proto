const SLICE_CONFIG = {
  rows: 7,
  cols: 7,
};
const ROWS = SLICE_CONFIG.rows;
const COLS = SLICE_CONFIG.cols;
const TOTAL = ROWS * COLS;
const INITIAL_OPEN = 3;
const SNAP = 18;
const REVEAL_CONFIG = {
  mainPiecesCount: 1,
  extraPiecesCount: 1,
  onlyNearMergedArea: true,
};

const board = document.getElementById('board');
const statusEl = document.getElementById('status');
document.getElementById('newGameBtn').addEventListener('click', () => init());

const state = {
  imgUrl: null,
  pieces: [],
  parent: [],
  drag: null,
};

function idx(r, c) { return r * COLS + c; }
function rc(i) { return [Math.floor(i / COLS), i % COLS]; }
function find(a){ while(state.parent[a]!==a){ state.parent[a]=state.parent[state.parent[a]]; a=state.parent[a]; } return a; }
function union(a,b){ a=find(a); b=find(b); if(a!==b) state.parent[b]=a; }

function neighbors(i){
  const [r,c]=rc(i); const n=[];
  if(r>0)n.push(idx(r-1,c)); if(r<ROWS-1)n.push(idx(r+1,c));
  if(c>0)n.push(idx(r,c-1)); if(c<COLS-1)n.push(idx(r,c+1));
  return n;
}

function cellSize(){
  return { w: board.clientWidth / COLS, h: board.clientHeight / ROWS };
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

async function resolveImage(){
  for(const name of ['images/source.jpg','images/source.png']){
    if(await canLoadImage(name)) return name;
  }
  throw new Error('Не найдено images/source.jpg или images/source.png');
}

function canLoadImage(url){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = `${url}?v=${Date.now()}`;
  });
}

async function init(){
  statusEl.className='';
  statusEl.textContent='Загрузка...';
  board.innerHTML='';
  state.pieces=[]; state.parent=[];
  try { state.imgUrl = await resolveImage(); }
  catch(e){ statusEl.textContent=e.message; return; }
  applySliceConfigToLayout();
  await applyImageAspectToBoard();

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

  const [pairA, pairB] = randomAdjacentPair();
  openPiece(pairA);
  openPiece(pairB);

  const remainingInitial = Math.max(0, INITIAL_OPEN - 2);
  const extra = shuffle([...Array(TOTAL).keys()].filter(i=>i!==pairA && i!==pairB)).slice(0, remainingInitial);
  extra.forEach(openPiece);
  statusEl.textContent='Открыто 3 случайных кусочка. Сливайте совпадающие части!';
}

function openPiece(i){
  const p=state.pieces[i]; if(p.open) return;
  ensureVisiblePieceOnFreeSlot(p);
  p.open=true; p.el.classList.remove('hidden'); p.el.classList.add('open');
  p.el.style.backgroundImage=`url(${state.imgUrl})`;
  p.el.style.backgroundSize=`${COLS * 100}% ${ROWS * 100}%`;
  const xDen = Math.max(COLS - 1, 1);
  const yDen = Math.max(ROWS - 1, 1);
  p.el.style.backgroundPosition=`${(p.c/xDen)*100}% ${(p.r/yDen)*100}%`;
  refreshMergedVisuals();
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
    img.src = `${state.imgUrl}?v=${Date.now()}`;
  });
}

function ensureVisiblePieceOnFreeSlot(piece){
  const occupied = new Set(
    state.pieces
      .filter(p=>p.open && p.i!==piece.i)
      .map(p=>gridKeyFromPos(p.x, p.y))
  );
  const ownKey = gridKeyFromPos(piece.x, piece.y);
  if(!occupied.has(ownKey)) return;

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
  }
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

function bindDrag(piece){
  piece.el.addEventListener('pointerdown',e=>{
    if(!piece.open) return;
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
    const dx=Math.round(rawDx / w) * w;
    const dy=Math.round(rawDy / h) * h;
    state.drag.orig.forEach(o=>{ o.p.x=o.x+dx; o.p.y=o.y+dy; position(o.p); });
  });

  piece.el.addEventListener('pointerup',()=>{ if(state.drag){ finishDrag(); } });
}

function finishDrag(){
  const drag = state.drag;
  drag.group.forEach(p=>p.el.classList.remove('dragging'));
  const moved = [...drag.group];
  const swapped = applyGridSwapIfNeeded(drag);
  state.drag=null;
  resolveAnyOverlaps();
  if(!swapped){
    return;
  }
  let merged=false;
  const mergedRoots = new Set();
  for(const a of moved){
    for(const nb of neighbors(a.i)){
      const b=state.pieces[nb];
      if(!b.open || find(a.i)===find(b.i)) continue;
      const { w, h } = cellSize();
      const targetDx=(b.c-a.c)*w;
      const targetDy=(b.r-a.r)*h;
      const dx=(b.x-a.x)-targetDx;
      const dy=(b.y-a.y)-targetDy;
      if(Math.hypot(dx,dy)<SNAP){
        const rootA=find(a.i);
        const groupA=state.pieces.filter(p=>find(p.i)===rootA);
        groupA.forEach(p=>{ p.x+=dx; p.y+=dy; position(p); });
        union(a.i,b.i);
        mergedRoots.add(find(a.i));
        merged=true;
      }
    }
  }
  if(merged){
    clearPiecesUnderOpenAreas(drag.orig.map(o=>({x:o.x,y:o.y})));
    revealAfterMerge(mergedRoots);
    refreshMergedVisuals();
    checkWin();
  }
  resolveAnyOverlaps();
}

function groupSizeByRoot(root){
  let count = 0;
  for(const p of state.pieces){
    if(find(p.i)===root) count++;
  }
  return count;
}

function applyGridSwapIfNeeded(drag){
  const movedSet = new Set(drag.group.map(p=>p.i));
  const origById = new Map(drag.orig.map(o=>[o.p.i,{x:o.x,y:o.y}]));
  const dx = drag.group[0].x - drag.orig[0].x;
  const dy = drag.group[0].y - drag.orig[0].y;

  if(dx===0 && dy===0){
    return true;
  }

  const collided = new Set();
  for(const p of drag.group){
    const hit = state.pieces.find(other=>!movedSet.has(other.i) && other.x===p.x && other.y===p.y);
    if(hit) collided.add(hit);
  }

  if(!collided.size){
    return true;
  }

  for(const p of collided){
    const root = find(p.i);
    const mergedArea = groupSizeByRoot(root) > 1;
    if(mergedArea){
      drag.orig.forEach(o=>{ o.p.x=o.x; o.p.y=o.y; position(o.p); });
      return false;
    }
  }

  const occupiedByOthers = new Set(
    state.pieces
      .filter(p=>!movedSet.has(p.i) && !collided.has(p))
      .map(p=>`${p.x}|${p.y}`)
  );

  for(const p of collided){
    const targetKey = `${p.x-dx}|${p.y-dy}`;
    const movedOrigin = [...origById.values()].some(pos=>pos.x===p.x-dx && pos.y===p.y-dy);
    if(!movedOrigin && occupiedByOthers.has(targetKey)){
      drag.orig.forEach(o=>{ o.p.x=o.x; o.p.y=o.y; position(o.p); });
      return false;
    }
  }

  collided.forEach(p=>{
    p.x -= dx;
    p.y -= dy;
    position(p);
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
    statusEl.className='status-win';
    statusEl.textContent='Победа! Пазл собран.';
  }
}

function position(p){
  p.el.style.left=`${p.x}px`; p.el.style.top=`${p.y}px`;
  p.el.style.zIndex = String(p.open ? 10 + p.r*COLS + p.c : 1);
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]];} return a; }

init();
