# Issue 016-002: Conversion-over-removal frequency measurement

**Spec**: `016-audio-bank-conversion`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: low`  
**Status**: Open, out of scope for now  
**Blocked by**: nothing

## Context

Conversion is only worth building where removal is the wrong answer, and on the corpus removal is
usually the right one. 15 of 17 rejected banks sit at a path the game also holds, 14 of those ship
their media bank as well, and the one case measured end to end matches the game's media ids exactly
— so removing the events bank lets the game's own events fire against the mod's media, and the mod
plays the audio its author shipped.

Conversion earns its keep only where the author's events **differ** from the game's: a new sound, an
event the game has no counterpart for, a bank at a path the game does not hold at all. Nobody has
counted those.

Without that count this spec is a solution looking for its problem, and the count is cheap.

## Acceptance criteria

- For each rejected bank in the corpus, a verdict on whether removal loses anything: does the game
  hold a bank at that path, and do the two declare the same events?
- A count of rejected banks that fall inside the convertible subset, against those refused for
  source version, for carrying music, and for carrying a shape never diffed.
- The two counts crossed: how many banks would both benefit from conversion and be accepted by it.
  That number is what this spec is worth.
- Recorded in the spec, with the corpus it was measured over named.

## Notes

The first half reuses the scan `013-012` already needs, which reads the bank units a skin bin
declares and resolves each path against the archive set. Comparing declared events between two banks
is the new part.

A result near zero closes this spec rather than embarrassing it. Removal would then be the complete
answer for the class, which is a good outcome and worth knowing before anyone writes a converter.
