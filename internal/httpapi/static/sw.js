const CACHE_NAME = "noterious-shell-v3";
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/assets/app.css",
  "/assets/app.js",
  "/assets/editor.bundle.js",
  "/assets/favicon.ico",
  "/assets/favicon-32.png",
  "/assets/apple-touch-icon.png",
  "/assets/pwa-icon-192.png",
  "/assets/pwa-icon-512.png",
  "/assets/pwa-icon-maskable-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
        return Promise.resolve(false);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  const networkFirstPaths = new Set([
    "/",
    "/manifest.webmanifest",
    "/assets/app.css",
    "/assets/app.js",
    "/assets/editor.bundle.js",
  ]);

  if (request.mode === "navigate" || networkFirstPaths.has(url.pathname)) {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response && response.ok) {
          const cacheKey = request.mode === "navigate" ? "/" : request;
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(cacheKey, responseClone);
          });
        }
        return response;
      }).catch(function () {
        const fallbackKey = request.mode === "navigate" ? "/" : request;
        return caches.match(fallbackKey).then(function (cached) {
          if (cached) {
            return cached;
          }
          return caches.match("/") || caches.match("/index.html");
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) {
        fetch(request).then(function (response) {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, response.clone());
            });
          }
        }).catch(function () {});
        return cached;
      }
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, response.clone());
          });
        }
        return response;
      });
    })
  );
});
