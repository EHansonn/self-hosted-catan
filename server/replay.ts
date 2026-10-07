import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { publicPlayer, type Game } from "../shared/game";
import { ROOM_CODE_PATTERN } from "../shared/room-code";
import {
  MAX_REPLAY_BYTES,
  MAX_REPLAY_FRAMES,
  REPLAY_FORMAT,
  REPLAY_VERSION,
  type ReplayFrame,
  type ReplayPayload,
  type SignedReplay,
} from "../shared/replay";

const number = z.number().finite();
const index = z.number().int().nonnegative();
const owner = index.nullable();
const tileSchema = z.object({
  id: index, x: number, y: number,
  terrain: z.enum(["wood", "brick", "sheep", "wheat", "ore", "desert"]),
  number: index, vertices: z.array(index),
});
const vertexSchema = z.object({
  id: index, x: number, y: number, tiles: z.array(index), edges: z.array(index),
  owner: z.null(), city: z.literal(false),
});
const edgeSchema = z.object({
  id: index, a: index, b: index, tiles: z.array(index), owner: z.null(),
});
const boardSchema = z.object({
  tiles: z.array(tileSchema).min(1).max(100),
  vertices: z.array(vertexSchema).min(1).max(200),
  edges: z.array(edgeSchema).min(1).max(300),
  ports: z.array(z.object({
    edge: index,
    resource: z.enum(["wood", "brick", "sheep", "wheat", "ore", "any"]),
  })).max(30),
});
const frameSchema = z.object({
  version: index,
  turn: index,
  phase: z.enum(["setupSettlement", "setupRoad", "roll", "main", "discard", "robber", "steal", "freeRoad", "finished"]),
  current: index,
  secondary: z.boolean(),
  robber: index,
  dice: z.array(index).max(2),
  roadOwners: z.array(owner).max(300),
  buildings: z.array(z.tuple([owner, z.boolean()])).max(200),
  players: z.array(z.object({
    points: index, cardCount: index, devCount: index,
    knights: index, roadLength: index, bot: z.boolean(),
  })).min(2).max(12),
  entries: z.array(z.object({
    id: index, text: z.string().max(2000), kind: z.string().max(30),
    group: z.string().max(80).optional(), player: z.string().max(8).optional(),
  })).max(80),
  logThrough: index,
});
const replaySchema = z.object({
  matchId: z.string().regex(/^[a-f0-9]{24}$/),
  roomCode: z.string().regex(ROOM_CODE_PATTERN),
  startedAt: index,
  finishedAt: index,
  winner: index,
  board: boardSchema,
  players: z.array(z.object({
    name: z.string().min(1).max(40), color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  })).min(2).max(12),
  frames: z.array(frameSchema).min(2).max(MAX_REPLAY_FRAMES),
}).superRefine((replay, context) => {
  const playerCount = replay.players.length;
  if (replay.winner >= playerCount || replay.frames[0]?.version !== 0 ||
      replay.frames.at(-1)?.phase !== "finished")
    context.addIssue({ code: "custom", message: "Incomplete replay." });
  for (const frame of replay.frames) {
    if (frame.current >= playerCount || frame.robber >= replay.board.tiles.length ||
        frame.roadOwners.length !== replay.board.edges.length ||
        frame.buildings.length !== replay.board.vertices.length ||
        frame.players.length !== playerCount ||
        frame.roadOwners.some((value) => value !== null && value >= playerCount) ||
        frame.buildings.some(([value]) => value !== null && value >= playerCount)) {
      context.addIssue({ code: "custom", message: "Invalid frame dimensions." });
      break;
    }
  }
});

export function startReplay(game: Game, matchId: string, roomCode: string): ReplayPayload {
  return {
    matchId,
    roomCode,
    startedAt: game.startedAt,
    finishedAt: null,
    winner: null,
    board: {
      tiles: structuredClone(game.board.tiles),
      vertices: game.board.vertices.map((vertex) => ({ ...vertex, owner: null, city: false })),
      edges: game.board.edges.map((edge) => ({ ...edge, owner: null })),
      ports: structuredClone(game.board.ports),
    },
    players: game.players.map(({ name, color }) => ({ name, color })),
    frames: [],
  };
}

export function appendReplayFrame(replay: ReplayPayload, game: Game): boolean {
  const previous = replay.frames.at(-1);
  const logThrough = game.log.at(-1)?.id || 0;
  if (previous?.version === game.version && previous.logThrough === logThrough) return true;
  if (replay.frames.length >= MAX_REPLAY_FRAMES) return false;
  const playerIndex = new Map(game.players.map((player, i) => [player.id, i]));
  const frame: ReplayFrame = {
    version: game.version,
    turn: game.turn,
    phase: game.phase,
    current: game.current,
    secondary: game.secondary,
    robber: game.robber,
    dice: [...game.dice],
    roadOwners: game.board.edges.map((edge) => edge.owner === null ? null : playerIndex.get(edge.owner) ?? null),
    buildings: game.board.vertices.map((vertex) => [
      vertex.owner === null ? null : playerIndex.get(vertex.owner) ?? null,
      vertex.city,
    ]),
    players: game.players.map((player) => {
      const visible = publicPlayer(game, player, "");
      return {
        points: visible.points, cardCount: visible.cardCount,
        devCount: visible.devCount, knights: player.knights,
        roadLength: player.roadLength, bot: player.bot,
      };
    }),
    entries: game.log.filter((entry) => entry.id > (previous?.logThrough || 0))
      .map((entry) => ({
        id: entry.id, text: entry.text, kind: entry.kind,
        ...(entry.group ? { group: entry.group } : {}),
        ...(entry.player && playerIndex.has(entry.player)
          ? { player: `p${playerIndex.get(entry.player)}` } : {}),
      })),
    logThrough,
  };
  replay.frames.push(frame);
  if (frame.entries.length > 80 ||
      ((replay.frames.length % 25 === 0 || game.phase === "finished") &&
        Buffer.byteLength(JSON.stringify(replay)) > MAX_REPLAY_BYTES))
    return false;
  if (game.phase === "finished") {
    replay.finishedAt = game.finishedAt ?? Date.now();
    replay.winner = game.winner ? playerIndex.get(game.winner) ?? null : null;
  }
  return true;
}

function signatureFor(payload: ReplayPayload, key: Buffer): Buffer {
  return createHmac("sha256", key)
    .update(`${REPLAY_FORMAT}\n${REPLAY_VERSION}\n`)
    .update(JSON.stringify(payload))
    .digest();
}

export function signReplay(payload: ReplayPayload, key: Buffer): SignedReplay | null {
  if (payload.finishedAt === null || payload.winner === null ||
      Buffer.byteLength(JSON.stringify(payload)) > MAX_REPLAY_BYTES ||
      !replaySchema.safeParse(payload).success) return null;
  return {
    format: REPLAY_FORMAT,
    version: REPLAY_VERSION,
    payload,
    signature: signatureFor(payload, key).toString("base64url"),
  };
}

export function verifyReplay(input: unknown, key: Buffer): SignedReplay | null {
  if (!input || typeof input !== "object") return null;
  if (Object.keys(input).sort().join(",") !== "format,payload,signature,version") return null;
  const candidate = input as Partial<SignedReplay>;
  if (candidate.format !== REPLAY_FORMAT || candidate.version !== REPLAY_VERSION ||
      typeof candidate.signature !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(candidate.signature) ||
      !candidate.payload || typeof candidate.payload !== "object") return null;
  try {
    const serialized = JSON.stringify(candidate.payload);
    if (Buffer.byteLength(serialized) > MAX_REPLAY_BYTES) return null;
    const actual = Buffer.from(candidate.signature, "base64url");
    if (actual.length !== 32 || !timingSafeEqual(actual, signatureFor(candidate.payload, key)))
      return null;
    if (!replaySchema.safeParse(candidate.payload).success) return null;
    return candidate as SignedReplay;
  } catch {
    return null;
  }
}
