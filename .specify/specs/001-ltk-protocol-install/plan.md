# Implementation Plan: LTK Protocol Install

**Branch**: `001-ltk-protocol-install` | **Date**: 2026-03-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-ltk-protocol-install/spec.md`

## Summary

Register a custom `ltk://` URI protocol on Windows so mod distribution websites can trigger one-click mod installs in LTK Manager. The app receives the deep link URL, parses parameters (`url`, `name`, `source`), shows a confirmation dialog, downloads the `.modpkg`/`.fantome` file to a temp directory, validates the format, and installs via the existing mod installation pipeline. Requires `tauri-plugin-deep-link` for protocol handling and `tauri-plugin-single-instance` to prevent duplicate app launches.

## Technical Context

**Language/Version**: Rust (stable) + TypeScript (strict mode)
**Primary Dependencies**: `tauri-plugin-deep-link` v2, `tauri-plugin-single-instance` v2, existing Tauri v2 stack
**Storage**: Existing `library.json` + file-based mod storage (archives + metadata directories)
**Testing**: Manual verification through UI (per constitution); `cargo clippy`, `pnpm check`
**Target Platform**: Windows (initial release)
**Project Type**: Desktop app (Tauri v2)
**Performance Goals**: Mod install from link click to library in <30 seconds
**Constraints**: Single-instance enforcement; HTTPS-only downloads; rate-limit rapid protocol invocations
**Scale/Scope**: Single new confirmation dialog, ~3 new Tauri commands, 1 new frontend module

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle              | Status | Notes                                                                                            |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| I. Code Quality        | PASS   | Follows AGENTS.md conventions; imports from barrel exports; no ternaries in JSX                  |
| II. Type Safety        | PASS   | New commands return `IpcResult<T>`; TS types in `lib/tauri.ts` match Rust structs                |
| III. Testing           | PASS   | Test scenarios defined in spec; manual verification of success + error paths                     |
| IV. UX Consistency     | PASS   | Uses `Dialog` from `@/components`; toast for success/error feedback; loading states for download |
| V. Performance         | PASS   | Download runs off main thread; progress feedback via Tauri events; no UI freeze                  |
| Technology Constraints | PASS   | Tauri v2 plugins; React 19+ frontend; TanStack Query for server state                            |
| Development Workflow   | PASS   | New commands follow 7-step checklist; conventional commits                                       |

No violations. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/001-ltk-protocol-install/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── protocol-schema.md
└── tasks.md
```

### Source Code (repository root)

```text
src-tauri/
├── Cargo.toml                          # Add deep-link + single-instance plugins
├── tauri.conf.json                     # Add deep-link desktop scheme config
├── src/
│   ├── main.rs                         # Register plugins, wire deep-link handler
│   ├── deep_link/
│   │   ├── mod.rs                      # URL parsing, validation, rate limiting
│   │   └── download.rs                 # HTTPS download to temp dir, format validation
│   ├── commands/
│   │   ├── mod.rs                      # Export new deep_link module
│   │   └── deep_link.rs                # Tauri command wrappers for protocol install
│   └── state.rs                        # Add domain_allowlist to Settings

src/
├── lib/
│   └── tauri.ts                        # Add TS types + API bindings for protocol install
├── modules/
│   └── deep-link/
│       ├── index.ts                    # Barrel export
│       ├── api/
│       │   ├── index.ts
│       │   ├── useProtocolInstall.ts   # Mutation hook for confirming install
│       │   └── useDeepLinkListener.ts  # Listen for deep-link events from backend
│       └── components/
│           ├── index.ts
│           └── ProtocolInstallDialog.tsx  # Confirmation dialog
├── modules/
│   └── settings/
│       └── components/
│           └── DomainAllowlistSection.tsx  # Settings UI for allowlist (P3)
└── stores/
    └── deepLink.ts                     # Zustand store for pending protocol install state
```

**Structure Decision**: Follows existing Tauri app pattern — new `deep_link` module in Rust backend with business logic separated from command wrappers, new `deep-link` module in frontend with hooks + components. Reuses existing mod install pipeline (`ModLibrary::install_mod_from_package`).
