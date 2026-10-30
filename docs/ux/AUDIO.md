# Audio

The audio support of the workshop: how a Wwise package, bank or WEM opens, what its document
shows, and how its media play. The terms are the ones of the "Audio" section of `GLOSSARY.md`
and of `ltk_wwise`.

## Changes

| Date       | Change                                     |
| ---------- | ------------------------------------------ |
| 2026-10-30 | Edit fields as rows, add the knob          |
| 2026-10-30 | Add event bank editing                     |
| 2026-10-30 | Pick by playlist, default switch and delay |
| 2026-10-29 | Add ability sound                          |
| 2026-10-29 | Add bank units and contextual event names  |
| 2026-10-29 | Add the waveform column                    |
| 2026-10-29 | Add the waveform                           |
| 2026-10-29 | Add VFX sound                              |
| 2026-10-29 | Add viewport sound                         |
| 2026-10-29 | Add the event tree                         |

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
- A bank and a package list their bank units, as "Bank units" describes.

The head's kebab contains Find references, which opens the References document on the game path
that the bank units name the file by.

A bank with a hierarchy has two tabs, Media and Events. Events contains the event tree, and it is
the tab that opens in a bank without media.

## Bank units

The Bank units section lists every `BankUnit` that names the opened file in its `bankPath`, from
the bins of the open project and then from the audio index of the game. An event bank, a media
bank and a package each list it, so any file of a unit reaches the others.

A unit that several bins declare with the same name, the same paths and the same voice-over flag
is one row. A base voice-over bank that every skin bin of a champion declares is one row with a
list of bins, not one row per bin.

A row contains:

- The unit's `name`, and a Voice-over badge if `voiceOver` is set.
- Each `bankPath` file as a badge with its kind: event bank, media bank or package. The opened
  file is marked. A found file opens its document on a press. A file that no layer and no game
  archive contains is greyed and has no press.
- A disclosure with the bins that declare the unit. A press on a bin opens the object and
  reveals the `BankUnit` row.

The declarations are ranked: the project's bins first, then the skin bin whose number matches
the `Skins/SkinNN` segment of the opened path (`Base` is skin 0), then `skins/root.bin`, then the
rest in the order of the index. A declaration whose holder links a `ContextualActionData` object
also offers Open contextual actions, which opens that object.

`SpellDataResource.AudioBankPaths` and `ClientStateAudioDataProperties.BankPaths` name banks
without a unit, a name or events. The bins that list the opened file in one of them follow the
units, each a press that opens the list row.

The section reads before the audio index of the game is ready. It lists the project's units, says
that the index builds, and fills in when the build finishes. A loose file outside a project names
itself by its file name, so no unit names it. The links need a project, which owns the editor
tabs. Outside one, the section is text.

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
| Waveform  | The shape of the media, per "Waveform column"                             |

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

The player plays every media at a volume of 0.2. The webview applies none of the game mixer gain,
so shipped media at full volume is much louder than in a match. The player is a channel of the
app's one Web Audio player, which the event tree and every viewport share.

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

The context menu of a row contains Save as `.ogg` (`.wav` for PCM), Save as `.wem` and Copy source
ID. A save asks for its destination in the save dialog and writes through a temporary file.
`.ogg` and `.wav` write the decoded media, and `.wem` writes the bytes as the file contains them.

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
3. The contextual actions of the skins whose units name the bank. A skin's
   `mContextualActionData` links a `ContextualActionData` object, whose rules name voice-over
   events by a short name such as `cast3D`. For each tag of the skin's `tagEventList`, the name
   `Play_vo_<tag>_<name>` is composed, and `Play_vo_<tag>_<spell>_<name>` for a rule with a
   `ContextualConditionSpellName`, where `<spell>` is the last segment of the spell path. A
   composition whose ID is an event of the bank names that event.

The composition is observed in shipped data and not read from the client, so an event that a
rule plays carries the rule as an inferred context: a dashed badge with the situation, the
`mRuleName` and the audience (self, ally, enemy or spectator). If two tags compose two events of
the bank for one rule, both keep the rule, and the badge's tooltip says that the match is
ambiguous. `mRuleName` is not in the meta class, and the shipped rules carry it.

The audio index is built on a background thread the first time an event bank opens, and again
when the game build changes. It is cached beside the game index cache. While it builds, the tab
shows an info notice and lists the events with the names of the project alone. The list updates
when the build finishes. The index uses `events` as a name source only, never as a list of what
a bank contains, because the skin loader reads neither `BankUnit.name` nor `BankUnit.events`.

### Bank set

The media of an event live in other files. The bank set of an opened event bank is the bank
first, then every file of every bank unit that names its path, from the project's bins and
then from the audio index. A voice-over unit reads its paths under the client's locale.

If no bank unit names the bank, the set falls back to the sibling convention: the same
directory, the stem with `_events` replaced by `_audio`, as a `.bnk` and a `.wpk`. An info
notice says so. A bank whose stem has no `_events` suffix is read alone. In a set that bank
units name, a file that no layer and no game archive contains is listed in a warning notice.

A project layer's copy of a file comes before the game's, as the client reads them.

### Rows

| Row       | Shows                                                                        |
| --------- | ---------------------------------------------------------------------------- |
| Event     | The name, the action count and the status                                    |
| Action    | The class name, such as Play, Stop or SetVolume, the ID of its target, delay |
| Container | The kind and the ID, and the rule of what plays                              |
| Sound     | The ID and the file name of the file that contains the media                 |
| Other     | The object kind and the ID, marked as not playing. Music objects say "music" |
| Missing   | The ID of an object that no bank of the set contains                         |
| Field     | One field of the action or the node above it: a name and the value           |
| Children  | The children of the container above it, and their count                      |

An action class outside the table of Wwise classes shows as `0x` and four hex digits. An action
with a delay shows it in milliseconds. An event's tree is read when the event expands or plays, so
a bank of hundreds of events lists at once.

An action and a node are each one line. An expanded action lists its fields, then the object that
it plays. An expanded sound or container lists its fields, and a container then lists a
`children` row, which expands into its children. A field row reads like a property row of a bin,
per "The property row" in docs/ux/BIN_EDITOR.md: the name and the value, with the values of all
field rows in one column. A field row shows no kind of the value in the bank. The value is plain
text in its authoring unit, and an ID shows the name of the object or the media that it points at.

```
v > Play_sfx_Rumble_Death3D_cast              1 action
    v > Play  #500572873
          target            Random #500572873
          delay             0 s
        v > Random #500572873  one child plays, picked by weight
              volume      (o)  -3.0 dB
              pitch       (o)  +120 cents
              lpf         (o)  0 %
              children         1 child
            v > Sound #546979792  Rumble_Base_SFX_audio.wem
                  source       Rumble_Base_SFX_audio.wem  #4047148852
                  loopCount    Plays once
                  weight  (o)  50  100% of picks
```

| Status         | Tone    | When                                                        |
| -------------- | ------- | ----------------------------------------------------------- |
| Media missing  | Warning | A sound names a media that no file of the set contains      |
| Object missing | Warning | An action or a target names an object that no bank contains |
| Decode error   | Error   | An object does not decode. The row gives its ID and error   |

### What plays

A press on a row plays what one press of the game plays from that row:

| Node               | Plays                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| Random container   | One playlist item, picked by its weight on every press                     |
| Sequence container | The first item of its playlist                                             |
| Switch container   | The nodes of its default switch, or the first child if the switch has none |
| Layer container    | Every child at once                                                        |
| Actor-mixer        | Every child at once                                                        |
| Sound              | Its media                                                                  |

A random container that does not use weights picks every playlist item with the same chance. A
child outside the playlist does not play. A switch row says whether the default switch plays or
the first child. The press does not read a switch or a state that the game sets, and it does not
avoid a repeat or shuffle the playlist.

An event plays the picks of all its Play actions, and each pick starts after the `DelayTime` of
its action. The random range of a delay is not read. A press on an action or a node row starts at
once. A seek on the waveform moves every voice of the press to the playhead without its delay. A
press stops what the press before it started, so a second press on a random container plays
another variation. A sound whose media is missing and an object that does not play give nothing
to play and show no play button. Every media plays at the volume of the media table's player.

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

An event's context menu contains Copy event name, which copies `#` and the ID for an unnamed
event. Inside a project it also contains Show contextual rule, which opens the `ContextualActionData`
object at the first rule that plays the event, and Show in bank unit, which opens the bin at the
`events[i]` row of the first ranked unit that lists the event's name. An action's and an object's menu contains Copy object ID. A sound whose media is found also
contains Show media, which opens the document of the file that contains the media, switches it to the
Media tab and selects the row of the source ID.

## Editing

Inside a project, an event bank opens as a document that takes edits. The tab takes the unsaved
dot, `Ctrl+S` saves it, and `Ctrl+Z`, `Ctrl+Shift+Z` and `Ctrl+Y` step its history. The game
sandbox takes no edit. Every read of the tree applies the unsaved edits, so a press plays the
edited bank before a save.

Each edit decodes one object, changes it and encodes it at the bank's version, so every other
object keeps its bytes. Only the objects of the opened bank take edits. An object of another bank
of the set is edited in the document of that bank.

### What an edit changes

A field row shows its value as plain text, and no box is drawn at rest. A double click on the
row, F2 or Enter opens the value entry, prefilled with the value and selected. A field with a knob
opens the entry as a popup under the knob, and any other field opens it in place of the text.
Enter and a press outside commit the entry, and Escape cancels it. An entry left with the text it
opened with writes nothing. An action of another class than Play and an object outside the opened
bank list their fields read-only, and their entry does not open.

| Row                           | Field rows and keys                                                        |
| ----------------------------- | -------------------------------------------------------------------------- |
| Play action                   | `target`, the object ID it plays. `delay`                                  |
| Sound                         | `source`, the source ID of its media, and the properties of the next table |
| Container                     | The properties of the next table but `loopCount`, then `children`          |
| Child of a random container   | `weight`, and its place in the playlist                                    |
| Random container, actor-mixer | Add child, on the `children` row                                           |
| Child of any container        | Remove from container                                                      |

| Field        | Wwise property                        | Shows                                           | Default |
| ------------ | ------------------------------------- | ----------------------------------------------- | ------- |
| `target`     | the object ID of a Play               | The title of the object, such as `Random #7`    |         |
| `source`     | the source ID of a sound              | The file name of the media, then `#` and the ID |         |
| `volume`     | `Volume`                              | dB, signed, one decimal                         | 0       |
| `makeUpGain` | `MakeUpGain`                          | dB, signed, one decimal                         | 0       |
| `pitch`      | `Pitch`                               | cents, signed, whole                            | 0       |
| `lpf`        | `LPF`                                 | %, 0 to 100                                     | 0       |
| `hpf`        | `HPF`                                 | %, 0 to 100                                     | 0       |
| `delay`      | `InitialDelay`, `DelayTime` of a Play | s                                               | 0       |
| `loopCount`  | `Loop` of a sound                     | The plays, or "Loops forever" for 0             | 1       |
| `weight`     | the playlist item's weight            | Wwise's weight, stored as 1000 times it         | 50      |

A weight in a random container whose pick reads the weights also shows its share of the total
weight of the playlist, as a percentage of picks. A target or a source that the tree does not
resolve shows `#` and the ID.

The entry opens with the exact value, without the rounding of the row. A typed value may end in
its unit, in any case: `dB`, `cents` or `ct`, `%`, and `s` or `ms` for a delay. A target or a
source takes a decimal ID, with or without a leading `#`. A value at its default removes the
property from the object, as Wwise writes it. An empty entry sets the default. Other properties of
an object are not listed.

### Knob

A bounded field draws a knob before its value text. A double click on the knob, or F2 or Enter
while the knob has focus, opens the value entry under it.

| Field                  | Knob span           | Source                                          |
| ---------------------- | ------------------- | ----------------------------------------------- |
| `volume`, `makeUpGain` | -96 to 24 dB        | The manager's own. `ltk_wwise` gives no range   |
| `pitch`                | -2400 to 2400 cents | `docs/design/wwise-audio.md` of `ltk_wwise`     |
| `lpf`, `hpf`           | 0 to 100            | The property table of `ltk_wwise`               |
| `weight`               | 0 to 100            | The manager's own. Neither source gives a range |

A vertical drag turns the knob, the full span over 200 pixels, and the wheel steps it while the
pointer is over it. Up and Right step up, Down and Left step down, Page Up and Page Down move a
tenth of the span, and Home and End go to its ends. Shift moves a tenth as far. Alt+click, and
Delete or Backspace while the knob has focus, reset the field to 0. The value arc starts at 0, so
a cut and a boost read apart.

A drag is one edit, sent when the button is released. A run of keys or wheel steps is one edit,
sent 400 ms after the last step or when the knob loses focus. A reset and a committed entry are
one edit each. Each edit is one undo step. A typed value outside the span is kept, and the knob
points at the nearer end. Escape on the knob returns focus to the tree.

A weight edit also makes the container's random pick read the weights, which bit 0 of its flags
turns on. The other items then pick by the weights they carry.

A random container draws its children in playlist order, which is the order a sequence plays.
Moving a child moves its playlist item. An added child joins the children in ID order, as shipped
banks write them, and the end of the playlist at weight 50. A switch container and a layer
container take no added or moved child, because their groups name the children again. A removed
child leaves every list of the container that names it.

### Refusals

An edit is refused with the reason in a toast, and the bank is unchanged:

- A bank that is not version 145 shows an info notice that points at the Convert repair of its
  Problems entry, and takes no edit
- A new Play target or child that no bank of the set holds as a sound or a container
- A child the container holds already, or the container itself
- A source ID that no media index of the set holds for a sound in a bank, or that no package holds
  for a streamed sound. A prefetched sound takes no source edit, because its media is in two files
- A value outside the range of its property

A refused entry opens again with the typed text, marked, until Escape drops it. An entry whose
text holds no number stays open and marked on Enter, and a press outside drops it.

### Keyboard

| Key              | Action                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| F2               | Open the value entry of a field row, or the child picker of `children`  |
| Enter            | The same as F2 on a field row or a `children` row. Play any other row   |
| Enter, Escape    | Commit or cancel the open entry, and return focus to the tree           |
| Tab              | Move to the next knob                                                   |
| Delete           | Remove the selected child from its container                            |
| Alt+Up, Alt+Down | Move the selected child of a random container in its playlist           |
| Ctrl+Enter       | Open the child picker of a random container, an actor-mixer or its list |

The child picker is a field in the container's `children` row, and opening it expands the
container and the row. A double click on the count of the `children` row also opens it. It lists the sounds and containers of the bank set by kind and ID,
filtered as the text is typed. Enter adds the highlighted one and Escape closes the picker. A
child row and the `children` row also show their action on hover: Remove from container, and Add
child.

### Marks and saving

A row whose object differs from the bank as it was opened carries an accent dot. Undoing every
edit of an object removes its dot.

The first edit of a game bank writes the game's bytes into the project, in the layer of the
sandbox or else the base layer, at the chunk's path below its archive folder. The edit is refused
if the project already has a file there. A save writes the layer file through a temporary file,
and the tab then opens that layer file. A save refuses if the file changed on disk since it was
opened or last saved, and the edits stay in the document until the bank is reopened.

## Waveform

The media table and the event tree each have a waveform strip under them: a play and pause
button, the waveform of one media with its playhead, and the time as `m:ss.cc` of the playhead
and of the media.

| Panel  | The strip shows                                                                       |
| ------ | ------------------------------------------------------------------------------------- |
| Media  | The row that plays, else the selected row if it plays                                 |
| Events | The first media of the press that plays, else the selected sound, else the last press |

The strip plays through the channel of its panel, at the panel's volume, and adds no player
of the strip. The media decodes once, through the cache that playback reads, and the strip draws its
peaks. A selection decodes after it stays unchanged for 150 ms, so a run of arrow keys decodes one media.

- A click on the waveform moves the playhead there. A drag moves it where the drag ends.
- A seek on a media that plays or is paused keeps that state. A seek on a media that does not play
  plays it from the playhead.
- An event plays all of its media at once, and a seek moves each of them to the playhead. A media
  shorter than the playhead ends.
- Pause stops every voice of the panel in place, and Play resumes them. Play on a media that does not play
  plays it from the start. A row of the table or the tree that is paused shows as playing, and a
  press on it stops it.
- The playhead returns to the start when the media ends or stops.

The waveform is one tab stop, a slider of the playhead.

| Key        | Action                                          |
| ---------- | ----------------------------------------------- |
| Right, Up  | Move the playhead on a twentieth of the media   |
| Left, Down | Move the playhead back a twentieth of the media |
| Page Up    | Move the playhead on a quarter of the media     |
| Page Down  | Move the playhead back a quarter of the media   |
| Home, End  | Move the playhead to the start or the end       |
| Space      | Play or pause                                   |

### Waveform column

Each row of the media table and of the event tree ends in a small waveform of its media. A row
of the event tree draws the first media that a press on it plays, with the first playlist item
that has a weight in each random container. An event row reads its event first. A row that plays
no media draws none.

- A row decodes when it scrolls into view, three rows at a time. A row that leaves the view
  before its turn does not decode.
- The column decodes outside the cache that playback reads, so it evicts nothing that plays.
- The bars are scaled to the loudest bar of the media, so a quiet media still shows its shape.
- The row that plays draws its waveform in the accent.

## Viewport sound

The skin viewport plays the `SoundEventData` events of the clip it plays. Sound is off by
default. The speaker switch in the viewport's toolbar turns it on, and its caret opens the
volume, which defaults to 0.2. Both are remembered, and the Project editor card of the settings
lists them in its Viewport group.

The playback approximates the game's mix. It applies no bus, no RTPC, no attenuation and no 3D
position, and the switch's tooltip says so. The tooltip also counts the event names of the view
that resolve to no event or to no media, so a missing sound reads apart from a muted one.

### Firing

An event fires when forward playback crosses its start frame.

| Field                         | Effect                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `mIsLoop` true                | The event fires on every loop of the clip                                       |
| `mIsLoop` false               | The event fires on the first pass alone                                         |
| `mIsKillEvent` true           | The sound stops when the clip loops or stops, and restarts when the event fires |
| `mIsKillEvent` false          | The sound plays to its end                                                      |
| `mSkipIfPastEndFrame` true    | A frame that lands past the end frame when it crosses the start fires nothing   |
| `mEndFrame`                   | Does not stop the sound                                                         |
| `ConditionClipTransitionType` | Read into the clip model. The viewport enters no condition clip past a start    |

A scrub, a restart and a clip switch fire nothing and stop every kill sound. A seek that the
viewport makes without a press, such as the fold of the clock when an effect model loads, changes
nothing. Pause stops every sound in place and play resumes them. The playback speed does not change the
pitch or the rate of a sound. Sound stops when the viewport's tab is hidden or closed.

An edit of a clip event takes effect on the next pass.

### Resolution

The viewport asks once per view for every event name its cues contain. The bank set is every
`BankUnit` of the open document, then the bank units that the project's bins and the game's audio
index register a missing name in. A document without a `BankUnit`, such as a VFX bin that a skin links, takes the units of the skin bins that the paths of its objects name. The units of the document come first, and a project layer's copy
of a file comes before the game's, so a replacement media plays. A voice-over unit reads its paths
under the client's locale. A layer file write asks again.

An event plays what one press of the event tree plays, per "What plays" above, with a random
container picked again on every firing.

### Voices

A viewport plays at most 32 sounds at once. A new sound past the cap stops the oldest one.

## VFX sound

The VFX preview plays the sounds of the system it runs, and the skin viewport plays the sounds of
each system that a clip's particle event spawns. Both follow the speaker switch, the volume and
the resolution of "Viewport sound". The grid previews of the objects browser play no sound.

A system names its sounds in `soundOnCreateDefault`, `soundPersistentDefault`,
`voiceOverOnCreateDefault` and `voiceOverPersistentDefault`. An emitter names its sounds in `Audio`,
a `VfxEmitterAudio` with `SoundOnCreate` and `SoundPersistent`. An empty name is no sound.

### Firing

A sound fires when forward playback reaches the moment it belongs to.

| Moment                              | Effect                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| The system starts                   | Every sound of the run stops. The system's on-create and persistent play      |
| The rig stops the system            | Every persistent sound of the system and of its emitters stops                |
| An emitter emits for the first time | The emitter's `SoundOnCreate` and `SoundPersistent` play                      |
| An emitter's emission ends          | Its `SoundPersistent` stops if the system's flags set `soundsEndOnEmitterEnd` |
| A child system is spawned           | The child system's on-create sounds play                                      |

An on-create sound plays its media once. A persistent sound loops its media until it stops. An
emitter that the `ChanceToNotExist` roll removes plays nothing. A restart, a replay of a looping
rig and the restart of a run that ended each start the system again, so the on-create sounds play
on every run.

A seek, a scrub and a step fire nothing and stop every sound of the run. An edit of a sound field
takes effect on the next firing.

In the skin viewport, a clip effect's sounds play when forward playback crosses its particle
event and stop when the pass leaves the event or a scrub moves the run. Pause stops them in place with the
sounds of the clip.

The bank set is the one of "Resolution". A system opened from a skin bin resolves through that
skin's bank units. A system in a bin without bank units resolves through the audio index.

## Ability sound

The ability preview plays the `SoundEventData` events of the cast clip and the sounds of each
step's effect: cast, projectile and impact. It follows the speaker switch, the volume and the
resolution of "Viewport sound". The switch sits in the preview's controls row.

The bank set adds one unit to the skin's bank units: the spell's `AudioBankPaths`. A recipe made
from a spell keeps those paths, and a recipe made by hand has none. A path with an `en_US` segment
reads under the client's locale first. `SpellEventToAudioEventSuffix` is not read.

### Firing

| Source              | Effect                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| A cast clip event   | Fires when forward playback crosses its start frame, per "Viewport sound" |
| A kill event        | The sound stops where the cast clip ends                                  |
| A step's effect     | Fires on the run of the step, per "VFX sound", from the step's start      |
| The end of the cast | Every sound plays to its end                                              |

The cast clip plays once, so `mIsLoop` does not fire an event a second time. A seek, a scrub, Cast
from the end and Replay fire nothing and stop every sound, and the next forward frame fires from
the time it starts at. Pause stops every sound in place and play resumes them.
