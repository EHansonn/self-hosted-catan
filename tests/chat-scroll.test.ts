import test from "node:test";
import assert from "node:assert/strict";
import { isNearLatest } from "../client/chatScroll";

test("short feeds and exact-bottom feeds stay pinned to the latest item", () => {
  assert.equal(
    isNearLatest({ scrollHeight: 180, scrollTop: 0, clientHeight: 220 }),
    true,
  );
  assert.equal(
    isNearLatest({ scrollHeight: 600, scrollTop: 300, clientHeight: 300 }),
    true,
  );
});

test("small scroll rounding stays pinned but reading history does not", () => {
  assert.equal(
    isNearLatest({ scrollHeight: 600, scrollTop: 277, clientHeight: 300 }),
    true,
  );
  assert.equal(
    isNearLatest({ scrollHeight: 600, scrollTop: 240, clientHeight: 300 }),
    false,
  );
});
