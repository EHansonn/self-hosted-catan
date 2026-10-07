import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { applyAction, createGame, DEFAULT_OPTIONS, makePlayer, note } from "../shared/game";
import { chooseBotAction } from "../shared/bot";
import { appendReplayFrame, signReplay, startReplay, verifyReplay } from "../server/replay";

function sampleReplay(roomCode = "ABC123") {
  const game = createGame(
    [makePlayer("private-session-A", "Alice", 0), makePlayer("private-session-B", "Bob", 1)],
    { ...DEFAULT_OPTIONS, seats: 2 },
    12,
  );
  const replay = startReplay(game, "0123456789abcdef01234567", roomCode);
  assert.equal(appendReplayFrame(replay, game), true);
  game.version++;
  game.board.vertices[0].owner = game.players[0].id;
  game.players[0].resources.ore = 3;
  game.players[0].dev.push({ type: "roadBuilding", bought: 1 });
  game.players[1].resources.wood = 2;
  game.players[1].dev.push({ type: "victory", bought: 1 });
  note(game, "Alice builds a settlement.", "action", "turn-1", { "private-session-A": "secret hand" });
  assert.equal(appendReplayFrame(replay, game), true);
  game.players[0].resources.ore = 1;
  game.players[1].resources.wood = 0;
  game.phase = "finished";
  game.winner = game.players[0].id;
  game.finishedAt = Date.now();
  game.version++;
  assert.equal(appendReplayFrame(replay, game), true);
  return replay;
}

test("server-created replays verify and reveal each player's changing hand only in the completed replay", () => {
  const key = randomBytes(32);
  const replay = sampleReplay();
  const signed = signReplay(replay, key);
  assert.ok(signed);
  assert.deepEqual(verifyReplay(JSON.parse(JSON.stringify(signed)), key), signed);
  assert.equal(replay.frames[0].buildings[0][0], null);
  assert.equal(replay.frames[1].buildings[0][0], 0);
  assert.equal(replay.frames[2].phase, "finished");
  assert.equal(replay.frames[2].players[0].points >= 0, true);
  assert.equal(replay.frames[0].players[0].resources.ore, 0);
  assert.equal(replay.frames[1].players[0].resources.ore, 3);
  assert.equal(replay.frames[2].players[0].resources.ore, 1);
  assert.deepEqual(replay.frames[1].players[0].developmentCards, ["roadBuilding"]);
  assert.equal(replay.frames[1].players[1].resources.wood, 2);
  assert.equal(replay.frames[2].players[1].resources.wood, 0);
  assert.deepEqual(replay.frames[2].players[1].developmentCards, ["victory"]);
  const serialized = JSON.stringify(signed);
  for (const secret of ["private-session-A", "private-session-B", "secret hand", "\"deck\"", "privateText"])
    assert.equal(serialized.includes(secret), false, secret);
  assert.equal(signed.version, 2);
  assert.equal(verifyReplay(signed, randomBytes(32)), null);
  const changed = JSON.parse(serialized);
  changed.payload.frames[1].buildings[0][0] = 1;
  assert.equal(verifyReplay(changed, key), null);
  const extra = { ...signed, unverified: "field" };
  assert.equal(verifyReplay(extra, key), null);
  assert.equal(verifyReplay({ ...signed, version: 1 }, key), null);
});

test("legacy room codes remain exportable and incomplete replays cannot be signed", () => {
  const key = randomBytes(32);
  assert.ok(signReplay(sampleReplay("0123456789ABCDEF"), key));
  const partial = sampleReplay();
  partial.frames.pop();
  partial.finishedAt = null;
  partial.winner = null;
  assert.equal(signReplay(partial, key), null);
});

test("a complete bot game records a signable replay without session IDs", () => {
  let game = createGame(
    [makePlayer("private-a", "A", 0, true), makePlayer("private-b", "B", 1, true)],
    { ...DEFAULT_OPTIONS, seats: 2 }, 109,
  );
  const replay = startReplay(game, "a".repeat(24), "ABC123");
  assert.equal(appendReplayFrame(replay, game), true);
  for (let step = 0; step < 5000 && game.phase !== "finished"; step++) {
    const next = game.players.map((player) => ({ player, action: chooseBotAction(game, player) }))
      .find(({ action }) => action);
    assert.ok(next?.action, `stalled at ${game.phase}`);
    game = applyAction(game, next.player.id, next.action);
    assert.equal(appendReplayFrame(replay, game), true);
  }
  assert.equal(game.phase, "finished");
  const signed = signReplay(replay, randomBytes(32));
  assert.ok(signed);
  assert.equal(signed.payload.frames.at(-1)?.phase, "finished");
  assert.equal(JSON.stringify(signed).includes("private-a"), false);
});

test("the largest supported board remains within the replay format limits", () => {
  const game = createGame(
    Array.from({ length: 12 }, (_, index) => makePlayer(`private-${index}`, `Player ${index}`, index, true)),
    { ...DEFAULT_OPTIONS, seats: 12 }, 110,
  );
  const replay = startReplay(game, "b".repeat(24), "QWERTY");
  assert.equal(appendReplayFrame(replay, game), true);
  game.players[11].resources.wood = 4;
  game.players[11].dev.push({ type: "victory", bought: 1 });
  game.phase = "finished";
  game.winner = game.players[0].id;
  game.finishedAt = Date.now();
  game.version++;
  assert.equal(appendReplayFrame(replay, game), true);
  const key = randomBytes(32);
  const signed = signReplay(replay, key);
  assert.ok(signed);
  assert.ok(verifyReplay(signed, key));
  assert.equal(signed.payload.frames.at(-1)?.players[11].resources.wood, 4);
  assert.deepEqual(signed.payload.frames.at(-1)?.players[11].developmentCards, ["victory"]);
});
