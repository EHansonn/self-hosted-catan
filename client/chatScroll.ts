export interface ScrollPosition {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function isNearLatest(
  { scrollHeight, scrollTop, clientHeight }: ScrollPosition,
  threshold = 24,
) {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}
