# Issue 013-006: Rule: bin/text-dump, ritobin text dump in a shipped mod

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-human`, `priority: low`  
**Status**: Deferred  
**Blocked by**: nothing

## Context

One specimen ships **10 chunks totalling 23.93 MB, 16% of the whole archive, as ritobin text.** All
ten are hex-named, so nothing about the filename gives it away.

**Deferred, because this is not a defect.** Ritobin is our own text syntax for a `.bin`, and the
manager opens bins in it for editing. An author who packages it into a shipped mod has left build
residue in the archive, not broken the mod. The game never asks for those chunks, so nothing about
the mod stops working. What it costs is size, and 16% of an archive is a real number but it is a
number about download and disk rather than about a crash.

Reporting it as a defect would have been wrong in the way this spec is otherwise careful about: it
would tell a user their mod is broken when it works.

## What would bring this back

The measurement did not establish where those ten chunks sit. If any of them occupies a path hash
the game will look up expecting a compiled bin, the mod has shipped source where content belongs
and the game gets a file it cannot read. That is a defect and this issue is the rule for it.
Answering it is one lookup per chunk against the game index, and it is worth doing before this is
closed rather than deferred.

Until then the honest position is that a mod carrying its own source is untidy rather than broken.
