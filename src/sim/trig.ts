/**
 * cos and sin that return the same bits on every JavaScript engine.
 *
 * `Math.cos` and `Math.sin` may differ in the last bit between engines, and they do: Node 24 (V8 13.6) and
 * Chrome 149 disagree by one ulp on about 3% of angles. A launch angle becomes a ball velocity directly, so
 * one differing bit puts the audio simulation (Node) and the frame simulation (Chromium) on different
 * trajectories, and a bouncing ball amplifies that until the notes no longer match the picture.
 *
 * This version works in exact BigInt fixed point (192 fractional bits) and rounds once at the end, so it is
 * bit-identical everywhere and equals the correctly rounded result. Accurate for |angle| below 2^40.
 */

const FRACTION_BITS = 192n;
const ONE = 1n << FRACTION_BITS;
const SCALE = Number(ONE);

/** pi / 2 scaled by 2^192. The tests recompute it from Machin's formula. */
export const HALF_PI_FIXED = 0x1921fb54442d18469898cc51701b839a252049c1114cf98e8n;

const view = new DataView(new ArrayBuffer(8));

/** Exact fixed-point value of a finite, non-negative double. */
function toFixed(value: number): bigint {
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
  const shift = (exponent === 0 ? -1074 : exponent - 1075) + Number(FRACTION_BITS);
  return shift >= 0 ? mantissa << BigInt(shift) : mantissa >> BigInt(-shift);
}

/** Taylor series for |r| <= pi/4, in fixed point. */
function taylor(r: bigint): { sin: bigint; cos: bigint } {
  const r2 = (r * r) >> FRACTION_BITS;
  let sin = r;
  let term = r;
  for (let n = 3n; term !== 0n; n += 2n) {
    term = -((term * r2) >> FRACTION_BITS) / (n * (n - 1n));
    sin += term;
  }
  let cos = ONE;
  term = ONE;
  for (let n = 2n; term !== 0n; n += 2n) {
    term = -((term * r2) >> FRACTION_BITS) / (n * (n - 1n));
    cos += term;
  }
  return { sin, cos };
}

const toDouble = (fixed: bigint) => Number(fixed) / SCALE;

export function cosSin(angle: number): [cos: number, sin: number] {
  const fixed = toFixed(Math.abs(angle));
  const quarterTurns = (fixed + HALF_PI_FIXED / 2n) / HALF_PI_FIXED;
  const { sin, cos } = taylor(fixed - quarterTurns * HALF_PI_FIXED);

  const turn = Number(quarterTurns % 4n);
  let sinFixed = turn === 0 ? sin : turn === 1 ? cos : turn === 2 ? -sin : -cos;
  const cosFixed = turn === 0 ? cos : turn === 1 ? -sin : turn === 2 ? -cos : sin;
  if (angle < 0) sinFixed = -sinFixed;
  return [toDouble(cosFixed), toDouble(sinFixed)];
}
