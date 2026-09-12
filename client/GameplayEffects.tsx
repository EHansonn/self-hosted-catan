import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
} from "react";
import { GameCard } from "./GameUI";
import type {
  GameplayAnimationCue,
  ResourceFlightAnimation,
} from "./gameAnimations";

interface PositionedFlight extends ResourceFlightAnimation {
  key: string;
  startX: number;
  startY: number;
  middleX: number;
  middleY: number;
  endX: number;
  endY: number;
  delay: number;
}

function elementWithValue(attribute: string, value: string) {
  return [...document.querySelectorAll<Element>(`[${attribute}]`)].find(
    (element) => element.getAttribute(attribute) === value,
  );
}

export function GameplayEffects({
  cue,
}: {
  cue: GameplayAnimationCue | null;
}) {
  const [layout, setLayout] = useState<{
    cueId: string;
    flights: PositionedFlight[];
  }>({ cueId: "", flights: [] });

  useLayoutEffect(() => {
    if (!cue || !cue.resourceFlights.length) return;
    let cancelled = false;
    let frame = 0;
    const place = (attempt: number) => {
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        const positioned = cue.resourceFlights.flatMap((flight, index) => {
          const source = flight.sourcePlayerId
            ? elementWithValue("data-animation-player", flight.sourcePlayerId)
            : elementWithValue("data-animation-tile", String(flight.tileId));
          const panel = elementWithValue(
            "data-animation-player",
            flight.playerId,
          );
          if (!source || !panel) return [];
          const sourceTarget = flight.sourcePlayerId
            ? source.querySelector(".game-card.unknown") || source
            : source;
          const target = panel.querySelector(".game-card.unknown") || panel;
          const sourceBox = sourceTarget.getBoundingClientRect();
          const targetBox = target.getBoundingClientRect();
          const rawStartX = sourceBox.left + sourceBox.width / 2;
          const rawStartY = sourceBox.top + sourceBox.height / 2;
          const rawEndX = targetBox.left + targetBox.width / 2;
          const rawEndY = targetBox.top + targetBox.height / 2;
          const startX = Math.max(24, Math.min(innerWidth - 24, rawStartX));
          const startY = Math.max(24, Math.min(innerHeight - 24, rawStartY));
          const endX = Math.max(24, Math.min(innerWidth - 24, rawEndX));
          const endY = Math.max(24, Math.min(innerHeight - 24, rawEndY));
          return [{
            ...flight,
            key: `${cue.id}:${flight.sourcePlayerId || `tile-${flight.tileId}`}:${flight.playerId}:${flight.resource}:${index}`,
            startX,
            startY,
            middleX: startX + (endX - startX) * 0.48,
            middleY: Math.min(startY, endY) - Math.max(42, Math.abs(endX - startX) * 0.08),
            endX,
            endY,
            delay: flight.sourcePlayerId ? 90 + index * 130 : 430 + index * 90,
          }];
        });
        if (positioned.length || attempt >= 3)
          setLayout({ cueId: cue.id, flights: positioned });
        else place(attempt + 1);
      });
    };
    place(0);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [cue]);

  useEffect(() => {
    if (!layout.cueId || !layout.flights.length) return;
    const longestDelay = Math.max(
      ...layout.flights.map((flight) => flight.delay),
    );
    const timeout = window.setTimeout(() => {
      setLayout((current) =>
        current.cueId === layout.cueId
          ? { cueId: "", flights: [] }
          : current,
      );
    }, longestDelay + 1_100);
    return () => window.clearTimeout(timeout);
  }, [layout.cueId, layout.flights]);

  if (!layout.flights.length) return null;
  return (
    <div
      className="gameplay-effects"
      data-animation-cue={layout.cueId}
      aria-hidden="true"
    >
      {layout.flights.map((flight) => (
        <span
          className={`resource-flight ${flight.sourcePlayerId ? "monopoly-flight" : "production-flight"}`}
          key={flight.key}
          style={
            {
              "--flight-start-x": `${flight.startX}px`,
              "--flight-start-y": `${flight.startY}px`,
              "--flight-middle-x": `${flight.middleX}px`,
              "--flight-middle-y": `${flight.middleY}px`,
              "--flight-end-x": `${flight.endX}px`,
              "--flight-end-y": `${flight.endY}px`,
              "--flight-delay": `${flight.delay}ms`,
            } as CSSProperties
          }
        >
          <GameCard
            resource={flight.resource}
            count={flight.amount > 1 ? flight.amount : undefined}
            label={`${flight.amount} ${flight.resource}`}
          />
        </span>
      ))}
    </div>
  );
}
