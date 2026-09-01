# ADR-0012: The overlay merges a mod over the game's copy

Status: accepted (2026-08-31)

Adds a **merge** entry to [CONTEXT.md](../../CONTEXT.md), and answers the question
`specs/015-game-as-parts-source` was written to hold.

## Context

Every fix the manager applies is derived from the mod alone. A rule reads the mod's files, works
out what is wrong from what it sees there, and writes the corrected value back.
[ADR-0005](0005-a-repair-rewrites-the-archive-in-place.md),
[ADR-0006](0006-a-repair-preserves-names-instead-of-keeping-a-restore-point.md) and
[ADR-0011](0011-a-repair-may-lose-fidelity-where-no-in-place-edit-exists.md) all assume it, and it
holds for every rule we ship.

It cannot reach the largest defect class we have measured. A mod that ships its own copy of a bin
the game also has **replaces** that chunk, so everything the mod did not carry forward is gone
from what the game loads. In one specimen the loaded view holds 847 objects where the game holds
1,473, and 1,151 `ResourceResolver` map keys go with them. The material that would repair it is
not in the mod. There is nothing to derive a fix from.

Two candidates were measured before this decision, and the order they fell in is the argument.

A **rebind** re-adds a dropped key pointed at the mod's own equivalent object, which is the repair
that touches nothing the author made. It is also what the mod already does for the 4,289 keys it
kept. For the 1,151 it dropped it reaches **none of them** — the mod ships 61 particle objects and
all 61 are already bound, against the 289 distinct effects the dropped keys ask for. The control on
the same matching, over the keys the mod kept, resolves 4,247 of 4,704 and lands on the mod's own
target every time, so the zero is a fact about the mod rather than a weak search. There is no spare
object to find.

A **merge** reaches all of it. Layering the mod's content over the game's — objects combined field
by field, maps combined key by key — restores every dropped key, keeps all 4,788 of the mod's own
bindings and the 84 keys it adds, and **breaks no link the game does not already leave open**. It
also puts back fields the mod dropped, including eight a community fixer nulled as its own
documented last resort.

The severity settles which of those is acceptable. **A resolver miss can crash, and whether it
does depends on the call site rather than on the key.** The same absent key is fatal from one
caller and harmless from another, and the callers are compiled spell scripts outside every bin. So
nothing the manager can read says which keys are the dangerous ones, and a repair that restores
most of them leaves an unknown subset of crashes standing. The repair has to be total, and merge is
the only total candidate.

That leaves where it runs. A merge written into the mod would bake bytes from one install at one
patch into the user's file, growing the specimen from 264 objects to 1,523, with no copy of the
original kept because ADR-0005 does not keep one. A merge performed while the overlay is built
changes nothing on disk and is recomputed against whatever is installed at the time.

## Decision

**The overlay build layers a mod's content over the game's copy of a chunk instead of letting it
replace the chunk. The mod on disk is never rewritten.**

Merge semantics are the ones a `PTCH` patch record already carries, which is not a coincidence
worth spending twice: a plain value replaces, a map combines key by key, an object and an embedded
struct combine field by field. Where the mod says nothing, the game's content survives.

Three bounds.

**It is not a repair.** Nothing is written to the mod, nothing is irreversible, and preserved names
do not apply because no name of the mod's is hashed away. The guarantees in ADR-0005, ADR-0006 and
ADR-0011 are untouched, because none of them is engaged.

**It applies only where the mod overrides a chunk the game also has.** A chunk the mod introduces
is mounted as it always was. This is not a general policy that mods stop replacing things, it is
what happens at one seam where replacing loses content the game needs.

**It is recomputed on every build.** No result is stored, so there is nothing to go stale when the
game patches, and nothing to invalidate.

## Consequences

The health vocabulary has a hole this decision opens and does not fill. A defect the build
compensates for is never repaired, so the mod file carries it forever and a check that finds it
cannot honestly call the mod `repairable` — the press that word promises does not exist, and would
do nothing if it did. `healthy` is wrong too, because the mod really is defective and behaves
differently under another manager. None of the three verdict words fits, and CONTEXT.md's **Check**
entry says a check is a claim about a mod rather than about a mod-plus-our-build. That needs
deciding before the rule ships, and it is a smaller question than this one only because this one is
settled first.

What the overlay mounts is no longer a copy of the mod's files. Until now the build routed, renamed
and repacked a mod's content but never invented any, so a chunk in the overlay came from the mod.
Now some chunks are a computation over two inputs. Anything reasoning about the overlay by reading
the mod is wrong from here, and the build gains a dependency on the game's bin contents rather than
only on its paths.

Our fix does not travel. The same mod installed through cslol, or shared with someone else, still
crashes. That is the direct cost of not writing into the mod, and it is accepted because the
alternative writes one machine's patch into a file the user may keep for years.

The result can look mixed. A skin whose mod supplies 61 effects and whose game copy wants 231 plays
the author's work where it exists and the game's elsewhere. That is what those numbers honestly
look like, and the state it replaces is an effect that does not play or a client that closes.

The operation is now named once for two futures. If mods ever ship deltas rather than replacements,
a shipped patch record and this build-time merge are the same semantic at different times, and
neither needs a second vocabulary.
