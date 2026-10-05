import { RESOURCES, type Resource } from "../shared/resources";

export type SpriteName =
  | Resource
  | "unknown"
  | "development"
  | "bank"
  | "bot"
  | "person"
  | "people"
  | "road"
  | "settlement"
  | "city"
  | "knight"
  | "route";

const sprites: SpriteName[] = [
  ...RESOURCES,
  "unknown",
  "development",
  "bank",
  "bot",
  "person",
  "people",
  "road",
  "settlement",
  "city",
  "knight",
  "route",
];

export function spriteBackgroundPosition(name: SpriteName) {
  const index = sprites.indexOf(name);
  return `${((index % 4) * 100) / 3}% ${
    (Math.floor(index / 4) * 100) / 3
  }%`;
}

export function spriteViewBox(name: SpriteName) {
  const index = sprites.indexOf(name);
  return `${index % 4} ${Math.floor(index / 4)} 1 1`;
}
