import { describe, expect, it } from "vitest";
import { SAMPLE_RATE, assignNotes, encodeWav, frequency, renderNotes } from "../src/audio/synth";
import { INSTRUMENTS } from "../src/scene/types";

const at = (seconds: number) => Math.round(seconds * SAMPLE_RATE);
const peak = (samples: Float32Array, from: number, to: number) => {
  let max = 0;
  for (let i = from; i < to; i += 1) max = Math.max(max, Math.abs(samples[i]));
  return max;
};
const rms = (samples: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
};

describe("frequency", () => {
  it("is 440 Hz for A4 and doubles every octave, exactly", () => {
    expect(frequency(69)).toBe(440);
    expect(frequency(57)).toBe(220);
    expect(frequency(81)).toBe(880);
  });

  it("puts middle C at 261.63 Hz and a semitone at the twelfth root of two", () => {
    expect(frequency(60)).toBeCloseTo(261.6256, 3);
    expect(frequency(70) / frequency(69)).toBeCloseTo(2 ** (1 / 12), 12);
  });
});

describe("assignNotes", () => {
  it("plays note n of the melody on bounce n and loops when the melody runs out", () => {
    const events = assignNotes([0.5, 1, 1.5, 2, 2.5], [60, 62, 64]);
    expect(events.map((e) => e.midiNote)).toEqual([60, 62, 64, 60, 62]);
    expect(events.map((e) => e.seconds)).toEqual([0.5, 1, 1.5, 2, 2.5]);
  });

  it("returns nothing for a scene without bounces", () => {
    expect(assignNotes([], [60])).toEqual([]);
  });

  it("repeats a one-note melody", () => {
    expect(assignNotes([1, 2, 3], [72]).map((e) => e.midiNote)).toEqual([72, 72, 72]);
  });
});

describe("renderNotes", () => {
  it("pads the buffer to the scene length, with a half second minimum", () => {
    expect(renderNotes([], "sine", 0.5, 0.7, 2)).toHaveLength(2 * SAMPLE_RATE);
    expect(renderNotes([], "sine", 0.5, 0.7, 0.1)).toHaveLength(SAMPLE_RATE / 2);
  });

  it("is silent until the note starts and sounds right after", () => {
    const samples = renderNotes([{ seconds: 0.5, midiNote: 69 }], "sine", 0.55, 0.7, 2);
    expect(peak(samples, 0, at(0.5))).toBe(0);
    expect(peak(samples, at(0.5), at(0.55))).toBeGreaterThan(0.01);
  });

  it("ramps in over 4 ms instead of clicking: the first sample is zero", () => {
    const samples = renderNotes([{ seconds: 0.25, midiNote: 69 }], "square", 0.55, 1, 1);
    expect(samples[at(0.25)]).toBe(0);
    expect(peak(samples, at(0.25) + 1, at(0.25) + 40)).toBeLessThan(peak(samples, at(0.25) + 400, at(0.25) + 800));
  });

  it("plays the requested pitch: a 440 Hz sine crosses zero upward 88 times in 0.2 s", () => {
    const samples = renderNotes([{ seconds: 0, midiNote: 69 }], "sine", 0.55, 1, 1);
    let crossings = 0;
    for (let i = 1; i < at(0.2); i += 1) if (samples[i - 1] < 0 && samples[i] >= 0) crossings += 1;
    expect(crossings).toBeGreaterThanOrEqual(87);
    expect(crossings).toBeLessThanOrEqual(89);
  });

  it("scales with volume and is silent at volume 0", () => {
    const loud = renderNotes([{ seconds: 0, midiNote: 69 }], "sine", 0.55, 1, 1);
    const soft = renderNotes([{ seconds: 0, midiNote: 69 }], "sine", 0.55, 0.25, 1);
    const off = renderNotes([{ seconds: 0, midiNote: 69 }], "sine", 0.55, 0, 1);
    expect(peak(loud, 0, SAMPLE_RATE)).toBeGreaterThan(3 * peak(soft, 0, SAMPLE_RATE));
    expect(peak(off, 0, SAMPLE_RATE)).toBe(0);
  });

  it("adds simultaneous notes but soft-clips with tanh so the mix never exceeds full scale", () => {
    const one = renderNotes([{ seconds: 0, midiNote: 60 }], "piano", 0.55, 1, 1);
    const many = renderNotes(Array.from({ length: 40 }, () => ({ seconds: 0, midiNote: 60 })), "piano", 0.55, 1, 1);
    expect(peak(many, 0, SAMPLE_RATE)).toBeGreaterThan(peak(one, 0, SAMPLE_RATE));
    expect(peak(many, 0, SAMPLE_RATE)).toBeLessThanOrEqual(1);
  });

  it("truncates a note that runs past the end instead of failing", () => {
    const samples = renderNotes([{ seconds: 0.99, midiNote: 69 }], "bell", 0.55, 1, 1);
    expect(samples).toHaveLength(SAMPLE_RATE);
    expect(peak(samples, at(0.99), SAMPLE_RATE)).toBeGreaterThan(0);
  });

  it.each(INSTRUMENTS)("%s gives a finite, bounded, decaying note", (instrument) => {
    const samples = renderNotes([{ seconds: 0, midiNote: 64 }], instrument, 0.55, 0.7, 1);
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(peak(samples, 0, samples.length)).toBeLessThanOrEqual(1);
    expect(rms(samples, 0, at(0.05))).toBeGreaterThan(0.005);
    expect(rms(samples, at(0.5), at(0.55))).toBeLessThan(rms(samples, 0, at(0.05)));
    expect(peak(samples, at(0.56), SAMPLE_RATE)).toBe(0);
  });

  it("gives the same bytes every time", () => {
    const events = [{ seconds: 0.1, midiNote: 64 }, { seconds: 0.3, midiNote: 67 }];
    const a = Buffer.from(renderNotes(events, "bell", 0.55, 0.7, 1).buffer);
    const b = Buffer.from(renderNotes(events, "bell", 0.55, 0.7, 1).buffer);
    expect(a.equals(b)).toBe(true);
  });
});

describe("encodeWav", () => {
  const header = (wav: Buffer) => ({
    riff: wav.toString("ascii", 0, 4),
    riffSize: wav.readUInt32LE(4),
    wave: wav.toString("ascii", 8, 12),
    fmt: wav.toString("ascii", 12, 16),
    fmtSize: wav.readUInt32LE(16),
    format: wav.readUInt16LE(20),
    channels: wav.readUInt16LE(22),
    rate: wav.readUInt32LE(24),
    byteRate: wav.readUInt32LE(28),
    blockAlign: wav.readUInt16LE(32),
    bits: wav.readUInt16LE(34),
    data: wav.toString("ascii", 36, 40),
    dataSize: wav.readUInt32LE(40),
  });

  it("writes a 44-byte PCM header for 16-bit mono at 44.1 kHz", () => {
    const wav = encodeWav(new Float32Array(1000));
    expect(wav).toHaveLength(44 + 2000);
    expect(header(wav)).toEqual({
      riff: "RIFF",
      riffSize: 36 + 2000,
      wave: "WAVE",
      fmt: "fmt ",
      fmtSize: 16,
      format: 1,
      channels: 1,
      rate: 44100,
      byteRate: 88200,
      blockAlign: 2,
      bits: 16,
      data: "data",
      dataSize: 2000,
    });
  });

  it("quantises to signed 16 bit and clamps anything beyond full scale", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5, 2, -2]));
    const values = Array.from({ length: 6 }, (_, i) => wav.readInt16LE(44 + i * 2));
    expect(values).toEqual([0, 32767, -32767, 16384, 32767, -32767]);
  });

  it("round-trips a rendered note to within one 16-bit step", () => {
    const samples = renderNotes([{ seconds: 0, midiNote: 72 }], "piano", 0.55, 0.7, 1);
    const wav = encodeWav(samples);
    for (let i = 0; i < samples.length; i += 97) {
      expect(Math.abs(wav.readInt16LE(44 + i * 2) / 32767 - samples[i])).toBeLessThan(1 / 32767);
    }
  });
});
