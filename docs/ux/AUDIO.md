# Audio

The audio support of the workshop: how a Wwise package, bank or WEM opens, what its document
shows, and how its media play. The terms are the ones of the "Audio" section of `GLOSSARY.md`
and of `ltk_wwise`.

## Changes

| Date       | Change                                          |
| ---------- | ----------------------------------------------- |
| 2026-10-29 | Add the event tree                              |
| 2026-10-29 | Add the audio file document and its media table |

Each edit of this document adds a row at the top. The table keeps the last ten rows.

## The audio file document

A `.wpk`, a `.bnk` or a `.wem` opens into the audio file document, from a project layer and
from the game browser alike. A chunk without a name opens into it when its magic is a package,
a bank or a RIFF `WAVE` file.

The head of the document is the file name, its kind, its media count and its size. Under it:

- A file that does not read shows the reader's error in a danger notice. The error names the
  offset where the reader knows one.
- A bank that the client rejects shows the reason in a warning notice, in the words of
  `Bank::check`.
- A bank whose header ID differs from the bank ID of its file name shows both IDs in an info
  notice. It is information and not a warning, because the client registers a bank under the
  ID of its file name and never reads the header ID (rule W3 of `ltk_wwise`). A game chunk has
  no file name, so it shows no such notice.
- A bank shows its version, bank type, alignment and header ID as field rows, and the ID of
  its file name where it has one.

A bank with a hierarchy has two tabs, Media and Events. Events holds the event tree, and it is
the tab that opens in a bank without media.

## Media table

One row per media, by source ID. A package lists its entries in file order, a bank its media
index in ascending source ID order, and a WEM is one row of source ID 0.

| Column    | Shows                                                                     |
| --------- | ------------------------------------------------------------------------- |
| (play)    | The play or stop button of the row                                        |
| Source ID | The ID in decimal, in the mono font                                       |
| Codec     | Vorbis, PCM, ADPCM or Opus, or the `wFormatTag` in hex                    |
| Ch        | The channel count                                                         |
| Rate      | The sample rate in samples per second                                     |
| Duration  | `m:ss.cc`, from the `data` size and the byte rate. An estimate for Vorbis |
| Size      | The bytes the media takes in the file, in binary units                    |

Listing a file reads the `fmt ` chunk of each media and decodes no audio, so a package of
thousands of media lists at once. The table is windowed.

A media whose codec has no decoder, or whose header does not read, stays in the table with its
codec and a disabled play button. The button's tooltip gives the reason. A media that fails to
play takes the same state.

The filter keeps the rows whose source ID contains its text. Source ID, Duration and Size sort.
A press on Duration or Size sorts largest first, a second press smallest first, and a third
returns the file order.

### One player

A document plays through one player. Playing a row stops the row that played before it, and
pressing the playing row stops it. The player stops when the file changes on disk and when
the document closes. The play state of the row is the pressed state of its button, and a live
region announces the source ID that plays.

### Keyboard

The table is one tab stop. Focus selects the first row if no row is selected.

| Key                | Action                                    |
| ------------------ | ----------------------------------------- |
| Up, Down           | Move the selection one row                |
| Page Up, Page Down | Move the selection ten rows               |
| Home, End          | Select the first or the last row          |
| Space, Enter       | Play the selected row, or stop it         |
| Ctrl+C             | Copy the source ID of the selected row    |
| Shift+F10, Menu    | Open the context menu of the selected row |

### Row actions

The context menu of a row holds Save as `.ogg` (`.wav` for PCM), Save as `.wem` and Copy source
ID. A save asks for its destination in the save dialog and writes through a temporary file.
`.ogg` and `.wav` write the decoded media, and `.wem` writes the bytes as the file holds them.

A layer file that changes on disk lists again, and its media play from the new bytes.

## Event tree

The Events tab lists every event of the bank. A named event shows its name, and an event that
no name hashes to shows `#` and its decimal ID. Named events come first, by name, then the
unnamed ones, by ID. The filter keeps the events whose name or decimal ID contains its text.

### Names

An event takes its name from the first of:

1. The bins of the open project. They are read on every open, so an event that a project
   creates has its name without a rebuild.
2. The audio index of the game: every `BankUnit` `events` entry and every string of
   `SoundEventData.mSoundName`, the four sound fields of `VfxSystemDefinitionData`,
   `VfxEmitterAudio.SoundOnCreate` and `SoundPersistent`, and the strings of
   `UiComboBoxSoundEvents` and `UiElementGroupButtonSoundEvents`.

The audio index is built on a background thread the first time an event bank opens, and again
when the game build changes. It is cached beside the game index cache. While it builds, the tab
shows an info notice and lists the events with the names of the project alone. The list updates
when the build finishes. The index uses `events` as a name source only, never as a list of what
a bank holds, because the skin loader reads neither `BankUnit.name` nor `BankUnit.events`.

### Bank set

The media of an event live in other files. The bank set of an opened event bank is the bank
first, then every file of every bank unit that names its path, from the project's bins and
then from the audio index. A voice-over unit reads its paths under the client's locale.

If no bank unit names the bank, the set falls back to the sibling convention: the same
directory, the stem with `_events` replaced by `_audio`, as a `.bnk` and a `.wpk`. An info
notice says so. A bank whose stem has no `_events` suffix is read alone. In a set that bank
units name, a file that no layer and no game archive holds is listed in a warning notice.

A project layer's copy of a file comes before the game's, as the client reads them.

### Rows

| Row       | Shows                                                                        |
| --------- | ---------------------------------------------------------------------------- |
| Event     | The name, the action count and the status                                    |
| Action    | The class name, such as Play, Stop or SetVolume, and the ID of its target    |
| Container | The kind and the ID, and the rule of what plays                              |
| Sound     | The ID, the source ID and the file name of the file that holds the media     |
| Other     | The object kind and the ID, marked as not playing. Music objects say "music" |
| Missing   | The ID of an object that no bank of the set holds                            |

An action class outside the table of Wwise classes shows as `0x` and four hex digits. A Play
action expands into the object it plays. An event's tree is read when the event expands or
plays, so a bank of hundreds of events lists at once.

| Status         | Tone    | When                                                      |
| -------------- | ------- | --------------------------------------------------------- |
| Media missing  | Warning | A sound names a media that no file of the set holds       |
| Object missing | Warning | An action or a target names an object that no bank holds  |
| Decode error   | Error   | An object does not decode. The row gives its ID and error |

### What plays

A press on a row plays what one press of the game plays from that row:

| Node             | Plays                                                     |
| ---------------- | --------------------------------------------------------- |
| Random container | One child, picked uniformly on every press                |
| Switch container | The first child. The row says that the switch is not read |
| Layer container  | Every child at once                                       |
| Actor-mixer      | Every child at once                                       |
| Sound            | Its media                                                 |

An event plays the picks of all its Play actions at once. Action delays are zero until
`ltk_wwise` decodes the property bundles. A press stops what the press before it started, so
a second press on a random container plays another variation. A sound whose media is missing
and an object that does not play give nothing to play and show no play button.

### Keyboard

The tree is one tab stop. Focus selects the first row if no row is selected.

| Key                | Action                                                         |
| ------------------ | -------------------------------------------------------------- |
| Up, Down           | Move the selection one row                                     |
| Page Up, Page Down | Move the selection ten rows                                    |
| Home, End          | Select the first or the last row                               |
| Right              | Expand the row, or select its first child if it is expanded    |
| Left               | Collapse the row, or select its parent if it is collapsed      |
| Space, Enter       | Play the selected row                                          |
| Escape             | Stop what plays                                                |
| Ctrl+C             | Copy the name of an event, or the ID of an action or an object |
| Shift+F10, Menu    | Open the context menu of the selected row                      |

### Row actions

An event's context menu holds Copy event name, which copies `#` and the ID for an unnamed
event. An action's and an object's menu holds Copy object ID. A sound whose media is found also
holds Show media, which opens the document of the file that holds the media, switches it to the
Media tab and selects the row of the source ID.
