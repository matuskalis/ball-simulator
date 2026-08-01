import { DEFAULT_SCENE, type Scene } from "./types";
import { PRESETS, PRESET_NAMES, type DeepPartial } from "./presets";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function merge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] = isPlainObject(value) && isPlainObject(current) ? merge(current, value) : value;
  }
  return out as T;
}

export function resolveScene(input: DeepPartial<Scene>): Scene {
  const presetName = input.preset ?? DEFAULT_SCENE.preset;
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown preset "${presetName}". Available: ${PRESET_NAMES.join(", ")}`);
  }
  const scene = merge(merge(DEFAULT_SCENE, preset.patch), input);
  scene.preset = presetName;
  return scene;
}

/** Returns human-readable problems. Empty array means the scene is renderable. */
export function validateScene(scene: Scene): string[] {
  const problems: string[] = [];
  const positive = (value: number, label: string) => {
    if (!Number.isFinite(value) || value <= 0) problems.push(`${label} must be a positive number, got ${value}`);
  };

  positive(scene.fps, "fps");
  positive(scene.width, "width");
  positive(scene.height, "height");
  positive(scene.durationSeconds, "durationSeconds");
  positive(scene.physics.ballRadius, "physics.ballRadius");
  positive(scene.physics.maxSpeed, "physics.maxSpeed");
  positive(scene.effects.maxBalls, "effects.maxBalls");

  if (scene.durationSeconds > 180) problems.push("durationSeconds above 180 makes renders very slow");
  if (scene.ballCount < 1) problems.push("ballCount must be at least 1");
  if (scene.ballCount > scene.effects.maxBalls) problems.push("ballCount exceeds effects.maxBalls");
  if (scene.physics.restitution <= 0 || scene.physics.restitution > 1.2) {
    problems.push("physics.restitution should be in (0, 1.2]; 1 keeps the ball bouncing forever");
  }
  if (scene.effects.speedUpOnBounce < 1) problems.push("effects.speedUpOnBounce below 1 slows the ball to a stop");
  if (scene.style.palette.length === 0) problems.push("style.palette needs at least one colour");

  const maxRadius = Math.min(scene.width, scene.height) / 2 - 20;
  if (scene.arena.kind !== "box" && scene.arena.radius > maxRadius) {
    problems.push(`arena.radius ${scene.arena.radius} does not fit the ${scene.width}x${scene.height} frame (max ${Math.floor(maxRadius)})`);
  }
  if (scene.arena.kind === "box") {
    if (scene.arena.boxWidth > scene.width) problems.push("arena.boxWidth is wider than the frame");
    if (scene.arena.boxHeight > scene.height) problems.push("arena.boxHeight is taller than the frame");
  }
  if (scene.arena.kind === "rings") {
    const innermost = scene.arena.radius - scene.arena.ringCount * scene.arena.ringSpacing;
    if (innermost < scene.physics.ballRadius * 3) {
      problems.push(
        `arena.ringCount x arena.ringSpacing leaves only ${Math.floor(innermost)}px of open centre; reduce ringCount, ringSpacing, or physics.ballRadius`,
      );
    }
    if (scene.arena.ringGapDegrees < 8 || scene.arena.ringGapDegrees > 180) {
      problems.push("arena.ringGapDegrees should be between 8 and 180");
    }
  }
  if (scene.physics.ballRadius * 2 > (scene.arena.kind === "box" ? scene.arena.boxWidth : scene.arena.radius)) {
    problems.push("physics.ballRadius is too large for the arena");
  }

  return problems;
}
