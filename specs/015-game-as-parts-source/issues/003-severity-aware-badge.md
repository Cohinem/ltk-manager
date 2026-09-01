# Issue 015-003: Severity-aware health badge

**Spec**: `015-game-as-parts-source`  
**Labels**: `area: frontend`, `ready-for-agent`, `priority: medium`  
**Status**: Open  
**Blocked by**: nothing

## Context

`bin/resolver-key-loss` is the first rule to ship reporting at `Severity::Warning` with no fix.
Every unfixable finding before it was a `Fatal` or an `Error`, so "findings and no fix" and "this
mod is in trouble" were the same set and one word could carry both.

They have come apart. A verdict is derived severity-blind - `health.rs`, `ModHealthVerdict::from_run`

- so a mod whose only findings are 75 warnings lands on `unrepairable` beside a mod the game will
  refuse to load. The badge draws the red alert pill for both, and the popover tells both users to go
  and find an updated version of the mod. For the second that is the whole actionable content of the
  verdict. For the first it is wrong twice over: the mod loads, and the rule's own finding says what
  a lost key costs is the effect rather than the process.

Nothing here needs a fourth verdict word. The severity is already on every stored verdict, in
`counts`, and no surface reads it.

## Acceptance criteria

- `ModHealthBadge` draws the red alert pill only where `counts` holds a fatal or an error, and a
  muted pill otherwise. Per "The badge" in `docs/ux/MOD_HEALTH.md`.
- The popover sentence follows the same split, and the muted one tells nobody to go looking.
- `ModHealthStatusItem` and `ModHealthSweepPanel` are read for the same conflation, and either
  follow or the issue records why they should not.
- No change to `ModHealth`, to what `from_run` concludes, or to the shape of
  `mod-health-verdicts.json`. A stored verdict written before this issue renders correctly after it.
- The row's Repair button stays absent for both, because neither carries a fix.

## Why this is not cosmetic

`docs/ux/MOD_HEALTH.md` already carries the principle this violates: **"look for a new version" is
the one thing a verdict must not say wrongly.** It is the reason a check with no hashtables stands
down entirely instead of reporting `unrepairable` - ADR-0009 - because a wrong `unrepairable` tells
someone to throw away a mod that is fine.

`bin/resolver-key-loss` reaches the same forbidden sentence by a different road. The hashtable case
is a check that cannot judge, and it is solved by refusing to. This is a check that judges
correctly and has no honest word for the answer, so the badge says the sentence anyway.

## Notes

**This does not close the hole ADR-0012 names, and should not be read as closing it.** That hole is
a defect the overlay build compensates for, which fits none of the three words - the mod is neither
healthy nor fixable by any press the manager has. This issue only stops the worst finding's
severity being thrown away before the badge sees it, which is true whether or not the merge is ever
built. The word is still owed once it is, and `015-002` carries where the question came from.

**What is left standing after this issue is the severity coincidence.** The forbidden sentence
stops being said because `bin/resolver-key-loss` reports at `Warning` and the muted row does not
say it. That is the right outcome reached by the wrong route: a compensated defect that ever
reports at `Error` or `Fatal` takes the red row and says it again. Severity is a fact about what
the defect costs the player, and compensation is a fact about which instrument fixes it. They are
independent, and this issue only makes them line up for the one rule that ships today.
