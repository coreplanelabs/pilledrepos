import { friendlyTimestamp } from "./dates.js";
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
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.themeChoice === preference),
      ),
    );
}
apply();
system.addEventListener("change", apply);
document
  .querySelectorAll<HTMLButtonElement>("[data-theme-choice]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      preference = themePreference(button.dataset.themeChoice);
      try {
        localStorage.setItem("ai-pilled-theme", preference);
      } catch {}
      apply();
    }),
  );
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
document
  .querySelectorAll<HTMLTimeElement>("time[data-timestamp]")
  .forEach((time) => {
    time.textContent = friendlyTimestamp(time.dateTime, timeZone);
  });
document.querySelector("#share")?.addEventListener("click", async () => {
  const canonical = document.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  )?.href;
  if (!canonical) return;
  const status = document.querySelector<HTMLElement>("#status");
  try {
    await navigator.clipboard.writeText(canonical);
    if (status) {
      status.textContent = "Repo link copied";
      status.hidden = false;
      setTimeout(() => (status.hidden = true), 3000);
    }
  } catch {
    if (status) {
      status.textContent = "Copy the URL from your address bar.";
      status.hidden = false;
    }
  }
});
