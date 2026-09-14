# Implementation Plan: Mod Library Folders

**Branch**: `001-mod-folders` | **Date**: 2026-03-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-mod-folders/spec.md`

## Summary

Add a folder grouping system to the mod library that lets users organize mods into named, single-level folders with batch enable/disable. Folders are a library-level concept persisted in `library.json` alongside the existing mod/profile data. The frontend renders folders as navigable cards in grid view and expandable rows in list view, with full drag-and-drop support for moving mods into/out of folders.

## Technical Context

**Language/Version**: Rust (stable) backend, TypeScript (strict) frontend
**Primary Dependencies**: Tauri v2, React 19, TanStack Query, @dnd-kit/core + @dnd-kit/sortable, Zustand, base-ui (wrapped in @/components)
**Storage**: JSON file (`library.json`) — extend `LibraryIndex` struct with a `folders` field
**Testing**: `pnpm check` (typecheck + lint + format), `cargo clippy`, manual UI verification
**Target Platform**: Windows (primary), Linux/macOS (secondary) — Tauri desktop app
**Project Type**: Desktop application (Tauri)
**Performance Goals**: Folder toggle (batch enable/disable) completes in <200ms for up to 50 mods; DnD visual feedback within 100ms
**Constraints**: Must not break existing library behavior when no folders exist (backward-compatible `library.json` migration via serde defaults)
**Scale/Scope**: Typical user has 10–100 mods, 1–10 folders

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle          | Status | Notes                                                                                                 |
| ------------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| I. Code Quality    | PASS   | All new code follows AGENTS.md conventions; no ternaries in JSX; barrel imports only                  |
| II. Type Safety    | PASS   | New commands return `IpcResult<T>`; TS types auto-generated via ts-rs; `Result<T,E>` on frontend      |
| III. Testing       | PASS   | Manual verification required; `pnpm check` + `cargo clippy` must pass                                 |
| IV. UX Consistency | PASS   | Uses `@/components` exclusively; toasts for async feedback; loading states for >200ms ops             |
| V. Performance     | PASS   | Batch toggle is a single `mutate_index` call; folder state is lightweight; DnD uses existing @dnd-kit |
| Tech Constraints   | PASS   | Tauri v2, Rust backend, React+TS frontend, TanStack Query for server state, Zustand for client state  |
| Dev Workflow       | PASS   | Feature branch targets main; follows 7-step command checklist                                         |

No violations. Gate passed.

## Project Structure

### Documentation (this feature)

```text
specs/001-mod-folders/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (Tauri command contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src-tauri/src/
├── mods/
│   ├── mod.rs           # Add LibraryFolder struct, ROOT_FOLDER_ID, extend LibraryIndex with folders + folder_order
│   ├── library.rs       # Update install/uninstall to be folder-aware, populate folder_id on InstalledMod
│   └── folders.rs       # (NEW) Folder business logic methods on ModLibrary (CRUD, toggle, reorder, sync)
├── commands/
│   ├── mod.rs           # Export new folder commands
│   └── folders.rs       # (NEW) Tauri command wrappers for folder operations

src/
├── lib/
│   └── tauri.ts         # Add Folder type, folder API bindings
├── modules/library/
│   ├── api/
│   │   ├── keys.ts              # Add folder query keys
│   │   ├── queries.ts           # Add useInstalledMods response includes folder info
│   │   ├── useFolderMutations.ts  # (NEW) Create/rename/delete/toggle folder hooks
│   │   └── useMoveMod.ts         # (NEW) Move mod to/from folder hook
│   └── components/
│       ├── FolderCard.tsx         # (NEW) Grid view folder card with thumbnails
│       ├── FolderRow.tsx          # (NEW) List view expandable folder row
│       ├── FolderHeader.tsx       # (NEW) Header when navigated into a folder (grid view)
│       ├── FolderContextMenu.tsx  # (NEW) Right-click context menu using ContextMenu from @/components
│       ├── LibraryContextMenu.tsx # (NEW) Right-click context menu for empty library space
│       ├── CreateFolderDialog.tsx # (NEW) Folder name input popover
│       ├── DroppableFolderCard.tsx# (NEW) Folder card with useDroppable for DnD
│       ├── DroppableFolderRow.tsx # (NEW) Folder row with useDroppable for DnD
│       ├── FolderCardThumbnail.tsx# (NEW) 2x2 thumbnail grid helper
│       ├── SortableModList.tsx    # Extend to handle folder items + drop targets
│       ├── ModCard.tsx            # Add "Remove from folder" context menu item
│       └── LibraryToolbar.tsx     # Add "New Folder" button
├── stores/
│   └── libraryView.ts    # (NEW) Zustand store for folder UI state (expanded rows, current folder in grid)
```

**Structure Decision**: Follows the existing Tauri app structure. Backend adds a `folders.rs` module for folder business logic (methods on `ModLibrary`) and a matching command wrapper file. Frontend extends the library module with new components and hooks. No new top-level directories needed.

## Complexity Tracking

No violations to justify.
