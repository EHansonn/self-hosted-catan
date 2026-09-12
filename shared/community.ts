export interface LeaderboardScore {
  key: string;
  name: string;
  wins: number;
  games: number;
  points: number;
  lastPlayed: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  wins: number;
  games: number;
  points: number;
  winRate: number;
}

export interface FlockSheep {
  id: string;
  name: string;
  winner: string;
  wonAt: number;
  namedAt: number;
  players: number;
  score: number;
}

export interface SheepNamingRight {
  matchId: string;
  roomCode: string;
  winnerId: string;
  winner: string;
  wonAt: number;
  players: number;
  score: number;
}

export interface PublicSheepNamingRight {
  matchId: string;
  roomCode: string;
  wonAt: number;
  players: number;
  score: number;
}

export interface CommunityState {
  eligibilityVersion: number;
  totalGames: number;
  scores: LeaderboardScore[];
  flock: FlockSheep[];
  pendingSheep: SheepNamingRight[];
  recordedMatches: string[];
}

export interface CommunityView {
  totalGames: number;
  leaderboard: LeaderboardEntry[];
  flock: FlockSheep[];
  pendingSheep: PublicSheepNamingRight[];
}

export interface OfficialGameResult {
  matchId: string;
  roomCode: string;
  completedAt: number;
  eligible: boolean;
  startingHumanPlayers: number;
  winnerId: string;
  players: {
    id: string;
    name: string;
    points: number;
    bot: boolean;
  }[];
}

const MAX_RECORDED_MATCHES = 10_000;
const CURRENT_ELIGIBILITY_VERSION = 2;

export function emptyCommunity(): CommunityState {
  return {
    eligibilityVersion: CURRENT_ELIGIBILITY_VERSION,
    totalGames: 0,
    scores: [],
    flock: [],
    pendingSheep: [],
    recordedMatches: [],
  };
}

export function hydrateCommunity(value: unknown): CommunityState {
  if (!value || typeof value !== "object") return emptyCommunity();
  const saved = value as Partial<CommunityState>;
  // Earlier records counted bots as starting players and mixed their scores
  // into the leaderboard. Those aggregates cannot be separated reliably, so
  // reset them once when adopting the human-only eligibility rules.
  if (saved.eligibilityVersion !== CURRENT_ELIGIBILITY_VERSION)
    return emptyCommunity();
  return {
    eligibilityVersion: CURRENT_ELIGIBILITY_VERSION,
    totalGames:
      Number.isInteger(saved.totalGames) && (saved.totalGames || 0) >= 0
        ? saved.totalGames!
        : 0,
    scores: Array.isArray(saved.scores) ? saved.scores : [],
    flock: Array.isArray(saved.flock) ? saved.flock : [],
    pendingSheep: Array.isArray(saved.pendingSheep) ? saved.pendingSheep : [],
    recordedMatches: Array.isArray(saved.recordedMatches)
      ? saved.recordedMatches.slice(-MAX_RECORDED_MATCHES)
      : [],
  };
}

const playerKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

export function recordOfficialGame(
  community: CommunityState,
  result: OfficialGameResult,
) {
  if (
    !result.eligible ||
    !result.winnerId ||
    result.players.length < 3 ||
    result.startingHumanPlayers < 3 ||
    community.recordedMatches.includes(result.matchId)
  )
    return false;

  const humanPlayers = result.players.filter((player) => !player.bot);
  const winner = humanPlayers.find((player) => player.id === result.winnerId);

  community.recordedMatches.push(result.matchId);
  if (community.recordedMatches.length > MAX_RECORDED_MATCHES)
    community.recordedMatches.shift();
  community.totalGames++;

  for (const player of humanPlayers) {
    const key = playerKey(player.name);
    let score = community.scores.find((entry) => entry.key === key);
    if (!score) {
      score = {
        key,
        name: player.name,
        wins: 0,
        games: 0,
        points: 0,
        lastPlayed: result.completedAt,
      };
      community.scores.push(score);
    }
    score.name = player.name;
    score.games++;
    score.points += player.points;
    score.lastPlayed = result.completedAt;
    if (player.id === result.winnerId) score.wins++;
  }

  if (winner)
    community.pendingSheep.push({
      matchId: result.matchId,
      roomCode: result.roomCode,
      winnerId: winner.id,
      winner: winner.name,
      wonAt: result.completedAt,
      players: result.startingHumanPlayers,
      score: winner.points,
    });
  return true;
}

export function cleanSheepName(value: string) {
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name || [...name].length > 24)
    throw new Error("Sheep names must be 1–24 characters.");
  if (/\p{C}/u.test(name) || !/[\p{L}\p{N}]/u.test(name))
    throw new Error("Include a letter or number in the sheep's name.");
  return name;
}

export function nameWinnerSheep(
  community: CommunityState,
  playerId: string,
  matchId: string,
  requestedName: string,
  namedAt: number,
) {
  const rightIndex = community.pendingSheep.findIndex(
    (right) => right.matchId === matchId && right.winnerId === playerId,
  );
  if (rightIndex < 0)
    throw new Error("Only this game's winner can name its sheep.");

  const name = cleanSheepName(requestedName);
  if (community.flock.some((sheep) => playerKey(sheep.name) === playerKey(name)))
    throw new Error("That sheep name is already in the flock.");

  const right = community.pendingSheep[rightIndex];
  const sheep: FlockSheep = {
    id: right.matchId,
    name,
    winner: right.winner,
    wonAt: right.wonAt,
    namedAt,
    players: right.players,
    score: right.score,
  };
  community.pendingSheep.splice(rightIndex, 1);
  community.flock.push(sheep);
  return sheep;
}

export function viewCommunity(
  community: CommunityState,
  playerId: string,
): CommunityView {
  const leaderboard = [...community.scores]
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.points - a.points ||
        a.games - b.games ||
        a.name.localeCompare(b.name),
    )
    .map((score, index) => ({
      rank: index + 1,
      name: score.name,
      wins: score.wins,
      games: score.games,
      points: score.points,
      winRate: score.games ? Math.round((score.wins / score.games) * 100) : 0,
    }));
  return {
    totalGames: community.totalGames,
    leaderboard,
    flock: [...community.flock].sort((a, b) => b.wonAt - a.wonAt),
    pendingSheep: community.pendingSheep
      .filter((right) => right.winnerId === playerId)
      .map(({ winnerId: _winnerId, winner: _winner, ...right }) => right),
  };
}
