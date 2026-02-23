/*
  ═══════════════════════════════════════════════════
  ENGINE.JS — Puzzle Generation & Solving  (v2)
  ═══════════════════════════════════════════════════
  Pure logic module. Zero DOM. Zero side effects.
  Runs synchronously internally, but exposes an
  async-friendly generateAsync() for non-blocking UI.

  HOW PUZZLE GENERATION WORKS
  ────────────────────────────
  1. Start with a blank 9×9 grid (all zeros).
  2. Fill it with a valid solution using recursive
     backtracking + random shuffle at each cell.
  3. Remove digits one-by-one (randomly) as long as
     the puzzle still has a UNIQUE solution.
  4. Stop when the target number of removals is met.

  Removal targets by difficulty:
    Beginner 30 · Easy 38 · Medium 46 · Hard 52 · Expert 56

  PUBLIC API
  ──────────
    Engine.generate(difficulty)
      → { puzzle: number[][], solution: number[][] }
      Synchronous.  Fine for small boards.

    Engine.generateAsync(difficulty, callback)
      → Runs on the next event-loop tick.
      → Calls callback({ puzzle, solution }) when done.
      → Use this from newGame() so the UI stays responsive.

    Engine.candidates(board, r, c)
      → Set<number>   Valid digits 1-9 for the empty cell at (r,c).

    Engine.conflicts(board, r, c, val)
      → [[r,c], ...]  Cells that already contain val and
                      share a row, column, or 3×3 box with (r,c).
  ═══════════════════════════════════════════════════
*/

const Engine = (function () {

  /* ───────────────────────────────────────────
     UTILITIES
     ─────────────────────────────────────────── */

  /**
   * Fisher-Yates shuffle — returns a new shuffled array.
   * Used to randomise the order digits are tried during
   * backtracking, so every generated puzzle is different.
   */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * isValid(board, r, c, n)
   * Returns true if digit n can legally be placed at (r, c).
   * Checks the row, the column, and the 3×3 box.
   */
  function isValid(board, r, c, n) {
    /* Row & column check */
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === n) return false;   /* same row */
      if (board[i][c] === n) return false;   /* same col */
    }
    /* 3×3 box check */
    const br = 3 * ((r / 3) | 0);
    const bc = 3 * ((c / 3) | 0);
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        if (board[br + dr][bc + dc] === n) return false;
    return true;
  }

  /**
   * findEmpty(board)
   * Returns [row, col] of the first cell that is 0 (empty),
   * or null if every cell is filled.
   */
  function findEmpty(board) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!board[r][c]) return [r, c];
    return null;
  }

  /* ───────────────────────────────────────────
     BOARD FILLING (SOLUTION GENERATION)
     ─────────────────────────────────────────── */

  /**
   * fillBoard(board)
   * Recursive backtracking solver.
   * Shuffles candidate digits at each cell so the
   * resulting filled grid is unique every run.
   * Returns true when the board is completely filled.
   */
  function fillBoard(board) {
    const empty = findEmpty(board);
    if (!empty) return true;                  /* board complete */

    const [r, c] = empty;
    for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (isValid(board, r, c, n)) {
        board[r][c] = n;
        if (fillBoard(board)) return true;
        board[r][c] = 0;                      /* backtrack */
      }
    }
    return false;
  }

  /* ───────────────────────────────────────────
     UNIQUENESS CHECK
     ─────────────────────────────────────────── */

  /**
   * countSolutions(board, max)
   * Counts how many ways the partially-filled board can
   * be completed.  Stops early once `max` solutions are
   * found (default 2) — we only care whether the answer
   * is 0, 1, or "more than 1".
   *
   * Used during puzzle generation to ensure that removing
   * a digit doesn't create an ambiguous puzzle.
   */
  function countSolutions(board, max) {
    max = max || 2;
    let count = 0;
    /* Work on a copy so we don't mutate the caller's board */
    const copy = board.map(row => [...row]);

    function solve() {
      if (count >= max) return;
      const empty = findEmpty(copy);
      if (!empty) { count++; return; }          /* solution found */

      const [r, c] = empty;
      for (let n = 1; n <= 9; n++) {
        if (isValid(copy, r, c, n)) {
          copy[r][c] = n;
          solve();
          if (count >= max) return;             /* early exit */
          copy[r][c] = 0;
        }
      }
    }

    solve();
    return count;
  }

  /* ───────────────────────────────────────────
     PUZZLE GENERATION
     ─────────────────────────────────────────── */

  /**
   * How many cells to remove per difficulty level.
   * Fewer clues = harder puzzle.
   * (81 total cells — removals = clue count)
   *   Beginner: 51 clues  (very guided)
   *   Easy:     43 clues
   *   Medium:   35 clues
   *   Hard:     29 clues
   *   Expert:   25 clues  (very sparse)
   */
  const REMOVALS = {
    beginner: 30,
    easy:     38,
    medium:   46,
    hard:     52,
    expert:   56
  };

  /**
   * generate(difficulty)
   * Synchronous puzzle generator.
   * 1. Build a complete random solution.
   * 2. Clone it as the starting puzzle.
   * 3. Remove digits as long as uniqueness is preserved.
   * Returns { puzzle, solution } — both are 9×9 arrays.
   */
  function generate(difficulty) {
    /* Step 1 — create a full valid solution */
    const board = Array.from({ length: 9 }, () => Array(9).fill(0));
    fillBoard(board);
    const solution = board.map(row => [...row]);

    /* Step 2 — clone as editable puzzle */
    const puzzle = board.map(row => [...row]);

    /* Step 3 — remove digits in random order */
    const target    = REMOVALS[difficulty] || REMOVALS.easy;
    let   removed   = 0;
    const positions = shuffle(
      Array.from({ length: 81 }, (_, i) => [(i / 9) | 0, i % 9])
    );

    for (const [r, c] of positions) {
      if (removed >= target) break;

      const saved   = puzzle[r][c];
      puzzle[r][c]  = 0;                    /* temporarily remove */

      if (countSolutions(puzzle) === 1) {
        removed++;                           /* removal is safe */
      } else {
        puzzle[r][c] = saved;               /* restore — would break uniqueness */
      }
    }

    return { puzzle, solution };
  }

  /**
   * generateAsync(difficulty, callback)
   * Same as generate() but deferred to the next event-loop
   * tick via setTimeout(0).  This gives the browser a chance
   * to repaint the loading indicator before the heavy work
   * begins, keeping the UI feeling snappy.
   *
   * Usage:
   *   Engine.generateAsync('medium', ({ puzzle, solution }) => {
   *     // update Game state and call Render.all()
   *   });
   */
  function generateAsync(difficulty, callback) {
    setTimeout(() => callback(generate(difficulty)), 0);
  }

  /* ───────────────────────────────────────────
     CANDIDATE & CONFLICT HELPERS
     ─────────────────────────────────────────── */

  /**
   * candidates(board, r, c)
   * Returns a Set of digits that can legally go in (r, c).
   * Returns an empty Set if the cell is already filled.
   *
   * Used by:
   *   - hints.js to detect Naked Singles / Hidden Singles
   *   - game.js to validate note entries and show cell info
   */
  function candidates(board, r, c) {
    if (board[r][c]) return new Set();        /* cell already filled */

    const possible = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    /* Remove digits that appear in the same row or column */
    for (let i = 0; i < 9; i++) {
      possible.delete(board[r][i]);           /* row peer */
      possible.delete(board[i][c]);           /* col peer */
    }

    /* Remove digits in the same 3×3 box */
    const br = 3 * ((r / 3) | 0);
    const bc = 3 * ((c / 3) | 0);
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        possible.delete(board[br + dr][bc + dc]);

    return possible;
  }

  /**
   * conflicts(board, r, c, val)
   * Returns an array of [row, col] pairs for every cell
   * that already contains `val` and conflicts with (r, c).
   *
   * Used by game.js after a wrong placement to highlight
   * the cells that caused the conflict.
   */
  function conflicts(board, r, c, val) {
    const list = [];

    /* Row and column peers */
    for (let i = 0; i < 9; i++) {
      if (i !== c && board[r][i] === val) list.push([r, i]);  /* row conflict */
      if (i !== r && board[i][c] === val) list.push([i, c]);  /* col conflict */
    }

    /* Box peers */
    const br = 3 * ((r / 3) | 0);
    const bc = 3 * ((c / 3) | 0);
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++) {
        const pr = br + dr, pc = bc + dc;
        if (!(pr === r && pc === c) && board[pr][pc] === val)
          list.push([pr, pc]);
      }

    return list;
  }

  /* ───────────────────────────────────────────
     PUBLIC API
     ─────────────────────────────────────────── */
  return { generate, generateAsync, candidates, conflicts };

})();
