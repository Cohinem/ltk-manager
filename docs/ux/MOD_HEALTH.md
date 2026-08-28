# Mod health

## Changes

| Date       | Change                                                         |
| ---------- | -------------------------------------------------------------- |
| 2026-08-28 | Check at import, and Check Health in the card menu             |
| 2026-08-28 | The badge, the popover, and the one-button repair              |
| 2026-08-28 | The verdict model, the check, and the repair for both storages |

Each edit of this document adds a row at the top. The table keeps the last ten rows.

Mod health is the [Problems](PROJECT_PROBLEMS.md) rules pointed at the installed library. The
engine is shared and the surface is not. A modder reads a list of findings addressed to a
property inside a file. A mod user reads a verdict and presses one button. That split is the
whole design: same rules, same problems, same repairs, two very different things drawn on
screen.

## Goals

- A mod user learns which of their mods will break the game, without bisecting the library
- One button repairs what a machine can repair
- A mod that cannot be repaired says so plainly, so the user goes and finds a replacement
- A newly imported mod is checked without asking, and the import does not wait for it
- A repair is never applied for a game patch the user is not on yet

## Feature status

This table holds every major feature of Mod health. A status word has one meaning - see
[Problems](PROJECT_PROBLEMS.md) for the legend.

| Feature               | Status    | Note                                                       |
| --------------------- | --------- | ---------------------------------------------------------- |
| The verdict model     | Available | `ModCheckVerdict`: health, fixable count, live counts      |
| The check             | Available | `check_mod`, both storages, never writes the mod           |
| The repair            | Available | `repair_mod`, both storages, applies every live fix        |
| The verdict store     | Available | `check-verdicts.json` beside the index, one row per mod    |
| The badge             | Available | On the card, only when something is wrong                  |
| The popover           | Available | Plain counts, Repair, re-check, and when it was checked    |
| Check at import       | Available | A background check per install, and the import never waits |
| Check Health, by hand | Available | In the card menu, answered by a toast                      |
| The library sweep     | Planned   | Every mod after a game patch, skipping the unchanged       |
| Verdict pruning       | Planned   | An uninstalled mod's verdict goes with it                  |
| The full findings     | Planned   | Behind a disclosure, for the user who wants the detail     |
| One health surface    | Proposed  | The skinhack and missing-deps warnings join the badge      |

## The verdict

A check runs every Problems rule over one mod's content and summarizes the run for a badge:

| Field       | Meaning                                        |
| ----------- | ---------------------------------------------- |
| `health`    | `healthy`, `repairable`, or `unrepairable`     |
| `fixable`   | How many findings a repair would fix           |
| `counts`    | Every live finding by severity, fixable or not |
| `checkedAt` | When the check ran                             |

`repairable` means at least one finding carries a fix. `unrepairable` means findings exist and
none does. The verdict counts only **live** findings: a dormant rule describes a patch the
installed game has not taken yet, and the Problems panel shows those findings with the fix
withheld. A surface with no panel makes the same cut itself, which is why a repair can never
break a mod on the build the user plays tonight.

Verdicts are remembered in `check-verdicts.json` beside the library index, one row per mod id.
The file is a cache of a computation, not a record - a lost or unreadable file starts empty and
refills on the next check.

## The check and the repair, per storage

The write is what once kept the rules out of the library - see "The library waited" in
[Problems](PROJECT_PROBLEMS.md). The answer is that both operations meet the rules on a mod
project, wherever the mod keeps its content:

| Storage   | Check                              | Repair                                         |
| --------- | ---------------------------------- | ---------------------------------------------- |
| `project` | Analyze the mod's own tree         | Fix in the tree, with a restore point          |
| `archive` | Unpack to staging, analyze, delete | Unpack, fix, repack, swap the archive in place |

A project-storage repair is the project editor's fix run on the mod's directory, so it leaves
the same `.ltk/restore/` point and is undone the same way. An archive-storage repair replaces
the archive with the repacked result and keeps no copy of the original - see ADR-0005. Either
way a repair that applied nothing leaves the mod untouched, byte for byte.

A repair records the mod's fresh verdict itself, so the badge updates without a second scan.
Any repair that wrote also flushes the next overlay build, so the fix reaches the game without
a manual rebuild.

A modpkg is not checked or repaired. Its content only exists inside its archive, and there is
no unpacked form to run the rules over - the same boundary as ADR-0001.

## The badge

The badge sits on the mod card beside the WAD footprint and missing-dependency badges, and it
draws only when something is wrong. A healthy mod shows nothing, and so does a mod never
checked - a badge on every card would bury the few that matter.

| Verdict        | Badge                                    |
| -------------- | ---------------------------------------- |
| `healthy`      | Nothing                                  |
| `repairable`   | Amber wrench pill with the fixable count |
| `unrepairable` | Red alert pill with the finding count    |

The popover behind the pill carries the verdict in plain counts, when the check ran, one
Repair button, and a re-check. It never shows a property path - the full findings wait for the
disclosure row above. An unrepairable mod's sentence says to look for an updated version of
the mod, because "stop trying" is the actionable half of that verdict.

## When a check runs

| Trigger                    | How                                                       |
| -------------------------- | --------------------------------------------------------- |
| An install, single or bulk | A background check per imported mod, off the install path |
| Check Health, in the menu  | On demand, answered by a toast either way                 |
| The badge's re-check       | On demand, from the popover                               |
| A repair                   | The repair records the post-repair verdict itself         |

The install's check runs on a detached thread and announces once at the end
(`check-verdicts-updated`), so importing thirty mods costs the import nothing and the badges
arrive when the results do. One unreadable mod is logged and skipped, never the end of the
sweep.

The menu's toast exists because a clean check draws no badge: without an answer the click
would look ignored. "No problems found" is the answer.

## Decided questions

| Question                                         | Answer                                           |
| ------------------------------------------------ | ------------------------------------------------ |
| Where do verdicts live?                          | `check-verdicts.json`, a map beside the index    |
| Does a check write anything to the mod?          | No. The archive stays byte for byte              |
| What does a repair do with the original archive? | Replaces it, and keeps no copy - ADR-0005        |
| Can a repair run for a build the user is not on? | No. Dormant rules' findings are cut from the run |
| Is a repaired mod repairable again next patch?   | Yes. The rules stay quiet about a repaired value |
| Does one broken mod stop a batch check?          | No. It is logged, skipped, and has no verdict    |
| Does a repair disturb the mod's setup?           | No. Id, slug, profiles and layers all stay       |
| Can the patcher run during a repair?             | No. A check yes - it only reads                  |
