import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMelody } from "../src/audio/loadMelody";
import type { DeepPartial } from "../src/scene/presets";
import { resolveScene, validateScene } from "../src/scene/resolve";
import { solveGrowth } from "../src/scene/solveGrowth";
import { DEFAULT_SCENE, type Scene } from "../src/scene/types";
import { ROOT } from "./helpers/scenes";

const DOCS = ["README.md", "AGENTS.md", "docs/engine.md", "docs/determinism.md"];
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const scripts = Object.keys(JSON.parse(read("package.json")).scripts);

describe.each(["README.md", "AGENTS.md"])("the scene examples in %s", (file) => {
  const examples = [...read(file).matchAll(/```json\n([\s\S]*?)```/g)]
    .map((match) => JSON.parse(match[1]) as Record<string, unknown>)
    .filter((block) => typeof block.preset === "string");

  it("include at least one", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples.map((example) => [String(example.name ?? example.preset), example] as const))("%s validates as written", (_name, example) => {
    const scene = solveGrowth(resolveScene(example as DeepPartial<Scene>));
    expect(validateScene(scene)).toEqual([]);
    expect(() => loadMelody(scene.music.melody)).not.toThrow();
  });
});

describe("AGENTS.md", () => {
  const agents = read("AGENTS.md");

  it("lists every scene field in its field groups, so the contract cannot fall behind the schema", () => {
    const paragraph = agents.split("\n").find((line) => line.startsWith("Field groups:"));
    expect(paragraph).toBeDefined();
    const names = Object.entries(DEFAULT_SCENE).flatMap(([key, value]) =>
      typeof value === "object" && !Array.isArray(value) ? [key, ...Object.keys(value)] : [key],
    );
    for (const name of names) expect(paragraph, name).toMatch(new RegExp(`\\b${name}\\b`));
  });
});

describe.each(DOCS)("%s", (file) => {
  const text = read(file);

  it("only mentions npm scripts that exist", () => {
    for (const [, script] of text.matchAll(/npm run ([a-z][a-z:-]*)/g)) expect(scripts, script).toContain(script);
  });

  it("only links to files that exist", () => {
    const mentioned = [...text.matchAll(/`((?:scenes|docs|src|test|scripts)\/[\w./-]+\.(?:json|md|png|gif|mp4|ts|tsx|mts|mjs))`/g)].map((match) => match[1]);
    const linked = [...text.matchAll(/\]\(((?!https?:)[^)#\s]+)\)/g)].map((match) => join(dirname(file), match[1]));
    for (const path of [...mentioned, ...linked]) expect(existsSync(join(ROOT, path)), path).toBe(true);
  });

  it("has no em dashes", () => {
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });
});
