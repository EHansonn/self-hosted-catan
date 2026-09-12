import { total, type Hand, type Resource } from "../shared/game";

export function addCardToSelection(
  selection: Hand,
  resource: Resource,
  resourceLimit: number,
  totalLimit = Number.POSITIVE_INFINITY,
): Hand {
  if (
    selection[resource] >= resourceLimit ||
    total(selection) >= totalLimit
  ) {
    return selection;
  }

  return { ...selection, [resource]: selection[resource] + 1 };
}
