import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { terrainName } from "../client/Board";
import { GameCard, LogMessage } from "../client/GameUI";
import {
  DEFAULT_RESOURCE_NAMES,
  configureResourceNames,
  formatResourceHand,
  getResourceNames,
  resolveResourceNames,
  resourceName,
} from "../shared/resources";

test("resource names default to existing labels and accept a server override", () => {
  const names = resolveResourceNames({ RESOURCE_NAME_ORE: "Stone" });
  assert.deepEqual(names, { ...DEFAULT_RESOURCE_NAMES, ore: "Stone" });
  configureResourceNames(names);
  try {
    assert.equal(resourceName("ore"), "Stone");
    assert.equal(terrainName("ore"), "Stone");
    assert.equal(formatResourceHand({ wood: 1, ore: 2 }), "1 wood and 2 stone");
    assert.match(renderToStaticMarkup(createElement(GameCard, { resource: "ore" })), /Stone/);
    const log = renderToStaticMarkup(createElement(LogMessage, {
      text: "Mira trades 2 stone with the bank for 1 wood.",
      actor: { name: "Mira", color: "#52c9cf" },
    }));
    assert.match(log, /game-card ore/);
    assert.match(log, /game-card wood/);
    const offer = renderToStaticMarkup(createElement(LogMessage, {
      text: "Mira offers 1 wood for 2 stone.",
      actor: { name: "Mira", color: "#52c9cf" },
    }));
    assert.match(offer, /game-card ore/);
    assert.match(offer, /game-card wood/);
    assert.deepEqual(getResourceNames(), names);
  } finally {
    configureResourceNames(DEFAULT_RESOURCE_NAMES);
  }
});

test("invalid and ambiguous resource names fail instead of breaking log icons", () => {
  assert.throws(() => resolveResourceNames({ RESOURCE_NAME_ORE: "" }), /RESOURCE_NAME_ORE/);
  assert.throws(() => resolveResourceNames({ RESOURCE_NAME_ORE: "Wood" }), /distinct/);
  assert.throws(() => resolveResourceNames({ RESOURCE_NAME_ORE: "Road" }), /RESOURCE_NAME_ORE/);
  assert.throws(() => resolveResourceNames({ RESOURCE_NAME_ORE: "Brick", RESOURCE_NAME_BRICK: "Clay" }), /RESOURCE_NAME_ORE/);
  assert.throws(() => resolveResourceNames({ RESOURCE_NAME_ORE: "Stone!" }), /RESOURCE_NAME_ORE/);
});
