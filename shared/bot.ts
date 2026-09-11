import {
  type Action,
  type Game,
  type Player,
  type Resource,
  type Hand,
  RESOURCES,
  COSTS,
  canPay,
  citySites,
  emptyHand,
  points,
  ratios,
  roadSites,
  settlementSites,
  robberSites,
  rng,
  total,
} from "./game";
const noise = (g: Game, n: number) => {
  const x = Math.sin(g.version * 77 + n * 13 + g.current * 31) * 43758.5453;
  return x - Math.floor(x);
};
const pips = (n: number) => (n ? 6 - Math.abs(7 - n) : 0);
function yields(g: Game, p: Player): Hand {
  const h = emptyHand();
  g.board.vertices
    .filter((v) => v.owner === p.id)
    .forEach((v) =>
      v.tiles.forEach((id) => {
        const t = g.board.tiles[id];
        if (t.terrain !== "desert")
          h[t.terrain] += pips(t.number) * (v.city ? 2 : 1);
      }),
    );
  return h;
}
export function siteValue(g: Game, p: Player, id: number) {
  const have = yields(g, p);
  return g.board.vertices[id].tiles.reduce((n, id) => {
    const t = g.board.tiles[id];
    return (
      n +
      (t.terrain === "desert"
        ? 0
        : pips(t.number) *
          (p.difficulty === "hard"
            ? (have[t.terrain] === 0 ? 2.8 : 1) +
              (t.terrain === "ore" || t.terrain === "wheat" ? 0.45 : 0)
            : 1))
    );
  }, 0);
}
function bestSite(g: Game, p: Player, ids: number[]) {
  return ids.reduce((a, b) =>
    siteValue(g, p, b) + noise(g, b) * (p.difficulty === "easy" ? 15 : 1) >
    siteValue(g, p, a) + noise(g, a) * (p.difficulty === "easy" ? 15 : 1)
      ? b
      : a,
  );
}
function bestRoad(g: Game, p: Player, ids: number[]) {
  const destinations = settlementSites(g, p, true); // Legal distance rule, without requiring a connection.
  const score = (eid: number) => {
    const edge = g.board.edges[eid];
    let best = -100;
    for (const target of destinations) {
      const seen = new Set<number>();
      const queue = [{ v: target, d: 0 }];
      let dist = 30;
      while (queue.length) {
        const { v, d } = queue.shift()!;
        if (seen.has(v)) continue;
        seen.add(v);
        if (v === edge.a || v === edge.b) {
          dist = d;
          break;
        }
        if (g.board.vertices[v].owner && g.board.vertices[v].owner !== p.id)
          continue;
        g.board.vertices[v].edges.forEach((id) => {
          const e = g.board.edges[id];
          if (!e.owner || e.owner === p.id)
            queue.push({
              v: e.a === v ? e.b : e.a,
              d: d + (e.owner === p.id ? 0 : 1),
            });
        });
      }
      best = Math.max(best, siteValue(g, p, target) / (dist + 1) - dist * 2);
    }
    return best + noise(g, eid) * (p.difficulty === "easy" ? 10 : 0.8);
  };
  return ids.reduce((a, b) => (score(b) > score(a) ? b : a));
}
function goalCosts(g: Game, p: Player) {
  const goals: { kind: string; cost: Partial<Hand> }[] = [];
  if (citySites(g, p).length) goals.push({ kind: "city", cost: COSTS.city });
  if (settlementSites(g, p).length)
    goals.unshift({ kind: "settlement", cost: COSTS.settlement });
  if (
    roadSites(g, p).length &&
    g.board.vertices.filter((v) => v.owner === p.id && !v.city).length < 5
  )
    goals.push({ kind: "road", cost: COSTS.road });
  if (g.deck.length)
    goals.push({ kind: "development", cost: COSTS.development });
  return goals;
}
function randomItem<T>(g: Game, items: readonly T[]) {
  return items.length
    ? items[Math.floor(rng(g) * items.length)]
    : undefined;
}
export function chooseTimeoutAction(g: Game, p: Player): Action | null {
  if (g.phase === "finished") return null;
  if (g.phase === "discard" && g.discards[p.id]) {
    const cards = emptyHand();
    const remaining = { ...p.resources };
    for (let n = 0; n < g.discards[p.id]; n++) {
      let pick = Math.floor(rng(g) * total(remaining));
      const resource = RESOURCES.find((candidate) => {
        pick -= remaining[candidate];
        return pick < 0;
      });
      if (!resource) return null;
      cards[resource]++;
      remaining[resource]--;
    }
    return { type: "discard", cards };
  }
  if (g.players[g.current].id !== p.id) return null;
  if (g.phase === "roll") return { type: "roll" };
  if (g.phase === "setupSettlement") {
    const id = randomItem(g, settlementSites(g, p, true));
    return id === undefined ? null : { type: "settlement", id };
  }
  if (g.phase === "setupRoad") {
    const id = randomItem(g, roadSites(g, p, true));
    return id === undefined ? null : { type: "road", id };
  }
  if (g.phase === "robber") {
    const id = randomItem(g, robberSites(g, p));
    return id === undefined ? null : { type: "robber", id };
  }
  if (g.phase === "steal") {
    const player = randomItem(g, g.victims);
    return player === undefined ? null : { type: "steal", player };
  }
  if (g.phase === "freeRoad") {
    const id = randomItem(g, roadSites(g, p));
    return id === undefined ? { type: "skipRoad" } : { type: "road", id };
  }
  return chooseBotAction(g, p);
}
export function chooseBotAction(g: Game, p: Player): Action | null {
  if (g.phase === "finished") return null;
  if (g.phase === "discard" && g.discards[p.id]) {
    const cards = emptyHand(),
      remaining = { ...p.resources };
    for (let n = 0; n < g.discards[p.id]; n++) {
      const r = RESOURCES.reduce((a, b) =>
        remaining[b] > remaining[a] ? b : a,
      );
      cards[r]++;
      remaining[r]--;
    }
    return { type: "discard", cards };
  }
  if (
    g.offer &&
    g.offer.from !== p.id &&
    (!g.offer.to || g.offer.to === p.id) &&
    !g.offer.rejected.includes(p.id) &&
    g.phase === "main"
  ) {
    const o = g.offer;
    return {
      type:
        canPay(p, o.want) && total(o.give) >= total(o.want)
          ? "accept"
          : "reject",
      offerId: o.id,
    };
  }
  if (g.players[g.current].id !== p.id) return null;
  const settlements = settlementSites(g, p, g.phase === "setupSettlement"),
    roads = roadSites(g, p, g.phase === "setupRoad"),
    cities = citySites(g, p);
  if (g.phase === "setupSettlement")
    return settlements.length
      ? { type: "settlement", id: bestSite(g, p, settlements) }
      : null;
  if (g.phase === "setupRoad")
    return roads.length ? { type: "road", id: bestRoad(g, p, roads) } : null;
  if (g.phase === "roll") return { type: "roll" };
  if (g.phase === "robber") {
    const ids = robberSites(g, p);
    if (!ids.length) return null;
    const score = (id: number) =>
      g.board.tiles[id].vertices.reduce((n, vid) => {
        const owner = g.board.vertices[vid].owner;
        if (!owner) return n;
        return (
          n +
          (owner === p.id
            ? -30
            : points(
                g,
                g.players.find((x) => x.id === owner)!,
                false,
              ) + 2)
        );
      }, 0) * Math.max(1, pips(g.board.tiles[id].number));
    return {
      type: "robber",
      id: ids.reduce((a, b) => (score(b) > score(a) ? b : a)),
    };
  }
  if (g.phase === "steal") {
    if (!g.victims.length) return null;
    return {
      type: "steal",
      player: g.victims.reduce((a, b) =>
        points(
          g,
          g.players.find((x) => x.id === b)!,
          false,
        ) >
        points(
          g,
          g.players.find((x) => x.id === a)!,
          false,
        )
          ? b
          : a,
      ),
    };
  }
  if (g.phase === "freeRoad")
    return roads.length
      ? { type: "road", id: bestRoad(g, p, roads) }
      : { type: "skipRoad" };
  if (g.phase !== "main") return null;
  if (!p.playedDev) {
    const playable = p.dev.filter(
      (d) => d.bought < g.turn && d.type !== "victory",
    );
    for (const d of playable) {
      if (d.type === "knight") return { type: "dev", card: "knight" };
      if (d.type === "roadBuilding" && roads.length)
        return { type: "dev", card: "roadBuilding" };
      if (d.type === "monopoly") {
        const r = RESOURCES.reduce((a, b) =>
          g.players
            .filter((x) => x.id !== p.id)
            .reduce((n, x) => n + yields(g, x)[b] - yields(g, x)[a], 0) > 0
            ? b
            : a,
        );
        return { type: "dev", card: "monopoly", resources: [r] };
      }
      if (d.type === "plenty" && total(g.bank) >= 2) {
        const h = { ...p.resources },
          bank = { ...g.bank },
          chosen: Resource[] = [];
        for (let i = 0; i < 2; i++) {
          const goals = goalCosts(g, p);
          const deficit = goals.flatMap((goal) =>
            RESOURCES.filter((r) => (goal.cost[r] || 0) > h[r] && bank[r] > 0),
          );
          const r =
            deficit[0] ||
            RESOURCES.filter((r) => bank[r] > 0).sort((a, b) => h[a] - h[b])[0];
          if (r) {
            h[r]++;
            bank[r]--;
            chosen.push(r);
          }
        }
        if (chosen.length === 2)
          return { type: "dev", card: "plenty", resources: chosen };
      }
    }
  }
  if (settlements.length && canPay(p, COSTS.settlement))
    return { type: "settlement", id: bestSite(g, p, settlements) };
  if (cities.length && canPay(p, COSTS.city))
    return { type: "city", id: bestSite(g, p, cities) };
  // Keep the roads useful: expand toward the next legal settlement; stop once all five pieces are on the board.
  if (
    roads.length &&
    canPay(p, COSTS.road) &&
    g.board.vertices.filter((v) => v.owner === p.id && !v.city).length < 5 &&
    settlements.length === 0
  )
    return { type: "road", id: bestRoad(g, p, roads) };
  if (g.deck.length && canPay(p, COSTS.development)) return { type: "buyDev" };
  const rates = ratios(g, p);
  for (const goal of goalCosts(g, p)) {
    for (const get of RESOURCES.filter(
      (r) => p.resources[r] < (goal.cost[r] || 0) && g.bank[r] > 0,
    )) {
      const give = RESOURCES.filter(
        (r) => r !== get && p.resources[r] - (goal.cost[r] || 0) >= rates[r],
      ).sort((a, b) => p.resources[b] - p.resources[a])[0];
      if (give)
        return {
          type: "bank",
          give: { ...emptyHand(), [give]: rates[give] },
          want: { ...emptyHand(), [get]: 1 },
        };
    }
  }
  if (roads.length && canPay(p, COSTS.road) && p.roadLength >= 4)
    return { type: "road", id: bestRoad(g, p, roads) };
  return { type: "end" };
}
