# ADR-0011: A repair may lose fidelity where no in-place edit exists

Status: accepted (2026-08-30)

Amends [ADR-0006](0006-a-repair-preserves-names-instead-of-keeping-a-restore-point.md), which
records that every repair is lossless. That was true of every repair that existed when it was
written, and it is no longer the rule.

## Context

ADR-0006 removed the restore point and made preserved names the guarantee in its place, and it drew
a distinction to justify that: reversibility and losslessness are not the same promise, a restore
point answers "put it back", and a preserved name answers "you did not lose anything". Dropping
reversibility was acceptable **because** losslessness held. A repair rewrote the value it came for
and left everything else exactly as it found it.

That holds for every repair the manager ships. The one bin rule rewrites a property and re-encodes
the file around it, and the bytes it did not address come back the same.

It does not hold for a block-compressed texture. The format stores 4×4 pixel blocks, so a texture
whose dimensions are not multiples of four is not a value that can be corrected in place — there is
no edit to the file that makes it valid. The only repair is to decode the image, resize it, and
encode it again. That re-quantises every block rather than only the ragged edge, and regenerates
the mipmap chain with our filter rather than the author's.

So the choice is between a repair that degrades content it did not need to touch, and no repair at
all for a defect that crashes the game and that the diagnostics code table already recognises.

## Decision

**A repair may degrade content where the defect cannot be corrected in place. It must say so, and
it must degrade no more than the correction requires.**

The blanket promise in ADR-0006 narrows to what the preserved-names mechanism actually delivers,
which is that a repair never destroys a **name**. Fidelity is now a per-rule property rather than a
guarantee of the repair system, and a rule that spends it says which fidelity and why.

Three bounds, so this does not become a licence:

- **In-place first.** A rule that can correct the value in place must. This applies only where the
  format admits no such edit, which is a fact about the format rather than a judgement about effort.
- **The smallest change that fixes it.** For the texture that means resampling down to the nearest
  valid size rather than padding up, so the repair never manufactures content, and re-encoding to
  the format the texture already had rather than one that is easier to write.
- **Refuse rather than approximate.** Where the change cannot be made without altering what the
  content means — a two-channel normal map re-encoded as colour, say — the rule reports and offers
  no fix. A crash traded for broken lighting is not a repair.

## Consequences

A user cannot get the original bytes back. That was already true — ADR-0006 made every repair
irreversible — but until now what came back was the author's content minus one wrong value. For a
repaired texture it is a re-encode of the author's content, and no undo exists anywhere in the
manager to recover the original.

The vocabulary has to stop overclaiming. `CONTEXT.md` says a repair is lossless, and three module
comments say it too. The glossary is corrected with this decision, because a glossary that states a
falsehood is worse than one that is silent. The code comments are left until the modules change,
and they are wrong in the meantime.

Fidelity becomes something a reader has to check per rule rather than assume. That is a real cost
in comprehensibility, and it is why the bound is written down here rather than left to each rule to
decide for itself.

Nothing here weakens preserved names. Every repair that hashes a path still writes the path down
first, and that is the guarantee ADR-0006 exists to make. What changes is that it was doing double
duty as a general promise about content, and it was never that.
