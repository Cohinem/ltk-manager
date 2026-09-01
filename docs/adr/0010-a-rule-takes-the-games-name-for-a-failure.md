# ADR-0010: A rule takes the game's name for a failure

Status: accepted (2026-08-30), and every rule it names has since been dropped - see
[Since accepted](#since-accepted). The decision stands. Its examples do not.

Settles the **mount error** entry in [CONTEXT.md](../../CONTEXT.md) and the rule names in
`specs/013-mod-defect-rules`.

## Context

A rule id is a stable public name. It is written into every stored verdict, it is what a user
reads beside a finding, and renaming one later means every verdict that carries it now names a
rule that no longer exists. So the name is chosen once.

Every rule so far names the defect it finds, in our own words: `bin/property-type`,
`wad/chunk-checksum`, `audio/bank-id`. That works while the defect is ours to describe.

One of the new archive rules is not. It reports one path carrying different bytes in two archives
the game will mount, and the game already has a word for the failure that state produces - it
calls the mount **inconsistent**. We had coined `wad/divergent-shared-path` for it.

That left the manager holding two names for one thing, in two places it ships. The rule id is one.
The other is the diagnostics code table, which reads the game's own failure codes back to a user
after a crash, and which carries a row for exactly this failure. A user whose crash log names the
code and whose health check names the rule has no way to see that they are the same sentence twice,
and neither does the next person reading our source.

## Decision

**Where the game has a name for a failure, the rule that predicts that failure takes the name.**
`wad/divergent-shared-path` became `wad/inconsistent`.

Two bounds make it a rule rather than a habit.

**The name is taken only where the two are the same state**, not where they are related. Our rules
are finer than the game's failures, and several of ours can sit inside one of the game's. Where
that happens the narrower rules keep their descriptive names, because they cannot share the single
word between them - `wad/chunk-checksum` and `wad/raw-size` are both inside the game's **corrupt**
case and stay as they are. Many rules to one failure is the expected shape, and only a rule that is
alone under a name may take it.

**The word is taken, never the identifier.** The game's own symbol for a failure is not something
this repository writes down. What crosses over is one ordinary English adjective, which carries the
meaning and nothing about where it was read.

## Consequences

A support conversation gains the join it did not have. "Your log has this code" and "the health
check found this" become one sentence, and the code table's meaning and the rule's finding can be
checked against each other instead of drifting apart unnoticed.

The vocabulary stops being entirely ours. If the game splits or renames a failure, a rule id we
committed to is downstream of a decision nobody here makes. That is accepted, because the
alternative is the drift this ADR exists to stop, and a name that describes the thing wrongly is
worse than one we did not choose.

A rule id says less on its own. `wad/inconsistent` does not tell a reader what is inconsistent with
what, where `wad/divergent-shared-path` nearly did. The glossary carries the definition, and a rule
id was never going to hold one.

Nothing obliges a rule to have a game name. Most of what a mod ships wrong never produces a failure
the game has a word for, and those rules go on being named for the defect they find.

## Since accepted

**Not one of the three rules this ADR argues over ships (2026-08-31).** `wad/inconsistent`, the
rule the decision was made for, and `wad/chunk-checksum` and `wad/raw-size`, the two it holds up
as the narrower names that stay descriptive, were all resolved as states the overlay build should
assert over the archives it writes rather than states a per-mod check should hunt for. Each was
measured at zero across the corpus, and each reaches a user as a crash if it ever happens. See
issues 008, 009 and 010 in `specs/013-mod-defect-rules` for the reasoning on each.

So the ADR now reads as an argument with no instance on either side of it, and the text above is
left as it was written rather than repaired, because it records why the decision was taken and the
rules it was taken over are the evidence.

**Nothing here is reopened.** The decision is about which name a rule takes when it and one of the
game's failures are the same state, and the next rule to be in that position is bound by it. What
has changed is only that the position is currently empty. Two things a later reader should not
conclude from that: the decision was not withdrawn, and no rule was renamed away from a game name

- they were removed for reasons that have nothing to do with what they were called.
