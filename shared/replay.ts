import type { Board, Phase, PublicGameLogEntry } from "./game";

export const REPLAY_FORMAT = "crossroads-server-replay";
export const REPLAY_VERSION = 1;
export const MAX_REPLAY_FRAMES = 2500;
export const MAX_REPLAY_BYTES = 12 * 1024 * 1024;

export interface ReplayPlayer {
  name: string;
  color: string;
}

export interface ReplayPlayerState {
  points: number;
  cardCount: number;
  devCount: number;
  knights: number;
  roadLength: number;
  bot: boolean;
}

export interface ReplayFrame {
  version: number;
  turn: number;
  phase: Phase;
  current: number;
  secondary: boolean;
  robber: number;
  dice: number[];
  roadOwners: (number | null)[];
  buildings: [number | null, boolean][];
  players: ReplayPlayerState[];
  entries: PublicGameLogEntry[];
  logThrough: number;
}

export interface ReplayPayload {
  matchId: string;
  roomCode: string;
  startedAt: number;
  finishedAt: number | null;
  winner: number | null;
  board: Board;
  players: ReplayPlayer[];
  frames: ReplayFrame[];
}

export interface SignedReplay {
  format: typeof REPLAY_FORMAT;
  version: typeof REPLAY_VERSION;
  payload: ReplayPayload;
  signature: string;
}
