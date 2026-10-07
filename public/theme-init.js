(() => {
  let p = "system";
  try {
    p = localStorage.getItem("ai-pilled-theme") || p;
  } catch {}
  document.documentElement.dataset.theme = ["light", "dark"].includes(p)
    ? p
    : matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
})();
