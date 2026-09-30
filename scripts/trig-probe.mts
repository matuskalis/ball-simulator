// How often do Math.cos and Math.sin in Node and in headless Chromium differ from the correctly rounded
// value, and from each other? The answer is why src/sim/trig.ts exists. About half a minute.
//
//   npm run probe:trig
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRng } from "../src/sim/rng";
import { cosSin } from "../src/sim/trig";
import { ANGLES, measure } from "./trig-probe-shared";
import { ROOT } from "../test/helpers/scenes";

const scratch = mkdtempSync(join(tmpdir(), "ballsim-trig-"));
const serveUrl = await bundle({ entryPoint: join(ROOT, "scripts/trig-probe-entry.tsx") });
const browser = await openBrowser("chrome", {});
let chromium: (ReturnType<typeof measure> & { userAgent: string }) | undefined;
try {
  const composition = await selectComposition({ serveUrl, id: "Probe", puppeteerInstance: browser });
  await renderStill({
    composition,
    serveUrl,
    output: join(scratch, "still.png"),
    puppeteerInstance: browser,
    onBrowserLog: (log) => {
      const match = /^TRIG (\{.*\})$/s.exec(log.text);
      if (match) chromium = JSON.parse(match[1]);
    },
  });
} finally {
  await browser.close({ silent: true });
  rmSync(scratch, { recursive: true, force: true });
}
if (!chromium) throw new Error("the browser returned nothing");

const node = measure();
const rng = createRng(99);
const exact = Array.from({ length: ANGLES }, () => cosSin(rng() * Math.PI * 2));

const float = new Float64Array(1);
const bits = new BigInt64Array(float.buffer);
const ulps = (a: number, b: number) => {
  float[0] = a;
  const x = bits[0];
  float[0] = b;
  return Number(x > bits[0] ? x - bits[0] : bits[0] - x);
};
const compare = (a: number[], b: number[]) => {
  let differ = 0;
  let worst = 0;
  a.forEach((value, i) => {
    if (value !== b[i]) {
      differ += 1;
      worst = Math.max(worst, ulps(value, b[i]));
    }
  });
  return `${String(differ).padStart(5)} (${((100 * differ) / a.length).toFixed(2)}%), at most ${worst} ulp`;
};

console.log(`${ANGLES} angles in [0, 2 pi), node ${process.version} (V8 ${process.versions.v8})\n`);
console.log("                      cos                                  sin");
console.log(`Node vs exact         ${compare(node.cos, exact.map((e) => e[0]))}   ${compare(node.sin, exact.map((e) => e[1]))}`);
console.log(`Chromium vs exact     ${compare(chromium.cos, exact.map((e) => e[0]))}   ${compare(chromium.sin, exact.map((e) => e[1]))}`);
console.log(`Node vs Chromium      ${compare(node.cos, chromium.cos)}   ${compare(node.sin, chromium.sin)}`);
console.log(`\nChromium: ${chromium.userAgent}`);
