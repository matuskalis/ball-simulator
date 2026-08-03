export type ArenaKind = "circle" | "rings" | "box";

export type Instrument = "piano" | "square" | "sine" | "bell" | "pluck";

export interface Arena {
  kind: ArenaKind;
  /** Radius of the outer wall in px. Ignored by `box`. */
  radius: number;
  /** Outer wall is cut into this many arc segments (only meaningful with effects.breakWalls). */
  segments: number;
  /** `box` only: inner width/height in px. */
  boxWidth: number;
  boxHeight: number;
  /** `rings` only. */
  ringCount: number;
  ringSpacing: number;
  /** Angular size of the escape gap in each ring, degrees. */
  ringGapDegrees: number;
  /** Ring rotation in degrees per second. */
  ringSpeed: number;
  /** Flip rotation direction on every other ring. */
  ringAlternate: boolean;
}

export interface Physics {
  gravity: number;
  restitution: number;
  ballRadius: number;
  maxSpeed: number;
  ballCollisions: boolean;
}

export interface Effects {
  /** px added to the ball radius per bounce. */
  growOnBounce: number;
  /** Solve `growOnBounce` so the ball fills the arena on its last bounce. Overrides growOnBounce. */
  growToFillAtEnd: boolean;
  /** velocity multiplier per bounce. 1 = off. */
  speedUpOnBounce: number;
  /** new balls spawned per bounce. 0 = off. */
  spawnOnBounce: number;
  /** ball freezes where it lands (accumulation). */
  stickOnBounce: boolean;
  /** wall segments / rings are destroyed when hit or passed. */
  breakWalls: boolean;
  /** trail length in frames. 0 = off. */
  trailLength: number;
  /** ball changes palette colour on every bounce. */
  colorCycle: boolean;
  maxBalls: number;
}

export interface Music {
  enabled: boolean;
  /** Built-in melody name, an array of MIDI note numbers, or a path to a .mid file. */
  melody: string | number[];
  instrument: Instrument;
  volume: number;
  noteSeconds: number;
}

export interface Style {
  background: string;
  palette: string[];
  wallColor: string;
  glow: boolean;
  showCounter: boolean;
  title: string;
}

export interface Scene {
  name: string;
  preset: string;
  seed: number;
  fps: number;
  width: number;
  height: number;
  durationSeconds: number;
  ballCount: number;
  launchSpeed: number;
  arena: Arena;
  physics: Physics;
  effects: Effects;
  music: Music;
  style: Style;
}

/** What the Remotion composition receives. */
export type SceneProps = {
  scene: Scene;
  audioFile: string | null;
  [key: string]: unknown;
};

export const DEFAULT_SCENE: Scene = {
  name: "untitled",
  preset: "classic",
  seed: 1,
  fps: 60,
  width: 1080,
  height: 1920,
  durationSeconds: 20,
  ballCount: 1,
  launchSpeed: 900,
  arena: {
    kind: "circle",
    radius: 430,
    segments: 48,
    boxWidth: 900,
    boxHeight: 1500,
    ringCount: 12,
    ringSpacing: 34,
    ringGapDegrees: 40,
    ringSpeed: 45,
    ringAlternate: true,
  },
  physics: {
    gravity: 2600,
    restitution: 1,
    ballRadius: 22,
    maxSpeed: 2600,
    ballCollisions: true,
  },
  effects: {
    growOnBounce: 0,
    growToFillAtEnd: false,
    speedUpOnBounce: 1,
    spawnOnBounce: 0,
    stickOnBounce: false,
    breakWalls: false,
    trailLength: 0,
    colorCycle: true,
    maxBalls: 200,
  },
  music: {
    enabled: true,
    melody: "fur-elise",
    instrument: "piano",
    volume: 0.7,
    noteSeconds: 0.55,
  },
  style: {
    background: "#05050b",
    palette: ["#ff2e88", "#ffd23f", "#3fe0d0", "#7b5bff", "#ff7a3f", "#4dff88"],
    wallColor: "#ffffff",
    glow: true,
    showCounter: false,
    title: "",
  },
};
