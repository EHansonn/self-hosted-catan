import type { Dev } from "../shared/game";

export type ResourceChoiceDevelopmentCard = "plenty" | "monopoly";

export function isResourceChoiceDevelopmentCard(
  type: Dev,
): type is ResourceChoiceDevelopmentCard {
  return type === "plenty" || type === "monopoly";
}

export function developmentResourceChoiceCount(type: Dev): 0 | 1 | 2 {
  if (type === "monopoly") return 1;
  if (type === "plenty") return 2;
  return 0;
}

export const DEVELOPMENT_CARD_ORDER: readonly Dev[] = [
  "knight",
  "roadBuilding",
  "plenty",
  "monopoly",
  "victory",
];

export function developmentCardCounts(
  cards: readonly { type: Dev }[],
): { type: Dev; count: number }[] {
  const counts = new Map<Dev, number>();
  for (const card of cards)
    counts.set(card.type, (counts.get(card.type) || 0) + 1);
  return DEVELOPMENT_CARD_ORDER.flatMap((type) => {
    const count = counts.get(type) || 0;
    return count ? [{ type, count }] : [];
  });
}
