# Phase 1 Contracts — Tauri Commands

Two new IPC commands. Both follow the standard `IpcResult<T>` pattern (`src-tauri/src/error.rs`) and the 7-step "Adding a New Tauri Command" checklist in `AGENTS.md`.

## `get_mod_wad_report`

**Purpose**: Read-only lookup. Used by `useModWadReport(modId)` to populate the badge.

### Rust signature

```rust
#[tauri::command]
pub async fn get_mod_wad_report(
    state: State<'_, WadReportState>,
    mod_id: String,
) -> IpcResult<Option<ModWadReport>>
```

### Behavior

1. Lock `WadReportState` (`MutexResultExt`).
2. Call `store.get(&mod_id)`.
3. Return `Ok(Some(report))` (with `is_stale` filled in) or `Ok(None)`.
4. No I/O, no upstream calls — pure cache read. Constant time.

### Errors

| Code                | When                                             |
| ------------------- | ------------------------------------------------ |
| `MUTEX_LOCK_FAILED` | Poisoned mutex (should never happen in practice) |
| `INTERNAL_STATE`    | Store not initialized (programmer error)         |

### TypeScript binding (in `lib/tauri.ts`)

```ts
export interface ModWadReport {
  modId: string;
  affectedWads: string[];
  wadCount: number;
  overrideCount: number;
  contentFingerprint: bigint | null; // u64 via ts-rs
  gameIndexFingerprint: bigint;      // u64 via ts-rs
  computedAt: string;                // ISO 8601
  isStale: boolean;
}

api.getModWadReport(modId: string): Promise<Result<ModWadReport | null, AppError>>
api.getAllModWadReports(): Promise<Result<Record<string, ModWadReport>, AppError>>
```

---

## `analyze_mod_wads`

**Purpose**: Force a fresh single-mod analysis without running the full patcher. Used by `useAnalyzeModWads`.

### Rust signature

```rust
#[tauri::command]
pub async fn analyze_mod_wads(
    settings: State<'_, SettingsState>,
    library: State<'_, LibraryState>,
    reports: State<'_, WadReportState>,
    mod_id: String,
) -> IpcResult<ModWadReport>
```

### Behavior

1. Resolve the mod entry from `LibraryState`.
2. Build a `ModContentProvider` for the mod (existing helper in `mods/library.rs`).
3. `tokio::task::spawn_blocking(|| ltk_overlay::analyze_single_mod(provider, &game_index))` — produces a `ModWadReport`.
4. Lock `WadReportState`, `upsert(report.clone())`, save.
5. Return the report.

The analyze path does NOT touch the patcher mutex and does NOT write any overlay artifacts. It is safe to invoke while the patcher is running (FR-007 / US3 acceptance scenario 2).

### Errors

| Code                 | When                                            |
| -------------------- | ----------------------------------------------- |
| `MOD_NOT_FOUND`      | `mod_id` not in library                         |
| `MODPKG` / `FANTOME` | Archive read failure during metadata collection |
| `LEAGUE_NOT_FOUND`   | Game path not configured                        |
| `INTERNAL_STATE`     | Store not initialized                           |
| `MUTEX_LOCK_FAILED`  | Poisoned mutex                                  |

Errors leave any prior cached report untouched (FR-011).

### TypeScript binding

```ts
api.analyzeModWads(modId: string): Promise<Result<ModWadReport, AppError>>
```

---

## Cache invalidation triggers (no command — internal)

| Trigger                                         | Action                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Patch run completes (`overlay::ensure_overlay`) | `WadReportStore::upsert_many(reports)` for every mod the build produced a report for                                          |
| Mod uninstalled                                 | `WadReportStore::prune_orphans` after the library mutation                                                                    |
| Mod reconcile detects archive change            | `WadReportStore::invalidate_by_content(mod_id)` — leaves the entry in place but the next `get()` will report `is_stale: true` |
| App startup                                     | `WadReportStore::load(path)` and `set_current_game_index_fp(current_fp)` once the game index is loaded                        |

---

## Frontend query/mutation contracts

```ts
// src/modules/library/api/keys.ts
export const libraryKeys = {
  // ... existing
  wadReports: () => [...libraryKeys.all, "wadReport"] as const,
  wadReport: (modId: string) => [...libraryKeys.wadReports(), modId] as const,
};

// src/modules/library/api/useModWadReport.ts
// Batch query — single IPC call fetches all reports
export function useAllModWadReports() {
  return useQuery({
    queryKey: libraryKeys.wadReports(),
    queryFn: queryFn(api.getAllModWadReports),
    staleTime: 5 * 60 * 1000,
  });
}

// Per-mod derivation via TanStack select (no extra IPC)
export function useModWadReport(modId: string) {
  return useAllModWadReports().data?.[modId] ?? null;
  // (actual impl uses useQuery with select for proper reactivity)
}

// src/modules/library/api/useAnalyzeModWads.ts
export function useAnalyzeModWads() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (modId) => unwrapForQuery(api.analyzeModWads(modId)),
    onSuccess: (report) => {
      // Patches the shared batch cache in-place
      qc.setQueryData(libraryKeys.wadReports(), (old) =>
        old ? { ...old, [report.modId]: report } : { [report.modId]: report },
      );
      toast.success(`Analyzed: affects ${report.wadCount} WAD(s)`);
    },
    onError: (err) => toast.error(extractMessage(err)),
  });
}
```

`useOverlayProgress` listens for the `wad-reports-updated` Tauri event (emitted after the cache is persisted) and invalidates `libraryKeys.wadReports()` so badges refresh after a patch run.
