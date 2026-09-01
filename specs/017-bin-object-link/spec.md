# Feature Specification: The object link that only resolved at home

**Feature Branch**: `017-bin-object-link`
**Created**: 2026-09-01
**Status**: Draft
**Input**: A mod reported as crashing the game on a specific in-game event, whose bin passed every
rule the checker had. Investigated alongside the `bin/property-type` schema work.

## Problem Statement

A modder wants an effect the game already has, so they open a game bin, find the object that draws
it, and copy that object into their own bin. It works when they test it. It ships. Some users then
crash at the moment the effect fires, and others never do.

Nothing tells anybody why. The bin loads without complaint, the mod passes every health check, and
the game writes no line about it.

The reason is that an object is not self-contained. It carries `ObjectLink` properties, and those
name other objects by hash. Inside the bin it was copied from, those names resolved, because the
objects they name are in that same bin. Lifted into another bin, the same links are asked of
whatever the game happens to have loaded. When the answer is nothing, the link resolves to null and
the load still reports success, exactly as a mistyped property does.

What happens next is not the mod's to decide. Two classes in shipped game data read the same kind
of resolved link, and they do not agree: one null-checks it and falls back to a default, the other
dereferences it directly and takes the process down. So the same unresolved link is a harmless
missing effect under one consumer and an access violation under another, and which one a mod hits
is a property of the class it copied, not of anything the modder did.

The state is invisible from inside the mod. Every existing rule reads a file and judges it against
a format or a schema. This defect is a mod that is internally valid and depends on a bin it does
not ship.

## Solution

Report an `ObjectLink` whose target no bin in the mod defines.

The rule walks every object of every bin the mod ships, collects the object hashes those bins
define, and collects every `ObjectLink` value they hold. A link naming a hash the mod defines is
silent. A link naming a hash it does not is a finding, and its wording says the one thing that is
certainly true: this link leaves the mod, so whether it resolves is decided by what the game has
loaded rather than by anything in the mod.

**The rule does not claim a crash.** It cannot. Whether an unresolved link is fatal belongs to the
class that reads it, and shipped data contains both behaviours. Reporting "this crashes" would be
wrong about the safe half, and reporting nothing is wrong about the other. So it is a warning that
names the risk, and the modder decides.

**It offers no repair, and never will.** Nothing can invent the missing object. The fixes are
authorial: ship the bin the object came from, copy the objects the link names as well, or replace
the link with a literal. A rule that offered to null the link would be choosing the silent-failure
half of the outcome on the author's behalf.

A second, sharper state exists and is deferred. A link the mod does not define but the installed
game does is a different risk from one nothing defines anywhere, because the first depends on load
order and the second is null on every machine. Telling them apart needs an index of the object
hashes the game's own bins define. See "Out of Scope".

## User Stories

1. As a mod author, I want a warning when an object I copied references objects I did not copy, so
   that I learn at build time rather than from a user's crash report.
2. As a mod author, I want that warning to name the property path the link sits at, so that I can
   find it in a bin holding thousands of properties.
3. As a mod author, I want the warning to name the object hash the link points at, so that I can
   search for it in the bin I copied from.
4. As a mod author, I want the warning to give me the object's name where a hashtable knows it, so
   that I am reading a name rather than eight hex digits.
5. As a mod author, I want to be told which of my own bins was expected to define it, so that I
   know whether I am missing a file or missing an object.
6. As a mod author, I want the rule to stay silent about links that resolve inside my mod, so that
   a bin full of internal references does not bury the one link that leaves.
7. As a mod author, I want the finding to say plainly that no repair exists, so that I do not wait
   for a fix button that is never coming.
8. As a mod author, I want the finding to suggest what I can do instead, so that a warning I cannot
   action is still a warning I can act on.
9. As a mod user, I want a mod carrying such a link to be badged, so that a mod that may crash me
   does not read as healthy.
10. As a mod user, I want that badge to be a warning rather than an error, so that mods which
    genuinely only lose an effect are not described to me as broken.
11. As a mod user, I want the badge never to promise a repair for this, so that pressing Repair
    does not leave the mod exactly as it was.
12. As a mod user, I want the check to run on an archive-storage mod without unpacking it, so that
    every mod in my library is judged the same way.
13. As a maintainer, I want the rule to cost one pass over bins the checker already reads, so that
    adding it does not slow a library sweep.
14. As a maintainer, I want the rule to say nothing when it cannot read a bin, so that an
    unreadable file is a failure rather than a false finding.
15. As a maintainer, I want the rule's findings to fold into the existing verdict and severity
    machinery, so that no surface needs a special case for it.

## Implementation Decisions

**One seam: the `Rule` trait.** The rule is a new `problems::rules` module and implements `Rule`
like every other. It needs nothing the trait does not already give: `ProjectFiles` yields the bins,
`BinNames` names the hashes, and the budget bounds the walk. No engine change, no new state, no new
IPC.

**Two collections, one pass per bin.** Reading a bin twice - once for the objects it defines, once
for the links it holds - is a second parse of every file. The walk collects both from the same
parse and the rule joins them afterwards, because a link may name an object defined by a bin that
is read later.

**The rule id is `bin/object-link`,** grouping with `bin/property-type` and `bin/resolver-key-loss`
under the existing prefix.

**Severity is `Warning` and there is no `fix`.** The rule reports `unfixable` wording, which the
existing brief machinery already surfaces. This is what keeps a mod carrying one out of `healthy`
without claiming it is `repairable`.

**Nested links count.** An `ObjectLink` can sit inside a container, a map value, a struct or an
embedded object, at any depth. The walk descends the same shapes `bin/property-type` descends, and
the trail it builds for the property path is the same idea.

**A map key that is an `ObjectLink` is a link too.** Maps admit link-typed keys, and a key naming
nothing is the same defect as a value naming nothing.

**Self-links are silent.** An object linking to itself resolves by definition.

**The basis does not change.** The rule reads no published database and no hashtable generation it
does not already read, so `HealthCheckBasis` gains nothing. The manager version already covers "a
release that added a rule", which is what makes existing verdicts due again.

## Testing Decisions

A good test here asserts what a modder is told, never how the walk is written. The rule's seam is
`Rule::check` over a built project, which is how `bin/property-type` and `bin/resolver-key-loss`
are already tested, and every case below is expressible there. Nothing needs a new harness.

Prior art to copy: the fixture builders in `mods/test_support` for a project holding a bin, and the
existing rule suites for the shape of a case that builds a bin, runs the rule and reads the
findings back.

Cases the suite must carry:

- A link naming an object the same bin defines is silent.
- A link naming an object a **different** bin of the same mod defines is silent, which is the case
  that forces the two-collection design rather than a per-file judgement.
- A link naming an object no bin of the mod defines is one finding.
- The finding names the property path, the object hash, and the hash's name where one is known.
- A link nested inside a container, a map value, a map key, a struct and an embedded object is each
  found, at depth.
- An object linking to itself is silent.
- Two links naming the same absent object are two findings, because each is a site an author has to
  visit.
- The rule offers no fix, and the mod's verdict is therefore not `repairable` on its account.
- A bin that cannot be parsed is reported as a failure and produces no findings.
- The rule runs over a mod read from its archive, not only from a tree.

## Out of Scope

**Telling "the game defines it" from "nothing defines it".** This is the second state described in
the Solution, and it is the one that would let the rule say a link is null on every machine rather
than merely unresolved inside the mod. It needs an index of every object hash the installed game's
bins define, built once per game build and cached beside the existing game index.

It is **blocked on upstream**, not merely deferred. Building that index means sweeping the object
table of every bin in every game archive, and the full-tree parse the manager has today is the
wrong shape for it - it materialises every property of every object to read a list of hashes. The
streaming reader that makes it affordable exists in `league-toolkit` and is **not in the published
`ltk_meta`**: the crate's released 0.8.0 carries no streaming surface. The manager pins a released
version and does not take path dependencies, so this waits on that work being published and the
manager's pin moving to it.

**Runtime residency.** Even with the game index, whether a bin is loaded at the moment a link
evaluates is a runtime property. Two bins examined for this work declare no dependencies at all, so
there is not always a declared edge to reason from. The rule will never promise that a link
resolves, only that it can.

The one artefact that could settle a given case empirically is a full-memory crash dump taken at the
moment such a crash happens, which would show what the link actually resolved to. That is a
maintainer's investigation path rather than anything a rule can do - see spec 018.

**Repair.** Covered in the Solution. Nothing can invent an object.

**Ranking by consumer class.** It is knowable that some classes null-check a resolved link and
others do not, and a rule that knew which class a link's holder was could grade the risk. That is a
per-class table nobody maintains, and a rule keyed on an incomplete one would be quietly wrong
about every class missing from it.

## Further Notes

The defect this rule describes was found by hand in a mod whose verdict read `healthy`, alongside a
property-type mismatch in the same file. The type mismatch is now caught. This one is not, and it
is the remaining explanation for that mod's reported crash - so the rule is worth having before
that report is called closed.

The pattern generalises past copied objects. Any edit that moves an object between bins, or deletes
an object another object names, produces the same state. Copying is simply how a modder reaches it
most often.
