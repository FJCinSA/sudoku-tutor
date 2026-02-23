/*
  ═══════════════════════════════════════════════════
  RENDER.JS — UI Drawing
  ═══════════════════════════════════════════════════
  Reads Game state → writes DOM. Never mutates state.

  PUBLIC API
    Render.all()      — full redraw
    Render.actions()  — action buttons only
    Render.info()     — stats bar only
    Render.progress() — progress bar only
  ═══════════════════════════════════════════════════
*/
const Render = (function () {

  const $ = id => document.getElementById(id);

  /* Time formatter — render.js needs this independently of game.js load order */
  const fmt = s =>
    String((s / 60) | 0).padStart(2, '0') + ':' +
    String(s % 60).padStart(2, '0');

  /* ── Difficulty buttons ───────────────────────── */
  const DIFF_TIPS = {
    beginner: 'Beginner — 51 clues. Perfect for learning.',
    easy:     'Easy — 43 clues. Great for a relaxed solve.',
    medium:   'Medium — 35 clues. Scanning techniques needed.',
    hard:     'Hard — 29 clues. Hidden Singles required.',
    expert:   'Expert — 25 clues. Advanced techniques needed.'
  };

  function difficulty() {
    $('dB').innerHTML = ['beginner','easy','medium','hard','expert']
      .map(d => `<button class="dbtn${Game.difficulty===d?' on':''}"
        onclick="newGame('${d}')" title="${DIFF_TIPS[d]}">${d}</button>`)
      .join('');
  }

  /* ── Stats bar ────────────────────────────────── */
  function info() {
    $('xM').textContent = '❌ ' + Game.mistakes;
    $('xM').title = 'Mistakes (each costs 15 points)';
    $('xS').textContent = '⚡ ' + Game.score;
    $('xS').title = 'Score: +10 per cell, +25 for 5+ streak';
    const sk = Game.streak;
    $('xK').textContent = sk >= 3 ? '🔥 ' + sk : '';
    $('xK').title = sk >= 3 ? `${sk} in a row — bonus active!` : '';
    /* Timer text is also set here so Render.all() shows correct time immediately
       (the setInterval in startTimer updates it every second, but there is a 1s
       gap on new game if we do not also set it here) */
    $('xT').textContent = fmt(Game.seconds);
    $('xT').title = 'Time elapsed';
  }

  /* ── Progress bar ─────────────────────────────── */
  function progress() {
    if (!Game.puzzle) return;
    let filled = 0, total = 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!Game.puzzle[r][c]) {
          total++;
          if (Game.board[r][c] === Game.solution[r][c]) filled++;
        }
    const pct = total ? Math.round(filled / total * 100) : 100;
    $('pF').style.width = pct + '%';
    $('pF').title = `${filled} of ${total} cells solved (${pct}%)`;
  }

  /* ── Board (81 cells) ─────────────────────────── */
  function board() {
    const el = $('brd');
    el.innerHTML = '';
    const frag = document.createDocumentFragment();

    /* Paused: blank grid */
    if (Game.paused) {
      for (let i = 0; i < 81; i++) {
        const d = document.createElement('div');
        d.className = 'c';
        d.dataset.r = (i/9)|0;
        d.dataset.c = i%9;
        d.title = 'Game is paused';
        frag.appendChild(d);
      }
      el.appendChild(frag);
      return;
    }

    /* Pre-compute selection context once */
    const conflictSet = new Set(Game.conflicts.map(([r,c]) => r*9+c));
    const hintIdx     = Game.hint ? Game.hint.row*9 + Game.hint.col : -1;
    const sel         = Game.selected;
    const [selR, selC] = sel || [-1,-1];
    const selBR       = sel ? (selR/3)|0 : -1;
    const selBC       = sel ? (selC/3)|0 : -1;
    const selVal      = sel ? Game.board[selR][selC] : 0;
    const selOk       = sel && selVal && selVal === Game.solution[selR][selC];

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const idx     = r*9+c;
        const val     = Game.board[r][c];
        const isGiven = !!Game.puzzle[r][c];
        const div     = document.createElement('div');
        div.className = 'c';
        div.dataset.r = r;
        div.dataset.c = c;

        /* State flags */
        const isSel  = r===selR && c===selC;
        const isHL   = sel && !isSel && (r===selR || c===selC || ((r/3|0)===selBR && (c/3|0)===selBC));
        const isSame = !isSel && val && selVal===val && selOk && val===Game.solution[r][c];
        const isConf = conflictSet.has(idx);
        const isHint = idx===hintIdx;
        const isErr  = !isGiven && val && Game.checkOn && val!==Game.solution[r][c];

        /* Type class */
        if (isGiven) div.classList.add('gv');
        else if (val) div.classList.add('ip');

        /* Background class (priority order) */
        if      (isSel)  div.classList.add('sl');
        else if (isHint) div.classList.add('hc');
        else if (isConf) div.classList.add('cf');
        else if (isSame) div.classList.add('sm');
        else if (isHL)   div.classList.add('hl');

        if (isErr) div.classList.add('er');

        /* Tooltip */
        if (isGiven) {
          div.title = `R${r+1}C${c+1} — Given: ${val} (locked)`;
        } else if (val) {
          div.title = `R${r+1}C${c+1} — ${val===Game.solution[r][c]?'✓ Correct':'✗ Wrong'}: ${val}`;
        } else {
          const cands = Engine.candidates(Game.board, r, c);
          div.title = `R${r+1}C${c+1} — Candidates: ${[...cands].join(', ')||'none'}`;
        }

        /* Content */
        if (val) {
          div.textContent = val;
        } else if (Game.notes[r][c].size) {
          const grid = document.createElement('div');
          grid.className = 'nt';
          for (let n = 1; n <= 9; n++) {
            const s = document.createElement('span');
            s.textContent = Game.notes[r][c].has(n) ? n : '';
            grid.appendChild(s);
          }
          div.appendChild(grid);
        }

        div.onclick = () => selectCell(r, c);
        frag.appendChild(div);
      }
    }
    el.appendChild(frag);
  }

  /* ── Action buttons ───────────────────────────── */
  function actions() {
    const {noteMode, checkOn, paused} = Game;
    const soundOn = Game.soundOn;

    const btns = [
      { l: noteMode  ? '✏ Notes ON'   : '✏ Notes',    on: noteMode,  f: 'toggleNotes()',
        tip: noteMode ? 'Notes ON — tap a number to pencil in a candidate. Tap again to remove.'
                      : 'Notes OFF — click to enable pencil-note mode. (Keyboard: N)' },
      { l: '✕ Erase',  on: false, f: 'eraseCell()',
        tip: 'Clear the selected cell — removes a digit or all notes. (Keyboard: Backspace)' },
      { l: '↩ Undo',   on: false, f: 'undoMove()',
        tip: 'Undo the last placement, erasure, or note change. (Keyboard: Ctrl+Z)' },
      { l: '📝 Auto',  on: false, f: 'autoNotes()',
        tip: 'Fill all empty cells with their current valid candidates.' },
      { l: checkOn  ? '✓ Check ON'  : '✓ Check OFF', on: checkOn,   f: 'toggleCheck()',
        tip: checkOn  ? 'Instant feedback ON — wrong digits shown in red. Click to turn off.'
                      : 'Instant feedback OFF — click to turn on.' },
      { l: soundOn  ? '🔊 Sound'    : '🔇 Mute',     on: soundOn,   f: 'toggleSound()',
        tip: soundOn  ? 'Sound ON — click to mute.' : 'Sound OFF — click to enable.' },
      { l: paused   ? '▶ Resume'    : '⏸ Pause',     on: paused,    f: 'togglePause()',
        tip: paused   ? 'Resume the game. (Keyboard: P)' : 'Pause and hide the board. (Keyboard: P)' }
    ];

    $('act').innerHTML = btns.map(b =>
      `<button class="ab${b.on?' on':''}" onclick="${b.f}" title="${b.tip}">${b.l}</button>`
    ).join('');
  }

  /* ── Number pad ───────────────────────────────── */
  function numpad() {
    let h = '';
    for (let n = 1; n <= 9; n++) {
      let placed = 0;
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (Game.board[r][c] === n) placed++;
      const done = placed >= 9;
      h += `<button class="nb${done?' dn':''}" onclick="placeNumber(${n})"
        title="${done ? `${n} — all 9 placed ✓` : `Place ${n} — ${placed}/9 placed (Keyboard: ${n})`}"
        >${n}<small>${placed}/9</small></button>`;
    }
    $('nup').innerHTML = h;
  }

  /* ── Teaching panel tabs ──────────────────────── */
  function tabs() {
    const TAB_DEFS = [
      { id:'tutor',      label:'💡 Tutor',      tip:'Real-time hints and explanations.' },
      { id:'lessons',    label:'📖 Lessons',    tip:'Structured learning path.' },
      { id:'techniques', label:'🧩 Techniques', tip:'Solving technique reference.' }
    ];
    $('tbs').innerHTML = TAB_DEFS.map(t =>
      `<button class="tb${Game.tab===t.id?' on':''}"
        onclick="Game.tab='${t.id}';Render.all()" title="${t.tip}">${t.label}</button>`
    ).join('');
  }

  /* ── Teaching panel body ──────────────────────── */

  /* Static data — defined once, not rebuilt every render */
  const LESSONS = [
    { title:'The Rules',
      body: 'Every row, column, and 3×3 box must contain 1-9 exactly once. No repeats.',
      tip:  'Start Easy. Tap a cell — the Tutor shows its candidates.' },
    { title:'Scanning',
      body: 'Pick a digit that appears often. Trace its row and column to find where it must go in each box.',
      tip:  'Find the digit closest to 9/9 — very few cells can hold it.' },
    { title:'Naked Singles',
      body: 'A cell where 8 digits are blocked by its row, column, and box — only one candidate left.',
      tip:  'Tap Auto Notes, then look for cells with a single pencil digit.' },
    { title:'Hidden Singles',
      body: 'A digit that fits only one cell in a unit, even if that cell has other candidates.',
      tip:  'Tap Show Move — the Tutor explains every Hidden Single it finds.' },
    { title:'Notes Mastery',
      body: 'Keep pencil notes current. Place a digit → erase it from all peers. Auto Notes and auto-clear do this for you.',
      tip:  'Enable Notes (✏), tap Auto Notes to start with a full candidate map.' }
  ];

  const TECHNIQUES = [
    { name:'Naked Single',  level:'Beginner',     icon:'①',
      desc:'Only one candidate left in a cell.',
      how: 'Check row, col, box. If 8 digits taken, the last one is the answer.',
      ex:  'Row has 1-8 → cell must be 9.' },
    { name:'Hidden Single', level:'Beginner',     icon:'②',
      desc:'A digit fits only one cell within a unit.',
      how: 'Pick a missing digit. Scan the unit — if it fits only one cell, place it.',
      ex:  '7 is blocked from 8 cells in a row — only one remains.' },
    { name:'Naked Pair',    level:'Intermediate', icon:'③',
      desc:'Two cells share the same two candidates — those digits are locked to those cells.',
      how: 'Find matching pairs. Remove both digits from all other cells in the unit.',
      ex:  'Two cells show {3,7} → remove 3 and 7 from the rest of the row.' },
    { name:'Pointing Pair', level:'Intermediate', icon:'④',
      desc:'A digit in a box is restricted to one row or column — eliminate it from that line outside the box.',
      how: 'If a digit only fits in one row within a box, remove it from that row in other boxes.',
      ex:  '5 only in row 2 of box 1 → remove 5 from row 2 in boxes 2 and 3.' },
    { name:'X-Wing',        level:'Advanced',     icon:'⑤',
      desc:'A digit in exactly 2 cells of 2 rows forms a rectangle — eliminate it from those columns.',
      how: 'Find the digit in 2 cells per row across 2 rows, same columns. Remove from those columns elsewhere.',
      ex:  '4 in cols 2 & 7 of rows 3 & 8 → remove 4 from cols 2 & 7 everywhere else.' }
  ];

  const LEVEL_STYLE = {
    Beginner:     { color:'var(--ok)',  bg:'#68ad6818' },
    Intermediate: { color:'var(--ac)',  bg:'#d4a05018' },
    Advanced:     { color:'var(--er)',  bg:'#c45c4a18' }
  };

  function tabBody() {
    const el = $('tbd');

    if (Game.tab === 'tutor') {
      let h = '';
      if (Game.message) {
        h += `<span class="mi">${Game.message.icon}</span>
              <h3 class="mt">${Game.message.title}</h3>
              <p class="mb">${Game.message.body}</p>`;
      }
      h += `<div style="margin-top:12px">
        <button class="hb ha" onclick="showHint()"
          title="Highlight the easiest available move with a full explanation.">💡 Show Move</button>`;
      if (Game.hint) {
        h += `<button class="hb hg" onclick="applyHint()"
          title="Place ${Game.hint.value} at R${Game.hint.row+1}C${Game.hint.col+1} automatically.">
          Place ${Game.hint.value}</button>`;
      }
      h += '</div>';
      if (Object.keys(Game.techUsed).length) {
        h += '<div class="tu"><h4>Techniques Used This Puzzle</h4>';
        for (const [k,v] of Object.entries(Game.techUsed))
          h += `<div style="font-size:.72rem;color:var(--mu);margin-top:3px">${k}: <span style="color:var(--ac)">${v}×</span></div>`;
        h += '</div>';
      }
      el.innerHTML = h;

    } else if (Game.tab === 'lessons') {
      let h = '<h3 style="font-family:Georgia,serif;font-size:.95rem;color:var(--ac);margin:0 0 10px">Learning Path</h3>';
      LESSONS.forEach((l, i) => {
        const on = Game.lessonIdx === i;
        h += `<div class="li${on?' on':''}" onclick="Game.lessonIdx=${i};Render.all()" title="Expand lesson ${i+1}">
          <h4>${i+1}. ${l.title}</h4>
          ${on ? `<p>${l.body}</p><div class="lt">▶ Try: ${l.tip}</div>` : ''}
        </div>`;
      });
      h += `<div class="us"><h4>🔒 Advanced Lessons</h4>
        <p>Unlock Naked Pairs, X-Wings, Swordfish and more.</p>
        <button title="Upgrade for advanced lessons">Upgrade to Pro</button></div>`;
      el.innerHTML = h;

    } else {
      let h = '<h3 style="font-family:Georgia,serif;font-size:.95rem;color:var(--ac);margin:0 0 10px">Technique Library</h3>';
      TECHNIQUES.forEach((t, i) => {
        const {color, bg} = LEVEL_STYLE[t.level];
        h += `<details>
          <summary title="${t.level} technique">
            <span>${t.icon}</span>
            <span style="flex:1">${t.name}</span>
            <span class="tg" style="color:${color};background:${bg}">${t.level}</span>
          </summary>
          <div class="td">
            <p style="margin:6px 0;color:var(--gv)">${t.desc}</p>
            <div class="tx" style="border-left:3px solid var(--ac)">
              <strong style="color:var(--ac)">How to use</strong>
              <p style="margin:3px 0 0">${t.how}</p>
            </div>
            <div class="tx" style="border-left:3px solid var(--ok)">
              <strong style="color:var(--ok)">Example</strong>
              <p style="margin:3px 0 0">${t.ex}</p>
            </div>
            ${i >= 2 ? '<div style="margin-top:7px;padding:5px 9px;background:#d4a05012;border-radius:4px;font-size:.65rem;color:var(--ac);text-align:center">🔒 Interactive practice in Pro</div>' : ''}
          </div></details>`;
      });
      el.innerHTML = h;
    }
  }

  /* ── Full redraw ──────────────────────────────── */
  function all() {
    difficulty();
    info();
    progress();
    board();
    actions();
    numpad();
    tabs();
    tabBody();
    $('brd').classList.toggle('note-mode', Game.noteMode);
  }

  return { all, actions, info, progress };
})();
