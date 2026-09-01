# Issue 016-001: In-game proof that a converted bank loads

**Spec**: `016-audio-bank-conversion`  
**Labels**: `area: backend`, `ready-for-human`, `priority: low`  
**Status**: Open, out of scope for now  
**Blocked by**: nothing

## Context

The conversion is measured against the parser and never against the game. Tens of thousands of
shipped objects parse with every byte consumed, thousands round-trip byte-identical, and every
legacy bank in an install that the converter accepts converts and re-parses exactly.

None of that is the claim the repair actually makes, which is that the sounds play. A format that
parses is not a format that plays, and the whole of this spec rests on a step nobody has taken.

This is the gate. Until it is answered the conversion cannot be offered as a repair, and answering it
is cheap next to everything else here — one bank, one match.

## Acceptance criteria

- A converted bank is loaded by a running game and its events are confirmed to fire.
- The bank used is one of the measured corpus rather than a synthetic one, so the result speaks
  about mods that exist.
- A negative result is recorded as fully as a positive one, including what was heard or not heard
  and at what point.
- The answer is written into the spec's Confidence section rather than left in a conversation.

## Notes

Deliberately labelled for a human. It is a test that needs a game, a match, and ears, and none of
those is a thing an agent can hold.

Worth pairing with the same bank left unconverted, so that "no sound" is distinguishable from "no
change".

`013-004`'s own reproduction attempt is the cautionary tale here: two local runs of a specimen
failed to reproduce a reported crash, and the probable reason was that the ability under test needs
a real champion target, which a practice session does not provide. Pick a bank whose events fire on
something reachable.
