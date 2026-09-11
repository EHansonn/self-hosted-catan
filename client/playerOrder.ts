export function orderPlayersForViewer<T extends { id: string }>(
  players: readonly T[],
  viewerId: string,
) {
  const viewerIndex = players.findIndex((player) => player.id === viewerId);
  if (viewerIndex < 0) return [...players];
  return [
    ...players.slice(viewerIndex + 1),
    ...players.slice(0, viewerIndex),
    players[viewerIndex],
  ];
}
