import { celebrateRank } from "./confetti.js";
import { drawLanes } from "./lanes.js";
import { friendlyTimestamp, readAge } from "./dates.js";
import {
  themePreference,
  resolveTheme,
  type ThemePreference,
} from "./theme.js";
let preference: ThemePreference = "system";
try {
  preference = themePreference(localStorage.getItem("ai-pilled-theme"));
} catch {}
const system = matchMedia("(prefers-color-scheme: dark)");
function apply() {
  document.documentElement.dataset.theme = resolveTheme(
    preference,
    system.matches,
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-theme-choice]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.themeChoice === preference),
      ),
    );
}
apply();
system.addEventListener("change", apply);
document
  .querySelectorAll<HTMLButtonElement>("[data-theme-choice]")
  .forEach((b) =>
    b.addEventListener("click", () => {
      preference = themePreference(b.dataset.themeChoice);
      try {
        localStorage.setItem("ai-pilled-theme", preference);
      } catch {}
      apply();
    }),
  );
const stackRepos = document.querySelector<HTMLElement>(".stack-repos");
let scrollIdle: ReturnType<typeof setTimeout>;
// Fade an edge only while more chips sit past it.
function updateStackFades() {
  if (!stackRepos) return;
  const end = stackRepos.scrollWidth - stackRepos.clientWidth;
  stackRepos.classList.toggle("fade-start", stackRepos.scrollLeft > 1);
  stackRepos.classList.toggle("fade-end", stackRepos.scrollLeft < end - 1);
}
stackRepos?.addEventListener("scroll", () => {
  stackRepos.classList.add("is-scrolling");
  clearTimeout(scrollIdle);
  scrollIdle = setTimeout(() => stackRepos.classList.remove("is-scrolling"), 700);
  updateStackFades();
}, { passive: true });
if (stackRepos) new ResizeObserver(updateStackFades).observe(stackRepos);
const selectionButton = document.querySelector<HTMLButtonElement>("#leaderboard-info"),
  selectionTooltip = document.querySelector<HTMLElement>("#repo-selection"),
  desktopHover = matchMedia("(min-width: 701px) and (hover: hover) and (pointer: fine)");
let tooltipExit: ReturnType<typeof setTimeout>;
function showSelectionTooltip() {
  clearTimeout(tooltipExit);
  selectionTooltip?.showPopover();
}
function hideSelectionTooltip() {
  clearTimeout(tooltipExit);
  if (selectionTooltip?.matches(":popover-open")) selectionTooltip.hidePopover();
}
for (const target of [selectionButton, selectionTooltip]) {
  target?.addEventListener("pointerenter", (event) => {
    if (desktopHover.matches && event.pointerType === "mouse") showSelectionTooltip();
  });
  target?.addEventListener("pointerleave", (event) => {
    if (desktopHover.matches && event.pointerType === "mouse")
      tooltipExit = setTimeout(hideSelectionTooltip, 150);
  });
}
selectionButton?.addEventListener("focus", () => {
  if (selectionButton.matches(":focus-visible")) showSelectionTooltip();
});
selectionButton?.addEventListener("blur", hideSelectionTooltip);
selectionButton?.addEventListener("click", (event) => {
  // Hover/focus already opened it. Mobile taps keep the native toggle.
  if (event.detail === 0 || (desktopHover.matches && event instanceof PointerEvent && event.pointerType === "mouse")) {
    event.preventDefault();
    showSelectionTooltip();
  }
});
selectionTooltip?.addEventListener("beforetoggle", () => {
  if (!selectionButton) return;
  const rect = selectionButton.getBoundingClientRect(),
    width = Math.min(320, innerWidth - 32);
  selectionTooltip.style.left = `${Math.max(16, Math.min(rect.left, innerWidth - width - 16))}px`;
  selectionTooltip.style.top = `${rect.bottom + 8}px`;
});
function positionSelectionTooltip() {
  if (!selectionButton || !selectionTooltip?.matches(":popover-open")) return;
  const rect = selectionButton.getBoundingClientRect(),
    height = selectionTooltip.offsetHeight,
    width = selectionTooltip.offsetWidth;
  selectionTooltip.style.left = `${Math.max(16, Math.min(rect.left, innerWidth - width - 16))}px`;
  selectionTooltip.style.top = `${rect.bottom + height + 8 <= innerHeight - 16 ? rect.bottom + 8 : Math.max(16, rect.top - height - 8)}px`;
}
selectionTooltip?.addEventListener("toggle", positionSelectionTooltip);
window.addEventListener("resize", positionSelectionTooltip);
window.addEventListener("scroll", hideSelectionTooltip, { passive: true });
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  readTimes = document.querySelectorAll<HTMLTimeElement>("time[data-timestamp]");
function updateReadTimes() {
  readTimes.forEach((t) => {
    t.textContent = readAge(t.dateTime);
    t.title = friendlyTimestamp(t.dateTime, zone);
    t.setAttribute("aria-label", t.title);
  });
}
updateReadTimes();
if (readTimes.length) setInterval(updateReadTimes, 60000);
const loading = document.querySelector<HTMLElement>("#loading"),
  error = document.querySelector<HTMLElement>("#action-error"),
  whimsy = [
    "Counting robot footprints…",
    "Untangling the pull requests…",
    "Waking the tiny repo detectives…",
    "Following the green breadcrumbs…",
  ];
let busy = false;
async function readRepo(repository: string, refresh = false) {
  if (busy) return;
  busy = true;
  if (error) error.hidden = true;
  if (loading) loading.hidden = false;
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    "#repo-form button,#refresh",
  );
  buttons.forEach((b) => (b.disabled = true));
  let step = 0;
  const timer = setInterval(() => {
    const text = document.querySelector("#loading-text");
    if (text) text.textContent = whimsy[++step % whimsy.length];
  }, 2300);
  try {
    const r = await fetch(refresh ? "/api/repos/refresh" : "/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository }),
      }),
      body = await r.json();
    if (!r.ok)
      throw new Error(body.error ?? "This read could not be completed.");
    if (body.page && body.status === "ready") {
      location.assign(
        "/" + body.repository.split("/").map(encodeURIComponent).join("/"),
      );
      return;
    }
    if (error) {
      error.textContent =
        body.message ?? "Repo saved. Its read will finish in the daily job.";
      error.hidden = false;
    }
  } catch (e) {
    if (error) {
      error.textContent =
        e instanceof Error ? e.message : "This read did not finish.";
      error.hidden = false;
    }
  } finally {
    clearInterval(timer);
    busy = false;
    if (loading) loading.hidden = true;
    buttons.forEach((b) => (b.disabled = false));
  }
}
document
  .querySelector<HTMLFormElement>("#repo-form")
  ?.addEventListener("submit", (e) => {
    e.preventDefault();
    void readRepo(
      document.querySelector<HTMLInputElement>("#repo-input")!.value,
    );
  });
document.querySelector("#refresh")?.addEventListener("click", () => {
  void readRepo(
    document.querySelector<HTMLElement>("[data-repository]")!.dataset
      .repository!,
    true,
  );
});
const sentinel = document.querySelector<HTMLElement>("#scroll-sentinel"),
  more = document.querySelector<HTMLButtonElement>("#more-repos"),
  status = document.querySelector<HTMLElement>("#list-status");
let fetching = false;
async function appendRows() {
  if (!sentinel || sentinel.hidden || fetching) return;
  fetching = true;
  if (more) {
    more.disabled = true;
    more.textContent = "Loading…";
  }
  try {
    const params = new URLSearchParams({
        offset: sentinel.dataset.offset!,
        limit: "30",
        v: sentinel.dataset.version!,
        sort: sentinel.dataset.sort ?? "desc",
      }),
      r = await fetch("/api/leaderboard?" + params),
      body = await r.json();
    if (!r.ok) throw new Error(body.error ?? "Could not load more repos.");
    const template = document.createElement("template");
    template.innerHTML = "<table><tbody>" + body.html + "</tbody></table>";
    const tbody = document.querySelector("#repo-rows");
    for (const row of template.content.querySelectorAll("tr"))
      tbody?.append(row);
    if (body.nextOffset === null) sentinel.hidden = true;
    else sentinel.dataset.offset = String(body.nextOffset);
    if (status) status.textContent = "";
  } catch (e) {
    if (status)
      status.textContent =
        e instanceof Error ? e.message : "Could not load more repos.";
  } finally {
    fetching = false;
    if (more) {
      more.disabled = false;
      more.textContent = "Load more";
    }
  }
}
more?.addEventListener("click", () => void appendRows());
if (sentinel && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) void appendRows();
    },
    { rootMargin: "400px" },
  );
  observer.observe(sentinel);
}
document.querySelector("#repo-rows")?.addEventListener("click", (e) => {
  const target = e.target as HTMLElement,
    row = target.closest<HTMLElement>("tr[data-href]");
  if (row && !target.closest("a") && !window.getSelection()?.toString())
    location.assign(row.dataset.href!);
});

const focus = new URL(location.href).searchParams.get("focus");
if (focus) {
  const href = "/" + focus.split("/").map(encodeURIComponent).join("/"),
    row = document.querySelector<HTMLElement>(
      'tr[data-href="' + CSS.escape(href) + '"]',
    );
  if (row) {
    row.classList.add("focused-row");
  }
}

celebrateRank(
  Number(document.querySelector<HTMLElement>(".repo-result")?.dataset.rank),
);
const lanes = document.querySelector<HTMLCanvasElement>(".hero-lanes");
if (lanes) drawLanes(lanes);
