# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This file is the primary guidance document for the ltk-manager codebase.

Frontend conventions live in `src/CLAUDE.md` and load when working under `src/`.

## Commands

All commands run from the repo root; see `package.json` scripts for the full list.

```bash
# Verbose backend logging
RUST_LOG=ltk_manager=trace,tauri=info pnpm tauri dev
```

`pnpm generate:licenses` requires `cargo-about` on PATH; its config is `about.toml`.

## Editing Rules

**Always read files before editing them.** Never assume file contents from memory or prior context. When making bulk edits across multiple files, read all target files first, then perform edits.

## Code Style

Avoid trivially descriptive comments. Only comment non-obvious business logic, workarounds, edge cases, or "why" decisions. Document all public Rust APIs with `///` doc comments.

**No redundant comments.** Do not add inline comments that restate what the code already expresses. If the code is descriptive enough (clear variable names, well-known patterns like temp-file-then-rename, obvious API calls), leave it uncommented. This applies to AI-generated code and suggestions too - strip narration comments before committing.

## Backend (Rust) - `src-tauri/src/`

### Workspace Crates

| Crate                     | Knows about                                                | Depends on           | License             |
| ------------------------- | ---------------------------------------------------------- | -------------------- | ------------------- |
| `crates/ritoclient-api`   | The Riot Client's local API only - no manager types at all | nothing in this repo | `Apache-2.0`        |
| `crates/ltk-manager-core` | Manager domain logic, UI-agnostic                          | `ritoclient-api`     | `MIT OR Apache-2.0` |
| `src-tauri`               | Tauri commands, IPC, events                                | both                 | `MIT OR Apache-2.0` |

Dependencies point one way only. `ritoclient-api` takes plain arguments (`Option<&Path>`) and
reports through its own `LaunchObserver` trait - it must never learn about `Config`, `EventSink`
or `AppError`. `core/src/launcher.rs` is the seam that adapts between them.

`ritoclient-api` is **Apache-2.0 only**, deliberately - not an oversight to be tidied back to the
workspace's dual license. It carries its own `LICENSE-APACHE` for that reason. Re-run
`pnpm generate:licenses` after any workspace crate is added or relicensed.

Read-only calls to the Riot Client return `Option`, never `Result`: every caller has a fallback,
and "the client didn't answer" is not a failure worth showing a user. Only launching returns
`LauncherError`.

### Patcher

`patcher/` owns patcher lifecycle (start/stop/status) and thread management with an
`Arc<AtomicBool>` stop flag. `patcher/injector.rs` spawns and supervises the external
`cslol-host.exe` injection host over a stdin/stdout line protocol (`patcher/host.rs`); the
overlay/prefix dir is sent via a `config prefix` command, **not** as an argv. The host internally
drives `cslol-inj.exe`, and with `--elevate` (auto-enabled when League runs as admin) it bridges to
a high-integrity worker via UAC.

### State

Two Tauri-managed states:

- `SettingsState` - App settings (league path, storage path, theme). Access via `State<SettingsState>`, lock with `.0.lock().mutex_err()?.clone()`.
- `PatcherState` - Patcher thread handle and stop flag. Access via `State<PatcherState>`.

### Error Codes

`ErrorCode` variants (defined in `src-tauri/src/error.rs`) serialize as `SCREAMING_SNAKE_CASE`.

Errors can carry JSON context: `AppErrorResponse::new(code, msg).with_context(json!({ "modId": id }))`.

## Log Files

- **Windows:** `%APPDATA%\dev.leaguetoolkit.manager\logs\ltk-manager.log`
- **Linux/macOS:** `~/.local/share/dev.leaguetoolkit.manager/logs/ltk-manager.log`

<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan

<!-- SPECKIT END -->
