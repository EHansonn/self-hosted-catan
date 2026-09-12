import {
  COSTS,
  RESOURCES,
  type Hand,
  type Legal,
} from "../shared/game";

export type DiscoverableBuild = "road" | "settlement" | "city";

export function affordableBuildOptions(
  hand: Hand,
  legal: Pick<Legal, "roads" | "settlements" | "cities">,
): Record<DiscoverableBuild, number[]> {
  const canAfford = (type: DiscoverableBuild) =>
    RESOURCES.every((resource) =>
      hand[resource] >= (COSTS[type][resource] || 0),
    );
  return {
    road: canAfford("road") ? legal.roads : [],
    settlement: canAfford("settlement") ? legal.settlements : [],
    city: canAfford("city") ? legal.cities : [],
  };
}
