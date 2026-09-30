#!/usr/bin/env node
// Regenerates the pictures in docs/ from real renders made with the project's own `npm run make`.
// Nothing here is drawn by hand: every frame is the output of the same pipeline a user runs, rendered at
// one third of the scene size (360x640 instead of 1080x1920) and cut with ffmpeg.
//
//   node scripts/readme-assets.mjs              everything, a few minutes
//   node scripts/readme-assets.mjs sheet        only the named parts: hero, sheet, example, sound
//
// Needs ffmpeg on the PATH and a monospace font (set FONT to a .ttf or .ttc path to override the default).
// Run it from the repository root. Scratch files go to out/readme-assets, which git ignores.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const WORK = join(ROOT, "out/readme-assets");
const DOCS = join(ROOT, "docs");

const SCALE = "0.3333";
const CONCURRENCY = "2";
const BACKGROUND = "0x05050b";
const SHEET_BACKGROUND = "0x0d0d15";
const FONT =
  process.env.FONT ??
  ["/System/Library/Fonts/Menlo.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"].find((path) => existsSync(path));

/** Four windows of six seconds, sampled at 15 fps (every fourth frame of the 60 fps render). */
const HERO = [
  { scene: "scenes/viral/04-growing-ball-escape.json", from: 180 },
  { scene: "scenes/viral/03-tetris-growth.json", from: 1140 },
  { scene: "scenes/infinite-loop.json", from: 0 },
  { scene: "scenes/viral/07-rainbow-trail.json", from: 600 },
];

/** One frame of one scene per preset, in the order the README lists them. */
const SHEET = [
  { scene: "scenes/viral/02b-speed-demon-streak.json", frame: 900 },
  { scene: "scenes/viral/03-tetris-growth.json", frame: 1080 },
  { scene: "scenes/infinite-loop.json", frame: 162 },
  { scene: "scenes/accumulation.json", frame: 1188 },
  { scene: "scenes/viral/01-wall-breaker.json", frame: 1188 },
  { scene: "scenes/viral/05-gauntlet.json", frame: 450 },
  { scene: "scenes/viral/06-spiral-hypnosis.json", frame: 828 },
  { scene: "scenes/viral/07-rainbow-trail.json", frame: 720 },
  { scene: "scenes/swarm.json", frame: 180 },
  { scene: "scenes/pit.json", frame: 540 },
];

const EXAMPLE = { scene: "scenes/purple-escape.json", frame: 420 };
const SOUND = { scene: "scenes/readme-demo.json" };

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`failed: ${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
    process.exit(1);
  }
  return result.stdout;
}

const ffmpeg = (...args) => run("ffmpeg", ["-v", "error", "-y", ...args]);

/** Renders through `npm run make`. `flags` are passed on to `remotion render`. */
function make(scene, flags, out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, ".."), { recursive: true });
  run("npm", ["run", "make", "--silent", "--", scene, `--scale=${SCALE}`, `--concurrency=${CONCURRENCY}`, ...flags, `--out=${out}`]);
}

const still = (scene, frame, dir) => {
  make(scene, ["--no-audio", `--frames=${frame}`, "--image-format=png"], dir);
  return join(dir, readdirSync(dir).find((name) => name.endsWith(".png")));
};

const meta = (scene) => JSON.parse(readFileSync(join(ROOT, scene), "utf8"));

const text = (value, size, color, y) =>
  `drawtext=fontfile=${FONT}:text='${value}':fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}`;

function hero() {
  const inputs = [];
  const chains = [];
  HERO.forEach(({ scene, from }, index) => {
    const dir = join(WORK, `hero-${index}`);
    const frames = Array.from({ length: 90 }, (_, step) => from + 4 * step).join(",");
    make(scene, ["--no-audio", `--frames=${frames}`, "--image-format=png"], dir);
    const { name, preset, seed } = meta(scene);
    inputs.push("-framerate", "15", "-pattern_type", "glob", "-i", join(dir, "element-*.png"));
    chains.push(
      `[${index}:v]scale=200:356:flags=lanczos,pad=206:396:3:0:color=${BACKGROUND},` +
        `${text(name, 11, "white", 362)},${text(`${preset}  seed ${seed}`, 10, "0x8e8ea0", 378)}[p${index}]`,
    );
  });
  const stacked = HERO.map((_, index) => `[p${index}]`).join("");
  const graph =
    `${chains.join(";")};${stacked}hstack=inputs=${HERO.length},split[a][b];` +
    `[a]palettegen=max_colors=64:stats_mode=diff[palette];[b][palette]paletteuse=dither=none:diff_mode=rectangle`;
  ffmpeg(...inputs, "-filter_complex", graph, "-loop", "0", join(DOCS, "hero.gif"));
}

function sheet() {
  const inputs = [];
  const chains = [];
  SHEET.forEach(({ scene, frame }, index) => {
    const png = still(scene, frame, join(WORK, `sheet-${index}`));
    const { name, preset, seed } = meta(scene);
    inputs.push("-i", png);
    chains.push(
      `[${index}:v]pad=372:730:6:0:color=${SHEET_BACKGROUND},` +
        `${text(preset, 28, "white", 652)},${text(name === preset ? `seed ${seed}` : `${name}  seed ${seed}`, 21, "0x8e8ea0", 692)}[c${index}]`,
    );
  });
  const perRow = SHEET.length / 2;
  const row = (from) =>
    `${SHEET.slice(from, from + perRow).map((_, offset) => `[c${from + offset}]`).join("")}hstack=inputs=${perRow}`;
  const graph = `${chains.join(";")};${row(0)}[top];${row(perRow)}[bottom];[top][bottom]vstack=inputs=2`;
  ffmpeg(...inputs, "-filter_complex", graph, "-frames:v", "1", join(DOCS, "presets.png"));
}

function example() {
  copyFileSync(still(EXAMPLE.scene, EXAMPLE.frame, join(WORK, "example")), join(DOCS, "example-frame.png"));
}

function sound() {
  const raw = join(WORK, "sound-raw.mp4");
  make(SOUND.scene, ["--frames=0-359"], raw);
  ffmpeg(
    "-i", raw,
    "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "64k", "-ac", "1",
    "-movflags", "+faststart",
    join(DOCS, "demo-with-sound.mp4"),
  );
}

if (!FONT) {
  console.error("no monospace font found, set FONT to a .ttf or .ttc file");
  process.exit(1);
}
mkdirSync(DOCS, { recursive: true });
mkdirSync(WORK, { recursive: true });

const parts = { hero, sheet, example, sound };
const wanted = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(parts);
for (const part of wanted) {
  if (!parts[part]) {
    console.error(`unknown part "${part}", choose from ${Object.keys(parts).join(", ")}`);
    process.exit(1);
  }
  const started = Date.now();
  parts[part]();
  console.log(`${part}: done in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

for (const file of ["hero.gif", "presets.png", "example-frame.png", "demo-with-sound.mp4"]) {
  const path = join(DOCS, file);
  if (existsSync(path)) console.log(`${file}: ${(statSync(path).size / 1024).toFixed(0)} KB`);
}
