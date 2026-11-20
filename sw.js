// Service worker: makes the game work offline.
//
// Strategy: network first, cache as the fallback.
//  - Online: you always get the latest files, and each one is copied into the cache.
//  - Offline (or the network is slow, more than 2.5 seconds): the cached copy is used.
// Because of this you do NOT need to bump a version number when you update the game.
// You only need to add a file to FILES below if you create a new one.

const CACHE = "sudoku-cache";
const NETWORK_TIMEOUT_MS = 2500;   // how long the first file waits for a slow network
const SLOW_TIMEOUT_MS = 300;       // once the network proved slow, every other file waits only this long
const SLOW_MEMORY_MS = 60000;      // ...for the next minute
let slowUntil = 0;

const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/generator.js",
  "js/solver.js",
  "js/state.js",
  "js/storage.js",
  "js/board.js",
  "js/main.js",
  "fonts/montserrat-latin-wght-normal.woff2",
  "fonts/montserrat-vietnamese-wght-normal.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-64.png"
];

// Install: download every file once so the very first offline start already works.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Try the network, but give up after a few seconds and fall back to the cache.
function networkFirst(request) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () =>
      caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"));

    const wait = Date.now() < slowUntil ? SLOW_TIMEOUT_MS : NETWORK_TIMEOUT_MS;
    const timer = setTimeout(() => {
      fromCache().then((hit) => {
        if (hit && !settled) { settled = true; slowUntil = Date.now() + SLOW_MEMORY_MS; resolve(hit); }
      });
    }, wait);

    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        if (!settled) slowUntil = 0;   // the network answered in time: it is fine again
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        if (!settled) { settled = true; resolve(response); }
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then((hit) => { if (!settled) { settled = true; resolve(hit || Response.error()); } });
      });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;   // only our own files
  event.respondWith(networkFirst(req));
});
