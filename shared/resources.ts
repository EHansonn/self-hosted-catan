export const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceNames = Record<Resource, string>;

export const DEFAULT_RESOURCE_NAMES: ResourceNames = {
  wood: "Wood",
  brick: "Brick",
  sheep: "Sheep",
  wheat: "Wheat",
  ore: "Ore",
};

const resourceNames: ResourceNames = { ...DEFAULT_RESOURCE_NAMES };
const reservedLogNames = new Set([
  "bank", "card", "cards", "city", "cities", "dev card", "dev cards",
  "development", "development card", "development cards", "knight", "knights",
  "largest army", "longest road", "monopoly", "road", "roads", "road building",
  "robber", "settlement", "settlements", "year of plenty",
]);

export function resolveResourceNames(
  env: Record<string, string | undefined>,
): ResourceNames {
  const names = { ...DEFAULT_RESOURCE_NAMES };
  const used = new Set<string>();
  for (const resource of RESOURCES) {
    const key = `RESOURCE_NAME_${resource.toUpperCase()}`;
    const name = (env[key] ?? names[resource]).trim();
    if (
      !/^[A-Za-z][A-Za-z0-9 -]{0,31}$/.test(name) ||
      reservedLogNames.has(name.toLowerCase()) ||
      RESOURCES.some((other) =>
        other !== resource && DEFAULT_RESOURCE_NAMES[other].toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error(`${key} must be a distinct name of 1–32 letters, numbers, spaces, or hyphens.`);
    if (used.has(name.toLowerCase()))
      throw new Error(`${key} duplicates another resource name.`);
    names[resource] = name;
    used.add(name.toLowerCase());
  }
  return names;
}

export function configureResourceNames(names: ResourceNames) {
  Object.assign(resourceNames, names);
}

export function getResourceNames(): ResourceNames {
  return { ...resourceNames };
}

export function resourceName(resource: Resource): string {
  return resourceNames[resource];
}

export function resourceFromName(name: string): Resource | undefined {
  const normalized = name.toLowerCase();
  return RESOURCES.find((resource) =>
    normalized === resource ||
    normalized === DEFAULT_RESOURCE_NAMES[resource].toLowerCase() ||
    normalized === resourceName(resource).toLowerCase() ||
    (resource === "brick" && normalized === "bricks"),
  );
}

export function formatResourceHand(
  hand: Partial<Record<Resource, number>>,
): string {
  return RESOURCES.filter((resource) => (hand[resource] || 0) > 0)
    .map((resource) => `${hand[resource]} ${resourceName(resource).toLowerCase()}`)
    .join(" and ");
}
