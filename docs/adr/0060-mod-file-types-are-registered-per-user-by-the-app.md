# ADR-0060: Mod file types are registered per user by the app

- **Status:** Accepted (2026-10-02)
- **Date:** 2026-10-02
- **Crates:** `ltk-manager-core`, `src-tauri`
- **Related:** [ADR-0055](0055-ltk-manager-installs-per-machine.md), whose per-machine install and
  elevated uninstaller this works around.

## Context and problem statement

A reader who double-clicks a `.fantome` or `.modpkg` file in Explorer gets nothing, or the archive
tool that claims zip files. Both extensions are ours, so Explorer should name them, draw them with
our icons and open them with the manager, which installs them.

Tauri's `bundle.fileAssociations` is the obvious route, and it does not fit. It runs only at install
time, so a settings switch cannot turn it off. Under `perMachine` it writes `HKLM` for every account
on the machine. It has no icon per type and draws the executable's icon for both.

## Decision

The app writes the registration itself, under `HKCU\Software\Classes`, behind the
`registerFileTypes` setting, which is on by default. No elevation is needed.

Each type gets a ProgID the app owns outright (`LTKManager.Fantome`, `LTKManager.Modpkg`) with its
own name, icon and open command, an `OpenWithProgids` entry, and an `Applications\ltk-manager.exe`
entry for the "Open with" list. A `Capabilities` key and a `RegisteredApplications` value list the
app on the Default apps page in Windows Settings.

**The extension's default is written only when it is empty.** A program the reader already chose
keeps the type. A `UserChoice` is hash protected and cannot be written anyway, so the settings card
shows which program opens each type and sends the reader to Default apps to change it.

**Startup reconciles, and a debug build does not.** A release build rewrites what differs on every
start, which follows the executable when it moves, and removes only the values it owns when the
setting is off. A debug build leaves the registry alone, so a development build never takes the
types from the installed app.

**The uninstaller removes the same values.** `NSIS_HOOK_POSTUNINSTALL` deletes them from the
elevated token's hive, value by value, since another program may share the extension keys.

## Consequences

**A second account keeps a dead ProgID after an uninstall.** The uninstaller reaches one hive, the
limit ADR-0055 describes. What survives in another account points at an executable that is gone,
and Explorer then asks which program to use, which is harmless.

**A file opened from Explorer is a second launch.** Explorer starts one process per selected file,
and the single-instance plugin forwards each to the running app. File paths skip the deep link's
one-second rate limiter and are batched over 300 ms, so a multi-select installs as one import.

**The icons ship as resources outside `resources/`.** That glob flattens every match into the
install directory, so `file-icons/*.ico` has a mapping of its own to keep them under
`$INSTDIR\file-icons\`.
