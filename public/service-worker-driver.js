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

const RCVERSE_SERVICE_WORKER_CACHE_NAME = "rcverse-service-worker-cache-v4";
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
        // TODO: Need to figure out dynamic loading of personalizations and
        //       all dynamic data on the page (caching an empty shell with loading skeletons)
        //       Otherwise it
        // "/",

        // Static resources
        "/recurse-com.css",
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
  console.log("Service worker attempting to claim");
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", async function (event) {
  if (event.request.url.match(/cookie/i)) {
    event.respondWith(Promise.resolve(new Response("200 OK")));
    const promise = new Response(event.request.body).text();
    event.waitUntil(promise);
    const { cookie } = JSON.parse(await promise);
    const personalizationsCookie = extractCookieByName(
      cookie,
      "rcverse-personalizations",
    );
    const personalizations = JSON.parse(
      decodeURIComponent(personalizationsCookie),
    );

    event.waitUntil(
      caches.open(RCVERSE_SERVICE_WORKER_CACHE_NAME).then(function (cache) {
        // TODO: Are we forcing re-request of all these things? Don't refresh
        //       any which were already in cache
        // TODO: How would these things be cleaned up?
        // TODO: In my vision for duplicating the back-end routes into this
        //       service worker, the Personalizations cookie modifications might
        //       be captured and entirely performed on the front-end. Unfortunately
        //       that seems to be explicitly rejected as a usecase currently.
        //       See https://stackoverflow.com/a/44445217
        return cache.addAll(personalizations);
      }),
    );
    return;
  }

  // Let the browser do its default thing for non-GET requests not matched above.
  if (event.request.method !== "GET") return;

  // Some things we want to cache after the first time we get them
  if (
    // If it's a user photo/asset served or proxied through RC's infra
    event.request.url.match(/https:\/\/[^.].cloudfront.net\/assets\//) ||
    // There's two URLs by which these are served?
    event.request.url.match(
      /https:\/\/assets.recurse.com\/rails\/active_storage\/representations/,
    )
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Default, check the cache or just go with the original
  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    }),
  );
});
