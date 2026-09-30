# ADR-0059: An IPC service is a Tauri plugin

- **Status:** Accepted (2026-09-30)
- **Date:** 2026-09-30
- **Crates:** `src-tauri`
- **Related:** [ADR-0029](0029-the-generated-bindings-describe-the-wire-format-they-do-not-change-it.md),
  whose bindings a service's commands are generated into.
  [ADR-0051](0051-a-bin-document-takes-every-edit-through-one-command.md), whose one command per
  family of edits a service keeps.

## Context and problem statement

The commands sat in one table of 242. Core already holds the services, such as `ModLibrary`,
`Workshop` and `BinDocuments`, but nothing at the boundary says which commands belong to one. The
grouping in `src/lib/tauri.ts` is written by hand, and a test matched an invoke on a string.

## Decision

**A service is an inline Tauri plugin, named once in `src-tauri/src/services/table.rs`.** A row
names the service's module, its plugin name and its commands. `build.rs` reads the table to
register each plugin's permissions, and `services/mod.rs` reads it to implement `Service`, whose
commands the frontend invokes as `plugin:<name>|<command>`. A capability grants a service as
`<name>:default`.

**Every type stays in `src/lib/bindings.ts`.** The app's builder takes each service's types, and
a service's commands are written to `src/lib/ipc/<service>.ts`, importing their types from it.
The export fails where a service renders a type unlike the shared file, or where a command is in a
service and in the app's table.

**Each generated file exports `commandNames`,** the name each of its functions invokes, and
`src/test/commandNames.ts` gathers them, so a test names a command through the type checker.

A service manages the state that depends on no other service's setup, because Tauri sets a plugin
up before the app. The app-update service holds the update on offer and runs the installer as the
main window closes. The library's state stays in `setup`, which builds it out of the settings.

The commands no service owns yet stay in `ipc.rs` until their service is cut.

## Consequences

- **Positive:** a service's commands, permissions and bindings come out of one row, so they cannot
  drift apart.
- **Positive:** a capability can grant one service to one window.
- **Negative:** the service files are cut out of the exporter's output at its `/* Types */`
  marker. A `tauri-specta` release that moves the marker fails the export, not the build.
- **Negative:** a service cannot take a name another plugin holds. The updater service is
  `app-update` because `tauri-plugin-updater` holds `updater`.
- **Neutral:** events keep their string names. Typed events need `tauri-specta`'s `derive` feature.
- **Neutral:** a command keeps its own patcher guard. One guard per service is a decision per
  service, taken when its commands fold.
