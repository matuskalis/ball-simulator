import { describe, expect, it } from "vitest";
import { readMidiNotes } from "../src/audio/midi";

const vlq = (value: number): number[] => {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
};

const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** Each event is [delta ticks, ...bytes]. */
const track = (events: number[][]) => {
  const body = events.flatMap(([delta, ...bytes]) => [...vlq(delta), ...bytes]);
  return [...ascii("MTrk"), ...u32(body.length), ...body];
};

const midi = (...tracks: number[][]) =>
  new Uint8Array([...ascii("MThd"), ...u32(6), 0, 1, 0, tracks.length, 0x01, 0xe0, ...tracks.flat()]);

const END = [0, 0xff, 0x2f, 0x00];

describe("readMidiNotes", () => {
  it("returns the pitches of note-on events in order", () => {
    const file = midi(track([[0, 0x90, 60, 64], [96, 0x80, 60, 0], [0, 0x90, 64, 64], [96, 0x80, 64, 0], [0, 0x90, 67, 64], END]));
    expect(readMidiNotes(file)).toEqual([60, 64, 67]);
  });

  it("ignores note-on with velocity 0, which is how many files write note-off", () => {
    const file = midi(track([[0, 0x90, 60, 64], [48, 0x90, 60, 0], [0, 0x90, 62, 64], [48, 0x90, 62, 0], END]));
    expect(readMidiNotes(file)).toEqual([60, 62]);
  });

  it("follows running status, where later events omit the status byte", () => {
    const file = midi(track([[0, 0x90, 60, 64], [10, 62, 64], [10, 64, 64], [10, 65, 64], END]));
    expect(readMidiNotes(file)).toEqual([60, 62, 64, 65]);
  });

  it("skips meta events, sysex and the other channel messages without losing its place", () => {
    const file = midi(
      track([
        [0, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20],
        [0, 0xff, 0x03, 0x04, ...ascii("song")],
        [0, 0xf0, 0x03, 0x01, 0x02, 0xf7],
        [0, 0xc0, 0x05],
        [0, 0xb0, 0x07, 0x64],
        [0, 0xe0, 0x00, 0x40],
        [0, 0xd0, 0x30],
        [0, 0xa0, 60, 30],
        [0, 0x90, 72, 100],
        END,
      ]),
    );
    expect(readMidiNotes(file)).toEqual([72]);
  });

  it("reads multi-byte delta times", () => {
    const file = midi(track([[0, 0x90, 60, 64], [300, 0x90, 61, 64], [70000, 0x90, 62, 64], END]));
    expect(readMidiNotes(file)).toEqual([60, 61, 62]);
  });

  it("merges several tracks and orders the notes by tick", () => {
    const one = track([[0, 0x90, 60, 64], [200, 0x90, 64, 64], END]);
    const two = track([[100, 0x91, 62, 64], END]);
    expect(readMidiNotes(midi(one, two))).toEqual([60, 62, 64]);
  });

  it("rejects data that is not a MIDI file", () => {
    expect(() => readMidiNotes(new Uint8Array(ascii("RIFF....WAVE")))).toThrow("missing MThd");
  });

  it("rejects a file with no notes", () => {
    expect(() => readMidiNotes(midi(track([[0, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20], END])))).toThrow("no note-on events");
  });
});
