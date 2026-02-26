/*
  ═══════════════════════════════════════════════════
  HINTS.JS — Solving Techniques & Explanations
  ═══════════════════════════════════════════════════
  Finds the easiest available move and explains WHY.

  DEPENDS ON: engine.js

  TECHNIQUE PRIORITY
    1. Naked Single  — only one candidate in a cell
    2. Hidden Single — digit fits only one cell in a unit
    3. Fallback      — shows solution when advanced needed

  PUBLIC API
    Hints.findMove(board, solution) → hint | null

  HIGHLIGHT OBJECT (added to every hint)
    hint.highlight = {
      target : [r, c]          — the cell to place the digit (gold pulse)
      peers  : [[r,c], ...]    — cells that eliminate candidates (blue tint)
      unit   : [[r,c], ...]    — all cells in the relevant unit (light tint)
    }
  ═══════════════════════════════════════════════════
*/
const Hints = (function () {

  const gc  = Engine.candidates;
  const box = Engine.boxOrigin;

  /* Format a Set/array as sorted comma list */
  const fmt  = s => [...s].sort((a,b)=>a-b).join(', ');
  const cell = (r,c) => `R${r+1}C${c+1}`;
  const lines = (...args) => args.join('\n');

  /* ── HELPER: build peer lists for a cell ─────── */
  function buildPeers(r, c) {
    const br = box(r), bc = box(c);
    const row = [], col = [], bx = [];
    for (let i = 0; i < 9; i++) {
      if (i !== c) row.push([r, i]);
      if (i !== r) col.push([i, c]);
    }
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        if (!(br+dr === r && bc+dc === c)) bx.push([br+dr, bc+dc]);
    return { row, col, box: bx };
  }

  /* ── HELPER: all cells in a unit ─────────────── */
  function unitCells(type, idx) {
    const cells = [];
    if (type === 'row') {
      for (let c = 0; c < 9; c++) cells.push([idx, c]);
    } else if (type === 'col') {
      for (let r = 0; r < 9; r++) cells.push([r, idx]);
    } else {
      const br = ((idx / 3) | 0) * 3, bc = (idx % 3) * 3;
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
          cells.push([br+dr, bc+dc]);
    }
    return cells;
  }

  /* ── NAKED SINGLE ─────────────────────────────── */
  function findNakedSingle(board) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cands = gc(board, r, c);
        if (cands.size !== 1) continue;

        const val = [...cands][0];
        const rowN = new Set(), colN = new Set(), boxN = new Set();
        const br = box(r), bc = box(c);

        for (let i = 0; i < 9; i++) {
          if (board[r][i] && i !== c) rowN.add(board[r][i]);
          if (board[i][c] && i !== r) colN.add(board[i][c]);
        }
        for (let dr = 0; dr < 3; dr++)
          for (let dc = 0; dc < 3; dc++) {
            const v = board[br+dr][bc+dc];
            if (v && !(br+dr===r && bc+dc===c)) boxN.add(v);
          }

        /* Build highlight — peers that have digits blocking this cell */
        const peers = buildPeers(r, c);
        const blocking = [
          ...peers.row.filter(([pr,pc]) => board[pr][pc]),
          ...peers.col.filter(([pr,pc]) => board[pr][pc]),
          ...peers.box.filter(([pr,pc]) => board[pr][pc])
        ];
        /* Deduplicate */
        const seen = new Set();
        const blockUniq = blocking.filter(([pr,pc]) => {
          const k = pr*9+pc; if (seen.has(k)) return false; seen.add(k); return true;
        });

        return {
          technique: 'Naked Single', row: r, col: c, value: val,
          explain: lines(
            `${cell(r,c)} has only ONE valid candidate.`,
            ``,
            `Row ${r+1}: ${fmt(rowN) || '—'}`,
            `Col ${c+1}: ${fmt(colN) || '—'}`,
            `Box:       ${fmt(boxN) || '—'}`,
            ``,
            `Together they eliminate every digit except ${val}.`,
            `→ Place ${val} here.`
          ),
          lesson: 'Naked Single: when row, column, and box eliminate 8 digits, only one candidate remains.',
          highlight: {
            target : [r, c],
            peers  : blockUniq,
            unit   : [...peers.row, ...peers.col, ...peers.box]
          }
        };
      }
    }
    return null;
  }

  /* ── HIDDEN SINGLE ────────────────────────────── */
  function findHiddenSingle(board) {
    const units = [
      ...Array.from({length:9}, (_,i) => ({type:'row', idx:i, label:`row ${i+1}`})),
      ...Array.from({length:9}, (_,i) => ({type:'col', idx:i, label:`col ${i+1}`})),
      ...Array.from({length:9}, (_,i) => ({type:'box', idx:i, label:`box ${i+1}`}))
    ];

    for (const unit of units) {
      const cells = unitCells(unit.type, unit.idx);

      for (let n = 1; n <= 9; n++) {
        if (cells.some(([r,c]) => board[r][c] === n)) continue;

        const fits = cells.filter(([r,c]) => gc(board,r,c).has(n));
        if (fits.length !== 1) continue;

        const [r, c] = fits[0];
        const others = fmt(gc(board,r,c));

        /* Cells in this unit that block n (already have a digit) */
        const blockers = cells.filter(([pr,pc]) => board[pr][pc] && !(pr===r && pc===c));

        return {
          technique: `Hidden Single (${unit.type[0].toUpperCase()+unit.type.slice(1)})`,
          row: r, col: c, value: n,
          explain: lines(
            `Where can ${n} go in ${unit.label}?`,
            ``,
            `Scan each empty cell — ${n} is blocked from every cell`,
            `except ${cell(r,c)}.`,
            ``,
            `Other candidates at ${cell(r,c)}: ${others || 'none'}`,
            `But ${n} can ONLY go here → place it.`
          ),
          lesson: `Hidden Single: if a digit fits in only one cell within a ${unit.type}, it must go there.`,
          highlight: {
            target  : [r, c],
            peers   : blockers,
            unit    : cells
          }
        };
      }
    }
    return null;
  }

  /* ── FALLBACK ─────────────────────────────────── */
  function fallback(board, solution) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (board[r][c]) continue;
        const ans = solution[r][c];
        const peers = buildPeers(r, c);
        return {
          technique: 'Advanced Technique', row: r, col: c, value: ans,
          explain: lines(
            `${cell(r,c)} needs an advanced technique.`,
            ``,
            `Current candidates: ${fmt(gc(board,r,c))}`,
            ``,
            `A pattern like Naked Pairs or X-Wing is needed`,
            `to narrow these down further.`,
            ``,
            `The correct answer is ${ans}.`,
            `Tap "Place ${ans}" to continue.`
          ),
          lesson: 'Advanced techniques like Naked Pairs and X-Wings eliminate candidates when basic scanning is not enough. See the Techniques tab.',
          highlight: {
            target : [r, c],
            peers  : [],
            unit   : [...peers.row, ...peers.col, ...peers.box]
          }
        };
      }
    return null;
  }

  /* ── PUBLIC ── */
  function findMove(board, solution) {
    return findNakedSingle(board) || findHiddenSingle(board) || fallback(board, solution);
  }

  return { findMove };
})();
