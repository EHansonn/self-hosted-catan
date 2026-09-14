import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { groupGameLog } from "../client/gameLog";
import { LogMessage } from "../client/GameUI";
import type { GameLogEntry } from "../shared/game";

const entry = (
  id: number,
  text: string,
  group?: string,
): GameLogEntry => ({ id, text, kind: "action", group });

test("game log keeps chronological actions together by server turn", () => {
  const groups = groupGameLog([
    entry(1, "The island is ready.", "system"),
    entry(2, "Mira builds a settlement.", "setup-0"),
    entry(3, "Mira builds a road.", "setup-0"),
    entry(4, "Atlas builds a settlement.", "setup-1"),
    entry(5, "Atlas builds a road.", "setup-1"),
  ]);

  assert.deepEqual(groups.map(({ key }) => key), ["system", "setup-0", "setup-1"]);
  assert.deepEqual(groups[1].entries.map(({ id }) => id), [2, 3]);
  assert.deepEqual(groups[2].entries.map(({ id }) => id), [4, 5]);
});

test("legacy saved logs group setup pairs and roll-led turns", () => {
  const groups = groupGameLog([
    entry(1, "Mira builds a settlement."),
    entry(2, "Mira builds a road."),
    entry(3, "Atlas builds a settlement."),
    entry(4, "Atlas builds a road."),
    entry(5, "Mira rolls 8."),
    entry(6, "Atlas gets 1 wheat."),
    entry(7, "Mira builds a road."),
    entry(8, "Atlas rolls 6."),
  ]);

  assert.deepEqual(groups.map(({ entries }) => entries.map(({ id }) => id)), [
    [1, 2],
    [3, 4],
    [5, 6, 7],
    [8],
  ]);
});

test("a zero or negative limit returns no game-log groups", () => {
  const entries = [entry(1, "Mira rolls 8.", "turn-1")];

  assert.deepEqual(groupGameLog(entries, 0), []);
  assert.deepEqual(groupGameLog(entries, -1), []);
});

test("development-card history uses the matching card and effect icons", () => {
  const actor = { name: "Mira", color: "#52c9cf" };
  const monopoly = renderToStaticMarkup(
    createElement(LogMessage, {
      text: "Mira plays Monopoly and takes 4 ore from the other players.",
      actor,
    }),
  );
  assert.match(monopoly, /dev-monopoly/);
  assert.match(monopoly, /game-card ore/);

  const plenty = renderToStaticMarkup(
    createElement(LogMessage, {
      text: "Mira plays Year of Plenty and gets 1 wheat and 1 sheep.",
      actor,
    }),
  );
  assert.match(plenty, /dev-plenty/);
  assert.match(plenty, /game-card wheat/);
  assert.match(plenty, /game-card sheep/);

  const knight = renderToStaticMarkup(
    createElement(LogMessage, {
      text: "Mira plays a Knight.",
      actor,
    }),
  );
  assert.match(knight, /dev-knight/);

  const roadBuilding = renderToStaticMarkup(
    createElement(LogMessage, {
      text: "Mira plays Road Building.",
      actor,
    }),
  );
  assert.match(roadBuilding, /dev-roadBuilding/);
});

test("special build phases name the active player in the log", () => {
  const markup = renderToStaticMarkup(
    createElement(LogMessage, {
      text: "Mira begins a special build phase.",
      actor: { name: "Mira", color: "#52c9cf" },
    }),
  );

  assert.match(markup, /log-player-name/);
  assert.match(markup, /begins a special build phase/);
});

test("discard history renders each revealed resource card", () => {
  const markup = renderToStaticMarkup(
    createElement(LogMessage, {
      text: "Mira discards 2 wood and 1 brick.",
      actor: { name: "Mira", color: "#52c9cf" },
    }),
  );

  assert.match(markup, /game-card wood/);
  assert.match(markup, /game-card brick/);
  assert.match(markup, /card-count[^>]*>2</);
});
