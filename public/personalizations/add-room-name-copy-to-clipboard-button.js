//
//
// https://rcverse.recurse.com/?reset
// https://rcverse.recurse.com/?reset&personalize=https://cdn.jsdelivr.net/gh/izzee/rcverse-customizations/styles.html

// 0. Run a local server like `npx local-web-server`
// 1. Start with a check to see our personalization
//    http://127.0.0.1:8000/add-room-name-copy-to-clipboard-button.js
//    https://rcverse.recurse.com?personalize=http://127.0.0.1:8000/add-room-name-copy-to-clipboard-button.js
// alert("It's alive!");
if (true) {
  const customize = (roomElement) => {
    // NEW
    const zoomLink = roomElement.querySelector("a[href*=zoom]");
    if (!zoomLink) return;
    const textToCopy = `[${zoomLink.innerText}](${zoomLink.getAttribute("href")})`;
    zoomLink.insertAdjacentHTML(
      "afterend",
      `<button onclick="navigator.clipboard.writeText('${textToCopy}')">
          Copy markdown link
        </button>`,
    );
    // END NEW
  };
  document.body.addEventListener("htmx:afterSwap", (event) => {
    const roomElement = event.detail.target;
    if (!roomElement.matches(".room")) return;
    console.log("htmx after swap room", roomElement);
    customize(roomElement);
  });
  document.body.addEventListener("htmx:wsAfterMessage", ({ detail }) => {
    const roomElement = document.querySelector(
      `#${detail.message.match(/id="([^"]+)"/)[1]}`,
    );
    if (!roomElement) return;
    console.log("htmx wsaftermessage", roomElement);
    customize(roomElement);
  });
  window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".room").forEach(customize);
  });
}

// Finally, push to GitHub and Add personalization link via jsDelivr
// https://cdn.jsdelivr.net/gh/reedspool/rcverse/public/personalizations/add-room-name-copy-to-clipboard-button.js
