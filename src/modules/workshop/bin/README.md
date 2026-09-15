# Bin editor

Code is grouped by feature. Each feature keeps its components, hooks, state, utilities, and tests together.

| Folder       | Responsibility                                                 |
| ------------ | -------------------------------------------------------------- |
| `documents/` | File and object documents, document reads, save status, undo   |
| `tree/`      | Editable rows, insertion, expansion, focus, and tree state     |
| `classes/`   | Class layouts, schemas, cards, and inspector composition       |
| `links/`     | Target resolution, navigation, declarations, and texture links |
| `values/`    | Value families, field metadata, and inline marks               |
| `curves/`    | Curve graphs, keys, probability lanes, and curve selection     |
| `shell/`     | Pane layouts, headers, and breadcrumbs                         |
| `skin/`      | Skin preview, animation clips, and skin selection              |
| `vfx/`       | Effect inspection, evaluation, rendering, and playback         |
| `shared/`    | Hashing and text helpers shared across features                |

## VFX

`vfx/engine/` owns the evaluation model, parsing, simulation, and numerical utilities. Its production code has no dependency on the bin editor's React components, hooks, or rendering layer.

- `model/` holds effect, curve, rig, and enum definitions
- `parsing/` converts backend VFX values into the evaluation model
- `simulation/` owns emission, particle pools, integration, child effects, and replay
- `utils/` holds curve sampling, random numbers, basis math, and analytic drag

The surrounding features are `inspector/`, `rendering/`, `preview/`, `playback/`, and `timeline/`. GPU resources and shaders live under `rendering/`. React playback state lives under `playback/state/`.

Tests live in `__tests__/` beside the code they exercise. The existing `index.ts` and `vfx/index.ts` retain the bin editor's entry points.
