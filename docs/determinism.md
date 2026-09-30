# Determinism, measured

The claim: the same seed and scene always give the same video, and the notes land on the bounces. It has two halves.

1. **The pipeline is reproducible.** The same inputs give the same bytes.
2. **The two simulations agree.** The notes come from `simulate()` in Node, the picture from `simulate()` in the headless Chromium that Remotion renders with. If they differ by one bit anywhere, a bouncing ball (a chaotic system) amplifies it until the notes no longer match the picture.

Everything below was measured on 30 Sep 2026 on one machine: MacBook Pro 16" M1 Pro, macOS 27.0, Node 22.22.2 and 24.5.0, Remotion 4.0.503, Chrome Headless Shell 149.0.7790.0, the 35 scene files in `scenes/`.

## Results

| Check | Result |
| --- | --- |
| `scenes/readme-demo.json` rendered three times at 1080x1920: Node 24 with 5 render workers, Node 24 with 2, Node 22 with 2. The MP4 | byte-identical, md5 `4459c552f450b5328e82542bcfc4b1d6` |
| The same three runs. The WAV | byte-identical, md5 `1ffb3531d42e1401a0ba9cdc7adfaa21` |
| Frames 0 to 59 as PNG at 360x640: a range rendered with 2 workers, the same with 5, and the same frames taken from a full 0 to 359 render (3 workers) | 60 of 60 byte-identical across all three |
| SHA-256 of the whole simulation result (every frame, note time and ring burst) and of the WAV, Node 22 against Node 24, 35 scenes | identical (the record in `test/fixtures/golden.json`) |
| The same simulation hash, Node 24 against headless Chromium, 35 scenes | identical (`npm run parity`) |
| Audio decoded from the MP4 against the WAV | **not** identical: AAC is lossy, the normalised correlation is 0.995, and the MP4 audio is 42.7 ms late |

The 42.7 ms is constant: 42.68 ms in each of the first, middle and last two seconds, with ffmpeg and with CoreAudio (`afconvert`) as the decoder. It is 2048 samples at 48 kHz, two AAC frames, added by the encoder inside Remotion; the MP4 has no edit list to cancel it. It is a fixed offset, not drift. See [engine.md](engine.md#how-the-file-lines-up).

## The bug this measurement found

Before this branch, hashing the simulation in both engines gave 32 identical scenes out of 34. Two differed:

- `scenes/swarm.json`: the simulations split at frame 70 (1.17 s). Node counted 380 notes, the Chromium simulation that draws the picture counts 393, and only 33 of the first 380 note times agreed. After 1.7 s the notes were not on the bounces.
- `scenes/infinite-loop.json`: split at frame 57, with 606 bounces counted in Node against 604 in Chromium at that frame.

Cause: `Math.cos` and `Math.sin` are allowed to differ in the last bit between engines, and these two do. `npm run probe:trig` runs 200,000 angles in [0, 2 pi) through both:

```
                      cos                                  sin
Node vs exact          6671 (3.34%), at most 1 ulp    6336 (3.17%), at most 1 ulp
Chromium vs exact       285 (0.14%), at most 1 ulp     265 (0.13%), at most 1 ulp
Node vs Chromium       6576 (3.29%), at most 1 ulp    6297 (3.15%), at most 1 ulp
```

"Exact" is `cosSin()` in `src/sim/trig.ts`: BigInt fixed point, rounded once, equal to the correctly rounded value on all 66 arbitrary-precision references from `bc` in `test/fixtures/trig-reference.json`. Node 24 (V8 13.6) is off by one ulp on about 3 percent of inputs, Chrome 149 on about 0.14 percent.

The simulation turns a random angle into a velocity with `cos` and `sin` once per launched ball, and places balls on a circle with them. A scene with 40 or 260 balls makes hundreds of calls, so it almost always hits a disagreement; a one-ball scene makes two, so it escaped about 94 times in 100. `Math.atan2` also differs (0.17 percent of inputs, 1 ulp) but only feeds comparisons (which wall segment, inside a ring gap or not), and `Math.hypot`, `Math.sqrt` and plain arithmetic agreed on every input tried (2 million random pairs, and all 14,281 `hypot` calls recorded from the first 1.3 s of the swarm).

The fix replaces the two uses with `cosSin()`. Because Chrome was already almost always correctly rounded, no existing picture changed: the new simulation hash equals the old Chromium hash on all 34 scenes that existed then, and Node now equals Chromium on all 35. Only the Node-side audio of `swarm` and `infinite-loop` changed, and it now matches their pictures.

## Reproduce

```bash
npm test              # golden hashes of all scenes, Node only, about 10 s
npm run parity        # Node against headless Chromium, about a minute
npm run probe:trig    # the cos and sin table above, about 20 s

# two renders, compared
npm run make -- scenes/readme-demo.json --out=out/a.mp4 && md5 -r out/a.mp4 public/readme-demo.wav
npm run make -- scenes/readme-demo.json --out=out/b.mp4 && md5 -r out/b.mp4 public/readme-demo.wav
```

`md5 -r` is macOS; on Linux use `md5sum`. `npm run golden` rewrites the golden record after a change to the physics or the audio that you meant to make; read the diff, every changed line is a video that now looks or sounds different.

## What is not claimed

- **Other machines.** Nothing above was run on another CPU or operating system by hand. CI runs the golden test on Ubuntu with Node 22 and 24; the workflow is `.github/workflows/ci.yml`.
- **Other engines.** The Studio preview in Safari or Firefox uses their own `atan2` and `hypot`; only Chromium was checked.
- **Other versions.** A different Remotion, which brings a different Chrome, could change `hypot` or `atan2`. `npm run parity` is the check to run after an upgrade.
- **Seeds.** `0`, `1`, fractions such as `1.9` and `4294967297` all give the stream of seed 1, because the seed is truncated to an unsigned 32-bit integer.
