import test from "node:test";
import assert from "node:assert/strict";
import { friendlyTimestamp } from "../src/dates.js";
test("read time uses a long English date and the reader's supplied timezone", () => {
	const time = "1990-05-14T01:30:00Z";
	assert.match(friendlyTimestamp(time, "UTC"), /^May 14, 1990 · 1:30 AM UTC$/);
	assert.match(
		friendlyTimestamp(time, "America/Los_Angeles"),
		/^May 13, 1990 · 6:30 PM PDT$/,
	);
	assert.equal(friendlyTimestamp("bad"), "Not available");
});
