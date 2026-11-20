// Saving on the device (localStorage): best stats, the unfinished game, and the last level choice.
// Everything is wrapped in try/catch because storage can be blocked (private mode, full disk).

const STATS_KEY = "sudoku.stats";
const SAVE_KEY = "sudoku.save";
const CHOICE_KEY = "sudoku.choice";
const THEME_KEY = "sudoku.theme";
const SAVE_VERSION = 1;

function storeGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}
function storeDelete(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

function rememberChoice(choice) { storeSet(CHOICE_KEY, choice); }
function lastChoice() { return storeGet(CHOICE_KEY); }
function rememberTheme(name) { storeSet(THEME_KEY, name); }
function lastTheme() { return storeGet(THEME_KEY); }

// ---------- Stats per level ----------
function loadStats() { return storeGet(STATS_KEY) || {}; }

function emptyStats() { return { won: 0, lost: 0, bestTime: null, bestScore: null }; }

// Records a finished game. Returns which records were beaten (only counts when a previous record existed).
function recordResult(won) {
  const all = loadStats();
  const s = Object.assign(emptyStats(), all[Game.level]);
  const flags = { bestTime: false, bestScore: false };
  if (won) {
    const score = computeScore();
    if (s.bestTime !== null && Game.elapsedMs < s.bestTime) flags.bestTime = true;
    if (s.bestScore !== null && score > s.bestScore) flags.bestScore = true;
    if (s.bestTime === null || Game.elapsedMs < s.bestTime) s.bestTime = Game.elapsedMs;
    if (s.bestScore === null || score > s.bestScore) s.bestScore = score;
    s.won++;
  } else {
    s.lost++;
  }
  all[Game.level] = s;
  storeSet(STATS_KEY, all);
  return flags;
}

// ---------- Auto-save of the current game ----------
function saveGame() {
  if (Game.status !== "playing") { storeDelete(SAVE_KEY); return; }
  storeSet(SAVE_KEY, {
    v: SAVE_VERSION,
    choice: Game.choice, level: Game.level,
    given: Game.given, solution: Game.solution, values: Game.values,
    notes: Game.notes, hinted: Game.hinted, draft: Game.draft,
    undoStack: Game.undoStack.slice(-50), redoStack: Game.redoStack.slice(-50),
    selected: Game.selected, mistakes: Game.mistakes, hintsUsed: Game.hintsUsed,
    elapsedMs: Game.elapsedMs, replay: Game.replay
  });
}

// Restores an unfinished game. Returns true if one was restored.
function loadSavedGame() {
  const s = storeGet(SAVE_KEY);
  const is81 = (a) => Array.isArray(a) && a.length === 81;
  if (!s || s.v !== SAVE_VERSION || !LEVELS[s.level]) return false;
  if (![s.given, s.solution, s.values, s.notes, s.hinted].every(is81)) return false;

  Game.choice = s.choice; Game.level = s.level;
  Game.given = s.given; Game.solution = s.solution; Game.values = s.values;
  Game.notes = s.notes; Game.hinted = s.hinted; Game.draft = !!s.draft;
  Game.undoStack = s.undoStack || []; Game.redoStack = s.redoStack || [];
  Game.selected = s.selected; Game.mistakes = s.mistakes; Game.hintsUsed = s.hintsUsed;
  Game.elapsedMs = s.elapsedMs; Game.replay = !!s.replay;
  Game.gameId++; Game.busy = false;
  Game.status = "playing"; Game.paused = false; Game.settled = false; Game.result = null;
  return true;
}
