import type { Hand, Offer } from "../shared/game";

export function tradeHandsForViewer(
  offer: Pick<Offer, "from" | "give" | "want">,
  viewerId: string,
): { give: Hand; receive: Hand } {
  return offer.from === viewerId
    ? { give: offer.give, receive: offer.want }
    : { give: offer.want, receive: offer.give };
}
