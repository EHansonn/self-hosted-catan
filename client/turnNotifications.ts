import type { GameView } from "../shared/game";

export type TurnAttention = {
  key: string;
  label: string;
};

export function getTurnAttention(
  game: GameView | null,
  roomCode: string | undefined,
  playerId: string | undefined,
  paused: boolean,
  automated: boolean,
): TurnAttention | null {
  if (
    !game ||
    !roomCode ||
    !playerId ||
    paused ||
    automated ||
    game.phase === "finished"
  )
    return null;

  const discardCount = game.discards[playerId] || 0;
  if (game.phase === "discard")
    return discardCount
      ? {
          key: `${roomCode}:${game.turn}:discard`,
          label: `Discard ${discardCount} cards`,
        }
      : null;

  if (game.players[game.current]?.id !== playerId) return null;

  if (game.phase === "setupSettlement" || game.phase === "setupRoad")
    return {
      key: `${roomCode}:setup:${game.setupStep}`,
      label: "Opening placement",
    };

  if (game.phase === "robber" || game.phase === "steal")
    return {
      key: `${roomCode}:${game.turn}:robber`,
      label: game.phase === "steal" ? "Choose who to steal from" : "Move the robber",
    };

  if (game.phase === "freeRoad")
    return {
      key: `${roomCode}:${game.turn}:free-road`,
      label: "Place your free roads",
    };

  return {
    key: `${roomCode}:${game.turn}:turn`,
    label: game.secondary ? "Your special build phase" : "Your turn",
  };
}

export function playTurnNotification(context: AudioContext, volume: number) {
  const level = Math.min(1, Math.max(0, volume)) * 0.13;
  if (!level || context.state !== "running") return;

  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const startsAt = context.currentTime + index * 0.105;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.001, startsAt);
    gain.gain.exponentialRampToValueAtTime(level, startsAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, startsAt + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + 0.2);
  });
}
