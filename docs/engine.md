# How the engine works

The numbers below are the ones in the code. File and function names are given so you can check them.

## One scene, four stages

```text
 scenes/x.json
      |  resolveScene: defaults, then the preset, then the file     (src/scene/resolve.ts)
      |  validateScene: unknown fields, types, ranges                (same file)
      v
   make ---------------------------------+
      |                                  |
      v                                  v
 Node: simulate(scene)              Chromium: simulate(scene) again       (src/sim/simulate.ts)
 bounce times -> notes -> WAV       frame n -> SVG -> image               (src/audio, src/render)
      |                                  |
      +----------------+-----------------+
                       v
            ffmpeg inside Remotion  ->  out/x.mp4
```

`simulate(scene)` is a pure function. It returns every frame of the video (`frames`), the time in seconds of every bounce that should sound (`bounceSeconds`) and the ring bursts (`bursts`). The CLI calls it once for the audio. The Remotion composition (`src/render/BallScene.tsx`) calls it again inside each Chromium tab and draws `frames[n]` for frame n. The two calls must agree to the last bit; [determinism.md](determinism.md) shows how that is checked.

## The simulation step

| Constant | Value | Where |
| --- | --- | --- |
| Substeps per frame | 4, so `dt = 1 / (fps * 4)`, 1/240 s at 60 fps | `SUBSTEPS` |
| Resting threshold | a contact with a normal speed under 55 px/s is reflected but does nothing else | `MIN_BOUNCE_SPEED` |
| Note merge gap | notes closer than 45 ms collapse into one | `MIN_NOTE_GAP` |
| Note cap | 3000 notes per scene | `MAX_NOTES` |
| Stick delay | a freshly spawned ball cannot stick to the pile for its first 0.12 s | `MIN_STICK_AGE` |
| Growth ceiling | a growing ball stops at 98 percent of the arena | `maxBallRadius` |

Each substep does this, in order:

1. Rotate every ring by `ringSpeed` degrees per second times `dt`; with `ringAlternate` every odd ring turns the other way.
2. For each ball that is not frozen: `age += dt`, `vy += gravity * dt`, then `x += vx * dt` and `y += vy * dt`. Velocity is updated before position (semi-implicit Euler), so a ball released from rest at the centre of the default arena lands after 134 substeps, 0.558 s, where the continuous formula gives 0.560 s.
3. Collide that ball with its walls: a box, or the rings from the outermost inward and then the outer circle.
4. After every ball has moved, if `ballCollisions` is on, resolve every overlapping pair.

Frame `f` of the output stores the state after substep `4 * (f + 1)`, that is at time `(f + 1) / fps`, with positions and radii rounded to 0.1 px. So the picture shown at time `t` is the simulation at `t + 1 / fps`: the picture leads the simulation clock by one frame.

### Walls

A wall contact places the ball flush against the wall and reflects its velocity about the inward normal `n`:

```text
dot = v . n                         (negative when the ball is moving into the wall)
v   = (v - 2 * dot * n) * restitution
```

`restitution` multiplies the whole velocity, so a wall below 1 also slows the sliding component. Default restitution is 1; `infinite-loop` uses 0.98, `accumulation` 0.85, `swarm` 0.97. The math is `reflect()` in `src/sim/collide.ts`.

- **Circle:** the ball touches when `distance from centre + r > arena.radius`. With `effects.breakWalls` on a circle arena the wall is cut into `arena.segments` arcs (48 by default, 64 for `destruction`); the arc that is hit breaks, and a ball that passes through a broken arc and is fully outside respawns at `(cx, cy - 0.25 * radius)` with a new random launch.
- **Box:** each of the four sides is tested on its own axis.
- **Rings:** ring `i` has radius `arena.radius - (i + 1) * ringSpacing` and a gap of `ringGapDegrees`. Outside the gap a ring is solid from both sides. Inside the gap the ball passes; with `breakWalls` the ring is destroyed as soon as the ball's edge reaches it inside the gap, moving outward, and a burst is recorded for the renderer. Destroying on entry rather than on exit is deliberate: the ring keeps turning, so by the time the ball is clear the gap has usually moved away and the pass would never be seen.

### Balls

Two overlapping balls are pushed apart by half the overlap each and exchange momentum along the line between their centres. Masses are equal, and a frozen ball acts as an immovable wall. The impulse is `-(1 + restitution) * relative / 2`, where `relative` is the approach speed along the line; no impulse is applied when the balls are already separating, though they are still pushed apart. Pairs are checked all against all, so the cost grows with the square of the ball count (`collidePair()` in `src/sim/collide.ts`).

### What a bounce does

A contact at 55 px/s or more counts as a bounce and, in this order: multiplies the speed by `speedUpOnBounce` and clamps it to `maxSpeed` (the clamp is applied at the bounce, so a ball under gravity can exceed `maxSpeed` in flight), grows the ball by `growOnBounce` and pushes it out of the wall by the same amount, advances the colour, spawns `spawnOnBounce` new balls (speed at least 0.6 times `launchSpeed`, capped at `maxBalls`), freezes the ball if `stickOnBounce` is on, and records a note.

With `stickOnBounce`, a moving ball that is older than 0.12 s and touches a frozen one freezes too, spawns a new ball at `(cx, cy - 0.25 * radius)` and plays a note. That is how a pile builds.

### Launch

A ball starts at the centre (a single ball) or on a circle of half the arena radius (several), with velocity `launchSpeed * (cos a, sin a)` where `a = 2 * pi * rng()`. Both the launch direction and the placement use `cosSin()` from `src/sim/trig.ts` instead of `Math.cos` and `Math.sin`, for a reason given in [determinism.md](determinism.md).

### Random numbers

`createRng(seed)` in `src/sim/rng.ts` is mulberry32: a 32-bit counter stepped by `0x6D2B79F5`, scrambled with two multiplies and xor-shifts, divided by 2^32. The seed is truncated to an unsigned 32-bit integer, so `0`, `1`, `1.9` and `4294967297` all give the stream of seed 1.

## Growing to fill the arena

`effects.growToFillAtEnd` makes `solveGrowth()` (`src/scene/solveGrowth.ts`) find `growOnBounce`. Growth changes the bounce count, which changes the growth needed, so it does not solve a formula: it doubles an upper bound from 2 px until the simulated final radius reaches 96 percent of the arena radius, then bisects ten times and rounds to three decimals. For `scenes/viral/03-tetris-growth.json` (25 s) that gives 4.883 px per bounce and a final radius of 421.4 px, 98 percent of the arena.

## Audio

`make` turns `bounceSeconds` into a WAV, then Remotion muxes it into the MP4.

- **Which note.** The n-th audible bounce plays the n-th note of the melody, looping (`assignNotes()`). Built-in melodies are MIDI note arrays (`src/audio/melodies.ts`); `music.melody` can also be your own array or a `.mid` path (`src/audio/midi.ts` reads note-on events in tick order).
- **Pitch.** `440 * 2^((note - 69) / 12)` Hz.
- **When.** At the bounce time, which sits on the 1/240 s substep grid. Sample index `round(seconds * 44100)`.
- **What.** One of five formulas for `t` seconds since the note began, with `f` the frequency and `phase = 2 * pi * f * t`:

| Instrument | Sample |
| --- | --- |
| `sine` | `sin(phase) * exp(-3t)` |
| `square` | `+-0.6 * exp(-2.5t)`, sign of `sin(phase)` |
| `bell` | `sin(phase + 3 * exp(-3t) * sin(2 * pi * 2.7 * f * t)) * exp(-2.2t)` |
| `pluck` | `(2 * frac(f * t) - 1) * exp(-7t)` |
| `piano` (default) | `0.6 * (sin(phase) + 0.5 * sin(2 * phase) + 0.22 * sin(3 * phase)) * exp(-4t)` |

- **Mix.** Each note lasts `noteSeconds` (0.55 s), ramps in over 4 ms, is scaled by `0.32 * volume` (0.7 by default) and added into a mono buffer of `ceil(max(duration, 0.5) * 44100)` samples. The whole buffer then goes through `tanh`, so stacked notes saturate smoothly, and is written as 16-bit PCM at 44.1 kHz (`encodeWav()`).
- **Dense scenes.** Notes under 45 ms apart collapse into one and a scene plays at most 3000 notes, so 260 balls bouncing 53,036 times in `scenes/infinite-loop.json` become 374 notes, an arpeggio instead of noise.

The WAV is a pure function of the bounce times and the instrument, so it is byte-identical whenever the simulation is.

## How the file lines up

Remotion re-encodes the WAV into the MP4 as AAC at 48 kHz. Measured on `scenes/readme-demo.json`, the audio decoded from the MP4 trails the WAV by 42.7 ms, the same in the first, middle and last two seconds (no drift), and the same with ffmpeg and with CoreAudio as the decoder. That is 2048 samples at 48 kHz, two AAC frames, and the file carries no edit list to cancel it. Together with the one frame by which the picture leads the simulation clock, a note sounds 43 to 59 ms after the contact first appears on screen. This repository does not correct for it.

## Drawing

`src/render/BallScene.tsx` draws one SVG per frame at the scene size (1080x1920 by default), and Remotion's `--scale` shrinks that drawing without changing its layout, which is what makes a quarter-size preview a faithful one. The outer wall is a 6 px circle (8 px arcs when it can break), rings are 7 px arcs at 0.9 opacity, a ball is a circle with a 1.9 times larger halo at 0.16 opacity, a trail is a polyline through the last `trailLength` frames sampled every second frame (drawn only while there are at most 8 balls), and a ring burst is 18 arcs that expand by 110 px and fade over 26 frames. The title is 68 px and the counter 96 px Helvetica. The counter shows the ball count once there is more than one ball, the bounce count before that.
