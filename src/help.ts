import { friendlyTimestamp } from "./dates.js";
import { helpPosition } from "./tooltip-position.js";
import { icon } from "./icons.js";
export function setupHelp(): void {
  const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
  const bubble = document.createElement("div"); bubble.className = "help-bubble"; bubble.id = "help-bubble"; bubble.role = "tooltip"; bubble.hidden = true;
  const heading = document.createElement("strong"), text = document.createElement("div"); bubble.append(heading, text); document.body.append(bubble);
  const sheet = document.createElement("dialog"); sheet.className = "help-sheet"; sheet.setAttribute("aria-labelledby", "help-heading");
  const panel = document.createElement("div"), sheetHeading = document.createElement("h2"), sheetText = document.createElement("div"), close = document.createElement("button");
  sheetHeading.id = "help-heading"; close.type = "button"; close.className = "help-close"; close.setAttribute("aria-label", "Close explanation"); close.append(icon("close")); panel.append(close, sheetHeading, sheetText); sheet.append(panel); document.body.append(sheet);
  const canHover = () => hover.matches && window.innerWidth > 700;
  text.className = sheetText.className = "help-copy";
  function copy(target: HTMLElement, value: string): void {
    target.replaceChildren(...value.split("\n").filter(Boolean).map(line => {
      const p = document.createElement("p"), colon = line.indexOf(":");
      if (colon > 0 && ["Trending", "Top stars", "Read", "PRs inspected", "PRs checked", "PRs read", "Coverage", "Stars added", "Ranks", "Ties"].includes(line.slice(0, colon))) {
        const label = document.createElement("strong"); label.textContent = line.slice(0, colon + 1); p.append(label, document.createTextNode(line.slice(colon + 1)));
      } else p.textContent = line;
      return p;
    }));
  }
  const helpCopy = (target: HTMLElement) => `${target.dataset.readAt ? `Read: ${friendlyTimestamp(target.dataset.readAt, undefined, navigator.language)}\n` : ""}${target.dataset.help ?? ""}`;
  let active: HTMLElement | null = null, returnFocus: HTMLElement | null = null;
  function hide(): void { bubble.hidden = true; active?.removeAttribute("aria-describedby"); active = null; }
  function place(): void {
    if (!active || bubble.hidden) return;
    if (!canHover()) { hide(); return; }
    const position = helpPosition(active.getBoundingClientRect(), bubble.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
    bubble.style.left = `${position.left}px`; bubble.style.top = `${position.top}px`;
  }
  function show(target: HTMLElement): void {
    if (!canHover() || sheet.open) return;
    hide(); active = target; heading.textContent = target.dataset.helpTitle ?? "Behind the number"; copy(text, helpCopy(target));
    bubble.hidden = false; active.setAttribute("aria-describedby", bubble.id); place();
  }
  const targetOf = (event: Event): HTMLElement | null => event.target instanceof Element ? event.target.closest<HTMLElement>("[data-help]") : null;
  document.addEventListener("pointerover", event => { const target = targetOf(event); if (target && !target.contains(event.relatedTarget as Node | null)) show(target); });
  document.addEventListener("pointerout", event => { if (active && !active.contains(event.relatedTarget as Node | null)) hide(); });
  document.addEventListener("focusin", event => { const target = targetOf(event); if (target) show(target); });
  document.addEventListener("focusout", hide);
  document.addEventListener("click", event => {
    const target = targetOf(event); if (!target || canHover()) return;
    event.preventDefault(); hide(); returnFocus = target; sheetHeading.textContent = target.dataset.helpTitle ?? "Behind the number"; copy(sheetText, helpCopy(target)); sheet.showModal();
  });
  close.addEventListener("click", () => sheet.close());
  sheet.addEventListener("click", event => { if (event.target === sheet) sheet.close(); });
  sheet.addEventListener("close", () => { returnFocus?.focus(); returnFocus = null; });
  document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
  window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
}
