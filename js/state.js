// Game state: the data of the game, no drawing here.

const MAX_MISTAKES = 3;
const MAX_HISTORY = 300;
const MAX_HINTS = 3;

// Scoring settings per level. mult = score multiplier, par = "fast" solve time in seconds.
const LEVEL_SCORE = {
  easy:   { mult: 1, par: 600 },
  medium: { mult: 2, par: 900 },
  hard:   { mult: 3, par: 1200 },
  master: { mult: 5, par: 1800 }
};
const POINTS_PER_CELL = 10;   // each correct number you enter yourself
const MISTAKE_PENALTY = 20;   // each mistake
const HINT_PENALTY = 50;      // each hint used (the hinted cell gives no points)
const SPEED_BONUS_MAX = 500;  // bonus for finishing instantly; shrinks to 0 at the par time

const Game = {
  choice: "easy",   // what the player picked: "easy" ... or "random"
  level: "easy",    // the level actually being played
  given: [],        // 81 numbers, 0 = empty; locked cells
  solution: [],     // 81 numbers, the full answer
  values: [],       // 81 numbers, what is currently on the board
  notes: [],        // 81 bitmasks of draft notes (bit d set = note d is shown)
  hinted: [],       // 81 booleans: cell was filled by a hint
  draft: false,     // true = number pad writes notes instead of numbers
  undoStack: [],    // snapshots before each action
  redoStack: [],
  selected: null,   // index 0..80, or null
  status: "playing",// "playing" | "won" | "lost"
  gameId: 0,        // changes whenever a new puzzle starts or the puzzle is restarted (drives the "deal" animation)
  replay: false,    // true after Restart: that run does not count toward best stats
  busy: false,      // true while a new puzzle is being generated
  paused: false,    // true while the Stats or Restart-confirm screen is open
  settled: false,   // true once the finished game has been recorded
  result: null,     // { bestTime, bestScore } flags after a win
  mistakes: 0,
  hintsUsed: 0,
  elapsedMs: 0
};

function isChoiceAvailable(name) {
  if (name === "random") return Object.keys(LEVEL_RATES).filter((n) => LEVELS[n]).length > 1;
  return !!LEVELS[name];
}

function newGame(choice = Game.choice) {
  const level = choice === "random" ? pickRandomLevel() : choice;
  const made = generatePuzzle(level);
  const { puzzle, solution } = made;
  Game.choice = choice;
  Game.level = made.level;
  Game.given = puzzle;
  Game.solution = solution;
  Game.values = puzzle.slice();
  Game.notes = new Array(81).fill(0);
  Game.hinted = new Array(81).fill(false);
  Game.draft = false;
  Game.undoStack = [];
  Game.redoStack = [];
  Game.selected = null;
  Game.status = "playing";
  Game.paused = false;
  Game.busy = false;
  Game.replay = false;
  Game.settled = false;
  Game.result = null;
  Game.mistakes = 0;
  Game.hintsUsed = 0;
  Game.elapsedMs = 0;
  Game.gameId++;
  rememberChoice(choice);
}

// Restart: the same puzzle again from the beginning (numbers, notes, timer, mistakes and hints reset).
// A restarted run does not count toward best stats, so it cannot be used to farm records.
function resetGame() {
  Game.values = Game.given.slice();
  Game.notes = new Array(81).fill(0);
  Game.hinted = new Array(81).fill(false);
  Game.draft = false;
  Game.undoStack = [];
  Game.redoStack = [];
  Game.selected = null;
  Game.status = "playing";
  Game.paused = false;
  Game.busy = false;
  Game.replay = true;
  Game.settled = false;
  Game.result = null;
  Game.mistakes = 0;
  Game.hintsUsed = 0;
  Game.elapsedMs = 0;
  Game.gameId++;
  saveGame();
}

// Can the player act right now? (not finished, not on the Stats screen)
const canAct = () => Game.status === "playing" && !Game.paused && !Game.busy;

// Helpers to convert between cell index and row / column / box
const rowOf = (i) => Math.floor(i / 9);
const colOf = (i) => i % 9;
const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

// A cell is "wrong" if the player filled it with a number that is not the answer
const isWrong = (i) => Game.given[i] === 0 && Game.values[i] !== 0 && Game.values[i] !== Game.solution[i];
// A cell is locked if it was given, or the player already entered the correct number
const isLocked = (i) => Game.given[i] !== 0 || Game.values[i] === Game.solution[i];

// A digit is "complete" when all 9 of its cells are filled correctly
function isDigitComplete(n) {
  let count = 0;
  for (let i = 0; i < 81; i++) if (Game.values[i] === n && Game.solution[i] === n) count++;
  return count === 9;
}

// ---------- Score ----------
// Calculated from the board, so undo / redo can never be used to farm points.
//  points = 10 per correct number you entered yourself - 20 per mistake - 50 per hint (never below 0)
//  on a win, add a speed bonus (up to 500, shrinking to 0 at the level's par time)
//  everything is multiplied by the level multiplier
function computeScore() {
  const cfg = LEVEL_SCORE[Game.level];
  let entered = 0;
  for (let i = 0; i < 81; i++) {
    if (Game.given[i] === 0 && !Game.hinted[i] && Game.values[i] === Game.solution[i]) entered++;
  }
  const points = Math.max(0, entered * POINTS_PER_CELL - Game.mistakes * MISTAKE_PENALTY - Game.hintsUsed * HINT_PENALTY);
  let bonus = 0;
  if (Game.status === "won") {
    bonus = Math.round(SPEED_BONUS_MAX * Math.max(0, 1 - Game.elapsedMs / 1000 / cfg.par));
  }
  return (points + bonus) * cfg.mult;
}

// Called after any action that can end the game: records the result once
function settleGame() {
  if (Game.status === "playing" || Game.settled) return;
  Game.settled = true;
  Game.result = Game.replay ? {} : recordResult(Game.status === "won");   // restarted runs are not recorded
  saveGame(); // a finished game is cleared from the save slot
}

function selectCell(i) {
  Game.selected = i;
}

function moveSelection(dRow, dCol) {
  if (Game.selected === null) { Game.selected = 40; return; } // start in the centre
  const r = Math.min(8, Math.max(0, rowOf(Game.selected) + dRow));
  const c = Math.min(8, Math.max(0, colOf(Game.selected) + dCol));
  Game.selected = r * 9 + c;
}

// ---------- History (undo / redo) ----------
// Only the board (numbers + notes) is restored. Mistakes, hints and the timer are NOT:
// undoing a wrong number does not give the mistake back.
function snapshot() {
  Game.undoStack.push({ values: Game.values.slice(), notes: Game.notes.slice() });
  if (Game.undoStack.length > MAX_HISTORY) Game.undoStack.shift();
  Game.redoStack = [];
}

function undo() {
  if (!canAct() || Game.undoStack.length === 0) return;
  Game.redoStack.push({ values: Game.values.slice(), notes: Game.notes.slice() });
  const s = Game.undoStack.pop();
  Game.values = s.values;
  Game.notes = s.notes;
}

function redo() {
  if (!canAct() || Game.redoStack.length === 0) return;
  Game.undoStack.push({ values: Game.values.slice(), notes: Game.notes.slice() });
  const s = Game.redoStack.pop();
  Game.values = s.values;
  Game.notes = s.notes;
}

// ---------- Actions ----------
function toggleDraft() {
  if (!canAct()) return;
  Game.draft = !Game.draft;
}

function enterNumber(n) {
  if (!canAct()) return;
  const i = Game.selected;
  if (i === null) return;
  if (isDigitComplete(n)) return;   // all 9 already placed: that number is used up
  if (isLocked(i)) return;          // given or already-correct cells cannot change

  if (Game.draft) {
    if (Game.values[i] !== 0) return; // erase the wrong number first
    snapshot();
    Game.notes[i] ^= 1 << n;          // toggle the note
    return;
  }

  if (Game.values[i] === n) return; // same number again: nothing happens
  snapshot();
  Game.values[i] = n;
  Game.notes[i] = 0;
  if (n !== Game.solution[i]) {
    Game.mistakes++;
    if (Game.mistakes >= MAX_MISTAKES) Game.status = "lost";
  } else {
    afterCorrect(i, n);
  }
  settleGame();
}

// Shared by normal entry and hints: tidy notes and check for a win
function afterCorrect(i, n) {
  // remove the number from the notes of every cell in the same row / column / box
  for (const p of PEERS[i]) Game.notes[p] &= ~(1 << n);
  if (Game.values.every((v, k) => v === Game.solution[k])) Game.status = "won";
}

// Hint: fills one cell with the correct number. Costs one of the 3 hints and some score.
// Uses the selected cell if it can be filled; otherwise picks a random fillable cell.
// A hint is not a mistake, and undoing it does not give the hint back.
function useHint() {
  if (!canAct() || Game.hintsUsed >= MAX_HINTS) return;
  let i = Game.selected;
  if (i === null || isLocked(i)) {
    const open = [];
    for (let k = 0; k < 81; k++) if (!isLocked(k)) open.push(k);
    if (open.length === 0) return;
    i = open[Math.floor(Math.random() * open.length)];
    Game.selected = i;
  }
  snapshot();
  Game.hintsUsed++;
  Game.hinted[i] = true;
  Game.values[i] = Game.solution[i];
  Game.notes[i] = 0;
  afterCorrect(i, Game.solution[i]);
  settleGame();
}

// Eraser: clears a wrong number (no mistake refund), or the notes of an empty cell
function eraseCell() {
  if (!canAct()) return;
  const i = Game.selected;
  if (i === null || isLocked(i)) return;
  if (Game.values[i] !== 0) { snapshot(); Game.values[i] = 0; }
  else if (Game.notes[i] !== 0) { snapshot(); Game.notes[i] = 0; }
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
