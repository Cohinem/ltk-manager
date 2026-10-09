// @vitest-environment happy-dom

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmHost } from "@/components";
import type { AppError } from "@/lib/tauri";
import { commandNames } from "@/test/commandNames";
import { mockInvoke } from "@/test/mocks/tauri";
import { renderWithProviders } from "@/test/utils";

import { LibraryErrorState } from "../LibraryStates";

const newerIndex: AppError = { code: "SCHEMA_VERSION_TOO_NEW", fileVersion: 3, maxSupported: 2 };

function rebuilds() {
  return mockInvoke.mock.calls.filter(
    ([name]) => name === commandNames.library.rebuildNewerLibraryIndex,
  );
}

async function askToRebuild(error: AppError) {
  renderWithProviders(
    <>
      <LibraryErrorState error={error} />
      <ConfirmHost />
    </>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Rebuild library" }));

  return within(await screen.findByRole("dialog"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue({ ok: true, value: null });
});

describe("LibraryErrorState", () => {
  it("rebuilds a newer index after the reader confirms", async () => {
    const dialog = await askToRebuild(newerIndex);

    await userEvent.click(dialog.getByRole("button", { name: "Rebuild library" }));

    await waitFor(() => expect(rebuilds()).toHaveLength(1));
  });

  it("does not rebuild a newer index when the reader cancels", async () => {
    const dialog = await askToRebuild(newerIndex);

    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rebuilds()).toHaveLength(0);
  });

  it("offers no rebuild for another load failure", () => {
    renderWithProviders(<LibraryErrorState error={{ code: "IO", detail: "Access is denied." }} />);

    expect(screen.queryByRole("button", { name: "Rebuild library" })).toBeNull();
  });
});
