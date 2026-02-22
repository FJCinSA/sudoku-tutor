/*
  ═══════════════════════════════════════════
  GAME.JS — State, Logic & Controls
  ═══════════════════════════════════════════
  Central hub. Owns state, handles actions,
  wires Engine + Hints + Render.

  DEPENDS ON: Engine, Hints, Render
  LOAD ORDER: Must load LAST.

  GLOBALS (called from onclick):
    newGame  selectCell  placeNumber  eraseCell
    undoMove toggleNotes toggleCheck  togglePause
    autoNotes showHint   applyHint    toggleSound
    nextLevel

  KEYS: 1-9 place, Backspace erase, N notes,
        P pause, Ctrl+Z undo, Arrows move
  ═══════════════════════════════════════════
*/

/* ═══ STATE ═════════════════════════════ */
const Game = {
  puzzle: null, solution: null, board: null, notes: null,
  selected: null, noteMode: false, difficulty: 'easy',
  mistakes: 0, score: 0, seconds: 0, done: false,
  history: [], hint: null, conflicts: [], checkOn: true,
  streak: 0, techUsed: {}, tab: 'tutor', lessonIdx: 0,
  message: null, timer: null, paused: false
};

const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert'];

/* ═══ HELPERS ═══════════════════════════ */

function setMessage(icon, title, body) { Game.message = { icon, title, body }; }

function fmt(s) { return String((s/60)|0).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }

/* Remove invalid notes from affected row/col/box after placement */
function clearNotes(row, col) {
  const br = 3*((row/3)|0), bc = 3*((col/3)|0);
  const checked = new Set();
  const cells = [];
  for (let i = 0; i < 9; i++) { cells.push(row*9+i); cells.push(i*9+col); }
  for (let r = br; r < br+3; r++) for (let c = bc; c < bc+3; c++) cells.push(r*9+c);

  for (const idx of cells) {
    if (checked.has(idx)) continue;
    checked.add(idx);
    const r = (idx/9)|0, c = idx%9;
    if (Game.board[r][c] || !Game.notes[r][c].size) continue;
    const valid = Engine.candidates(Game.board, r, c);
    for (const n of [...Game.notes[r][c]]) {
      if (!valid.has(n)) Game.notes[r][c].delete(n);
    }
  }
}

function checkWin() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (Game.board[r][c] !== Game.solution[r][c]) return false;
  return true;
}

function triggerWin() {
  Game.done = true;
  clearInterval(Game.timer);
  document.getElementById('wP').textContent = 'Time: '+fmt(Game.seconds)+' · Score: '+Game.score+' · Mistakes: '+Game.mistakes;
  document.getElementById('wM').classList.add('sh');
  setMessage('🎉', 'Complete!', 'Solved in ' + fmt(Game.seconds) + '!');
  playSound('win');
}

/* ═══ ANIMATIONS ════════════════════════ */

function animateCell(row, col, cls, ms) {
  requestAnimationFrame(() => {
    const cell = document.querySelectorAll('.c')[row * 9 + col];
    if (!cell) return;
    cell.classList.add(cls);
    setTimeout(() => cell.classList.remove(cls), ms);
  });
}

function showScorePop(row, col, text, colour) {
  const brd = document.getElementById('brd');
  const sz = brd.offsetWidth / 9;
  const rc = brd.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'score-pop';
  p.textContent = text;
  p.style.color = colour;
  p.style.left = (rc.left + col*sz + sz/2) + 'px';
  p.style.top = (rc.top + row*sz) + 'px';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1000);
}

function flashBoard() {
  const b = document.getElementById('brd');
  b.classList.add('err-flash');
  setTimeout(() => b.classList.remove('err-flash'), 500);
}

function glowProgress() {
  const b = document.getElementById('pF');
  b.classList.add('glow');
  setTimeout(() => b.classList.remove('glow'), 600);
}

function checkCompletedUnits(row, col) {
  const cells = document.querySelectorAll('.c');
  const flashUnit = (indices) => {
    for (const i of indices) {
      const cell = cells[i];
      if (cell) { cell.classList.add('uf'); setTimeout(() => cell.classList.remove('uf'), 800); }
    }
  };

  /* Row */
  let done = true;
  for (let c = 0; c < 9; c++) if (!Game.board[row][c] || Game.board[row][c] !== Game.solution[row][c]) { done = false; break; }
  if (done) { flashUnit(Array.from({length:9}, (_,c) => row*9+c)); playSound('rowDone'); }
  const rowDone = done;

  /* Column */
  done = true;
  for (let r = 0; r < 9; r++) if (!Game.board[r][col] || Game.board[r][col] !== Game.solution[r][col]) { done = false; break; }
  if (done) { flashUnit(Array.from({length:9}, (_,r) => r*9+col)); if (!rowDone) playSound('rowDone'); }

  /* Box */
  const br = 3*((row/3)|0), bc = 3*((col/3)|0);
  done = true;
  for (let r = br; r < br+3 && done; r++)
    for (let c = bc; c < bc+3; c++)
      if (!Game.board[r][c] || Game.board[r][c] !== Game.solution[r][c]) { done = false; break; }
  if (done) {
    const idx = [];
    for (let r = br; r < br+3; r++) for (let c = bc; c < bc+3; c++) idx.push(r*9+c);
    flashUnit(idx);
    playSound('boxDone');
  }
}

/* ═══ SOUND ═════════════════════════════ */

const Sound = { ctx: null, enabled: true };

function initAudio() {
  if (!Sound.ctx) try { Sound.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { Sound.enabled = false; }
}

/* Play tone(s): [{freq, dur, type, delay}] */
function tone(notes, vol) {
  if (!Sound.enabled) return;
  initAudio();
  if (!Sound.ctx) return;
  const ctx = Sound.ctx, now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.15;
  master.connect(ctx.destination);
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type || 'sine';
    const t = now + (n.delay || 0);
    if (n.freqEnd) { osc.frequency.setValueAtTime(n.freq, t); osc.frequency.exponentialRampToValueAtTime(n.freqEnd, t + n.dur); }
    else osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(vol || 0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
    osc.connect(gain); gain.connect(master);
    osc.start(t); osc.stop(t + n.dur);
  }
}

function playSound(name) {
  if (!Sound.enabled) return;
  const S = {
    tap:     [{ freq:800, dur:0.05 }],
    correct: [{ freq:520, dur:0.15 }, { freq:660, dur:0.15, delay:0.08 }],
    wrong:   [{ freq:280, freqEnd:180, dur:0.25, type:'sawtooth' }],
    rowDone: [{ freq:220, dur:0.2 }, { freq:262, dur:0.2, delay:0.08 }, { freq:330, dur:0.2, delay:0.16 }],
    boxDone: [{ freq:659, dur:0.18 }, { freq:831, dur:0.18, delay:0.07 }, { freq:988, dur:0.18, delay:0.14 }],
    win:     [{ freq:523, dur:0.4 }, { freq:659, dur:0.4, delay:0.12 }, { freq:784, dur:0.4, delay:0.24 }, { freq:1047, dur:0.4, delay:0.36 }]
  };
  if (S[name]) tone(S[name], name === 'tap' ? 0.08 : name === 'wrong' ? 0.08 : 0.1);
}

function toggleSound() { Sound.enabled = !Sound.enabled; Render.all(); }

/* Timer gradually warms from grey to gold */
function updateTimerColour() {
  const el = document.getElementById('xT');
  if (!el || Game.paused || Game.done) { if (el) el.style.color = ''; return; }
  const p = Math.min(Game.seconds, 300) / 300;
  el.style.color = `rgb(${138+p*74|0},${123+p*37|0},${106-p*26|0})`;
}

/* ═══ GAME ACTIONS ══════════════════════ */

function startTimer() {
  Game.timer = setInterval(() => {
    Game.seconds++;
    document.getElementById('xT').textContent = fmt(Game.seconds);
    updateTimerColour();
  }, 1000);
}

function newGame(difficulty) {
  clearInterval(Game.timer);
  Game.difficulty = difficulty;
  const r = Engine.generate(difficulty);
  Game.puzzle = r.puzzle; Game.solution = r.solution;
  Game.board = r.puzzle.map(r => [...r]);
  Game.notes = Array.from({length:9}, () => Array.from({length:9}, () => new Set()));
  Object.assign(Game, { selected:null, noteMode:false, mistakes:0, score:0, seconds:0,
    done:false, history:[], hint:null, conflicts:[], techUsed:{}, streak:0, paused:false });
  setMessage('🎯', 'Ready', difficulty[0].toUpperCase()+difficulty.slice(1)+' puzzle. Tap a cell or Show Move.');
  startTimer();
  document.getElementById('wM').classList.remove('sh');
  Render.all();
}

function nextLevel() {
  newGame(DIFFICULTIES[Math.min(DIFFICULTIES.indexOf(Game.difficulty)+1, 4)]);
}

function selectCell(row, col) {
  if (Game.paused) return;
  Game.selected = [row, col]; Game.hint = null; Game.conflicts = [];
  playSound('tap');

  if (Game.puzzle[row][col]) {
    setMessage('📌', 'Given: '+Game.board[row][col], 'Constrains row '+(row+1)+', col '+(col+1)+', and its box.');
  } else if (Game.board[row][col]) {
    const ok = Game.board[row][col] === Game.solution[row][col];
    setMessage(ok?'✅':'⚠️', ok?'Correct':'Wrong: '+Game.board[row][col], ok?'Correct!':'Not right. Erase and check candidates.');
  } else {
    const c = Engine.candidates(Game.board, row, col);
    if (!c.size) setMessage('🚫','No Candidates','Check for duplicates.');
    else if (c.size===1) setMessage('💡','Naked Single!','Only '+[...c][0]+' can go here!');
    else setMessage('🔍', c.size+' Candidates', 'Possible: '+[...c].join(', ')+'. Look for Hidden Singles.');
  }
  Render.all();
}

function placeNumber(n) {
  if (!Game.selected || Game.done || Game.paused) return;
  const [row, col] = Game.selected;
  if (Game.puzzle[row][col]) return;

  /* ── Note mode ────────────────────── */
  if (Game.noteMode) {
    /* Remove: always allowed */
    if (Game.notes[row][col].has(n)) {
      Game.history.push({ type:'note', r:row, c:col, prev:new Set(Game.notes[row][col]) });
      Game.notes[row][col].delete(n);
      Render.all();
      return;
    }
    /* Add: validate first */
    if (!Engine.candidates(Game.board, row, col).has(n)) {
      playSound('wrong'); flashBoard();
      setMessage('🚫', n+' Already Present', n+' is already in this row, column, or box.');
      Render.all();
      return;
    }
    Game.history.push({ type:'note', r:row, c:col, prev:new Set(Game.notes[row][col]) });
    Game.notes[row][col].add(n);
    Render.all();
    return;
  }

  /* ── Normal mode ──────────────────── */
  Game.history.push({ type:'place', r:row, c:col, val:Game.board[row][col], notes:new Set(Game.notes[row][col]) });
  const savedNotes = new Set(Game.notes[row][col]);
  Game.board[row][col] = n;
  Game.notes[row][col] = new Set();

  /* Wrong */
  if (n !== Game.solution[row][col]) {
    Game.conflicts = Engine.conflicts(Game.board, row, col, n);
    Game.mistakes++; Game.score = Math.max(0, Game.score-15); Game.streak = 0;
    Game.board[row][col] = 0;
    const cands = Engine.candidates(Game.board, row, col);
    Game.board[row][col] = n;

    const reasons = [];
    Game.conflicts.forEach(([cr,cc]) => {
      if (cr===row) reasons.push('col '+(cc+1));
      else if (cc===col) reasons.push('row '+(cr+1));
      else reasons.push('same box');
    });
    setMessage('❌', n+' Cannot Go Here', 'Conflicts with '+reasons.slice(0,2).join(' and ')+'.\nPossible: '+[...cands].join(', '));
    Render.all(); flashBoard(); showScorePop(row, col, '-15', '#c45c4a'); playSound('wrong');
    setTimeout(() => { Game.board[row][col]=0; Game.notes[row][col]=savedNotes; Game.conflicts=[]; Render.all(); }, 2000);
    return;
  }

  /* Correct */
  clearNotes(row, col);
  Game.streak++;
  const pts = Game.streak>=5 ? 25 : Game.streak>=3 ? 15 : 10;
  Game.score += pts;

  if (checkWin()) { triggerWin(); }
  else {
    const bonus = Game.streak>=5?' 🔥5+ streak!':Game.streak>=3?' ⚡3+ streak!':'';
    setMessage('✅', 'Correct!', n+' placed.'+bonus);
  }
  Render.all();
  animateCell(row, col, 'ok', 500);
  showScorePop(row, col, '+'+pts, '#6aad6a');
  glowProgress();
  checkCompletedUnits(row, col);
  playSound('correct');
}

function eraseCell() {
  if (!Game.selected || Game.paused) return;
  const [r,c] = Game.selected;
  if (Game.puzzle[r][c]) return;
  Game.history.push({ type:'erase', r, c, val:Game.board[r][c], notes:new Set(Game.notes[r][c]) });
  Game.board[r][c] = 0; Game.notes[r][c] = new Set();
  Render.all();
}

function undoMove() {
  if (!Game.history.length || Game.paused) return;
  const m = Game.history.pop();
  Game.board[m.r][m.c] = m.val || 0;
  if (m.notes) Game.notes[m.r][m.c] = m.notes;
  if (m.prev) Game.notes[m.r][m.c] = m.prev;
  Render.all();
}

function toggleNotes() {
  Game.noteMode = !Game.noteMode;
  document.getElementById('brd').classList.toggle('note-mode', Game.noteMode);
  Render.actions();
}
function toggleCheck() { Game.checkOn = !Game.checkOn; Render.all(); }

function togglePause() {
  if (Game.done) return;
  Game.paused = !Game.paused;
  if (Game.paused) { clearInterval(Game.timer); setMessage('⏸','Paused','Tap Resume to continue.'); }
  else { startTimer(); setMessage('▶️','Resumed','Keep going!'); }
  Render.all();
}

function autoNotes() {
  if (Game.paused) return;
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) if (!Game.board[r][c]) Game.notes[r][c]=Engine.candidates(Game.board,r,c);
  setMessage('📝','Notes Filled','Look for single-candidate cells!');
  Render.all();
}

function showHint() {
  if (Game.paused) return;
  const m = Hints.findMove(Game.board, Game.solution);
  if (!m) return;
  Game.hint = m; Game.selected = [m.row, m.col];
  Game.techUsed[m.technique] = (Game.techUsed[m.technique]||0) + 1;
  setMessage('💡', m.technique, m.explain+'\n\n📖 '+m.lesson);
  Render.all();
}

function applyHint() {
  if (!Game.hint || Game.paused) return;
  const {row,col,value} = Game.hint;
  Game.history.push({ type:'place', r:row, c:col, val:Game.board[row][col], notes:new Set(Game.notes[row][col]) });
  Game.board[row][col] = value; Game.notes[row][col] = new Set();
  clearNotes(row, col);
  Game.score += 5; Game.hint = null;
  if (checkWin()) triggerWin();
  Render.all();
}

/* ═══ KEYBOARD ══════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key==='p'||e.key==='P') { togglePause(); return; }
  if (Game.paused) return;
  if (e.key>='1'&&e.key<='9') { placeNumber(+e.key); return; }
  if (e.key==='Backspace'||e.key==='Delete') { eraseCell(); return; }
  if (e.key==='n'||e.key==='N') { toggleNotes(); return; }
  if (e.key==='z'&&(e.ctrlKey||e.metaKey)) { e.preventDefault(); undoMove(); return; }
  if (Game.selected) {
    const [r,c] = Game.selected;
    if (e.key==='ArrowUp') Game.selected=[Math.max(0,r-1),c];
    if (e.key==='ArrowDown') Game.selected=[Math.min(8,r+1),c];
    if (e.key==='ArrowLeft') Game.selected=[r,Math.max(0,c-1)];
    if (e.key==='ArrowRight') Game.selected=[r,Math.min(8,c+1)];
    Render.all();
  }
});

/* ═══ START ═════════════════════════════ */
newGame('easy');
