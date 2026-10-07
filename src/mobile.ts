export function setupMobileHeader(): () => void {
  const header = document.querySelector<HTMLElement>(".masthead");
  if (!header) return () => {};
  let last = window.scrollY, distance = 0, direction = 0, queued = false;
  function show(): void { header!.classList.remove("header-hidden"); distance = direction = 0; last = Math.max(0, window.scrollY); }
  function update(): void {
    queued = false;
    if (window.innerWidth > 700 || document.querySelector("dialog[open]")) { show(); return; }
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight), y = Math.min(max, Math.max(0, window.scrollY)), delta = y - last;
    last = y;
    if (y < 24) { show(); return; }
    if (Math.abs(delta) < 1) return;
    const next = Math.sign(delta); distance = next === direction ? distance + Math.abs(delta) : Math.abs(delta); direction = next;
    if (next > 0 && y > header!.offsetHeight + 16 && distance > 12) header!.classList.add("header-hidden");
    else if (next < 0 && distance > 6) header!.classList.remove("header-hidden");
  }
  window.addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener("resize", show); return show;
}
