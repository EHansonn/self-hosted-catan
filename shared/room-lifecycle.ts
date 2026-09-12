export function nextUnattendedSince(
  current: number | undefined,
  ongoing: boolean,
  hasHumanViewer: boolean,
  now: number,
) {
  if (!ongoing || hasHumanViewer) return undefined;
  return current ?? now;
}

export function unattendedGameExpired(
  unattendedSince: number | undefined,
  now: number,
  graceMs: number,
) {
  return unattendedSince !== undefined && now - unattendedSince >= graceMs;
}

export function nextDisconnectedSince(
  current: number | undefined,
  ongoing: boolean,
  connected: boolean,
  hasHumanViewer: boolean,
  now: number,
) {
  if (!ongoing || connected) return undefined;
  if (!hasHumanViewer) return current;
  return current ?? now;
}

export function disconnectedPlayerExpired(
  disconnectedSince: number | undefined,
  now: number,
  graceMs: number,
) {
  return (
    disconnectedSince !== undefined &&
    now - disconnectedSince >= graceMs
  );
}
