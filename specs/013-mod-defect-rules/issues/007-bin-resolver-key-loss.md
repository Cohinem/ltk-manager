# Issue 013-007: Rule: bin/resolver-key-loss, resource resolver key loss

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: low`  
**Status**: Done  
**Blocked by**: `013-002`

## Context

Bin objects are substituted wholesale by path hash rather than merged, so a mod shipping its own
skin bin replaces the game's resource resolver outright. One specimen's resolvers define 1,151
fewer keys than the game's, 132 of them named for one ability.

A missing key does **not** crash. Resolution walks its tiers and, on total failure, logs and
substitutes a placeholder effect. So this rule reports a fidelity problem, not a crash.

## Acceptance criteria

- Reports a resolver whose key count is materially below the game's object at the same path.
- Offers no fix.
- The finding does not imply a crash, because it does not cause one.
- Reports nothing where the mod ships no resolver for that path.

## Notes

A raw count is an upper bound on a defect rather than a defect count: a mod that deliberately
collapses every skin onto one look legitimately drops per-skin keys.

If a repair is ever added, the safe form is a union restoring **only those keys whose target still
resolves in the merged view**. Restoring a key whose target the mod deleted trades a clean miss for
a dangling link, which is worse than the miss. That repair also needs the installed game as a parts
source, so it belongs to `015-game-as-parts-source`.

## Decided during implementation

**"Materially below" is a floor of 8 lost keys, not a ratio.** The measured losses run from 19
keys to 177, and the size of the map they came out of does not predict which, so a ratio would
have missed the small end of the same class. What the floor buys is silence over a resolver an
author edited by hand, which is the only shape a small difference has.

**Severity is `Warning`, and the row denies the crash in words.** A reader meeting a red row
assumes one, so the message says the miss costs a placeholder effect "rather than a crash". A test
pins that phrase, because the acceptance criterion is about what the finding implies.

**`GameContent` gained a `read`.** The trait had one method, and comparing against the game's own
copy of a bin needs its bytes. Both questions are still asked to compare against the install rather
than to take parts out of it, which is the line `015` is about and this does not cross. The index
behind it now records which archive holds each chunk rather than only that one does, and reads go
through `WadCache`, so a mod's worth of chunks out of one archive parses its table of contents once.

**With no install the rule is dormant rather than silent.** `RuleState::Dormant` already means
"the rule has run and has nothing to say, and here is what it waits for". A rule that read the game
and found no game to read would otherwise be indistinguishable from one that found nothing wrong.
The variant's own doc said "a newer game build" and now covers both.
