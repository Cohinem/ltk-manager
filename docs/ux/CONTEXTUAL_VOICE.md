# Contextual voice

The contextual voice of a unit is a `ContextualActionData` object: its situations, the rules of
each situation, and the short name that each rule plays for each audience. This document covers
the Voice lines view of that object and the Played by column of an event bank, which link the
rules to the events they play.

A class view, its sections and its sandbox are in docs/ux/BIN_EDITOR.md, under "Class views" and
"Editing". The event bank, its Voices view and its inspector are in docs/ux/AUDIO.md. The copy for a skin is ADR-0073.

## Changes

| Date       | Change                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| 2026-10-30 | Add the Voice lines view, the Played by column and the copy for a skin |

Each edit of this document adds a row at the top. The table keeps the last ten rows.

## Voice lines

A `ContextualActionData` object opens in the Voice lines class view, beside Properties. The skin
layout lists `mContextualActionData` in its own Voice lines section, and its link opens the
object. The view is one section of a stack layout that takes edits in place.

```
[Skin 0 v]  tags Lux  Shared cooldown 15 s  (Inferred)               [2 unresolved] [Inspector]
[Filter........]  Target [Any v]  Spell [Any v]  [Self v]
v (>) Spell cast  SpellCast  8 rules  first valid
|-- (>) Q        spell LuxLightBinding   (o) 50 %  -10  all    cast3D    Play_vo_Lux_LuxLightBinding_cast3D
|-- (>) R        spell LuxR                        100  all    cast3D    Play_vo_Lux_LuxR_cast3D
|-- + Add rule
v (>) First encounter  EnemyEncounter  15 rules  first valid  cooldown 15 s
|-- (>) Quinn    other is Quinn, first                  Self   FirstEncounter3DQuinn   ! No event in lux_base_vo_events.bnk
```

### Header

- The skin picker lists the skins whose `mContextualActionData` links the object, from the
  project's bins and the game's audio index. The names resolve through the tags of the chosen
  skin, against the events of that skin's voice-over banks. The view opens on the skin that the
  reader chose last for the object, else the first skin of the project, else skin 0, else the first
  skin. The choice is kept per object and per user.
- The tags of the chosen skin, and the shared cooldown `mCooldown`, which F2, Enter or a double
  click opens for an entry.
- One Inferred chip. The event names are composed, as "Names" in docs/ux/AUDIO.md says, so no line
  repeats the chip.
- The count of unresolved rules. A press keeps only those rules.
- The filter keeps the rules whose name, situation, short names, events or conditions contain its
  text.
- The trigger pickers set what a situation's play simulates, per "Play situation".

### Shared object

When two or more skins link the object, a notice above the list states the count, such as "Used by
96 skins. An edit changes the voice lines of each." It stays until the first edit lands or the
reader dismisses it. Editing the shared object stays possible.

Copy for this skin copies the object into the chosen skin's bin as `<path>_SkinNN`, sets the copy's
`mObjectPath`, links the skin's `mContextualActionData` to the copy, and opens the copy's tab in the
Voice lines view. The three changes are one edit of the skin bin, so one undo in that bin reverts
them. ADR-0073.

### Situations

A situation is a group header with the lanes of the Voices view: the caret, the play button, the
situation's word, its key where the word differs, the rule count, first valid or random, and the
situation cooldown when it is not 0. An unnamed key shows its hash. The view writes a word for the
named keys a modder meets most, such as Spell cast for `SpellCast` and Attack order for the four
`Attack*2D` keys, and the key itself for the rest.

### Rule lines

Each rule is one line, and every column has one width, so the lines of every situation align.

| Cell     | Shows                                                                        | Edit                      |
| -------- | ---------------------------------------------------------------------------- | ------------------------- |
| (play)   | Plays the line for the audience of the trigger, else the first named line    |                           |
| Rule     | `mRuleName`, or `#` and the rule's index muted                               | F2 on a named rule        |
| When     | The conditions in words, joined by `·`, but the chance. `One passes` before  | In the inspector          |
| Chance   | The knob and the percent of the rule's one `ContextualConditionChanceToPlay` | The knob, F2              |
| Priority | `mPriority`, empty while unset                                               | F2, an empty entry clears |
| Audience | `all` for the four audiences, else each named audience                       |                           |
| Short    | The short name of the drawn line, `+N` when other audiences name others      | F2                        |
| Event    | The event it resolves to, or a warning that names the skin's event bank      | Create event...           |

A rule without an audio action draws its animation or its chained situation in the Event column,
muted. A condition class that the view has no words for reads as its short class name and its
fields, such as `GameTimer(mGameTimeInMinutes = 20)`.

### Play situation

The play button of a header simulates one trigger. The conditions that the header sets are
evaluated: the target champion against `ContextualConditionCharacterName` of the other unit, and
the spell against `ContextualConditionSpellName`. Each chance is rolled once. A rule is valid when
it names a line for the trigger's audience and its conditions pass under its relationship. A
first-valid situation plays its first valid rule, and a random one draws a valid rule by
`ChanceWeight`, where a weight of 0 is drawn only when every weight is 0. Any other condition
passes. A trigger that no rule plays shows a toast.

Play all, in the header's menu, plays every resolved line of the situation in list order, one after
another. Playback reads each event's tree from its bank and plays one press of it.

### Inspector

The Inspector button shows the pane of the Voices view, with the same remembered state.

| Selected      | The pane lists                                                               |
| ------------- | ---------------------------------------------------------------------------- |
| Situation     | Situation: Choose random rule, Situation cooldown                            |
| Rule          | Rule, Cooldown, Conditions, Plays, and Other actions where the rule has them |
| Several rules | The fields of Rule and Cooldown, with the values of the first                |

- A row names its field in words. A hover on the name opens the field card of the field's class,
  with the meta wiki's prose.
- A condition is a block of its fields under its class, whose card opens on hover. A child
  condition draws as a block under its parent. A boolean takes a switch, a number and a text take
  an entry, and a hash or a list reads as text. Delete condition removes it, and Add condition
  lists the classes that `mConditions` takes.
- Plays lists each audience's short name with the event it resolves to and its play button, then
  Max plays, Wait for announcer and Wait timeout.
- With several rules picked, an edit sets the field of each pick in one step.

### Edits

Every edit is one `bin_edit` of the object's document (ADR-0051), so the document's undo, marks
and save apply. An edit of several picked rules is one `EditProperty` of `mSituations`, so it is one
undo step. A field the rule does not write is added at its default in the same step, and a field of
a null `CooldownModifications` or `mAudioAction` gives the pointer its class first.

- Add rule pastes a rule named New rule with an empty owner name and `IgnoreTimer` set, then opens
  the entry of its short name.
- Ctrl+D copies each picked rule after itself, and Delete removes the picked rules.
- Alt+Up and Alt+Down move the selected rule, because list order decides the first valid rule.

### Keyboard

The list is one tab stop. Focus selects the first line if no line is selected.

| Key                | Action                                                    |
| ------------------ | --------------------------------------------------------- |
| Up, Down           | Move the selection one line                               |
| Page Up, Page Down | Move the selection ten lines                              |
| Left, Right        | Move between the cells of a rule line, or fold a header   |
| Enter, F2          | Open the entry of the cell, or add a rule on the add line |
| Space              | Play the line, or simulate the header's trigger           |
| Shift+Up, Down     | Pick the range to the next line                           |
| Ctrl+A             | Pick every rule                                           |
| Ctrl+Enter         | Add a rule to the situation                               |
| Ctrl+D             | Duplicate the picked rules                                |
| Delete             | Delete the picked rules                                   |
| Alt+Up, Alt+Down   | Move the selected rule                                    |
| Ctrl+C             | Copy the short name of the line                           |
| Escape             | Stop what plays, or keep only the selected line picked    |

Every menu item shows its icon, and its key where it has one: Play, Play all, Add rule, Duplicate,
Move up, Move down, Delete, Create event..., Show in bank, Show in tree and Copy short name.

## Played by

An event row of an event bank has a Played by column at one x, before the waveform, in place of the
context badge.

| Cell              | When                                                            |
| ----------------- | --------------------------------------------------------------- |
| `Spell cast 50 %` | One rule plays the event, and the rule has one chance condition |
| `Attack order x3` | Three distinct rules play the event                             |
| `Listed only`     | Only the `events` list of a bank unit names the event, muted    |
| `Not played`      | No bin of the index names the event, muted                      |

- Two contexts are one rule when they share the situation key and the rule name, which collapses the
  four audiences of a rule and the copies of a rule in other skins' objects.
- A hover card lists every rule with its chance and audiences, and states that the match is
  inferred, or ambiguous where two tags name two events of the bank.
- Inside a project a press opens the rule's voice line, and with several rules the press opens a
  menu of them. Show contextual rule in the event's menu opens the same view.

### Linking the views

| From                     | Action          | Opens                                                                |
| ------------------------ | --------------- | -------------------------------------------------------------------- |
| Played by cell           | Press           | The object's tab in the Voice lines view, the rule selected          |
| Rule line                | Show in bank    | The event's bank, Voices view, the event selected and scrolled to    |
| Rule line with a warning | Create event... | The skin's event bank, with the composed name in its new event entry |

Create event... prefills the name, and Enter creates the event in the bank document, which updates
the `events` list of the bank units as one step of the bank's history (ADR-0072).
