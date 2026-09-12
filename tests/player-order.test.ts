import test from "node:test";
import assert from "node:assert/strict";
import { randomPlayerOrder } from "../shared/game";
import { orderPlayersForViewer } from "../client/playerOrder";

const players = ["Taco", "Mira", "Atlas", "Casey"].map((id) => ({ id }));

test("match order is shuffled without mutating or losing seated players", () => {
  const ordered = randomPlayerOrder(players, () => 0);

  assert.deepEqual(ordered.map(({ id }) => id), ["Mira", "Atlas", "Casey", "Taco"]);
  assert.deepEqual(players.map(({ id }) => id), ["Taco", "Mira", "Atlas", "Casey"]);
  assert.deepEqual(
    [...ordered].map(({ id }) => id).sort(),
    players.map(({ id }) => id).sort(),
  );
});

test("each viewer sees the turn cycle continue from the top and end with their seat", () => {
  assert.deepEqual(
    orderPlayersForViewer(players, "Atlas").map(({ id }) => id),
    ["Casey", "Taco", "Mira", "Atlas"],
  );
  assert.deepEqual(
    orderPlayersForViewer(players, "Taco").map(({ id }) => id),
    ["Mira", "Atlas", "Casey", "Taco"],
  );
  for (const viewer of players) {
    const viewerIndex = players.findIndex(({ id }) => id === viewer.id);
    const visible = orderPlayersForViewer(players, viewer.id);
    assert.equal(visible.at(-1)?.id, viewer.id);
    assert.deepEqual(
      visible.slice(0, -1).map(({ id }) => id),
      [
        ...players.slice(viewerIndex + 1),
        ...players.slice(0, viewerIndex),
      ].map(({ id }) => id),
    );
  }
});

test("the reported game order renders Mira, Reef, Atlas, then the viewer", () => {
  const gameOrder = ["Reef", "Atlas", "Casey", "Mira"].map((id) => ({ id }));
  assert.deepEqual(
    orderPlayersForViewer(gameOrder, "Casey").map(({ id }) => id),
    ["Mira", "Reef", "Atlas", "Casey"],
  );
});

test("spectators or stale viewers retain authoritative order", () => {
  assert.deepEqual(
    orderPlayersForViewer(players, "missing").map(({ id }) => id),
    ["Taco", "Mira", "Atlas", "Casey"],
  );
});
