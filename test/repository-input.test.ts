import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepository } from "../src/core.js";

test("repo input normalizes pasted GitHub links with optional scheme and www", () => {
  for (const input of [
    "coreplanelabs/switchboard",
    "github.com/coreplanelabs/switchboard",
    "www.github.com/coreplanelabs/switchboard/",
    "https://github.com/coreplanelabs/switchboard",
    "https://www.github.com/coreplanelabs/switchboard.git",
    "http://github.com/coreplanelabs/switchboard",
    "http://www.github.com/coreplanelabs/switchboard",
    "//github.com/coreplanelabs/switchboard?tab=readme#overview",
    "  GitHub.com/coreplanelabs/switchboard  ",
  ])
    assert.equal(parseRepository(input), "coreplanelabs/switchboard");

  for (const input of [
    "github.com.evil.test/coreplanelabs/switchboard",
    "https://github.com@evil.test/coreplanelabs/switchboard",
    "https://person@github.com/coreplanelabs/switchboard",
    "https://github.com:444/coreplanelabs/switchboard",
    "ftp://github.com/coreplanelabs/switchboard",
    "www.github.com/coreplanelabs/switchboard/issues/1",
  ])
    assert.throws(() => parseRepository(input));
});
