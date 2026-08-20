# Riot Client integration on the new `ritoclient` API

> Status: **proposed**, nothing started here. Written 2026-08-19 against this repo's
> `image-preview` branch. Re-verified against `ritoclient` at `b6b2924`, which is the revision to
> pin: the upstream half of this plan is built, so nothing below waits on it any more. The upstream
> working copy is `X:\lol\dev\ritoclient`.

We are pinned to the Riot Client crate's first commit. Nine commits later it is a three-crate
workspace with a `Launcher` shell, a session model, and a fix for two launch bugs the pinned
revision still has. Migrating is a rename and a builder call. What it buys is **session lifetime**:
the manager currently learns that a launch request was _delivered_ and never learns anything again,
and every "did League actually start, and why did it die" question in the app is answered by
scanning the process table on a five-second timer.

## 1. Where we are

| Piece           | Where                                                     | Shape today                                                                               |
| --------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dependency      | `Cargo.toml:8`                                            | `ritoclient-api`, git rev `eb6bf7a` - the "scaffold" commit of 2026-07-28                 |
| Seam            | `crates/ltk-manager-core/src/launcher.rs`                 | Three free functions and a `SinkObserver`. No type owns the launch                        |
| Commands        | `src-tauri/src/commands/launcher.rs`                      | `launch_league`, `get_launch_availability`. `LaunchState` keeps one launch in flight      |
| Error mapping   | `src-tauri/src/error.rs:252`                              | One `ErrorCode` per `LauncherError` variant, whole error as JSON context                  |
| Events          | `crates/ltk-manager-core/src/events.rs:16`                | `LaunchProgress` / `LaunchStage` re-exported from the crate, emitted as `launch-progress` |
| Process checks  | `crates/ltk-manager-core/src/diagnostics/processes.rs:93` | `processes::list_matching` over `RIOT_PROCESS_NAMES`                                      |
| "Is League up?" | `src/modules/launcher/api/useLaunchAvailability.ts`       | `get_launch_availability` polled every 5 s, purely a process scan                         |
| Play flow       | `src/modules/launcher/api/usePlay.ts`                     | Patcher, then launch. Ends at `finally { setStep("idle") }` the moment the POST returns   |
| Status bar      | `src/modules/launcher/components/SessionBar.tsx`          | Steps for build / patcher / launch. Nothing after "League is starting."                   |
| Bindings        | `src/lib/bindings/Launch*.ts`, `LauncherError.ts`         | Six files the crate claims to generate and does not - see section 6                       |
| Docs            | `CLAUDE.md`                                               | Crate table still lists `crates/ritoclient-api` as a workspace member                     |
| Licenses        | `public/third-party-licenses.json`                        | Names `ritoclient-api` only                                                               |

## 2. Why this is not a version bump

Two of those commits fix behaviour our pinned revision gets wrong. Both were found by
re-reading Riot Client `136.0.3.4787`, and both are recorded in the upstream
`docs/plans/launch-flow-136.md`.

| What ships today                                                                                                                                                                  | What it costs                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold start spawns `RiotClientServices.exe --launch-product=… --launch-patchline=…` and returns `Ok(ColdStart)` without a single further check (`launch.rs:159` at the pinned rev) | On an install inside the direct-launch rollout, `DirectLaunchMiddleware` shows the window and returns **without launching**. We have already told the user it worked. This is the _common_ path for a mod launcher - no client running |
| The tray wake calls `wake_with_launch_args(target)` (`launch.rs:219` at the pinned rev)                                                                                           | On 136 that is a second, untracked launch down the gated lifecycle path, with no session id back, racing the `product-launcher` POST our own wait loop is about to send                                                                |

Upstream now drives `POST /product-launcher/…` for every launch, wakes with an empty argv, and asks
`is-launch-request-pending` before it asks for anything. We inherit all of that by moving the pin.

## 3. The new surface

Three crates, and we depend on one:

| Crate             | What it is                                          | We touch it        |
| ----------------- | --------------------------------------------------- | ------------------ |
| `ritoclient`      | Launch and session orchestration, plus the facade   | Yes                |
| `ritoclient-api`  | Generated namespaces and models                     | Through the facade |
| `ritoclient-core` | Transport, retries, routes, lockfile, process table | Through the facade |

`Launcher` is the shell the README calls out. It carries the three things every operation needs -
the target, the game executable, the install root - and turns the free functions into methods on it.
It is `Clone + Send + Sync` and explicitly meant to be built once and kept, which is what makes it
the right thing to hold in Tauri state rather than rebuild per command.

```rust
let launcher = Launcher::builder(target, LEAGUE_CLIENT_EXE)
    .product_root(league_path)
    .on_progress(|p| sink.emit(BackendEvent::LaunchProgress(p)))
    .build()?;

let outcome = launcher.launch_with_stop(&stop)?;  // delivered, not started
let session = launcher.watch_session(id, observer);
let hide = launcher.hide_during_session();
launcher.close()?;                                // DELETE the product
```

Everything the manager needs is a method on that one type. `launch()` is still there for a caller
with nothing to cancel, and `session()` / `session_id()` answer without a launch having happened at
all, which is what makes a restart recoverable.

## 4. Migration map

| Ours today                                        | New                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ritoclient-api = { git = …, rev = eb6bf7a }`     | `ritoclient = { git = …, rev = b6b2924 }`                                                              |
| `features = ["ts"]` on both manifests             | **Gone.** The feature no longer exists upstream, so this is a build error, not a choice. See section 6 |
| `ritoclient_api::launch(root, target, exe, obs)`  | `Launcher::builder(target, exe).product_root(root).observer(obs).build()?.launch()`                    |
| `ritoclient_api::availability(root, exe)`         | `Launcher::availability()`, or the free `availability(root, exe)`                                      |
| `ritoclient_api::hide_for_play_session(exe)`      | `Launcher::hide_during_session() -> SessionWatch`                                                      |
| `LauncherError::LaunchRefused { .. }`             | `LauncherError::Refused { .. }`, and the enum is now `#[non_exhaustive]`                               |
| -                                                 | `LauncherError::Misconfigured { reason }`, from an empty game process name                             |
| -                                                 | `LauncherError::Stopped`, from a cancelled launch. **Not a failure** - see phase 4                     |
| `Patchline::install_root(…)` as a path            | `PatchlineExt::install_root`, behind `use ritoclient::prelude::*`                                      |
| `product.patchline(id)`, `installed_patchlines()` | `ProductExt`, same prelude                                                                             |
| `LaunchRoute` with three variants                 | Four - `Adopted` joins them - and `#[non_exhaustive]`                                                  |
| `LaunchStage` with eight variants                 | Nine - `Stopped` joins them - and `#[non_exhaustive]`                                                  |
| `ritoclient_api::processes::…`                    | `ritoclient::processes::…`, unchanged otherwise                                                        |
| `ritoclient_api=debug` in `logging.rs:18,51`      | `ritoclient=debug,ritoclient_core=debug`                                                               |

`launchStageLabels` in `SessionBar.tsx` is a `Record` over the stage union, so `stopped` is a
typecheck failure until it has a line. It needs one that does not read as a failure, and
`useLaunchProgress`'s `TERMINAL_STAGES` needs it too. `Availability`'s fields are unchanged, so
`LaunchAvailability`'s `From` impl survives as written.

## Phase 1 - Move the pin, no behaviour change

1. `Cargo.toml`: rename the workspace dependency and move the rev to `b6b2924`. Keep the comment
   about why both dependents read it from one place.
2. **Section 6 first, in the same commit.** The `ts` feature is gone upstream, so
   `crates/ltk-manager-core/Cargo.toml:12` and `src-tauri/Cargo.toml:30` do not build until the five
   remaining IPC types are manager-owned. This is no longer a separable cleanup.
3. `crates/ltk-manager-core/src/launcher.rs`: rewrite the seam per section 4. Keep `LEAGUE_CLIENT_EXE`,
   `league_target()` and `LaunchAvailability` exactly as they are - they exist because the crate names
   no products, and that has not changed.
4. Hide-on-launch currently skips `AlreadyRunning`. It must skip `Adopted` too: neither route
   launched anything, and hiding a window out from under a session we merely adopted is the same lie.
5. `src-tauri/src/error.rs`: rename the `LaunchRefused` arm to `Refused`, map `Misconfigured` to
   `ErrorCode::LaunchFailed`, and add the wildcard arm `#[non_exhaustive]` now requires. `Stopped`
   gets its own code, because the frontend has to tell a cancel apart from a failure.
6. `useLaunchErrorToast.ts` reads the refusal tag in two places, and must show nothing at all for
   `Stopped`. A toast saying the launch failed, behind a Cancel button the user just pressed, is the
   one outcome this variant exists to prevent.
7. `SessionBar.tsx`: a `stopped` label, worded as the user's own action. `useLaunchProgress.ts`:
   `stopped` joins `TERMINAL_STAGES`.
8. `CLAUDE.md`: the crate table's `crates/ritoclient-api` row is now an external Apache-2.0 dependency
   named `ritoclient`, not a workspace member. Fix the row and the `LaunchObserver` sentence under it.
9. `pnpm generate:licenses`. The manifest gains `ritoclient` and `ritoclient-core`.

Done when `cargo clippy --all-targets`, `cargo doc --no-deps`, `pnpm check` and a real launch on a
cold machine all pass.

## Phase 2 - One `Launcher`, held in state

The seam's free functions become methods on a type, which is also the shape the rest of this
codebase uses. `core::launcher::LeagueLauncher` wraps a `ritoclient::Launcher` plus the manager's
config, and `src-tauri` keeps one behind a `LauncherState` alongside `SettingsState` and
`PatcherState`.

Two things make this worth doing rather than building a `Launcher` per command:

- The observer is a construction-time property. Building per command means re-wrapping the event
  sink on every call, which is how the sink ends up threaded through five signatures.
- `SessionWatch` and the session id need somewhere to live that outlives the command. State is that
  place.

`league_path` can change in Settings, so the state holds `Option<Launcher>` and rebuilds on a config
change rather than caching a stale install root. `LaunchState`'s in-flight mutex stays as it is.

## Phase 3 - Session lifetime

This is the reason to migrate. `LaunchOutcome.session_id` is populated on every route that has one,
`ALREADY_RUNNING` included, and the client's own record carries `phase`, `version`, `exit_code` and
`exit_reason`.

The polling is upstream's, not ours. `ritoclient`'s `session` module is the declared home for
orchestration that outlives a request, and it now carries the watcher:

```rust
let watch = launcher.watch_session(id, move |event| sink.emit(event.into()));
```

The observer runs on the watching thread, so the closure must only map and emit. `SessionWatch` does
not cancel on drop, so `LeagueLauncher` holds it and calls `stop()` deliberately.

`SessionEvent` arrives in a fixed order - `Opened` once, then any number of `PhaseChanged`, then
exactly one of `Ended` or `Lost`. Map it onto the manager's registry:

| `SessionEvent`                | `BackendEvent`                                                   |
| ----------------------------- | ---------------------------------------------------------------- |
| `Opened { phase, version }`   | `SessionStarted { phase, version }`                              |
| `PhaseChanged { from, to }`   | `SessionChanged { phase }`                                       |
| `Ended { exit_code, reason }` | `SessionEnded { exitCode, exitReason }`                          |
| `Lost`                        | `SessionEnded` with no reason. The UI must not invent one either |

`Lost` is the case where the Riot Client exited and took the record with it while the game also
stopped. It is a real ending with nothing to say about why, and wording it as a crash would be a
guess.

Stop the watch on app exit and on a launch that failed after the id was minted. Nothing else needs
to: the watcher exits on its own terminal event.

What that fixes on the frontend:

| Today                                                                               | After                                                                                  |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `useLaunchAvailability` polls every 5 s so the Play button can notice League        | Events drive it. The poll drops to a slow one, or to `refetchOnWindowFocus`            |
| `usePlay` returns to `idle` when the POST is delivered, ~4 s before the game exists | The step machine gains `waiting-for-game` and `in-game`, ending when the session does  |
| `SessionBar` has nothing to say once "League is starting." clears                   | A resting line for the live session, with the patchline version the client reports     |
| A game that dies on startup is silence                                              | `exitReason` plus `exitCode`, the single most useful diagnostic a mod manager can have |

The last row is the one worth building for. "I pressed Play and League closed itself" is a support
question we currently cannot answer, and the client has been answering it all along.

## Phase 4 - What the session unlocks

Each of these is small once phase 3 exists, and none of them is possible without it.

- **Stop the game.** `Launcher::close()` is `DELETE` on the launch route, measured at under six
  seconds. It belongs in the Play button's menu, not on the button, and only while a session is live.
- **A stoppable hide.** `hide_during_session()` returns a `SessionWatch` that we currently drop on
  the floor. Held in state, turning off `hide_riot_client_on_launch` mid-session stops the re-hiding,
  and app quit stops the thread instead of leaving it polling for five minutes.
- **`Adopted` as a feature, not a footnote.** League already running used to be a dead end. It is now
  a session we can follow, so `launchOnly`'s "there was nothing to launch" toast becomes "League was
  already running, and the manager is following it".
- **Recover the session across a manager restart.** Quit the manager mid-game and the session id goes
  with it, so the bar comes back empty while League is still running. `Launcher::session_id()`
  answers it at startup, and phase 3's watcher picks the session back up from there. `session()`
  returns the whole record when the phase and version are wanted without a second call.
- **A Cancel button on a cold start.** `launch_with_stop(&StopFlag)` is the launch that can be called
  off, and `LaunchState`'s in-flight mutex is where the flag belongs - one per attempt, since a
  stopped flag stays stopped. The wait can lag by one in-flight request, so the button reports
  "Cancelling" rather than closing the bar. Two things must not be got wrong: stopping abandons the
  wait and not the launch, so a request the client already accepted still starts a game, and
  `Stopped` must never reach `useLaunchErrorToast`.
- **Stop the patcher when the session ends.** Optional, off by default. The patcher runs until told
  to stop today, which is correct for a user who plays several games and wrong for one who does not.

## 5. Deliberately not doing

- **WebSocket push events.** Upstream defers them for the same reason - the crate is blocking by
  design, and 61 event names is a socket and a thread for something a 5 s poll already answers.
- **A PBE picker.** `launch_league` already takes an optional `LaunchTarget`, so the plumbing exists.
  What is missing is a UI decision, not an API.
- **Locale from the client.** The patchline model carries no `locale_data`, so `utils/locale.rs`
  keeps reading `LeagueClientSettings.yaml`.
- **`release_id` as a cache key.** The patchline record names the content release on disk, which is
  exactly "has the game patched". Tempting for the overlay, but the overlay's fingerprint belongs to
  `ltk_overlay` and it is not ours to second-guess from here. Noted only.
- **`PatchlineExt::secondary_dir(GAME_PATCH)`.** It would derive the `Game` directory instead of the
  five places that join `"Game"`, but only while a client is running, so it can never replace the
  hardcoded join - only add a second path to test.

## 6. Owning the IPC shapes

`crates/ltk-manager-core/Cargo.toml:12` and `src-tauri/Cargo.toml:30` enable `ritoclient-api/ts`.
**That feature no longer exists.** Upstream deleted it in `b6b2924`, so both manifests fail to build
until we stop asking for it. It was never doing anything anyway: `ts_rs` exports by generating a
`#[test]` that writes the file, and **Cargo never compiles or runs a dependency's tests**, so
`pnpm generate:types` (`cargo test --workspace export_bindings`) produced none of them. The six files
under `src/lib/bindings/` that carry the crate's types are hand-written and have been since the crate
was extracted, with nothing to warn when one goes stale. `LaunchRoute.ts` missing `ADOPTED` is that
failure mode, caught only because this plan went looking.

So: **mirror the remaining five**. `LaunchOutcome`, `LaunchRoute`, `LaunchProgress`, `LaunchStage`
and `LauncherError` get manager-owned equivalents in `core::launcher`, deriving `ts_rs::TS` in our
crate, exactly as `LaunchAvailability` already does. The wire spellings must not change -
`SCREAMING_SNAKE_CASE` for the error tag and the route, `camelCase` for the stages - because the
frontend switches on them and the toast copy reads `riotErrorCode` off the context.

Cost is one `From` impl per type and a test that each still serializes to the spelling the frontend
expects. What it buys is that the next upstream rename is a compile error here instead of a frontend
union that quietly disagrees with the backend. Phase 3's `SessionEvent` is a sixth type on the same
terms, and its mapping table is in that phase.

This is no longer separable. It lands in phase 1, because phase 1 does not compile without it.

## 7. Verifying it

Launching cannot be tested without a live client, so the matrix is manual and worth writing down:

| Case                                     | Expect                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| No Riot Client running                   | `COLD_START`, a session id, and the game actually appears  |
| Client idling in the tray                | `EXISTING_CLIENT` after a wake, no second launch           |
| Client open on the Play screen           | `EXISTING_CLIENT`, ~4 s to the game                        |
| League already running, client knows     | `ALREADY_RUNNING`, session id present, nothing hidden      |
| League already running, client restarted | `ADOPTED`, session id present                              |
| ToS not accepted                         | `REFUSED` with `eula_not_accepted`, existing toast copy    |
| No Riot Client installed                 | `RIOT_CLIENT_NOT_FOUND`, Play greyed out by `availability` |
| Game closed from inside                  | `SessionEnded` with `Exit`, and the bar returns to rest    |
| Game killed from Task Manager            | `SessionEnded` with a non-`Exit` reason                    |
| Riot Client closed while the game runs   | No ending until the game goes too, then `Lost`             |
| Manager restarted mid-game               | `session_id()` finds it, and the bar comes back populated  |
| Cancel pressed during a cold start       | `Stopped`, no error toast, and the bar closes cleanly      |

Linux CI still compiles the non-Windows fallbacks. Upstream's note is worth repeating: this crate's
platform gating hides breakage from a Windows-only test run, and the one time downstream got an API
change wrong it failed only on Linux CI.

## 8. Risks

- **Pre-1.0 and unpublished.** Still a rev pin, and upstream is deliberately delaying publication
  until the generator has exercised the endpoint shape at full width. Moving the pin is a manual step
  each time, and section 6 is what makes those steps loud instead of silent.
- **`#[non_exhaustive]` everywhere.** `LauncherError`, `LaunchRoute` and `LaunchStage` all carry it
  now, and so do `SessionEvent` and `SessionPhase`. Every `match` needs a wildcard, and the wildcard
  must map to something honest rather than to the nearest neighbour. `SessionPhase::Other` and
  `TerminationReason::Other` carry the client's own spelling, so passing it through beats inventing
  a label for it.
- **Phase 3 adds a polling thread per session.** Upstream's watcher exits on its own terminal event,
  so the leak to guard against is the launch that failed after the id was minted, and app exit.
- **`Stopped` reaching the error path.** It is a `LauncherError` variant and our IPC turns those into
  toasts. If it is not special-cased, pressing Cancel shows a failure dialog.

## 9. What upstream added - **done**

We own `ritoclient`, so the gaps this plan found were fixed there rather than worked around here.
All of it landed in `b6b2924`, and the write-up is
`X:\lol\dev\ritoclient\docs\plans\session-lifetime.md`.

| Gap                                         | Now                                                                                              | Used by        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------- |
| No session watcher                          | `SessionEvent`, `SessionObserver`, `Launcher::watch_session`, plus a free `watch_session`        | Phase 3        |
| `Launcher` cannot reach its own session     | `Launcher::session()` and `session_id()`, both `Option`, both platform-free                      | Phase 4        |
| The `ts` feature produces nothing           | Deleted, with `ts-rs` gone from the workspace                                                    | Phase 1        |
| No cancel on a 120 s `launch()`             | `StopFlag` and `launch_with_stop`, answering `LauncherError::Stopped` and `LaunchStage::Stopped` | Phases 1 and 4 |
| `RiotClientInstalls.patchlines` is not read | Modelled as a field plus `patchline_client`, with the trailing-`Win` retry                       | Nothing yet    |
| The window hide gives up after 300 s        | Still open, and now blocked on one live test rather than on a design                             | Nothing        |

Two of those need reading carefully before anyone plans work on them:

- **`patchlines` changes nothing for us yet.** `resolve_riot_client` still ignores it, deliberately:
  the keys name the Riot Client's own patchline (`KeystoneFoundationLiveWin`), which the resolver
  cannot derive from a game's install root. So an unset league path still falls back to `rc_default`
  or `rc_live`. Feeding the resolver a patchline is a caller's decision that nobody has taken.
- **The hide still gives up after 300 s.** Upstream probed client 137 for a "stay hidden" lever and
  found none, so the session-based wait is still the fix and is not built. `hide_riot_client_on_launch`
  therefore keeps failing silently on a cold start that patches for more than five minutes. Worth a
  known-issue note rather than a fix on this side.
