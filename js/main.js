// Wires everything together: taps, keyboard, timer, themes, start.

// Making a Hard or Master puzzle can take a moment on a phone. So: fade in a "Generating" screen,
// wait for it to be visible, do the work, then fade it out while the new board deals in.
function startNewGame(choice = Game.choice) {
  if (Game.busy) return;
  Game.busy = true;
  Game.paused = true;
  showGenerating();
  setTimeout(() => {
    newGame(choice);        // also clears busy / paused
    render();
  }, 260);
}

function restartGame() {
  resetGame();
  render();
}

function start() {
  const last = lastChoice();
  const resumed = loadSavedGame();
  if (!resumed) newGame("easy");   // quick placeholder so the screen can draw
  buildLevels((choice) => startNewGame(choice));
  buildBoard((i) => { if (canAct()) { selectCell(i); render(); } });
  buildPad((n) => { enterNumber(n); render(); });
  // A theme saved by an older version (Candy, Midnight) no longer exists: fall back to Paper
  let theme = document.documentElement.getAttribute("data-theme");
  if (!THEMES.some((t) => t.name === theme)) { theme = "paper"; rememberTheme(theme); }
  buildThemes((name) => { applyTheme(name); rememberTheme(name); }, theme);
  render();
  if (!resumed && isChoiceAvailable(last) && last !== "easy") startNewGame(last);
}

document.getElementById("undoBtn").addEventListener("click", () => { undo(); render(); });
document.getElementById("redoBtn").addEventListener("click", () => { redo(); render(); });
document.getElementById("eraseBtn").addEventListener("click", () => { eraseCell(); render(); });
document.getElementById("draftBtn").addEventListener("click", () => { toggleDraft(); render(); });
document.getElementById("hintBtn").addEventListener("click", () => { useHint(); render(); });
document.getElementById("newGameBtn").addEventListener("click", () => startNewGame());

document.getElementById("statsBtn").addEventListener("click", () => {
  if (Game.busy || Game.paused) return;
  Game.paused = true;
  showStats();
  document.getElementById("statsClose").addEventListener("click", () => { Game.paused = false; hideStats(); render(); });
  render();
});

document.getElementById("restartBtn").addEventListener("click", () => {
  if (Game.busy || Game.paused) return;
  Game.paused = true;
  showConfirmRestart();
  document.getElementById("confirmYes").addEventListener("click", () => { hideConfirmRestart(); restartGame(); });
  document.getElementById("confirmNo").addEventListener("click", () => { Game.paused = false; hideConfirmRestart(); render(); });
  render();
});

// Keyboard support for laptop: 1-9, arrows, Backspace/Delete = erase, N = draft, H = hint, Ctrl+Z / Ctrl+Y = undo / redo
document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); render(); return; }
  if ((e.ctrlKey || e.metaKey) && key === "y") { e.preventDefault(); redo(); render(); return; }
  if (e.key === "Backspace" || e.key === "Delete") { eraseCell(); render(); return; }
  if (key === "h") { useHint(); render(); return; }
  if (key === "n") { toggleDraft(); render(); return; }
  if (e.key >= "1" && e.key <= "9") { enterNumber(Number(e.key)); render(); return; }
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (moves[e.key] && canAct()) {
    e.preventDefault();
    moveSelection(...moves[e.key]);
    render();
  }
});

// Timer: counts only while the game is being played (not on the Stats / Restart screens) and the tab is visible
let lastTick = Date.now();
let lastSave = Date.now();
setInterval(() => {
  const now = Date.now();
  if (canAct() && !document.hidden) {
    Game.elapsedMs += now - lastTick;
    renderTimer();
    if (now - lastSave > 5000) { saveGame(); lastSave = now; }
  }
  lastTick = now;
}, 250);

// Save when the app goes to the background or closes
document.addEventListener("visibilitychange", () => { if (document.hidden) saveGame(); });
window.addEventListener("pagehide", saveGame);

start();

// Offline support: register the service worker (only on http/https, not when opened as a plain file)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline support is optional */ });
  });
}
