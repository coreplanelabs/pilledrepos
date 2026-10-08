import { celebrateRank } from "./confetti.js";
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
const selectionButton = document.querySelector<HTMLButtonElement>("#leaderboard-info"),
  selectionTooltip = document.querySelector<HTMLElement>("#repo-selection");
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
window.addEventListener("scroll", () => {
  if (selectionTooltip?.matches(":popover-open")) selectionTooltip.hidePopover();
}, { passive: true });
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
// Press the hovered corner toward the page; the stable shell avoids feedback jitter.
if (
  matchMedia("(hover: hover) and (pointer: fine)").matches &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  document.querySelectorAll<HTMLElement>(".score-shell").forEach((shell) => {
    const card = shell.querySelector<HTMLElement>(".score-card")!;
    let rect: DOMRect | undefined,
      frame = 0,
      x = 0,
      y = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      rect = undefined;
      card.style.removeProperty("--tilt-x");
      card.style.removeProperty("--tilt-y");
    };
    shell.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      rect ??= shell.getBoundingClientRect();
      x = e.clientX;
      y = e.clientY;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          const px = Math.max(
            -0.5,
            Math.min(0.5, (x - rect!.left) / rect!.width - 0.5),
          );
          const py = Math.max(
            -0.5,
            Math.min(0.5, (y - rect!.top) / rect!.height - 0.5),
          );
          card.style.setProperty("--tilt-x", `${-py * 6}deg`);
          card.style.setProperty("--tilt-y", `${px * 6}deg`);
        });
    });
    shell.addEventListener("pointerleave", reset);
    shell.addEventListener("pointercancel", reset);
    window.addEventListener("scroll", reset, { passive: true });
  });
}
