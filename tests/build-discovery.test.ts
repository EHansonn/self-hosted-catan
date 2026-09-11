import assert from "node:assert/strict";
import test from "node:test";
import { affordableBuildOptions } from "../client/buildDiscovery";

const legal = {
  roads: [2, 7],
  settlements: [4],
  cities: [9, 12],
};

test("board discovery exposes only build types the player can afford", () => {
  assert.deepEqual(
    affordableBuildOptions(
      { wood: 1, brick: 1, sheep: 0, wheat: 2, ore: 3 },
      legal,
    ),
    {
      road: [2, 7],
      settlement: [],
      city: [9, 12],
    },
  );
});

test("board discovery never invents locations beyond server legal lists", () => {
  assert.deepEqual(
    affordableBuildOptions(
      { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 },
      { roads: [], settlements: [], cities: [] },
    ),
    { road: [], settlement: [], city: [] },
  );
});
