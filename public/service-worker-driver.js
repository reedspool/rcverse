// Cookie utilities from PPK https://www.quirksmode.org/js/cookies.html
// Adapted to take in cookie as a parameter
function extractCookieByName(cookie, name) {
  var nameEQ = name + "=";
  var ca = cookie.split(";");
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

// To refresh user's caches automatically, change the number in this name.
// That will cause `deleteOldCaches` to clean up the past one. So users might
// still need to refresh after that switch happens?
const RCVERSE_SERVICE_WORKER_CACHE_NAME = "rcverse-service-worker-cache-v8";
// Adapted from an MDN example
const deleteOldCaches = async () => {
  const cacheKeepList = [RCVERSE_SERVICE_WORKER_CACHE_NAME];
  const keyList = await caches.keys();
  const cachesToDelete = keyList.filter((key) => !cacheKeepList.includes(key));
  await Promise.all(cachesToDelete.map((key) => caches.delete(key)));
};

// Adapted from
// https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers#recovering_failed_requests
const putInCache = async (request, response) => {
  const cache = await caches.open(RCVERSE_SERVICE_WORKER_CACHE_NAME);
  await cache.put(request, response);
};

const cacheFirst = async (request) => {
  const responseFromCache = await caches.match(request);
  if (responseFromCache) {
    return responseFromCache;
  }
  const responseFromNetwork = await fetch(request);
  putInCache(request, responseFromNetwork.clone());
  return responseFromNetwork;
};

self.addEventListener("install", async function (event) {
  console.log(
    `Service worker installed. Initiating cache ${RCVERSE_SERVICE_WORKER_CACHE_NAME}`,
    event,
  );

  event.waitUntil(
    caches.open(RCVERSE_SERVICE_WORKER_CACHE_NAME).then(function (cache) {
      return cache.addAll([
        // TODO: Make index.html into a shell that can be cached and loaded instantly
        //        "index.html"
        "favicon.ico",
      ]);
    }),
  );

  // TODO: Not sure when skipWaiting is necessary.
  //       https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  console.log("Service worker activated", event);
  console.log("Service worker cleaning up old caches");
  event.waitUntil(deleteOldCaches());
  event.waitUntil(async () => {
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
      console.log("Service worker enabled navigation preload");
    }
  });
  console.log("Service worker attempting to claim");
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", async function (event) {
  // Let the browser do its default thing for non-GET requests not matched above.
  if (event.request.method !== "GET") return;

  // Some things we want to cache after the first time we get them
  if (
    // If it's a user photo/asset served or proxied through RC's infra
    event.request.url.match(/https:\/\/[^.]+.cloudfront.net\/assets\//) ||
    // There's two URLs by which these are served?
    event.request.url.match(
      /https:\/\/assets.recurse.com\/rails\/active_storage\/representations/,
    ) ||
    event.request.url.startsWith("https://unpkg.com/htmx.org")
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Default, check the cache or just go with the original
  // Note that this is wrapped in an immediately invoked function
  // to get an encompassing promise for event.respondWith to wait for
  event.respondWith(
    (async function () {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) return cachedResponse;

      // Else, use the preloaded response, if it's there
      const response = await event.preloadResponse;
      if (response) return response;

      return fetch(event.request);
    })(),
  );
});

self.addEventListener("message", async (event) => {
  if (event?.data?.type !== "update_personalizations") return;
  const personalizations = event?.data?.payload?.map(({ url, ...rest }) => ({
    url: decodeURIComponent(url),
    ...rest,
  }));
  const cache = await caches.open(RCVERSE_SERVICE_WORKER_CACHE_NAME);
  // TODO: In my vision for duplicating the back-end routes into this
  //       service worker, the Personalizations cookie modifications might
  //       be captured and entirely performed on the front-end. Unfortunately
  //       that seems to be explicitly rejected as a usecase currently.
  //       See https://stackoverflow.com/a/44445217
  const cacheReqs = await cache.keys();
  cache.addAll(
    personalizations
      .filter(
        // `endsWith` to support paths, e.g. /personalizations/confetti.html
        ({ url, cache }) =>
          cache && !cacheReqs.find((req) => req.url.endsWith(url)),
      )
      .map(({ url }) => url),
  );
  personalizations.forEach(({ url, cache: shouldCache }) => {
    if (shouldCache) return;
    const cachedReq = cacheReqs.find((req) => req.url.endsWith(url));
    if (!cachedReq) return;
    cache.delete(cachedReq);
  });
});
