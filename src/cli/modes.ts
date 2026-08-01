import { MELODY_NAMES } from "../audio/melodies";
import { PRESETS } from "../scene/presets";
import { DEFAULT_SCENE } from "../scene/types";

console.log("PRESETS");
for (const [name, preset] of Object.entries(PRESETS)) {
  console.log(`  ${name.padEnd(15)} ${preset.description}`);
}

console.log("\nARENAS      circle, rings, box");
console.log("INSTRUMENTS piano, square, sine, bell, pluck");
console.log(`MELODIES    ${MELODY_NAMES.join(", ")}  (or a .mid path, or an array of MIDI note numbers)`);

console.log("\nDEFAULT SCENE");
console.log(JSON.stringify(DEFAULT_SCENE, null, 2));
