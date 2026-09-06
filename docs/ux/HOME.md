# Home

## Changes

| Date       | Change                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| 2026-09-06 | Open on gains Workshop, as a third choice and never a memory (#424)     |
| 2026-09-04 | Move mod health off the status line, into the library tile's marker     |
| 2026-09-04 | Move the status line under Play, hedge its words, rebuild the News card |
| 2026-09-04 | Turn the launch control green while the patcher is up                   |
| 2026-09-03 | Draw Play as an accent edge over a wash rather than a solid fill        |
| 2026-09-03 | Cap the page's width, and draw Play as the rail's own block             |
| 2026-09-03 | Move Play to the head of the right rail, over the tiles it scrolls      |
| 2026-09-03 | Say nothing when nothing holds. Drop the facts row the tile repeats     |
| 2026-09-03 | Add Export to the library tile: the chooser, the scrim rule, the toast  |
| 2026-09-03 | Ship v1 (#391): the page, both feeds, four tiles, Open on and the dot   |

Each edit of this document adds a row at the top. The table keeps the last ten rows.

Home is the page the manager opens on. It answers, in this order, whether pressing Play is safe
right now, what changed in the manager since the reader last looked, and what the project has to
tell them. It is the launcher shape a player already knows from the Riot Client: one primary
button, a status, and news beside it. It is for the player who installs mods. The modder's hub is
the Workshop.

Two gaps make the page worth having. The release notes are reachable today only while an update
is pending, from the dialog that offers it, so a reader who installed the update never sees what
it changed. And the project's own announcements reach only the readers who happen to be in the
Discord or on GitHub, which is why the Patch 26.9 FAQ (#169) had to open with "if you got linked
here".

## Goals

- A reader learns whether they can play, in one line, before they press anything
- The notes for the version that is installed are on screen, and not only for the one on offer
- An announcement reaches every reader who opens the app, on the day it matters
- A notice about a game patch reaches the builds it concerns and no others
- Nothing on the page is a third way to say what the status bar and the library already say
- A reader who wants their mods first gets them first, and Home costs them nothing

## Scope

In scope: the page and its route, what the nav gains, the status line, the release feed drawn on
the page, the news and notice feeds, the tiles, and how the page tells a reader it holds something
they have not seen.

Out of scope:

- Mod updates. The manager has no registry to ask, so "your mods have updates" cannot be true yet
- The wording of a verdict, a health finding or a launch failure. Each keeps the copy its own
  document decided
- Anything for the modder. Workshop news and meta wiki links belong on the Workshop grid, per
  [WORKSHOP.md](WORKSHOP.md)
- Champion and map art on the page. #331 decides where that data comes from first

## Feature status

The status words are the ones [Project editor](PROJECT_EDITOR.md#feature-status) defines.

| Feature                    | Status    | Note                                                                         |
| -------------------------- | --------- | ---------------------------------------------------------------------------- |
| The page, at `/`           | Available | Mods moved to `/mods`, and the folder route under it                         |
| The status line            | Available | The game build's row waits on a query, so it never holds yet                 |
| Recent changes             | Available | The feed the changelog dialog reads, with the installed version marked       |
| Notes shipped in the build | Available | `docs/releases/<version>.md`, so the installed notes need no network         |
| News                       | Available | The Announcements category's Atom feed, read as the release feed is          |
| Notices                    | Available | `news/notices.json` on the default branch, per `news/README.md`              |
| Your library               | Available | Profile, counts and the way in, over the health marker                       |
| The health marker          | Available | The library tile's own row. Red through green, and the press each state owes |
| Export                     | Available | The tile's overflow. Archives copied out, as a folder or one zip             |
| Last game                  | Available | The latest incident's verdict, hidden while there is none                    |
| News and Learn             | Available | One card. The links under the posts, so the card is never empty              |
| Getting started            | Proposed  | A checklist for a new install. The migration offer stands in for it          |
| The unread dot             | Available | On the Home tab, in the diagnostics dot's shape                              |
| Open on                    | Available | A Startup setting: Home, Mods or Workshop                                    |
| A drop on Home             | Available | Mounted on Home as on the library. Lifting both to the root is later         |

## Layout

The default window is about 900 by 850. The page does not scroll. A notice takes a row of its own
while there is one, and two columns fill the rest. The left column is one tall card, Recent
changes, which scrolls inside itself as the changelog dialog does.

The right column is the rail. Play heads it, full width and a size up, the status line sits under
the button while one holds, and under them a stack of tiles scrolls as a column when the stack is
taller than the window. The button and the line sit outside that scroller, so the primary action
and what qualifies it are in the same place whatever the tiles are doing.

The page holds a maximum width and centres above it. Recent changes is a reading surface, and
without the cap every pixel a wider window gained went to that one card, until its lines ran
past what anyone reads comfortably and the rail sat in dead space. A wider window buys margins
instead, and the page keeps the proportions it was drawn at from the default size up.

```
+------------------------------------------------------------------------------+
| (mark) LTK Manager  v1.15.4   Home*  Mods  Workshop        (bell)(gear) - o x |
+------------------------------------------------------------------------------+
|                                                                              |
|  +-- notice ---------------------------------------------------------------+ |
|  | (!) Patch 26.9: the patcher takes longer to hook.  What to do       [x] | |
|  +-------------------------------------------------------------------------+ |
|                                                                              |
|  +-- Recent changes -------------------------+  [ (L) Play               v ] |
|  | v1.15.4  [Installed]        Sep 3, 2026   |  +--------------------------+ |
|  |   Mod fixer                               |  | (!) League's folder is   | |
|  |   - Added additional fixes for ...        |  |     not set     Set it > | |
|  |   Release notes                           |  +--------------------------+ |
|  |   - The Update dialog is now scrollable   |  +-- Your library ----- (:) + |
|  |                                           |  | Default                  | |
|  | v1.15.3                     Sep 2, 2026   |  | 4 of 7 enabled           | |
|  |   ...                                     |  | (!) Health status 2 rep >| |
|  |                                           |  | [Open Mods]  [Add mod]   | |
|  |                                           |  +--------------------------+ |
|  | v1.15.2                     Sep 1, 2026   |  +-- Last game -------------+ |
|  |   ...                                     |  | Crashed while loading    | |
|  |                                           |  | 2 hours ago   [the game] | |
|  |                                           |  | [Review]                 | |
|  |                                           |  +--------------------------+ |
|  |                                           |  +-- News ------------------+ |
|  |                                           |  | Patch 26.9 FAQ           | |
|  |                                           |  | Sep 1                    | |
|  |                                           |  |                          | |
|  |                                           |  | The new manager          | |
|  |                                           |  | May 15                   | |
|  |                                           |  |--------------------------| |
|  |                                           |  | (book)  Getting started  | |
|  |           No older releases               |  | (stack) Managing mods    | |
|  |                                           |  | (ring)  Troubleshooting  | |
|  |                                           |  |--------------------------| |
|  +-------------------------------------------+  | [Discord]     [GitHub]   | |
|                                                 +--------------------------+ |
+------------------------------------------------------------------------------+
| (status bar: the session, and the health item)                               |
+------------------------------------------------------------------------------+
```

Play heads the rail rather than the page, over the library it launches. It is the library's
`PlayButton`, the same component with the same menu and the same launch guard, so Play from Home
is Play from the library. Home asks it for its block shape, which is the toolbar's control drawn
full width and one size up, since here it is the page's one primary action rather than one press
in a row of them.

The block shape is an accent edge over a wash rather than the toolbar's solid fill. Filled is what
a press in a row of peers wears to be found among them, and at the head of the rail, alone and the
width of the column, the same fill reads as a banner instead of a button. The edge is what carries
it there.

**The control goes green while the patcher is up, and eases into it.** Idle it is the accent's edge
over the accent's wash, and running it is the same shape in the success hue, which is the hue the
live dot on it already wears. The colour crosses over half a second rather than cutting, because a
patcher that came up is a state to notice and an instant swap reads as a redraw. This is the
control's own chrome wherever it is drawn, so the library's toolbar turns with the rail. A reader who opens the app to play
presses it here and never visits the library, which is what lets Home be the landing page without
costing that reader a click.

Nothing on the page repeats the status bar. The bar carries the session and the health item, and
it is under every page, Home included. The status line above says what state the library is in
before a session starts, and the bar says what the session is doing once one has.

## The status line

One sentence, and at most one errand folded into it. It is derived, never stored, and the first row
that holds wins. The words are the app's own for each state, so nothing here is a new claim.

**It sits under Play, not over the page.** The line is in the rail, under the button it qualifies,
in the frame and at the size a notice is drawn at. Over both columns at heading size it was the
loudest thing on the page - above the project's own notice, above Play - so an inferred verdict
outranked both, and the reader met an alarm before they met anything they came for. Under the
button it still answers "can I play" before the press.

**The hue is the frame's and the glyph's, and never the sentence's.** A sentence set in the
severity's colour is the same mistake the rung table fixed one level down: it asserts with type
what the verdict only suspects. The frame carries the rung, and the words stay the body's colour.

**The whole box is the press.** The errand's word rides the first line with a caret after it, so a
sentence that wraps runs under itself rather than pushing a button onto a row of its own. A row
with no errand is the same frame without the caret. It is `AlertBox`, the component the notice
below it is drawn with.

| Holds when                  | Line                                        | Action                                   |
| --------------------------- | ------------------------------------------- | ---------------------------------------- |
| The platform has no patcher | The patcher does not run on this system yet | none, `PatcherUnsupported` says the rest |
| League's folder is not set  | League's folder is not set                  | Set it, to the settings anchor           |
| Otherwise                   | nothing, the row is not drawn               | none                                     |

**Mod health is not one of these rows.** It is the library's state rather than the page's, and it
is the one state a reader wants a standing answer to, so it is a marker in the library tile and the
next section is what it says. What is left on the line is what no tile owns: the platform the app
was installed on, and a folder the whole app waits for.

The all-clear is drawn as no row at all. A line saying the library is fine is a line the reader
learns to read past, and the rail already carries the profile, the counts and the marker, so the
row costs the page nothing while nothing holds.

An update on offer is not a state of the library, so it never takes the line. It is the New chip
in Recent changes, and the title bar's Update cell, which it already is.

## The health marker

One row of the library tile, drawn in every state a library has. The title is `Health status` and
never varies. What varies is the hue, a reading in the trailing seat, and what a press does. It is
the status line's `AlertBox`, at the tile's width, so the two read as one family and the hue stays
the frame's and the glyph's rather than the words'.

**A fixed title is what makes it a marker.** A row whose first words change is read from the start
each time it changes, and this one is read on every launch. The reader learns where it sits and
what it is called once, and after that a glance at the hue is the whole reading. The count and the
state word take the trailing seat, where the errand's word used to sit.

| Holds when                         | Hue   | Reading       | Press                                |
| ---------------------------------- | ----- | ------------- | ------------------------------------ |
| The hashtables are absent          | Grey  | No hashtables | Sync, what the readiness hook offers |
| The hashtables are landing         | Grey  | Syncing       | none, and the reading spins          |
| A check is running                 | Grey  | Checking      | none, and the reading spins          |
| An enabled mod is unrepairable     | Red   | {n} broken    | Opens the health drawer              |
| An enabled mod is repairable       | Amber | {n} repairs   | Opens it, asking for the repair      |
| No verdict answers for the library | Amber | Not checked   | Sweeps the library                   |
| An enabled mod loads with a fault  | Grey  | {n} flagged   | Opens the health drawer              |
| Otherwise                          | Green | Healthy       | Sweeps the library again             |

The first state that holds wins. The three counted readings are the status bar item's own words, so
one library says the same thing in the bar and on the page.

**The hue is the rung's, per "How loud a finding is drawn" in [MOD_HEALTH.md](MOD_HEALTH.md).** The
three coloured findings are that table's three rungs. Grey is what the table has no word for - a
check that cannot run, one that is running, and one whose answer does not describe this library -
and it is the grey a flagged mod already wears, because both mean the reader has nothing to do
here. Green is the state that table never needed, since it only ever describes a finding.

**Green presses to check again, because there is nothing else left to do.** Every other state leads
somewhere: the drawer, the sync, a sweep of a library nothing has swept. A healthy library has no
panel worth opening, and a reader pressing a green row is asking whether it is still true. The
sweep's own progress toast reports, so the marker only spins.

**A library nothing has checked is not a healthy one.** Verdicts are stored per mod and a fresh
install has none, so a marker reading the verdicts alone would go green off an empty answer. That
state and a library checked before League moved are the same news - what the reader was told does
not answer for what they have - so they are one amber row with one press.

**The marker says what the check found, not what the game will do.** "will break the game" is a
certainty the check cannot back. The sweep is still gaining checks, and a mod it passes can still
fail in play, which the 1.15.3 notes say in as many words. MOD_HEALTH.md records the same mistake
one level down, where the hue asserted more than the verdict knew and readers went looking for
replacements that did not exist. The press carries the consequence, and the drawer is where the
finding is.

**It counts the mods a patch would carry.** A disabled mod reaches no overlay, so it cannot stand
between the reader and Play, and the line above the marker already says how much of the library is
on.

The marker is a readout and never an announcement. Mod health spends its one unprompted
announcement on the findings, per "The library sweep" in MOD_HEALTH.md, and the marker does not
spend a second one. It is the same words, standing still, with the way into the drawer the status
bar item already offers.

## Recent changes

The card reads the release feed `ReleaseHistory` reads, without the version it excludes, since
here the pending release is one more row rather than the reason the surface opened. Each release
is a `ReleaseSection`, so a note reads on Home as it reads in the dialog.

Three chips. New and Pre-release are the dialog's. Installed is new, on the version `AppInfo`
reports, and it is what the card exists for. A pending release keeps its New chip and gains an
Update button in its header row, which opens the changelog dialog as the title bar cell does, so
the install itself stays on the one surface that already knows how to run it.

A release older than the reader's last visit draws nothing special. Unread is a property of the
page, said by the dot on the tab, and not of a row.

**The installed notes ship in the build.** `docs/releases/<version>.md` is the body of the
release, and the build knows its own version, so the notes for the installed version can be read
from the binary and never from the network. The card draws that section at once and the feed fills
in below it. Offline, the card is one release and a quiet foot, which is more than the dialog can
do today. A build with no file of its own draws the feed alone, which is what a pre-release gets.

The feed is unauthenticated GitHub, sixty an hour for the address, and the query is cached for
half an hour. A launch costs one request. That is what the dialog costs today, moved earlier.

## News and notices

Two feeds, because the two things the project has to say have different shapes.

**News** is a list of posts. The source is the Announcements category of the repository's
Discussions, which has an Atom feed that needs no token and answers outside the API's quota. The
maintainers already post there, and the Patch 26.9 FAQ is on it. A post is a title, a date and a
link, and it opens in the browser. The card shows the newest few, and a reader who wants more
follows the link. The backend reads it as `releases/mod.rs` reads the release feed, one blocking
fetch behind IPC, since the webview reaches `'self'` and `ipc:` only.

**A notice** is one line that has to be seen: a game patch broke the patcher, an update is
required, a build has a bug worth knowing about. It is drawn as a banner under the status line
until the reader dismisses it or it expires. Its source is a JSON document this repository owns,
read raw from `main`, so a notice is a reviewed change and the schema is ours:

```json
{
  "schema": 1,
  "notices": [
    {
      "id": "2026-09-patch-26-9",
      "severity": "warning",
      "title": "Patch 26.9: the patcher takes longer to hook",
      "url": "https://github.com/LeagueToolkit/ltk-manager/discussions/...",
      "publishedAt": "2026-09-01T12:00:00Z",
      "expiresAt": "2026-09-20T00:00:00Z",
      "versions": "<1.16.0"
    }
  ]
}
```

`versions` is a semver range, and a notice outside it is not drawn. That is what lets a notice
say "update" to the builds that need to and stay silent on the one that has. `expiresAt` is what
stops a patch-day notice outliving the patch. Dismissed ids are kept locally, the way the skipped
update version is.

The text of both feeds is drawn as data, the way Riot's own refusal is drawn in
[LAUNCHER.md](LAUNCHER.md). ADR-0017 makes the frontend own every string the app says, and these
are strings the project says, in one language, after the build shipped. A localized title is a
later schema.

## The tiles

**Your library.** The active profile's name, enabled of total, and the health marker under them.
Two buttons: Open Mods, and Add mod, which is the library's import. While the migration banner's condition
holds the tile offers Import from cslol-manager in the banner's place, and the banner leaves the
library. The header carries an overflow for what a reader wants only sometimes: Export mods, and
Open mod storage.

**Last game.** The latest incident's verdict in one line, when it happened, the consequence chip,
and Review into the Games tab. It is hidden while there is no incident or the latest is dismissed.
The tile changes no copy: [LEAGUE_DIAGNOSTICS.md](LEAGUE_DIAGNOSTICS.md) decided the verdict's
words, and the title bar's dot keeps pointing at the same incident.

**News, then Learn.** One card in three bands. A post is its title on one line with its date
under it, so a real title wraps instead of truncating against a date gutter. A rule, then the wiki
links - Getting started, Managing mods, Troubleshooting - each behind its own mark and none behind
the trailing arrow every row used to repeat. A rule, then Discord and the repository as two buttons
in the card's foot. A card with no post is a card of links, so it is never empty. That is why the
two are one card and not two.

The bands are what stop five accent-coloured rows reading as one list, where a wiki page and a
Discord invite looked alike. A button is the last two saying they leave the documentation
behind.

**Getting started.** A checklist on a fresh install, in the place of the tiles above until it is
done or dismissed: set League's folder, add a mod or import from cslol-manager, press Play once,
join the Discord. Each row reads its own done state from the app, so the card empties itself. The
first-run redirect to Settings stays, since the folder is what everything else waits on, and the
card is what the reader comes back to.

## Export

A reader who wants their mods out of the manager should not have to find the mod storage in
Explorer first. Export mods opens a chooser anchored to the tile's overflow over a blurred page:
what to export, Everything or Enabled, and whether to write a folder of archives or one `.zip`.

The scope is two options rather than three because a new profile is created holding every mod in
the library. Profiles differ in what they have on, not in what they hold, so "this profile" and
"everything" are one set and only Enabled narrows it.

**The scrim is for the decision, not for the work.** Once a destination is picked the chooser
closes and the run reports in the tile, so a click outside cannot take the progress away. The
result is a toast carrying the destination and Show me, because the run outlives the surface that
asked for it, and nothing about a finished export stays on the page.

An export is a copy. A mod's archive is still beside it after an install, so nothing is repacked
and a mod costs one read and one write. A mod whose archive is gone - a fantome converted to a
project that kept no keepsake - has nothing to copy, and the toast says how many were left behind
rather than inventing an archive for them.

## The landing, the tab and the dot

Home is `/`. Mods moves to `/mods` and its folder route to `/mods/folder/$folderId`. Nothing
outside the app links to either: the deep links the app registers are the install request and the
settings anchor, per "The deep link" in [SETTINGS.md](SETTINGS.md).

The nav reads Home, Mods, Workshop, in that order, and the hotkeys follow the order: `Ctrl+1`,
`Ctrl+2`, `Ctrl+3`. One rule, and the tab order is the hotkey order. Workshop's key moves.

**Open on** is one setting in the Startup group, Home, Mods or Workshop, defaulting to Home. A
reader who starts in the tray sees none of them, as today, and the first-run redirect wins. It
stays a choice. Nothing remembers the last route, because the dot exists to bring a reader back
to Home, and a memory would work against it.

**The dot.** The Home tab carries a dot when the page holds something the reader has not seen:
the installed version's notes, a notice, or a post newer than their last visit. The installed
version is compared to a version kept locally, the way the skipped update version is, so the dot
for "the app updated" needs no network. Opening Home clears the dot and moves the marks.

**The update dialog.** It self-raises three seconds after mount, last in the queue per ADR-0022.
With Home as the landing page the same notes are on the page the dialog would cover, so on Home
the dialog should not raise itself. Off Home it still should, since a reader who opens on Mods
has not seen them. That is a condition on the claim rather than a change to the order, and the
title bar cell keeps the way back either way. ADR-0022's table gains a note rather than a row.

**A drop.** A file dropped on the landing page has to install, or the landing page is where drops
go to die. `useModFileDrop` and the import dialog move up to the root layout, so a drop lands on
any page.

## Copy

New strings, in `messages/en/home.json`, keyed as `src/CLAUDE.md` shapes a key. A string a
tile draws that another surface already decided stays that surface's string. The status line's
own sentences are here too, since no other surface says them as one line.

| Key                                       | Text                                        |
| ----------------------------------------- | ------------------------------------------- |
| `home_nav_label`                          | Home                                        |
| `home_status_platform_label`              | The patcher does not run on this system yet |
| `home_status_league_unset_label`          | League's folder is not set                  |
| `home_changes_title`                      | Recent changes                              |
| `home_release_update_action`              | Update                                      |
| `home_notice_link_action`                 | What to do                                  |
| `home_library_title`                      | Your library                                |
| `home_library_health_title`               | Health status                               |
| `home_library_health_unsynced_label`      | No hashtables                               |
| `home_library_health_syncing_label`       | Syncing                                     |
| `home_library_health_checking_label`      | Checking                                    |
| `home_library_health_stale_label`         | Not checked                                 |
| `home_library_health_clean_label`         | Healthy                                     |
| `home_library_enabled_count_label`        | {enabled} of {total} enabled                |
| `home_library_import_title`               | Migrating from cslol-manager?               |
| `home_library_more_action`                | More library actions                        |
| `home_library_storage_action`             | Open mod storage                            |
| `home_library_export_action`              | Export mods                                 |
| `home_library_export_title`               | Export mods                                 |
| `home_library_export_scope_label`         | What to export                              |
| `home_library_export_scope_all_label`     | Everything                                  |
| `home_library_export_scope_enabled_label` | Enabled                                     |
| `home_library_export_shape_label`         | As                                          |
| `home_library_export_shape_folder_label`  | A folder                                    |
| `home_library_export_shape_zip_label`     | One .zip                                    |
| `home_library_export_count_hint`          | {count} mods will be written                |
| `home_library_export_confirm_action`      | Export                                      |
| `home_library_export_running_label`       | Exporting                                   |
| `home_library_export_done_title`          | Exported {count} mods                       |
| `home_library_export_partial_title`       | Exported {exported} of {total} mods         |
| `home_library_export_skipped_hint`        | {count} mods have no archive to export      |
| `home_library_export_failed_title`        | Could not export your mods                  |
| `home_library_export_reveal_action`       | Show me                                     |
| `home_library_export_folder_title`        | Export mods to                              |
| `home_library_export_zip_title`           | Export mods as                              |
| `home_last_game_title`                    | Last game                                   |
| `home_news_title`                         | News                                        |
| `home_learn_getting_started_label`        | Getting started                             |
| `home_learn_managing_mods_label`          | Managing mods                               |
| `home_learn_troubleshooting_label`        | Troubleshooting                             |
| `home_setup_title`                        | Getting started                             |

The marker's three counted readings are not here. `{n} broken`, `{n} repairs` and `{n} flagged` are
the status bar item's words about the same library, so they moved to `common.json` as
`common_health_broken_label`, `common_health_repairs_label` and `common_health_flagged_label` and
both surfaces call them.

The Installed chip is `ReleaseSection`'s, so its label is the updater's, and Retry is common.
The `Open on` row is titled in the setting index, as every row of the Startup card is.

## How it is built

- `src/routes/index.tsx` becomes Home, `src/routes/mods.tsx` and `mods.folder.$folderId.tsx`
  take the library, and `src/pages/Home.tsx` composes the page from the tiles in
  `src/modules/home/`
- The status line is one hook over `usePlatformSupport` and `useSettings`
- The health marker is `useLibraryHealth`, one hook over `useHealthCheckReadiness`,
  `useHealthVerdicts`, the stored verdicts and the two mutations a press runs. The installed game
  build needs a query the frontend does not have yet, over the reader core already uses for the
  basis, so the marker takes it as an input and is handed `null`
- Recent changes is `useReleaseHistory` with no exclusion, plus a module that imports
  `docs/releases/<version>.md?raw` at build, keyed by the package version
- News and notices are two commands beside `list_releases`: one parsing the Atom feed, one
  reading the JSON. Both blocking, both timed out, both with the release feed's error kinds
- Export is `export_mods` over `ModLibrary::export_mods`, which resolves the scope under the index
  lock and copies outside it, and reports per mod on `export-progress`
- The unread marks are one persisted store: the last seen version, the last seen post date, the
  dismissed notice ids
- The dot is a hook the nav link reads, the way the diagnostics link reads its incidents
- The update claim in `UpdateNotification` takes the route into account

## Ideas for review

These are proposals. None is a decision.

**A note that links into the app.** A release note that says "see Settings, Patching" is a
sentence today. `ChangelogContent` could route an `ltk://` link inside the app, which the settings
anchor already answers, so a note about a new setting is a click to it.

**The profile on the line.** The facts row names the active profile. The library's
`ProfileSelector` in its place makes patch day a switch to a safe profile without leaving Home.
It costs the row a control, and the tile already offers the way into the library.

**Check on a moved build.** The marker asks the reader to check when League updated. The sweep
could run itself on that condition, which "When a check runs" in MOD_HEALTH.md would have to admit
as a trigger.

**A tip in the news.** A post kind the card draws differently, for "did you know" copy about a
feature that shipped a while ago. It is a feed schema question before it is a design one.

## Open questions

| Question                                                                   | Recommendation                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Is Home the landing page, or a tab beside Mods?                            | The landing page. Play is on it, so the reader who opens to play loses nothing, and the reader who opens to read finds it |
| Does Workshop's hotkey move to `Ctrl+3`?                                   | Yes. The tab order is the hotkey order                                                                                    |
| Notices as a JSON document, or an `[IMPORTANT]` prefix on an announcement? | The document. A version range and an expiry are what make a notice safe to leave up                                       |
| Does the installed version's note ship in the build?                       | Yes. It is the one note every reader wants and the one that needs no network                                              |
| Does Home show the pending update's notes, or only the chip?               | The notes, as one more row. The dialog is the install, not the reading                                                    |
