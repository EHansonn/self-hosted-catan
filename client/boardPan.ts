export const BOARD_PAN_THRESHOLD = 4;
export const MIN_BOARD_ZOOM = 0.6;
export const DEFAULT_BOARD_ZOOM = 0.8;
export const MAX_BOARD_ZOOM = 2;
const MAX_WHEEL_DELTA_PX = 100;
const WHEEL_ZOOM_RATE = 0.002;

export function normalizeBoardZoom(value: number) {
  return Math.min(
    MAX_BOARD_ZOOM,
    Math.max(MIN_BOARD_ZOOM, Number(value.toFixed(3))),
  );
}

export function boardWheelZoom(
  currentZoom: number,
  deltaY: number,
  deltaMode = 0,
  viewportHeight = 800,
) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return currentZoom;
  const deltaPixels =
    deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1);
  const boundedDelta = Math.max(
    -MAX_WHEEL_DELTA_PX,
    Math.min(MAX_WHEEL_DELTA_PX, deltaPixels),
  );
  return normalizeBoardZoom(
    currentZoom * Math.exp(-boundedDelta * WHEEL_ZOOM_RATE),
  );
}

export function boardPinchZoom(
  initialZoom: number,
  initialDistance: number,
  currentDistance: number,
) {
  if (
    !Number.isFinite(initialDistance) ||
    !Number.isFinite(currentDistance) ||
    initialDistance <= 0 ||
    currentDistance <= 0
  )
    return normalizeBoardZoom(initialZoom);
  return normalizeBoardZoom(
    initialZoom * (currentDistance / initialDistance),
  );
}

export function boardPinchAnchor(
  viewport: {
    scrollLeft: number;
    scrollTop: number;
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
  },
  currentZoom: number,
  focus: { x: number; y: number },
) {
  const x =
    currentZoom <= 1
      ? 0.5 +
        (focus.x - viewport.clientWidth / 2) /
          Math.max(viewport.clientWidth * currentZoom, 1)
      : (viewport.scrollLeft + focus.x) / Math.max(viewport.scrollWidth, 1);
  const y =
    currentZoom <= 1
      ? 0.5 +
        (focus.y - viewport.clientHeight / 2) /
          Math.max(viewport.clientHeight * currentZoom, 1)
      : (viewport.scrollTop + focus.y) / Math.max(viewport.scrollHeight, 1);
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

export interface BoardZoomAnchor {
  x: number;
  y: number;
  viewportX: number;
  viewportY: number;
}

export function boardZoomAnchor(
  viewport: {
    scrollLeft: number;
    scrollTop: number;
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
  },
  nextZoom: number,
  focus?: { x: number; y: number },
): BoardZoomAnchor {
  const viewportX = focus?.x ?? viewport.clientWidth / 2;
  const viewportY = focus?.y ?? viewport.clientHeight / 2;
  if (nextZoom <= 1)
    return {
      x: 0.5,
      y: 0.5,
      viewportX: viewport.clientWidth / 2,
      viewportY: viewport.clientHeight / 2,
    };
  return {
    x: (viewport.scrollLeft + viewportX) / Math.max(viewport.scrollWidth, 1),
    y: (viewport.scrollTop + viewportY) / Math.max(viewport.scrollHeight, 1),
    viewportX,
    viewportY,
  };
}

export interface BoardPanOrigin {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
  moved: boolean;
}

export function boardPanPosition(
  origin: BoardPanOrigin,
  x: number,
  y: number,
) {
  const dx = x - origin.x;
  const dy = y - origin.y;
  const moved =
    origin.moved || Math.hypot(dx, dy) >= BOARD_PAN_THRESHOLD;
  return {
    moved,
    scrollLeft: moved ? origin.scrollLeft - dx : origin.scrollLeft,
    scrollTop: moved ? origin.scrollTop - dy : origin.scrollTop,
  };
}
