// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContextMenu, ToastProvider } from "@/components";
import type { BinRow, DeclaredMark, RowDeclaration } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { RowDocumentContext } from "../../../tree/state/rowFold";
import { DeclaredRowsContext } from "../../hooks/useDeclared";
import { useCopiedReferenceStore } from "../../state/copiedReference";
import { DeclarationMenuItems } from "../DeclarationMenuItems";

const DOCUMENT = 7;
const REFERENCE = "Characters/Jade_Teemo/Skins/Skin0/Resources:resourceMap";

const ROW: BinRow = {
  entry: "0x2a1f3c7d",
  path: "0000000a",
  label: "resourceMap",
  node: "property",
  name: "resourceMap",
  unnamed: false,
  kind: "map",
  value: { type: "map", len: 2, keyKind: "hash", valueKind: "link" },
  declared: null,
};

const NO_MARKS: ReadonlyMap<string, DeclaredMark> = new Map();

function Menu({ declares, row = ROW }: { declares: boolean; row?: BinRow }) {
  const [client] = useState(() => createTestQueryClient());
  const rows = declares ? { layer: "base", marks: NO_MARKS, diagnostics: new Map() } : null;
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DeclaredRowsContext value={rows}>
          <RowDocumentContext value={DOCUMENT}>{children}</RowDocumentContext>
        </DeclaredRowsContext>
      </ToastProvider>
    </QueryClientProvider>
  );
  return wrap(
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <span>the row</span>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner>
          <ContextMenu.Popup>
            <DeclarationMenuItems row={row} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>,
  );
}

let spelled: RowDeclaration;
const writeText = vi.fn(() => Promise.resolve());

async function openMenu() {
  const user = userEvent.setup();
  /* The setup installs a clipboard of its own, so the spy goes in after it. */
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await user.pointer({ keys: "[MouseRight]", target: screen.getByText("the row") });
  return user;
}

beforeEach(() => {
  spelled = { declaration: "- entries:\n    A:\n      resourceMap: {}", reference: REFERENCE };
  useCopiedReferenceStore.setState({ reference: null });
  writeText.mockClear();
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command: string) => {
    if (command === "bin_row_declaration") return Promise.resolve({ ok: true, value: spelled });
    if (command === "bin_declare_reference") return Promise.resolve({ ok: true, value: null });
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

describe("the declaration actions of a row", () => {
  it("copies the reference behind its tag and holds it for a paste", async () => {
    render(<Menu declares={false} />);
    const user = await openMenu();

    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Copy reference" })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    await user.click(screen.getByRole("menuitem", { name: "Copy reference" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`!ref ${REFERENCE}`));
    expect(useCopiedReferenceStore.getState().reference).toBe(REFERENCE);
  });

  it("disables Copy as declaration with its reason where the value has no spelling", async () => {
    spelled = { declaration: null, reference: REFERENCE };
    render(<Menu declares={false} />);
    await openMenu();

    const item = await screen.findByRole("menuitem", { name: "Copy as declaration" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", expect.stringContaining("no table names"));
  });

  it("offers no paste outside a declared document", async () => {
    render(<Menu declares={false} />);
    await openMenu();

    await screen.findByRole("menuitem", { name: "Copy reference" });
    expect(screen.queryByRole("menuitem", { name: "Paste reference" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Merge reference" })).toBeNull();
  });

  it("merges the copied reference into a map of a declared document", async () => {
    useCopiedReferenceStore.setState({ reference: REFERENCE });
    render(<Menu declares />);
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: "Merge reference" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("bin_declare_reference", {
        document: DOCUMENT,
        entry: ROW.entry,
        path: ROW.path,
        reference: REFERENCE,
        merge: true,
      }),
    );
  });

  it("offers Merge reference on a list and a map alone", async () => {
    useCopiedReferenceStore.setState({ reference: REFERENCE });
    const leaf: BinRow = { ...ROW, kind: "f32", value: { type: "float", value: 1 } };
    render(<Menu declares row={leaf} />);
    await openMenu();

    await screen.findByRole("menuitem", { name: "Paste reference" });
    expect(screen.queryByRole("menuitem", { name: "Merge reference" })).toBeNull();
  });
});
