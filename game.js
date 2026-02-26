/*
  ═══════════════════════════════════════════════════
  GAME.JS — State, Logic & Controls
  ═══════════════════════════════════════════════════
  Central hub. Owns state, handles all actions,
  wires Engine + Hints + Render together.

  LOAD ORDER: engine → hints → render → game (last)

  KEYBOARD
    1-9  place/note   Backspace  erase    N  notes
    P    pause        Ctrl+Z     undo     Arrows  navigate
  ═══════════════════════════════════════════════════
*/

/* ═══ STATE ═════════════════════════════════════ */
const Game = {
  puzzle: null, solution: null, board: null, notes: null,
  selected: null, noteMode: false, checkOn: true, paused: false,
  tab: 'tutor', lessonIdx: 0,
  difficulty: 'easy', mistakes: 0, score: 0, seconds: 0, streak: 0,
  hint: null, conflicts: [], message: null, techUsed: {},
  soundOn: true,   /* mirrors Sound.enabled — readable by render.js without load-order dependency */
  history: [], timer: null, wrongTimer: null, done: false
};

const DIFFICULTIES = ['beginner','easy','medium','hard','expert'];

/* ═══ SHARED HELPERS ════════════════════════════ */

/* Single fmt() — used by timer and win modal */
const fmt = s =>
  String((s/60)|0).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');

function setMessage(icon, title, body) {
  Game.message = { icon, title, body };
}

/* Remove invalid notes from all peers of (row, col) */
function clearNotes(row, col) {
  const br = Engine.boxOrigin(row), bc = Engine.boxOrigin(col);
  const seen = new Set();
  const peers = [];
  const add = (r,c) => { const k=r*9+c; if(!seen.has(k)){seen.add(k);peers.push([r,c]);} };

  for (let i = 0; i < 9; i++) { add(row,i); add(i,col); }
  for (let dr = 0; dr < 3; dr++)
    for (let dc = 0; dc < 3; dc++) add(br+dr, bc+dc);

  for (const [r,c] of peers) {
    if (Game.board[r][c] || !Game.notes[r][c].size) continue;
    const valid = Engine.candidates(Game.board, r, c);
    for (const n of [...Game.notes[r][c]])
      if (!valid.has(n)) Game.notes[r][c].delete(n);
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
  clearTimeout(Game.wrongTimer);   /* cancel any pending wrong-placement revert */
  document.getElementById('wP').textContent =
    `Time: ${fmt(Game.seconds)}  ·  Score: ${Game.score}  ·  Mistakes: ${Game.mistakes}`;
  document.getElementById('wM').classList.add('sh');
  setMessage('🎉','Puzzle Complete!',
    `Solved in ${fmt(Game.seconds)} with ${Game.mistakes} mistake${Game.mistakes!==1?'s':''}.`
  );
  playSound('win');
}

/* ═══ ANIMATIONS ════════════════════════════════ */

function animateCell(row, col, cls, ms) {
  requestAnimationFrame(() => {
    const cell = document.querySelectorAll('.c')[row*9+col];
    if (!cell) return;
    cell.classList.add(cls);
    setTimeout(() => cell.classList.remove(cls), ms);
  });
}

function showScorePop(row, col, text, colour) {
  const brd  = document.getElementById('brd');
  const sz   = brd.offsetWidth / 9;
  const rect = brd.getBoundingClientRect();
  const el   = document.createElement('div');
  el.className = 'score-pop';
  el.textContent = text;
  el.style.cssText = `color:${colour};left:${rect.left+col*sz+sz/2}px;top:${rect.top+row*sz}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function flashBoard() {
  const b = document.getElementById('brd');
  b.classList.add('err-flash');
  setTimeout(() => b.classList.remove('err-flash'), 450);
}

function glowProgress() {
  const el = document.getElementById('pF');
  el.classList.add('glow');
  setTimeout(() => el.classList.remove('glow'), 550);
}

function checkCompletedUnits(row, col) {
  const cells = document.querySelectorAll('.c');
  const flash = indices => {
    for (const i of indices) {
      const c = cells[i];
      if (c) { c.classList.add('uf'); setTimeout(()=>c.classList.remove('uf'),800); }
    }
  };

  /* Row */
  let rowDone = true;
  for (let c = 0; c < 9; c++)
    if (Game.board[row][c] !== Game.solution[row][c]) { rowDone=false; break; }
  if (rowDone) { flash(Array.from({length:9},(_,c)=>row*9+c)); playSound('rowDone'); }

  /* Column */
  let colDone = true;
  for (let r = 0; r < 9; r++)
    if (Game.board[r][col] !== Game.solution[r][col]) { colDone=false; break; }
  if (colDone) { flash(Array.from({length:9},(_,r)=>r*9+col)); if(!rowDone) playSound('rowDone'); }

  /* Box */
  const br = Engine.boxOrigin(row), bc = Engine.boxOrigin(col);
  let boxDone = true;
  for (let dr = 0; dr < 3 && boxDone; dr++)
    for (let dc = 0; dc < 3; dc++)
      if (Game.board[br+dr][bc+dc] !== Game.solution[br+dr][bc+dc]) { boxDone=false; break; }
  if (boxDone) {
    const idx = [];
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++) idx.push((br+dr)*9+(bc+dc));
    flash(idx);
    playSound('boxDone');
  }
}

/* ═══ SOUND ════════════════════════════════════ */
const Sound = { ctx: null, enabled: true };

function initAudio() {
  if (!Sound.ctx)
    try { Sound.ctx = new (window.AudioContext||window.webkitAudioContext)(); }
    catch(e) { Sound.enabled = false; }
}

function tone(notes) {
  if (!Sound.enabled) return;
  initAudio();
  if (!Sound.ctx) return;
  const ctx = Sound.ctx, now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.15;
  master.connect(ctx.destination);
  for (const n of notes) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const t = now + (n.delay || 0);
    osc.type = n.type || 'sine';
    if (n.freqEnd) {
      osc.frequency.setValueAtTime(n.freq, t);
      osc.frequency.exponentialRampToValueAtTime(n.freqEnd, t + n.dur);
    } else {
      osc.frequency.value = n.freq;
    }
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + n.dur);
  }
}

const SOUNDS = {
  tap:     [{freq:800,dur:.05}],
  correct: [{freq:520,dur:.15},{freq:660,dur:.15,delay:.08}],
  wrong:   [{freq:280,freqEnd:180,dur:.25,type:'sawtooth'}],
  rowDone: [{freq:220,dur:.2},{freq:262,dur:.2,delay:.08},{freq:330,dur:.2,delay:.16}],
  boxDone: [{freq:659,dur:.18},{freq:831,dur:.18,delay:.07},{freq:988,dur:.18,delay:.14}],
  win:     [{freq:523,dur:.4},{freq:659,dur:.4,delay:.12},{freq:784,dur:.4,delay:.24},{freq:1047,dur:.4,delay:.36}]
};

function playSound(name) {
  if (Sound.enabled && SOUNDS[name]) tone(SOUNDS[name]);
}

function toggleSound() { Sound.enabled = !Sound.enabled; Game.soundOn = Sound.enabled; Render.all(); }

/* ═══ TIMER ════════════════════════════════════ */
function startTimer() {
  Game.timer = setInterval(() => {
    Game.seconds++;
    /* Fast update — only touch the two timer elements */
    const el = document.getElementById('xT');
    if (el) {
      el.textContent = fmt(Game.seconds);
      const p = Math.min(Game.seconds, 300) / 300;
      el.style.color = `rgb(${138+p*74|0},${123+p*37|0},${106-p*26|0})`;
    }
  }, 1000);
}

/* ═══ GAME ACTIONS ══════════════════════════════ */

function newGame(difficulty) {
  clearInterval(Game.timer);
  const ov = document.getElementById('loadOverlay');
  if (ov) ov.classList.add('show');

  Engine.generateAsync(difficulty, ({puzzle, solution}) => {
    if (ov) ov.classList.remove('show');

    Game.difficulty = difficulty;
    Game.puzzle     = puzzle;
    Game.solution   = solution;
    Game.board      = puzzle.map(r=>[...r]);
    Game.notes      = Array.from({length:9},()=>Array.from({length:9},()=>new Set()));

    Object.assign(Game, {
      selected:null, noteMode:false, mistakes:0, score:0,
      seconds:0, done:false, history:[], hint:null,
      conflicts:[], techUsed:{}, streak:0, paused:false
    });

    setMessage('🎯','Ready!',
      `${difficulty[0].toUpperCase()+difficulty.slice(1)} puzzle loaded.\n` +
      `Tap a cell to begin, or press "Show Move" for your first hint.`
    );
    document.getElementById('wM').classList.remove('sh');
    startTimer();
    Render.all();
  });
}

function nextLevel() {
  newGame(DIFFICULTIES[Math.min(DIFFICULTIES.indexOf(Game.difficulty)+1, 4)]);
}

function selectCell(row, col) {
  if (Game.paused) return;
  Game.selected = [row, col];
  Game.hint = null;
  Game.conflicts = [];
  playSound('tap');

  const val     = Game.board[row][col];
  const isGiven = !!Game.puzzle[row][col];

  if (isGiven) {
    setMessage('📌',`Given: ${val}`,
      `This digit is printed in the puzzle — it cannot be changed.\n` +
      `It constrains row ${row+1}, col ${col+1}, and its 3×3 box.`
    );
  } else if (val) {
    const ok = val === Game.solution[row][col];
    setMessage(ok?'✅':'⚠️', ok?`Correct: ${val}`:`Wrong: ${val}`,
      ok ? `${val} is correctly placed. It locks this digit in its row, col, and box.`
         : `${val} is not correct here.\nTap Erase (or Backspace) to remove it.`
    );
  } else {
    const cands = Engine.candidates(Game.board, row, col);
    if (!cands.size) {
      setMessage('🚫','No Valid Candidates!',
        `R${row+1}C${col+1} has no legal digit — there is a mistake elsewhere.\n` +
        `Use Undo to backtrack.`
      );
    } else if (cands.size === 1) {
      setMessage('💡','Naked Single!',
        `Only ${[...cands][0]} can go in R${row+1}C${col+1}.\n` +
        `All other digits are blocked by its row, column, or box.\n` +
        `Tap ${[...cands][0]} on the number pad to place it.`
      );
    } else {
      setMessage('🔍',`${cands.size} Candidates`,
        `R${row+1}C${col+1} could hold: ${[...cands].join(', ')}\n\n` +
        `Tap "Show Move" for a full explanation of the next best move.`
      );
    }
  }
  Render.all();
}

function placeNumber(n) {
  if (!Game.selected || Game.done || Game.paused) return;
  const [row, col] = Game.selected;
  if (Game.puzzle[row][col]) return;

  /* ── Note mode ── */
  if (Game.noteMode) {
    if (Game.notes[row][col].has(n)) {
      Game.history.push({type:'note',r:row,c:col,prev:new Set(Game.notes[row][col])});
      Game.notes[row][col].delete(n);
    } else {
      if (!Engine.candidates(Game.board,row,col).has(n)) {
        playSound('wrong'); flashBoard();
        setMessage('🚫',`${n} Not Valid Here`,
          `${n} already exists in this cell's row, column, or box.`
        );
        Render.all();
        return;
      }
      Game.history.push({type:'note',r:row,c:col,prev:new Set(Game.notes[row][col])});
      Game.notes[row][col].add(n);
    }
    Render.all();
    return;
  }

  /* ── Normal placement ── */
  Game.history.push({type:'place',r:row,c:col,val:Game.board[row][col],notes:new Set(Game.notes[row][col])});
  const savedNotes = new Set(Game.notes[row][col]);
  Game.board[row][col] = n;
  Game.notes[row][col] = new Set();

  /* Wrong */
  if (n !== Game.solution[row][col]) {
    Game.conflicts = Engine.conflicts(Game.board, row, col, n);
    Game.mistakes++;
    Game.score = Math.max(0, Game.score-15);
    Game.streak = 0;

    /* Get candidates without the wrong digit */
    Game.board[row][col] = 0;
    const cands = Engine.candidates(Game.board, row, col);
    Game.board[row][col] = n;

    const reasons = Game.conflicts.slice(0,2).map(([cr,cc]) =>
      cr===row ? `col ${cc+1}` : cc===col ? `row ${cr+1}` : 'box'
    );
    setMessage('❌',`${n} Cannot Go Here`,
      `Conflicts with ${reasons.join(' and ')}.\n` +
      `Valid candidates: ${[...cands].join(', ')}\n\nPenalty: −15 points.`
    );
    Render.all(); flashBoard();
    showScorePop(row,col,'−15','#c45c4a');
    playSound('wrong');
    /* Track this timeout so newGame() can cancel it before it fires.
       Without this, starting a new game within 2 seconds of a wrong
       placement would overwrite the new puzzle's board with 0. */
    clearTimeout(Game.wrongTimer);
    Game.wrongTimer = setTimeout(() => {
      Game.board[row][col] = 0;
      Game.notes[row][col] = savedNotes;
      Game.conflicts = [];
      Render.all();
    }, 2000);
    return;
  }

  /* Correct */
  clearNotes(row, col);
  Game.streak++;
  const pts = Game.streak>=5 ? 25 : Game.streak>=3 ? 15 : 10;
  Game.score += pts;

  if (checkWin()) {
    Render.all();
    triggerWin();
  } else {
    const bonus = Game.streak>=5?' 🔥 5+ streak!':Game.streak>=3?' ⚡ 3+ streak!':'';
    setMessage('✅','Correct!',`${n} placed at R${row+1}C${col+1}.${bonus}`);
    Render.all();
  }

  animateCell(row,col,'ok',500);
  showScorePop(row,col,`+${pts}`,'#68ad68');
  glowProgress();
  checkCompletedUnits(row,col);
  playSound('correct');
  if (Game.streak>=3) animateCell(row,col,'sk',600);
}

function eraseCell() {
  if (!Game.selected || Game.paused) return;
  const [r,c] = Game.selected;
  if (Game.puzzle[r][c]) return;
  Game.history.push({type:'erase',r,c,val:Game.board[r][c],notes:new Set(Game.notes[r][c])});
  Game.board[r][c] = 0;
  Game.notes[r][c] = new Set();
  Render.all();
}

function undoMove() {
  if (!Game.history.length || Game.paused) return;
  const m = Game.history.pop();
  Game.board[m.r][m.c] = m.val || 0;
  if (m.notes) Game.notes[m.r][m.c] = m.notes;
  if (m.prev)  Game.notes[m.r][m.c] = m.prev;
  Render.all();
}

function toggleNotes() {
  Game.noteMode = !Game.noteMode;
  document.getElementById('brd').classList.toggle('note-mode', Game.noteMode);
  setMessage(Game.noteMode?'✏':'🔢', Game.noteMode?'Notes Mode ON':'Normal Mode',
    Game.noteMode
      ? 'Tap a cell then a number to pencil in a candidate. Tap again to erase.'
      : 'Tap a cell then a number to place a digit.'
  );
  Render.all();
}

function toggleCheck() {
  Game.checkOn = !Game.checkOn;
  setMessage(Game.checkOn?'✓':'○', Game.checkOn?'Check ON':'Check OFF',
    Game.checkOn ? 'Wrong digits highlighted in red instantly.'
                 : 'No instant feedback — you will find out at the end.'
  );
  Render.all();
}

function togglePause() {
  if (Game.done) return;
  Game.paused = !Game.paused;
  if (Game.paused) {
    clearInterval(Game.timer);
    setMessage('⏸','Paused','Board is hidden. Tap Resume (or P) to continue.');
  } else {
    startTimer();
    setMessage('▶️','Resumed','Good luck!');
  }
  Render.all();
}

function autoNotes() {
  if (Game.paused) return;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (!Game.board[r][c])
        Game.notes[r][c] = Engine.candidates(Game.board, r, c);
  setMessage('📝','Auto Notes Filled',
    'Every empty cell now shows its valid candidates.\n\n' +
    'Look for cells with only ONE candidate — those are Naked Singles!\n' +
    'Tap "Show Move" to find the easiest next move.'
  );
  Render.all();
}

function showHint() {
  if (Game.paused) return;
  const m = Hints.findMove(Game.board, Game.solution);
  if (!m) return;
  Game.hint = m;
  Game.selected = [m.row, m.col];
  Game.techUsed[m.technique] = (Game.techUsed[m.technique]||0) + 1;
  setMessage('💡', m.technique, m.explain + '\n\n📖 ' + m.lesson);
  Render.all();
}

function applyHint() {
  if (!Game.hint || Game.paused) return;
  const {row, col, value} = Game.hint;
  Game.history.push({type:'place',r:row,c:col,val:Game.board[row][col],notes:new Set(Game.notes[row][col])});
  Game.board[row][col] = value;
  Game.notes[row][col] = new Set();
  clearNotes(row, col);
  Game.score += 5;
  Game.hint = null;
  if (checkWin()) { Render.all(); triggerWin(); }
  else {
    setMessage('✅',`Placed ${value}`,`${value} placed at R${row+1}C${col+1} (+5 points).`);
    Render.all();
  }
}

function clearHint() {
  Game.hint = null;
  Render.all();
}

/* ═══ KEYBOARD ══════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key==='p'||e.key==='P') { togglePause(); return; }
  if (Game.paused) return;
  if (e.key>='1'&&e.key<='9') { placeNumber(+e.key); return; }
  if (e.key==='Backspace'||e.key==='Delete') { eraseCell(); return; }
  if (e.key==='n'||e.key==='N') { toggleNotes(); return; }
  if ((e.ctrlKey||e.metaKey)&&e.key==='z') { e.preventDefault(); undoMove(); return; }
  if (Game.selected) {
    const [r,c] = Game.selected;
    const mv = {ArrowUp:[Math.max(0,r-1),c],ArrowDown:[Math.min(8,r+1),c],ArrowLeft:[r,Math.max(0,c-1)],ArrowRight:[r,Math.min(8,c+1)]};
    if (mv[e.key]) { e.preventDefault(); Game.selected=mv[e.key]; Render.all(); }
  }
});

/* ═══ START ═════════════════════════════════════ */
newGame('easy');
