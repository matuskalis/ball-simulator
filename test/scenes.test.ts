import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMelody } from "../src/audio/loadMelody";
import type { DeepPartial } from "../src/scene/presets";
import { resolveScene, validateScene } from "../src/scene/resolve";
import { solveGrowth } from "../src/scene/solveGrowth";
import type { Scene } from "../src/scene/types";
import golden from "./fixtures/golden.json";
import { goldenFor, type Golden } from "./helpers/golden";
import { readScene, shippedScenes } from "./helpers/scenes";

const files = shippedScenes();

describe("the scenes the repository ships", () => {
  it("has a golden record for every scene file and none for files that are gone", () => {
    expect(Object.keys(golden).sort()).toEqual(files);
  });

  it("gives every scene its own name, because the name decides the output file", () => {
    const names = files.map((file) => readScene(file).name);
    expect(new Set(names).size).toBe(files.length);
  });

  it.each(files)("%s is valid, names its own file and uses a melody that loads", (file) => {
    const raw = readScene(file);
    expect(raw.name).toBe(basename(file, ".json"));
    const scene = solveGrowth(resolveScene(raw as DeepPartial<Scene>));
    expect(validateScene(scene)).toEqual([]);
    expect(() => loadMelody(scene.music.melody)).not.toThrow();
  });
});

describe("golden output", () => {
  // If this fails after a change you meant to make, run `npm run golden`, read the diff, and commit it.
  // Every changed line is a scene whose video or audio is no longer what it was.
  it.each(files)("%s still produces the recorded simulation and audio", (file) => {
    expect(goldenFor(file)).toEqual((golden as Record<string, Golden>)[file]);
  });
});
