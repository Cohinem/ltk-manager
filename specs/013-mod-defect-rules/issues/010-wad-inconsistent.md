# Issue 013-010: Rule: wad/inconsistent, divergent bytes on a shared path

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: low`  
**Status**: Not a per-mod rule - see below  
**Blocked by**: `013-001`

## Context

A mod that declares its content in one archive can have that content routed into several, so the
same path hash ends up in more than one archive the game will mount. At the end of each mount the
game walks the chunks it just mounted and, for each one, looks for the same path in the archives
already mounted. A checksum that differs aborts the process.

That scan skips archives not yet mounted, so whether a divergence fires at all depends on what is
mounted when. The defect is therefore latent rather than reliably reproducible, which is what the
finding should say: a hazard the build created, not a crash the user is certain to see.

Measured on the current overlay: 584 path hashes appear in two archives and **all 584 carry
identical checksums**, so nothing trips it today. The hazard is structural and created by routing,
which makes it worth catching before a build ever produces two encodings of one path.

## Acceptance criteria

- Reports one path hash carrying different bytes across two archives that will both be mounted.
- Reports nothing where the copies are identical, which is the normal case.
- Names every archive involved, not just the first two.

## Notes

**The name is the game's own.** `inconsistent` is the word the game uses for a mount that failed
this way, so a health finding and the diagnostics code a crash log carries read as one word rather
than as two coinages for one state. The sibling archive rules keep their descriptive names, because
each is a proper subset of the game's broader _corrupt_ case and two rules cannot share one name.

**The failure does both, and that is confirmed.** The game crashes the process and flags the install
for repair. The repair is inert here, because an overlay leaves the game's own files untouched and a
validation pass finds them sound, so the crash is the whole of what a user sees. The finding is
still fatal rather than advisory, and catching the state when a build produces it is worth more than
reporting it after a launch.

This is a property of a built overlay rather than of one mod in isolation, so where it runs needs
deciding during implementation. It may belong beside the overlay build rather than in a per-mod
check.

## Decided during implementation: this is a build-time invariant

The issue's own last note asked where this runs, and the answer is that it does not run per mod.

`OverrideMeta::route_targets` routes every chunk by **which installed WAD owns its path hash**,
and it fans a shared chunk out to every holder, in its own words "so every loaded copy stays
checksum-consistent" - `docs/plans/mod-autofixer-gaps.md`, "The routing is already solved, at
overlay build time". Two consequences settle this:

- **One mod's own two copies of a path cannot reach two overlay archives with different bytes.**
  Both copies route by the same hash to the same target set, and one wins per target. A rule
  reporting that state would report a hazard the build resolves, which is the cry-wolf failure
  section 7 of the gaps doc is entirely about and the failure this spec exists to avoid.
- **Two mods overriding one path is the same story**, resolved by mod order into one copy per
  target.

So the state the game aborts on is one the overlay builder prevents by construction, and the place
to keep it prevented is an assertion in that builder rather than a check over a mod. That code is
`ltk_overlay`, upstream, so this belongs to `league-mod` and not to `013`. Measured occurrences
remain zero: 584 path hashes appear in two archives on the current overlay and all 584 carry
identical checksums.

What is worth keeping from this issue is the name. `inconsistent` is the game's own word, and an
upstream assertion should use it so a build-time refusal and a crash log read as one word.
