const GRID = 7;
const TOTAL = GRID * GRID;
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

function idx(r, c) { return r * GRID + c; }
function rc(i) { return [Math.floor(i / GRID), i % GRID]; }
function find(a){ while(state.parent[a]!==a){ state.parent[a]=state.parent[state.parent[a]]; a=state.parent[a]; } return a; }
function union(a,b){ a=find(a); b=find(b); if(a!==b) state.parent[b]=a; }

function neighbors(i){
  const [r,c]=rc(i); const n=[];
  if(r>0)n.push(idx(r-1,c)); if(r<GRID-1)n.push(idx(r+1,c));
  if(c>0)n.push(idx(r,c-1)); if(c<GRID-1)n.push(idx(r,c+1));
  return n;
}

function cellSize(){
  return { w: board.clientWidth / GRID, h: board.clientHeight / GRID };
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

  const cellW = board.clientWidth / GRID;
  const cellH = board.clientHeight / GRID;
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
  p.el.style.backgroundPosition=`${(p.c/(GRID-1))*100}% ${(p.r/(GRID-1))*100}%`;
  refreshMergedVisuals();
}

function ensureVisiblePieceOnFreeSlot(piece){
  const occupied = new Set(
    state.pieces
      .filter(p=>p.open && p.i!==piece.i)
      .map(p=>`${p.x}|${p.y}`)
  );
  const ownKey = `${piece.x}|${piece.y}`;
  if(!occupied.has(ownKey)) return;

  const { w, h } = cellSize();
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      const x = c*w;
      const y = r*h;
      const key = `${x}|${y}`;
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

function clearPiecesUnderOpenAreas(){
  const occupiedByOpen = new Set(state.pieces.filter(p=>p.open).map(p=>`${p.x}|${p.y}`));
  const { w, h } = cellSize();

  for(const hidden of state.pieces.filter(p=>!p.open)){
    const key = `${hidden.x}|${hidden.y}`;
    if(!occupiedByOpen.has(key)) continue;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for(let r=0;r<GRID;r++){
      for(let c=0;c<GRID;c++){
        const x = c*w;
        const y = r*h;
        const slotKey = `${x}|${y}`;
        if(occupiedByOpen.has(slotKey)) continue;
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
    clearPiecesUnderOpenAreas();
    revealAfterMerge(mergedRoots);
    refreshMergedVisuals();
    checkWin();
  }
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
    const right = c<GRID-1 ? state.pieces[idx(r,c+1)] : null;
    const bottom = r<GRID-1 ? state.pieces[idx(r+1,c)] : null;
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
  p.el.style.zIndex = String(p.open ? 10 + p.r*GRID + p.c : 1);
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]];} return a; }

init();
