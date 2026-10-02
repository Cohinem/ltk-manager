# Mod library

## Changes

| Date       | Change                                                     |
| ---------- | ---------------------------------------------------------- |
| 2026-10-02 | Importing a mod the library holds                          |
| 2026-10-02 | Opening a mod file from Explorer installs it               |
| 2026-09-30 | A library edit reaches a running patcher between games     |
| 2026-09-12 | The documents panel is a drawer over the grid, not a pane  |
| 2026-09-12 | The licenses tab follows the open mod, like the other two  |
| 2026-09-12 | A right click reads a card and no longer picks it          |
| 2026-09-12 | The details tab, which folds the three mod dialogs in      |
| 2026-09-12 | The documents panel, its two tabs and what it persists     |
| 2026-09-07 | The library selects by gesture, and select mode is retired |
| 2026-09-07 | First draft of this document                               |

Each edit of this document adds a row at the top. The table keeps the last ten rows.

The mod library is the LTK Manager screen for the mods a user installed. It holds a grid of
cards, the folders and profiles that organise them, and the Play button that launches the game
with the enabled set. What the [workshop](WORKSHOP.md) describes is the authoring side, and the
two meet only where a workshop test layers its projects over this screen's active profile.

The core design idea is that **a card is a switch, and a modifier is what picks it instead.**
A user comes to the library to turn mods on and off, so a bare press is that and nothing else.
Everything a set of mods can be asked to do at once hangs off a selection, which is entered by
ctrl-click or shift-click rather than by a mode to switch into first.

## Goals

- A bare press means the one thing a user came to the library for
- Picking a set costs no mode, no button and no round trip through the toolbar
- A mouse-only reader finds the checkbox without knowing the modifier
- Every command a selection carries is on the bar, which is up whenever a selection is
- Nothing acts on a mod the reader cannot see

## Feature status

The status words are the ones [Problems](PROJECT_PROBLEMS.md#feature-status) defines.

| Feature                | Status    | Note                                                          |
| ---------------------- | --------- | ------------------------------------------------------------- |
| Selection by gesture   | Available | Ctrl-click picks, shift-click ranges, no mode to enter        |
| The checkbox           | Available | On the hovered card, and on every card under a selection      |
| The floating bar       | Available | Five commands, while the selection is non-empty               |
| Select all             | Available | The toolbar button, toggling all visible against clear        |
| All visible Enable     | Available | On the button's caret, beside Disable                         |
| Enable and disable     | Available | A bare press on a card, and a switch on a list row            |
| Grid and list          | Available | A segmented control, with the view options on its action slot |
| Folders                | Available | One level, drag to fill, and a drilldown route per folder     |
| Profiles               | Available | Named enabled-sets, switched from the toolbar                 |
| Filters and sort       | Available | A popover off the search box, and chips under the toolbar     |
| Search                 | Available | `Ctrl+F`. Flattens the folders while it has a query           |
| Manual reorder         | Available | Drag within a folder. Off under a search, a filter or a pick  |
| Import                 | Available | `Ctrl+I`, the toolbar button, a drop, or a file from Explorer |
| Layers                 | Available | A popover on a multi-layer card                               |
| Storage                | Available | Project or archive, on the card's menu. ADR-0008              |
| Mod health             | Available | Its own document, [MOD_HEALTH.md](MOD_HEALTH.md)              |
| The documents panel    | Available | A drawer over the grid's right edge, closed until asked for   |
| The details tab        | Available | One mod's cover, facts, layers, WAD footprint and edit form   |
| The readme tab         | Available | One mod's readme, opened from that card's menu                |
| The licenses tab       | Available | One mod's license name, its link, and the text it ships       |
| Skinhack blocklist     | Available | Retiring into a Problems rule over the project manifest       |
| Marquee selection      | Proposed  | Competes with drag-to-reorder for the same press              |
| Folder moves on a pick | Proposed  | A selection carries no destination today                      |

## How a mod is picked

**A bare press is the switch.** Enabling and disabling is what the library is for, and it is the
one action a card offers without a modifier. A grid card has no switch of its own, so the card is
the control. A list row carries a real switch on its trailing edge, and pressing anywhere else on
the row does the same thing.

**Ctrl-click adds and removes.** The card joins the selection, or leaves it, and the mod stays
switched exactly as it was. `Cmd` does the same, so a mac keyboard is not a second gesture to
learn.

**Shift-click ranges from the anchor.** The anchor is the last card picked without shift, and the
range covers every card between the two in the order the grid draws them. With no anchor to range
from, the shift-click picks the one card under the pointer.

**A picked mod that cannot be switched on is still picked.** A blocked mod refuses a bare press,
and uninstalling it is the reason to reach for it in the first place, so the modifier gestures
stay open where the switch is closed.

**The checkbox is the way in without the modifier.** It draws on the card under the pointer, and
on every card while the selection is non-empty. A press on it adds or removes that one card. The
grid draws it in the card's top-left corner, over the art, and the list draws it at the head of
the row. Neither reflows as a pointer crosses it - a row holds its place at all times, and a card
draws it over the corner with the marks sliding aside.

**There is no marquee.** A drag over the grid is already how a mod is reordered, and one press
cannot mean both. Ctrl-click and shift-click reach every set a rubber band would.

## What a selection carries

Five commands, and the same five wherever they are drawn:

| Command         | What it does                                                  |
| --------------- | ------------------------------------------------------------- |
| Enable N        | Switches on every picked mod that is off and not blocked      |
| Disable N       | Switches off every picked mod that is on                      |
| Check health N  | Runs the [health](MOD_HEALTH.md) rules over the picks         |
| Uninstall N     | Deletes them from disk, behind a confirmation that names them |
| Clear selection | Drops the picks and takes the bar with them                   |

**Enable and disable leave the selection standing.** They are reversible and are pressed in
pairs, so the set a reader assembled survives the press. Check health spends it as the press
lands, because the run reports through its own progress toast and answers over the library.
Uninstall spends it when the run comes back, which is what lets the failures stay picked.

**A blocked mod is skipped by Enable.** A card refuses that press one mod at a time, and a set is
not a way around it. Disable is always offered, and Uninstall is the reason the mod is pickable
at all.

**Every command stays on while the patcher runs.** Enable, Disable and Uninstall reach the
running session as [An edit while the patcher runs](#an-edit-while-the-patcher-runs) describes.

**The bar is over the library, not in the toolbar.** It appears while the selection is non-empty
and it names its own count, with a second count for the picks a filter or a search is currently
hiding. Escape clears the selection, unless a dialog or a menu is drawn over the library, in
which case Escape belongs to what is on top.

**A failed uninstall keeps its failures picked.** The mods that were removed are gone from the
selection with the library, and the ones that refused stay, so a second press is aimed at exactly
what is left.

## What a right click opens

**A right click opens the card's own menu, whatever is picked.** The same list the kebab draws,
because which pixel was hit never changes what opens. A reader who has picked eleven mods and
right-clicks one of them is asking about that mod, not about the eleven.

**A right click reads the card and never writes the pick.** It selects nothing, deselects nothing
and collapses nothing, so the set a reader assembled survives asking a question about one of its
members. Picking is the checkbox's and the modifiers', which are the gestures that say so.

**The selection's own commands are the bar's.** The bar is up for as long as a selection is, and it
carries all five, so nothing is out of reach once the right click stops offering them.

**A right click on the library ground offers New Folder.** The ground is not a card, so it neither
reads nor changes the selection.

## The toolbar button

`Select all` picks every visible mod. Pressed again with all of them picked, or with nothing
visible to pick, it clears instead - the same toggle the [workshop](WORKSHOP.md) grid's button
makes, and `Ctrl+A` is the same press. The button reads as active while anything is picked.

**Visible is what the grid is drawing.** A search or a filter flattens the folders, so everything
matching is visible. Without one, a folder route draws that folder alone and `Select all` reaches
no further than it - a shift-click range inside a folder stops at its edges for the same reason.

Its caret holds `All visible` `Enable` and `Disable`. Those act on what the grid is showing rather
than on the selection, which is what makes them useful with nothing picked at all.

## Reorder and a selection

Manual reorder is off while anything is picked. A drag and a pick compete for the same press, and
the drag is the one that can be reached again a moment later. Reorder is off under a search and
under a filter for the same reason it always was - the order on screen is not the order stored.

## The selection leaves with the page

Navigating away from the library clears the selection. A pick carried to another screen and back
would let `Uninstall N` act on mods the reader cannot see, and a folder drilldown is the case that
makes it concrete. The selection is session state and is never written to disk.

## An edit while the patcher runs

A library edit reaches a running patcher without a restart. Switching a mod, reordering, layers,
a folder's switch, a move into a folder, an install, an update, an uninstall, a mod's storage and a
profile switch all apply to the next game.

The overlay is rebuilt between games, never under one. A game opens the overlay's files as it
starts and holds them until it closes.

- **No game open.** The patcher rebuilds the overlay a moment after the last edit, so a burst of
  edits costs one rebuild. Play shows the build the way it does at a start.
- **A game open.** The edit is saved and waits. `Applies after this game` sits beside Play until
  the game closes, and the rebuild runs then.

A game launched during the few seconds of a rebuild runs without mods, the same as a game that was
already running when the patcher started.

A repair and a profile rename still wait for the patcher to stop. A repair rewrites the archive the
rebuild reads, and a rename moves the folder the overlay is in.

## Opening a mod file

With `Open mod files with LTK Manager` on in Settings, double-clicking a `.fantome` or `.modpkg`
file in Explorer installs it. The window comes forward on the Mods page, and the install runs
exactly as a drop onto the window does: the same progress dialog for several files, and the same
toast with the result. Nothing asks first, because the reader chose a local file.

The app may be closed, running in the tray or open on another page. A file opened before the window
is ready waits for it. A first run still opens on Settings, and the file installs once the reader
reaches the library.

Explorer starts the app once per selected file. The files that arrive within 300 ms of each other
install as one import, so a multi-select reads as one action.

## Importing a mod the library holds

An import compares each archive with what the library already holds, and does one of three things.

| The archive is                          | The import                                            |
| --------------------------------------- | ----------------------------------------------------- |
| Byte for byte one the library holds     | Installs nothing and names the mod it already is      |
| A newer version of a mod in the library | Updates that mod in place, as `Update from file` does |
| Anything else                           | Installs it as a new mod                              |

The file name does not matter, so a renamed copy of the same archive is still the same mod.

**A newer version is the same mod at a higher version.** The same mod has the same project name and
the same authors, ignoring case. A higher version is a greater semver version, and an archive whose
version does not parse is never one. The updated mod keeps its place, its folder and whether each
profile enables it. When the library holds several older copies, the one at the highest version is
updated. An older or equal version installs beside the mod, so downgrading stays a choice the reader
makes with `Update from file`.

How the result reaches the reader:

- One file: a toast names the mod that was updated or that the library already holds.
- Several files: the result dialog lists the updated mods and the ones already in the library apart
  from the mods it installed and the files that failed. A batch that carries one archive twice
  installs it once, and a batch that carries two versions of a new mod lists it once, at the newer
  version.
- A deep link: the dialog says the mod was updated or is already in the library.

A mod is matched to an archive it already holds by the archive it was installed or last updated
from. A mod installed before the check existed has no record of that archive, so its stored archive
stands in, and it matches only when the import left that archive unchanged.

## The documents panel

The Library's right edge holds a panel with three tabs: **Details**, which answers what one
installed mod is, **Readme**, which renders that mod's own readme, and **Licenses**, which names
what that mod is licensed under. All three answer for the one mod the panel holds. It is closed
until a reader opens it, and it opens over the grid rather than pushing the cards aside.

**A card's menu aims the panel, and the toolbar only shows or hides it.** The `Details` item lands
on Details and the `Readme` item lands on Readme, so the tab follows the intent of what opened it.
The toolbar's Documents toggle names no mod of its own, so it reopens on the mod and the tab the
panel was last left on.

There is no gesture on the card itself. A bare press is the switch, so a double-press would flip
`enabled` twice on the way to a readme, and the selection is a set with no notion of one readable
pick.

**The panel names what it holds in its own header.** A reader who opened a mod, toggled six
switches and came back still knows what they are reading. The name is not on the tab, where the
strip would shift under the pointer as one mod's name gave way to another's.

**The Readme item is always offered.** Whether a mod has a readme is not known until its archive
opens, so an item that hid without one would cost either a flag persisted for every installed mod
or an archive opened per card. A mod with no readme shows the panel's own empty state.

**An absent readme and an unreadable archive are two answers.** The second says the mod's archive
is not answering, which is a mod that may not work at all, and reporting it as a mod whose author
wrote nothing is a silent lie about something the reader has installed. The same holds for a
license.

**A readme renders as GitHub Flavoured Markdown, with a stranger's file in mind.** Raw HTML and
inline scripts are not rendered, an external link opens in the system browser, and no image
resolves - a mod directory is not a project, so a relative path has nothing to point at and the
image degrades to its alt text. A readme holding one heading renders as one heading: any
threshold is wrong for somebody, and an author who wrote only a title still chose to write a
file.

**Uninstalling the open mod clears the panel rather than closing it.** The panel stays at its
width and says the mod is gone, so there is no stale content and no layout change nobody asked
for. Opening another mod is the likely next act.

### The details tab

Details is one mod's whole answer: its cover, who wrote it, what it says it does, the categories
it carries, the layers it switches, the game WADs it patches, and where it sits on disk. Three
modal dialogs answered those separately before. Each covered the library, each was dismissed
before the next could open, and none of them could be read beside the grid.

**The cover runs the panel's full width.** A mod's thumbnail is the thing a reader remembers it
by, and a column's top is the one place a jump in scale costs nothing. A mod with no art keeps
the cover and falls back to the letter plate its card draws, because a panel whose first element
comes and goes per mod reads as broken rather than as adaptive.

**Editing happens in the tab rather than over it.** The Edit press swaps the read sections for the
form in place, and Save and Cancel sit in a band pinned to the panel's foot. The cover stays,
because the thumbnail picker is part of the form and the cover is where a thumbnail is.

**Nothing autosaves, and nothing is lost silently.** The panel is not modal, so a reader can press
another card, another tab or the close button with a half-typed name still in the form. Each of
those asks first, and cancelling leaves the panel where it was.

**The WAD footprint analyses on its first expand.** The dialog took that gate from its own portal,
which drew nothing at all while closed. A section in a scrolling tab has no such gate, so the fold
is the gate and a library nobody expands runs no analysis.

**Three tabs is the ceiling.** The strip fits Details, Readme and Licenses at the width the panel
asks for. A fourth needs either truncation or a scroller, so anything else a reader wants to know
about a mod becomes a section of Details rather than a tab of its own.

### The licenses tab

The tab answers for the mod the panel holds, the way Readme does. A reader asking what they are
allowed to do with a mod is asking about the mod in front of them, and a list of every other mod's
license is not the answer to that question.

It draws the name the mod declares, the link beside it where there is one, and the text the
archive carries.

Three states are told apart, because the middle one is the common one:

- a mod that declares a name and carries the file, which shows its text
- a mod that declares a name and carries **no** file, which says exactly that
- a mod that declares neither, which reads as undeclared and opens no archive at all

The name costs nothing, because it rides in the `mod.config.json` a listing already opens. The
text is on disk for neither format, so reading it mounts that mod's archive, and the answer is
held for the session and never written to disk. That is why a mod naming no license is worth
telling apart early: there is nothing to mount for it. A license renders preformatted rather than
as Markdown, because it is a hard-wrapped plain-text file and Markdown mangles it.

### The drawer, and what its width does

**The panel is a drawer over the grid, not a pane beside it.** Opening one asks a question about a
mod rather than changing the library, so the cards underneath keep the positions they were being
read in. A pane on a seam reflowed the grid twice per visit - once on the way in and once on the
way out - and a grid that reflows is a grid a reader has to find their place in again.

It arrives from the right edge it is anchored to, and it draws over the grid alone: the toolbar
above and the session bar below stay where they are, because the drawer belongs to the library
rather than to the window.

**Its left edge drags to resize, and the width outlives a restart.** The drag is bounded twice: a
280px floor, and whatever leaves 320px of library underneath. The floor wins where the two
disagree, because a window too narrow to hold both still has to hold the drawer a reader has just
opened. Arrow keys move the edge from the keyboard, 16px at a time.

Whether the drawer was open, and which mod it held, do not survive a restart: the Library opens
closed every session. A drawer that reopened itself would be covering cards over a question the
reader had forgotten asking, and persisting the mod needs a fallback for one uninstalled between
sessions.

**The panel draws on the page ground with a hairline**, which is what the toolbar and the session
bar already do, and what lets a rendered document sit on the ground without an inset frame of its
own. The tab strip therefore has no rung to mark itself with and leans on that hairline and on
type.

Escape and `Ctrl+A` stay with the library underneath. The panel is not modal, so leaving it does
not also drop the selection.

## Decided questions

| Question                                        | Answer                                                     |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Is there a mode to enter before picking?        | No. Ctrl-click and shift-click are the whole way in        |
| What does a bare click do under a selection?    | Switches that mod, as it always does                       |
| Can a blocked mod be picked?                    | Yes. Uninstalling it is the reason to                      |
| Does the checkbox draw with nothing picked?     | Yes, on the card under the pointer                         |
| Is there a marquee?                             | No. It competes with drag-to-reorder for one press         |
| What does the toolbar button do?                | Select all visible, or clear once they all are             |
| Where do Enable and Disable all visible live?   | The button's caret, and they ignore the selection          |
| Does a right click change the pick?             | No. It reads the card and leaves the selection alone       |
| What does a right click open over a pick?       | The card's own menu, the same one the kebab draws          |
| Where do a selection's own commands live?       | The floating bar, which is up whenever a selection is      |
| Is the kebab closed while a selection exists?   | No. It is the card's menu, and the card is still there     |
| Do Enable and Disable spend the selection?      | No. Check health and Uninstall do                          |
| Can a mod be reordered while a pick is up?      | No. The drag and the pick are the same press               |
| Does the selection survive leaving the library? | No. It would act on mods the reader cannot see             |
| Is the selection written to disk?               | No. It is session state                                    |
| Does the documents panel cover the cards?       | Yes. It is a drawer, so the grid never reflows around it   |
| What opens it, and on which tab?                | A card's menu on Details or Readme. The toolbar reopens it |
| Where does a mod's metadata get edited?         | In the Details tab, in place. No dialog is left to open    |
| Does Details replace the card's layer popover?  | No. That is a different gesture at a different scope       |
| When is a mod's WAD footprint analysed?         | On the first expand of its fold, never on drawing the tab  |
| Does the Readme item hide for a mod with none?  | No. Presence is unknown until the archive opens            |
| Is the panel's width written to disk?           | Yes, and neither the open state nor the mod it held        |
| Does the licenses tab follow the opened mod?    | Yes. Every tab in the panel answers for the one mod        |
| Is a license text cached to disk?               | No. It is read once per session and held in memory         |
| Can the library be edited while patching?       | Yes. The overlay is rebuilt between games                  |
| Does an edit reach a game already running?      | No. It applies to the next game                            |

## Open questions

1. What does a selection do about folders? Moving a picked set into a folder is the obvious sixth
   command, and it needs a destination the bar has nowhere to put. The right click is no longer
   the cheap half, since it carries no selection commands at all, so the bar is the whole problem.
2. Does the keyboard reach a range? Enter and Space carry their modifiers, so a focused card
   picks and ranges the way a click does. What has no answer is arrowing between cards, which the
   grid does not offer at all.
