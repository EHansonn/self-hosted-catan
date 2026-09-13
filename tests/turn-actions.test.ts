import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyHand,
  type GameView,
  type PublicPlayer,
} from "../shared/game";
import { hasRemainingTurnAction } from "../client/turnActions";

function turnState() {
  const player: PublicPlayer = {
    id: "p0",
    name: "Evan",
    color: "#f4ae32",
    bot: false,
    difficulty: "normal",
    connected: true,
    resources: emptyHand(),
    dev: [],
    cardCount: 0,
    devCount: 0,
    points: 2,
    knights: 0,
    roadLength: 1,
    playedDev: false,
  };
  const game: Pick<
    GameView,
    "bank" | "deckCount" | "legal" | "players" | "secondary" | "turn"
  > = {
    bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 },
    deckCount: 20,
    legal: {
      roads: [1],
      settlements: [2],
      cities: [3],
      robber: [1],
      ratios: { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 },
    },
    players: [player, { ...player, id: "p1", name: "Atlas" }],
    secondary: false,
    turn: 8,
  };
  return { game, player };
}

test("an empty hand with no playable development cards prompts ending the turn", () => {
  const { game, player } = turnState();
  assert.equal(hasRemainingTurnAction(game, player), false);
});

test("affordable builds, purchases and trades keep the end-turn prompt quiet", () => {
  const { game, player } = turnState();
  player.resources = { ...emptyHand(), wood: 1, brick: 1 };
  assert.equal(hasRemainingTurnAction(game, player), true);

  player.resources = { ...emptyHand(), sheep: 1, wheat: 1, ore: 1 };
  assert.equal(hasRemainingTurnAction(game, player), true);

  player.resources = { ...emptyHand(), wood: 1 };
  game.legal.roads = [];
  assert.equal(hasRemainingTurnAction(game, player), true);

  player.resources = { ...emptyHand(), wood: 4 };
  game.secondary = true;
  assert.equal(hasRemainingTurnAction(game, player), true);
});

test("only development cards that can be played now count as remaining actions", () => {
  const { game, player } = turnState();
  player.dev = [{ type: "knight", bought: game.turn - 1 }];
  assert.equal(hasRemainingTurnAction(game, player), true);

  player.dev = [{ type: "knight", bought: game.turn }];
  assert.equal(hasRemainingTurnAction(game, player), false);

  player.dev = [{ type: "roadBuilding", bought: game.turn - 1 }];
  game.legal.roads = [];
  assert.equal(hasRemainingTurnAction(game, player), false);
});
