# Dependency candidates

Research note. The evidence is the tree at `58e0a3e`, read on 2026-09-05.

The scope is libraries the workspace has no direct dependency on. A crate marked _in the lock file_
is a transitive dependency of one it has. Adding it to a manifest compiles nothing new.

## Sources

- `package.json`, `Cargo.toml`, `crates/ltk-manager-core/Cargo.toml`, `Cargo.lock`
- `src/lib/tauri.ts` and `src-tauri/src/main.rs` - the two sides of the command table
- `crates/ltk-manager-core/src/error.rs` - `AppError` and the lock extension
- `crates/ltk-manager-core/src/object_index.rs` - `map_bounded`
- `src-tauri/src/commands/shell.rs` - `reveal_in_explorer`
- `src-tauri/src/logging.rs` - the tracing subscriber
- `eslint.config.js`, `vitest.config.ts`, `src-tauri/capabilities/default.json`

## 1. Rust

| Crate               | In the lock file | Replaces                                         |
| ------------------- | ---------------- | ------------------------------------------------ |
| `fs-err`            | no               | the path-less `std::io::Error` in `AppError::Io` |
| `tauri-specta`      | no               | the hand-written command table and `ts-rs`       |
| `rayon`             | yes              | `map_bounded`                                    |
| `parking_lot`       | yes              | `.mutex_err()?` and `AppError::MutexLockFailed`  |
| `strum`             | yes              | hand-written `Display` on unit enums             |
| `insta`             | no               | raw-string `assert_eq!`                          |
| `rstest`            | no               | duplicated test bodies                           |
| `pretty_assertions` | no               | nothing, a diff on failure                       |

### fs-err

`AppError::Io` wraps a bare `std::io::Error` through `#[from]`. Its message is `IO error: ` and the
OS text, with no path in it. The workspace makes 584 calls into `std::fs`.

`fs_err` mirrors the `std::fs` API and returns `std::io::Error`. The error's message names the path
and the operation. The `#[from]` conversion is unchanged. The edit per module is
`use fs_err as fs;`.

### tauri-specta

The command table has 140 entries. Each is written three times: the Rust signature,
`generate_handler!` in `src-tauri/src/main.rs`, and the `api` map in `src/lib/tauri.ts`, 423 lines
long. Types cross with `ts-rs`, exported by `pnpm generate:types` through
`cargo test export_bindings`.

`tauri-specta` generates the TypeScript command bindings, the event bindings and the types from
the Rust command signatures. A new command is one function under `#[tauri::command]` and
`#[specta::specta]`.

The cost. `specta::Type` replaces `ts_rs::TS` on every type that crosses IPC, behind core's `ts`
feature. Specta types a command returning `Result<T, AppError>` as
`{ status: "ok", data: T } | { status: "error", error: AppError }`. The `IpcResponse` envelope in
`tauri.ts` and the `Result` util in `src/utils/result.ts` meet that shape in one adapter. This is
the largest migration on the list. Section 6 is the adoption shape.

### rayon

`map_bounded` in `object_index.rs` is a pool of its own: `std::thread::scope`, an `AtomicUsize`
cursor and a `Mutex<Option<R>>` per slot. `Budget::map` in the same crate is the same shape with a
weight rule.

A rayon scoped pool with `par_iter().map()` returns the same ordered `Vec<Option<R>>`. The
`called_off` check lives in the closure. `ThreadPoolBuilder::num_threads(workers)` keeps the worker
bound.

### parking_lot

There are 54 `.mutex_err()?` calls. `AppError::MutexLockFailed` is the variant they map to.
`object_index.rs` unwraps poison with `PoisonError::into_inner`.

`parking_lot::Mutex` has no poisoning. `lock()` returns the guard. The lock pattern in
`src-tauri/CLAUDE.md`, `.0.lock().mutex_err()?.clone()`, is a convention this crate changes.

### strum

Fifteen `Display` and `FromStr` impls are hand-written. Five are on unit enums: `ErrorKind`,
`CodeKind`, `InjectionStage`, `Consequence`, `EvidenceSource`. `#[derive(Display)]` with
`#[strum(serialize = "...")]` per variant is the replacement. `RuleId` is a newtype over
`&'static str`, outside strum's scope.

### insta, rstest, pretty_assertions

Three suites assert on raw-string literals: `diagnostics/game_log.rs`,
`problems/rules/bin_property_type/tests.rs`, `problems/walk/tests.rs`. `insta` keeps the expected
text in a `.snap` file beside the test. `cargo insta review` accepts a changed one. The problems
report and the diagnostic report are snapshot shapes.

The workspace has 1299 `#[test]` functions. Two of them loop over cases. `rstest` parametrises a
test with `#[case]` and shares setup as a fixture.

`pretty_assertions` prints a diff when `assert_eq!` fails on a struct.

`cargo-nextest` is a runner, not a dependency. It runs one process per test. `--retries` covers
the thread-spawning tests.

## 2. Tauri plugins

### tauri-plugin-opener

Tauri 2.1 deprecates `open` in `@tauri-apps/plugin-shell`. Four files under `src/` import it.
`openUrl` from `@tauri-apps/plugin-opener` is the replacement.

`revealItemInDir` replaces `reveal_in_explorer` in `src-tauri/src/commands/shell.rs`, a spawn of
`explorer`, `open` or `xdg-open` by platform. The capability entries are `opener:allow-open-url`
and `opener:allow-reveal-item-in-dir` in place of `shell:allow-open`.

### tauri-plugin-devtools

CrabNebula's inspector for IPC calls, events and tracing spans. It installs the tracing
subscriber. `src-tauri/src/logging.rs` installs one too. The plugin sits behind
`debug_assertions`, and that build skips the appender layer.

### tauri-plugin-log, rejected

It installs a `log` logger. The workspace logs through `tracing`. That is two loggers.

Thirty-two `console.*` calls in `src/` reach nothing in a release build. A `log_frontend` command
routed into `tracing` is ten lines.

## 3. Frontend

| Package                           | Replaces                              |
| --------------------------------- | ------------------------------------- |
| `knip`                            | nothing, unused exports go unreported |
| `react-error-boundary`            | nothing, no boundary exists           |
| `@tanstack/eslint-plugin-query`   | nothing                               |
| `@tanstack/react-router-devtools` | nothing                               |
| `react-scan`                      | nothing                               |
| `eslint-plugin-jsx-a11y`          | nothing, optional                     |

### knip

Imports go through barrels. An export a barrel re-exports with no consumer is invisible to `tsc`
and to eslint. `knip` reports unused exports, unused files and unused dependencies.

### react-error-boundary

There is no error boundary in `src/`. The router's `errorComponent` catches a throw during a route
render. A throw inside a dialog or the palette unmounts the tree to a blank window. `resetKeys`
re-mounts a region on a key change. `useErrorBoundary` carries an async error into the boundary.

### @tanstack/eslint-plugin-query

`exhaustive-deps` checks a query key against the closure it captures. `no-rest-destructuring` and
`stable-query-client` are the other two rules.

### @tanstack/react-router-devtools

`main.tsx` holds a commented-out `ReactQueryDevtools`. The router devtools panel shows matched
routes, loader state and search params. Both mount under `import.meta.env.DEV`.

### react-scan

Development only. It paints each re-render on the DOM. The hotspots are the virtualised mod grid,
the object index rows and the palette. The mount is one import in `main.tsx` under
`import.meta.env.DEV`.

### eslint-plugin-jsx-a11y

Base UI primitives carry their own roles and keyboard handling. Custom clickable rows and cards
are outside them. Optional.

## 4. Considered and rejected

| Library                          | Reason                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `immer`                          | One persisted store, `appMark`. No deep update in a store.                        |
| `neverthrow`                     | `src/utils/result.ts` is that type.                                               |
| `msw`                            | The frontend makes no HTTP call. IPC is mocked in `src/test/mocks/tauri.ts`.      |
| `moka`                           | `LruCache` behind a `Mutex` in `game_wads.rs` is one cache with one reader.       |
| `serde_with`                     | Three `*_with` attributes in the workspace.                                       |
| `tauri-plugin-store`             | `config.rs` owns settings.                                                        |
| `tauri-plugin-clipboard-manager` | `navigator.clipboard` works in WebView2 on `tauri://localhost`.                   |
| `color-eyre`, `miette`           | `AppError` is a typed enum the frontend describes. A report type has no consumer. |
| `arc-swap`                       | No settings read on a hot path.                                                   |

## 5. Renames, not additions

`framer-motion` 11 is `motion` at 12. The package is renamed and the API is the same. The upgrade
is an import rewrite.

## 6. tauri-specta, incremental adoption

The wire format is the seam. `IpcResult` serialises to `{ ok, value }` and `{ ok, error }`. The
command names are the strings in `generate_handler!`. A backend on `tauri-specta` with the same
names and the same envelope is invisible to the frontend. The frontend moves one module at a time
behind the `api` map.

### Step 1. Types

The 215 IPC types carry `#[cfg_attr(feature = "ts", derive(ts_rs::TS))]`. `specta::Type` goes
into the same derive list, with `specta` an optional dependency under the same feature. The two
attribute namespaces are disjoint. Both derives read the serde attributes, and every shape in use
is covered: `AppErrorResponse` tagged on `code` with `rename_all_fields`, ten tagged enums, two
untagged, two `flatten`.

Two things are matched by hand:

- The four `#[ts(...)]` overrides get a `#[specta(...)]` twin. The `Utf8PathBuf` fields go through
  `ts(as = "Option<String>")`, and `#[specta(type = Option<String>)]` is the same statement.
- `specta-typescript` refuses 64-bit integers by default. There are 83 `u64`, `i64` and `usize`
  fields. `BigIntExportBehavior::Number` matches what `ts-rs` emits.

Feature flags cover the external types: `chrono`, `serde_json`, `indexmap`, `uuid`, `url`.
`PathBuf` maps to `string` in both exporters.

### Step 2. The envelope

`IpcResult<T>` has a hand-written `Serialize`. It gets a hand-written `specta::Type` of the same
size, emitting `{ ok: true; value: T } | { ok: false; error: AppError }`. A generated command
returns `Promise<IpcResult<T>>`. That type is structurally the frontend's `Result<T>`, and
`toResult` is an identity over it.

A command returning `Result<T, AppErrorResponse>` is the alternative. Specta puts its own
`{ status, data }` envelope on the wire for that, and the frontend needs an adapter. Rejected.

### Step 3. The handler

Two shapes exist.

All 140 commands at once: `#[specta::specta]` on each, and `collect_commands!` in place of
`generate_handler!`. The names and the envelope are unchanged. The frontend is unchanged. This is
one mechanical PR on top of step 1.

One command at a time: Tauri's handler consumes the `Invoke` and returns `false` on a miss. Two
handlers cannot fall through to each other. A dispatch on `invoke.message.command()` chooses the
handler, keyed on a `const MIGRATED: &[&str]` beside `collect_commands!`. The `Invoke` reaches
one of them. The list and the legacy handler go together.

The first shape is the recommendation. Step 1 covers the types wholesale, and the per-command
attribute is one line. The split buys nothing.

### Step 4. Export

The `tauri_specta::Builder` is built in a test as well as in `setup`. `pnpm generate:types` keeps
its meaning and writes one `src/lib/bindings.ts`. CI does not check binding freshness. The plan
leaves that as it is.

### Step 5. Frontend, one module per PR

An `api` entry's body becomes the generated function, or the call site imports `commands`
directly. Three raw `invoke("reveal_in_explorer")` calls in library and workshop are outside the
map and move the same way. Type imports move module by module. The `ts-rs` and specta aliases are
structurally identical, and a module imports from either.

The last PR deletes `src/lib/bindings/`, `ts-rs`, `TS_RS_EXPORT_DIR` in `.cargo/config.toml` and
the `api` map.

### Step 6. Events

The 35 emits and 12 listeners keep `useTauriEvent`. `collect_events!` is a separate step, and an
optional one.

### The pin

crates.io serves `tauri-specta` and `specta` at `2.0.0-rc.25`. The IPC boundary sits on a
pre-release pin. That is the decision. The plan above is the same on either side of it.
