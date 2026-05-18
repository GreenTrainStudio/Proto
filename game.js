const GRID = 7;
const TOTAL = GRID * GRID;
const INITIAL_OPEN = 3;
const SNAP = 18;

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

  const initial = shuffle([...Array(TOTAL).keys()]).slice(0, INITIAL_OPEN);
  initial.forEach(openPiece);
  statusEl.textContent='Открыто 3 случайных кусочка. Сливайте совпадающие части!';
}

function openPiece(i){
  const p=state.pieces[i]; if(p.open) return;
  p.open=true; p.el.classList.remove('hidden'); p.el.classList.add('open');
  p.el.style.backgroundImage=`url(${state.imgUrl})`;
  p.el.style.backgroundPosition=`${(p.c/(GRID-1))*100}% ${(p.r/(GRID-1))*100}%`;
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
  state.drag.group.forEach(p=>p.el.classList.remove('dragging'));
  const moved = [...state.drag.group];
  state.drag=null;
  let merged=false;
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
        merged=true;
      }
    }
  }
  if(merged){
    revealAfterMerge();
    checkWin();
  }
}

function revealAfterMerge(){
  const roots=[...new Set(state.pieces.filter(p=>p.open).map(p=>find(p.i)))];
  for(const root of roots){
    const group=state.pieces.filter(p=>find(p.i)===root && p.open);
    const frontier=[];
    group.forEach(p=>neighbors(p.i).forEach(n=>{ if(!state.pieces[n].open) frontier.push(n); }));
    const uniq=[...new Set(frontier)];
    if(uniq.length){
      openPiece(uniq[Math.floor(Math.random()*uniq.length)]);
      if(Math.random()<0.4 && uniq.length>1) openPiece(uniq[Math.floor(Math.random()*uniq.length)]);
    }
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
