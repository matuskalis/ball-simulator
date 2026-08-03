import { simulate } from "../sim/simulate";
import type { Scene } from "./types";

const withGrowth = (scene: Scene, growOnBounce: number): Scene => ({
  ...scene,
  effects: { ...scene.effects, growOnBounce },
});

const finalRadius = (scene: Scene, growth: number): number => {
  const { frames } = simulate(withGrowth(scene, growth));
  return frames[frames.length - 1].balls[0].r;
};

/**
 * Picks the smallest `growOnBounce` that still fills the arena, so the ball arrives at the wall near
 * the end rather than long before it. Growth changes the bounce count, which changes the growth
 * needed, so this bisects on the measured final radius instead of solving a formula.
 */
export function solveGrowth(scene: Scene): Scene {
  if (!scene.effects.growToFillAtEnd) return scene;

  const arenaRadius = scene.arena.kind === "box" ? Math.min(scene.arena.boxWidth, scene.arena.boxHeight) / 2 : scene.arena.radius;
  const target = arenaRadius * 0.96;

  let low = 0;
  let high = 2;
  while (high < 200 && finalRadius(scene, high) < target) high *= 2;

  for (let step = 0; step < 10; step += 1) {
    const middle = (low + high) / 2;
    if (finalRadius(scene, middle) >= target) high = middle;
    else low = middle;
  }

  return withGrowth(scene, Math.round(high * 1000) / 1000);
}
