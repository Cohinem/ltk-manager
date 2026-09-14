<!--
  Sync Impact Report
  Version change: N/A -> 1.0.0 (initial ratification)
  Added principles:
    - I. Code Quality & Maintainability
    - II. Type Safety & Error Handling
    - III. Testing Standards
    - IV. User Experience Consistency
    - V. Performance Requirements
  Added sections:
    - Technology Constraints
    - Development Workflow
    - Governance
  Templates requiring updates:
    - .specify/templates/plan-template.md: OK (no changes needed)
    - .specify/templates/spec-template.md: OK (no changes needed)
    - .specify/templates/tasks-template.md: OK (no changes needed)
  Follow-up TODOs: none
-->

# LTK Manager Constitution

## Core Principles

### I. Code Quality & Maintainability

- All code MUST follow the conventions established in AGENTS.md
  and `.cursorrules` without exception.
- Comments MUST only explain non-obvious business logic, workarounds,
  edge cases, or "why" decisions. Trivially descriptive comments are
  prohibited.
- All public Rust APIs MUST have `///` doc comments.
- Frontend code MUST import from barrel exports (`@/components`,
  `@/modules/{module}`), never from internal subpaths.
- JSX MUST use early returns or `&&` conditionals; ternary operators
  in JSX are prohibited.
- New UI primitives from `@base-ui-components/react` MUST be wrapped
  in `src/components/` before use in module code.
- Avoid over-engineering: no premature abstractions, no feature flags
  for single-use code, no backwards-compatibility shims. Three similar
  lines are preferred over a premature helper.
- Frontend components MUST consume global state (hooks, queries, stores)
  directly where needed, not receive it as drilled props. Props are only
  appropriate for parent-owned UI coordination (e.g., dialog state).

### II. Type Safety & Error Handling

- All Tauri commands MUST return `IpcResult<T>` on the Rust side and
  use the `Result<T, E>` discriminated union on the TypeScript side.
- Errors MUST use the `ErrorCode` enum with structured context where
  applicable (`AppErrorResponse::new(code, msg).with_context(...)`).
- Frontend error handling MUST use `hasErrorCode()` guards and
  context extractors from `utils/errors.ts`.
- TypeScript types in `lib/tauri.ts` MUST match their corresponding
  Rust structs exactly. Any Rust struct change MUST be reflected
  in the TS bindings before the PR merges.
- Query/mutation hooks MUST use `queryFn()`, `queryFnWithArgs()`, or
  `mutationFn()` from `utils/query.ts` to bridge `Result<T>` with
  TanStack Query.

### III. Testing Standards

- All new Tauri commands MUST be manually verified through the UI
  before merging, covering both success and error paths.
- `pnpm check` (typecheck + lint + format:check) MUST pass with zero
  errors before any PR is merged.
- `cargo clippy -p ltk-manager` MUST pass with zero warnings before
  any PR is merged.
- `cargo fmt -p ltk-manager --check` MUST produce no diffs.
- When fixing a bug, the PR description MUST include steps to
  reproduce and verify the fix.
- New features MUST document their test scenarios in the spec or PR
  description, including edge cases and error states.

### IV. User Experience Consistency

- All interactive elements MUST use components from `@/components`.
  Raw HTML elements (`<button>`, `<input>`, etc.) are prohibited in
  module code.
- Toast notifications MUST be used for user-facing feedback on
  async operations (success and failure) via the `useToast()` hook.
- Loading states MUST be shown for any operation that may take longer
  than 200ms.
- Error states MUST present actionable information to the user, not
  raw error codes or stack traces.
- The dark theme is the default. All new UI MUST be tested in both
  dark and light themes before merging.
- Color usage MUST use the established token system (`surface-*`,
  `brand-*`) and the CSS custom property accent system. Hard-coded
  color values are prohibited.

### V. Performance Requirements

- The application window MUST become interactive within 3 seconds of
  launch on a mid-range machine.
- Mod install/uninstall operations MUST provide progress feedback to
  the user via Tauri events; the UI MUST NOT freeze during these
  operations.
- File I/O operations in the Rust backend MUST be performed off the
  main Tauri thread. Long-running operations MUST use the existing
  thread + `Arc<AtomicBool>` stop-flag pattern from `patcher/`.
- Frontend bundle size MUST be monitored. Unnecessary dependencies
  MUST NOT be added without justification.
- State mutations that trigger re-renders MUST be scoped to the
  smallest affected component tree. Zustand stores MUST use
  selectors to prevent unnecessary re-renders.

## Technology Constraints

- **Runtime**: Tauri v2 (Rust backend + WebView frontend).
- **Backend**: Rust (latest stable). All business logic lives in
  dedicated modules under `src-tauri/src/`. Commands are thin
  wrappers in `src-tauri/src/commands/`.
- **Frontend**: React 19+ with TypeScript (strict mode). Vite for
  bundling. Tailwind CSS v4 for styling.
- **State management**: TanStack Query for server state, Zustand for
  client-only state. These boundaries MUST NOT be crossed (no
  Zustand for server-cached data, no TanStack Query for ephemeral
  UI state).
- **Routing**: TanStack Router with file-based route generation.
  Route files live in `src/routes/`.
- **Forms**: TanStack Form with Zod validation schemas.
- **Package manager**: pnpm. No other JS package manager may be used.

## Development Workflow

- All changes MUST pass `pnpm check` and `cargo clippy` before
  requesting review.
- New Tauri commands MUST follow the 7-step checklist documented in
  AGENTS.md under "Adding a New Tauri Command".
- Commit messages MUST follow Conventional Commits format
  (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- Files MUST be read before editing. Assumptions about file contents
  from memory are prohibited.
- Feature branches MUST target `main`.

## Governance

- This constitution supersedes all ad-hoc practices. When a conflict
  arises between this document and other guidance, this document
  wins unless AGENTS.md explicitly overrides a specific point.
- Amendments require: (1) a description of the change, (2) rationale,
  and (3) an update to the version number following semver rules:
  - MAJOR: principle removal or backward-incompatible redefinition.
  - MINOR: new principle or materially expanded guidance.
  - PATCH: clarifications, typo fixes, non-semantic refinements.
- All PRs and code reviews MUST verify compliance with these
  principles. Non-compliance MUST be flagged as a blocking issue.
- Refer to `AGENTS.md` for runtime development guidance and
  command reference.

**Version**: 1.0.0 | **Ratified**: 2026-03-06 | **Last Amended**: 2026-03-06
