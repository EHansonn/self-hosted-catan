export function formatGameDuration(durationMs: number) {
  const totalSeconds = Math.max(
    0,
    Math.floor((Number.isFinite(durationMs) ? durationMs : 0) / 1000),
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours)
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  if (minutes)
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}
