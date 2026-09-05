// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components";
import type { BinRow, ClassSchema, WorkshopProject } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { ProjectProvider } from "../../components/ProjectContext";
import { BinRowLine } from "../BinRow";
import type { RowLine } from "../binRows";

const ENTRY = "0x2a1f3c7d";
const SKIN_CLASS = "0x9b67e9f6";

/** Past the hover delay a card opens after. */
const HOVER = { timeout: 2000 };

function row(overrides: Partial<BinRow>): BinRow {
  return {
    entry: ENTRY,
    path: "0000000a",
    label: "name",
    node: "property",
    name: "name",
    unnamed: false,
    kind: "string",
    value: { type: "string", value: "text" },
    declared: null,
    ...overrides,
  };
}

function line(row: BinRow, owner: string | null = SKIN_CLASS): RowLine {
  return {
    kind: "row",
    key: `${row.entry}:${row.path}`,
    row,
    depth: 1,
    expanded: false,
    loading: false,
    owner,
  };
}

const SCHEMA: ClassSchema = {
  name: "SkinCharacterDataProperties",
  build: 8104348,
  fields: [
    {
      hash: "0x0000000a",
      name: "championSkinName",
      declared: { kind: "string", key: null, value: null },
      revisions: [
        { from: 5229820, to: 8049184, shape: { kind: "hash", key: null, value: null } },
        { from: 8104348, to: null, shape: { kind: "string", key: null, value: null } },
      ],
    },
    {
      hash: "0x0000000b",
      name: "iconCircle",
      declared: { kind: "option", key: null, value: "file" },
      revisions: [{ from: 5229820, to: null, shape: { kind: "option", key: null, value: "file" } }],
    },
  ],
};

/* The class card offers Find all references, which opens a document of the project the
   card is mounted in. */
const PROJECT: WorkshopProject = {
  path: "C:/mods/skin",
  name: "skin",
  displayName: "Skin",
  version: "1.0.0",
  description: "",
  authors: [],
  tags: [],
  champions: [],
  maps: [],
  layers: [],
  thumbnailPath: null,
  lastModified: "2026-08-21T21:14:02Z",
};

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ProjectProvider project={PROJECT}>
        <ToastProvider>{children}</ToastProvider>
      </ProjectProvider>
    </QueryClientProvider>
  );
}

function renderLine(visible: RowLine, onToggle: (key: string) => void = () => {}) {
  return render(<BinRowLine line={visible} focused={false} onToggle={onToggle} />, {
    wrapper: Providers,
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command: string) => {
    if (command === "class_schema") return Promise.resolve({ ok: true, value: SCHEMA });
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(() => Promise.resolve()) },
  });
});

describe("the tag", () => {
  it("follows every property and element row, composed from what the value holds", () => {
    renderLine(
      line(
        row({
          name: "armorMaterial",
          kind: "list",
          value: { type: "container", len: 8, itemKind: "embed" },
        }),
      ),
    );
    expect(screen.getByText("list[embed]")).toBeInTheDocument();
  });

  it("carries an element's own kind", () => {
    renderLine(
      line(
        row({
          node: "element",
          path: "0000000a[0]",
          name: "[0]",
          kind: "map",
          value: { type: "map", len: 2, keyKind: "hash", valueKind: "string" },
        }),
        null,
      ),
    );
    expect(screen.getByText("map[hash,string]")).toBeInTheDocument();
  });

  it("is absent from an object row", () => {
    renderLine(
      line(
        row({
          node: "object",
          path: "",
          name: "Characters/Aatrox",
          kind: null,
          value: { type: "struct", classHash: SKIN_CLASS, class: "CharacterRecord", len: 2 },
        }),
        null,
      ),
    );
    expect(screen.queryByText("pointer")).toBeNull();
    expect(screen.queryByRole("img", { name: "Type mismatch" })).toBeNull();
  });
});

describe("the mismatch mark", () => {
  it("marks a row whose file kind differs from the declared one, and names the declared kind", async () => {
    renderLine(
      line(
        row({
          name: "iconCircle",
          kind: "string",
          declared: { shape: { kind: "option", key: null, value: "file" }, mismatch: true },
        }),
      ),
    );

    expect(screen.getByRole("img", { name: "Type mismatch" })).toBeInTheDocument();

    await userEvent.hover(screen.getByText("string"));
    const declared = await screen.findByText("option[file]", {}, HOVER);
    expect(declared.parentElement).toHaveTextContent(/^Declared\s*option\[file\]$/);
  });

  it("leaves a row the schema agrees with unmarked", () => {
    renderLine(
      line(
        row({
          declared: { shape: { kind: "string", key: null, value: null }, mismatch: false },
        }),
      ),
    );
    expect(screen.queryByRole("img", { name: "Type mismatch" })).toBeNull();
  });
});

describe("the class card", () => {
  const embed = row({
    name: "skinMeshProperties",
    kind: "embed",
    value: {
      type: "struct",
      classHash: SKIN_CLASS,
      class: "SkinCharacterDataProperties",
      len: 2,
    },
  });

  it("opens on hover with the schema's fields at the install's build", async () => {
    renderLine(line(embed));

    await userEvent.hover(screen.getByRole("button", { name: "SkinCharacterDataProperties" }));
    const card = await screen.findByRole("dialog", { name: "SkinCharacterDataProperties" }, HOVER);

    expect(await within(card).findByText("2 fields")).toBeInTheDocument();
    expect(within(card).getByText("at build 8104348")).toBeInTheDocument();
    expect(within(card).getByText("championSkinName")).toBeInTheDocument();
    expect(within(card).getByText("option[file]")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("class_schema", { classHash: SKIN_CLASS });
  });

  it("pins on a click without toggling the row, copies the name and the hash, and closes on Esc", async () => {
    const onToggle = vi.fn();
    renderLine(line(embed), onToggle);

    await userEvent.click(screen.getByRole("button", { name: "SkinCharacterDataProperties" }));
    const card = await screen.findByRole("dialog", { name: "SkinCharacterDataProperties" });
    expect(onToggle).not.toHaveBeenCalled();

    await userEvent.click(await within(card).findByRole("button", { name: "Copy name" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("SkinCharacterDataProperties"),
    );
    await userEvent.click(within(card).getByRole("button", { name: "Copy hash" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SKIN_CLASS));

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "SkinCharacterDataProperties" })).toBeNull(),
    );
  });

  it("names a class the tables miss by its hash, and says the schema has no line for it", async () => {
    mockInvoke.mockImplementation(() => Promise.resolve({ ok: true, value: null }));
    renderLine(
      line(
        row({
          kind: "pointer",
          value: { type: "struct", classHash: "0x0000beef", class: null, len: 1 },
        }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "0x0000beef" }));
    const card = await screen.findByRole("dialog", { name: "0x0000beef" });

    expect(await within(card).findByText("Not in the schema")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Copy name" })).toBeNull();
  });
});

describe("the field card", () => {
  const expandable = row({
    name: "championSkinName",
    kind: "embed",
    value: { type: "struct", classHash: SKIN_CLASS, class: "Part", len: 1 },
    declared: { shape: { kind: "string", key: null, value: null }, mismatch: false },
  });

  it("opens on hover with the declared kind and the revisions", async () => {
    renderLine(line(expandable));

    await userEvent.hover(screen.getByRole("button", { name: "championSkinName" }));
    const card = await screen.findByRole("dialog", { name: "championSkinName" }, HOVER);

    expect(await within(card).findByText("5229820 – 8049184")).toBeInTheDocument();
    expect(within(card).getByText("since 8104348")).toBeInTheDocument();
    expect(within(card).getByText("Declared")).toBeInTheDocument();
    expect(within(card).getByText("0x0000000a")).toBeInTheDocument();
  });

  it("pins on a click without toggling the row, copies the name and the hash, and closes on Esc", async () => {
    const onToggle = vi.fn();
    renderLine(line(expandable), onToggle);

    await userEvent.click(screen.getByRole("button", { name: "championSkinName" }));
    const card = await screen.findByRole("dialog", { name: "championSkinName" });
    expect(onToggle).not.toHaveBeenCalled();

    await userEvent.click(within(card).getByRole("button", { name: "Copy name" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("championSkinName"),
    );
    await userEvent.click(within(card).getByRole("button", { name: "Copy hash" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("0x0000000a"));

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "championSkinName" })).toBeNull(),
    );
  });

  it("says a field the schema has no line for is not declared, and offers no name to copy", async () => {
    renderLine(line(row({ name: "0x9c4e1b02", unnamed: true, path: "9c4e1b02" })));

    await userEvent.click(screen.getByRole("button", { name: "0x9c4e1b02" }));
    const card = await screen.findByRole("dialog", { name: "0x9c4e1b02" });

    expect(within(card).getByText("Not declared at this build")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Copy name" })).toBeNull();
    expect(within(card).getByRole("button", { name: "Copy hash" })).toBeInTheDocument();
  });
});
