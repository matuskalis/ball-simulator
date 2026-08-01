---
name: ballsim
description: Turn a plain-language description of a bouncing-ball video into a rendered vertical MP4. Use whenever the user asks for a bouncing ball / ball simulator / satisfying physics video, describes balls multiplying, growing, escaping rings, breaking walls, or piling up, or asks to change music, colours, speed, or length of one of those videos.
---

# ballsim

Read `AGENTS.md` in the repo root first — it holds the prompt vocabulary, the full field list, and the worked examples. Then:

1. `npm install` if `node_modules/` is missing.
2. Pick the preset that matches the user's description, override only the fields they mentioned.
3. Write `scenes/<slug>.json`.
4. `npm run validate -- scenes/<slug>.json` and fix anything it reports, including the "very few bounces" warning.
5. `npm run make -- scenes/<slug>.json`.
6. Report the output path, preset, and note count.

Never edit `src/` to satisfy a video request.
