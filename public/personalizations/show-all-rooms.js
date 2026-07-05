const params = new URLSearchParams(location.search);
if (!params.has("show")) {
  const styleEl = document.createElement("style");
  document.head.appendChild(styleEl);
  styleEl.sheet.insertRule(`
    section.room--visibility-invisible {
      display: none;
    }`);
}
