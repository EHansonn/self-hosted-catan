import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  DEFAULT_OPTIONS,
  makePlayer,
  viewGame,
} from "../shared/game";
import {
  threeBoardStaticKey,
  threeBoardVisualKey,
} from "../client/threeBoardScene";

function sceneProps(): Parameters<typeof threeBoardVisualKey>[0] {
  const game = createGame(
    Array.from({ length: 4 }, (_, index) =>
      makePlayer(`p${index}`, `Player ${index}`, index, true, "normal"),
    ),
    DEFAULT_OPTIONS,
    2173,
  );
  const view = viewGame(game, "p0");
  return {
    board: view.board,
    players: view.players,
    robber: view.robber,
    kind: null,
    highlights: [],
  };
}

test("3D scene ignores player updates that do not change the board", () => {
  const props = sceneProps();
  const updated = structuredClone(props);
  updated.players[0].cardCount += 2;
  updated.players[1].devCount += 1;

  assert.equal(threeBoardVisualKey(updated), threeBoardVisualKey(props));
});

test("3D placements update pieces without rebuilding static terrain", () => {
  const props = sceneProps();
  const placed = structuredClone(props);
  placed.board.edges[0].owner = placed.players[0].id;

  assert.notEqual(threeBoardVisualKey(placed), threeBoardVisualKey(props));
  assert.equal(
    threeBoardStaticKey(placed.board),
    threeBoardStaticKey(props.board),
  );
});
