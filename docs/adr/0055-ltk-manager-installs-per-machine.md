# ADR-0055: LTK Manager installs per machine

- **Status:** Accepted (2026-09-27)
- **Date:** 2026-09-27
- **Crates:** `src-tauri`, `ltk-manager-core`
- **Related:** [ADR-0039](0039-windows-ships-the-nsis-installer-alone.md), whose NSIS bundle this
  configures.

## Context and problem statement

The injection host and the hook DLL ship as bundled resources and resolve from the install
directory. The host runs behind a UAC bridge whenever the manager is unelevated and either the
reader opts in or League carries a `RUNASADMIN` layer.

Tauri's default install mode is `currentUser`, which puts both binaries under `%LOCALAPPDATA%`.
That directory is writable by anything running as the reader, so unprivileged code can replace
what the bridge is about to run at high integrity. The bundle checksum and the Authenticode probe
both report the swap into a diagnostics report, and neither gates the spawn.

## Decision

The NSIS installer runs `perMachine`, so it requests administrator rights and defaults to
`Program Files`, where an administrator-only ACL covers the binaries the bridge elevates.

`perMachine` sets the default rather than the location, and an elevated installer writes wherever
it is pointed, so the installer hooks pin the directory as well. `.onVerifyInstDir` holds the
install button closed while the chosen directory sits outside a `Program Files` root, and
`NSIS_HOOK_PREINSTALL` repeats the test for the silent `/D=` path the directory page never sees.
A 60 MB app does not need to live anywhere else.

**This stays until the patcher has an installer of its own.** Once the host and the DLL are
installed and updated apart from the manager, that installer owns their location and their
permissions, and the manager's own install mode stops carrying the guarantee.

## Consequences

**An update prompts.** The updater relaunches the NSIS installer, which needs elevation against
`Program Files`, so the `passive` install mode no longer passes without a UAC dialog.

**A per-user install is migrated by the hook, not by the template.** `SHCTX` is `HKLM` under
`perMachine`, so the reinstall page never sees a `currentUser` registration. The hook reads
`HKCU` itself and runs the old uninstaller before copying anything, because the orphan it would
otherwise leave is a writable copy of the binaries this decision protects.

**The migration follows the elevated token's hive.** A reader who elevates with another account's
credentials gives the installer that account's `HKCU`, where the per-user install is not
registered, and the orphan survives. The same holds for a second reader on the machine who
installed per user.

**The reader cannot choose where it lands.** Installing to another drive for space was the one
argument against pinning, and it does not survive the app being 60 MB. A reader who wants it
elsewhere has no route left.

**The pin lives in a hook, not in a supported option.** Tauri exposes no directory constraint, so
the guard is a `.onVerifyInstDir` defined from the hooks file. A Tauri release that defines the
same callback in its own template collides at build time, which is loud rather than silent, and
the fork of the template is the fallback.
