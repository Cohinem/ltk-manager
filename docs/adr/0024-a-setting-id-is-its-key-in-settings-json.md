# ADR-0024: A setting id is its key in settings.json

- **Status:** Proposed
- **Date:** 2026-09-03
- **Crates:** `ltk-manager-core` (`Config`), and `Settings` in `src-tauri/src/state.rs`
- **Related:** ADR-0019, ADR-0023

## Context and problem statement

A backend-stored setting has two names today. `settings.json` and the frontend read it by one,
`autoRun`, and a link and `Copy setting ID` carry the other, `general.autoRun`. ADR-0023 kept them
apart so the frontend's name stayed free to change, and `docs/plans/settings-anchors.md` then minted
a third, `startup.autoRun`, that nothing stores.

VS Code has one name. A setting's id is its key in `settings.json` - `editor.fontSize` - and that
string is also what the settings editor searches on, what `vscode://settings/` opens, and what the
schema marks deprecated when the setting is renamed or removed. An old key keeps loading through a
migration, and the editor says so where the old key is used.

`settings.json` here is already one flat document, with `Config` flattened into `Settings`. Nothing
in-tree reads it but `load_settings`, and the frontend's `SettingKey` is `keyof Settings`, so the
file's key and the frontend's key are one string by construction. The id was the odd one out.

## Decision drivers

- One name per setting, so what a person copies is what they can grep, paste and search for.
- A rename must leave a record, because `Copy setting ID` has been minting ids since 2026-08-25.
- A file written before an upgrade must load after it.
- The eleven settings a frontend store owns are not in the file and should not force a migration.

## Considered options

1. **The id is the file's key.** Flat, dotted, a serde rename with the old key as an alias.
2. **The id is a label over the file.** ADR-0023's shape, an index column mapping id to key.
3. **A nested file.** `{ "launch": { "mode": ... } }`, with the id as a JSON path.

## Decision

**A backend-stored setting's id is its key in `settings.json`, and a rename leaves a retired id.**

- The file stays flat. A field with a row in the index takes its id as its serde name,
  `#[serde(rename = "startup.autoRun", alias = "autoRun")]`, and the old name is an alias so a
  file written before the rename loads. The next save writes the new keys.
- A field without a row is state that lives in the file - `firstRunComplete`, `hasSeenHddWarning` -
  and keeps its camelCase key until the day it gets a row.
- The eleven settings a frontend store owns keep their store key. Their id is the index's, as
  before.
- `RETIRED` is a table of ids the app no longer mints: the id, the release it stopped in, and what
  replaced it or why it is gone. A link or a pasted id that resolves through it lands on the
  replacement and says so in a toast, `general.autoRun is now startup.autoRun`. A removed setting
  opens the default tab with its reason.
- The fifteen ids the plan renames are the first entries. The old file keys are serde aliases and
  were never public.

## Consequences

- **Positive:** `Copy ID` has a paste target. The id is one string in the file, in a support
  thread and in the palette.
- **Positive:** "frozen once minted" becomes "stable, and retired with a record". A domain name
  that turns out wrong is fixed at the price of one table row.
- **Negative:** every frontend read of a backend-stored setting moves from `settings.autoRun` to
  the dotted key, a few hundred references, and ts-rs regenerates `Settings.ts` with the new
  names.
- **Negative:** `Config`'s serde names become public, since they are what a person reads in the
  file.
- **Negative:** a downgrade past this release loses settings. `load_settings` falls back to
  defaults on a parse error, and an older build has no alias for the new keys and no default for
  `theme`. The release notes carry that.
- **Negative:** one rename is two retirements, and they are different strings. The old key,
  `autoRun`, is a serde alias. The old id, `general.autoRun`, is a `RETIRED` row.
- **Revisit when:** a setting has to move between domains. It gains a rename, an alias and a
  retired row, and if that happens often the domain layer is wrong rather than the mechanism.

## Pros and cons of the options

### Option 1: the id is the file's key (chosen)

- Good: VS Code's shape, and one name.
- Bad: the rename touches the backend, the binding and every frontend read.

### Option 2: a label over the file

- Good: nothing outside the frontend changes.
- Bad: three names for one field, and the file a person can open says none of what they copied.

### Option 3: a nested file

- Good: the domain is a JSON object.
- Bad: a dotted id is no longer a key a person can grep for, and `Config` is flattened for the
  reason the file is flat.
