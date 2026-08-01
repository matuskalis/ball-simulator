import type { Scene } from "./types";

/** A preset is a partial Scene merged on top of DEFAULT_SCENE. */
export type Preset = {
  description: string;
  patch: DeepPartial<Scene>;
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K];
};

export const PRESETS: Record<string, Preset> = {
  classic: {
    description: "One ball bouncing forever inside a circle. Plays the next note on every wall hit.",
    patch: {
      ballCount: 1,
      effects: { speedUpOnBounce: 1.005 },
    },
  },
  growth: {
    description: "Ball grows on every bounce until it fills the arena.",
    patch: {
      ballCount: 1,
      physics: { ballRadius: 14 },
      effects: { growOnBounce: 2.4, speedUpOnBounce: 1.002 },
    },
  },
  "infinite-loop": {
    description: "Every bounce clones the ball. Exponential multiplication until the arena is full.",
    patch: {
      ballCount: 1,
      physics: { ballRadius: 16, restitution: 0.98 },
      effects: { spawnOnBounce: 1, maxBalls: 260 },
    },
  },
  accumulation: {
    description: "Balls freeze where they land and pile up, tension builds as the arena fills.",
    patch: {
      ballCount: 1,
      physics: { ballRadius: 18, restitution: 0.85 },
      effects: { spawnOnBounce: 1, stickOnBounce: true, maxBalls: 240 },
    },
  },
  destruction: {
    description: "The wall is cut into segments and each hit destroys one. Escapees respawn in the centre.",
    patch: {
      ballCount: 1,
      physics: { ballRadius: 20 },
      effects: { breakWalls: true, speedUpOnBounce: 1.01 },
      arena: { segments: 64 },
    },
  },
  escape: {
    description: "Concentric rotating rings with gaps. The ball escapes ring by ring, each ring vanishes.",
    patch: {
      ballCount: 1,
      physics: { ballRadius: 16, gravity: 1500 },
      effects: { breakWalls: true },
      arena: { kind: "rings", ringCount: 10, ringSpacing: 34, ringGapDegrees: 42, ringSpeed: 50 },
    },
  },
  spiral: {
    description: "Many tightly packed slow rings, the ball corkscrews outward through the gaps.",
    patch: {
      ballCount: 1,
      physics: { ballRadius: 13, gravity: 1200 },
      effects: { breakWalls: false, trailLength: 26 },
      arena: { kind: "rings", ringCount: 14, ringSpacing: 24, ringGapDegrees: 30, ringSpeed: 22 },
    },
  },
  trail: {
    description: "Single fast ball with a long glowing trail, hypnotic light-painting look.",
    patch: {
      ballCount: 1,
      physics: { ballRadius: 15, gravity: 900 },
      launchSpeed: 1100,
      effects: { trailLength: 60, speedUpOnBounce: 1.004 },
    },
  },
  swarm: {
    description: "A crowd of balls colliding with each other inside the circle.",
    patch: {
      ballCount: 40,
      physics: { ballRadius: 20, restitution: 0.97 },
      effects: { colorCycle: false },
    },
  },
  pit: {
    description: "Rectangular pit instead of a circle. Balls rattle between four flat walls.",
    patch: {
      ballCount: 6,
      arena: { kind: "box" },
      physics: { ballRadius: 26 },
    },
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);
