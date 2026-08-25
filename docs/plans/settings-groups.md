# Settings Groups — Implementation Plan

> Status: **shipped** (2026-08-25). Every phase, 1 to 4c.
>
> Design source: `docs/ux/SETTINGS.md` — [The levels](../ux/SETTINGS.md#the-levels),
> [Anatomy](../ux/SETTINGS.md#anatomy), [How a group draws](../ux/SETTINGS.md#how-a-group-draws),
> [Defaults and reset](../ux/SETTINGS.md#defaults-and-reset), [Anchors](../ux/SETTINGS.md#anchors),
> [Migration](../ux/SETTINGS.md#migration). The design document carries every decision below, so the
> two agree from the first commit.
>
> Feature rows this closes: **The group**, **Group ids**, **`get_default_settings`**,
> **The gutter gear**, **The modified bar**, **The group reset**, **The tab in the URL**,
> **The focus anchor**, **The setting index**, **The public setting id**, **Copy setting ID**,
> **Settings in the palette**, **`ltk://settings`**, **`DS-SETTING-LEVEL`**,
> **`DS-SETTING-GUTTER`**.
>
> Phase 4 was redesigned on 2026-08-25 against the VS Code settings editor, and split into
> 4a, 4b and 4c. The revert marker never shipped - a gutter gear took its place, because a
> control that only exists while a row is off default cannot carry a copy action.

Decided in review on 2026-08-25, past what the design document had settled:

- **The collapsible group is deferred whole.** No card in the migration folds, so `collapsible`,
  `defaultOpen`, the `settings` declaration, the `settingsLayout` store, the caret and the changed
  dot all wait for the first group that needs them
- **The card reset stays on Appearance alone.** Patching's four group resets already cover its card
- **`League of Legends` takes groups**, against the count test, because it already draws a rule by
  hand and the group is the label that rule does not carry
- **`Blur` is a dependent row**, not a `Backdrop` peer, and resetting the image clears it
- **General goes single-column.** `SettingsGrid` survives for the Workshop tab alone
- **`SettingKey` takes a third namespace**, `layout.*`, so the Project editor's rows are markable
- **The phases reorder** to group, keys, anchor, reset, so nothing ships before something reads it
- **Four branches, four PRs**, and the release goes out when the anchor lands

## 1. Current state (verified 2026-08-25)

| Piece                | Where                                                     | Shape today                                                                   |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The tab rail         | `src/pages/Settings.tsx`                                  | `Tabs.Root defaultValue="general"`, uncontrolled. `TABS` is local to the page |
| The route            | `src/routes/settings.tsx`                                 | `validateSearch` returns `firstRun` alone                                     |
| The card             | `src/components/SectionCard.tsx`                          | Heading on the ground, `p-5` panel. The panel takes its children raw          |
| The row              | `src/modules/settings/components/SettingRow.tsx`          | Title, description, hint, control. Two kinds, two layouts. Reads no setting   |
| The grid             | `src/modules/settings/components/SettingsGrid.tsx`        | `lg:grid-cols-2`, with `lg:col-span-2` for a wide card                        |
| The cluster rule     | `Separator className="my-0"` in five sections             | Patching, Library, Appearance, League, Project editor. What a group replaces  |
| Hand-rolled rows     | `MinimizeToTraySection`, `LeagueSection`, `HotkeySection` | A `<label>` around two `<span>`s, which is `SettingRow` written out again     |
| The dependent row    | `MinimizeToTraySection`                                   | `border-l-2 border-surface-700 pl-4`, rendered conditionally, no component    |
| The backend defaults | `src-tauri/src/state.rs`                                  | `Settings::default()`, with `Config::default()` flattened into it             |
| The display defaults | `src/stores/displayStore.ts`                              | `APPEARANCE_DEFAULTS`, module-private. `useIsAppearanceDefault` reads it      |
| The card reset       | `AppearanceSection/ResetAppearanceButton.tsx`             | Four `Settings` fields compared by hand, beside `useIsAppearanceDefault`      |
| The sub-header       | `src/components/FilterSection.tsx`                        | `text-xs font-medium tracking-wide text-surface-400 uppercase`, the one style |
| A toast that acts    | `src/components/Toast.tsx`                                | `toast({ action: { label, onClick } })` already draws a trailing button       |
| Collapsible          | `@base-ui/react/collapsible`                              | Shipped at 1.2.0, unused. What the deferred phase would wrap                  |

Facts that shape the plan:

- `Settings` flattens `Config`, and ts-rs flattens with it, so the generated `Settings` binding is
  one flat object. `keyof Settings` names `patchTft` and `theme` alike, and `SettingKey` needs no
  second namespace for the backend half
- Exactly **two** rows pass a non-string title: `Patch TFT files`, for a `TftIcon`, and
  `Watch for external changes`, for an `ExperimentalChip`. Narrowing `title` to a string costs two
  call-site edits and deletes a fallback that would otherwise live forever
- Every `SectionCard` call site passes one wrapper element as its child, so giving the panel a
  layout of its own changes nothing for the four cards outside settings
- `LeagueSection` already draws a `Separator` between its path and its launcher rows, so the card
  the document exempts from grouping is a card that has been grouped by hand since it was written
- `BackdropImagePicker` draws two `SettingRow`s, and the second renders only under
  `{settings.backdropImage && ...}`, which is the document's own definition of a dependent row
- `ProjectEditorSection`'s three rows read `workshopLayout`, a store that mixes preferences with
  geometry. Only `tabOpenMode`, `searchGame` and `forwardLookingMeta` are settings
- `Tabs.Panel` defaults to `keepMounted: false`, so an inactive tab's rows are not in the DOM. A
  focus target therefore mounts _after_ its tab is selected, which is what lets a row mark itself
  rather than be found by a query from the page
- `AccentColor` is the one setting whose default is not equality. `preset: null` and
  `preset: "ltk"` are the same choice, and `useTheme` and `ResetAppearanceButton` both read it so

## 2. Phase 1 — the group

Branch `settings-groups`. Ships the level and the five cards that need it. Nothing about keys,
anchors or resets.

### 2.1 `SettingGroup`

New, at `src/modules/settings/components/SettingGroup.tsx`, exported through the module barrel. It
is settings-specific, so it stays out of `@/components`.

```tsx
export function SettingGroup({
  id,
  title,
  description,
  hint,
  badge,
  action,
  children,
}: SettingGroupProps) {
  const headingId = `setting-group-${id}`;

  return (
    <section
      data-ui="SettingGroup"
      role="group"
      aria-labelledby={headingId}
      /* DS-GAP: only the rule's own offset is padding, since a border needs a distance a gap cannot give. */
      className="flex flex-col gap-3 border-t border-surface-700/40 pt-4 first:border-t-0 first:pt-0"
    >
      <div
        data-ui="SettingGroup:header"
        className="flex items-center justify-between gap-2 select-none"
      >
        <div className="min-w-0">
          <h4
            id={headingId}
            className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-surface-400 uppercase"
          >
            {title}
            {hint && <HintIcon content={hint} />}
            {badge}
          </h4>
          {description && <p className="mt-0.5 text-xs text-surface-400">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
```

Two deviations from the letter of the document, both small:

- The description sits **inside** the header block, under the `h4`, the way `SectionCard` draws its
  own. Written as a sibling it would take the group's `gap-3` and read as a first row
- The root carries the group's `gap-3` rather than a separate body element. One element fewer, and
  the spacing table still holds, because the header block is a single flex item

The `id` is read by nothing until phase 3. It ships now, because a card migrated without ids is a
card migrated twice.

### 2.2 The card owns its panel's layout

`SectionCard` gains `flex flex-col gap-4` on its panel. Every settings card drops the
`<div className="flex flex-col gap-3">` it writes by hand, and the two that write `space-y-*` lose a
`DS-GAP` violation with it. The four cards outside settings each pass a single wrapper child, so
none of them moves.

`SettingRows` joins `SettingGroup` in the same directory: `flex flex-col gap-3` and nothing else. A
card is then either one `SettingRows` or a list of `SettingGroup`, which is what makes _once a card
has one group, every row in it is in a group_ visible in the source rather than only in the
document.

### 2.3 `SettingRow` grows an anatomy and loses its fragments

```tsx
title: string;
/** A glyph before the title, for a row about one part of the game. */
icon?: ReactNode;
/** A chip after the title. `ExperimentalChip` and its kind. */
badge?: ReactNode;
/** A dependent row its parent has turned off. It stays mounted and draws nothing. */
hidden?: boolean;
```

`title` narrowing to a string is what lets the revert marker name its own row in phase 4. The two
rows that pass a fragment today move their `TftIcon` and their `ExperimentalChip` onto the new
props.

`hidden` moves the conditional from the call site into the row. A dependent row that mounts is a
row that can register its key in phase 4 and can be found by an anchor in phase 3 — the group
around it knows it exists even while the reader cannot see it. It draws nothing at all rather than
drawing disabled, per the document's rule.

### 2.4 The rows that are not rows yet

`MinimizeToTraySection`, `LeagueSection` and `HotkeySection` draw rows out of a `<label>` and two
`<span>`s. They convert to `SettingRow` before they can hold a group, a marker or an anchor. The
dependent rows move to the divider rung, `border-l-2 border-surface-600 pl-4`, and to `hidden`.

### 2.5 The migration, card by card

| Card              | Groups                                         | Also                                                              |
| ----------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Patching          | Injector, Mod safety, Game archives, Incidents | Merges `Safety & Integrity` in. `SettingsGrid` leaves the tab     |
| Appearance        | Color, Shape and scale, Text, Motion, Backdrop | `Blur` becomes a dependent row of `Background image`              |
| Library           | Storage, Cataloguing, Installing               | Replaces two `Separator`s that carry no label                     |
| Startup and tray  | Startup, Tray                                  | Renamed from `System Tray & Autostart`                            |
| League of Legends | Installation, Launching                        | Replaces the `Separator` it draws today                           |
| Overlay           | None                                           | Three rows, passes the move test. The card the level leaves alone |

`Installation` is one row, and legal, because a path field is a stacked editor. `Launching` holds
the launcher-flow radio block, `Hide Riot Client on Game start` and
`Stop the patcher when the game ends`.

Patching loses `SettingsGrid`, because both of its remaining cards are full width. General loses it
too: `Startup and tray` runs full width once it has groups, which leaves `Import` alone in a half
column, so the tab goes single-column and `Import` runs wide with the rest. Workshop keeps the grid.

The alert boxes move with the rows that raised them: the elevation warning into `Injector`, the
scripts and skinhack warnings into `Mod safety`.

### 2.6 Copy

- `Safety & Integrity` disappears into Patching's groups
- `System Tray & Autostart` becomes `Startup and tray`
- `Author Profiles` becomes `Author profiles`, `Project Storage` becomes `Project storage`,
  `Storage Location` becomes `Storage location`, and `Installation Path` becomes `Installation path`
- `Keep incidents` keeps its description, with `indicents` spelled right

### 2.7 `DS-SETTING-LEVEL`

Added to `.claude/skills/design-system/SKILL.md`: the rule-code table gains a row, and a section
below it carries the group's five utilities and the one sentence that separates a group from a card.
The code exists so a component can cite it rather than reproduce the reasoning.

## 3. Phase 2 — the keys

Branch `settings-keys`. No visible change, and no context. Every row gains the two pieces of data
the anchor and the marker read.

```tsx
/** A setting the backend stores, one the display store owns, or one the workshop layout owns. */
type SettingKey = keyof Settings | `display.${AppearanceKey}` | `layout.${ProjectEditorKey}`;
```

`displayStore` exports `APPEARANCE_DEFAULTS` and `AppearanceKey`. `workshopLayout` gains a
`PROJECT_EDITOR_DEFAULTS` subset carved out the same way, holding `tabOpenMode`, `searchGame` and
`forwardLookingMeta` and nothing else — the store's geometry is not a setting, and a key exists only
where a row exists.

`SettingRow` gains:

```tsx
/** The setting this row reads. It is also the row's anchor id and its reset scope. */
setting?: SettingKey;
```

Optional, because an action row reads no setting. Every row the phase-1 cards touch gains one, and
nothing reads it yet.

This phase also shipped a `defaultLabel` prop beside it, which **4a deleted**. The label is derived
from the real default now, so the answer to _is this row ever reset?_ moved to the absence of an
entry in `SETTING_FORMAT` - one table rather than forty-five props.

## 4. Phase 3 — the anchor

Branch `settings-anchor`. The release goes out from here.

### 4.1 The search params

`SETTINGS_TABS` and `type SettingsTab` move to `src/modules/settings/tabs.ts`, so the route can
validate against them without pulling the icons in.

```tsx
interface SettingsSearch {
  firstRun?: boolean;
  tab?: SettingsTab;
  focus?: string;
}
```

An unknown `tab` falls back to `general`. `focus` is a plain string, and an unknown one selects the
tab and does nothing else. `Tabs.Root` moves from `defaultValue` to `value` with `onValueChange`,
written back through `navigate({ search, replace: true })`.

### 4.2 What focus does

A `SettingFocusContext` carries the current `focus` value down the active panel. `SettingGroup` and
`SettingRow` compare it against their own id or `setting` key, and the one that matches marks itself
on mount. Because an inactive panel is unmounted, _select the tab first_ is not a step the code
takes — the target does not exist until its tab is active.

The match:

1. Scrolls itself into view with `block: "start"`
2. Takes `tabIndex={-1}` and focus, with `preventScroll`, so a keyboard reader lands on the group
   header or the row and never on the control inside it
3. Draws `rounded-lg ring-2 ring-accent-500/40 ring-offset-4 ring-offset-surface-900` for two
   seconds, then fades
4. Clears `focus` from the URL with `replace: true`

A row that is `hidden` does not mark itself. The group around it claims the focus instead and marks
its own header, so `?focus=startInTrayUnlessUpdate` with `Auto run` off lands the reader on
`Startup`, looking at the toggle that gates what they came for. The group can do this because a
hidden row still mounts, so the group still knows the key is one of its own.

`useReducedMotion()` returns step 1 to an instant scroll, and step 3 to a mark that holds for two
seconds and then disappears.

### 4.3 Who links

| From                                         | Today       | After                              |
| -------------------------------------------- | ----------- | ---------------------------------- |
| `workshop/components/EmptyStates.tsx`        | `/settings` | `?tab=workshop&focus=workshopPath` |
| `workshop/gameBrowser/GameBrowserStates.tsx` | `/settings` | `?tab=general&focus=leaguePath`    |
| `workshop/palette/useGlobalCommands.tsx`     | `/settings` | Unchanged, it means the whole page |
| `shell/components/TitleBar.tsx`, `Ctrl+,`    | `/settings` | Unchanged, the same reason         |
| `routes/__root.tsx`, first run               | `?firstRun` | Unchanged                          |

First run keeps its welcome banner and takes no `focus`. The banner already says to configure the
path below, and a ring that fades after two seconds adds nothing to a sentence that explains
auto-detection.

The document's remaining link, a patcher failure pointing at the injector, has no call site in the
app today — §7.

## 5. Phase 4a — the defaults, the gear and the resets

Branch `settings-reset`. Shipped.

### 5.1 The command

```rust
/// The settings a fresh install starts with.
#[tauri::command]
pub fn get_default_settings() -> IpcResult<Settings> {
    IpcResult::ok(Settings::default())
}
```

In `src-tauri/src/commands/settings.rs`, registered in `main.rs` under `// Settings`. It returns
the existing `Settings` type, so `pnpm generate:types` produces no new binding. The `get_` prefix is
against C-GETTER and stays, because `get_settings` is its neighbour.

`useSettingDefaults` puts it behind one query keyed `settingsKeys.defaults()` with
`staleTime: Infinity` and `gcTime: Infinity`. A fresh install's values do not change while the app
runs, so this is a fetch-once table rather than a cache.

### 5.2 One place that knows what a default is

`settingDefaults.ts` holds four things and nothing else reads a default without it:

| Export             | Does                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `settingValue`     | Reads a key from whichever of the three stores owns it                |
| `normalizeSetting` | Folds `accentColor`, the one value whose default is not equality      |
| `isSettingDefault` | Compares a current value against a fresh one, normalized              |
| `settingFormat`    | How a key's default reads, and whether the key can be put back at all |

`SETTING_FORMAT` is a `Partial<Record<SettingKey, ...>>`, and **the absence of an entry is the
mechanism**. Forty of the forty-five keyed rows have one. The five that do not - both paths, the
workshop path, the WAD blocklist and the trusted providers - are addressable and never reset,
without a second flag anywhere.

The formats are generic rather than per-row: `onOff`, `percent`, `titleCase`, `optional("None", …)`
and two face-label lookups. A label derived from the real default cannot disagree with it, which is
what the hand-written `defaultLabel` from phase 2 could. That prop is deleted.

### 5.3 The scope

`SettingScope` collects the keys of the rows below it. It is two contexts rather than one: a
`register` function whose identity never changes, and the map it writes into. One context would
re-run every row's registration effect on every registration and never settle.

Scopes nest, so a row inside a group inside a card registers with both. `SettingGroup` renders one
around itself. `AppearanceSection` wraps its whole `SectionCard`, which puts `ResetAppearanceButton`
inside the provider by tree position even though it draws in the header.

`useWriteSettings` reads the current settings **from the query cache at call time** rather than at
render, because `Undo` runs against whatever is current when it is clicked. Backend keys go in one
save, so resetting eight rows is one write rather than eight.

### 5.4 The gear

`SettingGutter` wraps one row and owns the whole gutter concern: the gear, the modified bar, and the
menu behind both. In 4a a row whose key had no format rendered the wrapper and nothing in it - 4b
moved the gear onto every addressable row, and left the bar where it is.

The menu is one controlled `Menu.Root` rather than a `ContextMenu`. The gear is its trigger, and a
right-click on the row opens the same popup against a virtual anchor at the pointer. `ContextMenu`
would have given two popups to keep in step for one item list.

The gear is `tabIndex={-1}` and `opacity-0` until `group-hover/setting`, `group-focus-within` or
`data-[popup-open]`.

### 5.5 The three resets

| Level | Control                                  | Appears                     |
| ----- | ---------------------------------------- | --------------------------- |
| Row   | `Reset setting` in the gear's menu       | Disabled while at default   |
| Group | A ghost icon button at the header's edge | Two or more changed rows    |
| Card  | `ResetAppearanceButton`, unchanged copy  | Always, disabled at default |

The group and card resets raise a toast whose `Undo` applies a patch of the keys the reset wrote.
`ResetAppearanceButton` loses its hand-written comparison and its two props, so the card and the
groups inside it read one definition of a default.

Resetting `Background image` writes `backdropImage` and `backdropBlur` in the same save, through a
`PAIRED` table with one entry.

## 6. Phase 4b — the index and the identity

Branch `settings-index`. Shipped.

### 6.1 The table

`settingsIndex.ts` holds one entry per addressable row - the public id, the `SettingKey` it reads
and the title - and the four lookups over it: `settingEntry` by key, `settingById` by id or retired
alias, `settingFocusTab` for what a `?focus=` value opens, and `SETTINGS_INDEX` itself for the
palette.

Forty-five entries, in the order a reader walks the tabs and then the cards inside them, so the
table reads as the surface it describes.

The literal array stays private and the module exports two types off it, `SettingId` and
`IndexedSettingKey`. That second one is what makes the table closed: `SettingRow`'s `setting` prop
is typed as the index's own key union, so a row cannot declare a key the table has no entry for and
`settingEntry` needs no fallback.

### 6.2 The id, and the namespace

`general.autoRun`, `appearance.theme`. The namespace is the tab, and it is the working part rather
than decoration - it answers which panel holds the target before that panel has mounted, which is
what lets one param carry both halves of a link.

Group ids are namespaced with them, `patching.mod-safety`, so `?focus=` has one id space and one
resolution rule: look the value up in the index, and failing that read the tab off whatever sits
before the first dot. An unknown suffix opens its tab and marks nothing. An unknown namespace falls
back to General.

`SettingFocusProvider` writes that tab into the URL in the same `replace` that clears `focus`, so
the page is never left reading a cleared param for the tab it should be showing.

### 6.3 The title

The 45 rows dropped their `title` prop. `SettingRow`'s props became a union: a row reads a setting
and takes its title from the index, or it names itself and reads none. Both, or neither, is a type
error.

It is the same argument as 4a's `defaultLabel`. A name written beside the row is a second copy of a
name something else already reads, and the copy is what goes stale when the row is reworded.

### 6.4 Copy setting ID

Second item of the gear's menu, over `useCopyToClipboard`. With it, the gear moved to **every row
the index carries** rather than only the ones that can be reset - an id is worth copying either way,
and the paths and the lists are exactly the rows someone links a teammate to. On those, the menu is
`Copy setting ID` alone, and `Reset setting` is absent rather than disabled.

The index also gave the gear an accessible name that names its row, `Actions for Auto run`, which
the accessibility section had asked for since the design was written.

### 6.5 Settings in the palette

A palette source of its own, `settings`, rather than more commands. `usePaletteSearch` already
draws a source only when a term has been typed unless `listingSources` names it, and `settings` is
not one of those - which is exactly "matched only against a non-empty query" expressed in the
machinery that was already there. Rows carry the tab as their path and the public id as a keyword,
and choosing one navigates with the id alone.

`SETTINGS_TAB_LABELS` moved from `Settings.tsx` into `tabs.ts` for it, because the page held the
only table of tab labels and a palette row needs one.

## 7. Phase 4c — the deep link

Shipped on `settings-reset`, beside 4a and 4b.

### 7.1 The route

`parse_deep_link_url` returned a `DeepLinkInstallRequest` and checked that the action was
`install`. It returns `DeepLinkRequest` now, an enum matched on the action, and the install body
moved into `parse_install` unchanged. A fourth route is an arm rather than a rewrite.

The scheme check, the rate limiter and the unknown-action error were already there and are shared.
`handle_single` matches the enum, runs the trusted-domain check on the install arm alone - moved
out into `allow_install`, which the doc names for the block event it raises - and hands either
route to the same delivery.

### 7.2 What `focus` may be

Letters, digits, `.`, `-` and `_`, 1 to `FOCUS_MAX_CHARS` characters. The backend does not know the
index and does not need to: what it is guarding is that the value it hands the frontend goes back
into a URL. An id that clears this and resolves to nothing opens the tab its namespace names and
marks nothing, which is already what `settingFocusTab` does for a link minted against an older
build.

### 7.3 The cold start

The window is created hidden and `setup` runs before its script does, so a URL the app was launched
with reached `app_handle.emit` while nothing was listening. `ltk://install` had been losing a cold
start's link this way.

`DeepLinkState` gained a `Handoff`: a link arriving while the frontend is not listening is held,
and `take_pending_deep_link` drains it. Both sit under the one mutex, so a link cannot fall between
the check and the send. The frontend asks once, from `useDeepLinkListener`'s own effect, and the
answer is `None` from then on.

`handle_argv`'s show, unminimize and focus became `raise_main_window`, and delivery raises the
window - at delivery rather than at arrival, so a cold start does not flash an unpainted window
while React boots.

### 7.4 Copy link to setting

`settingLink(id)` in `settingsIndex.ts`, and a second `Menu.Item` under `Copy setting ID`. The
scheme is a constant there rather than in the component, next to the id it addresses.

## 8. Tests

`vitest`, beside the module, following `AppearanceSection/__tests__/ZoomLevelPicker.test.tsx`.

| Test                   | Asserts                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `SettingGroup`         | The heading is an `h4` the section is labelled by, and the first group draws no rule      |
| `SettingRow` hidden    | A hidden row mounts, registers, and renders nothing                                       |
| `validateSearch`       | An unknown tab falls back to `general`, and `focus` survives as a string                  |
| Focus, mounted         | The matching row takes focus, and the param is cleared                                    |
| Focus, hidden          | The enclosing group's header is marked instead                                            |
| The gear's absence     | No gear on a row whose key has no format, so a path is never offered a reset              |
| The gear's reset       | Enabled off default, `data-disabled` at it, and one save when clicked                     |
| The default's label    | `Default: Off` under the item, derived rather than written beside the row                 |
| Group reset visibility | Hidden at one changed row, drawn at two, and it counts them in its own label              |
| Group reset write      | Every changed row in a single `save_settings`                                             |
| Undo                   | Applies only the keys the reset wrote                                                     |
| `isSettingDefault`     | An unset accent preset reads as the brand preset, and a list compares by its order        |
| `settingFormat`        | No entry for the five keys that hold a reader's own data                                  |
| The index              | Every id namespaced by a real tab, and each id and key carried once                       |
| `settingEntry`         | A key reads back as the row that declared it, id and title together                       |
| `settingById`          | A public id resolves, and a bare `SettingKey` does not                                    |
| `settingFocusTab`      | A setting id, a group id nothing else resolves, and junk falling back to General          |
| Focus, the tab         | The one navigate carries the namespace's tab, for a known id and for an unknown one       |
| The gear's reach       | One on every addressable row, and no `Reset setting` on a row holding a reader's own data |
| `Copy setting ID`      | The public id reaches the clipboard, rather than the key the row reads                    |
| The palette source     | Absent from a resting listing, answering a typed query, and matching on the id            |
| A row with no key      | Names itself, because the index has nothing to say about an action                        |
| The settings route     | A setting id and a group id both parse, and unknown params are ignored                    |
| `focus` validation     | Missing, empty, outside the id alphabet and over the limit each rejected                  |
| The hand-off           | A held link is returned once, and taking it marks the frontend listening                  |
| `settingLink`          | The public id addressed as `ltk://settings?focus=`, for a setting and a group             |
| `Copy link to setting` | The link reaches the clipboard, beside the id the item above it copies                    |

## 9. What is left

| Item                     | Why it waits                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The collapsible group    | No card in the migration folds. `SettingRow.hidden` is the same mechanism a collapsed group would need, so the document's fourth open question has a shape already                                          |
| `settingsLayout`         | The store exists only to persist a collapsed state, so it lands with the collapse                                                                                                                           |
| The changed dot          | It is drawn on a collapsed header alone                                                                                                                                                                     |
| The group action slot    | No group needs one yet. The prop ships, unused, because the header's ordering rule is written around it                                                                                                     |
| The patcher-failure link | The document names a call site the app does not have. Either a new link on the injection failure path, or the row means the elevation hint already there. `?focus=patching.injector` is what it would carry |
| A settings search box    | The palette carries the query. An on-page filter waits for a row list something can filter                                                                                                                  |
| The gear's tooltip       | The id exists now, and the menu one click away already says it. Nesting `Tooltip`'s render into `Menu.Trigger` is untested here, and it buys a hover label that repeats the popup                           |
| Undo on a row reset      | The group and card resets raise one. A single row's way back is the control the reader just used                                                                                                            |

## 10. Order of work

| Phase | Branch            | State   | Ships                                                                                                    |
| ----- | ----------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| 1     | `settings-groups` | Shipped | `SettingGroup`, `SettingRows`, the card's layout, the row's anatomy, six cards, copy, `DS-SETTING-LEVEL` |
| 2     | `settings-groups` | Shipped | `SettingKey`, `PROJECT_EDITOR_DEFAULTS`, and `setting` on every row                                      |
| 3     | `settings-groups` | Shipped | `tab` and `focus`, the controlled rail, the self-marking target, two link call sites                     |
| 4a    | `settings-reset`  | Shipped | `get_default_settings`, `settingDefaults`, `SettingScope`, the gear, the bar, three resets, Undo         |
| 4b    | `settings-reset`  | Shipped | The index, the public id, the namespaced group ids, `Copy setting ID`, the palette source                |
| 4c    | `settings-reset`  | Shipped | `parse_deep_link_url` routing, the cold-start hand-off, and `Copy link to setting`                       |

Phases 1 to 3 landed on one branch rather than three, because phase 2 has no visible change of its
own and phase 3 is what makes phase 1's ids do anything. 4a and 4b then landed on `settings-reset`
beside them, and 4c after them: the split into branches assumed 1 to 3 had already been committed
and released, and they had not, so a second branch would have carried the first one's diff. The release note is
one change - the tabs read better, a link lands where it points, and a row says whether it is off
its default and how to put it back.

### What was built differently

| Where               | The plan said                  | What shipped, and why                                                                                                                                                         |
| ------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SettingsSearch`    | `tab` validated to `general`   | `tab` is optional and the page resolves the default. A required search param makes `search` required on every `<Link to="/settings">`, and three of those mean the whole page |
| Clearing `focus`    | Step 4, after the mark         | Read once into provider state and cleared straight away. A `requested` ref keeps the cleared param from re-arming the target                                                  |
| The hidden-row jump | Reads phase 4's registration   | `SettingGroup` publishes its id on a context, and a hidden row hands its mark to that id. It needs nothing from the reset scope                                               |
| The row's anatomy   | `icon`, `badge`, `hidden`      | Plus `dependent`, because a visible dependent row still draws the rail the hidden one is hiding behind                                                                        |
| The path fields     | Left holding their own `label` | Moved inside a stacked `SettingRow` with `aria-label`, so the row owns the title, the anchor and the key                                                                      |
| `MinimizeToTray`    | A renamed card                 | The file and the component were renamed to `StartupAndTraySection` too, because the old name describes one of its five rows                                                   |
| The test setup      | Nothing                        | `src/test/mocks/matchMedia.ts`, because jsdom has none and every row that can be marked reads the motion preference                                                           |

Phase 4a added its own, against the design as it stood after the VS Code review:

| Where                    | The design said            | What shipped, and why                                                                                                                                         |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The gutter               | The panel grows to `pl-11` | `pl-7` on the group's header and body instead, so the rule above a group still spans the panel rather than starting 28px in                                   |
| The menu                 | `ContextMenu` for the row  | One controlled `Menu.Root` with a virtual anchor at the pointer. `ContextMenu` would be two popups to keep in step for one item list                          |
| `defaultLabel`           | A prop per row             | A `SETTING_FORMAT` table keyed by `SettingKey`. Forty-five call sites keep their JSX, and one table goes stale where 45 props each can                        |
| The gear's tooltip       | Two lines over the gear    | Dropped. Without the public id there is nothing to say that the menu does not, and nesting `Tooltip`'s `render` inside `Menu.Trigger` buys a risk for nothing |
| `useIsAppearanceDefault` | Untouched                  | Deleted. It was the second definition of "is default" that this phase exists to remove, and nothing read it once the card reset used the scope                |
| The test setup           | Nothing                    | `__tests__/fixtures.tsx`, because a gear that cannot reach `get_default_settings` correctly draws nothing, which is right in the app and useless in a test    |

Phase 4b added its own:

| Where                 | The plan said                   | What shipped, and why                                                                                                                                                                           |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The gear's reach      | 4a's rule, resettable rows only | Every row the index carries. An id is worth copying either way, and the paths and the lists are exactly the rows someone links a teammate to                                                    |
| Group ids             | Untouched                       | Namespaced too, `patching.mod-safety`. Leaving them bare would have given `?focus=` two id spaces with two rules, which is the drift the phase exists to remove                                 |
| The entry             | Id, key, tab and title          | No `tab` field. The tab is the id's namespace, so a column beside it is a second place for the same fact to be wrong                                                                            |
| `SettingRow`          | `title` dropped from 45 rows    | Its props became a union, and `setting` is typed as the index's own key union. A key the table has no entry for is now a type error rather than a row with no name                              |
| The two links         | `?tab=…&focus=…`                | `?focus=` alone. Carrying the tab beside an id that spells it is the redundancy the namespace was for                                                                                           |
| The palette           | Settings enter `CommandPalette` | A source of its own. `usePaletteSearch` already draws a source only under a typed term unless `listingSources` names it, which is the requirement expressed in machinery that was already there |
| `SETTINGS_TAB_LABELS` | Nothing                         | Moved out of `Settings.tsx` into `tabs.ts`, because the page held the only table of tab labels and a palette row needs one                                                                      |
| The gear's name       | `Setting actions`               | `Actions for Auto run`. The index is what made it possible, and the accessibility section had asked for it since the design was written                                                         |
| The gear's tooltip    | Waiting on the id               | Still absent. The id arrived and the reason changed: the menu one click away already says it                                                                                                    |

Phase 4c added its own:

| Where             | The plan said       | What shipped, and why                                                                                                                                             |
| ----------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The cold start    | Nothing             | A hand-off in `DeepLinkState`. A URL the app is launched with arrives before the window's script runs, so a link followed while the app was closed reached nobody |
| `ltk://install`   | Untouched           | It was losing a cold start's link the same way, and the hand-off is not per route. Delivery for a running app is unchanged                                        |
| The window raise  | `handle_argv` alone | `raise_main_window`, called at delivery. At arrival a cold start would show an unpainted window for as long as React takes to boot                                |
| `DeepLinkRequest` | Rust-internal       | Serialized too, because the held link is returned by a command rather than emitted. Internally tagged, so the event payloads keep the shape the frontend reads    |

Tracked as a single `area: frontend`, `type: ux` issue in `LeagueToolkit/ltk-manager`, linking this
plan and the design document, with a four-item checklist each PR ticks.

Each phase updates `docs/ux/SETTINGS.md`: the feature row moves to **Available**, and the change
table takes a row at the top.

Verification per phase is `pnpm typecheck && pnpm lint && pnpm test`, plus `cargo fmt`,
`cargo clippy --all-targets` and `pnpm generate:types` for phase 4. `pnpm format:check` reports
false failures on this working tree over CRLF, so the formatting answer to trust is git's.
