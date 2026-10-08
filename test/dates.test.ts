import { test } from "node:test";
import assert from "node:assert/strict";
import {
  friendlyDate,
  friendlyRange,
  friendlyTimestamp,
  readAge,
} from "../src/dates.js";
test("window dates use readable month names and stay in UTC", () => {
  assert.equal(friendlyDate("2026-10-07T00:30:00Z"), "Oct 7, 2026");
  assert.equal(
    friendlyRange("2026-07-09T22:05:00Z", "2026-10-07T22:05:00Z"),
    "Jul 9 – Oct 7, 2026",
  );
  assert.match(
    friendlyRange("2025-12-20T00:00:00Z", "2026-01-02T00:00:00Z"),
    /2025.*2026/,
  );
});
test("read age stays concise across minutes, hours and days without future negatives", () => {
  const now = Date.parse("2026-10-08T20:00:00Z");
  assert.equal(readAge("2026-10-08T19:59:45Z", now), "just now");
  assert.equal(readAge("2026-10-08T19:48:00Z", now), "12m ago");
  assert.equal(readAge("2026-10-08T16:05:00Z", now), "3h ago");
  assert.equal(readAge("2026-10-06T20:00:00Z", now), "2d ago");
  assert.equal(readAge("2026-10-08T20:01:00Z", now), "just now");
  assert.equal(readAge("bad", now), "not available");
});
test("read timestamps can show the viewer timezone without changing the stored capture", () => {
  assert.match(
    friendlyTimestamp("2026-10-07T22:05:09Z", "America/Los_Angeles"),
    /Oct 7, 2026.*3:05 PM PDT/,
  );
  assert.equal(friendlyDate("bad"), "Not available");
});
