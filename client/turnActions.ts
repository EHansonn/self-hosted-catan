import {
  COSTS,
  RESOURCES,
  total,
  type GameView,
  type Hand,
  type PublicPlayer,
} from "../shared/game";

type TurnActionGame = Pick<
  GameView,
  "bank" | "deckCount" | "legal" | "players" | "secondary" | "turn"
>;

type TurnActionPlayer = Pick<
  PublicPlayer,
  "dev" | "id" | "playedDev" | "resources"
>;

export function hasRemainingTurnAction(
  game: TurnActionGame,
  player: TurnActionPlayer,
) {
  const hand = player.resources;
  if (!hand) return false;
  const canAfford = (cost: Partial<Hand>) =>
    RESOURCES.every((resource) => hand[resource] >= (cost[resource] || 0));

  if (
    (game.legal.roads.length && canAfford(COSTS.road)) ||
    (game.legal.settlements.length && canAfford(COSTS.settlement)) ||
    (game.legal.cities.length && canAfford(COSTS.city)) ||
    (game.deckCount && canAfford(COSTS.development))
  )
    return true;

  if (
    RESOURCES.some(
      (give) =>
        game.legal.ratios[give] > 0 &&
        hand[give] >= game.legal.ratios[give] &&
        RESOURCES.some((want) => want !== give && game.bank[want] > 0),
    )
  )
    return true;

  if (
    !game.secondary &&
    total(hand) > 0 &&
    game.players.some((candidate) => candidate.id !== player.id)
  )
    return true;

  if (player.playedDev) return false;
  return (player.dev || []).some((card) => {
    if (card.bought >= game.turn || card.type === "victory") return false;
    if (card.type === "roadBuilding") return game.legal.roads.length > 0;
    if (card.type === "plenty") return total(game.bank) >= 2;
    if (card.type === "knight") return game.legal.robber.length > 0;
    return card.type === "monopoly";
  });
}
