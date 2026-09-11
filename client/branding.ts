export const DEFAULT_APP_NAME = "Crossroads";

let appName = DEFAULT_APP_NAME;

export function configureBrand(value: unknown) {
  if (typeof value !== "string") return;
  const normalized = value.trim();
  if (normalized) appName = normalized;
}

export function getAppName() {
  return appName;
}
