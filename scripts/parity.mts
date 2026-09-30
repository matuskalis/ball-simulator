// Proves that the simulation Node runs for the audio and the one headless Chromium runs for the frames agree.
//
//   npm run parity                 every scene in scenes/
//   npm run parity -- swarm pit    only scenes whose path contains one of the words
//
// For each scene it hashes the complete simulation result (every frame, note time and ring burst) in Node and
// inside the Chromium that Remotion renders with, and exits 1 if any pair differs.
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveScene } from "../src/scene/resolve";
import type { DeepPartial } from "../src/scene/presets";
import { solveGrowth } from "../src/scene/solveGrowth";
import type { Scene } from "../src/scene/types";
import { goldenFor } from "../test/helpers/golden";
import { ROOT, readScene, shippedScenes } from "../test/helpers/scenes";

const filters = process.argv.slice(2);
const files = shippedScenes().filter((file) => filters.length === 0 || filters.some((word) => file.includes(word)));
if (files.length === 0) {
  console.error(`no scene matches ${filters.join(", ")}`);
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), "ballsim-parity-"));
const serveUrl = await bundle({ entryPoint: join(ROOT, "scripts/parity-entry.tsx") });
const browser = await openBrowser("chrome", {});
let differing = 0;
let userAgent = "";

try {
  for (const file of files) {
    const scene = solveGrowth(resolveScene(readScene(file) as DeepPartial<Scene>));
    const nodeDigest = goldenFor(file).sim;
    let browserDigest = "";
    const inputProps = { scene, label: file };
    const composition = await selectComposition({ serveUrl, id: "Parity", inputProps, puppeteerInstance: browser });
    await renderStill({
      composition,
      serveUrl,
      output: join(scratch, "still.png"),
      inputProps,
      puppeteerInstance: browser,
      onBrowserLog: (log) => {
        const match = /^PARITY \S+ (\w+) (.*)$/.exec(log.text);
        if (match) [, browserDigest, userAgent] = match;
      },
    });
    const same = nodeDigest === browserDigest;
    if (!same) differing += 1;
    console.log(`${same ? "same" : "DIFFERENT"}  ${file}  node ${nodeDigest}  chromium ${browserDigest}`);
  }
} finally {
  await browser.close({ silent: true });
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`\nnode ${process.version} (V8 ${process.versions.v8})`);
console.log(userAgent);
console.log(`${files.length - differing} of ${files.length} scenes give the same simulation in Node and in Chromium`);
process.exit(differing === 0 ? 0 : 1);
