import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_PAN_THRESHOLD,
  DEFAULT_BOARD_ZOOM,
  MAX_BOARD_ZOOM,
  MIN_BOARD_ZOOM,
  boardPanPosition,
  boardPinchZoom,
  boardWheelZoom,
  boardZoomAnchor,
  normalizeBoardZoom,
  type BoardPanOrigin,
} from "../client/boardPan";

const origin = (changes: Partial<BoardPanOrigin> = {}): BoardPanOrigin => ({
  pointerId: 1,
  x: 100,
  y: 100,
  scrollLeft: 320,
  scrollTop: 180,
  moved: false,
  ...changes,
});

test("board pan ignores normal click-sized pointer movement", () => {
  const next = boardPanPosition(
    origin(),
    100 + BOARD_PAN_THRESHOLD - 1,
    100,
  );
  assert.deepEqual(next, {
    moved: false,
    scrollLeft: 320,
    scrollTop: 180,
  });
});

test("board pan converts mouse dragging into two-axis viewport movement", () => {
  const next = boardPanPosition(origin(), 75, 140);
  assert.deepEqual(next, {
    moved: true,
    scrollLeft: 345,
    scrollTop: 140,
  });
});

test("an established pan remains active for small follow-up movement", () => {
  const next = boardPanPosition(origin({ moved: true }), 101, 102);
  assert.equal(next.moved, true);
  assert.equal(next.scrollLeft, 319);
  assert.equal(next.scrollTop, 178);
});

test("2D zoom has a true fit range and recenters at fit-size levels", () => {
  assert.equal(DEFAULT_BOARD_ZOOM, 0.8);
  assert.ok(DEFAULT_BOARD_ZOOM > MIN_BOARD_ZOOM);
  assert.ok(DEFAULT_BOARD_ZOOM < 1);
  assert.equal(normalizeBoardZoom(0.1), MIN_BOARD_ZOOM);
  assert.equal(normalizeBoardZoom(4), MAX_BOARD_ZOOM);
  assert.deepEqual(
    boardZoomAnchor(
      {
        scrollLeft: 300,
        scrollTop: 200,
        clientWidth: 1_000,
        clientHeight: 700,
        scrollWidth: 2_000,
        scrollHeight: 1_400,
      },
      0.8,
    ),
    { x: 0.5, y: 0.5, viewportX: 500, viewportY: 350 },
  );
});

test("wheel direction zooms smoothly within bounds", () => {
  const zoomedIn = boardWheelZoom(1, -100);
  const zoomedOut = boardWheelZoom(1, 100);
  assert.ok(zoomedIn > 1);
  assert.ok(zoomedOut < 1);
  assert.equal(boardWheelZoom(MAX_BOARD_ZOOM, -100), MAX_BOARD_ZOOM);
  assert.equal(boardWheelZoom(MIN_BOARD_ZOOM, 100), MIN_BOARD_ZOOM);
  assert.equal(boardWheelZoom(1, 0), 1);
});

test("pinch distance zooms proportionally and stays within bounds", () => {
  assert.equal(boardPinchZoom(0.8, 100, 200), 1.6);
  assert.equal(boardPinchZoom(1, 100, 1_000), MAX_BOARD_ZOOM);
  assert.equal(boardPinchZoom(1, 100, 1), MIN_BOARD_ZOOM);
  assert.equal(boardPinchZoom(1.2, 0, 200), 1.2);
});

test("wheel zoom preserves the hovered board point while enlarged", () => {
  assert.deepEqual(
    boardZoomAnchor(
      {
        scrollLeft: 300,
        scrollTop: 200,
        clientWidth: 1_000,
        clientHeight: 700,
        scrollWidth: 2_000,
        scrollHeight: 1_400,
      },
      1.2,
      { x: 250, y: 175 },
    ),
    {
      x: 0.275,
      y: 0.26785714285714285,
      viewportX: 250,
      viewportY: 175,
    },
  );
});
