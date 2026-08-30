# ADR-0009: A health check requires the hashtables

Status: accepted (2026-08-30)

Governs what ["The hashtables come first"](../ux/MOD_HEALTH.md) describes, and rests on the
basis gaining the cache's generation in the same slice.

## Context

The Problems rules read a mod through the shared hashtable cache. A packed WAD's chunks are
named from it, and a chunk no table names is listed under its hex hash instead. Detection
survives that - a bin is recognized by its first bytes whatever it is called - but one repair
does not. Turning a `Hash` the game now wants into a `File` needs the path behind that hash,
and only a table holds it.

So a run with no tables does not report less than a synced machine. It reports something
different: findings it can see, marked **unrepairable**, that one press would have fixed on a
machine whose cache was full. Unrepairable is the verdict that tells a user to go and find
another mod, and it is the one thing a verdict must not say wrongly.

1.15 shipped worse than that. The sweep ran against whatever the cache held, nothing filled the
cache but a manual press in Settings, and the basis did not name the tables - so a fresh install
recorded **Healthy** for mods whose bins it could not see, and syncing afterwards changed
nothing. Users on Discord were reading "No problems" on mods that crash the game.

The first answer to this was a fourth verdict word. `ModHealth::Incomplete`, a `blind` flag
recorded on the verdict and the run, a muted "couldn't fully check" pill on the badge, and a
line telling the reader to go and sync in Settings. It was built and reviewed.

It was rejected for handing the manager's own unfinished setup to somebody who installed a skin.
A fourth word is a fourth state for every surface to reason about - the badge, the panel, the
sweep banner, the launch ask, the status bar - and the chore at the end of it is invented for a
reader who cannot be expected to know what a hashtable is, or why their skin needs one.

## Decision

**A check does not run without the hashtables, and a mod nobody can judge stays unchecked.**

`ModLibrary::hashtables_ready()` is asked before the single check, before the sweep, and before a
repair. The sweep still prunes - a mod the library dropped loses its verdict whatever the tables
say - and checking is the half that stands down. An unchecked mod draws no badge and says
nothing, which is what the library already does for a mod nothing has checked, so the state costs
no new vocabulary anywhere.

The repair is on the precondition for a stronger reason than the check: it writes twice. It
applies the fixes it can derive, withholds the ones needing a name it has not got, and then
records a verdict off its own run - so an ungated repair would put the mislabelling this ADR
prevents into the verdict store through the one door the check does not watch. It is reached only
by a stored verdict outliving the tables it was taken against, so it refuses in words rather than
being drawn as a waiting control.

Nothing announces the condition on its own. The launch fills the cache in front of the sweep
that reads it, and a manual sync sweeps as it finishes, so the state clears itself without a
user learning the word.

Deleted with the fourth word: `ModHealth::Incomplete`, `ModHealthVerdict::blind`, `Run::blind`,
`BinNames::has_game_tables`, `ProjectFile::is_hash_addressed`,
`ProjectFiles::holds_hash_addressed_content`, the muted pill and the line under it.

The one surface that still hears about it is Check Health in the card menu, because a press owes
an answer. It says which of three states it is in before it is pressed, and the refusal behind
it survives for the press that lands in the moment the answer changes.

## Consequences

Refusing is cheaper than judging wrongly, but it is still a refusal. On a machine that never
reaches the release - offline, or behind something that blocks it - no mod is ever checked and
the library reports nothing at all. That is the same silence as a library nobody has asked
about, which is exactly what it is.

The precondition is machine-wide rather than per mod. A mod shipping complete embedded
hashtables of its own could be judged with an empty cache, but knowing that means scanning it
first, which is most of what a check costs and is thrown away when the answer is no. The window
is seconds after a first launch, so the simple precondition is worth more than the mods it
defers.

This only works because the basis names the cache's generation. Standing down defers verdicts,
and without a sync making every stored verdict due again, they would stay deferred until the
next game patch - which is the 1.15 bug in a new shape.

A verdict outlives the tables it was taken against, so a stored one can be on screen on a launch
that has none. The popover's re-check is disabled there rather than left to refuse.
