import test from "node:test";
import assert from "node:assert/strict";
import {
  disconnectedPlayerExpired,
  nextDisconnectedSince,
  nextUnattendedSince,
  unattendedGameExpired,
} from "../shared/room-lifecycle";

test("an ongoing game starts one stable absence clock without human viewers", () => {
  assert.equal(nextUnattendedSince(undefined, true, false, 1_000), 1_000);
  assert.equal(nextUnattendedSince(1_000, true, false, 9_000), 1_000);
  assert.equal(nextUnattendedSince(undefined, false, false, 1_000), undefined);
});

test("a human viewer cancels cleanup and the full grace period must elapse", () => {
  assert.equal(nextUnattendedSince(1_000, true, true, 2_000), undefined);
  assert.equal(unattendedGameExpired(1_000, 180_999, 180_000), false);
  assert.equal(unattendedGameExpired(1_000, 181_000, 180_000), true);
  assert.equal(unattendedGameExpired(undefined, 999_000, 180_000), false);
});

test("a disconnected seat only ages toward takeover while another human watches", () => {
  assert.equal(
    nextDisconnectedSince(undefined, true, false, true, 1_000),
    1_000,
  );
  assert.equal(
    nextDisconnectedSince(1_000, true, false, true, 9_000),
    1_000,
  );
  assert.equal(
    nextDisconnectedSince(1_000, true, false, false, 12_000),
    1_000,
  );
  assert.equal(
    nextDisconnectedSince(1_000, true, true, true, 12_000),
    undefined,
  );
  assert.equal(
    nextDisconnectedSince(1_000, false, false, true, 12_000),
    undefined,
  );
  assert.equal(disconnectedPlayerExpired(1_000, 120_999, 120_000), false);
  assert.equal(disconnectedPlayerExpired(1_000, 121_000, 120_000), true);
});
