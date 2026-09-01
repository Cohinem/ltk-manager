# Feature Specification: Converting a rejected audio bank instead of discarding it

**Feature Branch**: `016-audio-bank-conversion`
**Created**: 2026-08-31
**Status**: Proposed — out of scope for now, low priority
**Input**: The payload measurement that removed the blocker recorded in `013-004`.

## Problem Statement

A mod ships an audio bank the game's reader will not load. `013-004` reports it and `013-012`
repairs it by deleting it, so the game's own bank answers the request instead. On the corpus that is
a good outcome — the mod's media still plays, because the mod's media bank loads and only the events
bank was dead.

It is not the best outcome. Deleting the events bank discards what the author wrote. A mod whose
events differ from the game's — a genuinely new sound, an event the game has no counterpart for —
loses that, and there is no repair that gives it back.

The alternative has always been obvious and was never available: rewrite the bank at the version the
reader accepts, and the author's events survive. That was blocked on a fact nobody had, which is
what the object payloads do differently between the two versions.

## Solution

Convert a rejected bank to the version the reader accepts, rewriting its object payloads rather than
only its header, and keep the author's events.

**The header edit is not the repair, and this is the single most important sentence in this spec.**
Changing the leading bytes gets a bank past the version gate in a handful of edits, and it looks
like the whole job. It is not. The object parser is version-blind and its handlers read sequentially
rather than seeking by declared size, so after the gate it reads the old payload layout as the new
one and misparses everything past the first object that differs. A bank promoted by its header alone
is a silent drop traded for garbage, which is worse. Anyone who implements from a summary of this
spec rather than the spec is at risk of building exactly that.

The payloads have now been measured, and the delta is small. Of the object shapes a legacy bank
holds, most are byte-identical between the two versions and a handful differ, every difference an
insertion at a point that has to be reached by parsing rather than by offset. That makes the
conversion mechanical.

It does not make it ready, and this spec is parked rather than scheduled because of what is still
missing. See the Confidence section.

## User Stories

1. As a mod user, I want a mod whose audio is silent to be repaired in a way that plays the sounds
   its author made, so that I get the mod I installed rather than the game's defaults.
2. As a mod user, I want a repair that cannot be made safely to be refused rather than attempted,
   so that a silent mod never becomes a broken one.
3. As a mod user, I want to know when a repair is experimental, so that I can decide whether to take
   it.
4. As a modder, I want the events I authored to survive a repair, so that a fixer does not quietly
   delete my work.
5. As a modder, I want a bank the converter will not handle to say so plainly, so that I re-export
   rather than assume it was fine.
6. As a maintainer, I want the conversion's scope stated as what it covers rather than what it
   excludes, so that an unhandled shape fails closed.
7. As a maintainer, I want the claim "this loads in a running game" established before this ships,
   so that we are not the ones who find out.

## Requirements

### Functional Requirements

- A conversion rewrites both the header and the object payloads. Neither alone is the repair.
- A bank the reader already accepts is never converted. That includes a legacy bank carrying no more
  than its media, which loads today and would only be newly exposed to a field the newer format
  reads.
- A conversion refuses, rather than passing through, any object shape it does not handle. Fail
  closed is the whole safety argument.
- A conversion refuses a source version outside the range it has been measured against. The legacy
  range is **not one payload format**, and an older generation than the versions our corpus holds
  does not even walk its objects contiguously.
- A converted bank is re-parsed before it is written, and a bank whose output does not re-parse
  exactly is refused.
- The finding says what the conversion cannot recover, where it cannot recover something.
- A conversion is surfaced as experimental until `016-001` is answered.

### Key Entities

- **Conversion** — rewriting a bank at the version the reader accepts, payloads included, so its
  objects survive. Distinct from **removal**, which is `013-012`.
- **Convertible subset** — the source versions and object shapes the conversion has been measured
  against. Everything outside it is refused.
- **Unrecoverable field** — a value the newer format carries that an older bank has no source for.

## Implementation Decisions

Only two things are decided, and both are refusals:

- **Fail closed on shape.** An unhandled object shape must make the conversion refuse the bank,
  rather than pass the shape through with a warning and write the file anyway. The tempting middle
  course — write it, then let a validation pass skip exactly the shapes it could not read — reports
  a success it has not earned. A converter that claims to have converted something it did not
  understand is worse than one that reports nothing.
- **Fail closed on version.** Refuse outside the measured range rather than attempting and hoping.

Everything else is open, and deliberately so while this is parked:

- Whether the conversion lives in this repo or upstream in the toolkit crates. It is bank surgery
  with no manager-specific logic in it, which argues upstream.
- Whether it is offered as a fix at all, or only as an explicit action a user takes.
- How it interacts with `013-012`. Conversion supersedes removal for a bank the mod actually needs,
  and removal stays right for a bank the mod ships and does not need — which on the measured corpus
  is most of them. Which of the two a rule offers, and whether it offers both, is not decided.

## Confidence

Stated separately because the gap between "measured" and "proven" is the reason this is parked.

**What is established.** The payload delta was derived twice over, from the readers themselves and
by exact byte accounting over tens of thousands of shipped objects with no bytes left unconsumed.
Thousands of objects round-trip byte-identical through the transform and back. Every legacy bank in
one shipped install that the converter accepts converts and re-parses exactly.

**What is not.** **No converted bank has ever been loaded by a running game.** What is established
is that the current parser consumes the output exactly. That is necessary and it is not sufficient,
and a format that parses is not a format that plays.

**What is out of reach.** One field the newer format gained cannot be derived from an older bank.
Around one in five current banks set it, so it is a live feature rather than a vestige, and writing
a default is a choice rather than a restoration.

**What was never looked at.** Shapes that carry music are understood but unimplemented. Several
rarer shapes were never diffed at all. Neither appears in our corpus, which is a fact about the
corpus.

## Testing Decisions

Not specified while this is parked. Two constraints are already clear:

- **Re-parse is the acceptance test, not the whole test.** A conversion that re-parses exactly is
  the floor. The ceiling is `016-001`, and no amount of parser agreement substitutes for it.
- **Refusal is the property most worth asserting.** A bank outside the convertible subset must leave
  the mod untouched. That is the same guarantee the existing repair gives and it must survive.

## Out of Scope

- Everything in `013-mod-defect-rules`. That spec detects, and its one bank repair is removal.
- Removal itself, which is `013-012` and ships first.
- Any bank the reader already accepts.
- Reading the installed game as a source of parts, which is `015-game-as-parts-source`. A conversion
  derives everything from the bank in front of it.
- Authoring banks, or any editing surface. This is a repair, not a tool.

## Further Notes

**Removal ships first and is not a stopgap.** For the shape the corpus actually holds — a mod that
replaces media at the ids the game already uses and ships an events bank it does not need — removal
is the correct repair and conversion would be work for no gain. Conversion earns its keep only where
the author's events differ from the game's, and nobody has measured how often that is. That
measurement is `016-002`, and it is the cheapest thing in this spec.

**Two traps that look like details and are not.** The conversion widens a table whose new slots have
a fill value that is not the obvious one — the obvious value means "absent" and the correct one
means "use the default", and choosing wrongly silently disables a set of audio effects rather than
failing. And counts inside the object hierarchy are variable-length integers rather than fixed
words, a reading that fits every shipped object where the fixed-word reading fits none. Community
parsers commonly get the second one wrong.

**The chunk walk has to be tolerant.** Chunks are not always contiguous and their headers are not
always aligned, so a walk that steps by declared size desynchronises on banks the game itself ships.
`013-004` already has to handle this for reading. Surgery has to handle it for writing.

**One methodological note worth keeping.** The fill value above was read one way from the code and
corrected by what shipped data actually holds. That is the exact inverse of `013-004`'s deleted
sibling rule, where an invariant that held across every shipped bank turned out to mean nothing
because the code never read the field. Neither source outranks the other. A claim wants both.
