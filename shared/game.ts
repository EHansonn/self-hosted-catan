export const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"] as const;
export type Resource = (typeof RESOURCES)[number];
export type Hand = Record<Resource, number>;
export type Dev = "knight" | "roadBuilding" | "plenty" | "monopoly" | "victory";
export type Difficulty = "easy" | "normal" | "hard";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
export const COLORS = [
  "#f6ad3e",
  "#52c9cf",
  "#e97877",
  "#ae90ea",
  "#77bd72",
  "#e5e3d8",
  "#4b8ee8",
  "#ed72bd",
  "#e2c84f",
  "#35a98b",
  "#a66b45",
  "#64718f",
];
export const BOT_NAMES = [
  "Mira",
  "Atlas",
  "Reef",
  "Sable",
  "Coral",
  "Finn",
  "Nova",
  "Cove",
  "Marin",
  "Pearl",
  "Dune",
  "Skye",
  "Rowan",
  "Ember",
  "Flint",
  "Willow",
  "Cedar",
  "Briar",
  "Moss",
  "River",
  "Harbor",
  "Wren",
  "Alder",
  "Clove",
  "Sage",
  "Orin",
  "Tessa",
  "Juno",
  "Poppy",
  "Lark",
  "Sol",
  "Vale",
  "Kestrel",
  "Marlow",
  "Bay",
  "Fern",
  "Copper",
  "Ash",
  "Gale",
  "Brooks",
  "Nori",
  "Olive",
  "Jasper",
  "Linnea",
  "Pip",
  "Quill",
  "Rook",
  "Sunny",
  "Maple",
  "Zephyr",
  "Cinder",
  "Birch",
  "Fable",
  "Koa",
  "Laurel",
  "Opal",
  "Sterling",
  "Indigo",
  "Cricket",
  "Tern",
  "Pebble",
  "Spruce",
  "Kelp",
  "Sorrel",
  "Topaz",
];
export const COSTS: Record<string, Partial<Hand>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  development: { sheep: 1, wheat: 1, ore: 1 },
};
export const emptyHand = (): Hand => ({
  wood: 0,
  brick: 0,
  sheep: 0,
  wheat: 0,
  ore: 0,
});
export const total = (h: Partial<Hand>) =>
  RESOURCES.reduce((n, r) => n + (h[r] || 0), 0);
export interface Options {
  seats: number;
  target: number;
  difficulty: Difficulty;
  timer: number;
  turnActionBonus: number;
  setupSettlementTimer: number;
  setupRoadTimer: number;
  robberTimer: number;
  actionTimer: number;
  discardTimer: number;
  balanced: boolean;
  friendlyRobber: boolean;
  linkedTwoTwelve: boolean;
  paired: boolean;
}
export const DEFAULT_OPTIONS: Options = {
  seats: 4,
  target: 10,
  difficulty: "normal",
  timer: 60,
  turnActionBonus: 15,
  setupSettlementTimer: 120,
  setupRoadTimer: 20,
  robberTimer: 20,
  actionTimer: 10,
  discardTimer: 20,
  balanced: true,
  friendlyRobber: false,
  linkedTwoTwelve: false,
  paired: true,
};
export interface Tile {
  id: number;
  x: number;
  y: number;
  terrain: Resource | "desert";
  number: number;
  vertices: number[];
}
export interface Vertex {
  id: number;
  x: number;
  y: number;
  tiles: number[];
  edges: number[];
  owner: string | null;
  city: boolean;
}
export interface Edge {
  id: number;
  a: number;
  b: number;
  tiles: number[];
  owner: string | null;
}
export interface Port {
  edge: number;
  resource: Resource | "any";
}
export interface Board {
  tiles: Tile[];
  vertices: Vertex[];
  edges: Edge[];
  ports: Port[];
}
export interface Player {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  difficulty: Difficulty;
  connected: boolean;
  resources: Hand;
  dev: { type: Dev; bought: number }[];
  knights: number;
  roadLength: number;
  playedDev: boolean;
  automated?: boolean;
}
export type Phase =
  | "setupSettlement"
  | "setupRoad"
  | "roll"
  | "main"
  | "discard"
  | "robber"
  | "steal"
  | "freeRoad"
  | "finished";
export interface Offer {
  id: number;
  from: string;
  to?: string;
  give: Hand;
  want: Hand;
  approved: string[];
  rejected: string[];
}
export interface GameLogEntry {
  id: number;
  text: string;
  kind: string;
  group?: string;
  player?: string;
  privateText?: Record<string, string>;
}
export type PublicGameLogEntry = Omit<GameLogEntry, "privateText">;
export interface Game {
  board: Board;
  players: Player[];
  options: Options;
  bank: Hand;
  deck: Dev[];
  phase: Phase;
  current: number;
  primary: number;
  secondary: boolean;
  specialBuildRequests: string[];
  turn: number;
  setupStep: number;
  setupVertex: number | null;
  robber: number;
  resumePhase: "main" | "roll";
  dice: number[];
  discards: Record<string, number>;
  victims: string[];
  freeRoads: number;
  longest: string | null;
  army: string | null;
  winner: string | null;
  offer: Offer | null;
  log: GameLogEntry[];
  version: number;
  rng: number;
  deadline: number | null;
  resumeTime: number | null;
}
export function canResumeRoom(game: Pick<Game, "phase"> | null | undefined) {
  return game?.phase !== "finished";
}
export type Action =
  | { type: "settlement" | "city" | "road"; id: number }
  | { type: "roll" | "end" | "buyDev" | "skipRoad" | "cancelTrade" }
  | { type: "discard"; cards: Hand }
  | { type: "robber"; id: number }
  | { type: "steal"; player: string }
  | { type: "bank"; give: Hand; want: Hand }
  | { type: "offer"; give: Hand; want: Hand }
  | { type: "counter"; offerId: number; give: Hand; want: Hand }
  | { type: "accept"; offerId: number; player?: string }
  | { type: "reject"; offerId: number }
  | { type: "dev"; card: Exclude<Dev, "victory">; resources?: Resource[] };
export type PublicPlayer = Omit<Player, "resources" | "dev"> & {
  resources?: Hand;
  dev?: Player["dev"];
  cardCount: number;
  devCount: number;
  points: number;
};
export interface FinalPlayerResult {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  settlements: number;
  cities: number;
  longestRoad: number;
  largestArmy: number;
  victoryCards: number;
  total: number;
}
export interface GameResults {
  roomCode: string;
  winnerId: string;
  official: boolean;
  players: FinalPlayerResult[];
}
export interface Legal {
  settlements: number[];
  roads: number[];
  cities: number[];
  robber: number[];
  ratios: Hand;
}
export type GameView = Omit<Game, "rng" | "deck" | "players" | "resumeTime" | "log"> & {
  players: PublicPlayer[];
  log: PublicGameLogEntry[];
  deckCount: number;
  legal: Legal;
};
export interface RoomView {
  code: string;
  host: string;
  me: string;
  spectator: boolean;
  mapSeed: number;
  options: Options;
  players: PublicPlayer[];
  game: GameView | null;
  chat: { name: string; text: string; id: number }[];
}

export interface ResumeRoomView {
  code: string;
  options: Options;
  players: Pick<PublicPlayer, "name" | "color" | "bot">[];
  started: boolean;
  paused: boolean;
  phase: Phase | null;
  turn: number | null;
  currentPlayer: string | null;
  updated: number;
}

export function rng(g: { rng: number }) {
  g.rng = (g.rng + 0x6d2b79f5) | 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function shuffle<T>(items: T[], g: { rng: number }) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function randomPlayerOrder<T>(
  players: readonly T[],
  random: () => number = Math.random,
) {
  const ordered = [...players];
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  return ordered;
}

const BOARD_PROFILES = [
  {
    maxPlayers: 4,
    rows: [3, 4, 5, 4, 3],
    name: "Classic island",
    ports: 9,
  },
  {
    maxPlayers: 6,
    rows: [3, 4, 5, 6, 5, 4, 3],
    name: "Expanded island",
    ports: 11,
  },
  {
    maxPlayers: 8,
    rows: [4, 5, 6, 7, 6, 5, 4],
    name: "Large island",
    ports: 13,
  },
  {
    maxPlayers: 10,
    rows: [4, 5, 6, 7, 8, 7, 6, 5, 4],
    name: "Grand island",
    ports: 15,
  },
  {
    maxPlayers: MAX_PLAYERS,
    rows: [5, 6, 7, 8, 9, 8, 7, 6, 5],
    name: "Epic island",
    ports: 17,
  },
] as const;

export function boardProfileForPlayers(playerCount: number) {
  const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, playerCount));
  const profile =
    BOARD_PROFILES.find((candidate) => count <= candidate.maxPlayers) ||
    BOARD_PROFILES.at(-1)!;
  return {
    name: profile.name,
    rows: [...profile.rows],
    tiles: profile.rows.reduce((sum, row) => sum + row, 0),
    ports: profile.ports,
  };
}

export function bankCardsPerResource(playerCount: number) {
  if (playerCount <= 4) return 19;
  if (playerCount <= 6) return 24;
  if (playerCount <= 8) return 29;
  if (playerCount <= 10) return 34;
  return 39;
}

function numberBag(length: number) {
  const values = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  const weights = values.map((value) => ([2, 12].includes(value) ? 1 : 2));
  const priority = new Map(
    [6, 8, 5, 9, 4, 10, 3, 11, 2, 12].map((value, index) => [value, index]),
  );
  const counts = values.map((value, index) => {
    const exact = (length * weights[index]) / 18;
    return { value, count: Math.floor(exact), fraction: exact % 1 };
  });
  const remaining = length - counts.reduce((sum, entry) => sum + entry.count, 0);
  const allocationOrder = [...counts].sort(
    (a, b) =>
      b.fraction - a.fraction ||
      (priority.get(a.value) ?? 0) - (priority.get(b.value) ?? 0),
  );
  for (let index = 0; index < remaining; index++)
    allocationOrder[index % allocationOrder.length].count++;
  return counts.flatMap(({ value, count }) => Array<number>(count).fill(value));
}

function developmentDeck(playerCount: number): Dev[] {
  if (playerCount <= 4)
    return [
      ...Array<Dev>(14).fill("knight"),
      ...Array<Dev>(5).fill("victory"),
      ...Array<Dev>(2).fill("roadBuilding"),
      ...Array<Dev>(2).fill("plenty"),
      ...Array<Dev>(2).fill("monopoly"),
    ];
  if (playerCount <= 6)
    return [
      ...Array<Dev>(20).fill("knight"),
      ...Array<Dev>(5).fill("victory"),
      ...Array<Dev>(3).fill("roadBuilding"),
      ...Array<Dev>(3).fill("plenty"),
      ...Array<Dev>(3).fill("monopoly"),
    ];
  const size = Math.ceil(playerCount * 5.5);
  const victory = Math.max(5, Math.round(size * 0.16));
  const special = Math.max(3, Math.round(size * 0.09));
  const knights = size - victory - special * 3;
  return [
    ...Array<Dev>(knights).fill("knight"),
    ...Array<Dev>(victory).fill("victory"),
    ...Array<Dev>(special).fill("roadBuilding"),
    ...Array<Dev>(special).fill("plenty"),
    ...Array<Dev>(special).fill("monopoly"),
  ];
}

export function makeBoard(playerCount = 4, seed = 42, balanced = true): Board {
  const random = { rng: seed };
  const profile = boardProfileForPlayers(playerCount);
  const rows = profile.rows;
  const desertCount = Math.max(1, Math.round(profile.tiles / 19));
  const productiveCount = profile.tiles - desertCount;
  const perTerrain = Math.floor(productiveCount / RESOURCES.length);
  const remainder = productiveCount % RESOURCES.length;
  const extraOrder: Resource[] = ["wood", "sheep", "wheat", "brick", "ore"];
  const terrainCounts = Object.fromEntries(
    RESOURCES.map((resource) => [
      resource,
      perTerrain + (extraOrder.indexOf(resource) < remainder ? 1 : 0),
    ]),
  ) as Hand;
  const terrains = shuffle(
    RESOURCES.flatMap((resource) =>
      Array<Resource | "desert">(terrainCounts[resource]).fill(resource),
    ).concat(Array<Resource | "desert">(desertCount).fill("desert")),
    random,
  );
  const board: Board = { tiles: [], vertices: [], edges: [], ports: [] };
  const vertexMap = new Map<string, number>();
  const edgeMap = new Map<string, number>();
  rows.forEach((n, row) => {
    for (let col = 0; col < n; col++) {
      const tile: Tile = {
        id: board.tiles.length,
        x: (col - (n - 1) / 2) * Math.sqrt(3),
        y: (row - (rows.length - 1) / 2) * 1.5,
        terrain: terrains[board.tiles.length],
        number: 0,
        vertices: [],
      };
      for (let k = 0; k < 6; k++) {
        const angle = ((30 + k * 60) * Math.PI) / 180;
        const x = tile.x + Math.cos(angle),
          y = tile.y + Math.sin(angle);
        const key = `${x.toFixed(4)},${y.toFixed(4)}`.replaceAll(
          "-0.0000",
          "0.0000",
        );
        let id = vertexMap.get(key);
        if (id === undefined) {
          id = board.vertices.length;
          vertexMap.set(key, id);
          board.vertices.push({
            id,
            x,
            y,
            tiles: [],
            edges: [],
            owner: null,
            city: false,
          });
        }
        board.vertices[id].tiles.push(tile.id);
        tile.vertices.push(id);
      }
      for (let k = 0; k < 6; k++) {
        const [a, b] = [tile.vertices[k], tile.vertices[(k + 1) % 6]].sort(
          (x, y) => x - y,
        );
        const key = `${a}:${b}`;
        let id = edgeMap.get(key);
        if (id === undefined) {
          id = board.edges.length;
          edgeMap.set(key, id);
          board.edges.push({ id, a, b, tiles: [], owner: null });
          board.vertices[a].edges.push(id);
          board.vertices[b].edges.push(id);
        }
        board.edges[id].tiles.push(tile.id);
      }
      board.tiles.push(tile);
    }
  });
  const nums = numberBag(productiveCount);
  const productiveTiles = board.tiles.filter((tile) => tile.terrain !== "desert");
  if (!balanced) {
    const numbers = shuffle(nums, random);
    productiveTiles.forEach((tile, index) => (tile.number = numbers[index]));
  } else {
    const neighboringTiles = new Map<number, Set<number>>(
      board.tiles.map((tile) => [tile.id, new Set<number>()]),
    );
    for (const edge of board.edges)
      if (edge.tiles.length === 2) {
        neighboringTiles.get(edge.tiles[0])!.add(edge.tiles[1]);
        neighboringTiles.get(edge.tiles[1])!.add(edge.tiles[0]);
      }
    const reds = nums.filter((number) => number === 6 || number === 8);
    const others = nums.filter((number) => number !== 6 && number !== 8);
    let redTileIds: number[] = [];
    for (let attempt = 0; attempt < 1000 && redTileIds.length < reds.length; attempt++) {
      redTileIds = [];
      for (const tile of shuffle(productiveTiles, random)) {
        if (
          redTileIds.every(
            (selected) => !neighboringTiles.get(selected)!.has(tile.id),
          )
        )
          redTileIds.push(tile.id);
        if (redTileIds.length === reds.length) break;
      }
    }
    if (redTileIds.length < reds.length)
      throw new Error("Unable to create a balanced island for this table size.");
    const redSet = new Set(redTileIds);
    const shuffledReds = shuffle(reds, random);
    const shuffledOthers = shuffle(others, random);
    let redIndex = 0;
    let otherIndex = 0;
    productiveTiles.forEach((tile) => {
      tile.number = redSet.has(tile.id)
        ? shuffledReds[redIndex++]
        : shuffledOthers[otherIndex++];
    });
  }
  const coast = board.edges
    .filter((e) => e.tiles.length === 1)
    .sort((a, b) => {
      const midpoint = (e: Edge) => {
        const v = board.vertices[e.a],
          w = board.vertices[e.b];
        return Math.atan2(v.y + w.y, v.x + w.x);
      };
      return midpoint(a) - midpoint(b);
    });
  const specificPortCount = Math.ceil((profile.ports * 5) / 9);
  const types = shuffle<Resource | "any">(
    [
      ...Array.from(
        { length: specificPortCount },
        (_, index) => RESOURCES[index % RESOURCES.length],
      ),
      ...Array<Resource | "any">(profile.ports - specificPortCount).fill("any"),
    ],
    random,
  );
  board.ports = types.map((resource, i) => ({
    edge: coast[Math.floor((i * coast.length) / types.length)].id,
    resource,
  }));
  return board;
}
export function makePlayer(
  id: string,
  name: string,
  index: number,
  bot = false,
  difficulty: Difficulty = "normal",
): Player {
  return {
    id,
    name,
    color: COLORS[index % COLORS.length],
    bot,
    difficulty,
    connected: !bot,
    resources: emptyHand(),
    dev: [],
    knights: 0,
    roadLength: 0,
    playedDev: false,
  };
}
export function createGame(
  players: Player[],
  options: Options,
  seed: number,
): Game {
  const gameOptions = { ...DEFAULT_OPTIONS, ...options };
  const g: Game = {
    board: makeBoard(players.length, seed, gameOptions.balanced),
    players: structuredClone(players).map((p) => ({
      ...p,
      resources: emptyHand(),
      dev: [],
      knights: 0,
      roadLength: 0,
      playedDev: false,
    })),
    options: gameOptions,
    bank: Object.fromEntries(
      RESOURCES.map((r) => [r, bankCardsPerResource(players.length)]),
    ) as Hand,
    deck: [],
    phase: "setupSettlement",
    current: 0,
    primary: 0,
    secondary: false,
    specialBuildRequests:
      gameOptions.paired && players.length > 4
        ? players.filter((p) => p.bot).map((p) => p.id)
        : [],
    turn: 0,
    setupStep: 0,
    setupVertex: null,
    robber: 0,
    resumePhase: "main",
    dice: [],
    discards: {},
    victims: [],
    freeRoads: 0,
    longest: null,
    army: null,
    winner: null,
    offer: null,
    log: [],
    version: 0,
    rng: seed,
    deadline: null,
    resumeTime: null,
  };
  g.robber = g.board.tiles.find((t) => t.terrain === "desert")!.id;
  g.deck = shuffle<Dev>(developmentDeck(players.length), g);
  note(
    g,
    "The island is ready. Place two settlements and roads in reverse order.",
    "system",
    "system",
  );
  resetDeadline(g);
  return g;
}
export function note(
  g: Game,
  text: string,
  kind = "action",
  group = g.phase.startsWith("setup")
    ? `setup-${g.setupStep}`
    : `turn-${g.turn}`,
  privateText?: Record<string, string>,
) {
  const player = g.players.find((candidate) =>
    text.startsWith(`${candidate.name} `),
  );
  g.log.push({
    id: (g.log.at(-1)?.id || 0) + 1,
    text,
    kind,
    group,
    ...(player ? { player: player.id } : {}),
    ...(privateText ? { privateText } : {}),
  });
  if (g.log.length > 100) g.log.shift();
}
export function phaseTimerSeconds(options: Options, phase: Phase) {
  if (phase === "finished") return 0;
  if (phase === "main") return options.timer;
  if (phase === "setupSettlement")
    return options.setupSettlementTimer ?? DEFAULT_OPTIONS.setupSettlementTimer;
  if (phase === "setupRoad")
    return options.setupRoadTimer ?? DEFAULT_OPTIONS.setupRoadTimer;
  if (phase === "robber")
    return options.robberTimer ?? DEFAULT_OPTIONS.robberTimer;
  if (phase === "discard")
    return options.discardTimer ?? DEFAULT_OPTIONS.discardTimer;
  return options.actionTimer ?? DEFAULT_OPTIONS.actionTimer;
}
export function resetDeadline(g: Game) {
  const seconds = phaseTimerSeconds(g.options, g.phase);
  g.deadline = seconds ? Date.now() + seconds * 1000 : null;
}
function preserveDeadline(g: Game) {
  g.resumeTime = g.deadline
    ? Math.max(0, g.deadline - Date.now())
    : null;
}
function restoreDeadline(g: Game) {
  const remaining = g.resumeTime;
  g.resumeTime = null;
  g.deadline = remaining === null
    ? null
    : Date.now() + remaining;
  if (remaining === null) resetDeadline(g);
}
function ensure(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function canPay(p: Player, cost: Partial<Hand>) {
  return RESOURCES.every((r) => p.resources[r] >= (cost[r] || 0));
}
function pay(g: Game, p: Player, cost: Partial<Hand>) {
  ensure(canPay(p, cost), "You need more resources.");
  RESOURCES.forEach((r) => {
    p.resources[r] -= cost[r] || 0;
    g.bank[r] += cost[r] || 0;
  });
}
function draw(g: Game, p: Player, r: Resource, n: number) {
  const count = Math.min(g.bank[r], n);
  g.bank[r] -= count;
  p.resources[r] += count;
}
export function points(g: Game, p: Player, hidden = true) {
  const settlements = g.board.vertices.filter(
    (vertex) => vertex.owner === p.id && !vertex.city,
  ).length;
  const cities = g.board.vertices.filter(
    (vertex) => vertex.owner === p.id && vertex.city,
  ).length;
  return settlements + cities * 2 +
    (g.longest === p.id ? 2 : 0) +
    (g.army === p.id ? 2 : 0) +
    (hidden ? p.dev.filter((d) => d.type === "victory").length : 0);
}
export function finalGameResults(
  g: Game,
  roomCode: string,
  official = false,
): GameResults {
  const players = g.players.map((player) => {
    const settlements = g.board.vertices.filter(
      (vertex) => vertex.owner === player.id && !vertex.city,
    ).length;
    const cities = g.board.vertices.filter(
      (vertex) => vertex.owner === player.id && vertex.city,
    ).length;
    const longestRoad = g.longest === player.id ? 2 : 0;
    const largestArmy = g.army === player.id ? 2 : 0;
    const victoryCards = player.dev.filter(
      (card) => card.type === "victory",
    ).length;
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      bot: player.bot,
      settlements,
      cities,
      longestRoad,
      largestArmy,
      victoryCards,
      total:
        settlements + cities * 2 + longestRoad + largestArmy + victoryCards,
    };
  });
  players.sort(
    (a, b) =>
      Number(b.id === g.winner) - Number(a.id === g.winner) ||
      b.total - a.total,
  );
  return {
    roomCode,
    winnerId: g.winner || players[0]?.id || "",
    official,
    players,
  };
}
function spaced(g: Game, v: Vertex) {
  return (
    !v.owner &&
    v.edges.every((eid) => {
      const e = g.board.edges[eid];
      return !g.board.vertices[e.a === v.id ? e.b : e.a].owner;
    })
  );
}
export function settlementSites(g: Game, p: Player, setup = false) {
  if (g.board.vertices.filter((v) => v.owner === p.id && !v.city).length >= 5)
    return [];
  return g.board.vertices
    .filter(
      (v) =>
        spaced(g, v) &&
        (setup || v.edges.some((e) => g.board.edges[e].owner === p.id)),
    )
    .map((v) => v.id);
}
export function citySites(g: Game, p: Player) {
  return g.board.vertices.filter((v) => v.owner === p.id && v.city).length >= 4
    ? []
    : g.board.vertices
        .filter((v) => v.owner === p.id && !v.city)
        .map((v) => v.id);
}
export function roadSites(g: Game, p: Player, setup = false) {
  if (g.board.edges.filter((e) => e.owner === p.id).length >= 15) return [];
  return g.board.edges
    .filter(
      (e) =>
        !e.owner &&
        (setup
          ? [e.a, e.b].includes(g.setupVertex!)
          : [e.a, e.b].some((id) => {
              const v = g.board.vertices[id];
              return (
                v.owner === p.id ||
                (!v.owner &&
                  v.edges.some((eid) => g.board.edges[eid].owner === p.id))
              );
            })),
    )
    .map((e) => e.id);
}
export function ratios(g: Game, p: Player): Hand {
  const rates = Object.fromEntries(RESOURCES.map((r) => [r, 4])) as Hand;
  g.board.ports.forEach((port) => {
    const e = g.board.edges[port.edge];
    if ([e.a, e.b].some((id) => g.board.vertices[id].owner === p.id)) {
      if (port.resource === "any")
        RESOURCES.forEach((r) => (rates[r] = Math.min(rates[r], 3)));
      else rates[port.resource] = 2;
    }
  });
  return rates;
}
export function robberSites(g: Game, p: Player) {
  return g.board.tiles
    .filter(
      (t) =>
        t.id !== g.robber &&
        (!g.options.friendlyRobber ||
          t.vertices.every((id) => {
            const owner = g.board.vertices[id].owner;
            return (
              !owner ||
              owner === p.id ||
              points(
                g,
                g.players.find((p) => p.id === owner)!,
                false,
              ) > 2
            );
          })),
    )
    .map((t) => t.id);
}
export function hasSpecialBuildAction(g: Game, p: Player) {
  if (
    !g.secondary ||
    g.phase !== "main" ||
    g.players[g.current]?.id !== p.id
  )
    return false;
  if (
    (settlementSites(g, p).length && canPay(p, COSTS.settlement)) ||
    (citySites(g, p).length && canPay(p, COSTS.city)) ||
    (roadSites(g, p).length && canPay(p, COSTS.road)) ||
    (g.deck.length && canPay(p, COSTS.development))
  )
    return true;
  const rates = ratios(g, p);
  if (
    RESOURCES.some(
      (give) =>
        p.resources[give] >= rates[give] &&
        RESOURCES.some((want) => want !== give && g.bank[want] > 0),
    )
  )
    return true;
  if (p.playedDev) return false;
  return p.dev.some((card) => {
    if (card.bought >= g.turn || card.type === "victory") return false;
    if (card.type === "roadBuilding") return roadSites(g, p).length > 0;
    if (card.type === "plenty") return total(g.bank) >= 2;
    if (card.type === "knight") return robberSites(g, p).length > 0;
    return card.type === "monopoly";
  });
}
export function roadLength(g: Game, p: Player) {
  const walk = (v: number, used: Set<number>): number => {
    if (
      used.size &&
      g.board.vertices[v].owner &&
      g.board.vertices[v].owner !== p.id
    )
      return 0;
    let best = 0;
    for (const id of g.board.vertices[v].edges) {
      const e = g.board.edges[id];
      if (e.owner !== p.id || used.has(id)) continue;
      used.add(id);
      best = Math.max(best, 1 + walk(e.a === v ? e.b : e.a, used));
      used.delete(id);
    }
    return best;
  };
  return Math.max(
    0,
    ...g.board.vertices
      .filter((v) => v.edges.some((id) => g.board.edges[id].owner === p.id))
      .map((v) => walk(v.id, new Set())),
  );
}
function awards(g: Game) {
  g.players.forEach((p) => (p.roadLength = roadLength(g, p)));
  for (const [key, stat, min] of [
    ["longest", "roadLength", 5],
    ["army", "knights", 3],
  ] as const) {
    const max = Math.max(...g.players.map((p) => p[stat]));
    const leaders = g.players.filter((p) => p[stat] === max);
    const old = g[key];
    g[key] =
      max < min
        ? null
        : leaders.some((p) => p.id === old)
          ? old
          : leaders.length === 1
            ? leaders[0].id
            : null;
    if (g[key] && g[key] !== old)
      note(
        g,
        `${g.players.find((p) => p.id === g[key])!.name} claims ${key === "longest" ? "Longest Road" : "Largest Army"}.`,
        "award",
      );
  }
  const current = g.players[g.current];
  if (!g.phase.startsWith("setup") && points(g, current) >= g.options.target) {
    g.winner = current.id;
    g.phase = "finished";
    g.offer = null;
    g.deadline = null;
    g.resumeTime = null;
    note(
      g,
      `${current.name} wins with ${points(g, current)} victory points!`,
      "win",
    );
  }
}
export function produce(g: Game, roll: number) {
  const received = new Map<string, Hand>();
  for (const r of RESOURCES) {
    const due = new Map<string, number>();
    g.board.tiles
      .filter(
        (t) =>
          t.id !== g.robber &&
          t.terrain === r &&
          matchesProductionRoll(t.number, roll, g.options.linkedTwoTwelve),
      )
      .forEach((t) =>
        t.vertices.forEach((id) => {
          const v = g.board.vertices[id];
          if (v.owner)
            due.set(v.owner, (due.get(v.owner) || 0) + (v.city ? 2 : 1));
        }),
      );
    const needed = [...due.values()].reduce((a, b) => a + b, 0);
    if (needed <= g.bank[r] || due.size === 1)
      due.forEach((n, id) => {
        const player = g.players.find((p) => p.id === id)!;
        const before = player.resources[r];
        draw(g, player, r, n);
        const gained = player.resources[r] - before;
        if (!gained) return;
        const hand = received.get(id) || emptyHand();
        hand[r] += gained;
        received.set(id, hand);
      });
    else if (needed)
      note(g, `The bank is short of ${r}; nobody receives it this roll.`);
  }
  for (const player of g.players) {
    const hand = received.get(player.id);
    if (!hand) continue;
    const gains = RESOURCES.filter((r) => hand[r]).map((r) => `${hand[r]} ${r}`);
    note(g, `${player.name} gets ${gains.join(" and ")}.`, "gain");
  }
}

export function matchesProductionRoll(
  tileNumber: number,
  roll: number,
  linkedTwoTwelve = false,
) {
  return (
    tileNumber === roll ||
    (linkedTwoTwelve &&
      (roll === 2 || roll === 12) &&
      (tileNumber === 2 || tileNumber === 12))
  );
}
function startTurn(g: Game) {
  g.turn++;
  g.offer = null;
  g.players[g.current].playedDev = false;
  g.phase = g.secondary ? "main" : "roll";
  g.resumeTime = null;
  g.dice = [];
  resetDeadline(g);
}
function finishEmptySpecialBuild(g: Game) {
  if (!g.secondary || g.phase !== "main") return;
  const player = g.players[g.current];
  if (hasSpecialBuildAction(g, player)) return;
  if (player.bot && !g.specialBuildRequests.includes(player.id))
    g.specialBuildRequests.push(player.id);
  note(
    g,
    `${player.name} has no available actions, so their special build phase ends automatically.`,
    "special",
  );
  g.secondary = false;
  g.primary = (g.primary + 1) % g.players.length;
  g.current = g.primary;
  startTurn(g);
}
function handValid(h: Hand) {
  return (
    h &&
    RESOURCES.every((r) => Number.isInteger(h[r]) && h[r] >= 0 && h[r] <= 120)
  );
}
function settlePlayerTrade(g: Game, offer: Offer, recipient: Player) {
  const from = g.players.find((player) => player.id === offer.from)!;
  ensure(
    canPay(recipient, offer.want) && canPay(from, offer.give),
    "One of you no longer has those cards.",
  );
  RESOURCES.forEach((resource) => {
    from.resources[resource] += offer.want[resource] - offer.give[resource];
    recipient.resources[resource] += offer.give[resource] - offer.want[resource];
  });
  note(g, `${recipient.name} trades with ${from.name}.`, "trade");
  g.offer = null;
}
export function bankTradeUnits(give: Hand, rates: Hand) {
  if (!handValid(give)) return null;
  let units = 0;
  for (const resource of RESOURCES) {
    const rate = rates[resource];
    if (!Number.isInteger(rate) || rate < 1 || give[resource] % rate !== 0)
      return null;
    units += give[resource] / rate;
  }
  return units;
}
function stealCard(g: Game, thief: Player, victimId: string) {
  const victim = g.players.find((player) => player.id === victimId)!;
  const cards = RESOURCES.flatMap((resource) =>
    Array<Resource>(victim.resources[resource]).fill(resource),
  );
  const resource = cards[Math.floor(rng(g) * cards.length)];
  victim.resources[resource]--;
  thief.resources[resource]++;
  const publicText = `${thief.name} steals a card from ${victim.name}.`;
  const revealedText = `${thief.name} steals 1 ${resource} from ${victim.name}.`;
  note(g, publicText, "action", undefined, {
    [thief.id]: revealedText,
    [victim.id]: revealedText,
  });
}
export function applyAction(
  game: Game,
  playerId: string,
  action: Action,
): Game {
  const g = structuredClone(game);
  const earnsTurnTime =
    !game.phase.startsWith("setup") &&
    ["settlement", "city", "road", "dev"].includes(action.type);
  const hasTimedTurn =
    game.phase === "freeRoad"
      ? game.resumeTime !== null
      : game.deadline !== null;
  mutate(g, playerId, action);
  if (earnsTurnTime && hasTimedTurn) {
    const bonus =
      (g.options.turnActionBonus ?? DEFAULT_OPTIONS.turnActionBonus) * 1000;
    if (bonus && g.resumeTime !== null) g.resumeTime += bonus;
    else if (bonus && g.deadline !== null) g.deadline += bonus;
  }
  g.version++;
  awards(g);
  if (g.phase !== "finished") finishEmptySpecialBuild(g);
  return g;
}
export function toggleSpecialBuildRequest(game: Game, playerId: string): Game {
  const g = structuredClone(game);
  ensure(g.phase !== "finished", "This game has ended.");
  ensure(
    g.options.paired && g.players.length > 4,
    "Special build phases are not enabled for this game.",
  );
  ensure(!g.secondary, "Wait for the normal turn before changing your request.");
  ensure(!g.phase.startsWith("setup"), "Special build phases begin after setup.");
  ensure(
    g.players.some((player) => player.id === playerId),
    "You are not seated in this game.",
  );
  ensure(
    g.players[g.current].id !== playerId,
    "Queue a special build phase during another player's turn.",
  );
  const requests = new Set(g.specialBuildRequests || []);
  if (requests.has(playerId)) requests.delete(playerId);
  else requests.add(playerId);
  g.specialBuildRequests = g.players
    .map((player) => player.id)
    .filter((id) => requests.has(id));
  g.version++;
  return g;
}
function mutate(g: Game, id: string, a: Action) {
  ensure(g.phase !== "finished", "This game has ended.");
  const p = g.players.find((x) => x.id === id);
  ensure(p, "You are not seated in this game.");
  if (a.type === "discard") {
    ensure(
      g.phase === "discard" && g.discards[id] > 0,
      "No discard is required.",
    );
    ensure(
      handValid(a.cards) && total(a.cards) === g.discards[id],
      "Choose exactly the required number of cards.",
    );
    pay(g, p, a.cards);
    delete g.discards[id];
    note(g, `${p.name} discards ${total(a.cards)} cards.`);
    if (!Object.keys(g.discards).length) {
      g.phase = "robber";
      resetDeadline(g);
    }
    return;
  }
  if (a.type === "cancelTrade") {
    ensure(g.phase === "main" && !g.secondary && g.offer &&
      (g.offer.from === id || g.players[g.current].id === id), "You cannot cancel that offer.");
    g.offer = null;
    return;
  }
  if (a.type === "counter") {
    const offer = g.offer;
    const editingOwnCounter = offer?.from === id && offer.to === g.players[g.current].id;
    ensure(g.phase === "main" && !g.secondary && offer && offer.id === a.offerId &&
      (editingOwnCounter || (offer.from !== id && (!offer.to || offer.to === id) &&
      (offer.from === g.players[g.current].id || id === g.players[g.current].id))),
      "That trade is no longer available.");
    ensure(handValid(a.give) && handValid(a.want) && total(a.give) > 0 && total(a.want) > 0 &&
      RESOURCES.every(r => !a.give[r] || !a.want[r]), "Offer and request different resources.");
    ensure(canPay(p, a.give), "You do not have the offered cards.");
    g.offer = { id: g.version + 1, from: id, to: editingOwnCounter ? offer.to : offer.from, give: a.give, want: a.want, approved: [], rejected: [] };
    note(g, `${p.name} makes a counteroffer.`, "trade");
    return;
  }
  if (a.type === "accept" || a.type === "reject") {
    const offer = g.offer;
    const choosingApprovedPlayer =
      a.type === "accept" && !offer?.to && offer?.from === id;
    ensure(
      g.phase === "main" &&
        !g.secondary &&
        offer &&
        offer.id === a.offerId &&
        (choosingApprovedPlayer ||
          (offer.from !== id && (!offer.to || offer.to === id))),
      "That trade is no longer available.",
    );
    if (choosingApprovedPlayer && a.type === "accept") {
      ensure(
        a.player && offer.approved.includes(a.player),
        "Choose a player who approved this offer.",
      );
      const recipient = g.players.find((player) => player.id === a.player);
      ensure(recipient, "That player is no longer available.");
      settlePlayerTrade(g, offer, recipient);
      return;
    }
    if (a.type === "reject") {
      offer.approved = offer.approved.filter((playerId) => playerId !== id);
      if (!offer.rejected.includes(id)) offer.rejected.push(id);
      return;
    }
    const from = g.players.find((x) => x.id === offer.from)!;
    ensure(canPay(p, offer.want), "You do not have the cards requested by this trade.");
    ensure(canPay(from, offer.give), "The player offering this trade no longer has those cards.");
    if (!offer.to) {
      offer.rejected = offer.rejected.filter((playerId) => playerId !== id);
      if (!offer.approved.includes(id)) {
        offer.approved.push(id);
        note(g, `${p.name} approves ${from.name}'s trade offer.`, "trade");
      }
      return;
    }
    settlePlayerTrade(g, offer, p);
    return;
  }
  ensure(g.players[g.current].id === id, "It's another player's turn.");
  if (a.type === "settlement") {
    const setup = g.phase === "setupSettlement";
    ensure(setup || g.phase === "main", "You cannot build a settlement now.");
    ensure(
      settlementSites(g, p, setup).includes(a.id),
      "Choose an available settlement site.",
    );
    if (!setup) pay(g, p, COSTS.settlement);
    g.board.vertices[a.id].owner = id;
    note(g, `${p.name} builds a settlement.`);
    if (setup) {
      g.setupVertex = a.id;
      if (g.setupStep >= g.players.length)
        g.board.vertices[a.id].tiles.forEach((tid) => {
          const t = g.board.tiles[tid];
          if (t.terrain !== "desert") draw(g, p, t.terrain, 1);
        });
      g.phase = "setupRoad";
      resetDeadline(g);
    }
    return;
  }
  if (a.type === "road") {
    const setup = g.phase === "setupRoad",
      free = g.phase === "freeRoad";
    ensure(setup || free || g.phase === "main", "You cannot build a road now.");
    ensure(
      roadSites(g, p, setup).includes(a.id),
      "Choose a connected, open road.",
    );
    if (!setup && !free) pay(g, p, COSTS.road);
    g.board.edges[a.id].owner = id;
    note(g, `${p.name} builds a road.`);
    if (setup) {
      g.setupStep++;
      if (g.setupStep === g.players.length * 2) {
        g.current = 0;
        g.primary = 0;
        startTurn(g);
      } else {
        g.current =
          g.setupStep < g.players.length
            ? g.setupStep
            : 2 * g.players.length - 1 - g.setupStep;
        g.phase = "setupSettlement";
        resetDeadline(g);
      }
    }
    if (free) {
      if (--g.freeRoads === 0 || !roadSites(g, p).length) {
        g.phase = g.resumePhase;
        restoreDeadline(g);
      } else resetDeadline(g);
    }
    return;
  }
  if (a.type === "city") {
    ensure(
      g.phase === "main" && citySites(g, p).includes(a.id),
      "Choose one of your settlements to upgrade.",
    );
    pay(g, p, COSTS.city);
    g.board.vertices[a.id].city = true;
    note(g, `${p.name} upgrades to a city.`);
    return;
  }
  if (a.type === "roll") {
    ensure(g.phase === "roll", "You have already rolled.");
    g.dice = [1 + Math.floor(rng(g) * 6), 1 + Math.floor(rng(g) * 6)];
    const roll = g.dice[0] + g.dice[1];
    note(g, `${p.name} rolls ${roll}.`, "roll");
    if (roll === 7) {
      g.players.forEach((p) => {
        const n = total(p.resources);
        if (n > 7) g.discards[p.id] = Math.floor(n / 2);
      });
      g.phase = Object.keys(g.discards).length ? "discard" : "robber";
      g.resumePhase = "main";
      g.resumeTime = null;
      resetDeadline(g);
    } else {
      produce(g, roll);
      g.phase = "main";
      resetDeadline(g);
    }
    return;
  }
  if (a.type === "robber") {
    ensure(
      g.phase === "robber" && robberSites(g, p).includes(a.id),
      "Choose another eligible hex for the robber.",
    );
    g.robber = a.id;
    g.victims = [
      ...new Set(
        g.board.tiles[a.id].vertices.map((v) => g.board.vertices[v].owner),
      ),
    ].filter(
      (v): v is string =>
        !!v &&
        v !== id &&
        total(g.players.find((p) => p.id === v)!.resources) > 0,
    );
    note(g, `${p.name} moves the robber.`);
    if (g.victims.length === 1) {
      stealCard(g, p, g.victims[0]);
      g.victims = [];
      g.phase = g.resumePhase;
      restoreDeadline(g);
    } else {
      g.phase = g.victims.length > 1 ? "steal" : g.resumePhase;
      if (!g.victims.length) restoreDeadline(g);
      else resetDeadline(g);
    }
    return;
  }
  if (a.type === "steal") {
    ensure(
      g.phase === "steal" && g.victims.includes(a.player),
      "Choose an adjacent player with cards.",
    );
    stealCard(g, p, a.player);
    g.phase = g.resumePhase;
    g.victims = [];
    restoreDeadline(g);
    return;
  }
  if (a.type === "dev") {
    ensure(
      (g.phase === "roll" || g.phase === "main") && !p.playedDev,
      "Play only one development card per turn.",
    );
    const index = p.dev.findIndex(
      (d) => d.type === a.card && d.bought < g.turn,
    );
    ensure(index >= 0, "You cannot play a card bought this turn.");
    let effect = "";
    if (a.card === "plenty") {
      ensure(
        a.resources?.length === 2 &&
          a.resources.every((r) => RESOURCES.includes(r)),
        "Choose two resources.",
      );
      const h = emptyHand();
      a.resources.forEach((r) => h[r]++);
      ensure(
        RESOURCES.every((r) => g.bank[r] >= h[r]),
        "The bank does not have those resources.",
      );
      a.resources.forEach((r) => draw(g, p, r, 1));
      const gains = RESOURCES.filter((r) => h[r] > 0).map(
        (r) => `${h[r]} ${r}`,
      );
      effect = ` and gets ${gains.join(" and ")}`;
    } else if (a.card === "monopoly") {
      ensure(
        a.resources?.length === 1 && RESOURCES.includes(a.resources[0]),
        "Choose a resource.",
      );
      const r = a.resources[0];
      let taken = 0;
      g.players
        .filter((v) => v.id !== id)
        .forEach((v) => {
          taken += v.resources[r];
          p.resources[r] += v.resources[r];
          v.resources[r] = 0;
        });
      effect = ` and takes ${taken} ${r} from the other players`;
    } else if (a.card === "knight") {
      p.knights++;
      g.resumePhase = g.phase;
      preserveDeadline(g);
      g.phase = "robber";
      resetDeadline(g);
    } else if (a.card === "roadBuilding") {
      ensure(roadSites(g, p).length, "You have no road placements available.");
      g.resumePhase = g.phase;
      preserveDeadline(g);
      g.phase = "freeRoad";
      g.freeRoads = Math.min(
        2,
        15 - g.board.edges.filter((e) => e.owner === id).length,
      );
      resetDeadline(g);
    } else throw new Error("Unknown development card.");
    p.dev.splice(index, 1);
    p.playedDev = true;
    note(
      g,
      `${p.name} plays ${a.card === "roadBuilding" ? "Road Building" : a.card === "plenty" ? "Year of Plenty" : a.card === "monopoly" ? "Monopoly" : "a Knight"}${effect}.`,
      "dev",
    );
    return;
  }
  if (a.type === "skipRoad") {
    ensure(g.phase === "freeRoad", "No free roads to skip.");
    g.freeRoads = 0;
    g.phase = g.resumePhase;
    restoreDeadline(g);
    return;
  }
  ensure(g.phase === "main", "Finish the current action first.");
  if (a.type === "buyDev") {
    ensure(g.deck.length, "No development cards remain.");
    pay(g, p, COSTS.development);
    p.dev.push({ type: g.deck.pop()!, bought: g.turn });
    note(g, `${p.name} buys a development card.`);
    return;
  }
  if (a.type === "bank") {
    const tradeUnits = bankTradeUnits(a.give, ratios(g, p));
    ensure(
      handValid(a.give) &&
        handValid(a.want) &&
        total(a.give) > 0 &&
        total(a.want) > 0 &&
        tradeUnits === total(a.want) &&
        RESOURCES.every((r) => !a.give[r] || !a.want[r]),
      "Choose a valid bank trade.",
    );
    ensure(
      RESOURCES.every((r) => g.bank[r] >= a.want[r]),
      "The bank is short of a requested resource.",
    );
    pay(g, p, a.give);
    RESOURCES.forEach((r) => draw(g, p, r, a.want[r]));
    const offered = RESOURCES.filter((r) => a.give[r])
      .map((r) => `${a.give[r]} ${r}`)
      .join(" and ");
    const requested = RESOURCES.filter((r) => a.want[r])
      .map((r) => `${a.want[r]} ${r}`)
      .join(" and ");
    note(
      g,
      `${p.name} trades ${offered} with the bank for ${requested}.`,
      "trade",
    );
    return;
  }
  if (a.type === "offer") {
    ensure(!g.secondary, "Paired turns allow bank trades only.");
    ensure(
      handValid(a.give) &&
        handValid(a.want) &&
        total(a.give) > 0 &&
        total(a.want) > 0 &&
        RESOURCES.every((r) => !a.give[r] || !a.want[r]),
      "Offer and request different resources.",
    );
    ensure(canPay(p, a.give), "You do not have the offered cards.");
    g.offer = {
      id: g.version + 1,
      from: id,
      give: a.give,
      want: a.want,
      approved: [],
      rejected: [],
    };
    note(g, `${p.name} offers a trade.`, "trade");
    return;
  }
  if (a.type === "end") {
    const requestedPlayer = g.players[(g.primary + 3) % g.players.length];
    const requested = (g.specialBuildRequests || []).includes(
      requestedPlayer.id,
    );
    let beganSpecialBuild = false;
    if (
      g.options.paired &&
      g.players.length > 4 &&
      !g.secondary &&
      requested
    ) {
      g.specialBuildRequests = g.specialBuildRequests.filter(
        (playerId) => playerId !== requestedPlayer.id,
      );
      g.secondary = true;
      g.current = (g.primary + 3) % g.players.length;
      beganSpecialBuild = true;
    } else {
      if (
        g.secondary &&
        p.bot &&
        !(g.specialBuildRequests || []).includes(p.id)
      )
        g.specialBuildRequests.push(p.id);
      g.secondary = false;
      g.primary = (g.primary + 1) % g.players.length;
      g.current = g.primary;
    }
    startTurn(g);
    if (beganSpecialBuild)
      note(
        g,
        `${g.players[g.current].name} begins a special build phase.`,
        "special",
      );
    return;
  }
  throw new Error("Unknown action.");
}
export function publicPlayer(
  g: Game | null,
  p: Player,
  viewer: string,
): PublicPlayer {
  const { resources, dev, ...rest } = p;
  return {
    ...rest,
    cardCount: total(resources),
    devCount: dev.length,
    points: g ? points(g, p, p.id === viewer || g.phase === "finished") : 0,
    ...(p.id === viewer ? { resources, dev } : {}),
  };
}
export function viewGame(g: Game, viewer: string): GameView {
  const {
    rng: _rng,
    deck,
    players,
    resumeTime: _resumeTime,
    log,
    ...rest
  } = g;
  const p = players.find((p) => p.id === viewer);
  return {
    ...rest,
    players: players.map((p) => publicPlayer(g, p, viewer)),
    log: log.map(({ privateText, ...entry }) => ({
      ...entry,
      text: privateText?.[viewer] || entry.text,
    })),
    deckCount: deck.length,
    legal: p
      ? {
          settlements: settlementSites(g, p, g.phase === "setupSettlement"),
          roads: roadSites(g, p, g.phase === "setupRoad"),
          cities: citySites(g, p),
          robber: robberSites(g, p),
          ratios: ratios(g, p),
        }
      : {
          settlements: [],
          roads: [],
          cities: [],
          robber: [],
          ratios: emptyHand(),
        },
  };
}
