/*
  ═══════════════════════════════════════════
  RENDER.JS — UI Drawing
  ═══════════════════════════════════════════
  Reads Game state, writes to DOM. Never changes state.

  PUBLIC API:
    Render.all()     — redraw everything
    Render.actions() — just the action buttons
  ═══════════════════════════════════════════
*/
const Render = (function () {

  const $ = id => document.getElementById(id);

  /* ─── Difficulty Buttons ──────────────── */
  function difficulty() {
    $('dB').innerHTML = ['beginner','easy','medium','hard','expert'].map(d =>
      `<button class="dbtn${Game.difficulty===d?' on':''}" onclick="newGame('${d}')">${d}</button>`
    ).join('');
  }

  /* ─── Stats Bar ───────────────────────── */
  function info() {
    const fmt = s => String((s/60)|0).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
    $('xM').textContent = '❌ ' + Game.mistakes;
    $('xS').textContent = '⚡ ' + Game.score;
    $('xK').textContent = Game.streak >= 3 ? '🔥' + Game.streak : '';
    $('xT').textContent = fmt(Game.seconds);
  }

  /* ─── Progress Bar ────────────────────── */
  function progress() {
    if (!Game.puzzle) return;
    let filled = 0, total = 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!Game.puzzle[r][c]) { total++; if (Game.board[r][c] === Game.solution[r][c]) filled++; }
    $('pF').style.width = (total ? Math.round(filled/total*100) : 100) + '%';
  }

  /* ─── Board (81 cells) ────────────────── */
  function board() {
    const el = $('brd');
    el.innerHTML = '';

    /* Paused: blank grid */
    if (Game.paused) {
      for (let i = 0; i < 81; i++) {
        const d = document.createElement('div');
        d.className = 'c';
        d.dataset.r = (i/9)|0;
        d.dataset.c = i%9;
        el.appendChild(d);
      }
      return;
    }

    /* Pre-compute values that don't change per cell */
    const conflictSet = new Set(Game.conflicts.map(([r,c]) => r*9+c));
    const hintIdx = Game.hint ? Game.hint.row * 9 + Game.hint.col : -1;
    const sel = Game.selected;
    const selR = sel ? sel[0] : -1, selC = sel ? sel[1] : -1;
    const selBR = sel ? (selR/3)|0 : -1, selBC = sel ? (selC/3)|0 : -1;
    const selVal = sel ? Game.board[selR][selC] : 0;
    const selCorrect = sel && selVal && selVal === Game.solution[selR][selC];

    const frag = document.createDocumentFragment();

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const idx = r * 9 + c;
        const val = Game.board[r][c];
        const isGiven = !!Game.puzzle[r][c];
        const cell = document.createElement('div');
        cell.className = 'c';
        cell.dataset.r = r;
        cell.dataset.c = c;

        /* State flags */
        const isSel = r === selR && c === selC;
        const isHL = sel && (r === selR || c === selC || ((r/3|0) === selBR && (c/3|0) === selBC));
        const isSame = !isSel && val && selVal === val && selCorrect && val === Game.solution[r][c];
        const isConf = conflictSet.has(idx);
        const isHint = idx === hintIdx;
        const isErr = !isGiven && val && Game.checkOn && val !== Game.solution[r][c];

        /* Text colour */
        if (isGiven)    cell.classList.add('gv');
        else if (val)   cell.classList.add('ip');

        /* Background (priority order) */
        if (isSel)       cell.classList.add('sl');
        else if (isHint) cell.classList.add('hc');
        else if (isConf) cell.classList.add('cf');
        else if (isSame) cell.classList.add('sm');
        else if (isHL)   cell.classList.add('hl');

        if (isErr) cell.classList.add('er');

        /* Content */
        if (val) {
          cell.textContent = val;
        } else if (Game.notes[r][c].size) {
          const g = document.createElement('div');
          g.className = 'nt';
          for (let n = 1; n <= 9; n++) {
            const s = document.createElement('span');
            s.textContent = Game.notes[r][c].has(n) ? n : '';
            g.appendChild(s);
          }
          cell.appendChild(g);
        }

        cell.onclick = () => selectCell(r, c);
        frag.appendChild(cell);
      }
    }
    el.appendChild(frag);
  }

  /* ─── Action Buttons ──────────────────── */
  function actions() {
    $('act').innerHTML = [
      { l: Game.noteMode ? '✏ ON' : '✏ Notes', on: Game.noteMode, f: 'toggleNotes()' },
      { l: '✕ Erase',  on: false,        f: 'eraseCell()' },
      { l: '↩ Undo',   on: false,        f: 'undoMove()' },
      { l: '📝 Auto',   on: false,        f: 'autoNotes()' },
      { l: Game.checkOn ? '✓ ON' : '✓ Off', on: Game.checkOn, f: 'toggleCheck()' },
      { l: Sound.enabled ? '🔊' : '🔇',  on: Sound.enabled, f: 'toggleSound()' },
      { l: Game.paused ? '▶ Resume' : '⏸ Pause', on: Game.paused, f: 'togglePause()' }
    ].map(b => `<button class="ab${b.on?' on':''}" onclick="${b.f}">${b.l}</button>`).join('');
  }

  /* ─── Number Pad ──────────────────────── */
  function numpad() {
    let h = '';
    for (let n = 1; n <= 9; n++) {
      let ct = 0;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (Game.board[r][c]===n) ct++;
      h += `<button class="nb${ct>=9?' dn':''}" onclick="placeNumber(${n})">${n}<small>${ct}/9</small></button>`;
    }
    $('nup').innerHTML = h;
  }

  /* ─── Teaching Panel: Tabs ────────────── */
  function tabs() {
    $('tbs').innerHTML = [
      { id:'tutor', l:'💡 Tutor' }, { id:'lessons', l:'📖 Lessons' }, { id:'techniques', l:'🧩 Techniques' }
    ].map(t => `<button class="tb${Game.tab===t.id?' on':''}" onclick="Game.tab='${t.id}';Render.all()">${t.l}</button>`).join('');
  }

  /* ─── Teaching Panel: Body ────────────── */
  function tabBody() {
    const el = $('tbd');

    if (Game.tab === 'tutor') {
      let h = '';
      if (Game.message) {
        h += `<div class="mi">${Game.message.icon}</div><h3 class="mt">${Game.message.title}</h3><p class="mb">${Game.message.body}</p>`;
      }
      h += '<div style="margin-top:12px"><button class="hb ha" onclick="showHint()">💡 Show Move</button>';
      if (Game.hint) h += `<button class="hb hg" onclick="applyHint()">Place ${Game.hint.value}</button>`;
      h += '</div>';
      if (Object.keys(Game.techUsed).length) {
        h += '<div class="tu"><h4>Techniques Used</h4>';
        for (const [k,v] of Object.entries(Game.techUsed))
          h += `<div style="font-size:.72rem;color:var(--mu)">${k}: <span style="color:var(--ac)">${v}×</span></div>`;
        h += '</div>';
      }
      el.innerHTML = h;

    } else if (Game.tab === 'lessons') {
      const L = [
        { t:'The Rules',     b:'Every row, column, and 3×3 box must contain 1–9 exactly once.', p:'Start with Easy and tap cells.' },
        { t:'Scanning',      b:'Pick a number that appears often. Scan for where remaining copies must go.', p:'Start with the number nearest 9/9.' },
        { t:'Naked Singles',  b:'Eliminate 8 candidates → the last one is correct. Use Auto Notes.', p:'Auto Notes → look for single-candidate cells.' },
        { t:'Hidden Singles', b:'If a number can only go in one cell within a unit, it belongs there.', p:'Show Move reveals these.' },
        { t:'Notes Mastery',  b:'Track candidates. Update as you place numbers.', p:'Toggle Notes mode to pencil in.' }
      ];
      let h = '<h3 style="font-family:Georgia,serif;font-size:.95rem;color:var(--ac);margin:0 0 10px">Learning Path</h3>';
      L.forEach((l,i) => {
        const on = Game.lessonIdx === i;
        h += `<div class="li${on?' on':''}" onclick="Game.lessonIdx=${i};Render.all()"><h4>${i+1}. ${l.t}</h4>`;
        if (on) h += `<p style="font-size:.75rem;line-height:1.55;color:var(--mu);margin:4px 0">${l.b}</p><div class="lt">▶ ${l.p}</div>`;
        h += '</div>';
      });
      h += '<div class="us"><h4>🔒 Advanced Lessons</h4><p>Unlock Naked Pairs, X-Wings, Swordfish and more.</p><button>Upgrade to Pro</button></div>';
      el.innerHTML = h;

    } else {
      const T = [
        { n:'Naked Single',  d:'Beginner',     i:'①', ds:'Only one candidate left in a cell.',                             hw:'Check row, col, box. If 8 taken, last is the answer.',                        ex:'Row has 1-8 → cell must be 9.' },
        { n:'Hidden Single', d:'Beginner',     i:'②', ds:'A number fits in only one cell in a unit.',                      hw:'Pick a missing number, scan the unit.',                                       ex:'7 can only go in one cell → place it.' },
        { n:'Naked Pair',    d:'Intermediate', i:'③', ds:'Two cells with same two candidates lock those numbers.',          hw:'Find matching pairs, eliminate from other cells.',                             ex:'{3,7} in two cells → remove 3,7 elsewhere.' },
        { n:'Pointing Pair', d:'Intermediate', i:'④', ds:'Candidate restricted to one row in a box → eliminate elsewhere.', hw:'If number only in one row within a box, remove from that row in other boxes.', ex:'5 only in row 1 of box → remove elsewhere.' },
        { n:'X-Wing',        d:'Advanced',     i:'⑤', ds:'Candidate in exactly 2 cells in 2 rows, same columns.',          hw:'Aligned positions → eliminate from those columns.',                            ex:'4 in cols 2,7 of rows 3,8 → remove 4 elsewhere.' }
      ];
      let h = '<h3 style="font-family:Georgia,serif;font-size:.95rem;color:var(--ac);margin:0 0 10px">Technique Library</h3>';
      T.forEach((t,i) => {
        const co = t.d==='Beginner'?'var(--ok)':t.d==='Intermediate'?'var(--ac)':'var(--er)';
        const bg = t.d==='Beginner'?'#6aad6a18':t.d==='Intermediate'?'#d4a05018':'#c45c4a18';
        h += `<details><summary><span>${t.i}</span><span style="flex:1">${t.n}</span><span class="tg" style="color:${co};background:${bg}">${t.d}</span></summary>`;
        h += `<div class="td"><p style="margin:6px 0;color:var(--gv)">${t.ds}</p>`;
        h += `<div class="tx" style="border-left:3px solid var(--ac)"><strong style="color:var(--ac)">How to use</strong><p style="margin:3px 0 0">${t.hw}</p></div>`;
        h += `<div class="tx" style="border-left:3px solid var(--ok)"><strong style="color:var(--ok)">Example</strong><p style="margin:3px 0 0">${t.ex}</p></div>`;
        if (i >= 2) h += '<div style="margin-top:6px;padding:4px 8px;background:#d4a05012;border-radius:4px;font-size:.65rem;color:var(--ac);text-align:center">🔒 Interactive practice in Pro</div>';
        h += '</div></details>';
      });
      el.innerHTML = h;
    }
  }

  function all() { difficulty(); info(); progress(); board(); actions(); numpad(); tabs(); tabBody(); $('brd').classList.toggle('note-mode', Game.noteMode); }
  return { all, actions };
})();
