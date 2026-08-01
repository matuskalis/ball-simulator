/** Public-domain melodies as MIDI note numbers. One note is played per bounce, looping. */
export const MELODIES: Record<string, number[]> = {
  "fur-elise": [76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72],
  "ode-to-joy": [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62],
  twinkle: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60],
  korobeiniki: [76, 71, 72, 74, 72, 71, 69, 69, 72, 76, 74, 72, 71, 72, 74, 76, 72, 69, 69],
  "canon-in-d": [74, 69, 71, 66, 67, 62, 67, 69],
  "moonlight-sonata": [56, 61, 64, 56, 61, 64, 57, 61, 64, 57, 61, 64],
  "minor-arpeggio": [57, 60, 64, 69, 64, 60],
  "major-scale": [60, 62, 64, 65, 67, 69, 71, 72],
  chromatic: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71],
  pentatonic: [60, 62, 64, 67, 69, 72, 69, 67, 64, 62],
};

export const MELODY_NAMES = Object.keys(MELODIES);
