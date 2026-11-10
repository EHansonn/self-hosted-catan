import type { Hand } from "./game";

// Equal-size deliveries keep the first prototype focused on resource demand.
export const GUILD_CONTRACTS: readonly { name: string; cost: Partial<Hand> }[] = [
  { name: "Harvest provisions", cost: { wheat: 2, sheep: 1 } },
  { name: "Mason supplies", cost: { brick: 2, ore: 1 } },
  { name: "Shipwright order", cost: { wood: 2, sheep: 1 } },
  { name: "Foundry fuel", cost: { ore: 2, wood: 1 } },
  { name: "Weaver shipment", cost: { sheep: 2, wheat: 1 } },
  { name: "Village stores", cost: { wheat: 1, wood: 1, brick: 1 } },
  { name: "Harbor repairs", cost: { wood: 1, brick: 1, ore: 1 } },
  { name: "Market caravan", cost: { sheep: 1, wheat: 1, ore: 1 } },
];

export function guildPoints(deliveries = 0) {
  return Math.min(2, Math.floor(deliveries / 2));
}
