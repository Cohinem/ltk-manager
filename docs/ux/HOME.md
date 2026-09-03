# Home

## Changes

| Date       | Change                                                                |
| ---------- | --------------------------------------------------------------------- |
| 2026-09-03 | Ship v1 (#391): the page, both feeds, four tiles, Open on and the dot |
| 2026-09-03 | Specify v1 in #391: stubs for the checklist and the game build        |
| 2026-09-03 | Propose the page: the status line, two feeds, four tiles, the landing |

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

| Feature                    | Status    | Note                                                                   |
| -------------------------- | --------- | ---------------------------------------------------------------------- |
| The page, at `/`           | Available | Mods moved to `/mods`, and the folder route under it                   |
| The status line            | Available | The game build's row waits on a query, so it never holds yet           |
| Recent changes             | Available | The feed the changelog dialog reads, with the installed version marked |
| Notes shipped in the build | Available | `docs/releases/<version>.md`, so the installed notes need no network   |
| News                       | Available | The Announcements category's Atom feed, read as the release feed is    |
| Notices                    | Available | `news/notices.json` on the default branch, per `news/README.md`        |
| Your library               | Available | Profile, counts and the way in. The status line carries health         |
| Last game                  | Available | The latest incident's verdict, hidden while there is none              |
| News and Learn             | Available | One card. The links under the posts, so the card is never empty        |
| Getting started            | Proposed  | A checklist for a new install. The migration offer stands in for it    |
| The unread dot             | Available | On the Home tab, in the diagnostics dot's shape                        |
| Open on                    | Available | A Startup setting: Home or Mods                                        |
| A drop on Home             | Available | Mounted on Home as on the library. Lifting both to the root is later   |

## Layout

The default window is about 900 by 850. The page does not scroll. The header holds the status
line and the primary button, a notice sits under it while there is one, and two columns fill the
rest. The left column is one tall card, Recent changes, which scrolls inside itself as the
changelog dialog does. The right column is a stack of tiles, and it scrolls as a column when the
stack is taller than the window.

```
+------------------------------------------------------------------------------+
| (mark) LTK Manager  v1.15.4   Home*  Mods  Workshop        (bell)(gear) - o x |
+------------------------------------------------------------------------------+
|                                                                              |
|  Good to go.                                                 [ (L) Play  v ] |
|  Default  -  4 of 7 mods enabled  -  League 26.9                             |
|                                                                              |
|  +-- notice ---------------------------------------------------------------+ |
|  | (!) Patch 26.9: the patcher takes longer to hook.  What to do       [x] | |
|  +-------------------------------------------------------------------------+ |
|                                                                              |
|  +-- Recent changes -------------------------+  +-- Your library ----------+ |
|  | v1.15.4  [Installed]        Sep 3, 2026   |  | Default                  | |
|  |   Mod fixer                               |  | 4 of 7 enabled           | |
|  |   - Added additional fixes for ...        |  | 1 needs a repair [Repair]| |
|  |   Release notes                           |  | Checked against 26.9     | |
|  |   - The Update dialog is now scrollable   |  | [Open Mods]  [Add mod]   | |
|  |                                           |  +--------------------------+ |
|  | v1.15.3                     Sep 2, 2026   |  +-- Last game -------------+ |
|  |   ...                                     |  | Crashed while loading    | |
|  |                                           |  | 2 hours ago   [the game] | |
|  | v1.15.2                     Sep 1, 2026   |  | Noxus Rift is suspected  | |
|  |   ...                                     |  | [Review]                 | |
|  |                                           |  +--------------------------+ |
|  |                                           |  +-- News ------------------+ |
|  |                                           |  | Sep 1   Patch 26.9 FAQ   | |
|  |                                           |  | May 15  The new manager  | |
|  |                                           |  |                          | |
|  |                                           |  | Getting started          | |
|  |                                           |  | Managing mods            | |
|  |                                           |  | Troubleshooting          | |
|  |           No older releases               |  | Discord  -  GitHub       | |
|  +-------------------------------------------+  +--------------------------+ |
+------------------------------------------------------------------------------+
| (status bar: the session, and the health item)                               |
+------------------------------------------------------------------------------+
```

The primary button is the library's `PlayButton`, the same component with the same menu and the
same launch guard, so Play from Home is Play from the library. A reader who opens the app to play
presses it here and never visits the library, which is what lets Home be the landing page without
costing that reader a click.

Nothing on the page repeats the status bar. The bar carries the session and the health item, and
it is under every page, Home included. The status line above says what state the library is in
before a session starts, and the bar says what the session is doing once one has.

## The status line

One sentence, and at most one action beside it. It is derived, never stored, and the first row
that holds wins. The hue follows the severity per "How loud a finding is drawn" in
[MOD_HEALTH.md](MOD_HEALTH.md), and the words are the app's own for each state, so nothing here
is a new claim.

| Holds when                             | Line                                                                  | Action                                   |
| -------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| The platform has no patcher            | The patcher does not run on this system yet                           | none, `PatcherUnsupported` says the rest |
| League's folder is not set             | League's folder is not set                                            | Set it, to the settings anchor           |
| The hashtables are absent              | Mod health waits for the hashtables                                   | Sync, what the readiness hook offers     |
| An enabled mod is unrepairable         | {n} enabled mods will break the game                                  | Show, opens the health drawer            |
| An enabled mod is repairable           | {n} enabled mods need a repair                                        | Repair                                   |
| The game build is newer than the basis | League updated to {build}. Your mods have not been checked against it | Check                                    |
| Otherwise                              | Good to go                                                            | none                                     |

Under the line, one row of facts in muted text: the active profile, enabled of total, and the
installed game build. The facts stay in every state, so the line above them is read against the
same ground.

An update on offer is not a state of the library, so it never takes the line. It is the New chip
in Recent changes, and the title bar's Update cell, which it already is.

The line is a readout and never an announcement. Mod health spends its one unprompted announcement
on the findings, per "The library sweep" in MOD_HEALTH.md, and the line does not spend a second
one. It is the same words, standing still, with the way into the drawer the status bar item
already offers.

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

**Your library.** The active profile's name, enabled of total, the health line the status bar
item derives, and the build the last check ran against, from `HealthCheckBasis`. Two buttons:
Open Mods, and Add mod, which is the library's import. While the migration banner's condition
holds the tile offers Import from cslol-manager in the banner's place, and the banner leaves the
library.

**Last game.** The latest incident's verdict in one line, when it happened, the consequence chip,
and Review into the Games tab. It is hidden while there is no incident or the latest is dismissed.
The tile changes no copy: [LEAGUE_DIAGNOSTICS.md](LEAGUE_DIAGNOSTICS.md) decided the verdict's
words, and the title bar's dot keeps pointing at the same incident.

**News, then Learn.** One card. The posts sit at the top and the standing links under them:
Getting started, Managing mods and Troubleshooting on the wiki, then Discord and the repository.
A card with no post is a card of links, so it is never empty. That is why the two are one card
and not two.

**Getting started.** A checklist on a fresh install, in the place of the tiles above until it is
done or dismissed: set League's folder, add a mod or import from cslol-manager, press Play once,
join the Discord. Each row reads its own done state from the app, so the card empties itself. The
first-run redirect to Settings stays, since the folder is what everything else waits on, and the
card is what the reader comes back to.

## The landing, the tab and the dot

Home is `/`. Mods moves to `/mods` and its folder route to `/mods/folder/$folderId`. Nothing
outside the app links to either: the deep links the app registers are the install request and the
settings anchor, per "The deep link" in [SETTINGS.md](SETTINGS.md).

The nav reads Home, Mods, Workshop, in that order, and the hotkeys follow the order: `Ctrl+1`,
`Ctrl+2`, `Ctrl+3`. One rule, and the tab order is the hotkey order. Workshop's key moves.

**Open on** is one setting in the Startup group, Home or Mods, defaulting to Home. A reader who
starts in the tray sees neither, as today.

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

| Key                                     | Text                                                                  |
| --------------------------------------- | --------------------------------------------------------------------- |
| `home_nav_label`                        | Home                                                                  |
| `home_status_ready_label`               | Good to go                                                            |
| `home_status_platform_label`            | The patcher does not run on this system yet                           |
| `home_status_league_unset_label`        | League's folder is not set                                            |
| `home_status_hashtables_unsynced_label` | Mod health waits for the hashtables                                   |
| `home_status_hashtables_syncing_label`  | Syncing the hashtables mod health needs                               |
| `home_status_broken_label`              | {count} enabled mods will break the game                              |
| `home_status_repairable_label`          | {count} enabled mods need a repair                                    |
| `home_status_build_moved_label`         | League updated to {build}. Your mods have not been checked against it |
| `home_changes_title`                    | Recent changes                                                        |
| `home_release_installed_label`          | Installed                                                             |
| `home_release_update_action`            | Update                                                                |
| `home_notice_link_action`               | What to do                                                            |
| `home_library_title`                    | Your library                                                          |
| `home_library_enabled_count_label`      | {enabled} of {total} enabled                                          |
| `home_library_import_title`             | Migrating from cslol-manager?                                         |
| `home_last_game_title`                  | Last game                                                             |
| `home_news_title`                       | News                                                                  |
| `home_learn_getting_started_label`      | Getting started                                                       |
| `home_learn_managing_mods_label`        | Managing mods                                                         |
| `home_learn_troubleshooting_label`      | Troubleshooting                                                       |
| `home_setup_title`                      | Getting started                                                       |

The `Open on` row is titled in the setting index, as every row of the Startup card is.

## How it is built

- `src/routes/index.tsx` becomes Home, `src/routes/mods.tsx` and `mods.folder.$folderId.tsx`
  take the library, and `src/pages/Home.tsx` composes the page from the tiles in
  `src/modules/home/`
- The status line is one hook over `usePlatformSupport`, `useSettings`,
  `useHealthCheckReadiness`, `useBrokenEnabledMods` and the basis. The installed game build needs
  a query the frontend does not have yet, over the reader core already uses for the basis
- Recent changes is `useReleaseHistory` with no exclusion, plus a module that imports
  `docs/releases/<version>.md?raw` at build, keyed by the package version
- News and notices are two commands beside `list_releases`: one parsing the Atom feed, one
  reading the JSON. Both blocking, both timed out, both with the release feed's error kinds
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

**Check on a moved build.** The status line asks the reader to check when League updated. The
sweep could run itself on that condition, which "When a check runs" in MOD_HEALTH.md would have
to admit as a trigger.

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
