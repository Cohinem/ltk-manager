# Issue 015-002: ADR for machine-dependent repair

**Spec**: `015-game-as-parts-source`  
**Labels**: `area: backend`, `ready-for-human`, `priority: low`  
**Status**: Answered by ADR-0012, bar one criterion - see below  
**Blocked by**: `015-001`

## Context

Every repair the manager ships today derives its output from the mod alone, so the same mod
repaired anywhere produces the same bytes. A repair that pulls parts from the installed game breaks
that, in three ways worth deciding deliberately rather than discovering later:

- The repaired mod carries bytes from one machine's install at one patch.
- The repair becomes patch-sensitive, where today a repaired mod stays valid until a rule changes.
- The repair inherits the check's dependency on what the manager can see of the installed game.

The existing decisions that govern repair are recorded as ADRs, so this belongs in the same series.

## Acceptance criteria

- An ADR stating whether a repair may read the installed game as a parts source.
- If yes: the boundary, which defect classes may pull and which must keep deriving from the mod.
- If yes: how provenance is recorded, and what happens to a pulled part on the next patch.
- If no: what the manager says instead for the classes that would have needed it, which today is an
  honest `unrepairable`.
- The ADR states the machine-dependence plainly, because that is the property being traded away.

## Notes

Blocked on `015-001` because a positive answer there may make this ADR unnecessary, or reduce it to
a much smaller decision about the build rather than about repair.

## Answered: the repair this ADR was for is not the road taken

`015-001` came back positive, which is the case its own Notes said might make this unnecessary.
[ADR-0012](../../../docs/adr/0012-the-overlay-merges-a-mod-over-the-games-copy.md) settles the
defect class by merging at build time instead, and it holds the three properties this issue wanted
stated: nothing is written to the mod, so there are no machine-dependent bytes, no provenance to
record and no pulled part to go stale on the next patch. The general question - whether a repair may
ever read the game as a parts source - is untouched and stays unasked until a defect class needs it,
which none we have measured does.

**One acceptance criterion is not answered, and it is now live rather than hypothetical.** This
issue asked, for a negative answer, "what the manager says instead for the classes that would have
needed it, which today is an honest `unrepairable`". ADR-0012 raises the same point from the other
side and says it needs deciding before the rule ships. The rule shipped: `bin/resolver-key-loss` is
registered, reports at `Warning`, and offers no fix, so a mod carrying it verdicts `unrepairable`
and draws the red pill that tells a user to go and find a different version of the mod. Carried to
`015-003`.
