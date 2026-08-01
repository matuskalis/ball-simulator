import { readFileSync } from "node:fs";
import { MELODIES, MELODY_NAMES } from "./melodies";
import { readMidiNotes } from "./midi";

/** Accepts a built-in melody name, a raw MIDI note array, or a path to a .mid file. */
export function loadMelody(melody: string | number[]): number[] {
  if (Array.isArray(melody)) {
    if (melody.length === 0) throw new Error("music.melody array is empty");
    return melody;
  }
  if (MELODIES[melody]) return MELODIES[melody];
  if (melody.toLowerCase().endsWith(".mid") || melody.toLowerCase().endsWith(".midi")) {
    return readMidiNotes(new Uint8Array(readFileSync(melody)));
  }
  throw new Error(`Unknown melody "${melody}". Built-ins: ${MELODY_NAMES.join(", ")}. Or pass a .mid path or a MIDI note array.`);
}
