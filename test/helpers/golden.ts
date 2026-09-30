import { createHash } from "node:crypto";
import { loadMelody } from "../../src/audio/loadMelody";
import { assignNotes, encodeWav, renderNotes } from "../../src/audio/synth";
import { resolveScene } from "../../src/scene/resolve";
import { solveGrowth } from "../../src/scene/solveGrowth";
import type { DeepPartial } from "../../src/scene/presets";
import type { Scene } from "../../src/scene/types";
import { simulate } from "../../src/sim/simulate";
import { readScene } from "./scenes";

export interface Golden {
  frames: number;
  notes: number;
  bounces: number;
  /** First 16 hex digits of the SHA-256 of the whole simulation result: every frame, note time and ring burst. */
  sim: string;
  /** Same for the WAV file `make` writes, or null when the scene has no music. */
  wav: string | null;
}

const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex").slice(0, 16);

export function goldenFor(file: string): Golden {
  const scene = solveGrowth(resolveScene(readScene(file) as DeepPartial<Scene>));
  const result = simulate(scene);
  const last = result.frames[result.frames.length - 1];
  let wav: string | null = null;
  if (scene.music.enabled && result.bounceSeconds.length > 0) {
    const events = assignNotes(result.bounceSeconds, loadMelody(scene.music.melody));
    wav = digest(encodeWav(renderNotes(events, scene.music.instrument, scene.music.noteSeconds, scene.music.volume, scene.durationSeconds)));
  }
  return {
    frames: result.frames.length,
    notes: result.bounceSeconds.length,
    bounces: last.bounces,
    sim: digest(JSON.stringify({ frames: result.frames, bounceSeconds: result.bounceSeconds, bursts: result.bursts })),
    wav,
  };
}
