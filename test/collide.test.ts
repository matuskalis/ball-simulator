import { describe, expect, it } from "vitest";
import { collidePair, reflect, type Body } from "../src/sim/collide";

const body = (overrides: Partial<Body> = {}): Body => ({ x: 0, y: 0, vx: 0, vy: 0, r: 10, frozen: false, ...overrides });
const speedSquared = (b: Body) => b.vx * b.vx + b.vy * b.vy;

describe("reflect", () => {
  it("reverses the normal component and keeps the sliding component", () => {
    // a floor has inward normal (0, -1) in screen coordinates, and vy > 0 means moving down into it
    const ball = { vx: 300, vy: 400 };
    const dot = reflect(ball, 0, -1, 1);
    expect(dot).toBe(-400);
    expect(ball).toEqual({ vx: 300, vy: -400 });
  });

  it("scales the whole velocity by the restitution, sliding part included", () => {
    const ball = { vx: 300, vy: 400 };
    reflect(ball, 0, -1, 0.5);
    expect(ball).toEqual({ vx: 150, vy: -200 });
  });

  it("preserves speed for any wall angle when restitution is 1", () => {
    for (let degrees = 0; degrees < 360; degrees += 23) {
      const angle = (degrees * Math.PI) / 180;
      const ball = { vx: 512, vy: -187 };
      const before = Math.hypot(ball.vx, ball.vy);
      reflect(ball, Math.cos(angle), Math.sin(angle), 1);
      expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(before, 9);
    }
  });

  it("returns a positive value for a ball moving away from the wall", () => {
    expect(reflect({ vx: 0, vy: -50 }, 0, -1, 1)).toBe(50);
  });
});

describe("collidePair", () => {
  it("reports no contact and changes nothing when the balls are apart", () => {
    const a = body({ x: 0, vx: 100 });
    const b = body({ x: 25, vx: -100 });
    expect(collidePair(a, b, 1)).toBe(false);
    expect(a).toEqual(body({ x: 0, vx: 100 }));
    expect(b).toEqual(body({ x: 25, vx: -100 }));
  });

  it("does not count balls that only touch", () => {
    expect(collidePair(body({ x: 0 }), body({ x: 20 }), 1)).toBe(false);
  });

  it("swaps the velocities of equal masses in a head-on elastic hit", () => {
    const a = body({ x: 0, vx: 100 });
    const b = body({ x: 19, vx: -40 });
    expect(collidePair(a, b, 1)).toBe(true);
    expect(a.vx).toBeCloseTo(-40, 12);
    expect(b.vx).toBeCloseTo(100, 12);
  });

  it("conserves momentum and kinetic energy when elastic, in any direction", () => {
    const a = body({ x: 0, y: 0, vx: 210, vy: -90 });
    const b = body({ x: 11, y: 14, vx: -60, vy: 30 });
    const momentum = { x: a.vx + b.vx, y: a.vy + b.vy };
    const energy = speedSquared(a) + speedSquared(b);
    expect(collidePair(a, b, 1)).toBe(true);
    expect(a.vx + b.vx).toBeCloseTo(momentum.x, 9);
    expect(a.vy + b.vy).toBeCloseTo(momentum.y, 9);
    expect(speedSquared(a) + speedSquared(b)).toBeCloseTo(energy, 6);
  });

  it("keeps the tangential velocity of both balls", () => {
    const a = body({ x: 0, y: 0, vx: 0, vy: 50 });
    const b = body({ x: 19, y: 0, vx: -30, vy: -70 });
    collidePair(a, b, 1);
    expect(a.vy).toBe(50);
    expect(b.vy).toBe(-70);
  });

  it("shrinks the approach speed by the restitution and still conserves momentum", () => {
    const a = body({ x: 0, vx: 100 });
    const b = body({ x: 19, vx: 0 });
    collidePair(a, b, 0.5);
    expect(b.vx - a.vx).toBeCloseTo(50, 12);
    expect(a.vx + b.vx).toBeCloseTo(100, 12);
  });

  it("pushes overlapping balls apart until they just touch, each moving half", () => {
    const a = body({ x: 0 });
    const b = body({ x: 12 });
    collidePair(a, b, 1);
    expect(b.x - a.x).toBeCloseTo(20, 12);
    expect(a.x).toBeCloseTo(-4, 12);
    expect(b.x).toBeCloseTo(16, 12);
  });

  it("separates balls that overlap but are already moving apart, without an impulse", () => {
    const a = body({ x: 0, vx: -10 });
    const b = body({ x: 12, vx: 10 });
    expect(collidePair(a, b, 1)).toBe(true);
    expect(a.vx).toBe(-10);
    expect(b.vx).toBe(10);
    expect(b.x - a.x).toBeCloseTo(20, 12);
  });

  it("treats a frozen ball as an immovable wall and bounces the mover off it", () => {
    const pile = body({ x: 0, frozen: true });
    const lander = body({ x: 15, vx: -80 });
    expect(collidePair(pile, lander, 1)).toBe(true);
    expect(pile).toEqual(body({ x: 0, frozen: true }));
    expect(lander.x).toBeCloseTo(20, 12);
    expect(lander.vx).toBeCloseTo(80, 12);
  });

  it("does the same with the frozen ball second, and applies the restitution to the mover", () => {
    const lander = body({ x: 0, vx: 80 });
    const pile = body({ x: 15, frozen: true });
    collidePair(lander, pile, 0.5);
    expect(pile.x).toBe(15);
    expect(lander.x).toBeCloseTo(-5, 12);
    expect(lander.vx).toBeCloseTo(-40, 12);
  });

  it("copes with two balls at the same point instead of dividing by zero", () => {
    const a = body({ x: 5, y: 5 });
    const b = body({ x: 5, y: 5 });
    expect(collidePair(a, b, 1)).toBe(true);
    for (const value of [a.x, a.y, b.x, b.y, a.vx, a.vy, b.vx, b.vy]) expect(Number.isFinite(value)).toBe(true);
  });
});
