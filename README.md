# Picture Palace

A 3D movie-theater empire simulator. You inherit one screen, a 35mm projector with opinions and a popcorn kettle; you finish, if you are good, with eight houses across the city.

## Run it

    npm install
    npm run dev          # http://localhost:5173
    npm start            # production build + preview on http://localhost:4173

## Test it

    npm run test:all     # type-check + unit tests + e2e tests (installs Chromium on first use if needed)
    npm run test:unit    # Vitest, about 90 seconds
    npm run test:e2e     # Playwright against a production build

## Back it up

    npm run backup -- "turn-02_before"    # zips all sources to ../picture-palace-backups/

## Controls

| | |
|---|---|
| Overview | drag pan, right-drag turn, wheel zoom, click anything to inspect it |
| Tab | walk the floor / back to overview |
| W A S D, Shift, V | walk, run, first person (drag to look, right-click to capture the mouse) |
| E | press or hold near a job, mess, guest, colleague or till |
| Space, 1 2 3 | pause, speeds |
| B, R, Esc | build catalogue, rotate, finish/close |
| F1 F2 F3 F4 F6 F7 F8 F9 | Films, Programme, Tickets, Food, Staff, Upkeep, Screens, Guests |

## How it is built

- `src/sim/` is the whole game as deterministic TypeScript with no rendering: seeded random, fixed 0.1 s step, JSON state. One simulated second is one game minute.
  - `plan.ts` is the building. Physics, navigation, Blender and the simulation all read from it.
  - `guests.ts` group behaviour, needs, moods, thoughts, reviews. `staff.ts`, `maintenance.ts`, `screenings.ts`, `market.ts`, `events.ts`, `chain.ts`, `rating.ts`, `objectives.ts`.
- `src/physics/` the manager's body: a Rapier character controller against the same walls the guests path around.
- `src/render/` three.js. Global illumination is baked in Cycles once per light group (house, daylight/screen, accent) and recombined in the shader, so lights dim, the sun sets, the power fails and the film lights the audience live. `crowd.ts` draws everyone with GPU skinning and four levels of detail. `lowmats.ts` + `layercache.ts` keep it playable with no GPU at all.
- `src/ui/` React. `src/audio/` synthesised sound and a generative lobby trio.
- `tools/` the art pipeline (Blender as a Python module). Output is committed in `public/assets`, so you do not need it to play.

## Credits

Human base mesh, morph targets, rig and weights: MakeHuman / MPFB2, CC0. Everything else (clothes, hair, faces, props, building, film footage, textures, sound, text) was made for this project. Fonts: League Gothic, Yellowtail, Barlow, Courier Prime (SIL OFL, via Fontsource).
