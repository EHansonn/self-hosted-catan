import http from "node:http";
import { isIP } from "node:net";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  copyFileSync,
  existsSync,
  statSync,
  createReadStream,
} from "node:fs";
import { resolve, extname, sep } from "node:path";
import { randomBytes, randomInt, createHash, timingSafeEqual } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import {
  type Game,
  type Options,
  type Player,
  type Action,
  type Hand,
  type RoomView,
  type ResumeRoomView,
  DEFAULT_OPTIONS,
  COLORS,
  BOT_NAMES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  makeBoard,
  mapGenerationRules,
  makePlayer,
  randomPlayerOrder,
  createGame,
  applyAction,
  finalGameResults,
  note,
  toggleSpecialBuildRequest,
  points,
  publicPlayer,
  viewGame,
  resetDeadline,
  expirePlayerTrade,
  canResumeRoom,
  canPay,
  total,
} from "../shared/game";
import { chooseBotAction, chooseTimeoutAction } from "../shared/bot";
import {
  emptyCommunity,
  hydrateCommunity,
  nameWinnerSheep,
  recordOfficialGame,
  viewCommunity,
  type CommunityState,
} from "../shared/community";
import {
  disconnectedPlayerExpired,
  nextDisconnectedSince,
  nextUnattendedSince,
  unattendedGameExpired,
} from "../shared/room-lifecycle";

const port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "127.0.0.1";
const dataDir = resolve(process.env.DATA_DIR || "data"),
  staticDir = resolve(process.env.STATIC_DIR || "dist/client");
const appName = (process.env.APP_NAME || "Crossroads").trim();
if (
  !appName ||
  appName.length > 48 ||
  [...appName].some((character) => {
    const codePoint = character.codePointAt(0) || 0;
    return codePoint < 32 || codePoint === 127;
  })
)
  throw new Error(
    "APP_NAME must be between 1 and 48 characters and cannot contain control characters.",
  );
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
for (const origin of allowedOrigins) {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== origin
  )
    throw new Error(
      `ALLOWED_ORIGINS entries must be exact HTTP(S) origins: ${origin}`,
    );
}
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const accessFile = resolve(dataDir, "access-key");
let accessKey = process.env.ROOM_CREATE_PASSWORD || "";
if (!accessKey) {
  if (existsSync(accessFile))
    accessKey = readFileSync(accessFile, "utf8").trim();
  else {
    accessKey = randomBytes(18).toString("base64url");
    writeFileSync(accessFile, accessKey + "\n", { mode: 0o600 });
  }
}
if (accessKey.length < 12)
  throw new Error("ROOM_CREATE_PASSWORD must be at least 12 characters.");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const accessHash = hash(accessKey);
function positiveDuration(name: string, fallback: number, minimum: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}
function positiveInteger(name: string, fallback: number, minimum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum ? value : fallback;
}
const ROOM_CODE_PATTERN = /^[A-F0-9]{16}$/;
const secureRandom = () => randomInt(0x100000000) / 0x100000000;
const MAX_ROOMS = 8,
  MAX_SESSIONS = 100,
  MAX_CONNECTIONS = positiveInteger("MAX_CONNECTIONS", 96, 12),
  MAX_CONNECTIONS_PER_IP = positiveInteger(
    "MAX_CONNECTIONS_PER_IP",
    16,
    3,
  ),
  ROOM_TTL = 7 * 86400000,
  EMPTY_GAME_GRACE_MS = positiveDuration(
    "EMPTY_GAME_GRACE_MS",
    3 * 60_000,
    1_000,
  ),
  PLAYER_DISCONNECT_GRACE_MS = positiveDuration(
    "PLAYER_DISCONNECT_GRACE_MS",
    2 * 60_000,
    1_000,
  ),
  CLEANUP_INTERVAL_MS = positiveDuration(
    "CLEANUP_INTERVAL_MS",
    15_000,
    100,
  );
interface Session {
  id: string;
  expires: number;
  room?: string;
}
interface Room {
  code: string;
  host: string;
  mapSeed: number;
  options: Options;
  players: Player[];
  game: Game | null;
  chat: { id: number; name: string; text: string }[];
  updated: number;
  unattendedSince?: number;
  disconnectedSince?: Record<string, number>;
  automaticTakeovers?: string[];
  paused?: boolean;
  pausedRemainingMs?: number | null;
  matchId?: string;
  recordedMatchId?: string;
  leaderboardEligible?: boolean;
  startingHumanPlayers?: number;
  discardSelections?: Record<string, Hand>;
}
const sessions = new Map<string, Session>(),
  rooms = new Map<string, Room>(),
  connections = new Map<string, Set<string>>(),
  connectionsByIp = new Map<string, number>();
let community: CommunityState = emptyCommunity();
const storePath = resolve(dataDir, "state.json");
const backupStorePath = storePath + ".bak";
let prunedCompletedRooms = false;
const migratedRoomCodes = new Map<string, string>();
if (existsSync(storePath)) {
  let saved: {
    schema: number;
    sessions: [string, Session][];
    rooms: Room[];
    community?: unknown;
  };
  try {
    saved = JSON.parse(readFileSync(storePath, "utf8"));
  } catch (error) {
    if (!existsSync(backupStorePath)) throw error;
    console.error("Primary state could not be read; restoring the last backup.");
    saved = JSON.parse(readFileSync(backupStorePath, "utf8"));
    prunedCompletedRooms = true;
  }
  if (![1, 2].includes(saved.schema))
    throw new Error("Unsupported save schema.");
  community = hydrateCommunity(saved.community);
  for (const [key, s] of saved.sessions as [string, Session][])
    if (s.expires > Date.now()) sessions.set(key, s);
  for (const r of saved.rooms as Room[])
    if (Date.now() - r.updated < ROOM_TTL) {
      if (!ROOM_CODE_PATTERN.test(r.code)) {
        if (!/^[A-F0-9]{6}$/.test(r.code)) continue;
        const previousCode = r.code;
        do r.code = randomBytes(8).toString("hex").toUpperCase();
        while (rooms.has(r.code));
        migratedRoomCodes.set(previousCode, r.code);
        prunedCompletedRooms = true;
      }
      r.options = { ...DEFAULT_OPTIONS, ...r.options };
      if (!Number.isInteger(r.mapSeed) || r.mapSeed < 0 || r.mapSeed > 0xffffffff)
        r.mapSeed = Number.parseInt(hash(r.code).slice(0, 8), 16) >>> 0;
      r.players.forEach((p) => (p.connected = false));
      r.game?.players.forEach((p) => (p.connected = false));
      if (r.game) {
        r.game.options = { ...DEFAULT_OPTIONS, ...r.game.options };
        r.game.startedAt = Number.isFinite(r.game.startedAt)
          ? r.game.startedAt
          : r.updated;
        r.game.finishedAt = Number.isFinite(r.game.finishedAt)
          ? r.game.finishedAt
          : r.game.phase === "finished"
            ? r.updated
            : null;
        r.game.pausedMs = Number.isFinite(r.game.pausedMs)
          ? Math.max(0, r.game.pausedMs)
          : 0;
        r.game.pausedAt = Number.isFinite(r.game.pausedAt)
          ? r.game.pausedAt
          : r.paused
            ? r.updated
            : null;
        r.game.specialBuildRequests ??=
          r.game.options.paired && r.game.players.length > 4
            ? r.game.players
                .filter((player) => player.bot)
                .map((player) => player.id)
            : [];
        r.game.resumeTime ??= null;
        if (r.game.offer) r.game.offer.approved ??= [];
        if (r.paused) {
          const remaining = r.pausedRemainingMs;
          if (
            remaining !== null &&
            !(
              typeof remaining === "number" &&
              Number.isFinite(remaining) &&
              remaining >= 0
            )
          ) {
            // Older saves did not store the frozen remainder. Give those rooms
            // one fresh phase window, then freeze it until the host resumes.
            resetDeadline(r.game);
            r.pausedRemainingMs = r.game.deadline === null
              ? null
              : Math.max(0, r.game.deadline - Date.now());
          }
          r.game.deadline = null;
        } else {
          delete r.pausedRemainingMs;
          resetDeadline(r.game);
        }
        r.matchId ||= randomBytes(12).toString("hex");
        // Human session IDs never use the bot prefix, even if the host later
        // replaces that seat with a bot. This preserves start-of-game status
        // while correcting saves made under the old total-seat rule.
        r.startingHumanPlayers ??= r.game.players.filter(
          (player) => !player.id.startsWith("bot-"),
        ).length;
        r.leaderboardEligible = r.startingHumanPlayers >= 3;
        r.disconnectedSince = Object.fromEntries(
          Object.entries(r.disconnectedSince || {}).filter(
            ([playerId, timestamp]) =>
              r.game?.players.some(
                (player) => !player.bot && player.id === playerId,
              ) && Number.isFinite(timestamp),
          ),
        );
        r.automaticTakeovers = (r.automaticTakeovers || []).filter(
          (playerId) =>
            r.game?.players.some(
              (player) =>
                !player.bot && player.id === playerId && player.automated,
            ),
        );
      }
      if (r.game?.phase === "finished") {
        settleFinishedRoom(r);
        for (const session of sessions.values())
          if (session.room === r.code) delete session.room;
        prunedCompletedRooms = true;
        continue;
      }
      const storedUnattendedSince = Number.isFinite(r.unattendedSince)
        ? r.unattendedSince
        : undefined;
      r.unattendedSince = nextUnattendedSince(
        storedUnattendedSince,
        !!r.game,
        false,
        Date.now(),
      );
      if (
        unattendedGameExpired(
          r.unattendedSince,
          Date.now(),
          EMPTY_GAME_GRACE_MS,
        )
      )
        continue;
      rooms.set(r.code, r);
    }
  for (const session of sessions.values()) {
    const migrated = session.room
      ? migratedRoomCodes.get(session.room)
      : undefined;
    if (migrated) session.room = migrated;
    if (session.room && !rooms.has(session.room)) {
      delete session.room;
      prunedCompletedRooms = true;
    }
  }
}
function save() {
  const tmp = storePath + ".tmp";
  writeFileSync(
    tmp,
    JSON.stringify({
      schema: 2,
      sessions: [...sessions],
      rooms: [...rooms.values()],
      community,
    }),
    { mode: 0o600 },
  );
  if (existsSync(storePath)) copyFileSync(storePath, backupStorePath);
  renameSync(tmp, storePath);
}
function setRoomPaused(room: Room, paused: boolean) {
  const game = room.game;
  if (!game || !!room.paused === paused) return;
  const now = Date.now();
  if (paused) {
    room.pausedRemainingMs = game.deadline === null
      ? null
      : Math.max(0, game.deadline - now);
    game.deadline = null;
    game.pausedAt = now;
    room.paused = true;
    return;
  }
  const remaining = room.pausedRemainingMs;
  if (game.pausedAt !== null)
    game.pausedMs += Math.max(0, now - game.pausedAt);
  game.pausedAt = null;
  room.paused = false;
  delete room.pausedRemainingMs;
  if (remaining === undefined) resetDeadline(game);
  else game.deadline = remaining === null ? null : now + remaining;
}
if (prunedCompletedRooms) save();
const buckets = new Map<string, { count: number; until: number }>();
const autoTurns = new Map<string, string>();
function limit(key: string, max: number, window = 60000) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.until < now) {
    b = { count: 0, until: now + window };
    if (buckets.size >= 2000) {
      for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
      if (buckets.size >= 2000) return false;
    }
    buckets.set(key, b);
  }
  return ++b.count <= max;
}
function requestIp(req: http.IncomingMessage) {
  const direct = req.socket.remoteAddress || "unknown";
  if (process.env.TRUST_PROXY_HEADERS !== "true") return direct;
  for (const name of ["cf-connecting-ip", "x-forwarded-for"] as const) {
    const value = req.headers[name];
    const first = (Array.isArray(value) ? value[0] : value)
      ?.split(",")[0]
      .trim();
    if (first && isIP(first)) return first;
  }
  return direct;
}
function originAllowed(req: http.IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return (
      ["http:", "https:"].includes(u.protocol) &&
      (u.host === req.headers.host ||
        allowedOrigins.has(origin))
    );
  } catch {
    return false;
  }
}
function httpsRedirectOrigin(req: http.IncomingMessage) {
  if (
    process.env.SECURE_COOKIE !== "true" ||
    req.headers["x-forwarded-proto"] !== "http"
  )
    return null;
  const host = req.headers.host?.toLowerCase();
  return (
    [...allowedOrigins].find((origin) => {
      const candidate = new URL(origin);
      return candidate.protocol === "https:" && candidate.host === host;
    }) || null
  );
}
function getSession(req: http.IncomingMessage) {
  const token = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("harbor_session="))
    ?.slice(15);
  const key = token ? hash(token) : "";
  const session = sessions.get(key);
  return session && session.expires > Date.now() ? { session, key } : null;
}
function json(res: http.ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function issueSession(res: http.ServerResponse) {
  for (const [key, session] of sessions)
    if (session.expires < Date.now()) sessions.delete(key);
  if (sessions.size >= MAX_SESSIONS) {
    const unused = [...sessions]
      .filter(([, session]) => !session.room && !connections.has(session.id))
      .sort((a, b) => a[1].expires - b[1].expires);
    while (sessions.size >= MAX_SESSIONS && unused.length)
      sessions.delete(unused.shift()![0]);
  }
  if (sessions.size >= MAX_SESSIONS) return null;
  const token = randomBytes(32).toString("base64url");
  const session: Session = {
    id: randomBytes(12).toString("hex"),
    expires: Date.now() + 7 * 86400000,
  };
  const key = hash(token);
  sessions.set(key, session);
  save();
  res.setHeader(
    "Set-Cookie",
    `harbor_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.SECURE_COOKIE === "true" ? "; Secure" : ""}`,
  );
  return { session, key };
}
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
  res.setHeader(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate",
  );
  res.setHeader("Referrer-Policy", "no-referrer");
  if (process.env.SECURE_COOKIE === "true")
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  const ip = requestIp(req);
  const path = (req.url || "/").split("?")[0];
  try {
    const redirectOrigin = httpsRedirectOrigin(req);
    if (redirectOrigin) {
      if (!["GET", "HEAD"].includes(req.method || ""))
        return json(res, 426, { error: "Use HTTPS for this request." });
      res.writeHead(308, {
        Location: redirectOrigin + (req.url || "/"),
        "Cache-Control": "no-store",
      });
      return res.end();
    }
    if (!originAllowed(req))
      return json(res, 403, { error: "Origin is not allowed." });
    if (path === "/api/health")
      return json(res, 200, { ok: true, name: appName });
    if (path === "/api/config" && req.method === "GET")
      return json(res, 200, { appName });
    if (path === "/api/session" && req.method === "GET") {
      let s = getSession(req);
      if (!s) {
        if (!limit("session:" + ip, 30, 60 * 60000))
          return json(res, 429, {
            error: "Too many new player sessions. Try again later.",
          });
        s = issueSession(res);
        if (!s)
          return json(res, 503, {
            error: "The server has reached its player-session limit.",
          });
      }
      return json(res, 200, {
        authenticated: true,
        id: s.session.id,
        room: s.session.room,
      });
    }
    if (path === "/api/session/new" && req.method === "POST") {
      if (!limit("new-session:" + ip, 10, 60 * 60000))
        return json(res, 429, {
          error: "Too many identity changes. Try again later.",
        });
      const fresh = issueSession(res);
      if (!fresh)
        return json(res, 503, {
          error: "The server has reached its player-session limit.",
        });
      return json(res, 200, { authenticated: true, id: fresh.session.id });
    }
    if (path === "/api/logout" && req.method === "POST") {
      const s = getSession(req);
      if (s) {
        sessions.delete(s.key);
        connections
          .get(s.session.id)
          ?.forEach((id) => io.sockets.sockets.get(id)?.disconnect(true));
        save();
      }
      res.setHeader(
        "Set-Cookie",
        "harbor_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      return json(res, 200, { ok: true });
    }
    if (path.startsWith("/api/"))
      return json(res, 404, { error: "Not found." });
    if (!["GET", "HEAD"].includes(req.method || ""))
      return json(res, 405, { error: "Method not allowed." });
    if (!limit("http:" + ip, 1000))
      return json(res, 429, { error: "Request limit reached." });
    const decoded = decodeURIComponent(path);
    let file = resolve(staticDir, "." + decoded);
    if (file !== staticDir && !file.startsWith(staticDir + sep))
      return json(res, 403, { error: "Forbidden." });
    if (!existsSync(file) || !statSync(file).isFile()) {
      if (extname(decoded)) return json(res, 404, { error: "File not found." });
      file = resolve(staticDir, "index.html");
    }
    if (!existsSync(file))
      return json(res, 503, {
        error: "Web app is building. Use the local preview on port 5173.",
      });
    const mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
      ".json": "application/json",
    };
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.setHeader(
      "Cache-Control",
      file.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(file);
    stream.on("error", () => {
      if (!res.headersSent)
        json(res, 500, { error: "Unable to read the requested file." });
      else res.destroy();
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    json(res, 400, {
      error: error instanceof Error ? error.message : "Invalid request.",
    });
  }
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 64;
const io = new Server(server, {
  maxHttpBufferSize: 8192,
  serveClient: false,
  transports: ["websocket"],
  pingTimeout: 20000,
  allowRequest: (req, cb) =>
    cb(
      null,
      originAllowed(req) &&
        io.engine.clientsCount < MAX_CONNECTIONS &&
        limit("connect:" + requestIp(req), 60) &&
        !!getSession(req),
    ),
});
io.use((socket, next) => {
  const auth = getSession(socket.request);
  if (!auth)
    return next(new Error(`Open ${appName} again to start a player session.`));
  if ((connections.get(auth.session.id)?.size || 0) >= 3)
    return next(new Error("Close another game tab first."));
  const ip = requestIp(socket.request);
  if ((connectionsByIp.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP)
    return next(new Error("Too many game connections from this network."));
  socket.data.session = auth.session;
  socket.data.key = auth.key;
  socket.data.clientIp = ip;
  next();
});
const optionsSchema = z.object({
  seats: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS),
  target: z.union([z.literal(8),z.literal(10)]),
  difficulty: z.enum(["easy", "normal", "hard"]),
  timer: z.union([
    z.literal(0),
    z.literal(60),
    z.literal(120),
    z.literal(180),
    z.literal(360),
  ]),
  turnActionBonus: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(60),
  ]).default(15),
  tradeTimer: z.union([
    z.literal(0),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(90),
  ]).default(30),
  postTradeTimer: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(60),
  ]).default(15),
  setupSettlementTimer: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]).default(120),
  setupRoadTimer: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(45),
    z.literal(60),
  ]).default(20),
  robberTimer: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(45),
    z.literal(60),
  ]).default(20),
  actionTimer: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
  ]).default(10),
  discardTimer: z.union([
    z.literal(0),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(45),
    z.literal(60),
  ]).default(20),
  balanced: z.boolean(),
  allowSixEightTouch: z.boolean().default(false),
  allowTwoTwelveTouch: z.boolean().default(true),
  allowSameNumbersTouch: z.boolean().default(true),
  allowSameResourcesTouch: z.boolean().default(false),
  friendlyRobber: z.boolean(),
  linkedTwoTwelve: z.boolean().default(false),
  paired: z.boolean(),
  showDiscardedCards: z.boolean().default(true),
});
const resource = z.enum(["wood", "brick", "sheep", "wheat", "ore"]);
const playerName = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .refine((name) => !/\p{C}/u.test(name), "Names cannot contain control characters.");
const chatMessage = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(
    (message) => !/\p{C}/u.test(message),
    "Messages cannot contain control characters.",
  );
const hand = z
  .object({
    wood: z.number().int().min(0).max(120),
    brick: z.number().int().min(0).max(120),
    sheep: z.number().int().min(0).max(120),
    wheat: z.number().int().min(0).max(120),
    ore: z.number().int().min(0).max(120),
  })
  .strict();
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("road"), id: z.number().int().min(0).max(200) }),
  ...(["settlement", "city", "robber"] as const).map((type) =>
    z.object({ type: z.literal(type), id: z.number().int().min(0).max(200) }),
  ),
  ...(["roll", "end", "buyDev", "skipRoad", "cancelTrade"] as const).map(
    (type) => z.object({ type: z.literal(type) }),
  ),
  z.object({ type: z.literal("discard"), cards: hand }),
  z.object({ type: z.literal("steal"), player: z.string().max(48) }),
  z.object({
    type: z.literal("bank"),
    give: hand,
    want: hand,
  }),
  z.object({ type: z.literal("offer"), give: hand, want: hand }),
  z.object({ type: z.literal("counter"), offerId: z.number().int(), give: hand, want: hand }),
  z.object({
    type: z.literal("accept"),
    offerId: z.number().int(),
    player: z.string().max(48).optional(),
  }),
  z.object({ type: z.literal("reject"), offerId: z.number().int() }),
  z.object({
    type: z.literal("dev"),
    card: z.enum(["knight", "roadBuilding", "plenty", "monopoly"]),
    resources: z.array(resource).max(2).optional(),
  }),
]);
function fail(message: string): never {
  throw new Error(message);
}
function unusedColor(room: Room, requested?: string) {
  const used = new Set(room.players.map((player) => player.color));
  if (requested && COLORS.includes(requested) && !used.has(requested))
    return requested;
  return (
    COLORS.find((color) => !used.has(color)) ||
    COLORS[room.players.length % COLORS.length]
  );
}
function playerNameKey(name: string) {
  return name
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}
function ensurePlayerNameAvailable(room: Room, name: string) {
  if (
    room.players.some(
      (player) => playerNameKey(player.name) === playerNameKey(name),
    )
  )
    fail("That name is already being used in this room.");
}
function randomBotName(room: Room) {
  const used = new Set(room.players.map((player) => playerNameKey(player.name)));
  const available = BOT_NAMES.filter((name) => !used.has(playerNameKey(name)));
  if (available.length) return available[randomInt(available.length)];
  let fallback = "";
  do fallback = `Bot ${randomInt(100, 1000)}`;
  while (used.has(playerNameKey(fallback)));
  return fallback;
}
function isViewingRoom(code: string, playerId: string) {
  return [...(connections.get(playerId) || [])].some(
    (socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      return (
        socket?.data.room === code &&
        (socket.data.session as Session).room === code
      );
    },
  );
}
function hasHumanViewer(room: Room) {
  return room.players.some(
    (player) => !player.bot && isViewingRoom(room.code, player.id),
  );
}
function refreshRoomAttendance(room: Room, now = Date.now()) {
  const next = nextUnattendedSince(
    room.unattendedSince,
    !!room.game && room.game.phase !== "finished",
    hasHumanViewer(room),
    now,
  );
  if (next === room.unattendedSince) return false;
  if (next === undefined) delete room.unattendedSince;
  else room.unattendedSince = next;
  return true;
}
function refreshDisconnectedTakeovers(room: Room, now = Date.now()) {
  const game = room.game;
  const ongoing = !!game && game.phase !== "finished";
  if (!ongoing || !game) {
    const changed =
      !!Object.keys(room.disconnectedSince || {}).length ||
      !!room.automaticTakeovers?.length;
    delete room.disconnectedSince;
    delete room.automaticTakeovers;
    return changed;
  }
  const disconnectedSince = { ...(room.disconnectedSince || {}) };
  const automaticTakeovers = new Set(room.automaticTakeovers || []);
  const humanIds = new Set(
    game.players.filter((player) => !player.bot).map((player) => player.id),
  );
  let changed = false;
  for (const playerId of Object.keys(disconnectedSince))
    if (!humanIds.has(playerId)) {
      delete disconnectedSince[playerId];
      changed = true;
    }
  for (const playerId of automaticTakeovers)
    if (!humanIds.has(playerId)) {
      automaticTakeovers.delete(playerId);
      changed = true;
    }
  const attended = hasHumanViewer(room);
  for (const player of game.players) {
    if (player.bot) continue;
    const connected = isViewingRoom(room.code, player.id);
    const next = nextDisconnectedSince(
      disconnectedSince[player.id],
      ongoing,
      connected,
      attended,
      now,
    );
    if (next === undefined) {
      if (disconnectedSince[player.id] !== undefined) {
        delete disconnectedSince[player.id];
        changed = true;
      }
      if (automaticTakeovers.delete(player.id)) {
        if (player.automated) {
          player.automated = false;
          note(
            game,
            `${player.name} reconnected and resumed control.`,
            "system",
          );
        }
        changed = true;
      }
      continue;
    }
    if (next !== disconnectedSince[player.id]) {
      disconnectedSince[player.id] = next;
      changed = true;
    }
    if (
      disconnectedPlayerExpired(next, now, PLAYER_DISCONNECT_GRACE_MS) &&
      !player.automated
    ) {
      player.automated = true;
      automaticTakeovers.add(player.id);
      note(
        game,
        `${player.name} disconnected, so a bot is playing their seat.`,
        "system",
      );
      changed = true;
    }
  }
  if (Object.keys(disconnectedSince).length)
    room.disconnectedSince = disconnectedSince;
  else delete room.disconnectedSince;
  if (automaticTakeovers.size)
    room.automaticTakeovers = [...automaticTakeovers];
  else delete room.automaticTakeovers;
  return changed;
}
function resumeRooms(session: Session): ResumeRoomView[] {
  const room = session.room ? rooms.get(session.room) : undefined;
  const seatedPlayer = room?.players.find((p) => p.id === session.id);
  if (!room || !seatedPlayer || !canResumeRoom(room.game)) return [];
  const players = room.game?.players || room.players;
  return [
    {
      code: room.code,
      options: room.options,
      players: players.map(({ name, color, bot }) => ({ name, color, bot })),
      started: !!room.game,
      paused: !!room.paused,
      phase: room.game?.phase || null,
      turn: room.game?.turn ?? null,
      currentPlayer: room.game
        ? room.game.players[room.game.current]?.name || null
        : null,
      updated: room.updated,
    },
  ];
}
function releaseFinishedRoom(session: Session, room: Room | undefined) {
  if (!room || canResumeRoom(room.game)) return;
  room.players = room.players.filter((player) => player.id !== session.id);
  delete session.room;
  if (!room.players.some((player) => !player.bot)) rooms.delete(room.code);
  else {
    if (room.host === session.id)
      room.host = room.players.find((player) => !player.bot)!.id;
    room.updated = Date.now();
    broadcast(room);
  }
  sendSessionHome(session.id);
}
function sendHome(socket: Socket) {
  socket.data.room = undefined;
  socket.data.spectator = false;
  socket.emit("room", null);
  socket.emit(
    "resume-options",
    resumeRooms(socket.data.session as Session),
  );
  emitCommunity(socket);
}
function sendSessionHome(sessionId: string) {
  for (const socket of io.sockets.sockets.values())
    if ((socket.data.session as Session).id === sessionId) sendHome(socket);
}
function broadcast(room: Room) {
  const ps = room.game?.players || room.players;
  ps.forEach((p) => (p.connected = isViewingRoom(room.code, p.id)));
  room.players.forEach(
    (p) => (p.connected = isViewingRoom(room.code, p.id)),
  );
  for (const socket of io.sockets.sockets.values()) {
    const s = socket.data.session as Session;
    const seated =
      s.room === room.code && room.players.some((p) => p.id === s.id);
    const spectator =
      socket.data.spectator === true && socket.data.room === room.code;
    if (!seated && !spectator) continue;
    if (socket.data.room !== room.code) {
      if (seated) socket.emit("resume-options", resumeRooms(s));
      continue;
    }
    const viewer = spectator ? "" : s.id;
    const view: RoomView = {
      code: room.code,
      host: room.host,
      me: s.id,
      spectator,
      mapSeed: room.mapSeed,
      options: room.options,
      players: ps.map((p) => publicPlayer(room.game, p, viewer)),
      game: room.game ? viewGame(room.game, viewer) : null,
      chat: room.chat,
      discardSelection: viewer
        ? room.discardSelections?.[viewer]
        : undefined,
    };
    socket.emit("room", { ...view, paused: !!room.paused });
  }
}
function attendanceChanged(room: Room) {
  const now = Date.now();
  const roomChanged = refreshRoomAttendance(room, now);
  const takeoverChanged = refreshDisconnectedTakeovers(room, now);
  if (roomChanged || takeoverChanged) {
    room.updated = now;
    save();
  }
  broadcast(room);
}
function emitCommunity(socket: Socket) {
  const session = socket.data.session as Session;
  socket.emit("community", viewCommunity(community, session.id));
}
function broadcastCommunity() {
  for (const socket of io.sockets.sockets.values()) emitCommunity(socket);
}
function settleFinishedRoom(room: Room) {
  const game = room.game;
  if (
    !game ||
    game.phase !== "finished" ||
    !game.winner ||
    !room.matchId ||
    room.recordedMatchId === room.matchId
  )
    return false;
  room.recordedMatchId = room.matchId;
  return recordOfficialGame(community, {
    matchId: room.matchId,
    roomCode: room.code,
    completedAt: room.updated,
    eligible: room.leaderboardEligible === true,
    startingHumanPlayers:
      room.startingHumanPlayers ??
      game.players.filter((player) => !player.id.startsWith("bot-")).length,
    winnerId: game.winner,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      points: points(game, player, true),
      bot: player.bot,
    })),
  });
}
function detachRoom(room: Room) {
  const members = new Set<string>();
  for (const session of sessions.values())
    if (session.room === room.code) {
      members.add(session.id);
      delete session.room;
    }
  rooms.delete(room.code);
  autoTurns.delete(room.code);
  return members;
}
function closeRoom(room: Room) {
  const viewers = [...io.sockets.sockets.values()].filter(
    (socket) => socket.data.room === room.code,
  );
  const members = detachRoom(room);
  save();
  members.forEach(sendSessionHome);
  viewers.forEach(sendHome);
}
function announceGameResults(room: Room) {
  if (!room.game || room.game.phase !== "finished") return;
  const official = room.leaderboardEligible === true;
  const results = finalGameResults(room.game, room.code, official);
  for (const socket of io.sockets.sockets.values()) {
    const session = socket.data.session as Session;
    if (
      socket.data.room === room.code &&
      ((session.room === room.code &&
        room.players.some((player) => player.id === session.id)) ||
        socket.data.spectator === true)
    )
      socket.emit("game-results", results);
  }
}
function closeCompletedRoom(room: Room) {
  if (room.game?.phase !== "finished") return false;
  const communityChanged = settleFinishedRoom(room);
  announceGameResults(room);
  closeRoom(room);
  if (communityChanged) broadcastCommunity();
  return true;
}
function changed(room: Room) {
  if (room.discardSelections) {
    const activeDiscards =
      room.game?.phase === "discard" ? room.game.discards : {};
    for (const playerId of Object.keys(room.discardSelections))
      if (!activeDiscards[playerId]) delete room.discardSelections[playerId];
    if (!Object.keys(room.discardSelections).length)
      delete room.discardSelections;
  }
  room.updated = Date.now();
  if (closeCompletedRoom(room)) return;
  refreshRoomAttendance(room, room.updated);
  refreshDisconnectedTakeovers(room, room.updated);
  save();
  broadcast(room);
}
io.on("connection", (socket) => {
  const session = socket.data.session as Session;
  const set = connections.get(session.id) || new Set<string>();
  set.add(socket.id);
  connections.set(session.id, set);
  const clientIp = String(socket.data.clientIp);
  connectionsByIp.set(clientIp, (connectionsByIp.get(clientIp) || 0) + 1);
  socket.on("command", (raw: unknown, ack: (v: unknown) => void) => {
    if (typeof ack !== "function") return;
    try {
      if (!sessions.has(socket.data.key) || session.expires < Date.now())
        fail("Session expired. Sign in again.");
      if (!limit("action:" + session.id, 150)) fail("Slow down for a moment.");
      const command = z
        .object({ type: z.string().max(24) })
        .passthrough()
        .parse(raw);
      const savedRoom = session.room ? rooms.get(session.room) : undefined;
      const room = socket.data.room
        ? rooms.get(String(socket.data.room))
        : savedRoom;
      const needRoom = () =>
        room && socket.data.room === room.code
          ? room
          : fail("Reconnect to this game first.");
      const needPlayerRoom = () => {
        const r = needRoom();
        if (
          socket.data.spectator === true ||
          session.room !== r.code ||
          !r.players.some((player) => player.id === session.id)
        )
          fail("Spectators can only watch this game.");
        return r;
      };
      const needHost = () => {
        const r = needPlayerRoom();
        if (r.host !== session.id) fail("Only the room host can do that.");
        return r;
      };
      if (command.type === "spectate") {
        if (!limit("room-lookup:" + clientIp, 60, 15 * 60000))
          fail("Too many room lookups. Try again in 15 minutes.");
        const code = z.string().regex(ROOM_CODE_PATTERN).parse(command.code);
        const r = rooms.get(code) || fail("Room not found. Check your code.");
        if (!r.game || r.game.phase === "finished")
          fail("That game is not currently in progress.");
        const previousRoom = room;
        const seated =
          session.room === r.code &&
          r.players.some((player) => player.id === session.id);
        const unattended = seated && !hasHumanViewer(r);
        socket.data.room = r.code;
        socket.data.spectator = !seated;
        if (previousRoom && previousRoom.code !== r.code)
          attendanceChanged(previousRoom);
        if (unattended && !r.paused) resetDeadline(r.game);
        attendanceChanged(r);
        return ack({ ok: true, spectator: !seated });
      }
      if (command.type === "create" || command.type === "join") {
        if (
          command.type === "create" &&
          savedRoom &&
          canResumeRoom(savedRoom.game)
        )
          fail("Leave your current room before joining another.");
        if (!limit("rooms:" + session.id, 10, 3600000))
          fail("Room creation/join limit reached.");
        const requestedColor = command.color === undefined
          ? undefined
          : z.string().refine((color) => COLORS.includes(color)).parse(command.color);
        let name = "";
        let r: Room;
        if (command.type === "create") {
          name = playerName.parse(command.name);
          if (
            !limit(
              "create-auth:" + requestIp(socket.request),
              12,
              15 * 60000,
            )
          )
            fail("Too many password attempts. Try again in 15 minutes.");
          const password = z.string().min(1).max(256).parse(command.password);
          if (
            !timingSafeEqual(
              Buffer.from(hash(password)),
              Buffer.from(accessHash),
            )
          )
            fail("That creator password is not correct.");
          const options = optionsSchema.parse(
            command.options || DEFAULT_OPTIONS,
          );
          const finishedRoomWillClose =
            !!savedRoom &&
            !savedRoom.players.some(
              (player) => !player.bot && player.id !== session.id,
            );
          if (rooms.size - (finishedRoomWillClose ? 1 : 0) >= MAX_ROOMS)
            fail("All eight tables are occupied. Close an unused table first.");
          releaseFinishedRoom(session, savedRoom);
          let code = "";
          do {
            code = randomBytes(8).toString("hex").toUpperCase();
          } while (rooms.has(code));
          r = {
            code,
            host: session.id,
            mapSeed: randomBytes(4).readUInt32BE(),
            options,
            players: [],
            game: null,
            chat: [],
            updated: Date.now(),
          };
          rooms.set(code, r);
        } else {
          name = playerName.parse(command.name);
          if (!limit("room-lookup:" + clientIp, 60, 15 * 60000))
            fail("Too many room lookups. Try again in 15 minutes.");
          const code = z
            .string()
            .regex(ROOM_CODE_PATTERN)
            .parse(command.code);
          r = rooms.get(code) || fail("Room not found. Check your code.");
          if (r.game) {
            if (r.game.phase === "finished")
              fail("That game has already finished.");
            const seatedPlayer =
              session.room === r.code
                ? r.players.find((player) => player.id === session.id)
                : undefined;
            const seated = !!seatedPlayer;
            if (
              seatedPlayer &&
              playerNameKey(seatedPlayer.name) !== playerNameKey(name)
            )
              fail("Enter the name used for your saved seat.");
            const unattended = seated && !hasHumanViewer(r);
            socket.data.room = r.code;
            socket.data.spectator = !seated;
            if (unattended && !r.paused) resetDeadline(r.game);
            attendanceChanged(r);
            return ack({ ok: true, spectator: !seated });
          }
          if (savedRoom && canResumeRoom(savedRoom.game))
            fail("Leave your current room before joining another.");
          if (r.players.length >= r.options.seats) fail("This room is full.");
          ensurePlayerNameAvailable(r, name);
          releaseFinishedRoom(session, savedRoom);
        }
        const player = makePlayer(session.id, name, r.players.length);
        player.color = unusedColor(r, requestedColor);
        r.players.push(player);
        session.room = r.code;
        socket.data.room = r.code;
        socket.data.spectator = false;
        changed(r);
        return ack({ ok: true });
      }
      if (command.type === "home") {
        const viewed = socket.data.room
          ? rooms.get(String(socket.data.room))
          : undefined;
        sendHome(socket);
        if (viewed) attendanceChanged(viewed);
        return ack({ ok: true });
      }
      if (command.type === "resume") {
        if (!limit("room-lookup:" + clientIp, 60, 15 * 60000))
          fail("Too many room lookups. Try again in 15 minutes.");
        const code = z.string().regex(ROOM_CODE_PATTERN).parse(command.code);
        const r =
          savedRoom &&
          canResumeRoom(savedRoom.game) &&
          savedRoom.code === code &&
          savedRoom.players.some((p) => p.id === session.id)
            ? savedRoom
            : fail("That saved game is no longer available.");
        const unattended = !!r.game && !hasHumanViewer(r);
        socket.data.room = r.code;
        socket.data.spectator = false;
        if (r.game && unattended && !r.paused) resetDeadline(r.game);
        attendanceChanged(r);
        return ack({ ok: true });
      }
      if (command.type === "sync") {
        if (
          room &&
          socket.data.room === room.code &&
          (socket.data.spectator === true ||
            (session.room === room.code &&
              room.players.some((player) => player.id === session.id)))
        )
          broadcast(room);
        else sendHome(socket);
        return ack({ ok: true });
      }
      if (command.type === "nameSheep") {
        if (!limit("sheep:" + session.id, 10, 3600000))
          fail("Sheep naming limit reached. Try again later.");
        const matchId = z
          .string()
          .regex(/^[a-f0-9]{24}$/)
          .parse(command.matchId);
        const sheepName = z.string().max(80).parse(command.name);
        nameWinnerSheep(
          community,
          session.id,
          matchId,
          sheepName,
          Date.now(),
        );
        save();
        broadcastCommunity();
        return ack({ ok: true });
      }
      if (command.type === "leave") {
        const r = needPlayerRoom();
        if (r.game && r.game.phase !== "finished")
          fail(
            "Finish the game or ask the host to close the table. You can close your tab and reconnect.",
          );
        r.players = r.players.filter((p) => p.id !== session.id);
        delete session.room;
        if (!r.players.some((p) => !p.bot)) rooms.delete(r.code);
        else {
          if (r.host === session.id) r.host = r.players.find((p) => !p.bot)!.id;
          broadcast(r);
        }
        save();
        sendSessionHome(session.id);
        return ack({ ok: true });
      }
      if (command.type === "close") {
        const r = needHost();
        closeRoom(r);
        return ack({ ok: true });
      }
      if (command.type === "options") {
        const r = needHost();
        if (r.game) fail("Options are locked during a game.");
        const options = optionsSchema.parse(command.options);
        if (options.seats < r.players.length)
          fail("Remove extra players before reducing the seats.");
        makeBoard(options.seats, r.mapSeed, mapGenerationRules(options));
        r.options = options;
        r.players
          .filter((p) => p.bot)
          .forEach((p) => (p.difficulty = options.difficulty));
        changed(r);
        return ack({ ok: true });
      }
      if (command.type === "mapSeed") {
        const r = needHost();
        if (r.game) fail("The map is locked during a game.");
        const direction = z
          .enum(["previous", "next", "shuffle"])
          .parse(command.direction);
        const step = direction === "previous" ? -1 : 1;
        let candidate = r.mapSeed;
        for (let attempt = 0; attempt < 256; attempt++) {
          candidate =
            direction === "shuffle"
              ? randomBytes(4).readUInt32BE()
              : (candidate + step) >>> 0;
          if (candidate === r.mapSeed) continue;
          try {
            makeBoard(
              r.options.seats,
              candidate,
              mapGenerationRules(r.options),
            );
            r.mapSeed = candidate;
            changed(r);
            return ack({ ok: true });
          } catch {
            // Continue cycling until a valid balanced layout is found.
          }
        }
        fail("Could not prepare another map. Try again.");
      }
      if (command.type === "color") {
        const r = needPlayerRoom();
        if (r.game) fail("Colors are locked once the game starts.");
        const color = z
          .string()
          .refine((candidate) => COLORS.includes(candidate))
          .parse(command.color);
        const player = r.players.find((candidate) => candidate.id === session.id) ||
          fail("Your seat is no longer in this room.");
        if (
          r.players.some(
            (candidate) => candidate.id !== session.id && candidate.color === color,
          )
        )
          fail("That color is already taken.");
        player.color = color;
        changed(r);
        return ack({ ok: true });
      }
      if (command.type === "bot") {
        const r = needHost();
        if (r.game)
          fail("Use takeover for disconnected players during a game.");
        if (r.players.length >= r.options.seats) fail("All seats are full.");
        const p = makePlayer(
          "bot-" + randomBytes(8).toString("hex"),
          randomBotName(r),
          r.players.length,
          true,
          r.options.difficulty,
        );
        p.color = unusedColor(r);
        r.players.push(p);
        changed(r);
        return ack({ ok: true });
      }
      if (command.type === "remove") {
        const r = needHost();
        const id = z.string().max(48).parse(command.id);
        if (id === r.host) fail("The host cannot be removed.");
        const seatedPlayer = r.players.find((player) => player.id === id) ||
          fail("Player not found.");
        const gamePlayer = r.game
          ? r.game.players.find((player) => player.id === id) ||
            fail("Player not found.")
          : null;
        if (gamePlayer?.bot)
          fail("That seat is already controlled by a bot.");
        let removedSession = false;
        for (const s of sessions.values())
          if (s.id === id && s.room === r.code) {
            delete s.room;
            removedSession = true;
          }
        if (r.game && gamePlayer) {
          const removedName = gamePlayer.name;
          const botName = randomBotName(r);
          for (const player of [seatedPlayer, gamePlayer]) {
            player.name = botName;
            player.bot = true;
            player.connected = false;
            player.difficulty = r.options.difficulty;
            delete player.automated;
          }
          delete r.disconnectedSince?.[id];
          if (r.automaticTakeovers) {
            r.automaticTakeovers = r.automaticTakeovers.filter(
              (playerId) => playerId !== id,
            );
            if (!r.automaticTakeovers.length) delete r.automaticTakeovers;
          }
          if (
            r.game.options.paired &&
            r.game.players.length > 4 &&
            !r.game.specialBuildRequests.includes(id)
          )
            r.game.specialBuildRequests.push(id);
          note(
            r.game,
            `${removedName} was removed by the host. ${botName} is now playing that seat.`,
            "system",
          );
        } else {
          r.players = r.players.filter((player) => player.id !== id);
        }
        changed(r);
        if (removedSession) sendSessionHome(id);
        return ack({ ok: true });
      }
      if (command.type === "start") {
        const r = needHost();
        if (r.game) fail("Game already started.");
        if (r.players.length !== r.options.seats)
          fail("Fill the empty seats with friends or bots first.");
        r.players = randomPlayerOrder(r.players, () =>
          randomBytes(4).readUInt32BE() / 0x100000000,
        );
        r.game = createGame(
          r.players,
          r.options,
          r.mapSeed,
          secureRandom,
        );
        r.matchId = randomBytes(12).toString("hex");
        r.recordedMatchId = undefined;
        r.startingHumanPlayers = r.players.filter((player) => !player.bot).length;
        r.leaderboardEligible = r.startingHumanPlayers >= 3;
        delete r.disconnectedSince;
        delete r.automaticTakeovers;
        changed(r);
        return ack({ ok: true });
      }
      if (command.type === "pause") {
        const r = needHost();
        if (!r.game) fail("No game to pause.");
        const pausing = !r.paused;
        setRoomPaused(r, pausing);
        const hostPlayer = r.game.players.find((player) => player.id === r.host);
        note(
          r.game,
          `${hostPlayer?.name || "The host"} ${pausing ? "paused" : "resumed"} the game.`,
          "system",
        );
        changed(r);
        return ack({ ok: true });
      }
      if (command.type === "takeover") {
        const r = needHost();
        const id = z.string().max(48).parse(command.id);
        const p = r.game?.players.find((p) => p.id === id);
        if (!p || p.bot) fail("Player not found.");
        if (p.connected && id !== session.id)
          fail("Only disconnected players can be assisted.");
        p.automated = !p.automated;
        delete r.disconnectedSince?.[id];
        if (r.automaticTakeovers) {
          r.automaticTakeovers = r.automaticTakeovers.filter(
            (playerId) => playerId !== id,
          );
          if (!r.automaticTakeovers.length) delete r.automaticTakeovers;
        }
        changed(r);
        return ack({ ok: true });
      }
      if (command.type === "chat") {
        const r = needPlayerRoom();
        if (!limit("chat:" + session.id, 15)) fail("Chat rate limit reached.");
        const text = chatMessage.parse(command.text);
        r.chat.push({
          id: (r.chat.at(-1)?.id || 0) + 1,
          name: r.players.find((p) => p.id === session.id)!.name,
          text,
        });
        if (r.chat.length > 60) r.chat.shift();
        changed(r);
        return ack({ ok: true });
      }
      if (command.type === "specialBuild") {
        const r = needPlayerRoom();
        if (!r.game) fail("Start a game first.");
        if (r.paused) fail("The host has paused this table.");
        const version = z.number().int().parse(command.version);
        if (version !== r.game.version)
          return ack({ ok: false, reason: "stale", version: r.game.version });
        r.game = toggleSpecialBuildRequest(r.game, session.id);
        changed(r);
        return ack({ ok: true });
      }
      if (command.type === "discardSelection") {
        const r = needPlayerRoom();
        const g = r.game || fail("Start a game first.");
        const turn = z.number().int().min(0).parse(command.turn);
        if (turn !== g.turn || g.phase !== "discard" || !g.discards[session.id])
          return ack({ ok: false, reason: "stale", version: g.version });
        const cards = hand.parse(command.cards) as Hand;
        const player = g.players.find((candidate) => candidate.id === session.id)!;
        if (total(cards) > g.discards[session.id] || !canPay(player, cards))
          fail("Choose only cards available in your hand.");
        r.discardSelections ??= {};
        if (total(cards)) r.discardSelections[session.id] = cards;
        else delete r.discardSelections[session.id];
        return ack({ ok: true });
      }
      if (command.type === "action") {
        const r = needPlayerRoom();
        if (!r.game) fail("Start a game first.");
        if (r.paused) fail("The host has paused this table.");
        const version = z.number().int().parse(command.version);
        const action = actionSchema.parse(command.action) as Action;
        const respondingToCurrentOffer =
          (action.type === "accept" || action.type === "reject") &&
          r.game.offer?.id === action.offerId;
        if (version !== r.game.version && !respondingToCurrentOffer)
          return ack({ ok: false, reason: "stale", version: r.game.version });
        r.game = applyAction(r.game, session.id, action, secureRandom);
        changed(r);
        return ack({ ok: true });
      }
      fail("Unknown command.");
    } catch (e) {
      ack({
        ok: false,
        error:
          e instanceof z.ZodError
            ? "Please check the submitted values."
            : e instanceof Error
              ? e.message
              : "Action failed.",
      });
    }
  });
  socket.on("disconnect", () => {
    const viewedRoom = socket.data.room
      ? rooms.get(String(socket.data.room))
      : undefined;
    const set = connections.get(session.id);
    set?.delete(socket.id);
    if (!set?.size) connections.delete(session.id);
    const remaining = (connectionsByIp.get(clientIp) || 1) - 1;
    if (remaining > 0) connectionsByIp.set(clientIp, remaining);
    else connectionsByIp.delete(clientIp);
    if (viewedRoom) attendanceChanged(viewedRoom);
  });
});
const timerWindow = (g: Game) =>
  `${g.turn}:${g.current}:${g.setupStep}:${g.phase}:${g.deadline ?? "none"}`;
const tick = setInterval(
  () => {
    for (const room of rooms.values()) {
      const g = room.game;
      if (g?.phase === "finished") {
        closeCompletedRoom(room);
        continue;
      }
      if (
        !g ||
        room.paused ||
        !room.players.some((p) => !p.bot && isViewingRoom(room.code, p.id))
      )
        continue;
      try {
        if (g.deadline && Date.now() > g.deadline) {
          if (g.phase === "main" && g.offer) {
            room.game = expirePlayerTrade(g);
            changed(room);
            continue;
          }
          if (g.phase === "discard") {
            for (const p of g.players) {
              if (g.discards[p.id]) {
                const a = p.bot || p.automated
                  ? chooseBotAction(g, p)
                  : chooseTimeoutAction(
                      g,
                      p,
                      room.discardSelections?.[p.id],
                      secureRandom,
                    );
                if (a) {
                  room.game = applyAction(g, p.id, a, secureRandom);
                  changed(room);
                  break;
                }
              }
            }
            continue;
          }
          autoTurns.set(room.code, timerWindow(g));
        }
        for (const p of g.players) {
          const auto =
            autoTurns.get(room.code) === timerWindow(g) &&
            g.players[g.current].id === p.id;
          if (!p.bot && !p.automated && !auto) continue;
          const a = auto && !p.bot && !p.automated
            ? chooseTimeoutAction(g, p, undefined, secureRandom)
            : chooseBotAction(g, p);
          if (a) {
            room.game = applyAction(g, p.id, a, secureRandom);
            changed(room);
            break;
          }
        }
      } catch (e) {
        setRoomPaused(room, true);
        room.updated = Date.now();
        save();
        console.error(
          "Room paused after engine error",
          room.code,
          e instanceof Error ? e.message : e,
        );
        broadcast(room);
      }
    }
  },
  Number(process.env.BOT_INTERVAL_MS || 850),
);
const cleanup = setInterval(() => {
  const now = Date.now();
  const homeSessions = new Set<string>();
  const closedRooms = new Set<string>();
  let stateChanged = false;
  for (const [code, room] of rooms) {
    const attendanceChanged = refreshRoomAttendance(room, now);
    const takeoverChanged = refreshDisconnectedTakeovers(room, now);
    if (attendanceChanged || takeoverChanged) {
      room.updated = now;
      stateChanged = true;
      broadcast(room);
    }
    const shouldClose = unattendedGameExpired(
      room.unattendedSince,
      now,
      EMPTY_GAME_GRACE_MS,
    );
    const isStale = now - room.updated > ROOM_TTL && !hasHumanViewer(room);
    if (!shouldClose && !isStale) continue;
    for (const session of sessions.values())
      if (session.room === code) {
        delete session.room;
        homeSessions.add(session.id);
      }
    rooms.delete(code);
    autoTurns.delete(code);
    closedRooms.add(code);
    stateChanged = true;
  }
  for (const [key, s] of sessions)
    if (s.expires < now) {
      sessions.delete(key);
      stateChanged = true;
    }
  for (const [key, b] of buckets) if (b.until < now) buckets.delete(key);
  if (stateChanged) save();
  homeSessions.forEach(sendSessionHome);
  for (const socket of io.sockets.sockets.values())
    if (closedRooms.has(String(socket.data.room))) sendHome(socket);
}, CLEANUP_INTERVAL_MS);
server.listen(port, host, () =>
  console.log(
    `${appName} server ready: http://${host}:${port} · creation password file: ${accessFile}`,
  ),
);
function shutdown() {
  clearInterval(tick);
  clearInterval(cleanup);
  save();
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
