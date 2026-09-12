import test from "node:test";
import assert from "node:assert/strict";
import {
  developmentCardCounts,
  developmentResourceChoiceCount,
} from "../client/developmentCards";

test("owned development cards are grouped in a stable recognizable order", () => {
  assert.deepEqual(
    developmentCardCounts([
      { type: "victory" },
      { type: "knight" },
      { type: "plenty" },
      { type: "knight" },
      { type: "roadBuilding" },
      { type: "monopoly" },
    ]),
    [
      { type: "knight", count: 2 },
      { type: "roadBuilding", count: 1 },
      { type: "plenty", count: 1 },
      { type: "monopoly", count: 1 },
      { type: "victory", count: 1 },
    ],
  );
});

test("an empty development hand has no identifiable cards", () => {
  assert.deepEqual(developmentCardCounts([]), []);
});

test("monopoly chooses one resource while year of plenty chooses two", () => {
  assert.equal(developmentResourceChoiceCount("monopoly"), 1);
  assert.equal(developmentResourceChoiceCount("plenty"), 2);
  assert.equal(developmentResourceChoiceCount("knight"), 0);
});
