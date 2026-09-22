// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BinRow, ValueEdit } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { nameHash } from "../../../../shared/utils/binHash";
import { LeafEditContext } from "../../../../tree/hooks/useLeafEdit";
import { RowDocumentContext } from "../../../../tree/state/rowFold";
import type { DefaultField } from "../../utils/emitterGroups";
import { DefaultProperty } from "../DefaultProperty";

vi.mock("../../../../classes/hooks/useClassSchema", () => ({
  useClassSchema: () => ({
    data: {
      fields: [
        {
          hash: nameHash("constantValue"),
          declared: { kind: "vec3", key: null, value: null },
        },
      ],
    },
  }),
}));
vi.mock("../../../../documents/components/DeclaredLayer", () => ({
  DeclaredRowState: () => null,
  DeclaredRowMark: () => null,
  DeclaredDiagnosticsMark: () => null,
}));

afterEach(cleanup);
beforeEach(() => mockInvoke.mockReset());

const holder: BinRow = {
  entry: "0x00000001",
  path: "00000002[0]",
  label: "emitters[0]",
  name: "[0]",
  node: "element",
  unnamed: false,
  kind: "embed",
  declared: null,
  value: { type: "struct", classHash: "0x09cde442", class: "VfxEmitterDefinitionData", len: 0 },
};

function mount(field: DefaultField, authored?: BinRow) {
  const commit = vi.fn();
  const editProperty = vi.fn().mockResolvedValue(true);
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <LeafEditContext value={{ commit, editProperty, refused: new Map() }}>
        <RowDocumentContext value={1}>
          <DefaultProperty
            field={field}
            holder={holder}
            width="w-32"
            owner="0x09cde442"
            authored={authored}
          />
        </RowDocumentContext>
      </LeafEditContext>
    </QueryClientProvider>,
  );

  return { commit, editProperty };
}

describe("implicit emitter defaults", () => {
  it("shows a scalar constructor without writing it, then materializes its edit", async () => {
    const field = {
      hash: nameHash("bindWeight"),
      name: "bindWeight",
      declared: { kind: "f32" as const, key: null, value: null },
      defaultValue: "1",
    };
    const { commit, editProperty } = mount(field);
    const input = screen.getByPlaceholderText("1");
    expect(input).toHaveValue("");
    expect(editProperty).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, "0.5{Enter}");

    expect(commit).not.toHaveBeenCalled();
    expect(editProperty).toHaveBeenCalledWith(holder, field.hash, [
      { type: "setLeaf", path: "", value: { type: "float", value: 0.5 } },
    ]);
  });

  it("preserves the other default axes when an embedded constant is edited", async () => {
    const field = {
      hash: nameHash("birthScale0"),
      name: "birthScale0",
      classHash: "0x68dc32b6",
      declared: { kind: "embed" as const, key: null, value: null },
      defaultValue: '{"constantValue":[1,1,1],"dynamics":null}',
    };
    const { editProperty } = mount(field);
    const inputs = screen.getAllByPlaceholderText("1");
    expect(inputs).toHaveLength(3);
    expect(editProperty).not.toHaveBeenCalled();

    await userEvent.clear(inputs[1]);
    await userEvent.type(inputs[1], "2{Enter}");

    expect(editProperty).toHaveBeenCalledWith(holder, field.hash, [
      { type: "ensureProperty", path: "", field: nameHash("constantValue") },
      {
        type: "setLeaf",
        path: nameHash("constantValue").slice(2),
        value: { type: "vector", values: [1, 2, 1] },
      },
    ]);
  });

  it("creates dynamics from an implicit value-family row", async () => {
    const field = {
      hash: nameHash("birthScale0"),
      name: "birthScale0",
      classHash: nameHash("ValueVector3"),
      declared: { kind: "embed" as const, key: null, value: null },
      defaultValue: '{"constantValue":[1,1,1],"dynamics":null}',
    };
    const { editProperty } = mount(field);

    await userEvent.click(screen.getByRole("button", { name: "Animate value" }));

    expect(editProperty).toHaveBeenCalledWith(holder, field.hash, expect.any(Array));

    const edits = (editProperty.mock.calls[0]?.[2] ?? []) as ValueEdit[];
    expect(edits.slice(0, 4)).toEqual([
      { type: "ensureProperty", path: "", field: nameHash("dynamics") },
      {
        type: "ensurePointer",
        path: nameHash("dynamics").slice(2),
        class: "VfxAnimatedVector3f",
      },
      {
        type: "ensureProperty",
        path: nameHash("dynamics").slice(2),
        field: nameHash("times"),
      },
      {
        type: "ensureProperty",
        path: nameHash("dynamics").slice(2),
        field: nameHash("values"),
      },
    ]);
    expect(edits.filter((edit) => edit.type === "setLeaf")).toHaveLength(4);
  });

  it("does not invent a zero when the schema has no default", () => {
    const { editProperty } = mount({
      hash: nameHash("bindWeight"),
      name: "bindWeight",
      declared: { kind: "f32", key: null, value: null },
      defaultValue: null,
    });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Unknown default")).toBeInTheDocument();
    expect(screen.queryByText("Not drawn by this viewer")).toBeNull();
    expect(editProperty).not.toHaveBeenCalled();
  });

  it("shows complex and null defaults as single-row placeholders", () => {
    mount({
      hash: nameHash("SpawnShape"),
      name: "SpawnShape",
      declared: { kind: "embed", key: null, value: null },
      defaultValue: "{}",
    });
    mount({
      hash: nameHash("CustomMaterial"),
      name: "CustomMaterial",
      declared: { kind: "pointer", key: null, value: null },
      defaultValue: "null",
    });

    expect(screen.getByText("Default settings")).toHaveClass("italic");
    expect(screen.getByText("Not set")).toHaveClass("italic");
    expect(screen.queryByText("Not drawn by this viewer")).toBeNull();
  });

  it("keeps default checkboxes editable without an authored accent fill", async () => {
    const field: DefaultField = {
      hash: nameHash("isUniformScale"),
      name: "isUniformScale",
      declared: { kind: "bool", key: null, value: null },
      defaultValue: "true",
    };
    const { editProperty } = mount(field);
    const input = screen.getByRole("checkbox");
    expect(input).toBeChecked();
    expect(input).toHaveClass("border-dashed", "data-[checked]:bg-transparent");

    await userEvent.click(input);
    expect(editProperty).toHaveBeenCalledWith(holder, field.hash, [
      { type: "setLeaf", path: "", value: { type: "bool", value: false } },
    ]);
  });

  it("lets an enum placeholder be explicitly set to its default", async () => {
    const field: DefaultField = {
      hash: nameHash("blendMode"),
      name: "blendMode",
      declared: { kind: "u8", key: null, value: null },
      defaultValue: "1",
    };
    const { editProperty } = mount(field);
    const input = screen.getByRole("combobox");
    expect(input).toHaveTextContent("Alpha");
    expect(input).toHaveClass("border-dashed");
    expect(editProperty).not.toHaveBeenCalled();

    await userEvent.click(input);
    await userEvent.click(await screen.findByRole("option", { name: "Alpha" }));
    expect(editProperty).toHaveBeenCalledWith(holder, field.hash, [
      { type: "setLeaf", path: "", value: { type: "integer", text: "1" } },
    ]);
  });

  it("offers an empty text default as an editable placeholder", async () => {
    const field: DefaultField = {
      hash: nameHash("texture"),
      name: "texture",
      declared: { kind: "string", key: null, value: null },
      defaultValue: '""',
    };
    const { editProperty } = mount(field);
    const input = screen.getByPlaceholderText("empty");
    expect(input).toHaveValue("");
    expect(editProperty).not.toHaveBeenCalled();

    await userEvent.type(input, "particles/test.tex{Enter}");
    expect(editProperty).toHaveBeenCalledWith(holder, field.hash, [
      { type: "setLeaf", path: "", value: { type: "string", value: "particles/test.tex" } },
    ]);
  });
});

describe("emitter linger authoring", () => {
  const field: DefaultField = {
    hash: nameHash("emitterLinger"),
    name: "emitterLinger",
    declared: { kind: "option", key: null, value: "f32" },
    defaultValue: "0",
  };
  const authored: BinRow = {
    ...holder,
    path: `${holder.path}.${field.hash.slice(2)}`,
    name: field.name,
    node: "property",
    kind: "option",
    value: { type: "optional", itemKind: "f32", present: false },
  };

  it("materializes a missing optional float and edits its contained value", async () => {
    const { editProperty } = mount(field);
    expect(screen.getByText("Emitter Linger")).toBeInTheDocument();
    expect(editProperty).not.toHaveBeenCalled();

    await userEvent.type(screen.getByPlaceholderText("0"), "2.5{Enter}");
    expect(editProperty).toHaveBeenCalledWith(holder, field.hash, [
      { type: "setLeaf", path: "[0]", value: { type: "float", value: 2.5 } },
    ]);
  });

  it("inserts the value before editing an authored empty option", async () => {
    const { editProperty } = mount(field, authored);
    await userEvent.type(screen.getByPlaceholderText("0"), "3{Enter}");
    expect(editProperty).toHaveBeenCalledWith(holder, field.hash, [
      { type: "insertItem", path: "", item: { index: null, key: null, class: null } },
      { type: "setLeaf", path: "[0]", value: { type: "float", value: 3 } },
    ]);
  });

  it("loads an authored optional value without replacing it with the default", async () => {
    const item: BinRow = {
      ...authored,
      node: "element",
      name: "[0]",
      path: `${authored.path}[0]`,
      kind: "f32",
      value: { type: "float", value: 7 },
    };
    mockInvoke.mockResolvedValue({ ok: true, value: [{ rows: [item], total: 1 }] });
    const { editProperty } = mount(field, {
      ...authored,
      value: { type: "optional", itemKind: "f32", present: true },
    });
    expect(screen.getByText("Loading value…")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();

    const input = await screen.findByDisplayValue("7");
    expect(input).not.toHaveAttribute("placeholder");
    expect(editProperty).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, "8{Enter}");
    expect(editProperty).toHaveBeenCalledWith(holder, field.hash, [
      { type: "setLeaf", path: "[0]", value: { type: "float", value: 8 } },
    ]);
  });
});
