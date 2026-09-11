import type { PublicGameLogEntry } from "../shared/game";

export interface GameLogGroup {
  key: string;
  entries: PublicGameLogEntry[];
}

const actorName = (text: string) =>
  text.match(/^(.+?)\s+(?:begins|builds|upgrades|rolls|gets|moves|plays|buys|claims|discards|steals|trades|offers|makes|wins)\b/i)?.[1] || null;

export function groupGameLog(
  entries: readonly PublicGameLogEntry[],
  limit = 35,
): GameLogGroup[] {
  const recent = limit > 0 ? entries.slice(-limit) : [];
  const groups: GameLogGroup[] = [];
  let legacyGroup = "legacy-system";
  let legacyActor: string | null = null;
  let legacyTurnStarted = false;

  for (const entry of recent) {
    let key = entry.group;
    if (!key) {
      const actor = actorName(entry.text);
      if (/\brolls\s+\d+/i.test(entry.text)) {
        legacyTurnStarted = true;
        legacyGroup = `legacy-turn-${entry.id}`;
      } else if (!legacyTurnStarted && actor && actor !== legacyActor) {
        legacyActor = actor;
        legacyGroup = `legacy-setup-${entry.id}`;
      }
      key = legacyGroup;
    }
    const latest = groups.at(-1);
    if (!latest || latest.key !== key)
      groups.push({ key, entries: [entry] });
    else latest.entries.push(entry);
  }

  return groups;
}
