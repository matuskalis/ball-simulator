import { readFileSync } from "node:fs";
import { loadMelody } from "../audio/loadMelody";
import { resolveScene, validateScene } from "../scene/resolve";
import { solveGrowth } from "../scene/solveGrowth";
import { simulate } from "../sim/simulate";

const scenePath = process.argv[2];
if (!scenePath) {
  console.error("usage: npm run validate -- scenes/<file>.json");
  process.exit(1);
}

const scene = solveGrowth(resolveScene(JSON.parse(readFileSync(scenePath, "utf8"))));
const problems = validateScene(scene);

if (scene.music.enabled) {
  try {
    loadMelody(scene.music.melody);
  } catch (error) {
    problems.push((error as Error).message);
  }
}

if (problems.length > 0) {
  console.error("INVALID");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const { frames, bounceSeconds, bursts } = simulate(scene);
const last = frames[frames.length - 1];
console.log("VALID");
console.log(`  preset        ${scene.preset}`);
console.log(`  duration      ${scene.durationSeconds}s @ ${scene.fps}fps (${frames.length} frames, ${scene.width}x${scene.height})`);
console.log(`  arena         ${scene.arena.kind} radius ${scene.arena.radius}`);
console.log(`  bounces       ${last.bounces} total, ${bounceSeconds.length} audible notes`);
console.log(`  balls         ${scene.ballCount} at start, ${last.balls.length} at the end`);

if (scene.effects.growOnBounce > 0 || scene.effects.growToFillAtEnd) {
  const arenaRadius = scene.arena.kind === "box" ? Math.min(scene.arena.boxWidth, scene.arena.boxHeight) / 2 : scene.arena.radius;
  const fill = Math.round((last.balls[0].r / arenaRadius) * 100);
  console.log(`  growth        ${scene.effects.growOnBounce}px per bounce, ends at radius ${last.balls[0].r} (${fill}% of the arena)`);
}

if (scene.arena.kind === "rings") {
  if (!scene.effects.breakWalls) {
    console.log(`  rings         ${scene.arena.ringCount} rings, they stay (effects.breakWalls is off)`);
  } else {
    const lastBurst = bursts[bursts.length - 1];
    const when = lastBurst ? `${(lastBurst.frame / scene.fps).toFixed(1)}s` : "never";
    console.log(`  rings         ${bursts.length}/${scene.arena.ringCount} destroyed, last one at ${when}`);
    if (bursts.length < scene.arena.ringCount) {
      console.log("  NOTE: the ball never cleared every ring. Widen arena.ringGapDegrees, lower arena.ringCount, or extend durationSeconds.");
    }
  }
}
if (last.bounces < 8) console.log("  WARNING: very few bounces, the video will feel empty. Raise gravity or launchSpeed, or shrink the arena.");
if (last.balls.length >= scene.effects.maxBalls) console.log("  NOTE: hit effects.maxBalls, the arena saturates before the end.");
