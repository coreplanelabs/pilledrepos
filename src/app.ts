import {
  themePreference,
  resolveTheme,
  type ThemePreference,
} from "./theme.js";
let preference: ThemePreference = "system";
try {
  preference = themePreference(localStorage.getItem("ai-pilled-theme"));
} catch {}
const system = matchMedia("(prefers-color-scheme: dark)"),
  select = document.querySelector<HTMLSelectElement>("#theme");
function apply() {
  document.documentElement.dataset.theme = resolveTheme(
    preference,
    system.matches,
  );
  if (select) select.value = preference;
}
apply();
system.addEventListener("change", apply);
select?.addEventListener("change", () => {
  preference = themePreference(select.value);
  try {
    localStorage.setItem("ai-pilled-theme", preference);
  } catch {}
  apply();
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
