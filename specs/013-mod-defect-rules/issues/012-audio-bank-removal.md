# Issue 013-012: Bank repair by removal, guarded on the install

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: high`  
**Status**: Done  
**Blocked by**: `013-004`

## Context

`013-004` reports a bank the game's reader silently drops. This is the repair for it, and what it
achieves is better than the phrase "delete the broken file" suggests.

An overlay archive is the game's own archive with the mod's overrides layered over it. So removing
a mod's bank does not leave a hole — it leaves the bank the game shipped. Measured across the
corpus:

- **15 of 17** rejected banks sit at a path the installed game also has.
- **14 of those 15** ship their sibling media bank as well, and that one loads, because a media-only
  bank is accepted at the older version.
- On the one case both halves could be read, the mod's media ids are an exact **73 of 73** match for
  the game's at the same path.

That is the ordinary shape of a sound-replacement mod: replace the media at the ids the game already
uses, and ship an events bank that turns out to be unnecessary. Today the events bank is rejected
and nothing triggers the mod's sounds, so the mod is silent. Remove it and the game's own events
fire against the mod's media. **The repair does not restore the game's audio, it makes the mod play
the audio its author shipped.**

## The guard

A bank is asked for by name. A skin bin's `SkinAudioProperties` holds a list of `BankUnit`, and each
one carries the paths of the files that unit needs — the media bank, the events bank, and any media
package. That list is where a request for a bank comes from.

So the question deletion has to answer is not "does anything reference this file", it is **"after
removing it, can every request for it still be answered"**. Those give different answers, and the
difference is the whole design:

| Referenced by a bank unit | Game holds the path | Verdict                                  |
| ------------------------- | ------------------- | ---------------------------------------- |
| yes                       | yes                 | **remove** — the game's own bank answers |
| yes                       | no                  | **refuse** — nothing would answer        |
| no                        | either              | **remove** — nobody asks                 |

Measured on the corpus. The 15 are the first row. The 2 are the second: both are
`renekton_base_sfx_events.bnk` under a custom skin directory the game does not have, and the mod's
own bin lists it in a bank unit. Removing it would leave a unit asking for a file in no mounted
archive, which is the class the diagnostics table records as `ALE-9B39AA45`, a crash. Silence traded
for that is worse than the silence.

**Removing unless the file is referenced lands on the same 17 answers as the table above, and that
agreement is a coincidence worth understanding rather than relying on.** It holds only because the
15 removable banks are referenced by the _game's_ bins and
not by the mods' own, so a reference scan scoped to the mod finds nothing asking and removes them.
Two things break it. A mod that ships its skin bin as well as a replacement bank at a game path
would be refused, and the user would keep the silence for no reason. And widening that scan to the
game's bins — the obvious improvement — would make it refuse all 15, because the game asks for every
one of them.

Reference alone is the wrong axis. It tells you who asks. The game index tells you who can answer,
and only the pair decides.

## Acceptance criteria

- Offers a fix that removes a bank the rule reported, where every bank unit asking for that path can
  still be answered after it is gone.
- Removes a bank no bank unit asks for at all.
- Offers no fix where a bank unit asks for the path and nothing else in the built archive set holds
  it, and says why in the unfixable sentence.
- Reads bank units from the game's bins as well as the mod's, because most requests for a replaced
  bank come from the game.
- The finding says what removal will do, which is that the game's own bank answers instead.
- A removal is recorded as a removal in the fix report, distinct from a write.
- An `archive`-storage mod is repaired in its archive, the same as any other repair.
- Removing the bank leaves the rest of the mod untouched.

## What has to be built first

There is no removal anywhere in the repair path, so this is three changes:

- `FixRun` has `read`, `write` and `skipped`, and needs a removal beside them.
- `FileOutcome` records counts rather than what happened, so a removal and a write read the same
  today. It has to say which it was.
- `RepairEdit::read` turns a file with applied changes into a delta write by reading its repaired
  bytes back out of staging. A removed file has no bytes, so it states the removal instead.

**The archive story is an edit.** `ltk_fantome` 0.11.0 carries `ArchiveDelta::remove_chunk` and
`remove_entry`, so removing one bank from a large mod rewrites that WAD's tail rather than every
chunk the mod holds. A repair the Fantome format has no edit for still falls back to repacking the
staged tree, and a file the fix run deleted from staging is not in that tree, so the fallback stays
correct for an archive shipping its WADs as loose files.

## Notes

**Reading the reference list is work this issue needs.** The paths live in bank units inside skin
bins, so the check reads the mod's bins and the game's, resolves each path to a chunk hash, and asks
whether the archive set still answers it. The class is documented at
`https://meta-wiki.leaguetoolkit.dev/classes/skinaudioproperties/`.

**The same scan answers a rule this spec does not have.** A bank unit naming a file that exists in
neither the mod nor the game is a request nothing can answer, which is the crash class above,
arrived at without anyone deleting anything. Nobody has measured how often a mod ships one. That is
its own rule and its own issue.

**This is not the other repair, and the other repair is not a header edit.** A rejected bank can
also be converted to the current version, which keeps the author's events instead of discarding
them. That is the better outcome. It means rewriting the object payloads, not just the header —
`013-004` carries why, and why a header edit that looks sufficient is the most damaging thing anyone
could take from this spec. The payload delta is now measured and the conversion is mechanical, and
it is still unproven in a running game. Removal is available today because it needs no knowledge of
the bank's contents at all.

That is `016-audio-bank-conversion`. If it proves out, it supersedes this for banks the mod actually
needs, and this stays the answer for a bank the mod ships and does not need — which, on the evidence
above, is most of them. `016-002` is the measurement that says how large that difference is.
