import type { Board, PublicPlayer } from "../shared/game";
import type { BoardProps } from "./Board";

export function threeBoardStaticKey(board: Board) {
  return JSON.stringify([
    board.tiles.map(({ id, x, y, terrain, number, vertices }) => [
      id,
      x,
      y,
      terrain,
      number,
      vertices,
    ]),
    board.vertices.map(({ id, x, y }) => [id, x, y]),
    board.edges.map(({ id, a, b }) => [id, a, b]),
    board.ports.map(({ edge, resource }) => [edge, resource]),
  ]);
}

function playerColors(players: PublicPlayer[]) {
  return players.map(({ id, color }) => [id, color]);
}

export function threeBoardVisualKey(
  props: Pick<
    BoardProps,
    | "board"
    | "players"
    | "robber"
    | "kind"
    | "highlights"
    | "selected"
    | "buildOptions"
    | "animation"
  >,
) {
  return JSON.stringify([
    threeBoardStaticKey(props.board),
    props.board.edges.map(({ id, owner }) => [id, owner]),
    props.board.vertices.map(({ id, owner, city }) => [id, owner, city]),
    playerColors(props.players),
    props.robber,
    props.kind,
    props.highlights,
    props.selected ?? null,
    props.buildOptions
      ? [
          props.buildOptions.road,
          props.buildOptions.settlement,
          props.buildOptions.city,
        ]
      : null,
    props.animation?.id ?? null,
  ]);
}
