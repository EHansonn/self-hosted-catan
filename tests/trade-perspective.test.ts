import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyHand, makePlayer, type Offer, type PublicPlayer } from "../shared/game";
import { OfferPanel } from "../client/GameUI";
import { tradeHandsForViewer } from "../client/tradePerspective";

const offer: Offer = {
  id: 1,
  from: "owner",
  give: { ...emptyHand(), brick: 2 },
  want: { ...emptyHand(), wheat: 1 },
  approved: [],
  rejected: [],
};

test("trade owner sees offered cards as giving and requested cards as receiving", () => {
  const displayed = tradeHandsForViewer(offer, "owner");

  assert.deepEqual(displayed.give, offer.give);
  assert.deepEqual(displayed.receive, offer.want);
});

test("trade recipient sees offered cards as receiving and requested cards as giving", () => {
  const displayed = tradeHandsForViewer(offer, "recipient");

  assert.deepEqual(displayed.give, offer.want);
  assert.deepEqual(displayed.receive, offer.give);
});

test("trade owner panel renders requested cards above offered cards", () => {
  const players: PublicPlayer[] = [
    { ...makePlayer("owner", "Owner", 0), cardCount: 2, devCount: 0, points: 0 },
    { ...makePlayer("recipient", "Recipient", 1), cardCount: 1, devCount: 0, points: 0 },
  ];
  const html = renderToStaticMarkup(
    createElement(OfferPanel, {
      offer,
      players,
      me: "owner",
      enabled: true,
      act: async () => true,
      onEdit: () => undefined,
    }),
  );
  const receiving = html.indexOf('aria-label="Resources you receive"');
  const giving = html.indexOf('aria-label="Resources you give"');

  assert.ok(receiving >= 0 && giving > receiving);
  assert.match(html.slice(receiving, giving), /aria-label="1 Wheat"/);
  assert.match(html.slice(giving), /aria-label="2 Brick"/);
});
