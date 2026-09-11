import assert from "node:assert/strict";
import test from "node:test";
import type { GameView } from "../shared/game";
import {
  getTurnAttention,
  playTurnNotification,
} from "../client/turnNotifications";

const game = (changes: Partial<GameView> = {}) =>
  ({
    players: [
      { id: "me", automated: false },
      { id: "other", automated: false },
    ],
    current: 0,
    phase: "roll",
    turn: 4,
    setupStep: 0,
    secondary: false,
    discards: {},
    ...changes,
  }) as GameView;

test("turn attention stays stable across routine phase and state updates", () => {
  const roll = getTurnAttention(game(), "ABC123", "me", false, false);
  const main = getTurnAttention(
    game({ phase: "main", version: 99 }),
    "ABC123",
    "me",
    false,
    false,
  );
  assert.equal(roll?.key, "ABC123:4:turn");
  assert.equal(main?.key, roll?.key);
  assert.equal(main?.label, "Your turn");
  assert.equal(
    getTurnAttention(game({ current: 1 }), "ABC123", "me", false, false),
    null,
  );
});

test("required setup, discard, robber and free-road actions get distinct alerts", () => {
  const setup = getTurnAttention(
    game({ phase: "setupSettlement", setupStep: 2 }),
    "ABC123",
    "me",
    false,
    false,
  );
  const road = getTurnAttention(
    game({ phase: "setupRoad", setupStep: 2 }),
    "ABC123",
    "me",
    false,
    false,
  );
  assert.equal(setup?.key, road?.key);
  assert.equal(setup?.label, "Opening placement");

  const discard = getTurnAttention(
    game({ phase: "discard", discards: { me: 4 } }),
    "ABC123",
    "me",
    false,
    false,
  );
  assert.equal(discard?.label, "Discard 4 cards");
  assert.equal(
    getTurnAttention(
      game({ phase: "discard", discards: { other: 4 } }),
      "ABC123",
      "me",
      false,
      false,
    ),
    null,
  );

  const robber = getTurnAttention(
    game({ phase: "robber" }),
    "ABC123",
    "me",
    false,
    false,
  );
  const steal = getTurnAttention(
    game({ phase: "steal" }),
    "ABC123",
    "me",
    false,
    false,
  );
  assert.equal(robber?.key, steal?.key);
  assert.equal(
    getTurnAttention(game({ phase: "freeRoad" }), "ABC123", "me", false, false)
      ?.label,
    "Place your free roads",
  );
});

test("special build attention is named explicitly", () => {
  assert.equal(
    getTurnAttention(
      game({ phase: "main", secondary: true }),
      "ABC123",
      "me",
      false,
      false,
    )?.label,
    "Your special build phase",
  );
});

test("paused, finished and bot-assisted seats do not request attention", () => {
  assert.equal(getTurnAttention(game(), "ABC123", "me", true, false), null);
  assert.equal(
    getTurnAttention(game({ phase: "finished" }), "ABC123", "me", false, false),
    null,
  );
  assert.equal(getTurnAttention(game(), "ABC123", "me", false, true), null);
});

test("notification volume mutes at zero and schedules one three-note chime", () => {
  let oscillators = 0;
  const context = {
    state: "running",
    currentTime: 1,
    destination: {},
    createOscillator: () => {
      oscillators++;
      return {
        type: "sine",
        frequency: { setValueAtTime: () => {} },
        connect: (node: unknown) => node,
        start: () => {},
        stop: () => {},
      };
    },
    createGain: () => ({
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
    }),
  } as unknown as AudioContext;

  playTurnNotification(context, 0);
  assert.equal(oscillators, 0);
  playTurnNotification(context, 1);
  assert.equal(oscillators, 3);
});
