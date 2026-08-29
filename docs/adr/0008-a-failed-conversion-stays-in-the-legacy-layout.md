# ADR-0008: A failed conversion stays in the legacy layout

Status: accepted (2026-08-29), superseding the quarantine failure handling of
[ADR-0003](0003-the-layout-migration-moves-files-it-does-not-convert-them.md)

## Context

ADR-0003 had the layout migration park a mod it could not move under `quarantine/<uuid>/` and
record a `ModFault` on its entry. The mod stayed visible, greyed out, with a dialog offering to
reveal the parked files or remove the entry.

That design answered the wrong failure. The moves are two same-volume renames, so what actually
makes them fail is transient — a file locked by an antivirus scan, a full disk, a directory held
open. Quarantine converted every one of those into a permanent dead end: the fault excluded the
mod from later runs, so a lock that would have cleared by the next launch still ended in
remove-and-reinstall. It also cost the user a working mod. The legacy layout is readable —
`archive_path` and `is_present` carry legacy fallbacks, and a pre-migration library builds
overlays out of it every day — so a mod that merely failed to _move_ was taken from a working
state into an unusable one.

An offer-first migration was considered and rejected: it asks users a layout question they cannot
answer, about a pass whose only honest answer is yes (ADR-0003's reasoning for dropping the
modal). None of this has shipped, so there is no quarantine on any user's disk to unwind.

## Decision

**A mod the migration cannot move stays whole in the legacy layout.** Nothing is parked, nothing
is deleted, and the mod keeps working — overlay builds read it where it is. The failure is
reported and the files are not touched.

**Failure is not persisted.** `ModFault` and the fault field are gone from `library.json`, and no
sidecar records failures either. The work set recomputes every launch from `slug.is_none()`, so a
failed mod is simply still pending and the next launch tries it again. What a run had to say
lives in the in-memory `LayoutMigrationState` and its events, and dies with the process.

**Reconciliation gates on the session's migration state, not on the entries.** The old stand-down
predicate — any slug-less, unfaulted entry — would now never clear while one unmovable mod
existed, and reconciliation would stand down forever. Instead it waits only while the state is
`Pending`, meaning the startup pass has not reported this session. The ordering guarantee it
protects — never read a mod mid-move as an orphan — is about the pass running, not about the
library reaching zero legacy entries.

**Legacy is transient, and convergence is the goal.** Core guarantees — building, enabling,
uninstalling, health — work on a legacy mod. Conveniences may require the migration to have
happened: changing storage requires a slug, so unpack and repack never learn legacy paths. The
legacy fallbacks are scaffolding to delete once the layout has drained, not a second layout to
maintain.

**The move is atomic with respect to layout, not bytes.** `convert_entry` renames the directory,
then the archive, and renames the directory back if the archive move fails — so a failed mod is
always wholly in one layout. The metadata refresh may have rewritten `mod.config.json` before the
renames, so the mod is layout-identical, not byte-identical, and that is accepted: the refresh is
idempotent and the rewrite is itself a repair.

## Consequences

The failure UI slims down to what is true: the toast and the failure dialog stay, the dialog says
the mod still works and will be retried next launch, and the reveal-quarantined-files action is
gone along with the greyed-out card, the fault dialog, and the quarantine kebab menu. The dialog
recurs every launch while a mod is stuck — accepted, because it is the one nudge toward fixing
whatever holds the files.

Reconciliation now runs while legacy entries exist, so its passes must leave them alone: the
discovery pass claims each entry's actual directory name (slug or uuid), and the drop-folder pass
already skips archives named for a known id — that filter is now what keeps a legacy mod's own
archive from being reinstalled as a duplicate.

A permanently unreadable archive — a truly corrupt file — is retried and fails identically every
launch, with only a log line of detail. Routing that case into the health-verdict system, which
already has badges, repair and delete, is the agreed follow-up. What the migration itself will
never grow is a transient-versus-permanent classification: it cannot tell a locked file from a
broken one, and guessing wrong is how quarantine happened.
