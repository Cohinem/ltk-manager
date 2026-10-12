# Worktrees

A fresh git worktree of this repo holds tracked files only. It has no `node_modules` and no
submodule checkout, so no check, commit hook or build runs in it until both are set up.

## Setup

1. Install the dependencies with `pnpm install`. The pre-commit hook runs `lint-staged`, so a
   commit needs them as well as a check does.
2. Run `git submodule update --init --recursive` before any Rust build. Without the submodule,
   the `dxbc-spirv-sys` build script fails with `vendor/dxbc-spirv is empty`.

Setup is complete when `pnpm exec eslint --version` prints a version and
`crates/dxbc-spirv-sys/vendor/dxbc-spirv` holds files.

### Linked dependencies

For a branch that changes no dependency, a link to the main checkout's `node_modules` replaces
step 1. Use a junction on Windows and a symlink elsewhere. Git ignores the link.

```powershell
New-Item -ItemType Junction -Path node_modules -Target <main checkout>\node_modules
```

- `pnpm install` through the link writes into the main checkout. Remove the link first when the
  branch changes `package.json` or `pnpm-lock.yaml`, then install.
- Remove the link before removing the worktree, so that a recursive delete stops at the worktree.

## Running the app

`pnpm tauri dev` builds and starts the app from the worktree's code.

- One dev app runs at a time. Vite binds port 5173 with `strictPort`, and the single-instance
  plugin passes a second launch to the app that is already open. Close that app first.
- The frontend hot-reloads from the worktree. Keep the worktree on its branch while the app runs,
  because checking out another branch replaces the code under test.
- A dev build reads and writes the same settings and library as the installed app.
