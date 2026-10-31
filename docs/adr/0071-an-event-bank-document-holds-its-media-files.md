# ADR-0071: An event bank document holds its media files

- **Status:** Accepted (2026-10-30)
- **Date:** 2026-10-30
- **Crates:** `ltk-manager-audio`, where `EventBankDocument` and `MediaFile` live, and `src-tauri`,
  where `services::audio::bank` copies and saves the files
- **Related:** "New objects" and "Marks and saving" in `docs/ux/AUDIO.md`, #958, #955

## Context and problem statement

An import of a `.wem` adds a sound to the event bank and the media to a media bank or a package of
the bank set. One user action then changes two files. The undo of that action restores both, and
a save writes both or neither. Before this decision the document held the event bank alone, and
each edit replaced one object, which kept every other object's bytes.

## Considered options

- A composite edit in the shell that applies an event bank edit and a media file edit through two
  documents, each with its own history
- A document over every file of the bank set
- The event bank document holds the media files that an import touches

## Decision

**The event bank document holds its media files.** `EventBankDocument` keeps a `MediaFile` for each
media bank or package that an import added media to. A file joins on its first import and stays
until the document closes.

**One edit is one list of changes.** An edit runs as a transaction that logs each object it
replaces, adds or removes, and each media it adds or removes. The list is one undo step. Undo
applies the inverse of each change in reverse order, so a replaced object returns to its place and
keeps its bytes, as the one-object edits did before.

**A media file writes its bytes as read until it holds an added media.** `MediaFile` keeps the
bytes it was read from and the added media apart. While it holds none, it writes those bytes, so
an undo of every import restores the file exactly, even where the writer of `ltk_wwise` would lay
a media index out again.

**A save checks every changed file before it writes one.** It reads each file on disk, refuses if
one differs from the bytes it was read from or last saved as, and then writes each through a
temporary file.

## Consequences

- The existing edits keep their bytes and their tests, and a batch of them is one undo step.
- Two event bank documents that import into one media file each hold a copy of it. The second save
  refuses, because the file changed on disk, and that bank is reopened to import again.
- A media table open on a held file reads the file on disk until the save. The `sound` form of the
  preview protocol reads the document's bytes, so an unsaved import plays.
- A document over the whole bank set was larger: it would hold every file of the set, most of which
  no edit touches, and it would need a rule for a file that two event banks share.
