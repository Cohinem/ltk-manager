# Issue 013-013: Rule: audio/bank-id, unset soundbank id

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: high`  
**Status**: Done  
**Blocked by**: nothing

## Context

A Wwise bank's header carries the id the runtime addresses the bank by. The Wwise toolchain
assigns it when the bank is built, so a bank carrying zero was written by something that did not
assign one.

`docs/plans/mod-autofixer-gaps.md` section 8 ranks this second overall, and section 6 is the
measurement behind it. A census of the shipped game read the first 16 bytes of **7,829** banks
across 392 WADs: **not one carries an unset id**. Two of the three specimens do, in both cases the
modder-rebuilt SFX media bank sitting at a real game path whose own bank is sound.

The version is not the signal. Riot ships 838 banks at v134 and 6,981 at v145, so a rule keyed on
the version would report the game's own content. The id is the signal, because zero is a value the
game never ships.

What an id of zero costs is not established here. The reachable evidence says the id is invalid
against a 7,829-bank baseline, and the reported symptoms across the two specimens are audio that
does not play. Whether the runtime also faults is inference, and the finding does not claim it.

## Acceptance criteria

- Reports a `.bnk` whose header carries a soundbank id of zero.
- Reads the header and nothing more, which is 16 bytes per bank.
- Reports nothing for a bank carrying any other id, at any format version.
- Offers no fix, and says the bank has to be rebuilt.
- Reads a mod stored as a tree and one stored as an archive the same way.

## Notes

**Not repairable.** The id is derived by the toolchain from the bank's name at build time, and
synthesizing one would produce a bank claiming an identity nothing else in the mod refers to. The
finding's whole content is "re-export this from Wwise".

This is the cheapest high-value rule in the ranking: 16 bytes per bank, no parse, no dependency on
the installed game, the hash tables, or any other rule.

## Decided during implementation

**Severity is `Error`, not `Fatal`.** What is measured is that the id is a value the game never
ships and that the two specimens' audio does not play. That the runtime also faults is inference,
and the ladder's `Error` - "the game rejects this, the mod does not work" - is what the evidence
carries. Reporting a crash the evidence does not establish is the failure the whole spec exists to
avoid.

**Its own rule rather than a second finding from `audio/bank-version`.** One rule states one id and
one state it objects to, and these are two states with two answers: a version the reader refuses is
a bank to remove, and an unset id is a bank to build again. Both read the same header twice, which
is the cost the `Rule` trait already accepts for keeping a rule self-contained.

**The bank fixture now carries a real id.** `test_support::audio_bank` wrote a zero, so every
existing bank fixture was one this rule would report. It now writes `BUILT_BANK_ID`, and
`audio_bank_with_id` is what a test about the id itself calls.
