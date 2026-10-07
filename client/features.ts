let replaysEnabled = true;

export function configureReplays(enabled: boolean) {
  replaysEnabled = enabled;
}

export function areReplaysEnabled() {
  return replaysEnabled;
}
