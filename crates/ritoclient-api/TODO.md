# ritoclient-api needs restructuring into a real API harness

The crate works and its knowledge of the Riot Client is sound — that part came
out of reversing `RiotClientFoundation.dll` and is worth keeping verbatim. What
is wrong is the shape: it is a pile of free functions, one per endpoint, each
re-deriving the connection and re-inventing how a request is made. Every bug
fixed in the launcher during July 2026 was a symptom of that, not of a
misunderstanding of the API.

This is a structural refactor, not a rewrite. **Nothing here should change what
the crate believes about the client.** The doc comments are the record of what
was measured against a live install; they move, they do not get reworded away.

## Why — the same defect keeps recurring

The port in the lockfile churns under a stable pid (waking the client restarts
its remoting listener). So _every_ call has to re-read the lockfile, and right
now that is a rule each call site remembers or forgets on its own:

- `live_lockfile()` is called from **9 places across 5 modules**, each deciding
  independently whether it is re-reading often enough.
- `http::client(...)` is built at **5 call sites**, each picking its own timeout
  constant.
- `basic_auth("riot", ...)` is spelled out at **6 call sites**.

Two shipped bugs came straight out of that duplication:

1. `wake_with_launch_args` took a `&Lockfile` and reused it across all three
   retries — while being the one call that _causes_ the port to move. Attempts 2
   and 3 always hit a dead port.
2. `hand_off` used one lockfile snapshot for the eligibility GET _and_ the launch
   POST, and treated a transport failure as terminal, so a client mid-restart
   produced "could not reach the Riot Client" instead of a retry.

Both were fixed at their call sites. The next endpoint added will have the same
choice to get wrong, because nothing in the type system says the lockfile is a
connection to be refreshed rather than a value to be passed.

## Target shape

**A `Client` that owns the connection.** Holds a shared `reqwest` client and
resolves the lockfile per request rather than storing a port. It is the only
thing that knows about auth, the self-signed cert, and base URLs. Endpoint
modules take `&Client` and never touch `Lockfile` or `reqwest` directly.

**One request path.** A single place that applies auth, applies a per-call
timeout policy, classifies the status, and parses the client's error payload
(`{errorCode, httpStatus, message}` — see `product_launcher::refusal`).
`ClientError`, the timeout/connect classification in `http::describe`, and the
status → "not ready" vs. "refused" split are all general; they currently live in
whichever module needed them first.

**An explicit response taxonomy, in one enum.** Today `LaunchAttempt::NotReady`
encodes "404, 5xx, or the connection failed" for exactly one endpoint, and
`lifecycle::post` collapses everything into `RiotClientUnreachable`. Every
endpoint has the same four outcomes: answered, not-ready-yet, refused-with-a-
reason, transport-failed. That belongs to the harness.

**Retry as a policy, not a hand-rolled loop.** There are three loops with three
different structures: `launch::wait_for_launcher` (deadline + grace period),
`app_args::wake_with_launch_args` (fixed attempts + delay),
`lifecycle::hide_for_play_session` (re-assert window). The _policies_ differ
legitimately; the plumbing under them should not.

**Keep `launch` as orchestration.** Picking cold-start vs. handoff vs. wake, and
reporting `LaunchStage`s, is genuinely this crate's own logic and stays a layer
above the harness. Likewise `installs`, `lockfile` and `processes` are not HTTP
and stay as they are.

## Constraints

- Stays dependency-free of the rest of the workspace. `ritoclient-api` must not
  learn about `Config`, `EventSink` or `AppError`; `LaunchObserver` remains the
  only way it reports progress. See the crate table in the root `CLAUDE.md`.
- Stays Apache-2.0. Deliberate, not an oversight to be tidied to the workspace's
  dual license.
- Read-only calls keep answering `Option`, never `Result`. Every caller has a
  fallback and "the client didn't answer" is not a failure worth showing a user.
- The public surface `ltk-manager-core` uses is small — `launch_league`,
  `launch_availability`, `lifecycle::hide_for_play_session`, the `product_registry`
  types. Everything else can move freely.
- Blocking, not async. The callers are Tauri commands on a blocking thread pool
  and there is no runtime to justify.

## Not part of this

- `--launch-background-mode` on the cold-start path (client comes up straight
  into the tray, never draws a window). A behaviour change, worth doing, worth
  doing separately.
- Anything that widens what the crate touches. The "deliberately does not do"
  list in `lib.rs` is not up for revision as part of a refactor.
