# Toolz integrations

Status: **Partially implemented** on `feat/toolz-integrations`, 2026-09-14.

## Implementation decisions

The branch implements managed executable installation, release checks, update, repair, removal,
initial context-menu choice, ownership-aware classic menu registration, and interrupted-write recovery.
The administrator-installed tex handler bundle remains read-only pending the upstream contract below.
It is not part of the implementation's completion claim.

The classic-menu adapter writes the inspected registry schema directly. Source inspection during
implementation found that `tex toolz shell install --classic` also removes its modern menu package,
which exceeds the requested classic-menu change. Manager leaves those packages intact. It snapshots
only each tool's classic menu subtrees, journals the exact target before writing, and restores a
backup only while the live tree matches recorded ownership. The adapter accepts the inspected minor
release lines, wad toolz 0.5.x and tex toolz 0.3.x, until another contract is reviewed.

Installations use UUID directories beneath `versions` with the release tag held in the receipt.
That permits repair of the same release without overwriting a running executable. Receipts retain
locked executable files for later cleanup and preserve unowned configuration and output files.
Backend operation snapshots are polled while the settings tab is open. Durable receipts provide
interruption recovery after app restarts, and no background registry mutation runs at startup.

Validation on Windows: 15 backend integration tests passed, including isolated registry round trips.
A separate live test downloaded and verified both current releases and executed only `--version` in
temporary directories. The six integration UI tests passed. Binding generation, type checking, lint,
formatting and Rust documentation builds completed. Rust documentation retains 12 pre-existing
warnings outside this module. The full frontend run passed 3,166 tests and failed one unchanged VFX
editor test. Its complete 67-test suite passed on an isolated rerun. Interactive Explorer checks on
both Windows 10 and 11 and privileged handler scenarios remain unperformed.

The original proposal follows. Its elevated-handler requirements remain a dependency, not a shipped
capability. Context-menu writes no longer depend on upstream JSON status or mutation commands.

## Outcome

Settings gains an **Integrations** tab with one section each for **wad toolz** and **tex toolz**.
A user installs, updates, repairs and removes each tool here, and controls its Windows Explorer
features independently of the executable installation. Those exact names are display names.
Repository names and executable names retain their upstream spelling.

The first release targets Windows x64. Other platforms show availability information and repository
links, with mutations disabled. ARM64 needs native shell-extension artifacts and validation before
support is advertised, even if an x64 command-line executable can run under emulation.

## Recommendation

Manager owns release downloads and installation lifecycle. Each tool owns its shell registration
implementation. Use the upstream executable's registration commands through a narrow backend adapter.
Do not run the PowerShell quick-install scripts from the settings button.

The scripts remain useful installation documentation and compatibility references. They select the
latest release at execution time, change user PATH, and provide neither complete removal nor a
structured management contract. Wrapping them would leave the hardest parts in Manager anyway.
The exact upstream evidence and source revisions are in
[Toolz installer research](../research/toolz-installers.md).

Use two explicit adapters with shared download, operation and receipt helpers. A plugin marketplace,
user-supplied scripts and a general package manager are outside this feature.

## Settings surface

Place Integrations after Workshop. Stack two full-width `SectionCard` sections in a single column.
Each section has **Installation** and **Windows Explorer** groups using the existing `SettingGroup`
and `SettingRow` components. Follow `DS-SETTING-LEVEL` and the current settings layout.

Installation shows observed status, installed version, available version when known, and a selectable
installation path. Primary actions depend on state:

| Observed state       | Actions and explanation                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| Not installed        | Install, repository link                                                 |
| Installed by Manager | Check for updates, Update when available, Repair, Open folder, Uninstall |
| Installed elsewhere  | Show detected path, Install managed copy, repository link                |
| Incomplete or broken | Explain which files or registrations failed, Repair or retry cleanup     |
| Unsupported platform | Availability explanation, repository link                                |

An offline update check preserves local status and reports that the latest version could not be
checked. It never changes Installed to Not installed. Check releases on tab entry with a bounded
cache and provide an explicit refresh. Installation and updating always require a user action.

Windows Explorer controls report actual registration state, including partial or conflicting
registrations. Disabling an Explorer feature leaves the executable installed. An absent tool offers
Install first. Labels describe the feature and relevant extensions, with upstream details linked.
Expose the capabilities upstream actually supports:

| Tool      | Control                               | Scope                                                                           |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| wad toolz | Context menu                          | Current user                                                                    |
| tex toolz | Context menu                          | Current user, classic menu for version 1                                        |
| tex toolz | Thumbnails, previews and file details | One bundled handler installation, administrator approval and machine-wide files |

Show the installed handler version separately from the CLI version. Updating downloaded CLI files
does not prove the machine-wide handler has updated.

Do not split the tex toolz handlers into three switches. Its current CLI installs them together.
Modern Windows 11 context-menu packaging is deferred because the current path depends on Developer
Mode. Explain the classic menu location on Windows 11. Exact extensions and commands are recorded
in the research note.

Before first installation, show the Explorer options that will be enabled. Proposed defaults are
context menus on and texture handlers off, so replacing an existing file handler is a separate
choice. Updates preserve the last successful choices. Repair reapplies those choices rather than
enabling everything.

Use inline progress and a persistent, copyable failure detail with Retry. Leaving the tab does not
cancel an operation. Revisiting reconstructs its state from the backend. Do not offer cancellation
once registration changes begin. Downloads can be cancelled before that boundary.

Uninstall uses the existing confirmation dialog and explains that Manager's executable files and
owned Explorer registrations will be removed. Keep user configuration, outputs and shared hash
caches. An Explorer restart or sign-out requirement is a result with an action, never a silent
process kill.

These are operations on installed software, not ordinary preferences in `settings.json`. Do not
attach the settings reset gear, modified marker or group reset to installation state. Use stable
section/group focus IDs under `integrations.*`, through the existing focus mechanism. Do not invent
fake `SettingKey` values to put operation rows in `SETTINGS_INDEX`.

## Ownership and discovery

Install into a fixed per-user root under
`%LOCALAPPDATA%\LeagueToolkit\Manager\integrations\<tool-id>\versions\<release-id>\`.
Use internal tool IDs `wadtools` and `tex-toolz`. A schema-versioned receipt beside `versions` records
release tag, assets and digests, owned files, active version, successful feature choices, registration
targets and scope, prior values replaced with consent, and deferred cleanup. Write receipts atomically.

A receipt records ownership and recovery data. It does not prove the executable or registry entries
still exist. Probe both on tab entry, after every mutation and after returning focus from another app.
Keep release availability separate from local installation and registration health.

Discovery checks the managed receipt, upstream default directories, known per-user registrations and
user PATH candidates. Canonicalize and deduplicate paths. Never execute arbitrary PATH candidates
merely to detect a version. Use read-only metadata and mark unverifiable versions Unknown. A custom
install with no known registration or PATH entry may remain undiscovered, which the UI must not
claim is a full machine inventory.

Do not adopt ownership of an external directory. A managed copy can coexist with external files,
but Explorer entries can refer to only one owner for a given registration. Show the existing target
and require an explicit replacement choice before repointing it. Save overwritten values and restore
them on removal only if the current values still belong to Manager's installation. Never recursively
delete shared extension keys, unrelated verbs, or somebody else's replacement registration.

The tex toolz handler is an exception to the per-user binary layout: upstream copies its DLL into
`%ProgramFiles%\LeagueToolkit\ltk-tex-thumb-handler`. Treat it as a machine resource whose ownership
cannot be inferred from a per-user receipt or the expected path. An existing installation is
Externally managed until an ownership-aware upstream contract can establish who may update/remove
it. A second Windows account must not remove another account's handler. Version 1 reports an
existing unowned handler and offers its management guidance rather than taking it over automatically.
The current `--no-override` option still writes base extension and property-handler slots, so it
cannot stand in for conflict detection or conditional ownership checks.

Version 1 does not modify PATH. The managed tools remain usable through Explorer and their absolute
paths. Existing standalone installs and their PATH entries remain intact. A future Add to PATH
control needs a stable launcher and separate ownership tracking.

Manager's own updates preserve these installations. Uninstalling Manager does not silently uninstall
independently usable tools. Document that the Integrations tab removes them before Manager removal.

## Lifecycle and recovery

1. Acquire an operation lock and re-probe local state. Reject concurrent mutations, including a
   second app instance. Start with one lock across both tools to serialize Explorer changes.
2. Resolve one stable GitHub release from the fixed repository. Persist its exact tag and asset
   identity for the run. Reject prereleases, missing assets and unsupported architectures. A check
   performed earlier is advisory, and a newly resolved version must be reflected in the operation.
3. Download to a staging directory with timeouts and bounded sizes. Verify published SHA-256 or a
   trusted release digest before execution. Extract only expected files and reject traversal paths.
   Treat missing integrity metadata as a release-contract gap, not as verified success.
4. Validate the executable version and required companion files. Preserve the prior active version.
   Registration uses absolute executable paths and argument arrays, never shell-interpolated commands.
5. Record a pending operation and relevant registry snapshots before changing registrations. Apply
   only the requested capabilities through the tool adapter. Re-read affected values after each step.
6. Commit the active receipt only when files and registrations match the requested result. Notify
   Explorer through the upstream operation. Report any remaining restart requirement separately.
7. Delete unneeded owned files when possible. Keep locked DLLs in their old version directories and
   record cleanup for a later run. Never overwrite a loaded DLL in place or claim it has been deleted.
   This requires upstream support for versioned Program Files handler destinations or an equivalent
   locked-file protocol. Versioning Manager's local download directory alone does not solve it.

Handler mutation is a distinct privileged step. The current CLI's self-elevation requires interactive
stdin, so a hidden captured-output child cannot be relied on to raise UAC. Use an upstream-supported,
narrow elevated operation that validates a staged payload, accepts only a fixed handler action,
returns a structured result through a protected channel, and checks the invoking user's identity.
The privileged side verifies the payload again after copying it into administrator-owned staging.
Never point machine-wide COM registration at the user-writable download directory.
Keep Manager unelevated. UAC cancellation leaves the CLI and context menu usable and the handler
state unchanged or accurately reported as partial. Ordinary command-line logs do not establish
privileged success. A privilege mismatch or machine ownership conflict blocks only the handler action.

Updates stage a new version and repoint enabled registrations to it. Disabled features stay disabled.
On failure, restore the preceding registration targets where they still match the values this run
wrote. If rollback also fails, report the actual partial state and keep recovery data and both file
sets. Registry operations and filesystem changes are not one atomic transaction.

Uninstall unregisters only owned values before removing files. If a registration cannot be removed,
retain its target files and expose Retry. A missing executable must still permit cleanup through the
recorded registration contract or an explicitly verified repair tool. Retain the receipt until all
registration and file cleanup is complete. Locked leftover files are Pending cleanup, not Installed.

On application startup, reconcile pending receipts read-only. Resume cleanup or repair through an
explicit action when it would change registrations. Do not automatically overwrite external changes.

## Backend and frontend boundaries

| Area                                                                     | Planned change                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `crates/ltk-manager-core/src/integrations/`                              | Two tool definitions and adapters, discovery, release resolution, staging, receipts, lifecycle and Windows registration observations |
| `crates/ltk-manager-core/src/lib.rs`                                     | Export the integrations module                                                                                                       |
| Core error and event modules                                             | Typed integration errors and operation progress carrying tool ID, operation ID, stage and optional byte totals                       |
| `src-tauri/src/commands/integrations.rs`                                 | Thin commands for status, release checks, installation, update, repair, feature changes, removal and safe download cancellation      |
| `src-tauri/src/ipc.rs` and command exports                               | Register new commands through the specta command table and regenerate bindings                                                       |
| `src/lib/tauri.ts` and error describer                                   | Typed API facade and localized errors with concrete remedies                                                                         |
| `src/modules/settings/api/`                                              | TanStack Query status/release queries and mutations, invalidate status on settlement including failure                               |
| `src/modules/settings/components/IntegrationsSection.tsx`                | Two sections with capability controls and operation results, shared presentation only where the shapes match                         |
| `src/modules/settings/tabs.ts`, `src/pages/Settings.tsx`, module barrels | Tab ID, translated label, icon and routed panel                                                                                      |
| `messages/en/settings.json`                                              | All new user-facing copy, including tool names, states and remedies                                                                  |

Model installation, individual capability health and operation state as separate typed values.
Use enums for tool IDs, capabilities, requested registration state and lifecycle stages. Represent
external ownership and incomplete state explicitly. The frontend receives allowed actions derived
from observations, and the backend revalidates them before execution.

The backend accepts tool IDs and typed choices, not arbitrary URLs, program paths or PowerShell.
The operation snapshot is authoritative so missed progress events and panel unmounts lose no state.
Use the existing `useTauriEvent` or `useTauriProgress` wrappers for updates. Preserve typed error codes
and external diagnostic text through the existing error envelope.

Keep domain logic in core and Tauri event/process wiring in the application layer. Follow the
existing hashtable download and off-thread command patterns without coupling this feature to the
hashtable cache. Perform blocking registry, filesystem and process work off the async runtime and
never hold a settings mutex during downloads or subprocess execution. Use `fs_err` and the existing
IPC derives. No new crate is required for the module boundary.

## Delivery sequence

1. **Upstream contract.** Settle structured capability status, strict mutation outcomes, ownership-safe
   removal and integrity metadata in both tool repositories. For tex toolz, include GUI-safe elevation,
   machine-wide ownership and a loaded-DLL update protocol. Publish compatible releases. Record
   supported minimum versions and fixture their contracts. This is a dependency of registry controls.
2. **Discovery and lifecycle.** Implement read-only inventory and release checks, then staged managed
   installs, receipts, updates and file cleanup. Exercise interruption and recovery with fake adapters.
3. **Explorer integration.** Add capability operations and conflict takeover, registration verification,
   rollback and locked-DLL handling. Prove the complete install/update/remove cycle on Windows.
4. **Settings tab.** Add both sections, translated copy, typed queries, progress and failures. Verify tab
   routing and focus alongside the existing settings behavior. Ship both tools together.
5. **Release proof.** Run the test matrix below and document the accepted product behavior in
   `docs/ux/SETTINGS.md`. Keep this plan Proposed until review, then update its status as work lands.

## Acceptance and validation

Automated tests use temporary directories, fake downloads/processes and an isolated registry adapter.
They prove transitions and failure recovery without touching a developer's real Explorer configuration.

- Release fixtures cover the actual asset layouts, integrity mismatch, unavailable metadata, unsupported
  platform, malformed version, offline requests and GitHub rate limits
- Lifecycle tests cover fresh install, update preserving disabled features, repair, external conflicts,
  ownership changed after discovery, interrupted registration, rollback failure and concurrent actions
- Cleanup tests cover absent executables, preserved user files and caches, foreign registry values,
  locked DLLs and restart-time reconciliation
- UI tests cover state-specific actions, partial feature states, confirmation, recoverable errors,
  stale/offline release data, progress after navigation and tab/focus routing
- Windows smoke tests use a disposable standard-user account and inspect both registry and actual
  Explorer behavior for supported extensions, including paths with spaces and non-ASCII characters
- Exercise Windows 10 and 11, handlers loaded during update/removal, an existing script installation,
  a competing handler, and two successive tex toolz updates without signing out
- Verify that executable and context-menu operations do not request elevation, bundled handler
  mutations do request it, denied UAC is recoverable, and an Explorer restart is explicit
- Verify machine-wide handler ownership across two Windows accounts and a pre-existing handler install

Implementation gates are `pnpm generate:types`, `pnpm check`, scoped core tests, `cargo fmt --check`,
`cargo clippy --all-targets` and `cargo doc --no-deps`, clean on a supported build environment. Run the
Windows smoke matrix separately from portable tests. This documentation-only change requires link,
format and diff checks, not application test execution.

## Review choices

The defaults above make the plan implementable without leaving routine choices open. The substantive
product choices to review are the managed install directory, no PATH edits in version 1, context menus
on with texture handlers off for first install, and explicit replacement of external registrations.
PowerShell wrapping is an alternative only if upstream first provides a version-pinned, noninteractive,
structured lifecycle contract with the same ownership and recovery guarantees.
