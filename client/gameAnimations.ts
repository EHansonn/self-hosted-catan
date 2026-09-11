import {
  matchesProductionRoll,
  RESOURCES,
  type GameView,
  type Resource,
} from "../shared/game";

export type AnimatedPiece = "road" | "settlement" | "city";

export interface PiecePlacementAnimation {
  kind: AnimatedPiece;
  id: number;
  owner: string;
}

export interface ResourceFlightAnimation {
  resource: Resource;
  tileId?: number;
  sourcePlayerId?: string;
  playerId: string;
  amount: number;
}

export interface RobberMoveAnimation {
  from: number;
  to: number;
}

export interface GameplayAnimationCue {
  id: string;
  roll: number | null;
  rolledTiles: number[];
  resourceFlights: ResourceFlightAnimation[];
  placements: PiecePlacementAnimation[];
  robber: RobberMoveAnimation | null;
}

function rolledResourceFlights(
  previous: GameView,
  next: GameView,
  roll: number,
) {
  const flights: ResourceFlightAnimation[] = [];
  for (const resource of RESOURCES) {
    let remaining = Math.max(0, previous.bank[resource] - next.bank[resource]);
    if (!remaining) continue;
    for (const tile of next.board.tiles) {
      if (
        !remaining ||
        tile.id === next.robber ||
        !matchesProductionRoll(
          tile.number,
          roll,
          next.options.linkedTwoTwelve,
        ) ||
        tile.terrain !== resource
      )
        continue;
      const due = new Map<string, number>();
      for (const vertexId of tile.vertices) {
        const vertex = next.board.vertices[vertexId];
        if (vertex.owner)
          due.set(
            vertex.owner,
            (due.get(vertex.owner) || 0) + (vertex.city ? 2 : 1),
          );
      }
      for (const [playerId, requested] of due) {
        if (!remaining) break;
        const amount = Math.min(requested, remaining);
        flights.push({ resource, tileId: tile.id, playerId, amount });
        remaining -= amount;
      }
    }
  }
  return flights;
}

function monopolyResourceFlights(previous: GameView, next: GameView) {
  const entry = next.log.at(-1);
  if (entry?.kind !== "dev" || !entry.player) return [];
  const match = entry.text.match(
    /\bplays Monopoly and takes \d+ (wood|brick|sheep|wheat|ore)\b/,
  );
  if (!match) return [];
  const resource = match[1] as Resource;

  return previous.players.flatMap((player): ResourceFlightAnimation[] => {
    if (player.id === entry.player) return [];
    const nextPlayer = next.players.find(({ id }) => id === player.id);
    const amount = Math.max(
      0,
      player.cardCount - (nextPlayer?.cardCount ?? player.cardCount),
    );
    return amount
      ? [{
          resource,
          sourcePlayerId: player.id,
          playerId: entry.player!,
          amount,
        }]
      : [];
  });
}

export function deriveGameplayAnimation(
  previous: GameView | null,
  next: GameView | null,
): GameplayAnimationCue | null {
  if (!previous || !next || next.version !== previous.version + 1)
    return null;

  const placements: PiecePlacementAnimation[] = [];
  for (const edge of next.board.edges) {
    const before = previous.board.edges[edge.id];
    if (!before?.owner && edge.owner)
      placements.push({ kind: "road", id: edge.id, owner: edge.owner });
  }
  for (const vertex of next.board.vertices) {
    const before = previous.board.vertices[vertex.id];
    if (!before?.owner && vertex.owner)
      placements.push({
        kind: vertex.city ? "city" : "settlement",
        id: vertex.id,
        owner: vertex.owner,
      });
    else if (
      before?.owner &&
      before.owner === vertex.owner &&
      !before.city &&
      vertex.city
    )
      placements.push({ kind: "city", id: vertex.id, owner: before.owner });
  }

  const rolled =
    previous.phase === "roll" &&
    previous.dice.length === 0 &&
    next.dice.length === 2;
  const roll = rolled ? next.dice[0] + next.dice[1] : null;
  const rolledTiles =
    roll && roll !== 7
      ? next.board.tiles
          .filter(
            (tile) =>
              matchesProductionRoll(
                tile.number,
                roll,
                next.options.linkedTwoTwelve,
              ) &&
              tile.terrain !== "desert" &&
              tile.id !== next.robber,
          )
          .map((tile) => tile.id)
      : [];
  const productionFlights =
    roll && roll !== 7
      ? rolledResourceFlights(previous, next, roll)
      : [];
  const monopolyFlights = monopolyResourceFlights(previous, next);
  const resourceFlights = [...productionFlights, ...monopolyFlights];
  const robber =
    previous.robber !== next.robber
      ? { from: previous.robber, to: next.robber }
      : null;

  if (!rolled && !resourceFlights.length && !placements.length && !robber)
    return null;
  return {
    id: `${next.version}:${next.log.at(-1)?.id || 0}`,
    roll,
    rolledTiles,
    resourceFlights,
    placements,
    robber,
  };
}
