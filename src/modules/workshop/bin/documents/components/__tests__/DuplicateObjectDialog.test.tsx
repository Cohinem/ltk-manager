// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetRef, BinDocumentId, BinObjectHeader } from "@/lib/tauri";
import { editCall, landed } from "@/test/binEdit";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { DuplicateObjectDialog } from "../DuplicateObjectDialog";

const openAs = vi.fn();

vi.mock("../../../../state", async (original) => ({
  ...(await original<typeof import("../../../../state")>()),
  useOpenDocumentAs: () => openAs,
}));

const DOCUMENT = 7 as BinDocumentId;
const ASSET: AssetRef = {
  kind: "layer",
  project: "C:/mods/test",
  layer: "base",
  path: "data/characters/ahri/skins/skin0.bin",
};
const ENTRY = "0x1a2b3c4d";
const COPY = "0x99aabbcc";
const OBJECT: BinObjectHeader = {
  entry: ENTRY,
  name: "Characters/Ahri/Skins/Skin0/Particles/Ahri_Q",
  unnamed: false,
  classHash: "0x1176c5c0",
  class: "VfxSystemDefinitionData",
  properties: 4,
};

function renderDialog(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <DuplicateObjectDialog
        open
        onClose={onClose}
        document={DOCUMENT}
        asset={ASSET}
        file="skin0.bin"
        object={OBJECT}
      />
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  mockInvoke.mockReset();
  openAs.mockReset();
});

afterEach(cleanup);

describe("DuplicateObjectDialog", () => {
  it("sends a clone of the object under the typed name and opens the copy", async () => {
    mockInvoke.mockReturnValue(landed({ kind: "object", entry: COPY }));
    const onClose = renderDialog();
    const name = screen.getByLabelText("Name of the new object");

    await userEvent.clear(name);
    await userEvent.type(name, "Mods/Test/Ahri_Q_Blue");
    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockInvoke).toHaveBeenCalledWith(
      ...editCall(DOCUMENT, {
        kind: "object",
        edit: {
          kind: "create",
          name: "Mods/Test/Ahri_Q_Blue",
          origin: { type: "clone", source: ENTRY },
        },
      }),
    );
    expect(openAs).toHaveBeenCalledWith(
      expect.objectContaining({ objectHash: COPY, objectPath: "Mods/Test/Ahri_Q_Blue" }),
      "default",
    );
  });

  it("starts the name in the mod folder with the object's last segment", () => {
    renderDialog();

    expect(screen.getByLabelText("Name of the new object")).toHaveValue("Mods/mod/Ahri_Q");
  });

  it("keeps the dialog open with the refusal if the file holds the name", async () => {
    mockInvoke.mockResolvedValue({
      ok: false,
      error: {
        code: "BIN_EDIT_REJECTED",
        address: "Mods/mod/Ahri_Q",
        rejection: { reason: "objectExists" },
      },
    });
    const onClose = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name of the new object")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(openAs).not.toHaveBeenCalled();
  });
});
