import test from "node:test";
import assert from "node:assert/strict";
import { formatGameDuration } from "../client/duration";

test("game durations stay readable from seconds through multi-hour games", () => {
  assert.equal(formatGameDuration(0), "0s");
  assert.equal(formatGameDuration(59_999), "59s");
  assert.equal(formatGameDuration(65_000), "1m 05s");
  assert.equal(formatGameDuration(7_445_000), "2h 04m 05s");
});
