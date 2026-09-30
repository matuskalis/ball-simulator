import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PRESET_NAMES } from "../src/scene/presets";
import { ROOT } from "./helpers/scenes";

const folder = mkdtempSync(join(tmpdir(), "ballsim-cli-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs");
const run = (script: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [TSX, join(ROOT, "src/cli", script), ...args], { cwd: ROOT, encoding: "utf8" });
  return { status: result.status, out: result.stdout, err: result.stderr };
};
const sceneFile = (name: string, contents: unknown) => {
  const path = join(folder, name);
  writeFileSync(path, typeof contents === "string" ? contents : JSON.stringify(contents));
  return path;
};

describe("npm run validate", () => {
  it("accepts a good scene and reports what the render will contain", () => {
    const { status, out } = run("validate.ts", "scenes/classic-fur-elise.json");
    expect(status).toBe(0);
    expect(out).toMatch(/^VALID/);
    expect(out).toMatch(/preset\s+classic/);
    expect(out).toMatch(/duration\s+20s @ 60fps \(1200 frames, 1080x1920\)/);
    expect(out).toMatch(/bounces\s+32 total, 32 audible notes/);
  });

  it("rejects a misspelt field with a hint and exits non-zero", () => {
    const { status, err, out } = run("validate.ts", sceneFile("typo.json", { preset: "classic", phyiscs: { gravity: 5000 } }));
    expect(status).toBe(1);
    expect(err).toContain("INVALID");
    expect(err).toContain('unknown field "phyiscs", did you mean "physics"?');
    expect(out).not.toContain("VALID");
  });

  it("rejects a melody that does not exist", () => {
    const { status, err } = run("validate.ts", sceneFile("melody.json", { preset: "classic", music: { melody: "stairway" } }));
    expect(status).toBe(1);
    expect(err).toContain('Unknown melody "stairway"');
  });

  it("warns, without failing, when a scene is too sparse to be worth rendering", () => {
    const { status, out } = run("validate.ts", sceneFile("sparse.json", { preset: "classic", durationSeconds: 3, physics: { gravity: 0 }, launchSpeed: 100 }));
    expect(status).toBe(0);
    expect(out).toContain("WARNING: very few bounces");
  });

  it("does not call rings that stay by design a failure", () => {
    const { out } = run("validate.ts", "scenes/spiral.json");
    expect(out).toMatch(/rings\s+14 rings, they stay \(effects.breakWalls is off\)/);
    expect(out).not.toContain("never cleared");
  });

  it("says when the ball never clears every ring", () => {
    const { out } = run("validate.ts", "scenes/escape-rings.json");
    expect(out).toMatch(/rings\s+5\/10 destroyed/);
    expect(out).toContain("never cleared every ring");
  });

  it("prints usage when given no file", () => {
    const { status, err } = run("validate.ts");
    expect(status).toBe(1);
    expect(err).toContain("usage: npm run validate");
  });
});

describe("npm run modes", () => {
  it("lists every preset, arena, instrument and melody the validator accepts", () => {
    const out = execFileSync(process.execPath, [TSX, join(ROOT, "src/cli/modes.ts")], { cwd: ROOT, encoding: "utf8" });
    for (const preset of PRESET_NAMES) expect(out).toContain(preset);
    expect(out).toContain("ARENAS      circle, rings, box");
    expect(out).toContain("INSTRUMENTS piano, square, sine, bell, pluck");
    expect(out).toContain("fur-elise");
  });
});

describe("npm run make", () => {
  it("prints usage, including the flags it passes to Remotion, when given no file", () => {
    const { status, err } = run("make.ts");
    expect(status).toBe(1);
    expect(err).toContain("usage: npm run make");
    expect(err).toContain("--out=out/<name>.mp4");
    expect(err).toContain("--scale=0.25");
  });

  it("refuses to render a scene the validator would reject", () => {
    const { status, err } = run("make.ts", sceneFile("bad.json", { preset: "classic", physics: { gravity: "fast" } }));
    expect(status).toBe(1);
    expect(err).toContain("is not renderable");
    expect(err).toContain("physics.gravity must be a finite number");
  });
});
