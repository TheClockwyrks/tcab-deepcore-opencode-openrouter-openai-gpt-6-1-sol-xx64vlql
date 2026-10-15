# DEEPCORE

**A long way down. One way home.**

Deepcore is a browser-based subterranean mining expedition. Drill through four
strata of an abandoned world, haul minerals back on your jetpack, and turn your
earnings into a five-system escape rocket. There are no enemies: fuel, cargo
weight, volatile gas, molten rock, and the climb home are the opposition.

Choose Standard or Hardcore, then a Quick (1,250 m), Standard (2,500 m), or Marathon
(5,000 m) mine. Every expedition generates a fresh world, with thirteen minerals,
two buried exotic materials, seven equipment tracks, and six field supplies.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. The game runs entirely in the browser.

## Production

```sh
npm ci
npm run build
npm run preview
```

Deploy the contents of `dist/` to a static host. Its `index.html` is the entry
point. All script, image, effect, and audio URLs are relative, including when the
site is hosted in a subdirectory. The build bundles the assets already in this
repository; it requires no art or sound generation tools.

## Controls

| Input | Action |
| --- | --- |
| A / D or ← / → | Walk; drill sideways when grounded against a wall |
| S or ↓ | Drill down while grounded |
| W / ↑ / Space | Fire the jetpack |
| E / Enter | Interact with a surface station; confirm a menu or panel choice |
| I | Open or close the cargo manifest |
| Esc / P | Close a panel, pause, or resume |
| M | Mute or unmute all audio |
| J | Jettison a carried unstable Core Sample |
| 1 | Dynamite |
| 2 | Plastic Explosives |
| 3 | Quantum Teleporter |
| 4 | Matter Transmitter |
| 5 | Regenerative Nanobots |
| 6 | Emergency Fuel |

Use ↑ / ↓ to select menu entries and panel controls, then Enter to confirm.
Menus, panels, and status-bar controls also support mouse, pen, and touch.
The prospector uses keyboard movement. Backtick toggles the engine diagnostics.

### Your first haul

Hold S to cut a shaft; mineral seams begin below the first three ground rows.
Use W or Space to fly back up the passage you carved. Walk to the Ore Exchange,
press E, and sell. Buy fuel and repairs at the Fuel Depot, then invest in better
equipment. A larger cargo bay does not increase your jetpack's lift: if the
manifest reads **OVERLOAD**, drop ore until you can climb again.

Save at the Save Pad on the surface. There is one local browser save slot and no
autosave. Standard lets you restore the last save after death; Hardcore deletes
it. New expeditions replace the old save. A live Core Sample prevents saving and
keeps ticking inside building panels and inventory; only pausing freezes it.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests drive the Simple 2D engine over an `@napi-rs/canvas` canvas with counted
frames, action events, and the game's immutable debug transitions. Coverage and
test reports are written under `coverage/`.

## Source and original assets

- `src/game.ts`: engine integration, asset loading, input, and screen transitions.
- `src/model.ts`, `world.ts`, `simulation.ts`, `operations.ts`: state, generation,
  fixed-step physics, hazards, economy, supplies, and saving.
- `src/debug.ts`: the versioned automation surface returned through `engine.debug`.
- `src/presentation.ts`, `layout.ts`: camera-space drawing and shared hit regions.
- `assets/`: original PNG sprites and animation frames, live particle systems,
  thirteen WAV cues, and the music sequence. Authoring logs are included.
- `tools/produce_art.py` and `tools/produce_effects.py`: one-time authoring scripts
  for `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`.
  These tools are only needed to regenerate artwork, never to build or play.
- `showcase/`: the player-facing description, screenshots, and an engine-recorded
  live-play replay. `tools/capture.mjs` captures these from the running game.

The engine owns the frame loop, input, audio, asset loading, canvas fit, recorder,
and diagnostics. Simulation state advances at 120 Hz from the engine's supplied
delta time; rendering never advances the expedition. Nothing is installed on the
page as a debugging global.
