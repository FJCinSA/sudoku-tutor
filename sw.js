// SudokuLab Tutor — Service Worker
// Caches all app files for offline play

const CACHE = 'sudokulab-tutor-v1';

const ASSETS = [
  '/sudoku-tutor/',
  '/sudoku-tutor/index.html',
  '/sudoku-tutor/style.css',
  '/sudoku-tutor/engine.js',
  '/sudoku-tutor/hints.js',
  '/sudoku-tutor/render.js',
  '/sudoku-tutor/game.js',
  '/sudoku-tutor/manifest.json',
];

// Install: cache everything
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
