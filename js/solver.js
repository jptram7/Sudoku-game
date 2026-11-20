// Human-style solver. It solves a puzzle the way a person would, using named techniques,
// and reports the hardest technique it needed. That is how we grade difficulty.
//
// Technique ranks:
//   1  Easy   : Naked Single, Hidden Single
//   2  Medium : Pointing / Claiming (locked candidates), Naked Pair/Triple, Hidden Pair
//   3  Hard   : Hidden Triple, Naked Quad, Hidden Quad, X-Wing, Swordfish, XY-Wing, XYZ-Wing
//   4  Master : anything the above cannot solve (needs chains / forcing / trial)
//
// Needs generator.js (UNITS, PEERS, candidateMask) to be loaded first.

const PEER_OF = new Uint8Array(81 * 81); // PEER_OF[a * 81 + b] = 1 if a and b share a row / column / box
(function buildPeerTable() {
  for (let i = 0; i < 81; i++) for (const p of PEERS[i]) PEER_OF[i * 81 + p] = 1;
})();

const SR = (i) => (i / 9) | 0;
const SC = (i) => i % 9;
const SB = (i) => (((SR(i) / 3) | 0) * 3) + ((SC(i) / 3) | 0);
const popcnt = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const lowDigit = (m) => 31 - Math.clz32(m & -m); // the digit of the lowest set bit

// ---------- Solver state: the grid plus the candidates of every empty cell ----------
function newSolverState(grid) {
  const g = grid.slice();
  const c = new Array(81).fill(0);
  let empty = 0;
  for (let i = 0; i < 81; i++) {
    if (g[i] === 0) { c[i] = candidateMask(g, i); empty++; }
  }
  return { g, c, empty, dead: false };
}

function place(s, i, d) {
  s.g[i] = d;
  s.c[i] = 0;
  s.empty--;
  const bit = ~(1 << d);
  for (const p of PEERS[i]) s.c[p] &= bit;
}

// Calls cb(chosen) for every combination of k items; stops early if cb returns true.
function eachCombo(items, k, cb) {
  const chosen = [];
  function rec(start) {
    if (chosen.length === k) return cb(chosen);
    for (let x = start; x <= items.length - (k - chosen.length); x++) {
      chosen.push(items[x]);
      if (rec(x + 1)) return true;
      chosen.pop();
    }
    return false;
  }
  return rec(0);
}

// ---------- Rank 1 ----------
function nakedSingle(s) {
  let changed = false;
  for (let i = 0; i < 81; i++) {
    if (s.g[i] !== 0) continue;
    const m = s.c[i];
    if (m === 0) { s.dead = true; return false; }
    if ((m & (m - 1)) === 0) { place(s, i, lowDigit(m)); changed = true; }
  }
  return changed;
}

function hiddenSingle(s) {
  let changed = false;
  for (const u of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      let count = 0, last = -1;
      for (const i of u) if (s.c[i] & bit) { count++; last = i; }
      if (count === 1) { place(s, last, d); changed = true; }
    }
  }
  return changed;
}

// ---------- Rank 2 ----------
// Pointing: inside a box a digit sits only in one row/column -> remove it from the rest of that row/column.
// Claiming: inside a row/column a digit sits only in one box -> remove it from the rest of that box.
function lockedCandidates(s) {
  let changed = false;
  for (let u = 18; u < 27; u++) {                       // boxes
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      const cells = UNITS[u].filter((i) => s.c[i] & bit);
      if (cells.length < 2) continue;
      const sameRow = cells.every((i) => SR(i) === SR(cells[0]));
      const sameCol = cells.every((i) => SC(i) === SC(cells[0]));
      const line = sameRow ? UNITS[SR(cells[0])] : sameCol ? UNITS[9 + SC(cells[0])] : null;
      if (!line) continue;
      for (const j of line) if (SB(j) !== u - 18 && (s.c[j] & bit)) { s.c[j] &= ~bit; changed = true; }
    }
  }
  for (let u = 0; u < 18; u++) {                        // rows and columns
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << d;
      const cells = UNITS[u].filter((i) => s.c[i] & bit);
      if (cells.length < 2) continue;
      const b = SB(cells[0]);
      if (!cells.every((i) => SB(i) === b)) continue;
      for (const j of UNITS[18 + b]) {
        if (!UNITS[u].includes(j) && (s.c[j] & bit)) { s.c[j] &= ~bit; changed = true; }
      }
    }
  }
  return changed;
}

// Naked subset: k cells in a unit whose candidates together are only k digits -> those digits go nowhere else in the unit.
function nakedSubset(s, k) {
  for (const u of UNITS) {
    const cells = u.filter((i) => s.g[i] === 0 && popcnt(s.c[i]) >= 2 && popcnt(s.c[i]) <= k);
    if (cells.length < k) continue;
    let changed = false;
    eachCombo(cells, k, (combo) => {
      let union = 0;
      for (const i of combo) union |= s.c[i];
      if (popcnt(union) !== k) return false;
      for (const j of u) {
        if (s.g[j] === 0 && !combo.includes(j) && (s.c[j] & union)) { s.c[j] &= ~union; changed = true; }
      }
      return changed;
    });
    if (changed) return true;
  }
  return false;
}

// Hidden subset: k digits that fit only in the same k cells of a unit -> those cells can hold nothing else.
function hiddenSubset(s, k) {
  for (const u of UNITS) {
    const pos = new Array(10).fill(0);
    const digits = [];
    for (let d = 1; d <= 9; d++) {
      let m = 0;
      for (let x = 0; x < 9; x++) if (s.c[u[x]] & (1 << d)) m |= 1 << x;
      pos[d] = m;
      const n = popcnt(m);
      if (n >= 2 && n <= k) digits.push(d);
    }
    if (digits.length < k) continue;
    let changed = false;
    eachCombo(digits, k, (combo) => {
      let cellMask = 0, digitMask = 0;
      for (const d of combo) { cellMask |= pos[d]; digitMask |= 1 << d; }
      if (popcnt(cellMask) !== k) return false;
      for (let x = 0; x < 9; x++) {
        if (!(cellMask & (1 << x))) continue;
        const i = u[x];
        const nc = s.c[i] & digitMask;
        if (nc !== s.c[i]) { s.c[i] = nc; changed = true; }
      }
      return changed;
    });
    if (changed) return true;
  }
  return false;
}

// ---------- Rank 3 ----------
// Fish (X-Wing = size 2, Swordfish = size 3): a digit confined to the same `size` columns in `size` rows
// can be removed from those columns everywhere else (and the same with rows and columns swapped).
function fish(s, size) {
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << d;
    for (let o = 0; o < 2; o++) {
      const at = (line, p) => (o === 0 ? line * 9 + p : p * 9 + line); // cell in base line `line` at cover position p
      const lines = [], cover = [];
      for (let L = 0; L < 9; L++) {
        let m = 0;
        for (let p = 0; p < 9; p++) if (s.c[at(L, p)] & bit) m |= 1 << p;
        const n = popcnt(m);
        if (n >= 2 && n <= size) { lines.push(L); cover[L] = m; }
      }
      if (lines.length < size) continue;
      let changed = false;
      eachCombo(lines, size, (combo) => {
        let union = 0;
        for (const L of combo) union |= cover[L];
        if (popcnt(union) !== size) return false;
        for (let p = 0; p < 9; p++) {
          if (!(union & (1 << p))) continue;
          for (let L = 0; L < 9; L++) {
            if (combo.includes(L)) continue;
            const i = at(L, p);
            if (s.c[i] & bit) { s.c[i] &= ~bit; changed = true; }
          }
        }
        return changed;
      });
      if (changed) return true;
    }
  }
  return false;
}

// XY-Wing: pivot {x,y}, wing A {x,z}, wing B {y,z} (both see the pivot) -> z is removed from every cell that sees both wings.
function xyWing(s) {
  let changed = false;
  for (let p = 0; p < 81; p++) {
    if (s.g[p] !== 0 || popcnt(s.c[p]) !== 2) continue;
    const pm = s.c[p];
    const wings = PEERS[p].filter((i) => s.g[i] === 0 && popcnt(s.c[i]) === 2 && popcnt(s.c[i] & pm) === 1);
    for (const a of wings) {
      const z = s.c[a] & ~pm;                  // a's digit that the pivot does not have
      const need = (pm & ~s.c[a]) | z;         // b must be {the pivot digit a lacks, z}
      for (const b of wings) {
        if (b === a || s.c[b] !== need) continue;
        for (let j = 0; j < 81; j++) {
          if (j === a || j === b || s.g[j] !== 0 || !(s.c[j] & z)) continue;
          if (PEER_OF[a * 81 + j] && PEER_OF[b * 81 + j]) { s.c[j] &= ~z; changed = true; }
        }
        if (changed) return true;
      }
    }
  }
  return false;
}

// XYZ-Wing: pivot {x,y,z}, wing A {x,z}, wing B {y,z} -> z is removed from every cell that sees the pivot and both wings.
function xyzWing(s) {
  let changed = false;
  for (let p = 0; p < 81; p++) {
    if (s.g[p] !== 0 || popcnt(s.c[p]) !== 3) continue;
    const pm = s.c[p];
    const wings = PEERS[p].filter((i) => s.g[i] === 0 && popcnt(s.c[i]) === 2 && (s.c[i] & ~pm) === 0);
    for (let x = 0; x < wings.length; x++) {
      for (let y = x + 1; y < wings.length; y++) {
        const a = wings[x], b = wings[y];
        if ((s.c[a] | s.c[b]) !== pm || s.c[a] === s.c[b]) continue;
        const z = s.c[a] & s.c[b];
        if (popcnt(z) !== 1) continue;
        for (let j = 0; j < 81; j++) {
          if (j === p || j === a || j === b || s.g[j] !== 0 || !(s.c[j] & z)) continue;
          if (PEER_OF[p * 81 + j] && PEER_OF[a * 81 + j] && PEER_OF[b * 81 + j]) { s.c[j] &= ~z; changed = true; }
        }
        if (changed) return true;
      }
    }
  }
  return false;
}

// ---------- Technique list, simplest first ----------
const TECHNIQUES = [
  { rank: 1, name: "Naked Single",    run: nakedSingle },
  { rank: 1, name: "Hidden Single",   run: hiddenSingle },
  { rank: 2, name: "Locked Candidates", run: lockedCandidates },
  { rank: 2, name: "Naked Pair",      run: (s) => nakedSubset(s, 2) },
  { rank: 2, name: "Hidden Pair",     run: (s) => hiddenSubset(s, 2) },
  { rank: 2, name: "Naked Triple",    run: (s) => nakedSubset(s, 3) },
  { rank: 3, name: "Hidden Triple",   run: (s) => hiddenSubset(s, 3) },
  { rank: 3, name: "X-Wing",          run: (s) => fish(s, 2) },
  { rank: 3, name: "XY-Wing",         run: xyWing },
  { rank: 3, name: "XYZ-Wing",        run: xyzWing },
  { rank: 3, name: "Swordfish",       run: (s) => fish(s, 3) },
  { rank: 3, name: "Naked Quad",      run: (s) => nakedSubset(s, 4) },
  { rank: 3, name: "Hidden Quad",     run: (s) => hiddenSubset(s, 4) }
];

// Solves with techniques up to maxRank. Returns { solved, hardest } where hardest = highest rank used.
function solveByTechniques(grid, maxRank = 3) {
  const s = newSolverState(grid);
  let hardest = 0;
  while (s.empty > 0 && !s.dead) {
    let progressed = false;
    for (const t of TECHNIQUES) {
      if (t.rank > maxRank) break;
      if (t.run(s)) { hardest = Math.max(hardest, t.rank); progressed = true; break; }
    }
    if (!progressed) break;
  }
  return { solved: s.empty === 0 && !s.dead, hardest, grid: s.g };
}

// Grade of a puzzle: 1..3 by the hardest technique needed, 4 if the techniques above cannot solve it.
function gradePuzzle(grid) {
  const r = solveByTechniques(grid, 3);
  return r.solved ? Math.max(1, r.hardest) : 4;
}
