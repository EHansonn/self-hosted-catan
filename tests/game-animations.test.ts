import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OPTIONS,
  createGame,
  makePlayer,
  viewGame,
  type GameView,
} from "../shared/game";
import { deriveGameplayAnimation } from "../client/gameAnimations";

function view(): GameView {
  const players = Array.from({ length: 4 }, (_, index) =>
    makePlayer(`p${index}`, `Player ${index}`, index),
  );
  return viewGame(createGame(players, DEFAULT_OPTIONS, 90210), "p0");
}

test("a roll highlights unblocked matching hexes and flies paid resources", () => {
  const previous = view();
  previous.phase = "roll";
  previous.dice = [];
  previous.version = 12;
  const tile = previous.board.tiles.find(
    (candidate) => candidate.terrain !== "desert" && candidate.id !== previous.robber,
  )!;
  tile.number = 8;
  const resource = tile.terrain as Exclude<typeof tile.terrain, "desert">;
  const vertex = previous.board.vertices[tile.vertices[0]];
  vertex.owner = "p1";
  vertex.city = true;

  const next = structuredClone(previous);
  next.version++;
  next.phase = "main";
  next.dice = [3, 5];
  next.bank[resource] -= 2;

  const cue = deriveGameplayAnimation(previous, next)!;
  assert.equal(cue.roll, 8);
  assert.ok(cue.rolledTiles.includes(tile.id));
  assert.deepEqual(cue.resourceFlights, [
    { resource, tileId: tile.id, playerId: "p1", amount: 2 },
  ]);
});

test("blocked matching hexes do not light or send resource cards", () => {
  const previous = view();
  previous.phase = "roll";
  previous.dice = [];
  previous.version = 4;
  const blocked = previous.board.tiles[previous.robber];
  blocked.number = 6;
  const next = structuredClone(previous);
  next.version++;
  next.phase = "main";
  next.dice = [3, 3];

  const cue = deriveGameplayAnimation(previous, next)!;
  assert.equal(cue.roll, 6);
  assert.equal(cue.rolledTiles.includes(blocked.id), false);
  assert.deepEqual(cue.resourceFlights, []);
});

test("linked 2 and 12 rolls highlight and animate both numbers", () => {
  const previous = view();
  previous.phase = "roll";
  previous.dice = [];
  previous.version = 20;
  previous.options.linkedTwoTwelve = true;
  const tileTwo = previous.board.tiles.find(
    (tile) => tile.terrain !== "desert" && tile.id !== previous.robber,
  )!;
  const tileTwelve = previous.board.tiles.find(
    (tile) =>
      tile.terrain !== "desert" &&
      tile.terrain !== tileTwo.terrain &&
      tile.id !== previous.robber &&
      !tile.vertices.some((vertex) => tileTwo.vertices.includes(vertex)),
  )!;
  previous.board.tiles.forEach((tile) => {
    if (tile.terrain !== "desert") tile.number = 8;
  });
  tileTwo.number = 2;
  tileTwelve.number = 12;
  previous.board.vertices[tileTwo.vertices[0]].owner = "p1";
  previous.board.vertices[tileTwelve.vertices[0]].owner = "p2";

  const next = structuredClone(previous);
  next.version++;
  next.phase = "main";
  next.dice = [1, 1];
  next.bank[tileTwo.terrain as Exclude<typeof tileTwo.terrain, "desert">]--;
  next.bank[tileTwelve.terrain as Exclude<typeof tileTwelve.terrain, "desert">]--;

  const cue = deriveGameplayAnimation(previous, next)!;
  assert.equal(cue.roll, 2);
  assert.deepEqual(new Set(cue.rolledTiles), new Set([tileTwo.id, tileTwelve.id]));
  assert.ok(
    cue.resourceFlights.some(
      (flight) => flight.tileId === tileTwo.id && flight.playerId === "p1",
    ),
  );
  assert.ok(
    cue.resourceFlights.some(
      (flight) => flight.tileId === tileTwelve.id && flight.playerId === "p2",
    ),
  );
});

test("placements and robber moves are detected without exposing hands", () => {
  const previous = view();
  previous.version = 7;
  const next = structuredClone(previous);
  next.version++;
  next.board.edges[2].owner = "p2";
  next.board.vertices[3].owner = "p3";
  next.board.vertices[4].owner = "p1";
  previous.board.vertices[4].owner = "p1";
  next.board.vertices[4].city = true;
  next.robber = next.robber === 0 ? 1 : 0;

  const cue = deriveGameplayAnimation(previous, next)!;
  assert.deepEqual(cue.placements, [
    { kind: "road", id: 2, owner: "p2" },
    { kind: "settlement", id: 3, owner: "p3" },
    { kind: "city", id: 4, owner: "p1" },
  ]);
  assert.deepEqual(cue.robber, { from: previous.robber, to: next.robber });
  assert.equal("resources" in cue, false);
});

test("monopoly flies each stolen resource stack to the player who used it", () => {
  const previous = view();
  previous.version = 30;
  previous.players[0].cardCount = 2;
  previous.players[1].cardCount = 5;
  previous.players[2].cardCount = 4;
  previous.players[3].cardCount = 1;

  const next = structuredClone(previous);
  next.version++;
  next.players[0].cardCount = 8;
  next.players[1].cardCount = 3;
  next.players[2].cardCount = 1;
  next.players[3].cardCount = 0;
  next.log.push({
    id: (next.log.at(-1)?.id || 0) + 1,
    player: "p0",
    kind: "dev",
    group: "turn-4",
    text: "Player 0 plays Monopoly and takes 6 ore from the other players.",
  });

  const cue = deriveGameplayAnimation(previous, next)!;
  assert.deepEqual(cue.resourceFlights, [
    { resource: "ore", sourcePlayerId: "p1", playerId: "p0", amount: 2 },
    { resource: "ore", sourcePlayerId: "p2", playerId: "p0", amount: 3 },
    { resource: "ore", sourcePlayerId: "p3", playerId: "p0", amount: 1 },
  ]);
  assert.equal(cue.roll, null);
  assert.deepEqual(cue.rolledTiles, []);
});

test("ordinary card-count changes do not create monopoly flights", () => {
  const previous = view();
  previous.version = 40;
  const next = structuredClone(previous);
  next.version++;
  next.players[1].cardCount--;
  next.players[2].cardCount++;
  next.log.push({
    id: (next.log.at(-1)?.id || 0) + 1,
    player: "p1",
    kind: "trade",
    group: "turn-5",
    text: "Player 1 trades with Player 2.",
  });

  assert.equal(deriveGameplayAnimation(previous, next), null);
});

test("reconnects and skipped versions do not replay stale animations", () => {
  const previous = view();
  const next = structuredClone(previous);
  next.version += 2;
  next.board.edges[0].owner = "p1";
  assert.equal(deriveGameplayAnimation(null, next), null);
  assert.equal(deriveGameplayAnimation(previous, next), null);
});
