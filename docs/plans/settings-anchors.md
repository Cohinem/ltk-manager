# Settings Anchors — Implementation Plan

> Status: **proposed** (2026-09-03).
>
> Design source: `docs/ux/SETTINGS.md` — [The levels](../ux/SETTINGS.md#the-levels),
> [Anchors](../ux/SETTINGS.md#anchors). Decisions:
> [ADR-0023](../adr/0023-a-setting-id-and-a-ui-path-are-two-id-spaces.md) and
> [ADR-0024](../adr/0024-a-setting-id-is-its-key-in-settings-json.md). Message keys follow
> [ADR-0019](../adr/0019-a-domain-id-is-its-own-message-key.md).
>
> Reopens a question `docs/ux/SETTINGS.md` closed on 2026-08-25 — _`focus` addresses a group or a
> row, and never a card_. ADR-0023 records why the answer changes.

What ships: `?focus=` and `ltk://settings` address a tab, a card, a group or a row. Every level
offers `Copy ID` and `Copy link` from the menu the row's gear draws today. A setting's id becomes
its key in `settings.json`, moves onto a domain name, and leaves a retired id behind when it moves.
Every node's title, description and hint becomes a message. What each space promises is ADR-0023's
table, and this plan does not repeat it.

Decided in review on 2026-09-03, past what the design document had settled:

- **The id is the `settings.json` key.** ADR-0024. A serde rename with the old key as its alias on
  the thirty-three fields the file stores, and the eleven a frontend store owns keep their store
  key
- **A rename leaves a retired id.** A `RETIRED` table with the release and the replacement or the
  reason replaces `aliases`, seeded with the fifteen. A link or a pasted id resolving through one
  says so in a toast
- **The tab is a column of the index.** `SettingNode.tab`, so resolution and the palette read it
  without mounting the page
- **A UI path is declared, not derived.** Kebab-case of the title is the convention at minting,
  and a retitle does not move the path. `general/migration` is the card titled
  `Import from cslol-manager`
- **A card titled as its tab shares the tab's node.** `patching` is the tab and its Patching card,
  and its groups are `patching/injector` beside the `patching/overlay` card. Five cards share
- **No prefix rule.** The two separators keep the spaces disjoint, and a rule forbidding a UI path
  from prefixing a setting id failed on every tab that is also a domain
- **A card has no reset in its menu.** Appearance keeps the only card-level reset, as closed on
  2026-08-25
- **The header gear draws on hover alone**, like the row's, and right-click opens the menu anytime
- **A group's reset stays in the menu while nothing is changed**, disabled and without its count
- **The catalog PR carries node copy alone.** Menu, toast and action copy migrate with the menu,
  on touch
- **All fifteen ids move**, the nine under `general` and six whose suffix repeats or over-describes
  its domain, and the old ids are the first retired rows. `league.path` and
  `tray.startUnlessUpdate` stand
- **ADR-0023 owns the two-spaces table.** `docs/ux/SETTINGS.md` keeps the behaviour and cites it

## 1. Current state (verified 2026-09-03)

| Piece        | Where                                                                     | Shape today                                                                                 |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| The file     | `settings.json`, `load_settings` in `src-tauri/src/state.rs`              | Flat camelCase, `Config` flattened in. A parse error falls back to defaults                 |
| The key      | `SettingKey` in `settingKey.ts`                                           | `keyof Settings`, plus `display.*` and `layout.*` off two stores. Eleven rows use those     |
| The reads    | `settings.<key>` across `src/`                                            | A few hundred references to the thirty-three file-stored keys                               |
| The index    | `src/modules/settings/settingsIndex.ts`                                   | 44 rows, one per setting. `id`, `key`, `title`, optional `aliases`                          |
| Group ids    | Inline `id=` props in five `*Section.tsx` files                           | 16 of them, in the JSX only. No table, nothing checks one                                   |
| Card ids     | none                                                                      | 13 distinct cards, unaddressable                                                            |
| Tab ids      | `src/modules/settings/tabs.ts`                                            | `SETTINGS_TABS` + `SETTINGS_TAB_LABELS`                                                     |
| Lookup       | `settingById`, `settingEntry`                                             | One `Map` over ids and aliases, one record over keys                                        |
| Resolution   | `settingFocusTab`                                                         | Resolves an alias, splits on the first `.`, falls back to `general`                         |
| The mark     | `useSettingMark` in `SettingFocus.tsx`                                    | Target claims itself on mount                                                               |
| The menu     | `SettingGutter.tsx`                                                       | Gear + right-click. `Reset setting`, `Copy setting ID`, `Copy link to setting`, as literals |
| The palette  | `useSettingRows.tsx`                                                      | One row per index entry, matched only on a term. No tab rows                                |
| The route    | `src/routes/settings.tsx`                                                 | `firstRun`, `tab`, `focus`. `focus` is any string                                           |
| The link     | `parse_settings` in `src-tauri/src/deep_link/`                            | 1 to 128 chars, alphabet `[A-Za-z0-9._-]`. A test asserts `a%2Fb` is refused                |
| i18n         | `messages/en/`, six catalogs                                              | No settings catalog. The module calls zero messages                                         |
| In-app mints | `EmptyStates.tsx:48`, `GameBrowserStates.tsx:26`, `useSettingRows.tsx:39` | Two links naming rows and the palette's navigate, all untyped strings                       |

## 2. PR 1 — the key

Every field of `Settings` and `Config` with a row in the index takes its id as its serde name, and
keeps the old name as an alias:

```rust
#[serde(rename = "startup.autoRun", alias = "autoRun")]
pub auto_run: bool,
```

Thirty-three fields, one attribute each, and the file stays flat. A file written before this loads
through the alias, and the next save writes the new keys. A field without a row —
`firstRunComplete`, `libraryViewMode`, `migrationDismissed`, `showModTags`, `authorProfiles`,
`defaultAuthorProfileId`, `hasSeenHddWarning` — is state and keeps its camelCase key until it gets
a row. The rename reaches `Config` in `ltk-manager-core`, whose serde names become public. Nothing
in-tree deserializes the file but `load_settings`.

ts-rs regenerates `Settings.ts` with the dotted names, so `keyof Settings` becomes the id for those
thirty-three and `SettingKey` needs no change of its own. Every read of `settings.autoRun` in `src/`
becomes a read of `settings["startup.autoRun"]`, and the PR is that rename, the attributes and one
test. No user-facing change.

The old key and the old id are different strings, and this PR retires only the key.
`general.autoRun` is a `RETIRED` row in PR 3. A downgrade past this release loses settings, per
ADR-0024, and the release notes say so.

## 3. PR 2 — the catalog

`messages/en/settings.json`, added to the `pathPattern` in `project.inlang/settings.json`. Roughly
150 keys and no consumers, so it reviews as copy rather than as a diff that also renames ids.

Keys follow ADR-0019 — the id verbatim, under a prefix naming its kind, and a role suffix:

```
setting.launch.mode.title                  "Launcher flow"
setting.launch.mode.description            "Whichever you pick, the other action stays on the button's menu."
setting.patching.patchTft.hint             "..."
settingsUi.general.title                   "General"
settingsUi.general/league.title            "League of Legends"
settingsUi.general/league/launching.title  "Launching"
```

Verified: Paraglide 2.25.0 emits `export { ident as "settingsUi.general/league/launching.title" }`,
an arbitrary module namespace name, so `/` survives into the key and the paste test holds.

Roles are present only where the level draws them. Every node takes `title`. A row adds
`description` and `hint` where it has them, and a card or group takes the same two, because
`SectionCard` draws a description and `SettingGroup` draws both.

**Node copy only.** Menu items, toasts and the gear's accessible name are not node copy and migrate
in PR 4, when that code is touched. An action row — `Rebuild overlay`, a `title` prop and no setting
key — is neither a setting nor a node and has no id, so its copy is an ordinary slot when it moves.

## 4. PR 3 — the index

### 4.1 The three tables

```ts
/** One setting a link can name. Its id is its settings.json key, see ADR-0024. */
export interface SettingNode {
  readonly id: string;
  /** The tab it draws on, which is a lookup and never the id's first segment. */
  readonly tab: SettingsTab;
  /** The store key, for the eleven a frontend store owns instead of the file. */
  readonly key?: StoreSettingKey;
}

/** One place on the page a link can name. Moves with the page, see ADR-0023. */
export interface SettingUiNode {
  readonly path: string;
}

/** An id the app no longer mints, and what became of it. */
export interface RetiredSettingId {
  readonly id: string;
  /** The release it stopped in. */
  readonly since: string;
  readonly replacedBy?: SettingId;
  /** Why it is gone, for an id nothing replaced. */
  readonly message?: string;
}
```

`StoreSettingKey` is the `display.*` and `layout.*` half of today's `SettingKey`, and a row reads
`node.key ?? node.id`. `RETIRED` is seeded with the fifteen ids of section 8, `since` the release PR
1 ships in, because `Copy setting ID` has been minting them since 2026-08-25.

No table carries a title. The title is `m[\`setting.${id}.title\`]()` or
`m[\`settingsUi.${path}.title\`]()`, so a node added without a message fails `tsc` and the coverage
check in 4.5 gets a second half for free.

`SettingId` and `SettingUiPath` are literal unions off the two node tables, and `SettingNodeId` is
the union of the two.

This PR is also where the ids take the spellings in section 8: the 44 rows of the index, the 16
`id=` props, and the two `<Link>` targets.

### 4.2 The index check

Dev-only, once at module load, throwing rather than warning — a broken index is a bug:

1. A setting id, current or retired, matches `[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*`, and a UI path
   the same with `/`
2. No value carries both separators
3. Every id and path is unique, retired ids included, and a retired id is not a current one
4. A retired id's `replacedBy` is a current id
5. Every UI path past one segment has its parent in the table, and segment 0 is a `SettingsTab`

### 4.3 Resolution

```ts
/** Where a `?focus=` value lands: the tab to open, and the node to mark if one survives. */
export interface SettingFocusTarget {
  readonly tab: SettingsTab;
  /** The nearest surviving node, or null when only the tab is left. */
  readonly node: SettingNodeId | null;
  /** The retired row the value went through, for the toast. */
  readonly retired?: RetiredSettingId;
}

export function resolveSettingFocus(focus: string): SettingFocusTarget;
```

A dotted value is a setting id: exact, then through `RETIRED` to its replacement, then the default
tab with no node. It never truncates, because a setting id names a domain and not a place. A resolve
through a retired row raises one toast — `general.autoRun is now startup.autoRun`, or the row's
message for an id nothing replaced. A slashed value is a UI path: exact, then the same path with its
last segment dropped, down to the tab. A single segment is a tab and resolves to
`{ tab, node: null }`, because the panel is the whole page and a ring around it says nothing. The
card that shares its tab's node lands the same way, and it is the panel.

### 4.4 Typed minting

The route keeps `focus?: string`, so an inbound link from an older build still resolves. In-app
minting goes through typed helpers, so a typo is a compile error:

```ts
settingSearch(id: SettingNodeId): SettingsSearch;
settingLink(id: SettingNodeId): string;
```

The three existing call sites move onto `settingSearch`: the two `<Link>`s and the palette's
navigate. Per section 7, nothing else in-app mints one.

### 4.5 Coverage

One test renders each tab and asserts, for every node past one segment that is namespaced to it,
that exactly one component claims it, and that its component renders inside the component its parent
names, where a tab's component is its panel. That catches the two failures left: a node nothing
draws, which is a link that resolves and then marks nothing, and a card or group whose path names a
place it does not sit.

### 4.6 What reads a title now

`SettingRow`, `SettingGroup` and the new `SettingCard` read theirs from the catalog. The `title`
prop leaves `SettingGroup`, and `SectionCard` keeps its own because it is shared and knows nothing
about nodes — `SettingCard` passes it the message. `SETTINGS_TAB_LABELS` dissolves into
`settingsUi.<tab>.title`.

### 4.7 The palette

Every tab becomes a row of the `settings` source, off the UI table, so a reader can type `patching`
at it. A retired id is one of the words its replacement's row matches on, so a reader who learned
the old spelling still finds the row, and choosing it goes through the same resolve and the same
toast. Cards and groups stay out, per `Who links` in `docs/ux/SETTINGS.md`.

## 5. PR 4 — the menu

### 5.1 One menu, four levels

The popup body moves out of `SettingGutter` into `SettingNodeMenu`, which owns the `Menu.Root`, the
pointer anchor and the right-click. Each level passes its own trigger, because a row's gear is
absolutely positioned in the gutter and a header's sits inline after the title.

```
SettingNodeMenu          the popup, the anchor, the right-click
|-- SettingGutter        row: gutter gear + the modified bar
|-- SettingGroup         group: gear after the title, drawn on header hover alone
|-- SettingCard          card: the same gear
|   |-- SectionCard      gains one generic `menu` slot
|-- Settings.tsx         tab: right-click on the rail pill, no gear
```

A header gear draws on hover as the row's does, because a group header carries no icon at rest. The
tab takes `onContextMenu` alone, which the browser also raises from Shift+F10 and the Menu key, so
the menu needs no pointer. Eight pills with hover chrome flicker under a moving pointer, and a tab
link is the one minted least often.

### 5.2 What the menu holds

| Level | Items                                                        |
| ----- | ------------------------------------------------------------ |
| Row   | `Reset setting`, the default's label, `Copy ID`, `Copy link` |
| Group | `Reset N changed settings`, `Copy ID`, `Copy link`           |
| Card  | `Copy ID`, `Copy link`                                       |
| Tab   | `Copy ID`, `Copy link`                                       |

A group's reset is disabled while nothing in the band is off default and reads
`Reset changed settings` without a count, as the row's is disabled at its default. A card and a tab
have none. `docs/ux/SETTINGS.md` keeps Appearance as the only card-level reset, and a tab is the
level `Reset all settings, somewhere global` was refused at.

`SettingGroupReset` stays at its threshold of two. The menu is the path for a group with one changed
row, which the button deliberately does not cover.

### 5.3 Copy

| Today                    | With the menu                                                 |
| ------------------------ | ------------------------------------------------------------- |
| `Copy setting ID`        | `Copy ID`                                                     |
| `Copy link to setting`   | `Copy link`                                                   |
| `Copied setting ID`      | `Copied ID of "Launcher flow"`, the id as its description     |
| `Copied link to setting` | `Copied link to "Launcher flow"`, the link as its description |

Why the level leaves the label is `The gutter gear` in `docs/ux/SETTINGS.md`. This copy, the
retired-id toast of 4.3 and the header gear's `Actions for Mod safety` are what PR 4 moves into the
catalog.

## 6. PR 5 — the boundary and the docs

`parse_settings` widens its alphabet to admit `/`, and gains two rules: no leading, trailing or
empty segment, and no value carrying both `.` and `/`. The 128-character cap stands.
`rejects_focus_outside_the_id_alphabet` asserts `a%2Fb` is refused today and flips to the two new
rules. The doc comment on `DeepLinkSettingsRequest.focus` stops saying _setting or group id_ and
says _setting id or UI path_, and the ts-rs binding regenerates with it.

`docs/ux/SETTINGS.md` rewrites `The API` onto the two spaces — `SettingGroup` takes a `path` where
it took an `id` and a `title`, `SettingsSearch` names the helper, `data-ui` gains `SettingCard` —
and the Planned rows move to Available. ADR-0023 and ADR-0024 move to Accepted.

## 7. What does not ship

Nothing in-tree links to a card, group or tab, and none is added. The 16 group ids shipped on
2026-08-25 with zero consumers, and every in-app mint names a row. Why the copy affordance is the
whole feature at those levels is `Who links` in `docs/ux/SETTINGS.md`, which also keeps cards and
groups out of the palette.

Editing `settings.json` by hand is possible after PR 1 and is not a feature this plan adds.
`Open settings.json` is a Proposed row in `docs/ux/SETTINGS.md`.

## 8. The names

An id is the file's key and a link's target, and a rename leaves a retired row, so this table is
reviewed before PR 1. Twenty-nine of the forty-four keep their id.

### 8.1 The nine under `general`

`general` is a bucket rather than a domain, so every id under it moves.

| Today                             | Renamed to                       | Title                                 |
| --------------------------------- | -------------------------------- | ------------------------------------- |
| `general.leaguePath`              | `league.path`                    | Installation path                     |
| `general.launchMode`              | `launch.mode`                    | Launcher flow                         |
| `general.hideRiotClientOnLaunch`  | `launch.hideRiotClient`          | Hide Riot Client on Game start        |
| `general.stopPatcherOnSessionEnd` | `launch.stopPatcherOnSessionEnd` | Stop the patcher when the game ends   |
| `general.autoRun`                 | `startup.autoRun`                | Auto run                              |
| `general.alwaysStartPatcher`      | `startup.alwaysStartPatcher`     | Always start patcher at launch        |
| `general.minimizeToTray`          | `tray.minimize`                  | Minimize to system tray               |
| `general.startInTray`             | `tray.startMinimized`            | Start minimized to tray               |
| `general.startInTrayUnlessUpdate` | `tray.startUnlessUpdate`         | Start in tray unless update available |

### 8.2 Six suffixes that repeat or over-describe the domain

The prefix already names the domain, so a suffix repeating it says nothing, and `Enabled` says less
than the verb.

| Today                               | Renamed to                     |
| ----------------------------------- | ------------------------------ |
| `workshop.workshopPath`             | `workshop.path`                |
| `library.modStoragePath`            | `library.storagePath`          |
| `library.autoCategorizationEnabled` | `library.autoCategorize`       |
| `library.watcherEnabled`            | `library.watchExternalChanges` |
| `hotkeys.reloadModsHotkey`          | `hotkeys.reloadMods`           |
| `hotkeys.killLeagueHotkey`          | `hotkeys.killLeague`           |

### 8.3 Unchanged

`library.trustedDomains`, `workshop.tabOpenMode`, `workshop.searchGame`,
`workshop.forwardLookingMeta`, `hotkeys.killLeagueStopsPatcher`, the twelve `patching.*` and the
twelve `appearance.*`.

The fifteen old ids become `RETIRED` rows with a `replacedBy`. The old file keys become serde
aliases and were never public.

### 8.4 The file keys

The thirty-three the backend stores take their id as their `settings.json` key, `library.trustedDomains`
and `patching.patchTft` included, since today's key is a camelCase name in every case. The eleven in
the two stores keep theirs: `display.*` for the eight appearance rows the store owns, and `layout.*`
for the three workshop rows. `appearance.theme`, `appearance.accentColor`,
`appearance.backdropImage` and `appearance.backdropBlur` are file-stored and rename with the rest.

### 8.5 The UI paths

Every tab, card and group is a node, and a card titled as its tab shares the tab's node. A path is
declared rather than derived: the kebab-case of the title is the convention when one is minted, and a
retitle does not move it.

```
general
|-- general/league
|   |-- general/league/installation
|   |-- general/league/launching
|-- general/startup-and-tray
|   |-- general/startup-and-tray/startup
|   |-- general/startup-and-tray/tray
|-- general/migration                the card titled "Import from cslol-manager"
library                              the tab, and the Library card
|-- library/storage
|-- library/cataloguing
|-- library/installing
workshop
|-- workshop/project-storage
|-- workshop/project-editor
|-- workshop/author-profiles
patching                             the tab, and the Patching card
|-- patching/injector
|-- patching/mod-safety
|-- patching/game-archives
|-- patching/incidents
|-- patching/overlay                 a card, beside the four groups
cache
|-- cache/hashtables
hotkeys                              the tab, and the Hotkeys card
appearance                           the tab, and the Appearance card
|-- appearance/color
|-- appearance/shape-and-scale
|-- appearance/text
|-- appearance/motion
|-- appearance/backdrop
about                                the tab, and the About card
```

## 9. Tests

| What                                                                                           | Where                                                                                |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| An old `settings.json` loads through the aliases, flatten included, and the next save rewrites | inline `#[cfg(test)]` in `src-tauri/src/state.rs`, beside `settings_json_round_trip` |
| Index invariants over the three tables                                                         | `src/modules/settings/__tests__/settingsIndex.test.ts`                               |
| Resolution: a retired id to its replacement, a removed one to the default tab, a stale UI path | same                                                                                 |
| The toast on a resolve through a retired id                                                    | `components/__tests__/SettingFocus.test.tsx`                                         |
| A node renders once, and inside its parent path                                                | new, `src/modules/settings/__tests__/settingNodes.test.tsx`                          |
| A stale UI path marks the surviving ancestor                                                   | `components/__tests__/SettingFocus.test.tsx`                                         |
| The menu copies the id at each level                                                           | new, beside `SettingReset.test.tsx`                                                  |
| `parse_settings` admits `/`, refuses an empty segment and a mixed separator                    | inline `#[cfg(test)]` in `src-tauri/src/deep_link/mod.rs`                            |
