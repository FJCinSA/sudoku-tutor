/*
  ═══════════════════════════════════════════
  HINTS.JS — Solving Techniques & Explanations
  ═══════════════════════════════════════════
  Detects solvable cells and builds plain-English
  explanation of WHY the number goes there.

  DEPENDS ON: Engine.candidates()

  PUBLIC API:
    Hints.findMove(board, solution) → hint object | null

  PRIORITY: Naked Single → Hidden Single → Fallback
  ═══════════════════════════════════════════
*/
const Hints = (function () {

  const gc = Engine.candidates;

  /* ─── NAKED SINGLE: only one candidate left ─── */
  function findNakedSingle(board) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cands = gc(board, r, c);
        if (cands.size !== 1) continue;
        const val = [...cands][0];

        const inRow = [], inCol = [], inBox = [];
        for (let i = 0; i < 9; i++) {
          if (board[r][i] && i !== c) inRow.push(board[r][i]);
          if (board[i][c] && i !== r) inCol.push(board[i][c]);
        }
        const br = 3 * ((r / 3) | 0), bc = 3 * ((c / 3) | 0);
        for (let r2 = br; r2 < br + 3; r2++)
          for (let c2 = bc; c2 < bc + 3; c2++)
            if (board[r2][c2] && !(r2 === r && c2 === c)) inBox.push(board[r2][c2]);

        return {
          technique: 'Naked Single', row: r, col: c, value: val,
          explain: `Look at R${r+1}C${c+1}:\n\nRow ${r+1}: ${[...new Set(inRow)].sort().join(', ')}\nCol ${c+1}: ${[...new Set(inCol)].sort().join(', ')}\nBox: ${[...new Set(inBox)].sort().join(', ')}\n\nOnly ${val} remains.`,
          lesson: 'Naked Single: when all other numbers are eliminated, only one candidate remains.'
        };
      }
    }
    return null;
  }

  /* ─── HIDDEN SINGLE: number fits only one cell in a unit ─── */
  function findHiddenSingle(board) {

    /* Check rows */
    for (let r = 0; r < 9; r++) {
      for (let n = 1; n <= 9; n++) {
        if (board[r].includes(n)) continue;
        const pos = [];
        for (let c = 0; c < 9; c++) if (gc(board, r, c).has(n)) pos.push(c);
        if (pos.length === 1) {
          return {
            technique: 'Hidden Single (Row)', row: r, col: pos[0], value: n,
            explain: `Where can ${n} go in row ${r+1}?\n\nOnly col ${pos[0]+1} is left.`,
            lesson: 'Hidden Single: scan a row for a number. If it fits only one cell, place it there.'
          };
        }
      }
    }

    /* Check columns */
    for (let c = 0; c < 9; c++) {
      for (let n = 1; n <= 9; n++) {
        let found = false;
        for (let r = 0; r < 9; r++) if (board[r][c] === n) { found = true; break; }
        if (found) continue;
        const pos = [];
        for (let r = 0; r < 9; r++) if (gc(board, r, c).has(n)) pos.push(r);
        if (pos.length === 1) {
          return {
            technique: 'Hidden Single (Col)', row: pos[0], col: c, value: n,
            explain: `Where can ${n} go in col ${c+1}?\n\nOnly row ${pos[0]+1} is left.`,
            lesson: 'Hidden Single: scan a column for a number. If it fits only one cell, place it there.'
          };
        }
      }
    }

    /* Check boxes */
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        for (let n = 1; n <= 9; n++) {
          let found = false;
          const pos = [];
          for (let r = br*3; r < br*3+3 && !found; r++)
            for (let c = bc*3; c < bc*3+3; c++) {
              if (board[r][c] === n) { found = true; break; }
              if (!board[r][c] && gc(board, r, c).has(n)) pos.push([r, c]);
            }
          if (found || pos.length !== 1) continue;
          const [r, c] = pos[0];
          return {
            technique: 'Hidden Single (Box)', row: r, col: c, value: n,
            explain: `Where can ${n} go in this box?\n\nOnly R${r+1}C${c+1} is left.`,
            lesson: 'Hidden Single: scan a box for a missing number. If it fits only one cell, place it there.'
          };
        }
      }
    }
    return null;
  }

  /* ─── Public: try techniques in order, fallback to solution ─── */
  function findMove(board, solution) {
    let h = findNakedSingle(board);
    if (h) return h;
    h = findHiddenSingle(board);
    if (h) return h;

    /* Fallback: advanced technique needed */
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!board[r][c]) {
          return {
            technique: 'Elimination', row: r, col: c, value: solution[r][c],
            explain: `R${r+1}C${c+1} candidates: ${[...gc(board, r, c)].join(', ')}\n\nNeeds an advanced technique.\nAnswer: ${solution[r][c]}.`,
            lesson: 'Advanced patterns like Naked Pairs or X-Wings help when basic techniques aren\'t enough.'
          };
        }
    return null;
  }

  return { findMove };
})();
