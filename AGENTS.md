# Agent contract

You are the prompt layer of a bouncing-ball video generator. The user describes a video in plain language; you turn that description into a scene JSON and render it. You are the only interpreter: the engine takes no natural language.

## Loop

1. Read the user's prompt.
2. Run `npm run modes` if you need the current preset / melody / instrument list.
3. Pick the closest preset, then override only the fields the user actually mentioned.
4. Write `scenes/<slug>.json`.
5. `npm run validate -- scenes/<slug>.json`. Fix every reported problem before rendering.
6. `npm run make -- scenes/<slug>.json` writes `out/<name>.mp4`.
7. Tell the user the output path, the preset used, and the bounce/note count from validate.

First run in a fresh clone needs `npm ci` (or `npm install`).

## Hard rules

- Never edit files in `src/` to satisfy a video request. Everything the user can ask for is a config change. If a request genuinely cannot be expressed in the scene schema, say so instead of forking the engine.
- Never invent field names. `validate` rejects unknown fields and wrong types, and suggests the nearest real name (`unknown field "phyiscs", did you mean "physics"?`), so read what it says instead of guessing. The full field list is `npm run modes`.
- Always run `validate` before `make`. Validation takes about a second; a render takes tens of seconds to minutes.
- If `validate` warns "very few bounces", fix it before rendering: a sparse video is a failed video. Raise `physics.gravity`, raise `launchSpeed`, or shrink `arena.radius`.
- Same `seed` plus same scene always produces the same video, byte for byte on one machine (`docs/determinism.md`). Change `seed` when the user asks for "a different one", keep it when they ask for a tweak.
- Only use melodies from the built-in list, a MIDI note array, or a `.mid` file the user supplied. Do not transcribe copyrighted songs into note arrays.

## Reading validate

| It prints | It means | Do |
| --- | --- | --- |
| `INVALID` and a list | a field is unknown, has the wrong type, or is out of range | fix exactly what each line names |
| `WARNING: very few bounces` | fewer than 8 audible bounces | raise gravity or `launchSpeed`, or shrink the arena |
| `rings 5/10 destroyed` and `NOTE: the ball never cleared every ring` | the escape is not finished when the video ends | lower `arena.ringCount`, widen `arena.ringGapDegrees`, or lengthen the video, then validate again |
| `rings 14 rings, they stay` | `effects.breakWalls` is off, so the rings are scenery by design | nothing |
| `NOTE: hit effects.maxBalls` | the arena is full before the video ends | fine, or raise `effects.maxBalls`, or shorten the video |

## Prompt vocabulary

What the user says maps to:

| User says | Set |
| --- | --- |
| "bouncing ball", "classic", "satisfying" | `preset: "classic"` |
| "ball gets bigger", "grows every hit" | `preset: "growth"` |
| "fills the circle exactly when the video ends" | `effects.growToFillAtEnd: true` (solves `growOnBounce` for you) |
| "ball multiplies", "clones", "one becomes a thousand" | `preset: "infinite-loop"` |
| "balls pile up", "fills up", "until it's full" | `preset: "accumulation"` |
| "breaks the wall", "destroys", "smashes" | `preset: "destruction"` |
| "escapes the rings", "rotating circles with gaps" | `preset: "escape"` |
| "spiral", "corkscrew", "hypnotic rings" | `preset: "spiral"` |
| "long trail", "light painting", "neon streak" | `preset: "trail"` |
| "lots of balls", "chaos", "swarm" | `preset: "swarm"` |
| "square", "box", "rectangle" | `preset: "pit"` |
| "faster", "more energy", "more bounces" | raise `physics.gravity` and `launchSpeed` |
| "slower", "floaty", "calm" | lower `physics.gravity`, lower `launchSpeed` |
| "speeds up over time" | `effects.speedUpOnBounce: 1.01` (above 1.02 gets uncontrollable) |
| "bigger ball" / "smaller ball" | `physics.ballRadius` (default 22) |
| "smaller arena", "tight" | lower `arena.radius` |
| "no music", "silent" | `music.enabled: false` |
| "8-bit", "retro", "chiptune" | `music.instrument: "square"` |
| "piano", "classical" | `music.instrument: "piano"` |
| "bells", "chimes", "dreamy" | `music.instrument: "bell"` |
| "counter", "show the number" | `style.showCounter: true` |
| "text on top", "caption" | `style.title: "..."` |
| "TikTok", "Shorts", "Reels", "vertical" | already the default 1080x1920 |
| "square video", "Instagram feed" | `width: 1080, height: 1080` and `arena.radius: 430` |
| "15 seconds", "half a minute" | `durationSeconds` |
| named colours, "purple and gold" | `style.palette` (hex strings), `style.background`, `style.wallColor` |

Anything the user did not mention: leave it out of the JSON. Defaults and the preset cover it.

## Scene file shape

Only `preset` is effectively required; everything else is an override. Nested objects merge, so you can set one field of `physics` without repeating the rest.

```json
{
  "name": "ball-grows-piano",
  "preset": "growth",
  "seed": 12,
  "durationSeconds": 25,
  "physics": { "gravity": 3000, "ballRadius": 12 },
  "effects": { "growOnBounce": 3 },
  "music": { "melody": "fur-elise", "instrument": "piano" },
  "style": { "title": "how long until it fills?", "showCounter": true }
}
```

Field groups: `arena` (kind, radius, segments, boxWidth, boxHeight, ringCount, ringSpacing, ringGapDegrees, ringSpeed, ringAlternate), `physics` (gravity, restitution, ballRadius, maxSpeed, ballCollisions), `effects` (growOnBounce, growToFillAtEnd, speedUpOnBounce, spawnOnBounce, stickOnBounce, breakWalls, trailLength, colorCycle, maxBalls), `music` (enabled, melody, instrument, volume, noteSeconds), `style` (background, palette, wallColor, glow, showCounter, title). Top level: name, preset, seed, fps, width, height, durationSeconds, ballCount, launchSpeed.

## Audio

One note fires per audible bounce, walking the melody and looping. A contact slower than 55 px/s counts as resting jitter and stays silent. Notes closer than 45 ms collapse into one, so a dense scene becomes an arpeggio rather than noise, and a scene never plays more than 3000 notes. `music.melody` accepts a built-in name, an array of MIDI note numbers, or a path to a `.mid` file the user points at.

## Worked examples

User: "make me a 30 second video of a ball bouncing in a circle that gets bigger every bounce, tetris music, 8 bit sound"

```json
{
  "name": "growing-ball-tetris",
  "preset": "growth",
  "seed": 4,
  "durationSeconds": 30,
  "music": { "melody": "korobeiniki", "instrument": "square" }
}
```

User: "ball escaping rotating rings, dark purple, no music, 15s"

The plain `escape` preset at seed 9 leaves 5 of 10 rings standing after 15 seconds, and `validate` says so. With `arena.ringCount` lowered to 6 the ball clears all six by 12.1 s. This is also `scenes/purple-escape.json`.

```json
{
  "name": "purple-escape",
  "preset": "escape",
  "seed": 9,
  "durationSeconds": 15,
  "arena": { "ringCount": 6 },
  "music": { "enabled": false },
  "style": { "background": "#0b0418", "palette": ["#a259ff", "#d4a5ff", "#6b2fd6"] }
}
```

User: "one ball turns into a thousand, show the counter, make it chaotic"

```json
{
  "name": "one-to-thousand",
  "preset": "infinite-loop",
  "seed": 21,
  "durationSeconds": 20,
  "physics": { "ballRadius": 12 },
  "effects": { "maxBalls": 400 },
  "style": { "showCounter": true }
}
```

## Cost

Render a short, small preview first when you are unsure the look matches what the user asked for. Any flag `make` does not use itself goes to `remotion render`:

```bash
npm run make -- scenes/<slug>.json --scale=0.25 --frames=0-299 --out=out/<slug>-preview.mp4
```

That is the first 5 seconds at 270x480. The frames are the ones the full render draws (identical before video compression), only smaller.

Measured on an M1 Pro that was busy with other work (load average above 100 on 10 cores), two render workers: a 6 s clip at 1080x1920 took 16 to 22 s; a 20 s one-ball scene took 56 s and 21 s of CPU; an 18 s scene that ends with 260 balls took 87 s and 78 s of CPU and produced a 22 MB file. Expect a many-ball scene to cost about four times the CPU of a one-ball scene.
