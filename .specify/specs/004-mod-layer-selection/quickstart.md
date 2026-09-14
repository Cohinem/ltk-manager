# Quickstart: Mod Layer Selection

**Feature Branch**: `004-mod-layer-selection` | **Date**: 2026-03-18

## Prerequisites

- Rust (latest stable) + Tauri v2 CLI
- Node.js 18+ with pnpm
- The `league-mod` workspace at `X:\dev\league-mod` (for `ltk_overlay` crate changes)

## Setup

```bash
git checkout 004-mod-layer-selection
pnpm install
```

## Development

```bash
# Full dev mode (Rust + React hot reload)
pnpm tauri dev

# Frontend only (skip Rust rebuild)
pnpm dev

# Type checking + lint + format
pnpm check

# Rust checks
cargo clippy -p ltk-manager
cargo fmt -p ltk-manager
```

## Implementation Order

### Phase 1: Backend — Data Model & Commands

1. **Extend `Profile` struct** (`src-tauri/src/mods/mod.rs`)
   - Add `layer_states: HashMap<String, HashMap<String, bool>>` with `#[serde(default)]`

2. **Update `read_installed_mod()`** (`src-tauri/src/mods/library.rs`)
   - Accept profile layer states, derive `ModLayer.enabled` from them instead of hardcoding `true`

3. **Add `set_mod_layers` command** (follow the 7-step checklist in AGENTS.md)
   - Business logic in `src-tauri/src/mods/library.rs`
   - Command wrapper in `src-tauri/src/commands/mods.rs`
   - Register in `main.rs` `generate_handler![]`

4. **Add `enable_mod_with_layers` command** (same 7-step pattern)

5. **Update `get_enabled_mods_for_overlay()`** (`src-tauri/src/mods/library.rs`)
   - Read layer states from active profile
   - Pass as `enabled_layers` on `EnabledMod`

6. **Extend `EnabledMod` in ltk_overlay** (`league-mod/crates/ltk_overlay/src/builder/mod.rs`)
   - Add `enabled_layers: Option<HashSet<String>>`
   - Filter layers in `collect_single_mod_metadata()`

### Phase 2: Frontend — TypeScript Bindings & Hooks

7. **Add TS types + API bindings** (`src/lib/tauri.ts`)
   - `api.setModLayers(modId, layerStates)`
   - `api.enableModWithLayers(modId, layerStates)`

8. **Create hooks** (`src/modules/library/api/`)
   - `useSetModLayers.ts` — mutation with optimistic updates
   - `useEnableModWithLayers.ts` — mutation with optimistic updates

9. **Export through barrel** (`src/modules/library/api/index.ts` → `src/modules/library/index.ts`)

### Phase 3: Frontend — UI Components

10. **Layer toggle list component** — reusable list of layers with Switch toggles
11. **Layer popover** — for accessing layers from mod cards
12. **Layer picker on enable** — popover shown when enabling a multi-layer mod
13. **Enhance ModDetailsDialog** — replace read-only layer display with interactive toggles
14. **Multi-layer badge on ModCard** — visual indicator for mods with multiple layers

### Phase 4: Integration & Cleanup

15. **Layer state cleanup on re-install** — reconcile stale entries
16. **Profile export/import** — ensure layer states are included
17. **Manual testing** — both success and error paths per constitution

## Testing a Multi-Layer Mod

To test, you need a `.modpkg` file with multiple layers. You can create one from the workshop:

1. Open the workshop, create a project
2. Add multiple layers (e.g., "base" + "chroma-red" + "chroma-blue")
3. Add content to each layer's directory
4. Pack the project to produce a `.modpkg`
5. Install the `.modpkg` in the library
6. Verify layers appear and can be toggled

## Key Files

| File                                                    | Role                                       |
| ------------------------------------------------------- | ------------------------------------------ |
| `src-tauri/src/mods/mod.rs`                             | Profile struct, ModLayer struct            |
| `src-tauri/src/mods/library.rs`                         | Layer state logic, overlay integration     |
| `src-tauri/src/commands/mods.rs`                        | Tauri command wrappers                     |
| `src/lib/tauri.ts`                                      | TypeScript API bindings                    |
| `src/modules/library/api/`                              | Frontend hooks                             |
| `src/modules/library/components/ModCard.tsx`            | Mod card UI (badge, popover trigger)       |
| `src/modules/library/components/ModDetailsDialog.tsx`   | Details dialog (interactive layer toggles) |
| `league-mod/crates/ltk_overlay/src/builder/mod.rs`      | EnabledMod struct                          |
| `league-mod/crates/ltk_overlay/src/builder/metadata.rs` | Layer filtering during overlay build       |
