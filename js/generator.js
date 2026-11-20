// Puzzle generator. Pure logic, no drawing.
// A grid is an array of 81 numbers, 0 = empty. Cell index i = row * 9 + col.

// ---------- Geometry: which cells are "peers" (share a row, column or box) ----------
const UNITS = [];   // 27 units (9 rows, 9 columns, 9 boxes), each a list of 9 cell indices
const PEERS = [];   // for each cell, the 20 other cells that share a unit with it

(function buildGeometry() {
  for (let r = 0; r < 9; r++) UNITS.push([...Array(9).keys()].map((c) => r * 9 + c));
  for (let c = 0; c < 9; c++) UNITS.push([...Array(9).keys()].map((r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3, c0 = (b % 3) * 3, cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((r0 + r) * 9 + c0 + c);
    UNITS.push(cells);
  }
  for (let i = 0; i < 81; i++) {
    const set = new Set();
    for (const u of UNITS) if (u.includes(i)) u.forEach((j) => j !== i && set.add(j));
    PEERS.push([...set]);
  }
})();

// ---------- Candidates: which digits can still go in a cell ----------
// Returned as a bitmask: bit d is set if digit d is possible (bits 1..9).
function candidateMask(grid, i) {
  let used = 0;
  for (const p of PEERS[i]) used |= 1 << grid[p];
  return ~used & 0x3fe;
}

function bitCount(m) {
  let n = 0;
  while (m) { m &= m - 1; n++; }
  return n;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function digitsOf(mask) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

// ---------- Step 1: make a random complete, valid grid ----------
function fillGrid(grid) {
  // pick the empty cell with the fewest options (keeps backtracking fast)
  let best = -1, bestMask = 0, bestCount = 10;
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0) continue;
    const m = candidateMask(grid, i);
    const c = bitCount(m);
    if (c < bestCount) { best = i; bestMask = m; bestCount = c; if (c <= 1) break; }
  }
  if (best === -1) return true;            // no empty cell: done
  if (bestCount === 0) return false;       // dead end
  for (const d of shuffle(digitsOf(bestMask))) {
    grid[best] = d;
    if (fillGrid(grid)) return true;
    grid[best] = 0;
  }
  return false;
}

function generateSolution() {
  const grid = new Array(81).fill(0);
  fillGrid(grid);
  return grid;
}

// ---------- Step 2: count solutions (used to prove a puzzle has exactly one) ----------
function countSolutions(grid, limit = 2) {
  const g = grid.slice();
  let count = 0;
  (function search() {
    if (count >= limit) return;
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i] !== 0) continue;
      const m = candidateMask(g, i);
      const c = bitCount(m);
      if (c < bestCount) { best = i; bestMask = m; bestCount = c; if (c <= 1) break; }
    }
    if (best === -1) { count++; return; }
    if (bestCount === 0) return;
    for (const d of digitsOf(bestMask)) {
      g[best] = d;
      search();
      if (count >= limit) break;
    }
    g[best] = 0;
  })();
  return count;
}

// ---------- Step 3: a "human" solver that only uses basic techniques ----------
// Easy level = solvable with Naked Singles + Hidden Singles only.
//  Naked single : a cell has only one possible digit left.
//  Hidden single: in a row/column/box, a digit has only one cell where it can go.
function solvableWithSingles(grid) {
  const g = grid.slice();
  let progress = true;
  while (progress) {
    progress = false;

    for (let i = 0; i < 81; i++) {            // naked singles
      if (g[i] !== 0) continue;
      const m = candidateMask(g, i);
      if (m === 0) return false;
      if (bitCount(m) === 1) { g[i] = digitsOf(m)[0]; progress = true; }
    }

    for (const unit of UNITS) {               // hidden singles
      for (let d = 1; d <= 9; d++) {
        if (unit.some((i) => g[i] === d)) continue;
        const spots = unit.filter((i) => g[i] === 0 && (candidateMask(g, i) & (1 << d)));
        if (spots.length === 0) return false;
        if (spots.length === 1) { g[spots[0]] = d; progress = true; }
      }
    }
  }
  return g.every((v) => v !== 0);
}

// ---------- Step 4: dig holes ----------
// Each level is defined by the hardest technique a puzzle needs (see solver.js):
//   easy   : singles only, 38-42 given numbers
//   medium : needs at least one Medium technique, nothing harder
//   hard   : needs at least one Hard technique, nothing harder
//   master : unique solution, the Hard techniques are not enough, at most 25 given numbers
const LEVELS = {
  easy:   { rank: 1, clues: [38, 42] },
  medium: { rank: 2 },
  hard:   { rank: 3 },
  master: { rank: 4, maxClues: 25 }
};

// Random mode: chance of each level, in percent (must add up to 100).
// Only levels that already exist in LEVELS can be picked.
const LEVEL_RATES = { easy: 15, medium: 45, hard: 30, master: 10 };

function pickRandomLevel() {
  const names = Object.keys(LEVEL_RATES).filter((n) => LEVELS[n]);
  const total = names.reduce((sum, n) => sum + LEVEL_RATES[n], 0);
  let roll = Math.random() * total;
  for (const n of names) {
    roll -= LEVEL_RATES[n];
    if (roll < 0) return n;
  }
  return names[names.length - 1];
}

// Removes numbers one by one (random order) while `stillFair(puzzle)` stays true.
// Stops early when `target` given numbers are left (if a target is set).
function digHoles(solution, stillFair, target = 0) {
  const puzzle = solution.slice();
  let clues = 81;
  for (const i of shuffle([...Array(81).keys()])) {
    if (clues <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (stillFair(puzzle)) clues--;
    else puzzle[i] = keep;
  }
  return puzzle;
}

// Tries to make a puzzle of exactly the requested level. Returns null if this attempt missed the level.
function tryMakePuzzle(level) {
  const cfg = LEVELS[level];
  const solution = generateSolution();
  let puzzle;
  if (cfg.rank === 1) {
    const target = cfg.clues[0] + Math.floor(Math.random() * (cfg.clues[1] - cfg.clues[0] + 1));
    puzzle = digHoles(solution, solvableWithSingles, target);
    return { puzzle, solution };
  }
  if (cfg.rank <= 3) {
    // Remove numbers one at a time and stop the moment the puzzle first NEEDS a technique of this rank.
    puzzle = solution.slice();
    let clues = 81;
    for (const i of shuffle([...Array(81).keys()])) {
      const keep = puzzle[i];
      puzzle[i] = 0;
      const r = solveByTechniques(puzzle, cfg.rank);
      if (!r.solved) { puzzle[i] = keep; continue; }   // too hard for this level: put it back
      clues--;
      if (r.hardest === cfg.rank) {
        return { puzzle, solution };
      }
    }
    return null;
  }
  // master: keep removing while the solution stays unique, then check the Hard techniques fail
  puzzle = digHoles(solution, (p) => countSolutions(p, 2) === 1);
  if (puzzle.filter((v) => v).length > cfg.maxClues) return null;
  return solveByTechniques(puzzle, 3).solved ? null : { puzzle, solution };
}

function generatePuzzle(level = "easy") {
  for (let attempt = 0; attempt < 100; attempt++) {
    const made = tryMakePuzzle(level);
    if (made) return { puzzle: made.puzzle, solution: made.solution, level, attempts: attempt + 1 };
  }
  // Extremely unlikely: fall back to the next easier level so the game never gets stuck
  const names = Object.keys(LEVELS);
  return generatePuzzle(names[Math.max(0, names.indexOf(level) - 1)]);
}
