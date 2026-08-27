// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FailedConversion, LayoutMigrationReport } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";

import { LibraryMigrationDialog } from "../LibraryMigrationDialog";

const useLayoutMigration = vi.fn<() => LayoutMigrationReport | null>();
vi.mock("../../api", () => ({ useLayoutMigration: () => useLayoutMigration() }));

function failure(overrides?: Partial<FailedConversion>): FailedConversion {
  return {
    id: "broken-mod",
    displayName: "Broken Mod",
    error: "The archive could not be read",
    quarantineDir: "/storage/quarantine/broken-mod",
    ...overrides,
  };
}

function show(report: LayoutMigrationReport | null) {
  useLayoutMigration.mockReturnValue(report);
  render(<LibraryMigrationDialog />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue({ ok: true, value: null });
});

describe("LibraryMigrationDialog", () => {
  it("stays out of the way while the run has not reported", () => {
    show(null);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /* The upgrade announces itself through a toast. This dialog is only for the
     half worth interrupting for. */
  it("stays out of the way when every mod moved", () => {
    show({ migrated: 12, failed: [] });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names every mod it could not move and why", () => {
    show({
      migrated: 4,
      failed: [
        failure(),
        failure({ id: "other", displayName: "Other Mod", error: "Its metadata was unreadable" }),
      ],
    });

    expect(screen.getByText("Broken Mod")).toBeInTheDocument();
    expect(screen.getByText("The archive could not be read")).toBeInTheDocument();
    expect(screen.getByText("Other Mod")).toBeInTheDocument();
    expect(screen.getByText("Its metadata was unreadable")).toBeInTheDocument();
  });

  it("counts the failures in its title", () => {
    show({ migrated: 4, failed: [failure(), failure({ id: "other" })] });

    expect(screen.getByText("2 mods could not be upgraded")).toBeInTheDocument();
  });

  it("says mod rather than mods for a single failure", () => {
    show({ migrated: 4, failed: [failure()] });

    expect(screen.getByText("1 mod could not be upgraded")).toBeInTheDocument();
  });

  /* A failed mod's own directory is gone. Quarantine is where its files went,
     and opening anywhere else would send the user to an empty folder. */
  it("reveals the quarantine directory the files were parked in", async () => {
    const user = userEvent.setup();
    show({ migrated: 0, failed: [failure()] });

    await user.click(screen.getByRole("button", { name: /Reveal/ }));

    expect(mockInvoke).toHaveBeenCalledWith("reveal_in_explorer", {
      path: "/storage/quarantine/broken-mod",
    });
  });

  /* The mods stay in the library wearing their fault, so this is an
     acknowledgement rather than a decision to come back to. */
  it("closes for good once the reader is done with it", async () => {
    const user = userEvent.setup();
    show({ migrated: 0, failed: [failure()] });

    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
