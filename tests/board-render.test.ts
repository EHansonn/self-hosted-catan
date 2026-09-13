import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardPreview } from "../client/Board";
import { makeBoard } from "../shared/game";

test("the 2D robber renders as a top-layer mobile-safe SVG marker", () => {
  const board = makeBoard(4, 42, true);
  const robber = board.tiles.find((tile) => tile.terrain === "desert")!;
  const markup = renderToStaticMarkup(
    createElement(BoardPreview, { board, seed: 42 }),
  );
  const marker = markup.indexOf(`data-robber-tile="${robber.id}"`);
  const lastPortBadge = markup.lastIndexOf('class="port-badge-2d');

  assert.ok(marker >= 0);
  assert.ok(lastPortBadge >= 0);
  assert.ok(markup.includes('class="robber-marker-2d"'));
  assert.ok(markup.includes('aria-label="Robber blocks this hex"'));
  assert.ok(marker > lastPortBadge);
});
