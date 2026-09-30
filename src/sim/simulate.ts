import type { Scene } from "../scene/types";
import { collidePair, reflect } from "./collide";
import { createRng } from "./rng";
import { cosSin } from "./trig";

export interface BallState {
  x: number;
  y: number;
  r: number;
  c: number;
  frozen: boolean;
}

export interface RingState {
  radius: number;
  angle: number;
  gap: number;
  alive: boolean;
}

export interface FrameState {
  balls: BallState[];
  rings: RingState[];
  segments: boolean[];
  bounces: number;
}

/** A ring that was just passed through, so the renderer can blow it apart. */
export interface RingBurst {
  frame: number;
  radius: number;
  colorIndex: number;
}

export interface SimResult {
  frames: FrameState[];
  /** Time in seconds of every bounce that should trigger a note. */
  bounceSeconds: number[];
  bursts: RingBurst[];
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  c: number;
  frozen: boolean;
  age: number;
}

const SUBSTEPS = 4;
/** Contacts slower than this are resting jitter, not a real hit: reflect but do not fire effects or notes. */
const MIN_BOUNCE_SPEED = 55;
/** A freshly spawned ball cannot stick to the pile until it has actually flown, otherwise a blocked
 *  spawn point freezes every new ball on contact and the arena saturates in a single frame. */
const MIN_STICK_AGE = 0.12;
const MIN_NOTE_GAP = 0.045;
const MAX_NOTES = 3000;
const TWO_PI = Math.PI * 2;

const angularDistance = (a: number, b: number) => {
  const d = (((a - b + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI - Math.PI;
  return Math.abs(d);
};

export function simulate(scene: Scene): SimResult {
  const rng = createRng(scene.seed);
  const cx = scene.width / 2;
  const cy = scene.height / 2;
  const { arena, physics, effects, style } = scene;
  const paletteSize = Math.max(1, style.palette.length);
  const totalFrames = Math.round(scene.durationSeconds * scene.fps);
  const dt = 1 / (scene.fps * SUBSTEPS);
  const gapRad = (arena.ringGapDegrees * Math.PI) / 180;
  /** A growing ball is allowed to fill the arena completely; that moment is the payoff. */
  const maxBallRadius = (arena.kind === "box" ? Math.min(arena.boxWidth, arena.boxHeight) / 2 : arena.radius) * 0.98;

  const launch = (x: number, y: number, speed: number, c: number): Ball => {
    const [cos, sin] = cosSin(rng() * TWO_PI);
    return { x, y, vx: cos * speed, vy: sin * speed, r: physics.ballRadius, c, frozen: false, age: 0 };
  };

  const balls: Ball[] = [];
  for (let i = 0; i < scene.ballCount; i += 1) {
    const spread = scene.ballCount === 1 ? 0 : arena.radius * 0.5;
    const [cos, sin] = cosSin((i / scene.ballCount) * TWO_PI);
    balls.push(launch(cx + cos * spread, cy + sin * spread, scene.launchSpeed, i % paletteSize));
  }

  const rings: RingState[] = [];
  if (arena.kind === "rings") {
    for (let i = 0; i < arena.ringCount; i += 1) {
      rings.push({
        radius: arena.radius - (i + 1) * arena.ringSpacing,
        angle: rng() * TWO_PI,
        gap: gapRad,
        alive: true,
      });
    }
  }

  const segmentCount = Math.max(1, Math.round(arena.segments));
  const segments: boolean[] = new Array(segmentCount).fill(true);
  const wallBreakable = effects.breakWalls && arena.kind === "circle";

  const frames: FrameState[] = [];
  const bounceSeconds: number[] = [];
  const bursts: RingBurst[] = [];
  let bounceCount = 0;
  let frameIndex = 0;
  let time = 0;

  const recordNote = () => {
    bounceCount += 1;
    if (bounceSeconds.length >= MAX_NOTES) return;
    const last = bounceSeconds[bounceSeconds.length - 1];
    if (last !== undefined && time - last < MIN_NOTE_GAP) return;
    bounceSeconds.push(time);
  };

  const spawnFrom = (ball: Ball) => {
    if (balls.length >= effects.maxBalls) return;
    const speed = Math.max(scene.launchSpeed * 0.6, Math.hypot(ball.vx, ball.vy));
    for (let i = 0; i < effects.spawnOnBounce && balls.length < effects.maxBalls; i += 1) {
      const origin = effects.stickOnBounce ? { x: cx, y: cy - arena.radius * 0.25 } : { x: ball.x, y: ball.y };
      balls.push(launch(origin.x, origin.y, speed, Math.floor(rng() * paletteSize)));
    }
  };

  /** Reflect off a wall whose inward normal is (nx, ny), then apply every per-bounce effect. */
  const bounce = (ball: Ball, nx: number, ny: number) => {
    const dot = reflect(ball, nx, ny, physics.restitution);

    if (Math.abs(dot) < MIN_BOUNCE_SPEED) {
      if (effects.stickOnBounce) {
        ball.frozen = true;
        ball.vx = 0;
        ball.vy = 0;
        spawnFrom(ball);
      }
      return;
    }

    ball.vx *= effects.speedUpOnBounce;
    ball.vy *= effects.speedUpOnBounce;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > physics.maxSpeed) {
      ball.vx = (ball.vx / speed) * physics.maxSpeed;
      ball.vy = (ball.vy / speed) * physics.maxSpeed;
    }
    if (effects.growOnBounce > 0) {
      const grown = Math.min(maxBallRadius, ball.r + effects.growOnBounce);
      // The caller already placed the ball flush against the wall using its old radius, so growing
      // in place buries it and the next substep reads that as a second, phantom bounce.
      ball.x += nx * (grown - ball.r);
      ball.y += ny * (grown - ball.r);
      ball.r = grown;
    }
    if (effects.colorCycle) ball.c = (ball.c + 1) % paletteSize;
    spawnFrom(ball);
    if (effects.stickOnBounce) {
      ball.frozen = true;
      ball.vx = 0;
      ball.vy = 0;
    }
    recordNote();
  };

  const respawn = (ball: Ball) => {
    const fresh = launch(cx, cy - arena.radius * 0.25, scene.launchSpeed, Math.floor(rng() * paletteSize));
    ball.x = fresh.x;
    ball.y = fresh.y;
    ball.vx = fresh.vx;
    ball.vy = fresh.vy;
    ball.r = physics.ballRadius;
    ball.age = 0;
  };

  const collideOuterCircle = (ball: Ball) => {
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const dist = Math.hypot(dx, dy) || 1e-6;
    if (dist + ball.r <= arena.radius) return;

    const angle = ((Math.atan2(dy, dx) % TWO_PI) + TWO_PI) % TWO_PI;
    const index = Math.min(segmentCount - 1, Math.floor((angle / TWO_PI) * segmentCount));
    if (wallBreakable && !segments[index]) {
      if (dist - ball.r > arena.radius) respawn(ball);
      return;
    }
    if (wallBreakable) segments[index] = false;

    const nx = -dx / dist;
    const ny = -dy / dist;
    ball.x = cx + (dx / dist) * (arena.radius - ball.r);
    ball.y = cy + (dy / dist) * (arena.radius - ball.r);
    bounce(ball, nx, ny);
  };

  const collideBox = (ball: Ball) => {
    const left = cx - arena.boxWidth / 2;
    const right = cx + arena.boxWidth / 2;
    const top = cy - arena.boxHeight / 2;
    const bottom = cy + arena.boxHeight / 2;
    if (ball.x - ball.r < left) {
      ball.x = left + ball.r;
      bounce(ball, 1, 0);
    } else if (ball.x + ball.r > right) {
      ball.x = right - ball.r;
      bounce(ball, -1, 0);
    }
    if (ball.y - ball.r < top) {
      ball.y = top + ball.r;
      bounce(ball, 0, 1);
    } else if (ball.y + ball.r > bottom) {
      ball.y = bottom - ball.r;
      bounce(ball, 0, -1);
    }
  };

  const collideRings = (ball: Ball) => {
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const angle = Math.atan2(dy, dx);
    const radial = (ball.vx * dx + ball.vy * dy) / dist;

    for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
      const ring = rings[ringIndex];
      if (!ring.alive) continue;
      const inGap = angularDistance(angle, ring.angle) < ring.gap / 2;
      if (inGap) {
        // Destroy as the ball enters the gap, not once it has fully cleared: the ring keeps rotating,
        // so by the time the ball is past, the gap has usually moved off and the pass is never recorded.
        if (effects.breakWalls && dist + ball.r > ring.radius && radial > 0) {
          ring.alive = false;
          bursts.push({ frame: frameIndex, radius: ring.radius, colorIndex: ringIndex });
        }
        continue;
      }
      const nxOut = dx / dist;
      const nyOut = dy / dist;
      if (dist < ring.radius && dist + ball.r > ring.radius && radial > 0) {
        ball.x = cx + nxOut * (ring.radius - ball.r);
        ball.y = cy + nyOut * (ring.radius - ball.r);
        bounce(ball, -nxOut, -nyOut);
        return;
      }
      if (dist > ring.radius && dist - ball.r < ring.radius && radial < 0) {
        ball.x = cx + nxOut * (ring.radius + ball.r);
        ball.y = cy + nyOut * (ring.radius + ball.r);
        bounce(ball, nxOut, nyOut);
        return;
      }
    }
  };

  const collideBalls = () => {
    const stuck: Ball[] = [];
    const count = balls.length;
    for (let i = 0; i < count; i += 1) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j += 1) {
        const b = balls[j];
        if (a.frozen && b.frozen) continue;
        if (!collidePair(a, b, physics.restitution)) continue;

        if (effects.stickOnBounce && a.frozen !== b.frozen) {
          const lander = a.frozen ? b : a;
          if (lander.age > MIN_STICK_AGE) stuck.push(lander);
        }
      }
    }

    for (const ball of stuck) {
      if (ball.frozen) continue;
      ball.frozen = true;
      ball.vx = 0;
      ball.vy = 0;
      spawnFrom(ball);
      recordNote();
    }
  };

  for (let frame = 0; frame < totalFrames; frame += 1) {
    frameIndex = frame;
    for (let step = 0; step < SUBSTEPS; step += 1) {
      time += dt;
      for (let i = 0; i < rings.length; i += 1) {
        const direction = arena.ringAlternate && i % 2 === 1 ? -1 : 1;
        rings[i].angle += ((arena.ringSpeed * Math.PI) / 180) * direction * dt;
      }
      for (const ball of balls) {
        if (ball.frozen) continue;
        ball.age += dt;
        ball.vy += physics.gravity * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (arena.kind === "box") {
          collideBox(ball);
        } else {
          if (arena.kind === "rings") collideRings(ball);
          collideOuterCircle(ball);
        }
      }
      if (physics.ballCollisions) collideBalls();
    }

    frames.push({
      balls: balls.map((b) => ({
        x: Math.round(b.x * 10) / 10,
        y: Math.round(b.y * 10) / 10,
        r: Math.round(b.r * 10) / 10,
        c: b.c,
        frozen: b.frozen,
      })),
      rings: rings.map((r) => ({ radius: r.radius, angle: r.angle, gap: r.gap, alive: r.alive })),
      segments: wallBreakable ? segments.slice() : [],
      bounces: bounceCount,
    });
  }

  return { frames, bounceSeconds, bursts };
}

const cache = new Map<string, SimResult>();

/** Same scene JSON always returns the same timeline, so audio and video stay in sync. */
export function simulateCached(scene: Scene): SimResult {
  const key = JSON.stringify(scene);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = simulate(scene);
  cache.set(key, result);
  return result;
}
