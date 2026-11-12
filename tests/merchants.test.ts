import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction, createGame, DEFAULT_OPTIONS, emptyHand, finalGameResults,
  makePlayer, points, RESOURCES, viewGame,
} from "../shared/game";
import { GUILD_CONTRACTS, guildPoints } from "../shared/merchants";
import { chooseBotAction } from "../shared/bot";

function fresh(enabled = true) {
  const g = createGame(
    Array.from({ length: 4 }, (_, i) => makePlayer(`p${i}`, `Player ${i}`, i)),
    { ...DEFAULT_OPTIONS, merchantsGuild: enabled }, 22,
  );
  g.phase = "main";
  return g;
}
function fund(g: ReturnType<typeof fresh>, id: number) {
  for (const resource of RESOURCES) {
    const count = GUILD_CONTRACTS[id].cost[resource] ?? 0;
    g.players[0].resources[resource] += count;
    g.bank[resource] -= count;
  }
}

test("guild is opt-in and old saved games keep classic scores", () => {
  const g = fresh(false);
  assert.equal(g.guildContracts, undefined);
  assert.throws(() => applyAction(g, "p0", { type: "deliverContract", id: 0 }), /not enabled/);
  delete g.players[0].guildDeliveries;
  assert.equal(points(g, g.players[0]), 0);
  assert.equal(finalGameResults(g, "OLD").players[0].total, 0);
});

test("eight contract designs each require three cards; markets have three unique contracts", () => {
  assert.equal(GUILD_CONTRACTS.length, 8);
  for (const c of GUILD_CONTRACTS)
    assert.equal(Object.values(c.cost).reduce((a, b) => a + b, 0), 3);
  const g = fresh();
  assert.equal(g.guildContracts!.length, 3);
  assert.equal(new Set(g.guildContracts).size, 3);
  assert.deepEqual(viewGame(g, "spectator").guildContracts, g.guildContracts);
});

test("delivery spends resources into bank, replaces only its contract, and is public", () => {
  const g = fresh();
  const id = g.guildContracts![0];
  fund(g, id);
  const before = structuredClone(g);
  const next = applyAction(g, "p0", { type: "deliverContract", id }, () => 0);
  assert.deepEqual(g, before, "engine leaves input untouched");
  assert.deepEqual(next.players[0].resources, emptyHand());
  for (const resource of RESOURCES)
    assert.equal(next.bank[resource], before.bank[resource] + (GUILD_CONTRACTS[id].cost[resource] ?? 0));
  assert.equal(next.players[0].guildDeliveries, 1);
  assert.equal(points(next, next.players[0]), 0);
  assert.deepEqual(next.guildContracts!.slice(1), before.guildContracts!.slice(1));
  assert.ok(!next.guildContracts!.includes(id));
  assert.equal(new Set(next.guildContracts).size, 3);
  assert.match(next.log.at(-1)!.text, /1\/4 deliveries, 0 guild points/);
  assert.equal(viewGame(next, "p1").players[0].guildDeliveries, 1);
  assert.throws(() => applyAction(next, "p0", { type: "deliverContract", id }), /no longer available/);
});

test("four deliveries award two public points, survive serialization, and then stop", () => {
  let g = fresh();
  for (let n = 1; n <= 4; n++) {
    const id = g.guildContracts![0];
    fund(g, id);
    g = applyAction(g, "p0", { type: "deliverContract", id });
    g = JSON.parse(JSON.stringify(g));
    assert.equal(points(g, g.players[0], false), Math.floor(n / 2));
    assert.equal(viewGame(g, "p1").players[0].points, Math.floor(n / 2));
  }
  const result = finalGameResults(g, "GUILD").players.find(p => p.id === "p0")!;
  assert.equal(result.guildPoints, 2);
  assert.equal(result.total, 2);
  assert.equal(guildPoints(100), 2);
  assert.throws(() => applyAction(g, "p0", { type: "deliverContract", id: g.guildContracts![0] }), /all four/);
});

test("delivery validates player, turn, phase, open trade, affordability and contract", () => {
  const g = fresh();
  const action = { type: "deliverContract" as const, id: g.guildContracts![0] };
  assert.throws(() => applyAction(g, "spectator", action), /not seated/);
  assert.throws(() => applyAction(g, "p1", action), /another player's turn/);
  assert.throws(() => applyAction(g, "p0", action), /more resources/);
  fund(g, action.id);
  for (const phase of ["roll", "setupSettlement", "robber", "discard", "freeRoad", "finished"] as const) {
    const copy = structuredClone(g); copy.phase = phase;
    assert.throws(() => applyAction(copy, "p0", action));
  }
  g.secondary = true;
  assert.throws(() => applyAction(g, "p0", action), /main turn/);
  g.secondary = false;
  for (const id of [-1, 100, 0.5, NaN])
    assert.throws(() => applyAction(g, "p0", { ...action, id }), /no longer available/);
  g.offer = { id: 1, from: "p0", give: emptyHand(), want: emptyHand(), approved: [], rejected: [] };
  assert.throws(() => applyAction(g, "p0", action), /Finish the open trade/);
});

test("delivery can win immediately and earns the configured action time bonus", () => {
  const g = fresh();
  g.players[0].guildDeliveries = 1;
  g.options.target = 1;
  const id = g.guildContracts![0]; fund(g, id);
  const won = applyAction(g, "p0", { type: "deliverContract", id });
  assert.equal(won.phase, "finished");
  assert.equal(won.winner, "p0");
  assert.equal(won.deadline, null);
  g.options.target = 10;
  g.deadline = Date.now() + 60_000;
  const next = applyAction(g, "p0", { type: "deliverContract", id });
  assert.equal(next.deadline, g.deadline + g.options.turnActionBonus * 1000);
});

test("bots deliver affordable contracts and respect completion and paired turns", () => {
  const g = fresh();
  const id = g.guildContracts![0]; fund(g, id);
  assert.deepEqual(chooseBotAction(g, g.players[0]), { type: "deliverContract", id });
  g.players[0].guildDeliveries = 4;
  assert.notEqual(chooseBotAction(g, g.players[0])?.type, "deliverContract");
  g.players[0].guildDeliveries = 0; g.secondary = true;
  assert.notEqual(chooseBotAction(g, g.players[0])?.type, "deliverContract");
});

test("complete guild games with bots finish at classic and expanded tables", () => {
  for (const seats of [4, 6]) {
    let g = createGame(
      Array.from({ length: seats }, (_, i) => makePlayer(`p${i}`, `Bot ${i}`, i, true)),
      { ...DEFAULT_OPTIONS, seats, merchantsGuild: true }, 22,
    );
    let deliveries = 0;
    for (let n = 0; n < 5000 && g.phase !== "finished"; n++) {
      let moved = false;
      for (const p of g.players) {
        const action = chooseBotAction(g, p);
        if (!action) continue;
        if (action.type === "deliverContract") deliveries++;
        g = applyAction(g, p.id, action);
        moved = true;
        break;
      }
      assert.ok(moved, `stalled in ${g.phase}`);
    }
    assert.equal(g.phase, "finished", `${seats}-seat game did not finish`);
    assert.ok(deliveries > 0);
    assert.ok(g.players.every(p => (p.guildDeliveries ?? 0) <= 4));
    for (const r of RESOURCES)
      assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), seats <= 4 ? 19 : 24);
  }
});
