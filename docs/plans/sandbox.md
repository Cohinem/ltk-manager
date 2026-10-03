# Sandbox - Implementation Plan

> Status: **v1 built** (2026-09-28), stages 1, 2, 3 and 6. Decision: [ADR-0056](../adr/0056-an-editor-reads-and-writes-through-a-sandbox.md).
> Glossary: **Sandbox** in `CONTEXT.md`.

Every workshop editor reads its data and sends its edits through a sandbox: the installed game or
a project's layers over the game. v1 is stages 1, 2, 3 and 6 on one branch, and the existing bin
editor is its first user. Stages 4 and 5 start after the bin editor works on the sandbox.

## 1. Current state (verified 2026-09-28)

| Piece                   | Where                                                            | Shape today                                                                                   |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Address                 | `crates/ltk-manager-assets/src/preview/source.rs:22`             | `AssetRef` = `Layer`, `GameChunk { project? }`, `File`. `read` resolves bytes per kind        |
| Held documents          | `crates/ltk-manager-bin/src/bin_document.rs:144`                 | `BinDocuments`, LRU of 32 keyed by `AssetRef`, each holding its tree and a `LayerChunks`      |
| Declared apply          | `crates/ltk-manager-bin/src/bin_document/declared.rs:463`        | Starts from the game copy, applies each layer's `game_data.yaml` in `apply_order`             |
| File resolution         | `crates/ltk-manager-workshop/src/chunk_names.rs:28`, `:306`      | `LayerChunks`, the highest layer's copy of each path, sorted by `cmp_for_stacking`            |
| Link lookup             | `src-tauri/src/commands/document_assets.rs:96`                   | `DocumentAssets: AssetLookup`, layer copy then `GameIndex`, game results have `project: None` |
| Read-only gate          | `crates/ltk-manager-bin/src/bin_document/edit.rs:354`            | `ReadOnly` = `install`, `loose`, `patch`, `declarationsOff`                                   |
| Project on the frontend | `src/modules/workshop/projects/state/ProjectContext.tsx`         | 34 files call `useProjectContext`, 14 call `useOptionalProjectContext`                        |
| Declared bin open       | `src/modules/workshop/bin/documents/hooks/useBinDocument.ts:69`  | Injects `project` into a `gameChunk` from `ProjectContext`                                    |
| Document identity       | `src/modules/workshop/preview/utils/assetRef.ts:25`              | `assetKey` has no project part                                                                |
| Frontend resolution     | `src/modules/workshop/bin/links/hooks/useLinkTargets.ts:427-480` | `lookupOrder`, `useLayerCopy`, `joinDeclarations` repeat the backend's lookup                 |
| Target layer            | `src/modules/workshop/shell/hooks/useProjectEditor.ts:503`       | `selectedLayer` in the editor store, `selectedModule` in `.ltk/editor.json`                   |
| Layer priority          | `crates/ltk-manager-workshop/src/layers.rs:43`, `:214`           | Create takes the highest plus one, reorder numbers from 1 over `base` at 0, never negative    |
| Layer rename            | `crates/ltk-manager-workshop/src/layers.rs:123`                  | Renames the directory and the config entry, and updates no open document                      |

## 2. Decisions from review (2026-09-28)

| Question                                | Decision                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Which sandbox the game browser opens in | The project's, as today                                                    |
| What a project sandbox stacks           | The project over the game. Other mods and built-in mods stay out           |
| A game bin a layer ships                | Opens as the layer file and edits it                                       |
| Declarations over rows of a layer file  | The file's value, with a mark naming the declaring layer and value         |
| Stack order                             | `apply_order`, the overlay's. `cmp_for_stacking` goes                      |
| The layer sandbox                       | Reserved in `SandboxRef`, no entry point in v1                             |
| One layer file open in two sandboxes    | One held tree, keyed by the file                                           |
| Layer identity                          | By name. A rename rewrites sandboxes, held documents and saved tabs        |
| Freshness                               | One cached `Sandbox` per project, rebuilt on a layer watch or config write |
| Target layer                            | Frontend `selectedLayer`, sent per write, checked against the stack        |
| Editing game files that are not bins    | Out of scope                                                               |
| The word in the UI                      | Shown, as `Sandbox (<name>) >` leading the object tab header               |
| The header's control                    | A picker between the project and the game                                  |
| Shipping                                | Stages 1, 2, 3 and 6 on one branch                                         |

## 3. Stages

### Stage 1: the sandbox in core

- `SandboxRef` in core with a ts-rs binding: `game`, `project`, and `layer` reserved.
- `Sandbox`, built from a `SandboxRef`, the game install and the object index. It holds the stack
  in `ModProjectLayer::apply_order` and implements `AssetLookup`, `GameCopy` and the project's
  names. It resolves a path or a chunk to the copy the build uses and the layer that holds it.
- A managed `SandboxState` holds one sandbox per project. A `LayerWatches` event or a config
  write rebuilds it.
- `DocumentAssets` and `LayerChunks` read from it, and `cmp_for_stacking` is removed.
- Review the public surface against the Rust API Guidelines and the Microsoft Rust Guidelines
  before merging, and cite the items it follows.

### Stage 2: a bin document opens in a sandbox

- `bin_open(sandbox, asset, entry)`, and `AssetRef::GameChunk` loses `project`.
- A game chunk that a layer ships opens as that layer's file. A declared document exists only for
  a chunk no layer ships.
- `BinDocuments` keys a declared chunk on the sandbox and the asset, and a layer file on the file.
- A layer file shows a mark on each row a declaration overrides, with the declaring layer and the
  value it sets.
- `ReadOnly::Install` is removed. A document in the game sandbox is read-only instead.
- A layer rename updates the open sandboxes and the open documents.
- Frontend: `SandboxContext` at the workshop route, read by `useBinDocument` instead of
  `ProjectContext`. A tab in another sandbox than the route's adds it to its id, and the open
  keys and query keys take the sandbox. The saved tabs keep their ids, so they need no
  migration, and a rename rewrites them.
- A document opened from a link opens in the same sandbox as the document the link is in.

### Stage 3: resolution through the sandbox

- `declared_objects` and `locate_files_near` take a sandbox and search its layers as well as the
  install. A link check asks `locate_files_near`, so `locate_game_files` stays the install's
  own lookup for the game browser and the map backdrop.
- Delete `lookupOrder`, `useLayerCopy` and `joinDeclarations`.
- The bin editor's `useOptionalProjectContext` calls change to `SandboxContext`.
- The target layer reaches the backend through `bin_declare_into` when the selection changes,
  and the backend refuses a layer the project does not hold. A per-write layer on every
  `BinEdit` was not needed.

### Stage 6: the sandbox on screen

- The object tab header starts with `Sandbox (<name>) >`, before the class and the crumb. A file
  tab's toolbar starts with the same options.
- It opens the Sandbox options: a choice between the project and the game, and for a declared
  document the declarations switch, the target layer and the module, which replace the layer
  and module chips. Picking the game opens the same path read-only in the same tab. The option
  is disabled when the game has no copy of the path.
- Copy goes in `messages/en/workshop.json`, with a hover card that explains what a sandbox is,
  because the app has not used the word before.
- `docs/ux/BIN_EDITOR.md` describes the picker under "One row holds the object tab's header and the
  crumb".

### Later: stages 4 and 5

- **Previews.** `read_asset_info` and the `ltk-asset://` token include the sandbox, and
  `src/lib/assetVersions.ts` versions by sandbox.
- **Writes.** `add_files_to_layer`, `delete_layer_content` and `extract_game_files` take a sandbox,
  and `LayerFilesChanged` names the sandboxes a change reaches.

## 4. Acceptance

Each is a test on the branch, and each fails on `main`:

| Test                                                                                                                        | Where                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. A layer of negative priority resolves to the file the overlay routes                                                     | `workshop/chunk_names/tests.rs`, `sandbox/tests.rs`                                                          |
| 2. A link followed out of a declared document opens declared                                                                | `shell/hooks/__tests__/useProjectEditor.test.tsx`, "useOpenDocument in a sandbox"                            |
| 3. A chunk opened in the project sandbox and in the game sandbox gets two document ids                                      | `bin_document/declared/tests.rs`, `documents/hooks/__tests__/useBinDocument.test.tsx`                        |
| 4. A game bin that a layer ships opens as the layer file, with a mark on each row a declaration overrides                   | `sandbox/tests.rs`, `bin_document/declared/tests.rs`, `documents/components/__tests__/OverrideMark.test.tsx` |
| 5. Picking the game in the header opens the game's copy read-only, and the choice is disabled for a path only a layer holds | `documents/components/__tests__/SandboxOptions.test.tsx`, "the sandbox choice"                               |
| 6. A layer rename keeps its open tabs, before and after a restart                                                           | `bin_document/declared/tests.rs`, `shell/state/__tests__/workshopEditor.test.ts`, "renameLayer"              |

## 5. Risks

- **Existing projects show different content.** A game bin a layer ships now opens as the layer
  file, and a negative-priority layer resolves as the build does. The release notes must mention
  both.
- **Document ids change**, so the saved tabs migrate. A tab that fails to migrate closes rather than
  opening the wrong document.
- **One branch is a large review.** Each stage is a separate commit, so it can be reviewed one stage
  at a time.
