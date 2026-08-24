# Settings

## Changes

| Date       | Change                                                              |
| ---------- | ------------------------------------------------------------------- |
| 2026-08-24 | Decide the defaults source, the scoped reset and the setting anchor |
| 2026-08-24 | Propose the group, the level between a section card and a row       |

Each edit of this document adds a row at the top. The table keeps the last ten rows.

Settings is the tabbed surface where a user configures LTK Manager. A tab holds cards, a card
holds rows, and a row is one setting. There is no level between a card and a row, so a card that
holds two ideas has two ways out today, and both are bad. It splits into a second card, and the
subject now lives in two panels. Or it does not split, and the reader gets a wall of unrelated
switches.

The Patching tab shows both failures at once. `Safety & Integrity` is one panel that holds mod
checks, archive scanning and incident retention, which are three separate ideas under a title that
names none of them. Beside it sits `Patching`, a panel with three rows, kept apart only because
the other panel was full. Appearance shows the same shape without the split: eleven rows in one
list, where color, type, motion and the backdrop each read as a run of rows the reader has to find
by eye.

This document proposes the **group**: a labelled band of rows inside a card, which costs one line
of chrome and no new surface.

Two more features follow from that level, and neither works well without it. A reader who can see a
facet can also see what they changed inside it, so a row that differs from a fresh install says so
and offers the way back, and each level resets its own scope. And a facet with a name can be
pointed at, so any group or row becomes something the rest of the app can link to.

## Goals

- A card holds one subject, however many facets that subject has
- A reader finds a setting by the facet that holds it, and not by reading every row
- A new setting joins a group, and never forces a new card
- The level a setting sits at is a rule, and not a reaction to a full panel
- One sub-header style in the app, and not a second one that only settings uses
- A reader sees what they changed, and puts it back at the level they are looking at
- Anything in settings can be linked to, and the link outlives every rewrite of the label

## Scope

In scope is the settings surface: how a tab lays out its cards, how a card lays out its rows, the
new level between them, what a reader can see and undo at each level, and how a link addresses one
of them.

Out of scope:

- A settings search box. A group is what would give a result its second breadcrumb, and the anchor
  is how a result would navigate, so this document names the ids a search needs, and stops
- The wording of any individual setting. `src/CLAUDE.md` owns the copy rules, and this document
  adds only the rules for a group's own title
- The cache tab's table, the hotkey capture control and the about tab. None of them is a row list
- Reordering settings across tabs
- A reset for the whole application. Every scope here is a level the reader is already looking at,
  and `Reset all settings` is not one of them
- An external `ltk://` link into settings. The anchor is internal navigation, and a protocol link
  that opens a settings page needs its own trust rules first

## Feature status

A status word has one meaning.

- **Available** - the feature is in the application today
- **Planned** - the team agreed on the feature, and work did not start
- **Proposed** - an idea for review, and not a decision

| Feature                | Status    | Note                                                           |
| ---------------------- | --------- | -------------------------------------------------------------- |
| The tab rail           | Available | Eight tabs, `Tabs.List variant="pills"` in `Settings.tsx`      |
| The section card       | Available | `SectionCard`. Heading on the ground, panel under it           |
| The two-column grid    | Available | `SettingsGrid`, with `lg:col-span-2` for a wide card           |
| The setting row        | Available | `SettingRow`, inline and stacked, toggle and action            |
| The cluster separator  | Available | Ad-hoc `Separator` inside four cards. What a group replaces    |
| The dependent row      | Available | Ad-hoc left rail in `MinimizeToTraySection`, no component      |
| The defaults           | Available | `Settings::default()` in Rust, `APPEARANCE_DEFAULTS` in front  |
| The card reset         | Available | `ResetAppearanceButton`, on one card, with its own comparison  |
| `get_default_settings` | Planned   | The command that puts the Rust defaults on the frontend        |
| The revert marker      | Planned   | On a row whose value differs from a fresh install              |
| The group reset        | Planned   | On a group with two or more changed rows. Ships with the group |
| The tab in the URL     | Planned   | `?tab=`, which `Settings.tsx` does not read or write today     |
| The focus anchor       | Planned   | `?focus=`, addressing one group or one row                     |
| The group              | Proposed  | This document                                                  |
| The collapsible group  | Proposed  | For a group a first-run reader can ignore                      |
| The group action slot  | Proposed  | One control for one group, at the header's trailing edge       |
| Group ids              | Proposed  | The collapsed-state store, the anchor, and a future search     |
| `DS-SETTING-LEVEL`     | Proposed  | The design-system code, added when the group ships             |

The five planned rows were decided in review on 2026-08-24. The group itself is still proposed, and
the group reset is the one planned feature that cannot land before it.

## The levels

| Level         | Names                                     | Draws as                                           | Example                               |
| ------------- | ----------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| Tab           | A part of the app the user owns           | A pill in the settings rail                        | Patching                              |
| Card          | A subject                                 | A heading on the page ground, and a panel under it | Overlay                               |
| Group         | A facet of that subject                   | An uppercase label over a band of rows             | Mod safety                            |
| Row           | One setting                               | A label, and its control across from it            | Patch TFT files                       |
| Dependent row | A setting only its parent's state reaches | An indented row under the row that gates it        | Start in tray unless update available |

A group is not a card without a box, and it is not a row with children. It is the level that says
_these rows answer the same question_, which the separators inside `LibrarySection` and
`AppearanceSection` already say today without saying what the question is.

## Which level a setting belongs to

Three tests, in order.

**The move test.** Read the rows under a different card's title. If they still make sense, they
carry their own subject and they are a card. The Overlay rows read the same under Patching, under
Cache or under Library, because the overlay is a thing rather than a facet, so Overlay is a card.
The mod-safety rows mean nothing except under Patching, so they are a group.

**The count test.**

| Rows in the card | Groups                                    |
| ---------------- | ----------------------------------------- |
| Under 5          | None. A short list is its own structure   |
| 5 to 7           | Only when the cluster test passes cleanly |
| 8 or more        | Group it, or split the card               |

**The cluster test.** A grouping needs at least two groups, and each group needs at least two
rows. One cluster and a remainder is not a grouping. It is a card with a separator, and it stays
that way. A group is never invented to file a leftover row.

The exception to the two-row minimum is a group whose single row is a **stacked editor** - the WAD
blocklist, the trusted providers list, a storage path. Those rows are already a block, so the
label sits over a block either way.

## Anatomy

```
  Patching                                         <- card heading, on the page ground
  +---------------------------------------------+  <- panel, surface-900, p-5
  | INJECTOR                                    |  <- group header, no rule over the first group
  | Patch TFT files                         ( ) |  <- a row at its default
  | Run injector elevated  (r)              (O) |  <- (r) reverts a row that is off its default
  | Verbose patcher logging                 ( ) |
  | ------------------------------------------- |  <- the rule belongs to the group below it
  | MOD SAFETY                              (r) |  <- resets the group, once two rows differ
  | Block Scripts.wad.client  (r)           ( ) |
  |  ! Modding allows running Lua scripts.      |  <- an alert belongs to the row that raised it
  | Warn about missing dependencies  (r)    ( ) |
  | Enforce anti-skinhack scan              (O) |
  | ------------------------------------------- |
  | > INCIDENTS                               . |  <- collapsed, and the dot says a row inside changed
  +---------------------------------------------+
```

| Part        | Required | Note                                                               |
| ----------- | -------- | ------------------------------------------------------------------ |
| Id          | Yes      | Stable, kebab-case, unique inside its tab                          |
| Title       | Yes      | One or two words. See the copy rules below                         |
| Description | No       | Rare. One line, and only when the title cannot carry the meaning   |
| Hint        | No       | `HintIcon` after the title, for detail that would crowd the header |
| Badge       | No       | `ExperimentalChip` and its kind                                    |
| Action      | No       | One control for the whole group, at the trailing edge              |
| Reset       | Auto     | An icon at the trailing edge, once two rows differ from default    |
| Changed dot | Auto     | On a collapsed header only, when a row inside differs              |
| Rows        | Yes      | Two, or one stacked editor                                         |

`Auto` means the component decides and no card asks for it. An id is unique inside its **tab**
rather than its card, because that is the scope an anchor addresses.

Where a header carries both, the action comes first and the reset sits outermost. The action is
this group's own control, and the reset is the one every group has.

## How a group draws

The group adds no surface and no radius. It is a label, a rule and a rhythm.

| Part        | Utilities                                                            |
| ----------- | -------------------------------------------------------------------- |
| Panel body  | `flex flex-col gap-4`                                                |
| Group root  | `border-t border-surface-700/40 pt-4 first:border-t-0 first:pt-0`    |
| Group body  | `flex flex-col gap-3`                                                |
| Header      | `flex items-center justify-between gap-2 select-none`                |
| Title       | `text-xs font-medium tracking-wide text-surface-400 uppercase`       |
| Description | `text-xs text-surface-400`                                           |
| Caret       | `h-3.5 w-3.5 text-surface-500`, leading, on a collapsible group only |
| Reset       | `Button variant="ghost" size="sm"`, icon only, `h-3.5 w-3.5` glyph   |
| Changed dot | `h-1.5 w-1.5 rounded-full bg-accent-500`, on a collapsed header only |

The title is the same object as `FilterSection`'s header, on purpose. The app gets one sub-header
style rather than a second one that only settings uses. Uppercase at `text-xs` is what keeps it
apart from a row title, which is sentence case at `text-sm`, and what keeps it under the card
title, which is `text-sm font-semibold text-surface-100`.

Spacing:

| Between                          | Space            |
| -------------------------------- | ---------------- |
| Panel edge and the first group   | 20px, from `p-5` |
| Group header and its first row   | 12px, `gap-3`    |
| Row and row inside a group       | 12px, `gap-3`    |
| Last row and the rule under it   | 16px, `gap-4`    |
| Rule and the next group's header | 16px, `pt-4`     |

The rows keep the rhythm they have today, so a card that gains groups does not also gain a new
density. The rule sits centred in 32px of space, which is enough to band a long panel and not
enough to make four groups read as four cards.

Three design-system codes apply:

- `DS-GROUND` - a group takes no surface of its own. An inset rung inside a card is for a detail
  strip, and a group is half the card
- `DS-GAP` - the panel spaces its groups with `gap`. Only the rule's own offset is padding on the
  group, because a border needs a distance that a gap cannot give it
- `DS-INVARIANT` - `surface-700/40` for the rule and `surface-400` for the label, so both invert
  with the theme
- `DS-KIND-HUE` - the changed dot is `accent-500`. Nothing went wrong, so no status hue is right
- `DS-VEIL` - the reset is a ghost button, so it hovers to `surface-veil` and not to a rung

## Rules

| Rule                                                                                   | Why                                                                        |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| The rule above a group is drawn by that group, and never above the panel's first child | The first band needs no divider from the panel edge                        |
| A group header carries no icon                                                         | The icon level is the card. Two icon levels in one panel read as two cards |
| Once a card has one group, every row in it is in a group                               | An ungrouped row after a group has no readable membership                  |
| A group holds rows, and never another group                                            | Three levels inside one panel is the wall of boxes with extra steps        |
| A group holds two rows, or one stacked editor                                          | A one-row band labels the same thing twice                                 |
| A card with groups runs the full page width                                            | A group header in a half-width column has no room to live in               |
| A group title is a noun                                                                | It labels a band, and it does not instruct                                 |
| A group never starts collapsed over a setting a first-run reader needs                 | Hiding the League path is hiding the app                                   |
| A dependent row is not a group                                                         | Two meanings for one indent is one meaning too many                        |
| A reset control sits at the level it resets, and reaches nothing else                  | Otherwise a reader has to guess how far a button goes                      |
| A reset never removes a path a reader found or a list they built                       | A reset puts a choice back, and it does not delete work                    |
| An anchor addresses an id, and never a label                                           | A label is copy, and copy gets rewritten                                   |

The one exception to _every row is in a group_ is the **lede row**: a single row above the first
group, allowed only when that row gates the whole card. It draws as a normal row, and the first
group below it draws its rule as usual, because it is no longer the panel's first child.

## Collapsible groups

A group folds only when a reader who is not looking for it should not have to read past it -
diagnostics, developer options, a long blocklist. Everything else stays open.

- The toggle spans the caret, the title and the space after it, so most of the header row is the
  hit target. The trailing cluster stays outside it, because a reset button cannot nest inside the
  button that folds the group
- Open by default. `defaultOpen={false}` is allowed only on a group of diagnostics or developer
  options
- The open state persists per group id, in a `settingsLayout` store that mirrors
  `workshopLayout.openSections` - a `Record<string, boolean>` under `persist`
- The body animates its height, and `useReducedMotion()` returns that to instant
- A collapsed group keeps its rows out of the DOM. A settings search, when one is built, indexes
  the settings model rather than the rendered page
- Because those rows are not mounted, a collapsible group declares the settings it holds. That is
  the one place the registration below is not enough, and it is what the changed dot reads

## The dependent row

`MinimizeToTraySection` already draws one. A row appears when its parent toggle is on, indented
behind a left rail. This is a different relationship from a group, and it keeps a different shape.

| Concept       | Shape                                     | Membership                        |
| ------------- | ----------------------------------------- | --------------------------------- |
| Group         | A label above a band, and a rule above it | Rows about the same facet         |
| Dependent row | An indent behind a left rail              | A row its parent's state controls |

Rules for a dependent row:

- One level only. A dependent row has no dependents of its own
- It appears when the parent allows it, and it is never disabled in place
- The rail is `border-l-2 border-surface-600 pl-4`. The rung today is `surface-700`, which is the
  input rung. `surface-600` is the divider rung, and a rail is a divider
- A group holds a parent row and its dependents together. They never straddle a rule

## Defaults and reset

The app knows what a fresh install shows for every setting, and nothing on screen says so.
`ResetAppearanceButton` is the whole of it today: one card, one button, and its own hand-written
comparison against a default it keeps beside itself.

A reader has two questions here, and they are the same question at two moments. _What did I
change?_ and _how do I put it back?_ One affordance answers both.

### Where a default comes from

Two tables already hold them, so the source is not new work.

| Owner                                    | Holds                                                  |
| ---------------------------------------- | ------------------------------------------------------ |
| `Settings::default()`, in Rust           | Every setting the backend stores, `Config` included    |
| `APPEARANCE_DEFAULTS`, in `displayStore` | Zoom, motion, corners, fonts, surface tint, scrollbars |

The Rust table reaches the frontend through one command, `get_default_settings`, behind a query
that never goes stale. A second copy of that table written in TypeScript is the one thing this
design must not do. A default that drifts from the backend's is worse than no default at all,
because it offers to reset a value to something a fresh install never had.

The command keeps the `get_` prefix that C-GETTER rules out. `get_settings` sits beside it in the
same file, and one command out of step with its neighbour reads as a mistake rather than a rule.

### The revert marker

A row whose value differs from its default shows a small counter-clockwise arrow after its title,
in the cluster where `HintIcon` already sits. It is on whenever the row is off default, and absent
otherwise, so a scan down a card shows what this install changed before the reader clicks anything.

The tooltip carries the value, which is what makes a default readable without resetting to it:

```
Reset to default
Default: Off
```

The label is the value as the reader would read it - `Off`, `Geist`, `100%`, `not set` - so the row
supplies the string. Only the row knows how its own control presents a value.

On a row that carries a hint as well, the hint comes first and the marker sits outermost. The hint
belongs to the title and never moves, and the marker comes and goes with the value, so a title that
shifts under the cursor is the thing to avoid.

### The three scopes

| Level | Control                              | Appears                          | Resets                  |
| ----- | ------------------------------------ | -------------------------------- | ----------------------- |
| Row   | An arrow after the title             | The row is off its default       | That row                |
| Group | A ghost icon button in the header    | Two or more rows are off default | Every row in the group  |
| Card  | A labelled `Reset to default` button | Always, disabled at default      | Every group in the card |

**A group's reset waits for the second changed row.** One changed row is already its own reset, and
a second control that does the same thing to the same row is noise. This is what keeps a single
theme change from drawing three arrows down one card.

**A card's button is disabled rather than hidden.** It is labelled and it lives in the card header,
so a button that comes and goes moves the heading under the reader's cursor. The group's reset is
an unlabelled icon inside the panel, which has no such problem, so it is hidden until it applies.

**A group or card reset shows a toast with `Undo`.** That is the answer to a control that changes
eight things at once, and it is a better one than a confirm dialog: no click for the reader who
meant it, and full recovery for the reader who did not. A row needs neither, because the way back
is the control they just used.

### What a reset never touches

A reset puts a choice back. It does not delete work, so these rows carry no marker, and no scope
above them reaches them:

- The League path, the mod storage path and the workshop path, which a reader found on disk
- The WAD blocklist and the trusted providers, which a reader built
- The author profiles, which are content rather than configuration

Their editors already carry their own controls, and a list editor removes one item at a time on
purpose.

A hidden dependent row is not reset either. Its parent is off, so its value is inert, and it waits
there for the parent to come back on. That is what a reader expects from a setting that disappeared
rather than one that was cleared. A collapsible group declares only the rows that are always there,
so a dependent row stays out of its scope by the same rule.

### Copy

| Where        | Text                                                       |
| ------------ | ---------------------------------------------------------- |
| Row tooltip  | `Reset to default`, then `Default: Off` on its own line    |
| Row label    | `Reset Patch TFT files to default`                         |
| Group button | `Reset this group`, with `Reset Mod safety` as its label   |
| Card button  | `Reset to default`, which is what the Appearance card says |
| Toast        | `Mod safety reset`, with an `Undo` action                  |

## Anchors

A group with a name is a thing that can be pointed at. Nothing points at settings today. Five
places navigate there, and every one of them lands on the General tab and leaves the rest to the
reader - including the two that already know exactly which row they mean. The workshop's empty
state says `Set up a workshop directory in Settings`, and then opens a tab that does not hold it.

### The URL

`/settings` takes two more search params beside the `firstRun` it validates today.

| Param   | Value                        | Effect                                    |
| ------- | ---------------------------- | ----------------------------------------- |
| `tab`   | A tab value from `TABS`      | Opens that tab. Defaults to `general`     |
| `focus` | A group id, or a setting key | Points at one group, or one row inside it |

`?tab=patching&focus=mod-safety` opens Patching and points at the group.
`?tab=patching&focus=patchTft` opens the same tab and points at the row.

A search param, and not a `#` hash: this route already validates its search in one place, and what
scrolls is a container inside the page rather than the document.

The id is what the URL carries, so a link outlives every rewrite of the label above it. `focus`
addressing a **setting key** rather than a separate row id is the same idea one level down. The key
is the one name a row already has, it is unique by construction, and it cannot fall out of step
with what the row reads.

A row excluded from reset is still a valid target. The two features share the id and nothing else.

### What focus does

1. Selects the tab, if it is not the one already selected
2. Expands the group, if it is collapsed, and the group holding the row when `focus` names a row
3. Scrolls the target into view, near the top of the panel rather than the bottom of it
4. Marks it for two seconds with `ring-2 ring-accent-500/40`, which then fades
5. Clears `focus` from the URL with `replace: true`

Step 5 is what stops a refresh from re-flashing a mark the reader has already read, and what keeps
Back out of a loop between two spellings of the same page.

`useReducedMotion()` returns step 3 to an instant scroll, and step 4 to a mark that holds for two
seconds and then disappears.

### Tab state

`Tabs.Root` moves from `defaultValue` to a controlled `value`, written back with
`navigate({ search, replace: true })`. Replace, because a tab is not a place a reader wants Back to
walk through. Back leaves settings.

### Who links

| From                              | Today       | With the anchor                     |
| --------------------------------- | ----------- | ----------------------------------- |
| The workshop's empty state        | `/settings` | `?tab=workshop&focus=workshopPath`  |
| The game browser, with no League  | `/settings` | `?tab=general&focus=leaguePath`     |
| A patcher failure, on an injector | `/settings` | `?tab=patching&focus=injector`      |
| The titlebar gear, and `Ctrl+,`   | `/settings` | Unchanged. They mean the whole page |

A settings search, when one is built, navigates with the same two params. That is the whole of what
a result has to do, which is why the ids come first and the search comes later.

## Copy

Card and group titles are sentence case, except for a proper noun. `System Tray & Autostart` and
`Author Profiles` are the two title-case holdouts, and they change with this work.

A group title is one or two words, and takes no description in most cases. The rows under it
enumerate themselves, so a sentence over them writes the card twice.

| Bad                      | Good          | Why                                                      |
| ------------------------ | ------------- | -------------------------------------------------------- |
| `Options for mod safety` | `Mod safety`  | A group is a label, and not a sentence                   |
| `Configure incidents`    | `Incidents`   | A noun, and not an instruction                           |
| `Advanced`               | `Diagnostics` | Name the facet, and not how hard the reader will find it |
| `Other`                  | -             | A group with no name is a card with no grouping          |

**An `and` in a title is a signal.** It says the thing holds two facets. That is a good reason to
give it groups, and then to try to name the whole again. Where no single word covers both, the
`and` stays and the groups do the work - `Startup and tray` is one of those.

Where the two halves mean the same thing, the title is hiding what the card really holds.
`Safety & Integrity` is that case. Safety and integrity are one idea here, and the panel under
that title holds four.

## Accessibility

- A group renders `<section aria-labelledby>` around an `<h4 id>`, so the outline reads card
  (`h3`) and then group (`h4`)
- `role="group"` with `aria-labelledby`, and not `fieldset` with `legend`. Every row already owns
  its own label, and a fieldset makes some screen readers repeat the legend on each control inside
  it
- A collapsible header is a `<button aria-expanded aria-controls>` inside the `h4`, wrapping the
  caret and the title only. It is one tab stop, the caret gets none of its own, and Enter and Space
  toggle it. The action and the reset are siblings of that button rather than children of it
- The header is chrome the app wrote about itself, so it takes `select-none`
- Tab order inside a group is unchanged. A group adds no focus trap and no roving index
- The revert marker is a `<button>` in the row's title cluster, which is safe inside a `<label>`
  because a label ignores clicks on interactive descendants - the note `HintIcon` already carries
- Its accessible name names the row, `Reset Patch TFT files to default`. A card of identical arrows
  otherwise reads out as `Reset to default` eleven times
- The changed dot on a collapsed header is decorative. The header's accessible name carries the
  fact instead
- A focus target takes `tabIndex={-1}` and takes focus after the scroll, so a keyboard reader lands
  where the link pointed rather than back at the top of the tab
- Focus lands on the group header, or on the row, and never on the control inside it. A reader who
  arrives on a switch and presses Space has changed the setting they came to read

## The API

`SettingGroup` sits beside `SettingRow` in `src/modules/settings/components/`, and exports through
the module barrel. It is settings-specific, so it does not belong in `@/components`.

```tsx
interface SettingGroupProps {
  /** Stable id, for the collapsed-state store and for the `focus` anchor. */
  id: string;
  title: string;
  /** Rare. Only where the title cannot carry the meaning on its own. */
  description?: string;
  /** Detail that would crowd the header, shown on the title's hint icon. */
  hint?: ReactNode;
  badge?: ReactNode;
  /** A control for the whole group, pinned to the header's trailing edge. */
  action?: ReactNode;
  /** Lets the reader fold the group away. The state persists by `id`. */
  collapsible?: boolean;
  /** Only for a group a first-run reader can ignore. Defaults to open. */
  defaultOpen?: boolean;
  /** What this group holds. Only a collapsible group needs it, since its rows may be unmounted. */
  settings?: SettingKey[];
  children: ReactNode;
}
```

Two supporting changes come with it:

- `SectionCard` owns its panel's layout, at `flex flex-col gap-4`. Every card writes
  `<div className="flex flex-col gap-3">` by hand today, and two write `space-y-*`, which
  `DS-GAP` rules out
- `SettingRows` wraps the rows of an ungrouped card, at `flex flex-col gap-3`. A card is then
  either one `SettingRows`, or a list of `SettingGroup`

```tsx
<SectionCard title="Patching" icon={<PatcherIcon className="h-5 w-5" />}>
  <SettingGroup id="injector" title="Injector">
    <SettingRow title="Patch TFT files" setting="patchTft" defaultLabel="Off" ... />
  </SettingGroup>

  <SettingGroup id="mod-safety" title="Mod safety">
    <SettingRow title="Block Scripts.wad.client" setting="blockScriptsWad" defaultLabel="On" ... />
    <AlertBox variant="warning">...</AlertBox>
  </SettingGroup>
</SectionCard>
```

An `AlertBox` a row raises stays inside that row's group, under the row. It is part of what the
row said.

### What a row declares

`SettingRow` gains two props, both optional, because an action row reads no setting at all.

```tsx
/** The setting this row reads. It is also the row's anchor id and its reset scope. */
setting?: SettingKey;
/** What a fresh install shows, as the reader would read it - `Off`, `Geist`, `100%`. */
defaultLabel?: string;
```

```tsx
/** A setting the backend stores, or one the display store owns. */
type SettingKey = keyof Settings | `display.${keyof typeof APPEARANCE_DEFAULTS}`;
```

**A row with a `setting` and no `defaultLabel` is addressable and never reset.** That is exactly
the League path, the WAD blocklist and the author profiles: they keep their anchor, and they keep
their data. The rule that a reset never deletes work is then structural rather than a second prop
someone can set wrong.

Two hooks and one context carry the rest.

```tsx
/** What a fresh install stores, from the Rust defaults and from the display store. */
function useSettingDefaults(): SettingDefaults;

/** Which of these settings are off default, and how to put them back in one save. */
function useSettingReset(keys: SettingKey[]): { changed: SettingKey[]; reset: () => void };

/** A row registers what it reads, so the group around it knows its own scope. */
const SettingScope = createContext<{ register: (key: SettingKey) => () => void } | null>(null);
```

An open group needs no prop for any of this. What registered is what it resets, and how many
registered rows are off default is what decides whether its reset is on screen at all.

Registration rather than a list of keys on every group, for two reasons. A dependent row mounts and
unmounts, so a hard-coded list would claim a key for a row that is not on screen. And a second list
of keys beside the rows is a second place to forget one. A collapsible group is the exception, and
it declares its keys, because a collapsed group has no mounted rows to hear from.

### What the route declares

```tsx
interface SettingsSearch {
  firstRun?: boolean;
  tab?: TabValue;
  focus?: string;
}
```

`focus` is a string rather than a union, because the ids it addresses are spread across four
sections and a union would have to be maintained beside them. An unknown `focus` selects the tab
and does nothing else, which is the right failure for a link that outlived the setting it named.

Only the collapsed state persists, in `settingsLayout`. The tab and the focus target live in the
URL, and the two-second mark lives in the component.

`data-ui` values are `SettingGroup` on the root and `SettingGroup:header` on the header.

## Migration

### Patching

The tab that motivated this. `Patching` and `Safety & Integrity` merge into one full-width card,
and the two-column `SettingsGrid` leaves the tab, because both remaining cards are full width.

Card `Patching`:

| Group         | Rows                                                                                  |
| ------------- | ------------------------------------------------------------------------------------- |
| Injector      | Patch TFT files, Run injector elevated, Verbose patcher logging                       |
| Mod safety    | Block Scripts.wad.client, Warn about missing dependencies, Enforce anti-skinhack scan |
| Game archives | Scan every WAD up front, Disable crash reporting                                      |
| Incidents     | Allow reading game logs, Keep incidents                                               |

`Game archives` is a real facet and not a leftover. The two rows are coupled - archives are
verified on demand only while Riot's crash reporting is off - and the group is where that coupling
becomes visible.

Card `Overlay` keeps its own panel and takes no groups. It has three rows, it passes the move
test, and it is the example of a card the group level does not touch.

### Appearance

One card, eleven rows, five groups. The card keeps its `Reset to default` action at card level,
because it resets all of them.

| Group           | Rows                                 |
| --------------- | ------------------------------------ |
| Color           | Theme, Accent color, Surface tint    |
| Shape and scale | Corners, Zoom level                  |
| Text            | Interface font, Code font            |
| Motion          | Reduce motion, Scrolling, Scrollbars |
| Backdrop        | Background image, Blur               |

`Blur` appears only once an image is set, so `Backdrop` is a one-row group some of the time. The
row it holds is a stacked editor either way, which is the stated exception.

### Library

The card already draws these three clusters with two separators. The groups are the labels those
separators do not carry.

| Group       | Rows                                                                      |
| ----------- | ------------------------------------------------------------------------- |
| Storage     | Storage location                                                          |
| Cataloguing | Automatically categorize mods, Show footprint, Watch for external changes |
| Installing  | Trusted mod providers                                                     |

### General

| Card              | Rows | Verdict                                            |
| ----------------- | ---- | -------------------------------------------------- |
| League of Legends | 4    | No groups. One cluster, under the count test       |
| Startup and tray  | 5    | Two groups. Renamed from `System Tray & Autostart` |
| Import            | -    | An action card, and not a row list                 |

Card `Startup and tray`:

| Group   | Rows                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------- |
| Startup | Auto run, and its dependent Start in tray unless update available. Always start patcher at launch |
| Tray    | Minimize to system tray, Start minimized to tray                                                  |

### The rest

| Tab      | Verdict                                                                               |
| -------- | ------------------------------------------------------------------------------------- |
| Workshop | No groups. Three cards, of one row, three rows and a list. Titles go to sentence case |
| Cache    | No groups. The tab is a table and two actions                                         |
| Hotkeys  | No groups. Three rows. A per-action hotkey list would group by what the hotkey does   |
| About    | No groups. Not a row list                                                             |

Every row a migration touches also gains the `setting` key it reads, and the `defaultLabel` a
reader would read for it, except the six that no reset may touch. Those six take the key alone, so
they can still be linked to.

After this work, four cards of the eight tabs carry groups. That is the intended outcome, because
the level earns its place twice: once on the two cards that are unreadable today, and again every
time a setting is added. The ninth row on the Appearance card joins `Motion`, instead of starting
a `More appearance options` card.

## Rejected alternatives

| Alternative                               | Why not                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A panel per group, inset `surface-950/40` | Boxes inside a box. `DS-GROUND` puts an inset under a detail strip, and a group is half a card |
| A card per group, which is today          | It splits one subject across two panels, and the page reads as a wall of boxes                 |
| An accordion for every group              | It hides what the reader opened settings to change, and turns one scan into four clicks        |
| Sentence-case bold group headers          | They tie with the row title, which is also sentence case at `text-sm`                          |
| A second tab level                        | It doubles the navigation for a facet that fits in a band of three rows                        |
| A left rail for grouping                  | That is the dependent row's shape, and one shape can only mean one thing                       |
| Sticky group headers                      | The panel does not scroll. The page does                                                       |
| Two columns of grouped cards              | Four heading levels on one line, and a group header with 330px to live in                      |
| A `Default: Off` line under every row     | It doubles the height of a card to say nothing at all about the rows already at their default  |
| A revert marker revealed on hover         | The marker is information before it is a control, and hidden it answers neither question       |
| A confirm dialog before a group reset     | A toast with `Undo` recovers the same mistake, and costs no click to the reader who meant it   |
| `Reset all settings`, somewhere global    | It belongs to no level a reader is looking at, and `everything` is the one scope nobody checks |
| A frontend copy of the defaults           | It drifts from `Settings::default()` and offers a reset to a value no fresh install ever had   |
| A `#hash` anchor                          | The route validates its search in one place, and the document is not what scrolls              |

## Open questions

- `Game archives` and `Incidents` sit close enough that a reader may look in the wrong one for
  `Allow reading game logs`. Does the pair want one group named `Diagnostics`?
- Which cards get a card-level reset? Appearance has one today. Patching would be the next
  candidate, and the four group resets may already be enough of one
- Should `focus` also address a card, for a link that means the whole of `Overlay` rather than one
  row in it? Every row is addressable already, so this only buys a better-aimed link
- A collapsible group has to declare its settings, since a collapsed group has no rows mounted to
  register. Is a group that folds worth that second list, or should a collapsed group keep its rows
  in the DOM instead?
