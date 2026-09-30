import { describe, expect, it } from "vitest";
import type { DeepPartial } from "../src/scene/presets";
import { resolveScene } from "../src/scene/resolve";
import type { Scene } from "../src/scene/types";
import { simulate } from "../src/sim/simulate";

const FPS = 60;
const SUBSTEPS_PER_FRAME = 4;
const DT = 1 / (FPS * SUBSTEPS_PER_FRAME);
const CENTRE = { x: 540, y: 960 };

const scene = (input: DeepPartial<Scene>) => resolveScene({ preset: "classic", ...input });

/** One level of deep merge, enough for the scene groups (physics, effects, ...). */
const overlay = (base: DeepPartial<Scene>, patch: DeepPartial<Scene>): DeepPartial<Scene> => {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    const bothObjects = typeof value === "object" && value !== null && !Array.isArray(value) && typeof current === "object" && current !== null;
    out[key] = bothObjects ? { ...(current as object), ...value } : value;
  }
  return out as DeepPartial<Scene>;
};

/**
 * One ball, no gravity, perfectly elastic, launched from the exact centre. It then travels along a
 * diameter for ever, so the time of every bounce has a closed form. Default arena radius 430, ball radius 22.
 */
const onDiameter = (patch: DeepPartial<Scene> = {}) =>
  scene(
    overlay(
      {
        durationSeconds: 12,
        launchSpeed: 900,
        physics: { gravity: 0, restitution: 1 },
        effects: { speedUpOnBounce: 1 },
      },
      patch,
    ),
  );

const REACH = 430 - 22;

describe("free flight", () => {
  it("follows semi-implicit Euler at four substeps per frame, and frame f holds the state after substep 4(f + 1)", () => {
    const { frames } = simulate(scene({ durationSeconds: 0.5, launchSpeed: 0, physics: { gravity: 2600, restitution: 1 } }));
    for (const f of [0, 1, 5, 12, 29]) {
      const steps = SUBSTEPS_PER_FRAME * (f + 1);
      const expectedY = CENTRE.y + (2600 * DT * DT * steps * (steps + 1)) / 2;
      expect(frames[f].balls[0].x).toBe(CENTRE.x);
      expect(frames[f].balls[0].y).toBeCloseTo(expectedY, 1);
    }
  });

  it("drops to the wall in the time free fall predicts, to within two substeps", () => {
    const { bounceSeconds } = simulate(scene({ durationSeconds: 2, launchSpeed: 0, physics: { gravity: 2600, restitution: 1 } }));
    const analytic = Math.sqrt((2 * REACH) / 2600);
    expect(Math.abs(bounceSeconds[0] - analytic)).toBeLessThan(2 * DT);
  });

  it("stores positions and radii rounded to a tenth of a pixel", () => {
    const { frames } = simulate(onDiameter({ durationSeconds: 1 }));
    for (const frame of frames) {
      for (const ball of frame.balls) {
        expect(Math.round(ball.x * 10)).toBeCloseTo(ball.x * 10, 6);
        expect(Math.round(ball.y * 10)).toBeCloseTo(ball.y * 10, 6);
      }
    }
  });

  it("produces one frame per 1/fps and ends with the right count", () => {
    expect(simulate(scene({ durationSeconds: 2.5 })).frames).toHaveLength(150);
    expect(simulate(scene({ durationSeconds: 1, fps: 30 })).frames).toHaveLength(30);
  });
});

describe("wall bounce and note timing", () => {
  it("bounces off a circular wall on a diameter at times d, 3d, 5d... where d is the flight time to the wall", () => {
    const { bounceSeconds } = simulate(onDiameter());
    const leg = REACH / 900;
    expect(bounceSeconds.length).toBeGreaterThanOrEqual(12);
    bounceSeconds.forEach((time, k) => {
      const ideal = leg * (2 * k + 1);
      // each leg is rounded up to whole substeps, so the error can grow by one substep per bounce
      expect(time).toBeGreaterThanOrEqual(ideal - 1e-9);
      expect(time).toBeLessThanOrEqual(ideal + (k + 1) * DT + 1e-9);
    });
  });

  it("puts every note on a substep boundary", () => {
    const { bounceSeconds } = simulate(scene({ durationSeconds: 10 }));
    expect(bounceSeconds.length).toBeGreaterThan(5);
    for (const time of bounceSeconds) {
      const substeps = time / DT;
      expect(Math.abs(substeps - Math.round(substeps))).toBeLessThan(1e-6);
    }
  });

  it("scales the speed by the restitution on every hit, so a bounce at 0.3 leaves three audible notes", () => {
    // contact speeds are 900, 270, 81 and 24.3 px/s; the last is under the 55 px/s resting threshold
    const { bounceSeconds, frames } = simulate(onDiameter({ durationSeconds: 20, physics: { restitution: 0.3 } }));
    expect(bounceSeconds).toHaveLength(3);
    expect(frames[frames.length - 1].bounces).toBe(3);
    const legs = [REACH / 900, (2 * REACH) / 270, (2 * REACH) / 81];
    let ideal = 0;
    legs.forEach((leg, k) => {
      ideal += leg;
      expect(bounceSeconds[k]).toBeGreaterThanOrEqual(ideal - 1e-9);
      expect(bounceSeconds[k]).toBeLessThanOrEqual(ideal + (k + 1) * DT + 1e-9);
    });
  });

  it("reflects a contact slower than 55 px/s without a note, and the ball stays inside the arena", () => {
    const { bounceSeconds, frames } = simulate(onDiameter({ launchSpeed: 50, durationSeconds: 30 }));
    expect(bounceSeconds).toHaveLength(0);
    expect(frames[frames.length - 1].bounces).toBe(0);
    for (const frame of frames) {
      const { x, y, r } = frame.balls[0];
      expect(Math.hypot(x - CENTRE.x, y - CENTRE.y) + r).toBeLessThan(430 + 0.1);
    }
    const first = frames[0].balls[0];
    const last = frames[frames.length - 1].balls[0];
    expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeGreaterThan(0);
  });

  it("merges notes closer than 45 ms into one, but still counts every bounce", () => {
    const { bounceSeconds, frames } = simulate(scene({ preset: "infinite-loop", durationSeconds: 4, effects: { maxBalls: 40 } }));
    const finalBounces = frames[frames.length - 1].bounces;
    expect(finalBounces).toBeGreaterThan(bounceSeconds.length * 5);
    for (let i = 1; i < bounceSeconds.length; i += 1) {
      expect(bounceSeconds[i] - bounceSeconds[i - 1]).toBeGreaterThanOrEqual(0.045 - 1e-9);
    }
  });
});

describe("effects", () => {
  it("speeds the ball up by the factor on every bounce and stops at maxSpeed", () => {
    const fast = simulate(onDiameter({ effects: { speedUpOnBounce: 1.1 } })).bounceSeconds;
    // the second leg is a full diameter at 900 * 1.1
    expect(fast[1] - fast[0]).toBeGreaterThan((2 * REACH) / (900 * 1.1) - 1e-9);
    expect(fast[1] - fast[0]).toBeLessThan((2 * REACH) / (900 * 1.1) + 2 * DT);

    const capped = simulate(onDiameter({ effects: { speedUpOnBounce: 1.5 }, physics: { maxSpeed: 1000 } })).bounceSeconds;
    expect(capped[1] - capped[0]).toBeGreaterThan((2 * REACH) / 1000 - 1e-9);
    expect(capped[1] - capped[0]).toBeLessThan((2 * REACH) / 1000 + 2 * DT);
  });

  it("grows the ball by growOnBounce per bounce, and each growth step is exactly one counted bounce", () => {
    const { frames } = simulate(onDiameter({ durationSeconds: 8, effects: { growOnBounce: 5 } }));
    const last = frames[frames.length - 1];
    expect(last.bounces).toBeGreaterThan(3);
    expect(last.balls[0].r).toBeCloseTo(22 + 5 * last.bounces, 1);
  });

  it("lets a growing ball fill the arena to 98 percent and no further, without leaving it", () => {
    const { frames } = simulate(onDiameter({ durationSeconds: 15, effects: { growOnBounce: 40 } }));
    const last = frames[frames.length - 1].balls[0];
    expect(last.r).toBeCloseTo(430 * 0.98, 1);
    for (const frame of frames) {
      const { x, y, r } = frame.balls[0];
      expect(Math.hypot(x - CENTRE.x, y - CENTRE.y) + r).toBeLessThan(430 + 0.1);
    }
  });

  it("cycles the ball through the palette on each bounce when colorCycle is on", () => {
    const { frames } = simulate(onDiameter({ durationSeconds: 10, effects: { colorCycle: true }, style: { palette: ["#111111", "#222222", "#333333"] } }));
    const last = frames[frames.length - 1];
    expect(last.balls[0].c).toBe(last.bounces % 3);
  });

  it("keeps one colour when colorCycle is off", () => {
    const { frames } = simulate(onDiameter({ durationSeconds: 10, effects: { colorCycle: false } }));
    expect(new Set(frames.map((f) => f.balls[0].c)).size).toBe(1);
  });

  it("clones the ball on each bounce until maxBalls", () => {
    const { frames } = simulate(scene({ preset: "infinite-loop", durationSeconds: 8, effects: { maxBalls: 25 } }));
    const counts = frames.map((f) => f.balls.length);
    expect(counts[0]).toBeLessThanOrEqual(2);
    expect(Math.max(...counts)).toBe(25);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
  });

  it("freezes landed balls in place when stickOnBounce is on", () => {
    const { frames } = simulate(scene({ preset: "accumulation", durationSeconds: 10 }));
    const last = frames[frames.length - 1];
    const frozen = last.balls.map((ball, index) => ({ ball, index })).filter(({ ball }) => ball.frozen);
    expect(frozen.length).toBeGreaterThan(3);
    for (const { index } of frozen) {
      const firstFrozen = frames.findIndex((f) => f.balls[index]?.frozen);
      for (let f = firstFrozen; f < frames.length; f += 1) {
        expect(frames[f].balls[index].x).toBe(frames[firstFrozen].balls[index].x);
        expect(frames[f].balls[index].y).toBe(frames[firstFrozen].balls[index].y);
      }
    }
  });

  it("breaks one more wall segment on the first hit of each segment and never restores it", () => {
    const { frames } = simulate(scene({ preset: "destruction", durationSeconds: 12 }));
    const broken = frames.map((f) => f.segments.filter((alive) => !alive).length);
    expect(frames[0].segments).toHaveLength(64);
    expect(broken[broken.length - 1]).toBeGreaterThan(3);
    for (let i = 1; i < broken.length; i += 1) expect(broken[i]).toBeGreaterThanOrEqual(broken[i - 1]);
    expect(broken[broken.length - 1]).toBeLessThanOrEqual(frames[frames.length - 1].bounces);
  });
});

describe("box arena", () => {
  it("keeps every ball inside the box and bounces off all four walls", () => {
    const pit = scene({ preset: "pit", durationSeconds: 15, ballCount: 1, physics: { gravity: 0, ballCollisions: false } });
    const { frames, bounceSeconds } = simulate(pit);
    const { boxWidth, boxHeight } = pit.arena;
    const radius = pit.physics.ballRadius;
    // the ball moves 15 px per frame at 900 px/s, so "at the wall" means within one frame of travel
    const near = 20;
    let touched = { left: false, right: false, top: false, bottom: false };
    for (const frame of frames) {
      const { x, y } = frame.balls[0];
      expect(x).toBeGreaterThanOrEqual(CENTRE.x - boxWidth / 2 + radius - 0.1);
      expect(x).toBeLessThanOrEqual(CENTRE.x + boxWidth / 2 - radius + 0.1);
      expect(y).toBeGreaterThanOrEqual(CENTRE.y - boxHeight / 2 + radius - 0.1);
      expect(y).toBeLessThanOrEqual(CENTRE.y + boxHeight / 2 - radius + 0.1);
      touched = {
        left: touched.left || x < CENTRE.x - boxWidth / 2 + radius + near,
        right: touched.right || x > CENTRE.x + boxWidth / 2 - radius - near,
        top: touched.top || y < CENTRE.y - boxHeight / 2 + radius + near,
        bottom: touched.bottom || y > CENTRE.y + boxHeight / 2 - radius - near,
      };
    }
    expect(touched).toEqual({ left: true, right: true, top: true, bottom: true });
    expect(bounceSeconds.length).toBeGreaterThan(10);
  });
});

describe("ball to ball collisions", () => {
  const crowd = (ballCollisions: boolean) =>
    simulate(scene({ preset: "swarm", durationSeconds: 6, ballCount: 12, physics: { ballCollisions, gravity: 0 } })).frames;
  const deepestOverlap = (frames: ReturnType<typeof crowd>) => {
    let deepest = 0;
    for (const { balls } of frames) {
      for (let i = 0; i < balls.length; i += 1) {
        for (let j = i + 1; j < balls.length; j += 1) {
          const gap = Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y) - (balls[i].r + balls[j].r);
          deepest = Math.min(deepest, gap);
        }
      }
    }
    return -deepest;
  };

  it("keeps balls from sinking into each other when collisions are on", () => {
    expect(deepestOverlap(crowd(true))).toBeLessThan(2);
  });

  it("lets balls pass through each other when collisions are off", () => {
    expect(deepestOverlap(crowd(false))).toBeGreaterThan(10);
  });
});

describe("rings", () => {
  const ringScene = (breakWalls: boolean) =>
    scene({
      preset: "escape",
      seed: 11,
      durationSeconds: 12,
      arena: { ringCount: 4, ringSpacing: 60, ringGapDegrees: 90, ringSpeed: 40 },
      effects: { breakWalls },
    });

  it("destroys a ring when the ball enters its gap, records the burst, and the ring stays gone", () => {
    const { frames, bursts } = simulate(ringScene(true));
    expect(bursts.length).toBeGreaterThan(0);
    for (const burst of bursts) {
      const ring = burst.colorIndex;
      expect(frames[burst.frame].rings[ring].alive).toBe(false);
      if (burst.frame > 0) expect(frames[burst.frame - 1].rings[ring].alive).toBe(true);
      expect(frames[frames.length - 1].rings[ring].alive).toBe(false);
    }
  });

  it("bursts each ring at most once", () => {
    const { bursts } = simulate(ringScene(true));
    expect(new Set(bursts.map((b) => b.colorIndex)).size).toBe(bursts.length);
  });

  it("leaves every ring standing when breakWalls is off", () => {
    const { frames, bursts } = simulate(ringScene(false));
    expect(bursts).toHaveLength(0);
    expect(frames[frames.length - 1].rings.every((ring) => ring.alive)).toBe(true);
  });

  it("rotates alternate rings in opposite directions by ringSpeed degrees per second", () => {
    const { frames } = simulate(ringScene(false));
    const turned = (ring: number) => frames[59].rings[ring].angle - frames[0].rings[ring].angle;
    const perFrame = (40 * Math.PI) / 180 / FPS;
    expect(turned(0)).toBeCloseTo(perFrame * 59, 9);
    expect(turned(1)).toBeCloseTo(-perFrame * 59, 9);
    expect(turned(2)).toBeCloseTo(perFrame * 59, 9);
  });

  it("spaces the rings ringSpacing apart, starting one spacing inside the wall", () => {
    const { frames } = simulate(ringScene(false));
    expect(frames[0].rings.map((ring) => ring.radius)).toEqual([370, 310, 250, 190]);
  });
});

describe("determinism", () => {
  it("returns identical frames, notes and bursts for the same scene", () => {
    const input = scene({ preset: "escape", seed: 11, durationSeconds: 8 });
    expect(simulate(input)).toEqual(simulate(input));
  });

  it("changes when the seed changes", () => {
    const a = simulate(scene({ seed: 1, durationSeconds: 5 })).frames;
    const b = simulate(scene({ seed: 2, durationSeconds: 5 })).frames;
    expect(a[a.length - 1]).not.toEqual(b[b.length - 1]);
  });

  it("makes a short scene the exact prefix of a longer one, which is what lets --frames preview a scene", () => {
    const short = simulate(scene({ preset: "swarm", seed: 19, durationSeconds: 3 }));
    const long = simulate(scene({ preset: "swarm", seed: 19, durationSeconds: 6 }));
    expect(long.frames.slice(0, short.frames.length)).toEqual(short.frames);
    expect(long.bounceSeconds.slice(0, short.bounceSeconds.length)).toEqual(short.bounceSeconds);
  });
});
