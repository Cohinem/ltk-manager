# Issue 013-004: Rule: audio/bank-version, unsupported audio bank version

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: high`  
**Status**: Done  
**Blocked by**: `013-002`

## Context

The game's bank reader gates on the header's generator version, and the gate is conditional on what
the bank contains:

- The current version loads.
- An older version, down to a floor, loads **only if it carries no chunk beyond its media index and
  media blob**. A bank holding nothing past its header satisfies that too.
- An older version carrying anything else, in practice the object hierarchy that holds events and
  sounds, is rejected. So is a version below the floor or above the reader's own.

A rejected bank is dropped **silently**. There is no message in a retail client and none in the log
either. The result code is recorded against the bank and nothing ever surfaces it, so a mod whose
sounds simply never play looks like a mod that works.

Measured across 161 community mods holding 179 banks: **17 banks across 7 archives** are an older
version carrying the object hierarchy, and every one of them is dead in game. They are the whole
point of an audio mod in several cases — an announcer pack, a champion SFX replacement.

The same measurement is what rules out the simpler rule. 97 of those 179 banks are the older
version, and 57 of them are media-only and load perfectly. Keying this class on version alone and
deleting anything below the current one would destroy 57 working banks on this corpus to fix 17
broken ones. The game itself ships 836 legacy media-only banks.

## Acceptance criteria

- Reports a bank whose version is below the floor the reader accepts.
- Reports a bank at an older version that carries any chunk beyond the media index and media blob.
- Reports nothing for an older bank carrying no more than that, which the reader accepts by design.
- Reports nothing for a bank at or above the version the reader is known to accept as current. The
  rule judges downwards only — see the bound note below.
- Runs without an installed game. Nothing in the predicate asks the install a question.
- Severity is `Warning`, and the finding says the bank's contents are dropped without a message.
- Offers no fix in this release. The repair is `013-012`, which needs a removal path first.

## Implementation notes

**Walk the chunk list inside a bounded read.** Every bank in the corpus resolves within 2,684
bytes, so 8 KB covers them all. Fall back to a whole-file read only when a chunk body runs past the
buffer, which is the shape where the hierarchy sits behind a large media blob. The game ships 12
banks of that shape and no mod does yet.

**A walk that desyncs reports nothing.** Chunks are not always contiguous and a chunk header is not
always aligned, so a walker that steps by declared size can desynchronise and then misread whatever
it lands on. Nine banks the game itself ships do this. Stop and report nothing rather than report
wrongly. Zero of the 179 corpus banks desync.

**Do not read the version alone.** The chunk shape is half the predicate and the half that keeps
the rule from firing on 57 working banks.

**The bound is two constants, and the predicate only judges downwards.** The floor and the
known-current version are written down rather than read from the install, because reading them
means scanning archives until a current bank turns up, to learn a number that moves twice a year.
What makes that safe is refusing to judge the high end: a bank at or above the known-current version
is never reported. A ceiling read naively would call every newly-authored bank defective on the
release after Riot bumps the version, which is a false positive on a health check and the failure
this whole spec exists to avoid. Judged downwards, a stale constant produces silence instead, and
the measured class stays reported whatever Riot does next, because a bank at an old version does
not become valid later.

**What that buys out.** A bank authored against a newer Wwise than the player's game goes
unreported, because catching it needs the player's own current version. That is the read being
declined.

## Notes

**There are two possible repairs, and they are not the same repair.**

_Conversion_ rewrites the bank at the current version so the author's events survive. **The header
edit alone is not that repair**, and the distinction matters because the header edit looks like the
whole job: a handful of changes to the leading bytes get the bank past the gate, and then the object
parser — one parser, version-blind, whose handlers read sequentially rather than seeking by declared
size — reads the old payload layout as the new one and misparses everything after the first object
that differs. Getting past the gate without rewriting the payloads turns a silent drop into garbage,
which is worse than silence. Anyone reading "promotion is a few header edits" and shipping it would
ship that.

The payload delta has since been measured, and it is small: of the object shapes a legacy bank
holds, most are byte-identical across the two versions and a handful differ, every difference an
insertion at a known point. That makes conversion mechanical rather than speculative. It is still
not something to ship:

- The scope is narrower than the legacy range. That range is not one payload format — a generation
  older than the versions our corpus holds does not even walk contiguously — the shapes carrying
  music are understood but unimplemented, and several rarer shapes were never diffed at all.
- One field the newer format gained cannot be recovered from an older bank. Around one in five
  current banks set it, so it is a live feature, and writing zero is a choice rather than a
  restoration.
- **No converted bank has been loaded by the game.** What is established is that the current parser
  consumes the output exactly, which is necessary and not sufficient.

So conversion is `016-audio-bank-conversion`, out of scope for now and experimental until someone
has played a match on one.

_Removal_ discards the bank so the game's own answers the request instead. It needs no knowledge of
the bank's contents, and on this corpus it does not merely restore the game's audio — it lets the
mod's own audio play, because the mod ships the media and only the events bank is dead. That is
`013-012`.

So this rule reports in this release, and removal is the repair that follows it.

**The alignment field is not safely ignorable, and an earlier note here had it wrong.** It was
recorded as honoured only from a version above the legacy range. It goes live partway _inside_ that
range. The conclusion it supported — that a legacy bank storing zero there is correct — survives
only because the versions that actually ship sit below the point where it starts being read, which
makes it a fact about the corpus rather than about the format. It stays out of this check and
belongs to conversion.

**Leave legacy banks the reader already accepts alone entirely.** Converting one would be pointless
work and would newly expose it to the alignment field.
