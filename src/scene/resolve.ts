import { ARENA_KINDS, DEFAULT_SCENE, INSTRUMENTS, type Scene } from "./types";
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

const describe = (value: unknown) => (Array.isArray(value) ? "an array" : value === null ? "null" : `a ${typeof value}`);

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

const hint = (key: string, known: string[]) => {
  const close = known.find((candidate) => editDistance(key.toLowerCase(), candidate.toLowerCase()) <= 2);
  return close ? `, did you mean "${close}"?` : "";
};

/**
 * `merge` keeps keys the engine has never heard of, so a typo would otherwise look like it worked and change
 * nothing. Compares a merged scene with the defaults and names every unknown field and every wrong type.
 */
function shapeProblems(value: Record<string, unknown>, template: Record<string, unknown>, path: string, problems: string[]) {
  for (const [key, actual] of Object.entries(value)) {
    const where = path ? `${path}.${key}` : key;
    if (!Object.hasOwn(template, key)) {
      problems.push(`unknown field "${where}"${hint(key, Object.keys(template))}`);
      continue;
    }
    const expected = template[key];
    if (isPlainObject(expected)) {
      if (isPlainObject(actual)) shapeProblems(actual, expected, where, problems);
      else problems.push(`${where} must be an object, got ${describe(actual)}`);
    } else if (where === "music.melody") {
      const notes = Array.isArray(actual) && actual.every((note) => typeof note === "number");
      if (typeof actual !== "string" && !notes) problems.push(`${where} must be a melody name, a .mid path or an array of MIDI note numbers, got ${describe(actual)}`);
    } else if (Array.isArray(expected)) {
      const itemType = typeof expected[0];
      if (!Array.isArray(actual) || actual.some((item) => typeof item !== itemType)) problems.push(`${where} must be an array of ${itemType}s, got ${describe(actual)}`);
    } else if (typeof actual !== typeof expected || (typeof actual === "number" && !Number.isFinite(actual))) {
      problems.push(`${where} must be ${typeof expected === "number" ? "a finite number" : `a ${typeof expected}`}, got ${describe(actual)}`);
    }
  }
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
  shapeProblems(scene as unknown as Record<string, unknown>, DEFAULT_SCENE as unknown as Record<string, unknown>, "", problems);
  if (problems.length > 0) return problems;

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

  if (scene.fps > 0 && scene.durationSeconds > 0 && Math.round(scene.durationSeconds * scene.fps) < 1) {
    problems.push("durationSeconds is shorter than one frame");
  }
  if (scene.durationSeconds > 180) problems.push("durationSeconds above 180 makes renders very slow");
  if (!ARENA_KINDS.includes(scene.arena.kind)) problems.push(`arena.kind must be one of ${ARENA_KINDS.join(", ")}, got "${scene.arena.kind}"`);
  if (!INSTRUMENTS.includes(scene.music.instrument)) problems.push(`music.instrument must be one of ${INSTRUMENTS.join(", ")}, got "${scene.music.instrument}"`);
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
