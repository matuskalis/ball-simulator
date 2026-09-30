import { describe, expect, it } from "vitest";
import { createRng } from "../src/sim/rng";

const take = (seed: number, count: number) => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng());
};

describe("createRng", () => {
  it("replays the same sequence for the same seed", () => {
    expect(take(7, 100)).toEqual(take(7, 100));
  });

  it("matches the reference sequence, so a change to the generator changes every video and fails here", () => {
    expect(take(1, 5)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849]);
    expect(take(42, 5)).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423]);
  });

  it("gives different streams for different seeds", () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it("stays in [0, 1)", () => {
    for (const value of take(123, 20_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is roughly uniform: mean near 0.5 and every tenth of the range is used", () => {
    const values = take(99, 20_000);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
    const buckets = new Array(10).fill(0);
    for (const value of values) buckets[Math.floor(value * 10)] += 1;
    for (const count of buckets) expect(count).toBeGreaterThan(1800);
  });

  it("collapses seeds that share their low 32 bits: 0, fractions and 2^32 + 1 all behave like 1", () => {
    const one = take(1, 10);
    expect(take(0, 10)).toEqual(one);
    expect(take(1.9, 10)).toEqual(one);
    expect(take(2 ** 32 + 1, 10)).toEqual(one);
  });

  it("wraps negative seeds through unsigned 32-bit arithmetic", () => {
    expect(take(-1, 10)).toEqual(take(2 ** 32 - 1, 10));
  });
});
