# Feature Specification: A crash the user can name

**Feature Branch**: `018-crash-dump-fingerprint`
**Created**: 2026-09-01
**Status**: Draft
**Input**: A crash report against a mod that no rule could explain, and the discovery that the
install already writes crash dumps the manager never reads.

## Problem Statement

A user says a mod crashes their game. Everything the manager can tell them today comes from the
outside: the process is gone, `GameCrashes/last_crash` carries a timestamp, and the incident report
says the session ended in a crash rather than a kill. None of that says **where**.

So the report that reaches a maintainer is "it crashes when I last-hit a minion", and the only way
forward is for somebody to guess. Two users with the same crash cannot discover that it is the same
crash. A user whose crash is a known one is told nothing, even when the cause is already written
down somewhere.

The install is already writing more than the manager reads. Every crash leaves a minidump in the
crash directory, and it carries the faulting address and the module it landed in.

## Solution

Read the dump the install already wrote, and reduce it to one line a person can quote.

The faulting address is useless on its own, because the process is relocated on every launch. It
becomes stable when the module's load base is subtracted from it: the result is an offset into the
executable, identical across launches of the same build. That offset, with the build, is a crash
fingerprint.

Two dumps taken from one machine hours apart demonstrate it. Their absolute fault addresses differ
because the base differs, and both reduce to the same offset:

```
dump A   fault 0x7ff7eeef03ef   base 0x7ff7edb60000   ->  +0x13903ef
dump B   fault 0x7ff77e6703ef   base 0x7ff77d2e0000   ->  +0x13903ef
```

Same offset, same module size, same exception code, and the same access violation reading address
zero. Without the subtraction they look like two unrelated crashes.

That is the whole feature: exception code, faulting offset, module, and the build. It needs no
symbols, no debugger, and no upload. It turns "it crashes sometimes" into a string two users can
compare and a maintainer can look up.

## What a dump actually contains

Established by decoding the dumps this install had already written, not from documentation.

The dumps in the crash directory are around 3.4 MB and carry eleven streams: system info, misc
info, the thread list, the exception record, the module list, the unloaded module list, a memory
**info** list, handle data, a small memory list, and two streams that are not standard types and
are most likely the crash reporter's own annotations.

Two consequences follow, and both matter:

- **The memory info list is a map of the address space, not its contents.** The memory list beside
  it is under 7 KB, which is stack around the fault and nothing else. There is no heap in these
  dumps, so nothing in them can be walked to ask what the game had loaded.
- **Everything the fingerprint needs is present.** The exception record carries the code, the fault
  address and its parameters. The module list carries every module's base, size and name. That is
  four fields out of two streams.

The game will write a full-process-memory dump instead, under a launch flag, and another flag
disables uploading so such a dump never leaves the machine. That combination is an investigation
tool for a maintainer reproducing a specific crash. It is not something to put in front of users:
the dumps run to gigabytes, and reading anything useful out of one means knowing runtime structure
layouts that change every patch.

## User Stories

1. As a mod user, I want the incident report to name where my crash happened, so that I can paste
   something more useful than "the game closed".
2. As a mod user, I want that name to be the same string every time the same crash happens, so that
   I can tell a recurring crash from a new one.
3. As a mod user, I want to be told when my crash is one that is already understood, so that I stop
   looking for a cause somebody has already found.
4. As a mod user, I want nothing sent anywhere, so that reading my crash costs me no privacy.
5. As a mod user with no dump, I want the report to say so plainly, so that its absence does not
   read as a failure of the manager.
6. As a maintainer, I want two reports of the same crash to be recognisably the same, so that I can
   count how many users an issue affects.
7. As a maintainer, I want the fingerprint keyed on the game build, so that an offset from an old
   patch is never matched against a new one.
8. As a maintainer, I want a place to record what a known fingerprint means, so that the second
   user to hit a crash gets the answer the first one earned.
9. As a maintainer, I want the reader to skip a dump it does not understand, so that a format
   change costs a line of the report and not the report.
10. As a maintainer, I want to know when a dump is present but was written by a different build
    than the one installed, so that a stale dump is not read as this session's crash.
11. As a maintainer investigating a specific mod, I want to know how to make the game write a full
    dump locally, so that a crash worth real analysis can get it.
12. As a privacy-conscious user, I want the manager never to read the crash reporter's own event
    files, so that the existing boundary is kept.

## Implementation Decisions

**A reader in `diagnostics`, beside the existing crash-directory code.** That module already
resolves the crash directory and reads its marker file, and the report it builds is where a
fingerprint belongs.

**Parse four things and stop:** the header, the stream directory, the exception stream and the
module list stream. Every other stream is skipped by the directory walk. This is a small amount of
fixed-layout struct reading with no dependency.

**The fingerprint is `(build, module, offset)`,** rendered as the module name and a hex offset. The
exception code and the fault parameters ride alongside it, because an access violation reading
address zero and one reading a small offset are different bugs and the parameters are what separate
them.

**A meaning table keyed on the fingerprint,** carrying the code, its kind, whether the entry is
confirmed or inferred, and what it means. Nothing about where the entry came from, matching the
discipline the existing log-code table already follows.

**The reader never opens the crash reporter's event files.** The documented rule that those hold the
account name and identifiers stands unchanged, and a dump reader is not a reason to revisit it.

**The report says which dump it read and when it was written,** because a dump older than the
session is somebody else's crash.

## Testing Decisions

The seam is the reader: bytes in, a fingerprint or nothing out. That keeps every case a fixture
rather than a machine with a crashed game, which is what the existing diagnostics suites already do
with their `fixtures` directory.

Cases the suite must carry:

- A well-formed dump yields the exception code, the fault parameters, and the offset computed from
  the module the fault landed in.
- Two dumps with the same offset under different load bases yield the same fingerprint. This is the
  behaviour the whole feature rests on and it is worth asserting directly.
- A fault inside a module other than the executable is attributed to that module.
- A fault in no known module's range yields the address and no offset, rather than a wrong one.
- A truncated dump, a dump with a bad magic, and a dump whose stream directory points past the end
  are each declined without panicking.
- A dump carrying no exception stream is declined.
- A dump is not read as this session's crash when it predates the session.

## Out of Scope

**Symbolisation.** Turning an offset into a function name needs symbols the manager does not have
and may never have. The fingerprint is deliberately a number, and the meaning table is how a number
acquires a name.

**Reading process memory.** The dumps an install writes by default contain none, and the full ones
need per-patch structure knowledge. Nothing here walks game state.

**Uploading anything.** Not now and not behind a setting. The value of this feature is that it is
local.

**Attributing a crash to a mod.** A fingerprint says where the game died, not whose fault it was.
Any link between a crash and an installed mod is inference and belongs to a later decision.

## Further Notes

The full-memory dump is worth keeping in view for one specific reason. The `bin/object-link` work in
spec 017 cannot statically decide whether an object link resolves, because residency is a runtime
property. A full dump taken at the moment of such a crash is the one artefact that could settle it
empirically for a given case, by showing what the link actually resolved to. That is a maintainer's
investigation path, not a rule, and it is why the flags are recorded here.

The two dumps quoted above are from this developer's own install and are the same crash twice. They
are not the crash spec 017 describes.
