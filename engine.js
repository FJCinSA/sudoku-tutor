/*
  ═══════════════════════════════════════════
  ENGINE.JS — Puzzle Generation & Solving
  ═══════════════════════════════════════════
  Pure logic. No DOM, no UI, no side effects.

  PUBLIC API:
    Engine.generate(difficulty) → { puzzle, solution }
    Engine.candidates(board, r, c) → Set {1..9}
    Engine.conflicts(board, r, c, val) → [[r,c]...]
  ═══════════════════════════════════════════
*/
const Engine = (function () {

  /* Fisher-Yates shuffle, returns new array */
  function shuffle(a) {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  /* Can number n go at (r,c)? Checks row, col, box */
  function isValid(board, r, c, n) {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === n || board[i][c] === n) return false;
    }
    const br = 3 * ((r / 3) | 0), bc = 3 * ((c / 3) | 0);
    for (let r2 = br; r2 < br + 3; r2++)
      for (let c2 = bc; c2 < bc + 3; c2++)
        if (board[r2][c2] === n) return false;
    return true;
  }

  /* First empty cell (value 0), or null if full */
  function findEmpty(board) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!board[r][c]) return [r, c];
    return null;
  }

  /* Recursive backtracking: fill entire board */
  function fillBoard(board) {
    const e = findEmpty(board);
    if (!e) return true;
    const [r, c] = e;
    for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (isValid(board, r, c, n)) {
        board[r][c] = n;
        if (fillBoard(board)) return true;
        board[r][c] = 0;
      }
    }
    return false;
  }

  /* Count solutions (stops at max, default 2) */
  function countSolutions(board, max) {
    max = max || 2;
    let count = 0;
    const copy = board.map(r => [...r]);
    (function solve() {
      if (count >= max) return;
      const e = findEmpty(copy);
      if (!e) { count++; return; }
      const [r, c] = e;
      for (let n = 1; n <= 9; n++) {
        if (isValid(copy, r, c, n)) {
          copy[r][c] = n;
          solve();
          if (count >= max) return;
          copy[r][c] = 0;
        }
      }
    })();
    return count;
  }

  /* Generate puzzle with unique solution */
  function generate(difficulty) {
    const board = Array.from({ length: 9 }, () => Array(9).fill(0));
    fillBoard(board);
    const solution = board.map(r => [...r]);
    const puzzle = board.map(r => [...r]);
    const removals = { beginner: 30, easy: 38, medium: 46, hard: 52, expert: 56 }[difficulty] || 40;
    let removed = 0;
    const positions = shuffle(Array.from({ length: 81 }, (_, i) => [(i / 9) | 0, i % 9]));
    for (const [r, c] of positions) {
      if (removed >= removals) break;
      const saved = puzzle[r][c];
      puzzle[r][c] = 0;
      if (countSolutions(puzzle) === 1) removed++;
      else puzzle[r][c] = saved;
    }
    return { puzzle, solution };
  }

  /* Valid candidates for empty cell at (r,c) */
  function candidates(board, r, c) {
    if (board[r][c]) return new Set();
    const s = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let i = 0; i < 9; i++) { s.delete(board[r][i]); s.delete(board[i][c]); }
    const br = 3 * ((r / 3) | 0), bc = 3 * ((c / 3) | 0);
    for (let r2 = br; r2 < br + 3; r2++)
      for (let c2 = bc; c2 < bc + 3; c2++)
        s.delete(board[r2][c2]);
    return s;
  }

  /* Cells that conflict with val at (r,c) */
  function conflicts(board, r, c, val) {
    const list = [];
    for (let i = 0; i < 9; i++) {
      if (i !== c && board[r][i] === val) list.push([r, i]);
      if (i !== r && board[i][c] === val) list.push([i, c]);
    }
    const br = 3 * ((r / 3) | 0), bc = 3 * ((c / 3) | 0);
    for (let r2 = br; r2 < br + 3; r2++)
      for (let c2 = bc; c2 < bc + 3; c2++)
        if (!(r2 === r && c2 === c) && board[r2][c2] === val)
          list.push([r2, c2]);
    return list;
  }

  return { generate, candidates, conflicts };
})();
