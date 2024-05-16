{
  const colors = [
    "red",
    "orange",
    "yellow",
    "green",
    "blue",
    "indigo",
    "violet",
  ];
  const customize = () => {
    document.querySelectorAll(".participants__face").forEach((p) => {
      p.style.borderColor = colors[(Math.random() * colors.length) | 0];
    });
  };
  document.body.addEventListener("htmx:afterSwap", customize);
  document.body.addEventListener("htmx:wsAfterMessage", customize);
  customize();
}
