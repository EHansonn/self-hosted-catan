import test from "node:test";
import assert from "node:assert/strict";
import {
  makeBoard,
  boardProfileForPlayers,
  bankCardsPerResource,
  createGame,
  makePlayer,
  DEFAULT_OPTIONS,
  mapGenerationRules,
  applyAction,
  RESOURCES,
  type Game,
  type Difficulty,
  type Hand,
  emptyHand,
  total,
  produce,
  roadSites,
  settlementSites,
  robberSites,
  points,
  finalGameResults,
  gameRuntimeMs,
  roadLength,
  viewGame,
  ratios,
  phaseTimerSeconds,
  canResumeRoom,
  toggleSpecialBuildRequest,
  hasSpecialBuildAction,
  expirePlayerTrade,
} from "../shared/game";
import { chooseBotAction, chooseTimeoutAction } from "../shared/bot";
const fresh = (n = 4, seed = 22, difficulty: Difficulty = "normal") =>
  createGame(
    Array.from({ length: n }, (_, i) =>
      makePlayer("p" + i, "Player " + i, i, true, difficulty),
    ),
    { ...DEFAULT_OPTIONS, seats: n },
    seed,
  );

test("only lobbies and unfinished games can be resumed", () => {
  const game = fresh();
  assert.equal(canResumeRoom(null), true);
  assert.equal(canResumeRoom(game), true);
  game.phase = "finished";
  assert.equal(canResumeRoom(game), false);
});

test('options: friendly robber, random board, classic expanded turns and alternate victory targets complete',()=>{
  for(const n of [2,4,5,6,7,8,9,10,11,12])for(const target of [8,10]){
    let g=fresh(n,n*51+target,'hard');g.options={...g.options,target,friendlyRobber:true,paired:false,balanced:false};g.board=makeBoard(n,n*51+target,false);g.robber=g.board.tiles.find(t=>t.terrain==='desert')!.id;
    for(let actions=0;g.phase!=='finished'&&actions<7000;actions++){
      let moved=false;for(const p of g.players){const a=chooseBotAction(g,p);if(a){g=applyAction(g,p.id,a);invariant(g);moved=true;break;}}
      assert.ok(moved,`No action available for ${g.phase}`);
    }
    assert.equal(g.phase,'finished',`${n} seats / ${target} points did not finish`);
  }
});
function invariant(g: Game) {
  for (const r of RESOURCES) {
    assert.equal(
      g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0),
      bankCardsPerResource(g.players.length),
      `${r} conservation`,
    );
    assert.ok(g.bank[r] >= 0);
    g.players.forEach((p) => assert.ok(p.resources[r] >= 0));
  }
  for (const p of g.players) {
    assert.ok(g.board.edges.filter((e) => e.owner === p.id).length <= 15);
    assert.ok(
      g.board.vertices.filter((v) => v.owner === p.id && !v.city).length <= 5,
    );
    assert.ok(
      g.board.vertices.filter((v) => v.owner === p.id && v.city).length <= 4,
    );
  }
}
function setup(g: Game) {
  while (g.phase.startsWith("setup")) {
    const p = g.players[g.current],
      a = chooseBotAction(g, p)!;
    g = applyAction(g, p.id, a);
  }
  return g;
}
function grant(g: Game, id: string, h: Partial<Hand>) {
  const p = g.players.find((p) => p.id === id)!;
  for (const r of RESOURCES) {
    const n = h[r] || 0;
    p.resources[r] += n;
    g.bank[r] -= n;
  }
}
function clearResources(g: Game, id: string) {
  const player = g.players.find((candidate) => candidate.id === id)!;
  for (const resource of RESOURCES) {
    g.bank[resource] += player.resources[resource];
    player.resources[resource] = 0;
  }
}
test("boards scale from 2–12 players with valid topology, separated defaults and ports", () => {
  assert.equal(DEFAULT_OPTIONS.allowSixEightTouch, false);
  assert.equal(DEFAULT_OPTIONS.allowTwoTwelveTouch, true);
  assert.equal(DEFAULT_OPTIONS.allowSameNumbersTouch, true);
  assert.equal(DEFAULT_OPTIONS.allowSameResourcesTouch, false);
  const expected = new Map([
    [2, { tiles: 19, deserts: 1, ports: 9 }],
    [4, { tiles: 19, deserts: 1, ports: 9 }],
    [5, { tiles: 30, deserts: 2, ports: 11 }],
    [6, { tiles: 30, deserts: 2, ports: 11 }],
    [7, { tiles: 37, deserts: 2, ports: 13 }],
    [8, { tiles: 37, deserts: 2, ports: 13 }],
    [9, { tiles: 52, deserts: 3, ports: 15 }],
    [10, { tiles: 52, deserts: 3, ports: 15 }],
    [11, { tiles: 61, deserts: 3, ports: 17 }],
    [12, { tiles: 61, deserts: 3, ports: 17 }],
  ]);
  for (const n of expected.keys())
    for (let seed = 1; seed <= 40; seed++) {
      const b = makeBoard(n, seed);
      const profile = expected.get(n)!;
      assert.equal(b.tiles.length, profile.tiles);
      assert.equal(boardProfileForPlayers(n).tiles, profile.tiles);
      assert.equal(
        b.tiles.filter((t) => t.terrain === "desert").length,
        profile.deserts,
      );
      assert.equal(b.ports.length, profile.ports);
      assert.equal(
        b.tiles.filter((tile) => tile.number > 0).length,
        profile.tiles - profile.deserts,
      );
      assert.ok(
        b.edges.every(
          (e) =>
            e.tiles.length < 2 ||
            !e.tiles.every((id) => [6, 8].includes(b.tiles[id].number)),
        ),
      );
      assert.ok(
        b.edges.every(
          (e) =>
            e.tiles.length < 2 ||
            e.tiles.some((id) => b.tiles[id].terrain === "desert") ||
            b.tiles[e.tiles[0]].terrain !== b.tiles[e.tiles[1]].terrain,
        ),
      );
      assert.ok(
        b.vertices.every((v) => v.edges.length >= 2 && v.edges.length <= 3),
      );
      const portCorners = b.ports.flatMap((p) => [
        b.edges[p.edge].a,
        b.edges[p.edge].b,
      ]);
      assert.equal(new Set(portCorners).size, portCorners.length);
    }
});
test("map generation honors every neighboring-tile rule", () => {
  const strictRules = {
    allowSixEightTouch: false,
    allowTwoTwelveTouch: false,
    allowSameNumbersTouch: false,
    allowSameResourcesTouch: false,
  };
  for (const players of [2, 6, 8, 10, 12])
    for (let seed = 1; seed <= 12; seed++) {
      const board = makeBoard(players, seed, strictRules);
      for (const edge of board.edges) {
        if (edge.tiles.length < 2) continue;
        const [left, right] = edge.tiles.map((id) => board.tiles[id]);
        assert.ok(
          left.terrain === "desert" ||
            right.terrain === "desert" ||
            left.terrain !== right.terrain,
        );
        assert.ok(
          !([6, 8].includes(left.number) && [6, 8].includes(right.number)),
        );
        assert.ok(
          !(
            [2, 12].includes(left.number) &&
            [2, 12].includes(right.number)
          ),
        );
        assert.ok(
          left.number === 0 ||
            right.number === 0 ||
            left.number !== right.number,
        );
      }
    }
  assert.deepEqual(
    mapGenerationRules({ ...DEFAULT_OPTIONS, balanced: false }),
    {
      allowSixEightTouch: true,
      allowTwoTwelveTouch: true,
      allowSameNumbersTouch: true,
      allowSameResourcesTouch: true,
    },
  );
});
test("snake setup gives two settlements, two roads and resources only from second placement", () => {
  let g = fresh(6);
  const order: string[] = [];
  while (g.phase.startsWith("setup")) {
    const p = g.players[g.current];
    if (g.phase === "setupSettlement") order.push(p.id);
    g = applyAction(g, p.id, chooseBotAction(g, p)!);
    invariant(g);
  }
  assert.deepEqual(order, [
    "p0",
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p5",
    "p4",
    "p3",
    "p2",
    "p1",
    "p0",
  ]);
  assert.equal(g.phase, "roll");
  for (const p of g.players) {
    assert.equal(points(g, p), 2);
    assert.equal(g.board.edges.filter((e) => e.owner === p.id).length, 2);
    assert.ok(total(p.resources) <= 3);
  }
});
test("illegal and out-of-turn actions are rejected atomically", () => {
  const g = fresh();
  const before = JSON.stringify(g);
  assert.throws(
    () => applyAction(g, "p1", { type: "settlement", id: 0 }),
    /another/,
  );
  assert.throws(() => applyAction(g, "p0", { type: "roll" }));
  assert.throws(() => applyAction(g, "p0", { type: "settlement", id: 999 }));
  assert.equal(JSON.stringify(g), before);
});
test("building requires a network and correct costs; city returns a settlement to supply", () => {
  let g = setup(fresh());
  g.phase = "main";
  const p = g.players[0];
  const site = g.board.vertices.find((v) => v.owner === "p0")!;
  grant(g, "p0", { ore: 3, wheat: 2 });
  const before = { ...p.resources };
  g = applyAction(g, "p0", { type: "city", id: site.id });
  assert.equal(g.board.vertices[site.id].city, true);
  assert.equal(g.players[0].resources.ore, before.ore - 3);
  assert.equal(points(g, g.players[0]), 3);
  const valid = roadSites(g, g.players[0]);
  assert.ok(valid.length);
  assert.throws(() =>
    applyAction(g, "p0", {
      type: "road",
      id: g.board.edges.find((e) => !e.owner && !valid.includes(e.id))!.id,
    }),
  );
  invariant(g);
});
test("production accounts for cities, robber and finite bank shortages", () => {
  const g = fresh();
  g.phase = "main";
  const tile = g.board.tiles.find((t) => t.terrain === "wood")!;
  g.robber = g.board.tiles.find((t) => t.terrain === "desert")!.id;
  tile.number = 8;
  const v = g.board.vertices[tile.vertices[0]];
  v.owner = "p0";
  v.city = true;
  produce(g, 8);
  assert.equal(g.players[0].resources.wood, 2);
  assert.equal(g.log.at(-1)?.text, "Player 0 gets 2 wood.");
  assert.equal(g.log.at(-1)?.kind, "gain");
  g.robber = tile.id;
  produce(g, 8);
  assert.equal(g.players[0].resources.wood, 2);
  g.robber = -1;
  grant(g, "p1", { wood: 16 });
  g.board.vertices[tile.vertices[2]].owner = "p2";
  produce(g, 8);
  assert.equal(g.players[0].resources.wood, 2);
  assert.equal(g.players[2].resources.wood, 0);
  invariant(g);
});
test("the optional linked 2 and 12 rule produces from both numbers", () => {
  const base = fresh();
  base.robber = base.board.tiles.find((tile) => tile.terrain === "desert")!.id;
  const tileTwo = base.board.tiles.find((tile) => tile.terrain !== "desert")!;
  const tileTwelve = base.board.tiles.find(
    (tile) =>
      tile.terrain !== "desert" &&
      tile.id !== tileTwo.id &&
      !tile.vertices.some((vertex) => tileTwo.vertices.includes(vertex)),
  )!;
  base.board.tiles.forEach((tile) => {
    if (tile.terrain !== "desert") tile.number = 8;
  });
  tileTwo.number = 2;
  tileTwelve.number = 12;
  base.board.vertices[tileTwo.vertices[0]].owner = "p0";
  base.board.vertices[tileTwelve.vertices[0]].owner = "p1";

  const standard = structuredClone(base);
  produce(standard, 2);
  assert.equal(total(standard.players[0].resources), 1);
  assert.equal(total(standard.players[1].resources), 0);

  const linked = structuredClone(base);
  linked.options.linkedTwoTwelve = true;
  produce(linked, 2);
  assert.equal(total(linked.players[0].resources), 1);
  assert.equal(total(linked.players[1].resources), 1);
  produce(linked, 12);
  assert.equal(total(linked.players[0].resources), 2);
  assert.equal(total(linked.players[1].resources), 2);
  invariant(linked);
});
test("discard validates count; robber auto-steals a sole victim and asks among multiple", () => {
  let g = setup(fresh());
  g.phase = "discard";
  g.discards = { p0: 4 };
  grant(g, "p0", { wood: 4, ore: 4 });
  assert.throws(() =>
    applyAction(g, "p0", { type: "discard", cards: emptyHand() }),
  );
  assert.throws(() =>
    applyAction(g, "p0", {
      type: "discard",
      cards: { ...emptyHand(), wood: 4, ore: 1 },
    }),
  );
  g.options.timer = 60;
  g.deadline = 1;
  g = applyAction(g, "p0", {
    type: "discard",
    cards: { ...emptyHand(), wood: 4 },
  });
  assert.equal(g.phase, "robber");
  assert.ok(g.deadline! > Date.now() + 18000);
  assert.ok(g.deadline! <= Date.now() + 20000);
  const tile = g.board.tiles.find(
    (t) =>
      t.id !== g.robber &&
      t.vertices.some((v) => g.board.vertices[v].owner === "p1"),
  )!;
  g.players.filter((player) => player.id !== "p0" && player.id !== "p1").forEach((player) =>
    RESOURCES.forEach((resource) => {
      g.bank[resource] += player.resources[resource];
      player.resources[resource] = 0;
    }),
  );
  RESOURCES.forEach((resource) => {
    g.bank[resource] += g.players[1].resources[resource];
    g.players[1].resources[resource] = 0;
  });
  grant(g, "p1", { wheat: 1 });
  const before = total(g.players[0].resources);
  g.deadline = 1;
  g = applyAction(g, "p0", { type: "robber", id: tile.id });
  assert.equal(g.phase, "main");
  assert.ok(g.deadline! > Date.now() + 58000);
  assert.deepEqual(g.victims, []);
  assert.equal(total(g.players[0].resources), before + 1);
  assert.equal(g.log.at(-1)?.text, "Player 0 steals a card from Player 1.");
  assert.equal(
    viewGame(g, "p0").log.at(-1)?.text,
    "Player 0 steals 1 wheat from Player 1.",
  );
  assert.equal(
    viewGame(g, "p1").log.at(-1)?.text,
    "Player 0 steals 1 wheat from Player 1.",
  );
  assert.equal(
    viewGame(g, "p2").log.at(-1)?.text,
    "Player 0 steals a card from Player 1.",
  );
  assert.ok(!("privateText" in viewGame(g, "p0").log.at(-1)!));
  invariant(g);

  let choice = fresh();
  choice.phase = "robber";
  choice.resumePhase = "main";
  const crowded = choice.board.tiles.find((t) => t.id !== choice.robber)!;
  choice.board.vertices[crowded.vertices[0]].owner = "p1";
  choice.board.vertices[crowded.vertices[2]].owner = "p2";
  grant(choice, "p1", { wheat: 1 });
  grant(choice, "p2", { ore: 1 });
  choice.options.timer = 60;
  choice.deadline = 1;
  choice = applyAction(choice, "p0", { type: "robber", id: crowded.id });
  assert.equal(choice.phase, "steal");
  assert.ok(choice.deadline! > Date.now() + 8000);
  assert.ok(choice.deadline! <= Date.now() + 10000);
  assert.deepEqual(new Set(choice.victims), new Set(["p1", "p2"]));
  const choiceBefore = total(choice.players[0].resources);
  choice.deadline = 1;
  choice = applyAction(choice, "p0", { type: "steal", player: "p1" });
  assert.equal(total(choice.players[0].resources), choiceBefore + 1);
  assert.equal(choice.phase, "main");
  assert.ok(choice.deadline! > Date.now() + 58000);
  invariant(choice);
});

test("discard history always reveals your cards and follows the table visibility setting", () => {
  const cards = { ...emptyHand(), wood: 2, brick: 1 };
  let visible = fresh();
  visible.phase = "discard";
  visible.discards = { p0: 3 };
  grant(visible, "p0", cards);
  visible = applyAction(visible, "p0", { type: "discard", cards });
  assert.equal(
    viewGame(visible, "p1").log.at(-1)?.text,
    "Player 0 discards 2 wood and 1 brick.",
  );

  let anonymous = fresh();
  anonymous.options.showDiscardedCards = false;
  anonymous.phase = "discard";
  anonymous.discards = { p0: 3 };
  grant(anonymous, "p0", cards);
  anonymous = applyAction(anonymous, "p0", { type: "discard", cards });
  assert.equal(
    viewGame(anonymous, "p0").log.at(-1)?.text,
    "Player 0 discards 2 wood and 1 brick.",
  );
  assert.equal(
    viewGame(anonymous, "p1").log.at(-1)?.text,
    "Player 0 discards 3 cards.",
  );
  assert.ok(!("privateText" in viewGame(anonymous, "p0").log.at(-1)!));
});
test("bank trades and ports validate ratio, same-resource trades and empty banks", () => {
  let g = setup(fresh());
  g.phase = "main";
  const port = g.board.ports.find((p) => p.resource === "wood")!,
    edge = g.board.edges[port.edge];
  g.board.vertices[edge.a].owner = "p0";
  assert.equal(ratios(g, g.players[0]).wood, 2);
  grant(g, "p0", { wood: 4 });
  const before = g.players[0].resources.wood;
  g = applyAction(g, "p0", {
    type: "bank",
    give: { ...emptyHand(), wood: 4 },
    want: { ...emptyHand(), ore: 2 },
  });
  assert.equal(g.players[0].resources.wood, before - 4);
  grant(g, "p0", { sheep: 8 });
  const beforeBatch = { ...g.players[0].resources };
  g = applyAction(g, "p0", {
    type: "bank",
    give: { ...emptyHand(), sheep: 8 },
    want: { ...emptyHand(), wheat: 1, ore: 1 },
  });
  assert.equal(g.players[0].resources.sheep, beforeBatch.sheep - 8);
  assert.equal(g.players[0].resources.wheat, beforeBatch.wheat + 1);
  assert.equal(g.players[0].resources.ore, beforeBatch.ore + 1);
  grant(g, "p0", { wood: 2, sheep: 4 });
  const beforeMixed = { ...g.players[0].resources };
  g = applyAction(g, "p0", {
    type: "bank",
    give: { ...emptyHand(), wood: 2, sheep: 4 },
    want: { ...emptyHand(), brick: 1, wheat: 1 },
  });
  assert.equal(g.players[0].resources.wood, beforeMixed.wood - 2);
  assert.equal(g.players[0].resources.sheep, beforeMixed.sheep - 4);
  assert.equal(g.players[0].resources.brick, beforeMixed.brick + 1);
  assert.equal(g.players[0].resources.wheat, beforeMixed.wheat + 1);
  assert.throws(() =>
    applyAction(g, "p0", {
      type: "bank",
      give: { ...emptyHand(), ore: 4 },
      want: { ...emptyHand(), ore: 1 },
    }),
  );
  assert.throws(() =>
    applyAction(g, "p0", {
      type: "bank",
      give: { ...emptyHand(), sheep: 7 },
      want: { ...emptyHand(), wheat: 1 },
    }),
  );
  g.players[1].resources.brick += g.bank.brick;
  g.bank.brick = 0;
  grant(g, "p0", { sheep: 4 });
  const beforeShortage = { ...g.players[0].resources };
  assert.throws(
    () =>
      applyAction(g, "p0", {
        type: "bank",
        give: { ...emptyHand(), sheep: 4 },
        want: { ...emptyHand(), brick: 1 },
      }),
    /short/,
  );
  assert.deepEqual(g.players[0].resources, beforeShortage);
  invariant(g);
});
test("counteroffers preserve active-player trading, ownership and stale-offer safety", () => {
  let g = setup(fresh());
  g.phase = "main";
  grant(g, "p0", { wood: 4 });
  grant(g, "p1", { ore: 2 });
  const give = { ...emptyHand(), wood: 1 }, want = { ...emptyHand(), ore: 1 };
  g = applyAction(g, "p0", { type: "offer", give, want });
  const originalId = g.offer!.id;
  assert.throws(() => applyAction(g, "p1", { type: "counter", offerId: originalId, give: { ...want, ore: 19 }, want: give }), /offered/);
  g = applyAction(g, "p1", { type: "counter", offerId: originalId, give: want, want: { ...give, wood: 2 } });
  assert.equal(g.offer!.to, "p0");
  g = applyAction(g, "p1", { type: "counter", offerId: g.offer!.id, give: want, want: { ...give, wood: 2 } });
  assert.equal(g.offer!.to, "p0", "editing a counteroffer keeps its recipient");
  const counterId = g.offer!.id;
  assert.throws(() => applyAction(g, "p0", { type: "accept", offerId: originalId }), /available/);
  assert.throws(() => applyAction(g, "p2", { type: "accept", offerId: counterId }), /available/);
  assert.throws(() => applyAction(g, "p2", { type: "counter", offerId: counterId, give, want }), /available/);
  assert.throws(() => applyAction(g, "p2", { type: "cancelTrade" }), /cancel/);
  const before = { ...g.players[0].resources };
  g = applyAction(g, "p0", { type: "accept", offerId: counterId });
  assert.equal(g.players[0].resources.wood, before.wood - 2);
  assert.equal(g.players[0].resources.ore, before.ore + 1);
  assert.equal(g.offer, null);
  invariant(g);
  g = applyAction(g, "p0", { type: "offer", give, want });
  g = applyAction(g, "p1", { type: "counter", offerId: g.offer!.id, give: want, want: give });
  g = applyAction(g, "p1", { type: "cancelTrade" });
  assert.equal(g.offer, null);
  g.secondary = true;
  assert.throws(() => applyAction(g, "p0", { type: "counter", offerId: counterId, give, want }), /available/);
});
test("trade creators choose among approving players before cards move", () => {
  let g = setup(fresh());
  g.phase = "main";
  RESOURCES.forEach((resource) => {
    g.bank[resource] += g.players[3].resources[resource];
    g.players[3].resources[resource] = 0;
  });
  grant(g, "p0", { wood: 1 });
  grant(g, "p1", { ore: 1 });
  grant(g, "p2", { ore: 1 });
  g = applyAction(g, "p0", {
    type: "offer",
    give: { ...emptyHand(), wood: 1 },
    want: { ...emptyHand(), ore: 1 },
  });
  const offerId = g.offer!.id;
  const beforeApproval = structuredClone(g.players.map((player) => player.resources));
  assert.throws(
    () => applyAction(g, "p0", { type: "accept", offerId }),
    /approved/,
  );
  const beforeInvalidApproval = structuredClone(g.players.map((player) => player.resources));
  assert.throws(
    () => applyAction(g, "p3", { type: "accept", offerId }),
    /do not have the cards requested/,
  );
  assert.deepEqual(g.offer!.approved, []);
  assert.deepEqual(g.players.map((player) => player.resources), beforeInvalidApproval);
  g = applyAction(g, "p1", { type: "accept", offerId });
  g = applyAction(g, "p2", { type: "accept", offerId });
  assert.deepEqual(g.offer!.approved, ["p1", "p2"]);
  assert.deepEqual(
    g.players.map((player) => player.resources),
    beforeApproval,
    "approvals must not move cards",
  );
  assert.throws(
    () =>
      applyAction(g, "p0", {
        type: "accept",
        offerId,
        player: "p3",
    }),
    /approved/,
  );
  const approvedPlayerOre = g.players[2].resources.ore;
  g.bank.ore += approvedPlayerOre;
  g.players[2].resources.ore = 0;
  assert.throws(
    () => applyAction(g, "p0", { type: "accept", offerId, player: "p2" }),
    /no longer has those cards/,
  );
  assert.ok(g.offer, "an unaffordable trade must remain unsettled");
  g.players[2].resources.ore = approvedPlayerOre;
  g.bank.ore -= approvedPlayerOre;
  g = applyAction(g, "p0", { type: "accept", offerId, player: "p2" });
  assert.equal(g.offer, null);
  assert.deepEqual(g.players[1].resources, beforeApproval[1]);
  assert.equal(g.players[2].resources.ore, beforeApproval[2].ore - 1);
  assert.equal(g.players[2].resources.wood, beforeApproval[2].wood + 1);
  assert.equal(g.players[0].resources.wood, beforeApproval[0].wood - 1);
  assert.equal(g.players[0].resources.ore, beforeApproval[0].ore + 1);
  assert.throws(() => applyAction(g, "p1", { type: "accept", offerId }));
  invariant(g);
});
test("player trades pause the turn clock and restore a minimum action window", () => {
  let g = setup(fresh());
  g.phase = "main";
  g.options.tradeTimer = 30;
  g.options.postTradeTimer = 15;
  grant(g, "p0", { wood: 2 });
  const give = { ...emptyHand(), wood: 1 };
  const want = { ...emptyHand(), ore: 1 };
  g.deadline = Date.now() + 5_000;

  g = applyAction(g, "p0", { type: "offer", give, want });
  assert.ok(g.offer);
  assert.ok(g.resumeTime! > 4_000 && g.resumeTime! <= 5_000);
  assert.ok(g.deadline! > Date.now() + 28_000);
  assert.ok(g.deadline! <= Date.now() + 30_000);
  assert.throws(
    () => applyAction(g, "p0", { type: "end" }),
    /open trade/,
  );

  const offerId = g.offer.id;
  g = applyAction(g, "p1", { type: "reject", offerId });
  g = applyAction(g, "p2", { type: "reject", offerId });
  assert.ok(g.offer);
  g = applyAction(g, "p3", { type: "reject", offerId });
  assert.equal(g.offer, null);
  assert.equal(g.resumeTime, null);
  assert.ok(g.deadline! > Date.now() + 14_000);
  assert.ok(g.deadline! <= Date.now() + 15_000);

  g.deadline = Date.now() + 3_000;
  g = applyAction(g, "p0", { type: "offer", give, want });
  g = expirePlayerTrade(g);
  assert.equal(g.offer, null);
  assert.ok(g.deadline! > Date.now() + 14_000);
  assert.match(g.log.at(-1)?.text || "", /trade offer expires/);
  invariant(g);
});
test("development card age, one per turn, two matching plenty cards and monopoly", () => {
  let g = setup(fresh());
  g.phase = "main";
  g.players[0].dev = [{ type: "plenty", bought: g.turn }];
  assert.throws(
    () =>
      applyAction(g, "p0", {
        type: "dev",
        card: "plenty",
        resources: ["ore", "ore"],
      }),
    /bought/,
  );
  g.players[0].dev[0].bought = 0;
  const before = g.players[0].resources.ore;
  g = applyAction(g, "p0", {
    type: "dev",
    card: "plenty",
    resources: ["ore", "ore"],
  });
  assert.equal(g.players[0].resources.ore, before + 2);
  assert.equal(
    g.log.at(-1)?.text,
    "Player 0 plays Year of Plenty and gets 2 ore.",
  );
  g.players[0].dev.push({ type: "monopoly", bought: 0 });
  assert.throws(
    () =>
      applyAction(g, "p0", {
        type: "dev",
        card: "monopoly",
        resources: ["wood"],
      }),
    /one/,
  );
  g.players[0].playedDev = false;
  grant(g, "p1", { wood: 2 });
  grant(g, "p2", { wood: 1 });
  const monopolizedWood = g.players
    .slice(1)
    .reduce((sum, player) => sum + player.resources.wood, 0);
  g = applyAction(g, "p0", {
    type: "dev",
    card: "monopoly",
    resources: ["wood"],
  });
  assert.ok(g.players.slice(1).every((p) => !p.resources.wood));
  assert.equal(
    g.log.at(-1)?.text,
    `Player 0 plays Monopoly and takes ${monopolizedWood} wood from the other players.`,
  );
  invariant(g);
});
test("knight exposes every legal robber hex for circular placement targets", () => {
  let g = setup(fresh());
  g.phase = "main";
  g.turn = Math.max(1, g.turn);
  g.options.timer = 60;
  g.deadline = Date.now() + 60000;
  g.players[0].dev = [{ type: "knight", bought: g.turn - 1 }];
  const oldRobber = g.robber;
  g = applyAction(g, "p0", { type: "dev", card: "knight" });
  const legal = viewGame(g, "p0").legal.robber;
  assert.equal(g.phase, "robber");
  assert.ok(g.deadline! > Date.now() + 18000);
  assert.ok(g.deadline! <= Date.now() + 20000);
  assert.ok(g.resumeTime! > 58000);
  assert.equal(legal.length, g.board.tiles.length - 1);
  assert.ok(!legal.includes(oldRobber));
  assert.equal(new Set(legal).size, legal.length);
});
test("the robber can never remain on its current hex, including timeouts", () => {
  for (const friendlyRobber of [false, true]) {
    for (let seed = 1; seed <= 24; seed++) {
      const game = setup(fresh(4, seed));
      game.phase = "robber";
      game.options.friendlyRobber = friendlyRobber;
      const player = game.players[game.current];
      const currentHex = game.robber;

      assert.ok(!robberSites(game, player).includes(currentHex));
      assert.ok(!viewGame(game, player.id).legal.robber.includes(currentHex));
      assert.throws(
        () => applyAction(game, player.id, { type: "robber", id: currentHex }),
        /another eligible hex/,
      );

      const timeoutAction = chooseTimeoutAction(game, player);
      assert.equal(timeoutAction?.type, "robber");
      if (timeoutAction?.type === "robber")
        assert.notEqual(timeoutAction.id, currentHex);

      const botAction = chooseBotAction(game, player);
      assert.equal(botAction?.type, "robber");
      if (botAction?.type === "robber")
        assert.notEqual(botAction.id, currentHex);
    }
  }
});
test("timed-out robber placement avoids the acting player's buildings when possible", () => {
  const game = setup(fresh(4, 39));
  game.phase = "robber";
  const player = game.players[game.current];
  const preferred = robberSites(game, player).filter((id) =>
    game.board.tiles[id].vertices.every(
      (vertexId) => game.board.vertices[vertexId].owner !== player.id,
    ),
  );
  assert.ok(preferred.length > 0);

  const move = chooseTimeoutAction(game, player);
  assert.equal(move?.type, "robber");
  if (move?.type === "robber") assert.ok(preferred.includes(move.id));

  const noPreferredSite = structuredClone(game);
  const fallbackPlayer = noPreferredSite.players[noPreferredSite.current];
  noPreferredSite.board.vertices.forEach((vertex) => {
    vertex.owner = fallbackPlayer.id;
  });
  const legal = robberSites(noPreferredSite, fallbackPlayer);
  const fallback = chooseTimeoutAction(noPreferredSite, fallbackPlayer);
  assert.equal(fallback?.type, "robber");
  if (fallback?.type === "robber") assert.ok(legal.includes(fallback.id));
});
test("required actions, discards and main turns use their own clocks", () => {
  let opening = fresh();
  opening.options.timer = 60;
  opening.options.setupSettlementTimer = 120;
  opening.options.setupRoadTimer = 20;
  opening.options.actionTimer = 10;
  opening.deadline = 1;
  opening = applyAction(opening, "p0", chooseBotAction(opening, opening.players[0])!);
  assert.equal(opening.phase, "setupRoad");
  assert.ok(opening.deadline! > Date.now() + 18000);
  assert.ok(opening.deadline! <= Date.now() + 20000);
  opening.deadline = 1;
  opening = applyAction(opening, "p0", chooseBotAction(opening, opening.players[0])!);
  assert.equal(opening.phase, "setupSettlement");
  assert.ok(opening.deadline! > Date.now() + 118000);
  assert.ok(opening.deadline! <= Date.now() + 120000);

  let turn = setup(fresh());
  turn.options.timer = 60;
  turn.options.actionTimer = 10;
  turn.options.robberTimer = 20;
  turn.options.discardTimer = 20;
  turn.phase = "roll";
  turn.deadline = 1;
  turn.rng = 1;
  turn = applyAction(turn, "p0", { type: "roll" });
  assert.equal(turn.phase, "main");
  assert.ok(turn.deadline! > Date.now() + 58000);
  assert.equal(phaseTimerSeconds(turn.options, "roll"), 10);
  assert.equal(phaseTimerSeconds(turn.options, "setupSettlement"), 120);
  assert.equal(phaseTimerSeconds(turn.options, "setupRoad"), 20);
  assert.equal(phaseTimerSeconds(turn.options, "robber"), 20);
  assert.equal(phaseTimerSeconds(turn.options, "steal"), 10);
  assert.equal(phaseTimerSeconds(turn.options, "discard"), 20);
  assert.equal(phaseTimerSeconds(turn.options, "main"), 60);

  let roads = setup(fresh());
  roads.options.timer = 60;
  roads.options.actionTimer = 10;
  roads.phase = "main";
  roads.turn = Math.max(1, roads.turn);
  roads.deadline = Date.now() + 60000;
  roads.players[0].dev = [{ type: "roadBuilding", bought: roads.turn - 1 }];
  roads = applyAction(roads, "p0", { type: "dev", card: "roadBuilding" });
  assert.equal(roads.phase, "freeRoad");
  assert.ok(roads.deadline! > Date.now() + 8000);
  assert.ok(roads.deadline! <= Date.now() + 10000);
  assert.ok(roads.resumeTime! > 58000);
  roads.deadline = 1;
  roads = applyAction(roads, "p0", chooseBotAction(roads, roads.players[0])!);
  assert.equal(roads.phase, "freeRoad");
  assert.equal(roads.freeRoads, 1);
  assert.ok(roads.deadline! > Date.now() + 8000);
  roads = applyAction(roads, "p0", { type: "skipRoad" });
  assert.equal(roads.phase, "main");
  assert.ok(roads.deadline! > Date.now() + 57000);
  invariant(roads);
});
test("builds and played development cards add configurable time to the active turn", () => {
  const bonusMs = 15_000;
  let g = setup(fresh());
  g.phase = "main";
  g.options.turnActionBonus = 15;

  const city = g.board.vertices.find(
    (vertex) => vertex.owner === "p0" && !vertex.city,
  )!;
  grant(g, "p0", { wheat: 2, ore: 3 });
  let deadline = Date.now() + 5_000;
  g.deadline = deadline;
  g = applyAction(g, "p0", { type: "city", id: city.id });
  assert.equal(g.deadline, deadline + bonusMs);

  grant(g, "p0", { wood: 1, brick: 1 });
  deadline = g.deadline!;
  g = applyAction(g, "p0", {
    type: "road",
    id: roadSites(g, g.players[0])[0],
  });
  assert.equal(g.deadline, deadline + bonusMs);

  while (!settlementSites(g, g.players[0]).length) {
    const extension = roadSites(g, g.players[0])[0];
    assert.notEqual(extension, undefined);
    g.board.edges[extension].owner = "p0";
  }
  grant(g, "p0", { wood: 1, brick: 1, sheep: 1, wheat: 1 });
  deadline = g.deadline!;
  g = applyAction(g, "p0", {
    type: "settlement",
    id: settlementSites(g, g.players[0])[0],
  });
  assert.equal(g.deadline, deadline + bonusMs);

  g.turn = Math.max(1, g.turn);
  g.players[0].playedDev = false;
  g.players[0].dev.push({ type: "plenty", bought: g.turn - 1 });
  deadline = g.deadline!;
  g = applyAction(g, "p0", {
    type: "dev",
    card: "plenty",
    resources: ["wood", "brick"],
  });
  assert.equal(g.deadline, deadline + bonusMs);

  let knight = setup(fresh());
  knight.phase = "main";
  knight.turn = Math.max(1, knight.turn);
  knight.options.turnActionBonus = 15;
  knight.deadline = Date.now() + 5_000;
  knight.players[0].dev = [{ type: "knight", bought: knight.turn - 1 }];
  knight = applyAction(knight, "p0", { type: "dev", card: "knight" });
  assert.equal(knight.phase, "robber");
  assert.ok(knight.resumeTime! > 19_000);
  assert.ok(knight.resumeTime! <= 20_000);
  assert.ok(knight.deadline! > Date.now() + 18_000);
  assert.ok(knight.deadline! <= Date.now() + 20_000);

  let disabled = setup(fresh());
  disabled.phase = "main";
  disabled.options.turnActionBonus = 0;
  const disabledCity = disabled.board.vertices.find(
    (vertex) => vertex.owner === "p0" && !vertex.city,
  )!;
  grant(disabled, "p0", { wheat: 2, ore: 3 });
  deadline = Date.now() + 5_000;
  disabled.deadline = deadline;
  disabled = applyAction(disabled, "p0", {
    type: "city",
    id: disabledCity.id,
  });
  assert.equal(disabled.deadline, deadline);
});
test("expired required actions choose random legal fallbacks", () => {
  const opening = fresh();
  const settlement = chooseTimeoutAction(opening, opening.players[0]);
  assert.equal(settlement?.type, "settlement");
  if (settlement?.type === "settlement")
    assert.ok(settlementSites(opening, opening.players[0], true).includes(settlement.id));

  const roadOpening = settlement?.type === "settlement"
    ? applyAction(opening, "p0", settlement)
    : opening;
  const road = chooseTimeoutAction(roadOpening, roadOpening.players[0]);
  assert.equal(road?.type, "road");
  if (road?.type === "road")
    assert.ok(roadSites(roadOpening, roadOpening.players[0], true).includes(road.id));

  const roll = setup(fresh());
  assert.deepEqual(chooseTimeoutAction(roll, roll.players[0]), { type: "roll" });

  const robber = setup(fresh());
  robber.phase = "robber";
  const move = chooseTimeoutAction(robber, robber.players[0]);
  assert.equal(move?.type, "robber");
  if (move?.type === "robber")
    assert.ok(robberSites(robber, robber.players[0]).includes(move.id));

  const stolenFrom = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const choice = fresh(4, seed);
    choice.phase = "steal";
    choice.current = 0;
    choice.victims = ["p1", "p2"];
    const action = chooseTimeoutAction(choice, choice.players[0]);
    assert.equal(action?.type, "steal");
    if (action?.type === "steal") stolenFrom.add(action.player);
  }
  assert.deepEqual(stolenFrom, new Set(["p1", "p2"]));

  const discard = fresh();
  discard.phase = "discard";
  discard.discards = { p0: 3 };
  grant(discard, "p0", { wood: 2, brick: 2, sheep: 2 });
  const action = chooseTimeoutAction(discard, discard.players[0]);
  assert.equal(action?.type, "discard");
  if (action?.type === "discard") assert.equal(total(action.cards), 3);
});
test("a human turn timeout ends without spending cards or building", () => {
  const game = setup(fresh());
  game.phase = "main";
  const player = game.players[game.current];
  grant(game, player.id, { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 });
  player.dev = [{ type: "knight", bought: game.turn - 1 }];

  assert.ok(roadSites(game, player).length > 0);
  assert.deepEqual(chooseTimeoutAction(game, player), { type: "end" });
});
test("a human free-road timeout skips instead of placing a road", () => {
  const game = setup(fresh());
  game.phase = "freeRoad";
  game.resumePhase = "main";
  game.freeRoads = 2;
  const player = game.players[game.current];

  assert.ok(roadSites(game, player).length > 0);
  assert.deepEqual(chooseTimeoutAction(game, player), { type: "skipRoad" });
});
test("expired discards preserve selected cards and fill only the remainder", () => {
  const game = fresh();
  game.phase = "discard";
  game.discards = { p0: 5 };
  game.players[0].resources = {
    ...emptyHand(),
    wood: 2,
    brick: 1,
    sheep: 3,
  };
  const selected = { ...emptyHand(), wood: 2, brick: 1 };

  const action = chooseTimeoutAction(game, game.players[0], selected);

  assert.deepEqual(action, {
    type: "discard",
    cards: { ...selected, sheep: 2 },
  });
});
test("special build phases only run for an advance flag three seats ahead", () => {
  let g = setup(fresh(6));
  g.phase = "main";
  g.players.forEach((player) => (player.bot = false));
  g.specialBuildRequests = [];
  g = applyAction(g, "p0", { type: "end" });
  assert.equal(g.current, 1);
  assert.equal(g.primary, 1);
  assert.equal(g.phase, "roll");
  assert.equal(g.secondary, false);

  g.phase = "main";
  grant(g, "p4", { wood: 1, brick: 1 });
  g = toggleSpecialBuildRequest(g, "p4");
  assert.deepEqual(g.specialBuildRequests, ["p4"]);
  g = applyAction(g, "p1", { type: "end" });
  assert.equal(g.current, 4);
  assert.equal(g.phase, "main");
  assert.ok(g.secondary);
  assert.deepEqual(g.specialBuildRequests, []);
  assert.equal(
    g.log.at(-1)?.text,
    "Player 4 begins a special build phase.",
  );
  assert.equal(g.log.at(-1)?.group, `turn-${g.turn}`);
  assert.equal(g.log.at(-1)?.kind, "special");
  assert.throws(() => applyAction(g, "p4", { type: "roll" }));
  assert.throws(() =>
    applyAction(g, "p4", {
      type: "offer",
      give: { ...emptyHand(), wood: 1 },
      want: { ...emptyHand(), ore: 1 },
    }),
  );
  g = applyAction(g, "p4", { type: "end" });
  assert.equal(g.current, 2);
  assert.equal(g.primary, 2);
  assert.equal(g.phase, "roll");
});
test("empty special build phases end automatically", () => {
  let g = setup(fresh(6));
  g.players.forEach((player) => (player.bot = false));
  clearResources(g, "p3");
  g.players[3].dev = [];
  g.phase = "main";
  g.specialBuildRequests = ["p3"];
  g = applyAction(g, "p0", { type: "end" });
  assert.equal(g.secondary, false);
  assert.equal(g.primary, 1);
  assert.equal(g.current, 1);
  assert.equal(g.phase, "roll");
  assert.match(g.log.at(-1)?.text || "", /ends automatically/);
});
test("special build phases remain open while a legal action exists", () => {
  let g = setup(fresh(6));
  g.players.forEach((player) => (player.bot = false));
  clearResources(g, "p3");
  g.players[3].dev = [];
  grant(g, "p3", { wood: 1, brick: 1 });
  g.phase = "main";
  g.specialBuildRequests = ["p3"];
  g = applyAction(g, "p0", { type: "end" });
  assert.equal(g.secondary, true);
  assert.equal(g.current, 3);
  assert.equal(hasSpecialBuildAction(g, g.players[3]), true);
  g = applyAction(g, "p3", {
    type: "road",
    id: roadSites(g, g.players[3])[0],
  });
  assert.equal(g.secondary, false);
  assert.equal(g.primary, 1);
  assert.equal(g.phase, "roll");
  assert.match(g.log.at(-1)?.text || "", /ends automatically/);
});
test("bank trades and playable development cards keep special builds open", () => {
  const g = setup(fresh(6));
  g.secondary = true;
  g.current = 3;
  g.phase = "main";
  clearResources(g, "p3");
  g.players[3].dev = [];
  grant(g, "p3", { wood: 4 });
  assert.equal(hasSpecialBuildAction(g, g.players[3]), true);
  clearResources(g, "p3");
  g.players[3].dev.push({ type: "monopoly", bought: g.turn - 1 });
  assert.equal(hasSpecialBuildAction(g, g.players[3]), true);
});
test("special build flags can be cancelled and cannot be changed on your own turn", () => {
  let g = setup(fresh(6));
  g.players.forEach((player) => (player.bot = false));
  g.specialBuildRequests = [];
  g.phase = "main";
  assert.throws(() => toggleSpecialBuildRequest(g, "p0"));
  g = toggleSpecialBuildRequest(g, "p3");
  assert.deepEqual(g.specialBuildRequests, ["p3"]);
  g = toggleSpecialBuildRequest(g, "p3");
  assert.deepEqual(g.specialBuildRequests, []);
  g = applyAction(g, "p0", { type: "end" });
  assert.equal(g.current, 1);
  assert.equal(g.secondary, false);
});
test("bot special build flags are consumed and queued again", () => {
  let g = setup(fresh(6));
  g.phase = "main";
  grant(g, "p3", { wood: 1, brick: 1 });
  g = applyAction(g, "p0", { type: "end" });
  assert.equal(g.current, 3);
  assert.equal(g.phase, "main");
  assert.ok(g.secondary);
  assert.ok(!g.specialBuildRequests.includes("p3"));
  g = applyAction(g, "p3", { type: "end" });
  assert.equal(g.current, 1);
  assert.equal(g.primary, 1);
  assert.equal(g.phase, "roll");
  assert.ok(g.specialBuildRequests.includes("p3"));
});
test("longest road traverses edges once and is cut by an opponent settlement", () => {
  const g = fresh(),
    tile = g.board.tiles[0];
  for (let i = 0; i < 6; i++) {
    const a = tile.vertices[i],
      b = tile.vertices[(i + 1) % 6];
    g.board.edges.find(
      (e) => [e.a, e.b].includes(a) && [e.a, e.b].includes(b),
    )!.owner = "p0";
  }
  assert.equal(roadLength(g, g.players[0]), 6);
  g.board.vertices[tile.vertices[0]].owner = "p1";
  g.board.vertices[tile.vertices[3]].owner = "p1";
  assert.equal(roadLength(g, g.players[0]), 3);
});
test("private views hide future randomness, deck order, opponents’ hands and victory cards", () => {
  const g = setup(fresh());
  g.players[1].dev.push({ type: "victory", bought: 0 });
  const view = viewGame(g, "p0");
  assert.ok(!("rng" in view));
  assert.ok(!("deck" in view));
  assert.ok(!("resumeTime" in view));
  assert.equal(view.players[1].resources, undefined);
  assert.equal(view.players[1].dev, undefined);
  assert.equal(view.players[1].points, 2);
  assert.ok(view.players[0].resources);
  g.phase = "finished";
  const finishedView = viewGame(g, "p0");
  assert.equal(finishedView.players[1].resources, undefined);
  assert.equal(finishedView.players[1].dev, undefined);
});
test("a player may only win on their own primary or paired turn", () => {
  let g = setup(fresh(6));
  g.phase = "main";
  g.players[3].dev = Array.from({ length: 8 }, () => ({
    type: "victory" as const,
    bought: 0,
  }));
  g.specialBuildRequests = ["p3"];
  g = applyAction(g, "p0", { type: "end" });
  assert.equal(g.winner, "p3");
  assert.equal(g.phase, "finished");
  assert.ok(g.finishedAt! >= g.startedAt);
});
test("final results account for every victory point source", () => {
  const g = fresh();
  g.startedAt = 1_000;
  g.finishedAt = 3_666_000;
  g.pausedMs = 65_000;
  g.board.vertices.forEach((vertex) => {
    vertex.owner = null;
    vertex.city = false;
  });
  const owned = g.board.vertices.slice(0, 4);
  owned.forEach((vertex) => (vertex.owner = "p0"));
  owned[3].city = true;
  g.longest = "p0";
  g.army = "p0";
  g.players[0].dev.push(
    { type: "victory", bought: 0 },
    { type: "victory", bought: 0 },
  );
  g.winner = "p0";
  g.phase = "finished";
  const results = finalGameResults(g, "ABC123", true);
  assert.equal(results.roomCode, "ABC123");
  assert.equal(results.winnerId, "p0");
  assert.equal(results.official, true);
  assert.equal(results.durationMs, 3_600_000);
  assert.deepEqual(results.players[0], {
    id: "p0",
    name: "Player 0",
    color: g.players[0].color,
    bot: true,
    settlements: 3,
    cities: 1,
    longestRoad: 2,
    largestArmy: 2,
    victoryCards: 2,
    total: 11,
  });
  assert.equal(points(g, g.players[0]), results.players[0].total);
});
test("game runtime excludes an active host pause", () => {
  const g = fresh();
  g.startedAt = 1_000;
  g.finishedAt = null;
  g.pausedMs = 500;
  g.pausedAt = 3_000;
  assert.equal(gameRuntimeMs(g, 10_000), 1_500);
});
test("complete bot matches finish legally across every supported table size and difficulty", () => {
  const cases = [
    ...Array.from({ length: 11 }, (_, index) => [index + 2, "normal"] as const),
    [4, "easy"] as const,
    [4, "hard"] as const,
  ];
  for (const [n, difficulty] of cases) {
      let g = fresh(n, 110 + n, difficulty);
      let actions = 0;
      const used = new Set<string>();
      while (g.phase !== "finished" && actions < 5000) {
        let moved = false;
        for (const p of g.players) {
          const a = chooseBotAction(g, p);
          if (a) {
            used.add(a.type);
            g = applyAction(g, p.id, a);
            actions++;
            invariant(g);
            moved = true;
            break;
          }
        }
        assert.ok(moved, `stuck at ${g.phase}`);
      }
      assert.equal(
        g.phase,
        "finished",
        `${n} ${difficulty} did not finish: turn ${g.turn}; points ${g.players.map((p) => points(g, p)).join()}`,
      );
      assert.ok(g.winner);
      console.log(
        `${n} seats / ${difficulty}: won in ${g.turn} turns, ${actions} legal actions; ${[...used].join(", ")}`,
      );
  }
});
