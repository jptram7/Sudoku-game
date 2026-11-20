// Drawing: builds the board, level selector, theme swatches and number pad,
// and refreshes everything from Game state. Also plays the animations.

const boardEl = document.getElementById("board");
const boardWrapEl = document.querySelector(".boardwrap");
const padEl = document.getElementById("pad");
const levelsEl = document.getElementById("levels");
const themesEl = document.getElementById("themes");
const overlayEl = document.getElementById("overlay");
const statsOverlayEl = document.getElementById("statsOverlay");
const confirmOverlayEl = document.getElementById("confirmOverlay");
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelLabelEl = document.getElementById("levelLabel");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const eraseBtn = document.getElementById("eraseBtn");
const draftBtn = document.getElementById("draftBtn");
const hintBtn = document.getElementById("hintBtn");
const hintCountEl = document.getElementById("hintCount");
let cellEls = [];
let padButtons = [];

const LEVEL_CHOICES = ["easy", "medium", "hard", "master", "random"];
const THEMES = [
  { name: "paper",     label: "Paper",           swatch: "linear-gradient(135deg,#f6f4ef 50%,#2f6fdb 50%)" },
  { name: "ocean",     label: "Ocean",           swatch: "linear-gradient(135deg,#4cc9f0,#2ec4b6)" },
  { name: "stranger",  label: "Stranger Things", swatch: "linear-gradient(135deg,#0b0905 45%,#c3332d 45%,#c3332d 72%,#eaa82c 72%)" },
  { name: "cyberpunk", label: "Cyberpunk",       swatch: "linear-gradient(135deg,#0b001b 45%,#53ebe4 45%,#53ebe4 70%,#e13a6a 70%)" }
];
const THEME_COLORS = { paper: "#f6f4ef", ocean: "#d6f1ff", stranger: "#0b0905", cyberpunk: "#0b001b" };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const reducedMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Small animation helpers ----------
function animate(el, cls, ms = 700) {
  el.classList.remove(cls);
  void el.offsetWidth;            // restart the animation if it is already running
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function waveCells(indices, step = 45) {
  indices.forEach((i, k) => {
    cellEls[i].style.setProperty("--wd", k * step + "ms");
    animate(cellEls[i], "wave", 600 + k * step);
  });
}

function confetti() {
  if (reducedMotion()) return;
  const cv = document.getElementById("confetti");
  const ctx = cv.getContext && cv.getContext("2d");
  if (!ctx) return;
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const colors = ["#ff6b9d", "#ffd166", "#06d6a0", "#4cc9f0", "#8b5cf6", "#f77f00"];
  const parts = Array.from({ length: 150 }, () => ({
    x: cv.width / 2 + (Math.random() - 0.5) * 140, y: cv.height * 0.45,
    vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 15 - 4,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 5,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[(Math.random() * colors.length) | 0]
  }));
  let t0 = null;
  (function frame(t) {
    if (t0 === null) t0 = t;
    const el = t - t0;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, 1 - el / 2800);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (el < 2800) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
  })(performance.now());
}

// ---------- Builders ----------
function buildBoard(onCellTap) {
  boardEl.innerHTML = "";
  cellEls = [];
  for (let i = 0; i < 81; i++) {
    const el = document.createElement("div");
    el.className = "cell";
    el.setAttribute("role", "gridcell");
    if (colOf(i) % 3 === 2 && colOf(i) !== 8) el.classList.add("box-right");
    if (rowOf(i) % 3 === 2 && rowOf(i) !== 8) el.classList.add("box-bottom");
    if (colOf(i) === 8) el.classList.add("last-col");
    if (rowOf(i) === 8) el.classList.add("last-row");
    if ((boxOf(i) % 2) === 1) el.classList.add("alt");   // checkerboard of boxes
    el.addEventListener("click", () => onCellTap(i));
    boardEl.appendChild(el);
    cellEls.push(el);
  }
  livesEl.innerHTML = "";
  for (let k = 0; k < MAX_MISTAKES; k++) {
    const h = document.createElement("span");
    h.className = "life";
    h.textContent = "♥";
    livesEl.appendChild(h);
  }
}

function buildPad(onNumberTap) {
  padEl.innerHTML = "";
  padButtons = [];
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement("button");
    b.className = "d" + n;
    b.textContent = n;
    b.addEventListener("click", () => onNumberTap(n));
    padEl.appendChild(b);
    padButtons.push(b);
  }
}

function buildLevels(onPick) {
  levelsEl.innerHTML = "";
  for (const name of LEVEL_CHOICES) {
    const b = document.createElement("button");
    b.textContent = cap(name);
    b.dataset.level = name;
    b.disabled = !isChoiceAvailable(name);
    b.addEventListener("click", () => onPick(name));
    levelsEl.appendChild(b);
  }
}

function applyTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[name] || "#ffffff");
  for (const b of themesEl.children) b.classList.toggle("active", b.dataset.theme === name);
}

function buildThemes(onPick, current) {
  themesEl.innerHTML = "";
  for (const t of THEMES) {
    const b = document.createElement("button");
    b.className = "swatch";
    b.dataset.theme = t.name;
    b.style.background = t.swatch;
    b.title = t.label;
    b.setAttribute("aria-label", t.label + " theme");
    b.addEventListener("click", () => onPick(t.name));
    themesEl.appendChild(b);
  }
  applyTheme(current);
}

function renderTimer() {
  timerEl.textContent = formatTime(Game.elapsedMs);
}

// ---------- Render ----------
const prev = { gameId: -1, values: null, status: "playing", complete: new Set() };

function completedUnits() {
  const done = new Set();
  UNITS.forEach((u, k) => { if (u.every((i) => Game.values[i] !== 0 && Game.values[i] === Game.solution[i])) done.add(k); });
  return done;
}

function render() {
  const sel = Game.selected;
  const selValue = sel !== null ? Game.values[sel] : 0;
  const fresh = prev.gameId !== Game.gameId;   // a new (or restarted) puzzle: play the "deal" animation

  for (let i = 0; i < 81; i++) {
    const el = cellEls[i];
    const v = Game.values[i];

    // number, or a 3x3 grid of small draft notes when the cell is empty
    let html = "";
    if (v !== 0) {
      html = `<span class="num${Game.given[i] !== 0 ? "" : " d" + v}">${v}</span>`;
    } else if (Game.notes[i] !== 0) {
      html = '<div class="notes">';
      for (let d = 1; d <= 9; d++) html += `<span>${Game.notes[i] & (1 << d) ? d : ""}</span>`;
      html += "</div>";
    }
    if (el._html !== html) { el.innerHTML = html; el._html = html; }

    el.classList.toggle("given", Game.given[i] !== 0);
    el.classList.toggle("wrong", isWrong(i));

    // a number just changed: pop / shake / glow
    if (!fresh && prev.values && prev.values[i] !== v && v !== 0) {
      if (isWrong(i)) animate(el, "shake", 450);
      else if (Game.hinted[i]) animate(el, "glow", 950);
      else animate(el, "pop", 400);
    }

    let related = false, same = false;
    if (sel !== null && i !== sel) {
      related = rowOf(i) === rowOf(sel) || colOf(i) === colOf(sel) || boxOf(i) === boxOf(sel);
      same = selValue !== 0 && v === selValue;
    }
    el.classList.toggle("selected", i === sel);
    el.classList.toggle("related", related && !same);
    el.classList.toggle("same", same);
  }

  // new puzzle: cells drop in diagonally
  if (fresh && !reducedMotion()) {
    for (let i = 0; i < 81; i++) cellEls[i].style.setProperty("--dd", (rowOf(i) + colOf(i)) * 22 + "ms");
    boardEl.classList.remove("deal");
    void boardEl.offsetWidth;
    boardEl.classList.add("deal");
    setTimeout(() => boardEl.classList.remove("deal"), 1100);
  }

  // a row, column or box was just completed: ripple through it
  const complete = completedUnits();
  if (!fresh && Game.status === "playing") {
    complete.forEach((k) => { if (!prev.complete.has(k)) waveCells(UNITS[k]); });
  }
  // won: everything ripples + confetti. lost: board shakes.
  if (!fresh && Game.status === "won" && prev.status !== "won") {
    waveCells([...Array(81).keys()].sort((a, b) => rowOf(a) + colOf(a) - rowOf(b) - colOf(b)), 12);
    confetti();
  }
  if (!fresh && Game.status === "lost" && prev.status !== "lost") animate(boardWrapEl, "shake", 550);

  prev.gameId = Game.gameId;
  prev.values = Game.values.slice();
  prev.status = Game.status;
  prev.complete = complete;

  // number pad: grey out a number once all 9 are placed correctly
  padButtons.forEach((b, k) => { b.disabled = isDigitComplete(k + 1); });
  padEl.classList.toggle("draft", Game.draft);

  // tools
  const playing = canAct();
  undoBtn.disabled = !playing || Game.undoStack.length === 0;
  redoBtn.disabled = !playing || Game.redoStack.length === 0;
  eraseBtn.disabled = !playing;
  draftBtn.disabled = !playing;
  draftBtn.classList.toggle("active", Game.draft);
  hintCountEl.textContent = MAX_HINTS - Game.hintsUsed;
  hintBtn.disabled = !playing || Game.hintsUsed >= MAX_HINTS;

  // level selector
  for (const b of levelsEl.children) b.classList.toggle("active", b.dataset.level === Game.choice);

  // info bar
  levelLabelEl.textContent = cap(Game.level);
  levelLabelEl.dataset.level = Game.level;
  scoreEl.textContent = computeScore();
  [...livesEl.children].forEach((h, k) => h.classList.toggle("off", k >= MAX_MISTAKES - Game.mistakes));
  livesEl.setAttribute("aria-label", `${Game.mistakes} of ${MAX_MISTAKES} mistakes`);
  renderTimer();
  saveGame();

  // win / game-over overlay (left alone while a new puzzle is being generated)
  if (Game.busy) return;
  if (Game.status === "playing") {
    overlayEl.classList.add("hidden");
  } else {
    const won = Game.status === "won";
    const r = Game.result || {};
    const badges = (r.bestTime ? '<p class="badge">New best time!</p>' : "") + (r.bestScore ? '<p class="badge">New best score!</p>' : "");
    const note = Game.replay ? '<p class="small">Restarted runs don\'t count toward stats</p>' : "";
    overlayEl.innerHTML = won
      ? `<h2>Solved! 🎉</h2><p class="big">${computeScore()}</p>` +
        `<p>Time ${formatTime(Game.elapsedMs)} · Mistakes ${Game.mistakes} · Hints ${Game.hintsUsed}</p>${badges}${note}` +
        `<div class="btns"><button class="btn primary" id="overlayBtn">New Game</button></div>`
      : `<h2>Game over</h2><p>${MAX_MISTAKES} mistakes · Score ${computeScore()}</p>` +
        `<div class="btns"><button class="btn primary" id="retryBtn">Retry this puzzle</button><button class="btn" id="overlayBtn">New Game</button></div>`;
    overlayEl.classList.remove("hidden");
    document.getElementById("overlayBtn").addEventListener("click", () => startNewGame());
    const retry = document.getElementById("retryBtn");
    if (retry) retry.addEventListener("click", () => restartGame());
  }
}

// ---------- Generating screen ----------
function showGenerating() {
  overlayEl.innerHTML = '<div class="dots"><i></i><i></i><i></i></div><p>Generating puzzle…</p>';
  overlayEl.classList.remove("hidden");
}

// ---------- Stats screen ----------
function showStats() {
  const all = loadStats();
  let rows = "";
  for (const name of ["easy", "medium", "hard", "master"]) {
    const st = Object.assign(emptyStats(), all[name]);
    rows += `<tr><td>${cap(name)}</td><td>${st.won}/${st.won + st.lost}</td>` +
            `<td>${st.bestTime === null ? "–" : formatTime(st.bestTime)}</td>` +
            `<td>${st.bestScore === null ? "–" : st.bestScore}</td></tr>`;
  }
  statsOverlayEl.innerHTML =
    `<h2>Stats</h2>` +
    `<table class="stats"><tr><th></th><th>Won</th><th>Best time</th><th>Best score</th></tr>${rows}</table>` +
    `<div class="btns"><button class="btn primary" id="statsClose">Close</button></div>`;
  statsOverlayEl.classList.remove("hidden");
}

function hideStats() { statsOverlayEl.classList.add("hidden"); }

// ---------- Restart confirmation ----------
function showConfirmRestart() {
  confirmOverlayEl.innerHTML =
    `<h2>Restart?</h2>` +
    `<p>Same puzzle, from the start.<br>Timer, mistakes and hints reset.</p>` +
    `<p class="small">A restarted run doesn't count toward stats.</p>` +
    `<div class="btns"><button class="btn primary" id="confirmYes">Restart</button><button class="btn" id="confirmNo">Cancel</button></div>`;
  confirmOverlayEl.classList.remove("hidden");
}

function hideConfirmRestart() { confirmOverlayEl.classList.add("hidden"); }
