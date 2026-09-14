# Implementation Plan: Mod Layer Selection

**Branch**: `004-mod-layer-selection` | **Date**: 2026-03-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-mod-layer-selection/spec.md`

## Summary

Enable users to view, toggle, and configure individual mod layers from the library UI. Layers are profile-scoped: each profile stores its own layer enabled/disabled states per mod. The overlay builder is extended to respect these states, excluding disabled layers during the build. A layer picker is shown when enabling multi-layer mods for the first time.

## Technical Context

**Language/Version**: Rust (latest stable) + TypeScript (strict mode, React 19+)
**Primary Dependencies**: Tauri v2, TanStack Query, TanStack Form, base-ui-components (wrapped), ltk_overlay crate
**Storage**: JSON file (`library.json`) — extended `Profile` struct with `layer_states` field
**Testing**: `pnpm check` (typecheck + lint + format), `cargo clippy`, `cargo fmt`, manual UI verification
**Target Platform**: Windows desktop (Tauri WebView), with Linux/macOS support
**Project Type**: Desktop application (Tauri: Rust backend + React frontend)
**Performance Goals**: Layer toggle UI feedback < 1s, overlay invalidation in background
**Constraints**: Single-layer mods must have zero additional UI complexity; backward-compatible with existing `library.json`
**Scale/Scope**: Typically 10-50 installed mods, 1-10 layers per mod

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                         | Status | Notes                                                                                                 |
| --------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| I. Code Quality & Maintainability | PASS   | Follows AGENTS.md conventions: barrel imports, no ternaries in JSX, doc comments on public Rust APIs  |
| II. Type Safety & Error Handling  | PASS   | New commands return `IpcResult<T>`, TS types auto-generated via `ts-rs`, `Result<T,E>` on frontend    |
| III. Testing Standards            | PASS   | Manual verification plan documented, `pnpm check` + `cargo clippy` required before merge              |
| IV. User Experience Consistency   | PASS   | Uses `@/components` (Switch, Popover, Dialog), toast notifications for async feedback, color tokens   |
| V. Performance Requirements       | PASS   | Layer toggles are lightweight index mutations; overlay invalidation is background; no main-thread I/O |
| Technology Constraints            | PASS   | Tauri v2, React 19, TanStack Query for server state, Zustand avoided for this feature                 |
| Development Workflow              | PASS   | 7-step Tauri command checklist, conventional commits, feature branch targets main                     |

**Post-Phase 1 re-check**: All gates still pass. No new dependencies introduced. `HashMap` for layer states is stdlib — no external crate needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-mod-layer-selection/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: data model changes
├── quickstart.md        # Phase 1: implementation quickstart
├── contracts/
│   └── tauri-commands.md # Phase 1: Tauri command contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
# Backend (Rust)
src-tauri/src/
├── mods/
│   ├── mod.rs           # Profile struct (add layer_states field)
│   └── library.rs       # Layer state logic, read_installed_mod, overlay integration
├── commands/
│   └── mods.rs          # New: set_mod_layers, enable_mod_with_layers commands
├── overlay/
│   └── mod.rs           # Pass enabled_layers to EnabledMod
└── main.rs              # Register new commands in generate_handler![]

# Frontend (React + TypeScript)
src/
├── lib/
│   └── tauri.ts         # New API bindings: setModLayers, enableModWithLayers
├── modules/library/
│   ├── api/
│   │   ├── useSetModLayers.ts         # New mutation hook
│   │   ├── useEnableModWithLayers.ts  # New mutation hook
│   │   └── index.ts                   # Barrel export updates
│   ├── components/
│   │   ├── LayerToggleList.tsx        # New: reusable layer toggle list
│   │   ├── LayerPopover.tsx           # New: popover for layer access from cards
│   │   ├── LayerPickerPopover.tsx     # New: on-enable layer picker
│   │   ├── ModCard.tsx                # Modified: add layer badge + popover trigger
│   │   └── ModDetailsDialog.tsx       # Modified: interactive layer toggles
│   └── index.ts                       # Barrel export updates

# External dependency (league-mod workspace)
league-mod/crates/ltk_overlay/src/
├── builder/
│   ├── mod.rs           # EnabledMod struct (add enabled_layers field)
│   └── metadata.rs      # Filter layers in collect_single_mod_metadata
```

**Structure Decision**: Follows existing project layout conventions. New components live in the library module where they're used. No new modules or directories beyond what's shown above.

## Complexity Tracking

No constitution violations to justify. The implementation uses existing patterns throughout:

- `HashMap` for layer states (stdlib, no new dependency)
- `Popover` component (already in `@/components`)
- Mutation hooks follow `useToggleMod` pattern exactly
- Profile extension is additive with `#[serde(default)]` for backward compatibility
