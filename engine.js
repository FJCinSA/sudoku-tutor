/*
  ═══════════════════════════════════════════════════
  ENGINE.JS — Puzzle Generation & Solving
  ═══════════════════════════════════════════════════
  Pure logic. Zero DOM. Zero side-effects.

  PUBLIC API
    Engine.generate(difficulty)      → { puzzle, solution }
    Engine.generateAsync(diff, cb)   → calls cb({ puzzle, solution })
    Engine.candidates(board, r, c)   → Set<number>
    Engine.conflicts(board, r, c, v) → [[r,c], ...]
    Engine.boxOrigin(x)              → top-left index of 3×3 box
  ═══════════════════════════════════════════════════
*/
const Engine = (function () {

  /* ── Shared: top-left row/col of the box containing index x ── */
  const boxOrigin = x => 3 * ((x / 3) | 0);

  /* ── Fisher-Yates shuffle (returns new array) ── */
  function shuffle(a) {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  /* ── Can digit n go at (r,c)? Checks row, col, box ── */
  function isValid(board, r, c, n) {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === n || board[i][c] === n) return false;
    }
    const br = boxOrigin(r), bc = boxOrigin(c);
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        if (board[br + dr][bc + dc] === n) return false;
    return true;
  }

  /* ── First empty cell or null ── */
  function findEmpty(board) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!board[r][c]) return [r, c];
    return null;
  }

  /* ── Recursive backtracking — fills board in place ── */
  function fillBoard(board) {
    const empty = findEmpty(board);
    if (!empty) return true;
    const [r, c] = empty;
    for (const n of shuffle([1,2,3,4,5,6,7,8,9])) {
      if (isValid(board, r, c, n)) {
        board[r][c] = n;
        if (fillBoard(board)) return true;
        board[r][c] = 0;
      }
    }
    return false;
  }

  /* ── Count solutions up to max (default 2) ── */
  function countSolutions(board, max = 2) {
    let count = 0;
    const copy = board.map(r => [...r]);
    function solve() {
      if (count >= max) return;
      const empty = findEmpty(copy);
      if (!empty) { count++; return; }
      const [r, c] = empty;
      for (let n = 1; n <= 9; n++) {
        if (isValid(copy, r, c, n)) {
          copy[r][c] = n;
          solve();
          copy[r][c] = 0;
        }
      }
    }
    solve();
    return count;
  }

  /* ── Removal counts per difficulty ── */
  const REMOVALS = { beginner:30, easy:38, medium:46, hard:52, expert:56 };

  /* ── Generate a puzzle with a unique solution ── */
  function generate(difficulty) {
    const board = Array.from({length:9}, () => Array(9).fill(0));
    fillBoard(board);
    const solution = board.map(r => [...r]);
    const puzzle   = board.map(r => [...r]);
    const target   = REMOVALS[difficulty] || REMOVALS.easy;
    let removed    = 0;

    for (const [r, c] of shuffle(Array.from({length:81}, (_,i) => [(i/9)|0, i%9]))) {
      if (removed >= target) break;
      const saved = puzzle[r][c];
      puzzle[r][c] = 0;
      if (countSolutions(puzzle) === 1) removed++;
      else puzzle[r][c] = saved;
    }
    return { puzzle, solution };
  }

  /* ── Non-blocking wrapper — defers to next event tick ── */
  function generateAsync(difficulty, callback) {
    setTimeout(() => callback(generate(difficulty)), 0);
  }

  /* ── Valid candidates for empty cell (r,c) ── */
  function candidates(board, r, c) {
    if (board[r][c]) return new Set();
    const s = new Set([1,2,3,4,5,6,7,8,9]);
    for (let i = 0; i < 9; i++) { s.delete(board[r][i]); s.delete(board[i][c]); }
    const br = boxOrigin(r), bc = boxOrigin(c);
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        s.delete(board[br+dr][bc+dc]);
    return s;
  }

  /* ── Cells that conflict with val at (r,c) ── */
  function conflicts(board, r, c, val) {
    const list = [];
    for (let i = 0; i < 9; i++) {
      if (i !== c && board[r][i] === val) list.push([r, i]);
      if (i !== r && board[i][c] === val) list.push([i, c]);
    }
    const br = boxOrigin(r), bc = boxOrigin(c);
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++) {
        const pr = br+dr, pc = bc+dc;
        if (!(pr===r && pc===c) && board[pr][pc]===val) list.push([pr,pc]);
      }
    return list;
  }

  return { generate, generateAsync, candidates, conflicts, boxOrigin };
})();
