import { describe, expect, it } from "vitest";
import { PRESETS, PRESET_NAMES, type DeepPartial } from "../src/scene/presets";
import { resolveScene, validateScene } from "../src/scene/resolve";
import { DEFAULT_SCENE, type Scene } from "../src/scene/types";

/** Scene files are untrusted JSON, so the tests feed the validator things the types would forbid. */
const check = (input: unknown) => validateScene(resolveScene(input as DeepPartial<Scene>));

describe("resolveScene", () => {
  it("falls back to the classic preset on top of the default scene", () => {
    const scene = resolveScene({});
    expect(scene.preset).toBe("classic");
    expect(scene.effects.speedUpOnBounce).toBe(1.005);
    expect(scene.physics.gravity).toBe(2600);
    expect(scene.width).toBe(1080);
    expect(scene.height).toBe(1920);
    expect(scene.fps).toBe(60);
  });

  it("puts the preset under the overrides: the scene wins, the preset fills the rest", () => {
    const scene = resolveScene({ preset: "growth", physics: { ballRadius: 30 } });
    expect(scene.physics.ballRadius).toBe(30);
    expect(scene.effects.growOnBounce).toBe(2.4);
    expect(scene.physics.gravity).toBe(2600);
  });

  it("merges nested groups instead of replacing them", () => {
    const scene = resolveScene({ arena: { radius: 300 } });
    expect(scene.arena.radius).toBe(300);
    expect(scene.arena.segments).toBe(48);
    expect(scene.arena.kind).toBe("circle");
  });

  it("replaces arrays wholesale", () => {
    expect(resolveScene({ style: { palette: ["#ffffff"] } }).style.palette).toEqual(["#ffffff"]);
    expect(resolveScene({ music: { melody: [60, 62] } }).music.melody).toEqual([60, 62]);
  });

  it("ignores fields set to undefined", () => {
    expect(resolveScene({ seed: undefined }).seed).toBe(1);
  });

  it("records the preset it used", () => {
    expect(resolveScene({ preset: "swarm" }).preset).toBe("swarm");
  });

  it("names every preset when the requested one does not exist", () => {
    expect(() => resolveScene({ preset: "bouncy" })).toThrow(/Unknown preset "bouncy".*classic.*pit/);
  });

  it("leaves its input, the defaults and the presets untouched", () => {
    const input = { preset: "escape", arena: { ringCount: 4 }, style: { palette: ["#123456"] } };
    const snapshot = JSON.stringify({ input, DEFAULT_SCENE, PRESETS });
    resolveScene(input);
    expect(JSON.stringify({ input, DEFAULT_SCENE, PRESETS })).toBe(snapshot);
  });
});

describe("validateScene", () => {
  it.each(PRESET_NAMES)("accepts the %s preset as it ships", (preset) => {
    expect(check({ preset })).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ["a zero frame rate", { fps: 0 }, "fps must be a positive number, got 0"],
    ["a negative width", { width: -5 }, "width must be a positive number"],
    ["a duration under one frame", { durationSeconds: 0.004 }, "durationSeconds is shorter than one frame"],
    ["a duration over three minutes", { durationSeconds: 200 }, "durationSeconds above 180"],
    ["no balls", { ballCount: 0 }, "ballCount must be at least 1"],
    ["more balls than the cap", { ballCount: 300 }, "ballCount exceeds effects.maxBalls"],
    ["a restitution above 1.2", { physics: { restitution: 1.5 } }, "physics.restitution should be in (0, 1.2]"],
    ["a restitution of zero", { physics: { restitution: 0 } }, "physics.restitution should be in (0, 1.2]"],
    ["a ball with no size", { physics: { ballRadius: 0 } }, "physics.ballRadius must be a positive number"],
    ["a negative speed cap", { physics: { maxSpeed: -1 } }, "physics.maxSpeed must be a positive number"],
    ["a speed-up below 1", { effects: { speedUpOnBounce: 0.9 } }, "slows the ball to a stop"],
    ["a ball cap of zero", { effects: { maxBalls: 0 } }, "effects.maxBalls must be a positive number"],
    ["an empty palette", { style: { palette: [] } }, "style.palette needs at least one colour"],
    ["an arena wider than the frame", { arena: { radius: 700 } }, "arena.radius 700 does not fit the 1080x1920 frame (max 520)"],
    ["a box wider than the frame", { preset: "pit", arena: { boxWidth: 1200 } }, "arena.boxWidth is wider than the frame"],
    ["a box taller than the frame", { preset: "pit", arena: { boxHeight: 2000 } }, "arena.boxHeight is taller than the frame"],
    ["rings that leave no centre", { preset: "escape", arena: { ringCount: 20 } }, "leaves only -250px of open centre"],
    ["a gap that is too narrow", { preset: "escape", arena: { ringGapDegrees: 5 } }, "arena.ringGapDegrees should be between 8 and 180"],
    ["a gap that is too wide", { preset: "escape", arena: { ringGapDegrees: 200 } }, "arena.ringGapDegrees should be between 8 and 180"],
    ["a ball bigger than the arena", { physics: { ballRadius: 250 } }, "physics.ballRadius is too large for the arena"],
  ])("rejects %s", (_label, input, message) => {
    expect(check(input).join("\n")).toContain(message);
  });

  it("does not apply the ring rules to a scene without rings", () => {
    expect(check({ arena: { ringCount: 99, ringGapDegrees: 1 } })).toEqual([]);
  });

  describe("fields the engine does not know", () => {
    it("names a misspelt group and suggests the right one", () => {
      expect(check({ phyiscs: { gravity: 9000 } })).toEqual(['unknown field "phyiscs", did you mean "physics"?']);
    });

    it("names a misspelt field inside a group", () => {
      expect(check({ physics: { gravty: 1 } })).toEqual(['unknown field "physics.gravty", did you mean "gravity"?']);
      expect(check({ effects: { growOnBounc: 2 } })).toEqual(['unknown field "effects.growOnBounc", did you mean "growOnBounce"?']);
    });

    it("does not guess when nothing is close", () => {
      expect(check({ banana: 1 })).toEqual(['unknown field "banana"']);
    });

    it("lists every unknown field, not only the first", () => {
      expect(check({ one: 1, physics: { two: 2 } }).sort()).toEqual(['unknown field "one"', 'unknown field "physics.two"']);
    });

    it("does not treat inherited object keys as known", () => {
      expect(check({ toString: 1 })).toEqual(['unknown field "toString"']);
    });
  });

  describe("values of the wrong type", () => {
    it.each<[string, unknown, string]>([
      ["a string for a number", { physics: { gravity: "fast" } }, "physics.gravity must be a finite number, got a string"],
      ["a string for a duration", { durationSeconds: "20" }, "durationSeconds must be a finite number, got a string"],
      ["NaN", { physics: { gravity: NaN } }, "physics.gravity must be a finite number"],
      ["Infinity", { launchSpeed: Infinity }, "launchSpeed must be a finite number"],
      ["a string for a boolean", { effects: { breakWalls: "yes" } }, "effects.breakWalls must be a boolean, got a string"],
      ["a number for a string", { style: { title: 5 } }, "style.title must be a string, got a number"],
      ["a string for the palette", { style: { palette: "red" } }, "style.palette must be an array of strings, got a string"],
      ["numbers in the palette", { style: { palette: [1, 2] } }, "style.palette must be an array of strings, got an array"],
      ["a number for a group", { arena: 5 }, "arena must be an object, got a number"],
      ["null for a group", { music: null }, "music must be an object, got null"],
      ["a number for the melody", { music: { melody: 5 } }, "music.melody must be a melody name"],
      ["a text note in a melody array", { music: { melody: ["C4"] } }, "music.melody must be a melody name"],
    ])("rejects %s", (_label, input, message) => {
      expect(check(input).join("\n")).toContain(message);
    });

    it("accepts a melody name, a path and an array of note numbers", () => {
      expect(check({ music: { melody: "canon-in-d" } })).toEqual([]);
      expect(check({ music: { melody: "songs/tune.mid" } })).toEqual([]);
      expect(check({ music: { melody: [60, 64, 67] } })).toEqual([]);
    });
  });

  describe("names that must come from a fixed list", () => {
    it("rejects an arena kind the engine cannot draw", () => {
      expect(check({ arena: { kind: "hexagon" } })).toEqual(['arena.kind must be one of circle, rings, box, got "hexagon"']);
    });

    it("rejects an instrument that would silently play as piano", () => {
      expect(check({ music: { instrument: "kazoo" } })).toEqual(['music.instrument must be one of piano, square, sine, bell, pluck, got "kazoo"']);
    });
  });

  it("reports shape problems on their own, so a wrong type cannot crash the range checks", () => {
    expect(() => check({ style: { palette: "red" }, fps: 0, physics: null })).not.toThrow();
    expect(check({ style: { palette: "red" }, fps: 0 })).toEqual(["style.palette must be an array of strings, got a string"]);
  });
});
