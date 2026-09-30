import { describe, expect, it } from "vitest";
import type { DeepPartial } from "../src/scene/presets";
import { resolveScene } from "../src/scene/resolve";
import { solveGrowth } from "../src/scene/solveGrowth";
import type { Scene } from "../src/scene/types";
import { simulate } from "../src/sim/simulate";

const fillScene = (input: DeepPartial<Scene> = {}) =>
  resolveScene({
    preset: "growth",
    seed: 29,
    durationSeconds: 8,
    launchSpeed: 1000,
    physics: { gravity: 3000, ballRadius: 10 },
    effects: { growToFillAtEnd: true },
    ...input,
  });

const finalRadius = (scene: Scene) => {
  const { frames } = simulate(scene);
  return frames[frames.length - 1].balls[0].r;
};

describe("solveGrowth", () => {
  it("returns the very same scene when growToFillAtEnd is off", () => {
    const scene = resolveScene({ preset: "growth" });
    expect(solveGrowth(scene)).toBe(scene);
  });

  it("finds a growth per bounce that fills the circle by the last frame", () => {
    const solved = solveGrowth(fillScene());
    expect(solved.effects.growOnBounce).toBeGreaterThan(0);
    expect(finalRadius(solved)).toBeGreaterThanOrEqual(430 * 0.96);
    expect(finalRadius(solved)).toBeLessThanOrEqual(430 * 0.98 + 0.05);
  });

  it("rounds the answer to three decimals and keeps the flag so it can be solved again", () => {
    const solved = solveGrowth(fillScene());
    expect(Math.round(solved.effects.growOnBounce * 1000) / 1000).toBe(solved.effects.growOnBounce);
    expect(solved.effects.growToFillAtEnd).toBe(true);
  });

  it("does not modify the scene it was given", () => {
    const scene = fillScene();
    const before = JSON.stringify(scene);
    solveGrowth(scene);
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("gives the same answer every time", () => {
    expect(solveGrowth(fillScene()).effects.growOnBounce).toBe(solveGrowth(fillScene()).effects.growOnBounce);
  });

  it("fills a box by half of its shorter side", () => {
    const solved = solveGrowth(fillScene({ arena: { kind: "box", boxWidth: 900, boxHeight: 1500 }, durationSeconds: 12 }));
    expect(finalRadius(solved)).toBeGreaterThanOrEqual(450 * 0.96);
  });

  it("needs a gentler growth when it has longer to bounce", () => {
    const short = solveGrowth(fillScene({ durationSeconds: 6 })).effects.growOnBounce;
    const long = solveGrowth(fillScene({ durationSeconds: 14 })).effects.growOnBounce;
    expect(long).toBeLessThan(short);
  });
});
