import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "../..");

/** Every scene file the repository ships, relative to the repository root. */
export const shippedScenes = (): string[] =>
  ["scenes", "scenes/viral"].flatMap((folder) =>
    readdirSync(join(ROOT, folder))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => `${folder}/${name}`),
  );

export const readScene = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(ROOT, file), "utf8"));
