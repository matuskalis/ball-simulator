import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadMelody } from "../src/audio/loadMelody";
import { MELODIES, MELODY_NAMES } from "../src/audio/melodies";

const folder = mkdtempSync(join(tmpdir(), "ballsim-melody-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

/** A one-track MIDI file with three quarter notes: 60, 62, 64. */
const smallMidi = () =>
  Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 24,
    0, 0x90, 60, 64, 0x60, 0x80, 60, 0,
    0, 0x90, 62, 64, 0x60, 0x80, 62, 0,
    0, 0x90, 64, 64,
    0, 0xff, 0x2f, 0x00,
  ]);

describe("loadMelody", () => {
  it("returns a built-in melody by name", () => {
    expect(loadMelody("fur-elise")).toBe(MELODIES["fur-elise"]);
  });

  it("passes a MIDI note array through", () => {
    expect(loadMelody([60, 64, 67])).toEqual([60, 64, 67]);
  });

  it("refuses an empty array", () => {
    expect(() => loadMelody([])).toThrow("empty");
  });

  it("names the built-ins when the melody is unknown", () => {
    expect(() => loadMelody("stairway")).toThrow(/Unknown melody "stairway".*fur-elise.*pentatonic/);
  });

  it("reads a .mid file by path, whatever the case of the extension", () => {
    const lower = join(folder, "tune.mid");
    const upper = join(folder, "TUNE.MIDI");
    writeFileSync(lower, smallMidi());
    writeFileSync(upper, smallMidi());
    expect(loadMelody(lower)).toEqual([60, 62, 64]);
    expect(loadMelody(upper)).toEqual([60, 62, 64]);
  });

  it("fails loudly on a path that is not there", () => {
    expect(() => loadMelody(join(folder, "missing.mid"))).toThrow();
  });
});

describe("built-in melodies", () => {
  it.each(MELODY_NAMES)("%s holds whole MIDI note numbers inside the piano range", (name) => {
    const notes = MELODIES[name];
    expect(notes.length).toBeGreaterThan(3);
    for (const note of notes) {
      expect(Number.isInteger(note)).toBe(true);
      expect(note).toBeGreaterThanOrEqual(21);
      expect(note).toBeLessThanOrEqual(108);
    }
  });
});
