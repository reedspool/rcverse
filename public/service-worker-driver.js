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
const deleteOldCaches = async () => {
  const cacheKeepList = [RCVERSE_SERVICE_WORKER_CACHE_NAME];
  const keyList = await caches.keys();
  const cachesToDelete = keyList.filter((key) => !cacheKeepList.includes(key));
  await Promise.all(cachesToDelete.map((key) => caches.delete(key)));
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

    console.log("Caching all personzliations", personalizations);

    event.waitUntil(
      caches.open(RCVERSE_SERVICE_WORKER_CACHE_NAME).then(function (cache) {
        // TODO: Are we forcing re-request of all these things? Don't refresh
        //       any which were already in cache
        // TODO: How would these things be cleaned up?
        return cache.addAll(personalizations);
      }),
    );
    return;
  }

  // Let the browser do its default thing for non-GET requests not matched above.
  if (event.request.method !== "GET") return;

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
