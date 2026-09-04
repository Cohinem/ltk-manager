# Issue 013-011: Verdict basis bump on new rules

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: high`  
**Status**: Done  
**Blocked by**: nothing

## Context

A **verdict** records the **basis** it was taken under, and the manager version is part of that
basis precisely because rules and their tables ship in a release. A release that adds the rules in
this spec must make every stored verdict due again, or a library full of mods checked by the old
rule set keeps its `healthy` badges and the new rules never reach them.

## Acceptance criteria

- After a release adding rules, the **health sweep** re-checks every mod rather than trusting a
  verdict taken by the previous rule set.
- A mod the sweep re-checks and finds defective gains its badge without the user asking.
- The sweep still stands down without the **hashtable cache**, leaving mods **unchecked** rather
  than recording verdicts it could not earn.

## Notes

The mechanism already exists and is already correct. This issue exists so it is verified against the
release that adds rules, because the equivalent gap shipped once before: syncing the hashtable
cache changed nothing, and poisoned badges stood until the next game patch.
