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
  "bank" | "deckCount" | "legal" | "turn"
>;

type TurnActionPlayer = Pick<
  PublicPlayer,
  "dev" | "playedDev" | "resources"
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

  if (player.playedDev) return false;
  return (player.dev || []).some((card) => {
    if (card.bought >= game.turn || card.type === "victory") return false;
    if (card.type === "roadBuilding") return game.legal.roads.length > 0;
    if (card.type === "plenty") return total(game.bank) >= 2;
    if (card.type === "knight") return game.legal.robber.length > 0;
    return card.type === "monopoly";
  });
}
