import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  RotateCcw,
  Box,
  Layers,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Board, PublicPlayer, Resource } from "../shared/game";
import type { GameplayAnimationCue } from "./gameAnimations";
import { getAppName } from "./branding";
import { spriteViewBox } from "./sprites";
import {
  DEFAULT_BOARD_ZOOM,
  MAX_BOARD_ZOOM,
  MIN_BOARD_ZOOM,
  boardPanPosition,
  boardWheelZoom,
  boardZoomAnchor,
  normalizeBoardZoom,
  type BoardPanOrigin,
  type BoardZoomAnchor,
} from "./boardPan";
const ThreeBoard = lazy(() => import("./ThreeBoard"));
class BoardErrorBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="board-loading renderer-recovery" role="alert">
          <strong>3D could not load.</strong>
          <span>
            Your game is saved. You can keep playing in 2D or reload the latest
            version.
          </span>
          <button className="btn subtle" onClick={this.props.onFallback}>
            Continue in 2D
          </button>
          <button className="btn primary" onClick={() => location.reload()}>
            Reload game
          </button>
        </div>
      );
    return this.props.children;
  }
}
export const TERRAIN: Record<
  Resource | "desert",
  { col: number; row: number; color: string; label: string }
> = {
  wood: { col: 0, row: 0, color: "#376e46", label: "Wood" },
  wheat: { col: 1, row: 0, color: "#e2b04b", label: "Wheat" },
  ore: { col: 2, row: 0, color: "#899497", label: "Ore" },
  sheep: { col: 0, row: 1, color: "#a2bd62", label: "Sheep" },
  brick: { col: 1, row: 1, color: "#bd6e4a", label: "Brick" },
  desert: { col: 2, row: 1, color: "#dfc082", label: "Desert" },
};
// Font-independent number shapes keep the production tokens readable in iOS
// Safari versions that intermittently omit SVG <text> while still painting the
// surrounding token and probability pips.
const TOKEN_DIGIT_PATHS: Record<string, string> = {
  "0": "M4.1-36.1Q4.1-56.5 11.5-64.6Q18.8-72.8 33.8-72.8Q41.1-72.8 45.7-71Q50.3-69.2 53.3-66.4Q56.2-63.5 57.9-60.4Q59.6-57.2 60.6-53Q62.6-45 62.6-36.3Q62.6-16.8 56-7.8Q49.4 1.2 33.3 1.2Q24.3 1.2 18.7-1.7Q13.1-4.5 9.6-10.1Q7-14.1 5.5-20.9Q4.1-27.8 4.1-36.1ZM23.8-36Q23.8-22.4 26.2-17.4Q28.7-12.4 33.3-12.4Q36.3-12.4 38.5-14.5Q40.7-16.6 41.8-21.2Q42.8-25.8 42.8-35.5Q42.8-49.8 40.4-54.7Q38-59.6 33.2-59.6Q28.2-59.6 26-54.6Q23.8-49.6 23.8-36Z",
  "1": "M32.7-72.8H49.2V0H29.1V-47.7Q24.2-44 19.6-41.7Q15-39.4 8.2-37.3V-53.6Q18.3-56.9 23.9-61.5Q29.5-66.1 32.7-72.8Z",
  "2": "M62.3-16.2V0H2.6Q3.7-8.8 8.9-16.6Q14.1-24.4 28.4-35Q37.1-41.5 39.6-44.9Q42-48.2 42-51.3Q42-54.5 39.6-56.9Q37.2-59.2 33.5-59.2Q29.7-59.2 27.3-56.8Q24.9-54.4 24-48.3L4.1-50Q5.3-58.3 8.4-63.1Q11.5-67.8 17.2-70.3Q22.9-72.8 33-72.8Q43.5-72.8 49.3-70.4Q55.1-68 58.5-63.1Q61.8-58.1 61.8-52Q61.8-45.4 58-39.5Q54.2-33.5 44-26.4Q38-22.2 36-20.6Q34-18.9 31.3-16.2Z",
  "3": "M23.4-50.9L4.6-54.2Q6.9-63.2 13.6-68Q20.3-72.8 32.5-72.8Q46.5-72.8 52.7-67.6Q59-62.4 59-54.4Q59-49.8 56.4-46Q53.9-42.3 48.8-39.5Q52.9-38.4 55.1-37.1Q58.7-34.9 60.7-31.3Q62.6-27.7 62.6-22.7Q62.6-16.5 59.4-10.7Q56.1-5 50-1.9Q43.8 1.2 33.8 1.2Q24 1.2 18.4-1.1Q12.7-3.4 9.1-7.8Q5.5-12.2 3.5-18.9L23.4-21.5Q24.6-15.5 27-13.2Q29.5-10.9 33.3-10.9Q37.3-10.9 40-13.8Q42.6-16.7 42.6-21.6Q42.6-26.6 40.1-29.3Q37.5-32.1 33.1-32.1Q30.8-32.1 26.7-30.9L27.7-45.1Q29.3-44.9 30.3-44.9Q34.2-44.9 36.8-47.4Q39.4-49.9 39.4-53.3Q39.4-56.5 37.5-58.5Q35.5-60.4 32.1-60.4Q28.6-60.4 26.4-58.3Q24.2-56.2 23.4-50.9Z",
  "4": "M38.3 0V-13.4H2.1V-29.7L38.3-72.8H55.6V-28.8H64.6V-13.4H55.6V0ZM19.1-28.8H38.3V-51.3Z",
  "5": "M5.9-33.1L12.2-71.6H59.4V-55.7H27.4L25.7-45Q29-46.5 32.3-47.3Q35.5-48.1 38.7-48.1Q49.4-48.1 56.1-41.6Q62.8-35.1 62.8-25.2Q62.8-18.3 59.4-11.9Q55.9-5.5 49.6-2.1Q43.3 1.2 33.4 1.2Q26.3 1.2 21.3-.1Q16.2-1.5 12.7-4.1Q9.1-6.8 6.9-10.2Q4.7-13.5 3.3-18.6L23.4-20.8Q24.1-15.9 26.8-13.4Q29.5-10.9 33.2-10.9Q37.4-10.9 40.1-14Q42.8-17.2 42.8-23.4Q42.8-29.8 40-32.8Q37.3-35.8 32.8-35.8Q29.9-35.8 27.2-34.4Q25.2-33.3 22.8-30.7Z",
  "6": "M61.7-55.5L41.9-53Q41.1-57.2 39.3-58.9Q37.5-60.6 34.8-60.6Q29.9-60.6 27.2-55.7Q25.3-52.2 24.4-40.7Q27.9-44.3 31.7-46Q35.4-47.8 40.4-47.8Q50-47.8 56.6-40.9Q63.2-34.1 63.2-23.6Q63.2-16.5 59.8-10.6Q56.5-4.8 50.6-1.8Q44.6 1.2 35.7 1.2Q25 1.2 18.5-2.4Q12-6.1 8.1-14.1Q4.2-22.2 4.2-35.4Q4.2-54.8 12.4-63.8Q20.5-72.8 35-72.8Q43.5-72.8 48.5-70.8Q53.4-68.8 56.7-65Q60-61.2 61.7-55.5ZM25-23.6Q25-17.8 28-14.5Q30.9-11.2 35.2-11.2Q39.1-11.2 41.7-14.2Q44.3-17.1 44.3-23Q44.3-29.1 41.6-32.3Q38.9-35.4 34.8-35.4Q30.7-35.4 27.9-32.4Q25-29.3 25-23.6Z",
  "7": "M4.4-54.8V-71.6H62.5V-58.2Q54.9-51.3 49.9-43.4Q43.7-33.7 40.1-21.8Q37.3-12.6 36.3 0H16.5Q18.8-17.5 23.9-29.4Q28.9-41.3 39.8-54.8Z",
  "8": "M16.1-38.5Q11.4-41 9.2-44Q6.3-48.2 6.3-53.7Q6.3-62.7 14.7-68.4Q21.3-72.8 32.2-72.8Q46.5-72.8 53.4-67.3Q60.3-61.9 60.3-53.6Q60.3-48.7 57.5-44.5Q55.5-41.4 51.1-38.5Q56.9-35.7 59.7-31.1Q62.6-26.5 62.6-20.9Q62.6-15.6 60.1-10.9Q57.7-6.3 54.1-3.7Q50.5-1.2 45.1 0Q39.8 1.2 33.7 1.2Q22.4 1.2 16.4-1.5Q10.4-4.2 7.2-9.4Q4.1-14.6 4.1-21Q4.1-27.3 7-31.7Q10-36.1 16.1-38.5ZM25-52.5Q25-48.8 27.3-46.6Q29.6-44.3 33.5-44.3Q36.9-44.3 39.1-46.5Q41.3-48.8 41.3-52.3Q41.3-56.1 39-58.4Q36.7-60.7 33.2-60.7Q29.5-60.7 27.3-58.4Q25-56.2 25-52.5ZM23.9-21.7Q23.9-17 26.8-14Q29.7-11 33.4-11Q37-11 39.8-14Q42.6-17.1 42.6-21.8Q42.6-26.5 39.8-29.5Q36.9-32.6 33.2-32.6Q29.4-32.6 26.7-29.6Q23.9-26.7 23.9-21.7Z",
  "9": "M5-16.1L24.8-18.6Q25.5-14.4 27.4-12.7Q29.2-11 31.9-11Q36.7-11 39.4-15.8Q41.4-19.4 42.3-30.9Q38.8-27.2 35-25.5Q31.3-23.8 26.3-23.8Q16.7-23.8 10.1-30.7Q3.5-37.5 3.5-47.9Q3.5-55.1 6.8-60.9Q10.2-66.8 16.1-69.8Q22-72.8 31-72.8Q41.7-72.8 48.2-69.1Q54.7-65.4 58.6-57.4Q62.5-49.4 62.5-36.2Q62.5-16.8 54.3-7.8Q46.1 1.2 31.7 1.2Q23.1 1.2 18.2-.8Q13.3-2.7 10-6.5Q6.7-10.4 5-16.1ZM41.6-48Q41.6-53.8 38.7-57.1Q35.7-60.4 31.5-60.4Q27.6-60.4 25-57.4Q22.4-54.4 22.4-48.5Q22.4-42.5 25.1-39.3Q27.8-36.1 31.8-36.1Q36-36.1 38.8-39.2Q41.6-42.3 41.6-48Z",
};

function TokenNumber({ value, hot }: { value: number; hot: boolean }) {
  const digits = String(value).split("");
  const scale = digits.length === 1 ? 0.005 : 0.0039;
  const step = digits.length === 1 ? 0 : 0.255;
  const start = digits.length === 1 ? -0.165 : -0.252;
  return (
    <g
      className="token-number-paths"
      fill={hot ? "#bd1111" : "#064c18"}
      aria-hidden="true"
    >
      {digits.map((digit, index) => (
        <path
          key={`${digit}-${index}`}
          d={TOKEN_DIGIT_PATHS[digit]}
          transform={`translate(${start + index * step} .105) scale(${scale})`}
        />
      ))}
    </g>
  );
}

function RobberMarker2D({
  x,
  y,
  tileId,
  moveFrom,
}: {
  x: number;
  y: number;
  tileId: number;
  moveFrom?: { x: number; y: number };
}) {
  const dx = moveFrom ? moveFrom.x - x : 0;
  const dy = moveFrom ? moveFrom.y - y : 0;
  return (
    <g
      className="robber-marker-2d"
      data-robber-tile={tileId}
      transform={`translate(${x + 0.4} ${y - 0.14})`}
      pointerEvents="none"
      role="img"
      aria-label="Robber blocks this hex"
    >
      <g className={moveFrom ? "robber-arrival" : undefined}>
        {moveFrom && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values={`${dx} ${dy};${dx * 0.48} ${dy * 0.48 - 0.34};0 0`}
            keyTimes="0;.55;1"
            dur=".72s"
            calcMode="spline"
            keySplines=".2 .75 .25 1;.2 .8 .2 1"
          />
        )}
        <circle cy=".06" r=".36" fill="#082b3b" opacity=".42" />
        <circle
          r=".35"
          fill="#fff6d9"
          stroke="#f1c65a"
          strokeWidth=".06"
        />
        <circle
          r=".285"
          fill="#d8edf1"
          stroke="#244958"
          strokeWidth=".032"
        />
        <g
          transform="translate(-.216 -.216) scale(.018)"
          fill="none"
          stroke="#173b4b"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
          <path d="M16.5 18c1-2 2.5-5 2.5-9a7 7 0 0 0-7-7H6.64a1 1 0 0 0-.77 1.64L7 5l-2.32 5.8a2 2 0 0 0 .95 2.53l2.87 1.45" />
          <path d="m15 5 1.43-1.43M17 8l1.53-1.53M9.71 12.19 7 18" />
        </g>
        <title>Robber blocks this hex</title>
      </g>
    </g>
  );
}
export interface BoardProps {
  board: Board;
  players: PublicPlayer[];
  robber: number;
  highlights: number[];
  kind: "vertex" | "edge" | "tile" | null;
  onPick: (id: number) => void;
  roll?: number;
  animation?: GameplayAnimationCue | null;
  mode: "2d" | "3d";
  onMode: (mode: "2d" | "3d") => void;
  selected?: number;
  buildOptions?: Record<BuildPiece, number[]>;
  onBuildHint?: (type: BuildPiece | null) => void;
  onBuildPick?: (type: BuildPiece, id: number) => void;
  overlay?: ReactNode;
  confirmation?: {
    label: string;
    onConfirm: () => void;
    onCancel: () => void;
    disabled: boolean;
  };
  preview?: boolean;
}
export type BuildPiece = "road" | "settlement" | "city";
export function BoardPreview({ board, seed }: { board: Board; seed: number }) {
  const robber = board.tiles.find((tile) => tile.terrain === "desert")!.id;
  return (
    <div
      className="lobby-map-preview"
      role="img"
      aria-label={`Island map preview for seed ${seed.toString(16).padStart(8, "0").toUpperCase()}`}
    >
      <Board2D
        board={board}
        players={[]}
        robber={robber}
        highlights={[]}
        kind={null}
        onPick={() => {}}
        mode="2d"
        onMode={() => {}}
        zoom={1}
        preview
      />
    </div>
  );
}
export function BoardView(props: BoardProps) {
  const [zoom, setZoom] = useState(DEFAULT_BOARD_ZOOM);
  const [reset, setReset] = useState(0);
  const [panning, setPanning] = useState(false);
  const [buildHint, setBuildHint] = useState<BuildPiece | null>(null);
  const boardScroll = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const zoomAnchor = useRef<BoardZoomAnchor | null>(null);
  const panOrigin = useRef<BoardPanOrigin | null>(null);
  const suppressClickUntil = useRef(0);
  const hintedSites = buildHint ? props.buildOptions?.[buildHint] : undefined;
  const displayedKind =
    props.kind ??
    (hintedSites?.length
      ? buildHint === "road"
        ? "edge"
        : "vertex"
      : null);
  const displayedHighlights = props.kind
    ? props.highlights
    : hintedSites || [];
  const pickDisplayedSite = (id: number) => {
    if (!props.kind && buildHint)
      props.onBuildPick?.(buildHint, id);
    else props.onPick(id);
  };
  const showBuildHint = (type: BuildPiece | null) => {
    setBuildHint(type);
    props.onBuildHint?.(type);
  };
  const setBoardZoom = (next: number, focus?: { x: number; y: number }) => {
    const viewport = boardScroll.current;
    const normalized = normalizeBoardZoom(next);
    if (viewport)
      zoomAnchor.current = boardZoomAnchor(viewport, normalized, focus);
    zoomRef.current = normalized;
    setZoom(normalized);
  };
  useLayoutEffect(() => {
    const viewport = boardScroll.current;
    const anchor = zoomAnchor.current;
    if (!viewport || !anchor) return;
    viewport.scrollLeft =
      anchor.x * viewport.scrollWidth - anchor.viewportX;
    viewport.scrollTop =
      anchor.y * viewport.scrollHeight - anchor.viewportY;
    zoomAnchor.current = null;
  }, [zoom, reset]);
  useEffect(() => {
    if (props.mode !== "2d") return;
    const viewport = boardScroll.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      const nextZoom = boardWheelZoom(
        zoomRef.current,
        event.deltaY,
        event.deltaMode,
        viewport.clientHeight,
      );
      if (nextZoom === zoomRef.current) return;
      const bounds = viewport.getBoundingClientRect();
      setBoardZoom(nextZoom, {
        x: Math.max(0, Math.min(viewport.clientWidth, event.clientX - bounds.left)),
        y: Math.max(0, Math.min(viewport.clientHeight, event.clientY - bounds.top)),
      });
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [props.mode]);
  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = boardScroll.current;
    if (
      !viewport ||
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      (viewport.scrollWidth <= viewport.clientWidth + 1 &&
        viewport.scrollHeight <= viewport.clientHeight + 1)
    )
      return;
    panOrigin.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      moved: false,
    };
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = boardScroll.current;
    const origin = panOrigin.current;
    if (!viewport || !origin || origin.pointerId !== event.pointerId) return;
    const next = boardPanPosition(origin, event.clientX, event.clientY);
    if (!next.moved) return;
    if (!origin.moved) {
      origin.moved = true;
      viewport.setPointerCapture(event.pointerId);
      setPanning(true);
    }
    event.preventDefault();
    viewport.scrollLeft = next.scrollLeft;
    viewport.scrollTop = next.scrollTop;
  };
  const finishPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = boardScroll.current;
    const origin = panOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    if (origin.moved) suppressClickUntil.current = performance.now() + 250;
    panOrigin.current = null;
    setPanning(false);
    if (viewport?.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
  };
  return (
    <div className="board-shell">
      <div className="board-controls">
        <div className="mode-toggle" aria-label="Board view">
          <button
            onClick={() => props.onMode("2d")}
            aria-pressed={props.mode === "2d"}
          >
            <Layers size={15} />
            2D
          </button>
          <button
            onClick={() => props.onMode("3d")}
            aria-pressed={props.mode === "3d"}
          >
            <Box size={15} />
            3D
          </button>
        </div>
        <button
          className="icon-btn"
          aria-label="Reset board view"
          onClick={() => {
            setBoardZoom(DEFAULT_BOARD_ZOOM);
            setReset((v) => v + 1);
          }}
        >
          <RotateCcw size={17} />
        </button>
        {props.mode === "2d" && (
          <>
            <button
              className="icon-btn"
              aria-label={`Zoom in, current zoom ${Math.round(zoom * 100)} percent`}
              title={`Zoom in · ${Math.round(zoom * 100)}%`}
              disabled={zoom >= MAX_BOARD_ZOOM}
              onClick={() => setBoardZoom(zoom + 0.2)}
            >
              <ZoomIn size={17} />
            </button>
            <button
              className="icon-btn"
              aria-label={`Zoom out, current zoom ${Math.round(zoom * 100)} percent`}
              title={`Zoom out · ${Math.round(zoom * 100)}%`}
              disabled={zoom <= MIN_BOARD_ZOOM}
              onClick={() => setBoardZoom(zoom - 0.2)}
            >
              <ZoomOut size={17} />
            </button>
          </>
        )}
      </div>
      {props.mode === "3d" ? (
        <BoardErrorBoundary onFallback={() => props.onMode("2d")}>
          <Suspense
            fallback={
              <div className="board-loading">Preparing your 3D table…</div>
            }
          >
            <ThreeBoard
              {...props}
              kind={displayedKind}
              highlights={displayedHighlights}
              onPick={pickDisplayedSite}
              onBuildHint={showBuildHint}
              reset={reset}
            />
          </Suspense>
        </BoardErrorBoundary>
      ) : (
        <div
          className={`board-scroll can-pan ${panning ? "is-panning" : ""}`}
          ref={boardScroll}
          role="region"
          aria-label="2D board viewport"
          tabIndex={0}
          onPointerDown={beginPan}
          onPointerMove={movePan}
          onPointerUp={finishPan}
          onPointerCancel={finishPan}
          onPointerLeave={() => {
            if (panOrigin.current && !panOrigin.current.moved)
              panOrigin.current = null;
            if (!props.kind) showBuildHint(null);
          }}
          onClickCapture={(event) => {
            if (performance.now() <= suppressClickUntil.current) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <Board2D
            {...props}
            kind={displayedKind}
            highlights={displayedHighlights}
            onPick={pickDisplayedSite}
            onBuildHint={showBuildHint}
            zoom={zoom}
          />
        </div>
      )}
      {props.overlay}
      {props.confirmation && (
        <div
          className="placement-confirm"
          role="group"
          aria-label="Confirm board placement"
        >
          <span>Selected location</span>
          <button className="btn subtle" onClick={props.confirmation.onCancel}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={props.confirmation.disabled}
            onClick={props.confirmation.onConfirm}
          >
            {props.confirmation.label}
          </button>
        </div>
      )}
      <div className="board-caption">
        {props.mode === "3d"
          ? "Drag to orbit · pinch or scroll to zoom"
          : "Drag to pan · scroll to zoom · tap an available location to build"}
        <span>{getAppName()}</span>
      </div>
    </div>
  );
}
function Board2D({
  board,
  players,
  robber,
  highlights,
  kind,
  onPick,
  roll,
  zoom,
  selected,
  buildOptions,
  onBuildHint,
  onBuildPick,
  animation,
  preview,
}: BoardProps & { zoom: number }) {
  const width = Math.max(...board.vertices.map((v) => Math.abs(v.x))) * 2 + 2.4,
    height = Math.max(...board.vertices.map((v) => Math.abs(v.y))) * 2 + 2.4;
  const color = (id: string) =>
    players.find((p) => p.id === id)?.color || "#fff";
  const surfaceZoom = Math.max(1, zoom);
  const contentZoom = Math.min(1, zoom);
  const roadCandidates = new Set(buildOptions?.road || []);
  const settlementCandidates = new Set(buildOptions?.settlement || []);
  const cityCandidates = new Set(buildOptions?.city || []);
  const rolledTiles = new Set(animation?.rolledTiles || []);
  const robberMove = animation?.robber;
  const robberTile = board.tiles.find((tile) => tile.id === robber);
  const robberMoveFrom = robberMove
    ? board.tiles.find((tile) => tile.id === robberMove.from)
    : undefined;
  const activate = (id: number, contextualType?: BuildPiece) => ({
    onClick: () =>
      contextualType ? onBuildPick?.(contextualType, id) : onPick(id),
    onPointerEnter: () => {
      if (contextualType) onBuildHint?.(contextualType);
    },
    onFocus: () => {
      if (contextualType) onBuildHint?.(contextualType);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (contextualType) onBuildPick?.(contextualType, id);
        else onPick(id);
      }
    },
    role: "button",
    tabIndex: 0,
  });
  return (
    <div
      className="board-zoom-surface"
      style={{
        width: `${surfaceZoom * 100}%`,
        height: `${surfaceZoom * 100}%`,
      }}
    >
      <svg
        className="board-svg"
        viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`}
        style={{
          width: `${contentZoom * 100}%`,
          height: `${contentZoom * 100}%`,
        }}
        aria-label={preview ? undefined : "Interactive island game board"}
        aria-hidden={preview || undefined}
      >
      <defs>
        <filter
          id="piece-shadow"
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
        >
          <feDropShadow
            dx="0"
            dy=".045"
            stdDeviation=".035"
            floodOpacity=".65"
          />
        </filter>
        <filter id="tile-shadow">
          <feDropShadow
            dx="0"
            dy=".1"
            stdDeviation=".08"
            floodColor="#001820"
            floodOpacity=".8"
          />
        </filter>
        <radialGradient id="tile-place-glow" cx="35%" cy="28%">
          <stop offset="0" stopColor="#fffef0" />
          <stop offset=".45" stopColor="#d8ed71" />
          <stop offset="1" stopColor="#9eb33a" />
        </radialGradient>
      </defs>
      {[{ color: "#61badd", width: .38 }, { color: "#abe6ed", width: .26 }, { color: "#ffe4a3", width: .15 }].map(coast => <g key={coast.width} stroke={coast.color} strokeWidth={coast.width} strokeLinejoin="round" fill={coast.color}>
        {board.tiles.map(t => <polygon key={t.id} points={t.vertices.map(id => `${board.vertices[id].x},${board.vertices[id].y}`).join(" ")} />)}
      </g>)}
      {board.tiles.map((tile) => {
        const tex = TERRAIN[tile.terrain];
        const hotNumber = [6, 8].includes(tile.number);
        const pipCount = 6 - Math.abs(7 - tile.number);
        const poly = tile.vertices
          .map((id) => `${board.vertices[id].x},${board.vertices[id].y}`)
          .join(" ");
        const enabled = kind === "tile" && highlights.includes(tile.id);
        const rolled = rolledTiles.has(tile.id);
        return (
          <g
            key={`${tile.id}:${rolled ? animation?.id : ""}:${robberMove?.to === tile.id ? animation?.id : ""}`}
            className={`${enabled ? "tile pickable" : ""}${rolled ? " rolled-tile" : ""}`}
            data-animation-tile={tile.id}
            {...(enabled ? activate(tile.id) : {})}
            aria-label={`${tex.label} ${tile.number || ""}${enabled ? ", move robber here" : ""}`}
          >
            <defs>
              <clipPath id={`hex-${tile.id}`}>
                <polygon points={poly} />
              </clipPath>
            </defs>
            <polygon
              points={poly}
              fill={{ wood: "#0bb038", brick: "#eb6c28", sheep: "#9cc614", wheat: "#f6bf16", ore: "#a3b1af", desert: "#d8c780" }[tile.terrain]}
              stroke="#f8d078"
              strokeWidth=".09"
            />
            {rolled && (
              <polygon
                className="roll-tile-flash"
                points={poly}
                fill="#fff4a0"
                stroke="#fffbd5"
                strokeWidth=".08"
                aria-hidden="true"
              />
            )}
            <g clipPath={`url(#hex-${tile.id})`}>
              <image
                href="/textures/terrain-atlas.png"
                x={tile.x - 1 - tex.col * 2}
                y={tile.y - 1 - tex.row * 2}
                width="6"
                height="4"
                preserveAspectRatio="none"
                opacity=".28"
              />
              <polygon points={poly} fill="#ffe39c" opacity=".08" />
            </g>
            <polygon
              points={poly}
              fill="none"
              stroke={
                enabled && selected === tile.id
                  ? "#fff"
                  : enabled
                    ? "#ffe5a5"
                    : "#e7d6a9"
              }
              strokeOpacity={enabled ? 1 : 0.9}
              strokeWidth={enabled ? 0.07 : 0.055}
            />
            <polygon points={poly} transform={`translate(${tile.x} ${tile.y}) scale(.91) translate(${-tile.x} ${-tile.y})`} fill="none" stroke="#ffe4a4" strokeWidth=".035" opacity=".65" />
            {tile.terrain !== "desert" && (() => {
              const index = ["wood", "brick", "sheep", "wheat", "ore"].indexOf(tile.terrain);
              return <svg x={tile.x - .37} y={tile.y - .73} width=".74" height=".74" viewBox={`${index % 4} ${Math.floor(index / 4)} 1 1`} aria-hidden="true"><image href="/textures/game-sprites.png" width="4" height="4" /></svg>;
            })()}
            {tile.number > 0 && (
              <g
                className={roll === tile.number && tile.id !== robber ? "token producing" : "token"}
                transform={`translate(${tile.x} ${tile.y + .3})`}
              >
                <rect
                  x="-.35"
                  y="-.29"
                  width=".70"
                  height=".73"
                  rx=".095"
                  fill="#273e4d"
                  opacity=".42"
                />
                <rect
                  x="-.34"
                  y="-.33"
                  width=".68"
                  height=".71"
                  rx=".085"
                  fill="#fffdf1"
                  stroke="#cbb88f"
                  strokeWidth=".026"
                />
                <TokenNumber value={tile.number} hot={hotNumber} />
                {Array.from({ length: pipCount }, (_, pip) => (
                  <circle
                    key={pip}
                    cx={(pip - (pipCount - 1) / 2) * 0.073}
                    cy=".245"
                    r=".026"
                    fill={hotNumber ? "#bd1111" : "#064c18"}
                  />
                ))}
              </g>
            )}
            {enabled && (
              <g
                className={`tile-place-marker${selected === tile.id ? " selected" : ""}`}
                transform={`translate(${tile.x} ${tile.y})`}
                aria-hidden="true"
              >
                <circle r=".32" fill="#173744" opacity=".45" transform="translate(0 .045)" />
                <circle r=".29" fill="url(#tile-place-glow)" stroke="#fff" strokeWidth=".05" />
                <circle r=".15" fill="none" stroke="#5f7626" strokeWidth=".028" opacity=".72" />
              </g>
            )}
          </g>
        );
      })}
      {board.ports.map((port, i) => {
        const e = board.edges[port.edge],
          a = board.vertices[e.a],
          b = board.vertices[e.b],
          x = (a.x + b.x) / 2,
          y = (a.y + b.y) / 2,
          len = Math.hypot(x, y),
          px = x + (x / len) * 0.56,
          py = y + (y / len) * 0.56,
          ratio = port.resource === "any" ? "3:1" : "2:1",
          portName = port.resource === "any" ? "General" : TERRAIN[port.resource].label,
          sprite = port.resource === "any" ? "unknown" : port.resource;
        return (
          <g
            key={i}
            className="port-badge-2d"
            role="img"
            aria-label={`${portName} harbor, trade ${ratio}`}
          >
            <title>{`${portName} harbor, trade ${ratio}`}</title>
            <path
              d={`M${a.x} ${a.y} L${px} ${py} L${b.x} ${b.y}`}
              fill="none"
              stroke="#c9b181"
              strokeWidth=".025"
              opacity=".6"
            />
            <circle
              cx={px}
              cy={py}
              r=".3"
              fill="#173e5d"
              opacity=".34"
              transform="translate(0 .035)"
            />
            <circle
              cx={px}
              cy={py}
              r=".285"
              fill="#fff7db"
              stroke="#d5b77e"
              strokeWidth=".028"
            />
            <svg
              x={px - 0.17}
              y={py - 0.235}
              width=".34"
              height=".34"
              viewBox={spriteViewBox(sprite)}
              aria-hidden="true"
            >
              <image
                href="/textures/game-sprites.png"
                width="4"
                height="4"
              />
            </svg>
            <rect
              x={px - 0.19}
              y={py + 0.075}
              width=".38"
              height=".135"
              rx=".055"
              fill="#fffdf5"
              stroke="#d8c69f"
              strokeWidth=".014"
            />
            <text
              x={px}
              y={py + 0.177}
              textAnchor="middle"
              fontSize=".14"
              fill="#324858"
              fontWeight="850"
            >
              {ratio}
            </text>
          </g>
        );
      })}
      {board.edges
        .filter(
          (e) =>
            e.owner ||
            roadCandidates.has(e.id) ||
            (kind === "edge" && highlights.includes(e.id)),
        )
        .map((e) => {
          const a = board.vertices[e.a],
            b = board.vertices[e.b],
            enabled = kind === "edge" && highlights.includes(e.id),
            contextual = roadCandidates.has(e.id),
            interactive = enabled || contextual,
            mx = (a.x + b.x) / 2,
            my = (a.y + b.y) / 2,
            arrival = animation?.placements.find(
              (placement) => placement.kind === "road" && placement.id === e.id,
            );
          return (
            <g
              key={`${e.id}:${arrival ? animation?.id : ""}`}
              {...(interactive ? activate(e.id, contextual ? "road" : undefined) : {})}
              className={interactive ? "pickable build-discovery" : ""}
              aria-label={interactive ? `Build road ${e.id}` : undefined}
            >
              {(e.owner || enabled) && (
                <g className={arrival ? "road-piece-arrival" : undefined}>
                  <line
                    pathLength={1}
                    x1={a.x * 0.85 + b.x * 0.15}
                    y1={a.y * 0.85 + b.y * 0.15}
                    x2={b.x * 0.85 + a.x * 0.15}
                    y2={b.y * 0.85 + a.y * 0.15}
                    stroke="#09212b"
                    strokeWidth=".19"
                    strokeLinecap="round"
                  />
                  <line
                    className="road-piece-color"
                    pathLength={1}
                    x1={a.x * 0.85 + b.x * 0.15}
                    y1={a.y * 0.85 + b.y * 0.15}
                    x2={b.x * 0.85 + a.x * 0.15}
                    y2={b.y * 0.85 + a.y * 0.15}
                    stroke={
                      e.owner
                        ? color(e.owner)
                        : selected === e.id
                          ? "#fff"
                          : "#ffe7a2"
                    }
                    strokeWidth={e.owner ? ".14" : ".085"}
                    strokeDasharray={e.owner ? undefined : ".07 .05"}
                    strokeLinecap="round"
                  />
                </g>
              )}
              {enabled && !e.owner && (
                <circle
                  cx={mx}
                  cy={my}
                  r={selected === e.id ? ".21" : ".18"}
                  fill={selected === e.id ? "#fff" : "#ffe7a2"}
                  fillOpacity={selected === e.id ? ".82" : ".5"}
                  stroke="#fff4cf"
                  strokeWidth={selected === e.id ? ".055" : ".035"}
                  className="site-pulse"
                />
              )}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth=".4"
              />
            </g>
          );
        })}
      {board.vertices
        .filter(
          (v) =>
            v.owner ||
            settlementCandidates.has(v.id) ||
            cityCandidates.has(v.id) ||
            (kind === "vertex" && highlights.includes(v.id)),
        )
        .map((v) => {
          const enabled = kind === "vertex" && highlights.includes(v.id);
          const contextualType: BuildPiece | undefined = cityCandidates.has(v.id)
            ? "city"
            : settlementCandidates.has(v.id)
              ? "settlement"
              : undefined;
          const interactive = enabled || !!contextualType;
          const arrival = animation?.placements.find(
            (placement) =>
              placement.id === v.id &&
              (placement.kind === "settlement" || placement.kind === "city"),
          );
          return (
            <g
              key={`${v.id}:${arrival ? animation?.id : ""}`}
              transform={`translate(${v.x} ${v.y})`}
              {...(interactive ? activate(v.id, contextualType) : {})}
              className={interactive ? "pickable build-discovery" : ""}
              aria-label={
                interactive
                  ? `Build ${contextualType || (v.owner ? "city" : "settlement")} ${v.id}`
                  : undefined
              }
            >
              {enabled && (
                <circle
                  r={contextualType === "city" ? ".31" : ".22"}
                  fill={selected === v.id ? "#fff" : "#ffe7a2"}
                  fillOpacity={selected === v.id ? ".8" : ".25"}
                  stroke={selected === v.id ? "#fff" : "#ffe7a2"}
                  strokeWidth={selected === v.id ? ".07" : ".025"}
                  className="site-pulse"
                />
              )}
              {v.owner ? (
                <g className={arrival ? "building-piece-arrival" : undefined}>
                  <path
                    d={
                      v.city
                        ? "M-.22 .11V-.12L-.08-.24 .04-.12V-.03H.18V.13Z"
                        : "M-.14 .12V-.06L0-.19 .14-.06V.12Z"
                    }
                    fill={color(v.owner)}
                    stroke="#173037"
                    strokeWidth=".045"
                    filter="url(#piece-shadow)"
                    transform="scale(1.35)"
                  />
                </g>
              ) : enabled ? (
                <circle r=".06" fill="#ffe7a2" />
              ) : null}
              {interactive && <circle r=".32" fill="transparent" />}
            </g>
          );
        })}
      {robberTile && (
        <RobberMarker2D
          key={`${robberTile.id}:${robberMove?.to === robberTile.id ? animation?.id : ""}`}
          x={robberTile.x}
          y={robberTile.y}
          tileId={robberTile.id}
          moveFrom={
            robberMove?.to === robberTile.id && robberMoveFrom
              ? { x: robberMoveFrom.x, y: robberMoveFrom.y }
              : undefined
          }
        />
      )}
      </svg>
    </div>
  );
}
