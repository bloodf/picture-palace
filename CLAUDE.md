# Standing rules for this project
1. BEFORE starting work on any turn, run `npm run backup -- "turn-NN_before"`. It writes a timestamped zip of all
   source code to ../picture-palace-backups/. This is the owner's explicit request.
2. `npm run test:all` runs type-check + every unit test + every e2e test and must be green at the end of a turn.
3. `src/sim` never imports from `src/render` or `src/ui`. Anything random goes through `game.rng`.
4. `src/sim/plan.ts` is the source of truth for geometry. After changing it, re-run `tools/build-assets.sh` (shell bake ~25 min).
