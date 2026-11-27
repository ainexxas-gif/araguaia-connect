/* Service worker: guarda a casca do app para abrir rápido e sem rede.
   Dados (Supabase) nunca são guardados em cache. */
var CACHE = "ld-__VERSAO__";
var CASCA = ["./", "index.html", "styles.css?v=__VERSAO__", "config.js?v=__VERSAO__", "motor.js?v=__VERSAO__", "api-mock.js?v=__VERSAO__",
  "api-supabase.js?v=__VERSAO__", "app.js?v=__VERSAO__", "fluxos-previa.js?v=__VERSAO__", "icone.svg", "icone-32.png", "icone-192.png", "icone-512.png", "icone-512-maskable.png", "icone-180-ios.png", "manifest.webmanifest"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CASCA); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(function () { return caches.match("index.html"); }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
