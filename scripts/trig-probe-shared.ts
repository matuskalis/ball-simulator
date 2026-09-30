import { createRng } from "../src/sim/rng";

export const ANGLES = 200_000;

/** The angles launch() can produce: uniform in [0, 2 pi), from a fixed seed so every engine sees the same ones. */
export function measure(): { cos: number[]; sin: number[] } {
  const rng = createRng(99);
  const cos: number[] = [];
  const sin: number[] = [];
  for (let i = 0; i < ANGLES; i += 1) {
    const angle = rng() * Math.PI * 2;
    cos.push(Math.cos(angle));
    sin.push(Math.sin(angle));
  }
  return { cos, sin };
}
