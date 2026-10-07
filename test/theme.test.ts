import test from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, themePreference } from "../src/theme.js";
test("system tracks OS while explicit choices override it", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});
test("missing or corrupt stored preference defaults to system", () => {
  for (const value of [null, undefined, "broken", {}, "system"]) assert.equal(themePreference(value), "system");
  assert.equal(themePreference("dark"), "dark");
});
