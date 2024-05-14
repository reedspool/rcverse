const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) {
    console.warning("Couldn't register service worker");
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register(
      "/service-worker-driver.js",
      {
        scope: "/",
      },
    );
    if (registration.installing) {
      console.log("Service worker installing");
    } else if (registration.waiting) {
      console.log("Service worker installed");
    } else if (registration.active) {
      console.log("Service worker active");
    }
  } catch (error) {
    console.error(`Registration failed with ${error}`, error);
  }
};

navigator.serviceWorker.addEventListener("controllerchange", (event) => {
  console.log("controllerchange", event);
});

document.addEventListener("DOMContentLoaded", () => {
  // When we get a new service worker
  // TODO: Future, hopefully we can replace this strategy with directly accessing
  //       cookies in the service worker.
  //       See https://developer.mozilla.org/en-US/docs/Web/API/Cookie_Store_API
  // TODO: Wait... could be using postmessage, much simpler :facepalm:
  //       https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker/postMessage
  // TODO: Should be updating this more often? Cookies can change more often
  //       than just page load.
  fetch("/service-worker/shareCookie", {
    method: "POST",
    body: JSON.stringify({ cookie: document.cookie }),
  });
});

registerServiceWorker();
