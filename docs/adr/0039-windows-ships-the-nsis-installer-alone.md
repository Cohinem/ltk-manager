# ADR-0039: Windows ships the NSIS installer alone

- **Status:** Accepted (2026-09-13)
- **Date:** 2026-09-13
- **Crates:** none. The change is `bundle.targets` in `src-tauri/tauri.conf.json` and the
  release workflow
- **Related:** Issue #567, the desktop shortcut that came back on every update. PR #568, which
  answered it with an NSIS flag the MSI never reads.

## Context and problem statement

A release published two Windows installers: a WiX MSI and an NSIS `-setup.exe`. The release
notes pointed at the MSI, and the updater's `latest.json` carried both, so an MSI install
updated through `msiexec` and an NSIS install through the setup executable.

The two behave apart on an update. Tauri's WiX template ships the desktop shortcut as a
component of its shortcuts feature, and its major upgrade reinstalls every shortcut, so an MSI
update put back a desktop shortcut the user had deleted. Tauri's NSIS template takes `/UPDATE`
from the updater and creates no shortcut on an update, so an NSIS install kept the user's choice.

The MSI also had no hooks. `installer-hooks.nsh` stops `ltk_patcher_host.exe` before an NSIS
install and uninstall, where an MSI update against a running host meets a locked file. The MSI
installs per machine, so every passive update asked for elevation, where the NSIS installer is
per user under `%LOCALAPPDATA%` and asks for nothing.

`installerArgs` in the updater's Windows config reaches both installers, so a flag meant for one
lands on the other's command line. `/NS` on `msiexec` is an invalid switch, and the update ends
before it installs.

## Decision

**A release ships the NSIS installer and nothing else for Windows.** `bundle.targets` names
`nsis` alone, the release notes link the `-setup.exe`, and `latest.json` carries the NSIS
artifact under `windows-x86_64` and `windows-x86_64-nsis` alone.

**An MSI install migrates once.** The updater serves an MSI install the NSIS artifact, which
finds the MSI in the uninstall registry, runs the MSI's own uninstaller, and installs per user.
That one run shows Windows Installer's confirmation and asks for elevation, and creates the
desktop shortcut, since the template's Wix branch creates shortcuts whatever the flags say.
Settings, the library and the workshop live under `%APPDATA%` and are untouched. Every update
after it is passive and keeps the user's shortcuts.

**The MSI stays buildable.** `pnpm tauri build --bundles msi` still produces one for whoever
deploys by policy. No release carries it.

## Consequences

- #567 closes with no installer flag. `/UPDATE` already does what the issue asks.
- The prerelease branch of the release workflow, which patched the targets to NSIS, is the
  release now, so that patch went.
- A user who installed from the MSI sees one uninstall prompt on their next update, and the app
  moves from `Program Files` to `%LOCALAPPDATA%`.
- A future installer setting goes in `bundle.windows.nsis` or `installer-hooks.nsh`, with no
  second installer to keep in step.
