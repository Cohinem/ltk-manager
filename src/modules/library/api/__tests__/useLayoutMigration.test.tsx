// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import type { FailedConversion, LayoutMigrationState } from "@/lib/tauri";
import { mockInvoke, mockListen } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { libraryKeys } from "../keys";
import { useLayoutMigration } from "../useLayoutMigration";

const task = { report: vi.fn(), close: vi.fn() };
const toast = { toast: vi.fn(), success: vi.fn(), error: vi.fn(), task: vi.fn(() => task) };

vi.mock("@/components", () => ({ useToast: () => toast }));

function failure(overrides?: Partial<FailedConversion>): FailedConversion {
  return {
    id: "broken-mod",
    displayName: "Broken Mod",
    error: "The archive could not be read",
    quarantineDir: "/storage/quarantine/broken-mod",
    ...overrides,
  };
}

/** Mount the hook over a backend answering `state` when asked. */
function mount(state: LayoutMigrationState) {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "get_layout_migration_state") return Promise.resolve({ ok: true, value: state });
    return Promise.resolve({ ok: true, value: null });
  });

  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...renderHook(() => useLayoutMigration(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    }),
  };
}

function emit(event: string, payload: unknown) {
  const listener = (mockListen as Mock).mock.calls.find(([name]) => name === event)?.[1];
  act(() => listener({ payload }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListen.mockReturnValue(Promise.resolve(vi.fn()));
});

describe("useLayoutMigration", () => {
  /* The run starts with the app and reports `pending` until it has an answer,
     which is the window where announcing anything would be announcing a guess. */
  it("says nothing while the startup pass has not reported", async () => {
    const { result } = mount({ status: "pending" });

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());

    expect(result.current).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("stays quiet on a launch with nothing to move", async () => {
    const { result } = mount({ status: "idle" });

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());

    expect(result.current).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  /* A run that finished before this window existed has no event left to catch,
     so asking is the only way it is ever heard about. */
  it("picks up a run that ended before the window opened", async () => {
    const { result } = mount({
      status: "finished",
      report: { migrated: 3, failed: [] },
    });

    await waitFor(() => expect(result.current).toEqual({ migrated: 3, failed: [] }));
    expect(toast.success).toHaveBeenCalledWith(
      "Library upgraded",
      "3 mods moved into the new layout.",
    );
  });

  it("picks up a run that finishes while the window is open", async () => {
    const { result } = mount({ status: "pending" });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());

    emit("layout-migration-finished", { migrated: 1, failed: [] });

    await waitFor(() => expect(result.current).toEqual({ migrated: 1, failed: [] }));
    expect(toast.success).toHaveBeenCalledWith(
      "Library upgraded",
      "1 mod moved into the new layout.",
    );
  });

  /* Both routes can land for the same run, and the user upgraded once. */
  it("announces one run once however many ways it hears about it", async () => {
    const { result } = mount({
      status: "finished",
      report: { migrated: 2, failed: [] },
    });
    await waitFor(() => expect(result.current).not.toBeNull());

    emit("layout-migration-finished", { migrated: 2, failed: [] });

    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  /* The failures get a dialog of their own, and a success beside it would be
     telling the user the upgrade went well while it lists what did not. */
  it("reports failures without calling the upgrade a success", async () => {
    const report = { migrated: 2, failed: [failure()] };
    const { result } = mount({ status: "finished", report });

    await waitFor(() => expect(result.current).toEqual(report));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("opens one task for the run and reports each mod through it", async () => {
    mount({ status: "pending" });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());

    emit("layout-migration-progress", { current: 1, total: 4, currentMod: "Ashe Skin" });
    emit("layout-migration-progress", { current: 2, total: 4, currentMod: "Aatrox Skin" });

    expect(toast.task).toHaveBeenCalledExactlyOnceWith("Upgrading your mod library");
    expect(task.report).toHaveBeenLastCalledWith(50, "2 of 4 - Aatrox Skin");
  });

  /* Every mod moved out from under the list the frontend is holding. */
  it("refetches the library once the run lands", async () => {
    const { queryClient, result } = mount({
      status: "finished",
      report: { migrated: 1, failed: [] },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() => expect(result.current).not.toBeNull());

    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryKeys.mods() });
  });
});
