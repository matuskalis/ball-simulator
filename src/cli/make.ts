import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve as resolvePath } from "node:path";
import { loadMelody } from "../audio/loadMelody";
import { assignNotes, encodeWav, renderNotes } from "../audio/synth";
import { resolveScene, validateScene } from "../scene/resolve";
import { solveGrowth } from "../scene/solveGrowth";
import { simulate } from "../sim/simulate";

const args = process.argv.slice(2);
const scenePath = args.find((a) => !a.startsWith("--"));
if (!scenePath) {
  console.error("usage: npm run make -- scenes/<file>.json [--out=out/<name>.mp4] [--no-audio] [--scale=0.25] [--frames=0-299] [other remotion render flags]");
  process.exit(1);
}

const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
/** Every flag make does not use itself goes to `remotion render`: --scale for a small preview, --frames for a short one. */
const remotionFlags = args.filter((a) => a.startsWith("--") && a !== "--no-audio" && !a.startsWith("--out="));

const scene = solveGrowth(resolveScene(JSON.parse(readFileSync(scenePath, "utf8"))));
if (scene.name === "untitled") scene.name = basename(scenePath).replace(/\.json$/, "");
if (scene.effects.growToFillAtEnd) console.log(`Solved effects.growOnBounce = ${scene.effects.growOnBounce}px per bounce to fill at the end`);

const problems = validateScene(scene);
if (problems.length > 0) {
  console.error(`Scene "${scene.name}" is not renderable:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

mkdirSync("out", { recursive: true });
mkdirSync("public", { recursive: true });

console.log(`Simulating ${scene.durationSeconds}s of "${scene.preset}" at ${scene.fps}fps...`);
const started = Date.now();
const { frames, bounceSeconds } = simulate(scene);
const lastFrame = frames[frames.length - 1];
console.log(
  `  ${bounceSeconds.length} notes, ${lastFrame.balls.length} balls at the end, ${lastFrame.bounces} bounces (${Date.now() - started}ms)`,
);

let audioFile: string | null = null;
if (scene.music.enabled && !flag("no-audio") && bounceSeconds.length > 0) {
  const melody = loadMelody(scene.music.melody);
  const samples = renderNotes(assignNotes(bounceSeconds, melody), scene.music.instrument, scene.music.noteSeconds, scene.music.volume, scene.durationSeconds);
  audioFile = `${scene.name}.wav`;
  writeFileSync(resolvePath("public", audioFile), encodeWav(samples));
  console.log(`  audio: public/${audioFile} (${scene.music.instrument}, ${melody.length}-note melody)`);
}

const propsPath = resolvePath("out", `${scene.name}.props.json`);
writeFileSync(propsPath, JSON.stringify({ scene, audioFile }, null, 2));

const output = option("out") ?? `out/${scene.name}.mp4`;
const result = spawnSync(
  resolvePath("node_modules/.bin/remotion"),
  ["render", "src/index.ts", "BallSim", output, `--props=${propsPath}`, "--codec=h264", ...remotionFlags],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`\nDone: ${output}`);
