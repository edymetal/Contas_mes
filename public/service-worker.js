const CACHE_NAME = "contas-mes-v3";
const APP_SCOPE = self.registration.scope;
const APP_SHELL = ["", "index.html", "manifest.webmanifest", "favicon.svg", "icon-192.png", "icon-512.png"].map((path) =>
  new URL(path, APP_SCOPE).toString(),
);
const INDEX_URL = new URL("index.html", APP_SCOPE).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || !requestUrl.href.startsWith(APP_SCOPE)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(INDEX_URL)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    }),
  );
});
