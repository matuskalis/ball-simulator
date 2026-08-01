See @AGENTS.md — it is the full contract for turning a user prompt into a rendered video.

Short version: pick a preset, write `scenes/<slug>.json`, `npm run validate -- scenes/<slug>.json`, then `npm run make -- scenes/<slug>.json`. Never edit `src/` to satisfy a video request.
