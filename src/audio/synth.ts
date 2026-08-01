import type { Instrument } from "../scene/types";

export const SAMPLE_RATE = 44100;

const frequency = (midiNote: number) => 440 * 2 ** ((midiNote - 69) / 12);

function sample(instrument: Instrument, phase: number, t: number, f: number): number {
  switch (instrument) {
    case "sine":
      return Math.sin(phase) * Math.exp(-3 * t);
    case "square":
      return (Math.sin(phase) >= 0 ? 0.6 : -0.6) * Math.exp(-2.5 * t);
    case "bell":
      return Math.sin(phase + 3 * Math.exp(-3 * t) * Math.sin(2 * Math.PI * 2.7 * f * t)) * Math.exp(-2.2 * t);
    case "pluck": {
      const saw = 2 * ((f * t) % 1) - 1;
      return saw * Math.exp(-7 * t);
    }
    case "piano":
    default:
      return (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.22 * Math.sin(3 * phase)) * 0.6 * Math.exp(-4 * t);
  }
}

export interface NoteEvent {
  seconds: number;
  midiNote: number;
}

/** Mixes one note per event into a mono buffer. Length is padded to `totalSeconds`. */
export function renderNotes(
  events: NoteEvent[],
  instrument: Instrument,
  noteSeconds: number,
  volume: number,
  totalSeconds: number,
): Float32Array {
  const length = Math.ceil(Math.max(totalSeconds, 0.5) * SAMPLE_RATE);
  const buffer = new Float32Array(length);
  const attack = Math.round(0.004 * SAMPLE_RATE);

  for (const event of events) {
    const f = frequency(event.midiNote);
    const start = Math.round(event.seconds * SAMPLE_RATE);
    const noteLength = Math.round(noteSeconds * SAMPLE_RATE);
    for (let i = 0; i < noteLength; i += 1) {
      const index = start + i;
      if (index >= length) break;
      const t = i / SAMPLE_RATE;
      const envelope = i < attack ? i / attack : 1;
      buffer[index] += sample(instrument, 2 * Math.PI * f * t, t, f) * envelope * 0.32 * volume;
    }
  }

  for (let i = 0; i < length; i += 1) buffer[i] = Math.tanh(buffer[i]);
  return buffer;
}

/** 16-bit mono PCM WAV. */
export function encodeWav(samples: Float32Array): Buffer {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}
