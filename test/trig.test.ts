import { describe, expect, it } from "vitest";
import { createRng } from "../src/sim/rng";
import { HALF_PI_FIXED, cosSin } from "../src/sim/trig";
import reference from "./fixtures/trig-reference.json";

/** pi / 2 scaled by 2^192, from Machin's formula: pi = 16 atan(1/5) - 4 atan(1/239). */
function halfPiFromMachin(): bigint {
  const guard = 40n;
  const one = 1n << (192n + guard);
  const arctanInverse = (n: bigint) => {
    let term = one / n;
    let sum = term;
    for (let k = 1n; term !== 0n; k += 1n) {
      term /= n * n;
      const t = term / (2n * k + 1n);
      sum += k % 2n === 1n ? -t : t;
    }
    return sum;
  };
  const pi = 4n * (4n * arctanInverse(5n) - arctanInverse(239n));
  return pi / 2n >> guard;
}

const float = new Float64Array(1);
const bits = new BigInt64Array(float.buffer);
const ulpDistance = (a: number, b: number) => {
  float[0] = a;
  const x = bits[0];
  float[0] = b;
  const y = bits[0];
  return Number(x > y ? x - y : y - x);
};

describe("cosSin", () => {
  it("uses a pi/2 constant that matches an independent computation", () => {
    expect(HALF_PI_FIXED).toBe(halfPiFromMachin());
  });

  it("returns exact values at the axes", () => {
    expect(cosSin(0)).toEqual([1, 0]);
    expect(cosSin(Math.PI / 2)).toEqual([6.123233995736766e-17, 1]);
    expect(cosSin(Math.PI)).toEqual([-1, 1.2246467991473532e-16]);
    expect(cosSin(Math.PI * 2)).toEqual([1, -2.4492935982947064e-16]);
  });

  it(`equals the correctly rounded value on all ${reference.length} arbitrary-precision references`, () => {
    for (const [angle, cos, sin] of reference) {
      expect(cosSin(angle), `angle ${angle}`).toEqual([cos, sin]);
    }
  });

  it("is odd in sine and even in cosine", () => {
    for (const angle of [0.3, 1.2, 2.9, 4.4, 6.1]) {
      const [c, s] = cosSin(angle);
      expect(cosSin(-angle)).toEqual([c, -s]);
    }
  });

  it("stays within one ulp of Math.cos and Math.sin, which are not always correctly rounded", () => {
    const rng = createRng(2024);
    let identical = 0;
    const total = 3000;
    for (let i = 0; i < total; i += 1) {
      const angle = rng() * Math.PI * 2;
      const [c, s] = cosSin(angle);
      expect(ulpDistance(c, Math.cos(angle))).toBeLessThanOrEqual(1);
      expect(ulpDistance(s, Math.sin(angle))).toBeLessThanOrEqual(1);
      if (c === Math.cos(angle) && s === Math.sin(angle)) identical += 1;
    }
    expect(identical / total).toBeGreaterThan(0.85);
  });

  it("keeps cos^2 + sin^2 at 1 to within four units in the last place", () => {
    const rng = createRng(5);
    for (let i = 0; i < 500; i += 1) {
      const [c, s] = cosSin(rng() * Math.PI * 2);
      expect(Math.abs(c * c + s * s - 1)).toBeLessThan(4.5e-16);
    }
  });
});
