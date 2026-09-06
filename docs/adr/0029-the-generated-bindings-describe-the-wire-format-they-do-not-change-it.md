# ADR-0029: The generated bindings describe the wire format, they do not change it

- **Status:** Accepted (2026-09-06)
- **Date:** 2026-09-06
- **Crates:** `src-tauri`, `ltk-manager-core`
- **Related:** [ADR-0017](0017-the-frontend-owns-every-user-facing-string.md), which leaves
  `AppError` a code and typed fields rather than a sentence, so the error crosses either
  exporter unchanged. The candidates and the adoption shape are
  `docs/research/dependency-candidates.md`.

## Context and problem statement

A command is written three times: the Rust signature, `generate_handler!` in
`src-tauri/src/main.rs`, and the `api` map in `src/lib/tauri.ts`. The types cross with `ts-rs`,
exported by `pnpm generate:types`. A rename in one of the three is a runtime failure and not a
compile error.

`tauri-specta` writes the TypeScript function, its arguments and its return type out of the Rust
signature. A command returning `Result<T, E>` reaches the frontend through an envelope of
specta's own, `{ status: "ok", data } | { status: "error", error }`.

The wire format is `IpcResult`: `{ ok: true, value }` and `{ ok: false, error }`, which
`src/utils/result.ts` mirrors and every call site reads. A table of 140 commands does not move
in one edit, and a half-moved table that speaks two wire formats is two frontends.

## Decision

**The generated bindings carry the command names and the `IpcResult` envelope the hand-written
table already carries.** A module moves onto `tauri-specta` on its own, and a call site sees the
move only when it switches to the generated function.

A command returns `IpcResult<T>`. `IpcResult` carries a hand-written `specta::Type` beside its
hand-written `Serialize`, emitting the two objects that impl writes. Specta's own envelope is
unused, so `toResult` stays an identity over the response.

`src-tauri/src/ipc.rs` names the migrated commands once, as both the `collect_commands!` list and
the dispatch list. A handler takes the `Invoke` by value, so two of them cannot fall through to
each other and the dispatch picks on the command name.

The bindings are one committed file, `src/lib/bindings.gen.ts`. `src/lib/tauri.ts` re-exports a
migrated module's types out of it over the `ts-rs` barrel, so one name has one definition.

`specta` and `tauri-specta` are pinned at an exact release candidate, and `specta-typescript` at
the patch those two carry. The three move together.

The research note recommends the whole table in one edit and calls the move per module a split that
buys nothing. This decision takes the split. Four commands are one reviewable change with a working
frontend at the end of it, where 140 are not.

## Consequences

- **Positive:** a migrated command's name and arguments are the Rust signature's. The three
  writings become one, and a rename is a compile error at the call site.
- **Positive:** the frontend's `Result<T>` is the response type. No adapter sits between the
  bindings and the call sites, and a module that has not moved is unaffected by one that has.
- **Negative:** two invoke handlers run, and a command reaches the wrong one when its name is
  in `migrated!` and its function is not, or the reverse. One macro writes both lists, and a
  test holds the bindings equal to the dispatch.
- **Negative:** the IPC boundary sits on a pre-release pin.
- **Neutral:** `specta` types an `f32` as `number | null`, where `ts-rs` types it `number`. The
  wire has always carried `null` for a NaN or an infinity, so a migrated type states what the
  format does rather than changing it.
- **Neutral:** the `ts` feature of `ltk-manager-core` carries both derives. A type crossing IPC
  has a `ts_rs::TS` and a `specta::Type` until the last module moves.
- **Neutral:** the last module to move deletes `src/lib/bindings/`, `ts-rs`, `TS_RS_EXPORT_DIR`
  and the `api` map, and renames the generated file.
