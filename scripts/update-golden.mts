// Rewrites test/fixtures/golden.json from the current engine. Run it only after a change to the physics or
// the audio that you meant to make, and read the diff: every changed line is a video that now looks different.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { goldenFor } from "../test/helpers/golden";
import { ROOT, shippedScenes } from "../test/helpers/scenes";

const golden = Object.fromEntries(shippedScenes().map((file) => [file, goldenFor(file)]));
writeFileSync(join(ROOT, "test/fixtures/golden.json"), `${JSON.stringify(golden, null, 2)}\n`);
console.log(`wrote test/fixtures/golden.json for ${Object.keys(golden).length} scenes`);
