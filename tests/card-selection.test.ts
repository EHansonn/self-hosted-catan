import test from "node:test";
import assert from "node:assert/strict";
import { addCardToSelection } from "../client/cardSelection";
import { emptyHand } from "../shared/game";

test("card selection cannot exceed its required total", () => {
  const selection = { ...emptyHand(), wood: 2, brick: 1 };

  assert.deepEqual(addCardToSelection(selection, "sheep", 4, 3), selection);
});

test("card selection can grow until its total or resource limit", () => {
  const selection = { ...emptyHand(), wood: 1 };
  const atResourceLimit = addCardToSelection(selection, "wood", 1, 3);
  const incremented = addCardToSelection(selection, "brick", 2, 3);

  assert.strictEqual(atResourceLimit, selection);
  assert.deepEqual(incremented, { ...selection, brick: 1 });
});
