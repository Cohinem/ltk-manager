// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BinRow, FieldSchema } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { FieldLabelsContext } from "../../../../classes/state/fieldLabels";
import { nameHash } from "../../../../shared/utils/binHash";
import { LeafEditContext } from "../../../../tree/hooks/useLeafEdit";
import { RowDocumentContext } from "../../../../tree/state/rowFold";
import { rowKey } from "../../../../tree/utils/binRows";
import { SHAPE_FIELD } from "../../utils/emissionSource";
import type { DefaultField } from "../../utils/emitterGroups";
import { emitterLabel } from "../../utils/emitterLabels";
import { ShapeProperty } from "../ShapeProperty";
import { addRotationEdits, removeRotationEdits, ROTATION } from "../ShapeRotations";

const SPHERE = nameHash("VfxShapeSphere");
const FLAGS = nameHash("flags");
const LEGACY = nameHash("VfxShapeLegacy");

function schemaField(name: string, declared: FieldSchema["declared"], extra = {}): FieldSchema {
  return {
    hash: nameHash(name),
    name,
    declared,
    classHash: null,
    defaultValue: null,
    owner: null,
    revisions: [],
    ...extra,
  };
}

const SCHEMAS: Record<string, { name: string; fields: FieldSchema[] }> = {
  [SPHERE]: {
    name: "VfxShapeSphere",
    fields: [
      schemaField("radius", { kind: "f32", key: null, value: null }, { defaultValue: "0" }),
      schemaField("flags", { kind: "u8", key: null, value: null }),
    ],
  },
  [LEGACY]: {
    name: "VfxShapeLegacy",
    fields: [
      schemaField(
        "emitRotationAngles",
        { kind: "list", key: null, value: "embed" },
        { defaultValue: "[]" },
      ),
      schemaField(
        "emitRotationAxes",
        { kind: "list", key: null, value: "vec3" },
        { defaultValue: "[]" },
      ),
    ],
  },
};

const reads = new Map<string, BinRow[]>();

vi.mock("../../../../classes/hooks/useClassSchema", () => ({
  useClassSchema: (classHash: string | null) => ({
    data: classHash === null ? undefined : SCHEMAS[classHash],
  }),
}));
vi.mock("../../../../documents/hooks/useBinRead", () => ({
  useBinRead: (_document: number, requests: readonly { key: string }[]) =>
    new Map(requests.map(({ key }) => [key, { rows: reads.get(key) ?? [] }])),
}));
vi.mock("../../../../classes/components/ClassCells", async (original) => ({
  ...(await original<typeof import("../../../../classes/components/ClassCells")>()),
  AlsoCheck: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../../../documents/components/DeclaredLayer", () => ({
  DeclaredRowState: () => null,
  DeclaredRowMark: () => null,
  DeclaredDiagnosticsMark: () => null,
}));

afterEach(cleanup);
beforeEach(() => {
  mockInvoke.mockReset();
  reads.clear();
});

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

const field: DefaultField = {
  hash: SHAPE_FIELD,
  name: "SpawnShape",
  declared: { kind: "pointer", key: null, value: null },
  classHash: nameHash("IVfxShape"),
  defaultValue: "null",
};

function shapeRow(classHash: string, name: string, len: number): BinRow {
  return {
    entry: holder.entry,
    path: `${holder.path}.${SHAPE_FIELD.slice(2)}`,
    label: `${holder.label}.SpawnShape`,
    name: "SpawnShape",
    node: "property",
    unnamed: false,
    kind: "pointer",
    declared: null,
    value: { type: "struct", classHash, class: name, len },
  };
}

function mount(authored?: BinRow) {
  const commit = vi.fn();
  const editProperty = vi.fn().mockResolvedValue(true);
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <LeafEditContext value={{ commit, editProperty, refused: new Map() }}>
        <RowDocumentContext value={1}>
          <FieldLabelsContext value={emitterLabel}>
            <ShapeProperty
              field={field}
              holder={holder}
              authored={authored}
              width="w-32"
              owner="0x09cde442"
            />
          </FieldLabelsContext>
        </RowDocumentContext>
      </LeafEditContext>
    </QueryClientProvider>,
  );

  return { editProperty };
}

describe("ShapeProperty", () => {
  it("writes the picked class if the emitter has no shape", async () => {
    const { editProperty } = mount();
    const picker = screen.getByRole("combobox", { name: "Spawn Shape" });
    expect(picker).toHaveTextContent("Not set");

    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole("option", { name: /^Sphere/ }));

    expect(editProperty).toHaveBeenCalledWith(holder, SHAPE_FIELD, [
      { type: "replacePointer", path: "", class: SPHERE },
    ]);
  });

  it("writes the fill bit of a held volume shape that has no flags", async () => {
    const authored = shapeRow(SPHERE, "VfxShapeSphere", 0);
    const { editProperty } = mount(authored);
    expect(screen.getByRole("combobox", { name: "Spawn Shape" })).toHaveTextContent("Sphere");
    expect(screen.getByPlaceholderText("0")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "None" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: /FillVolume/ }));

    expect(editProperty).toHaveBeenCalledWith(
      authored,
      FLAGS,
      expect.arrayContaining([
        expect.objectContaining({ type: "setLeaf", value: expect.objectContaining({ text: "1" }) }),
      ]),
    );
  });

  it("pairs the rotation lists and edits both in one edit", async () => {
    const authored = shapeRow(LEGACY, "VfxShapeLegacy", 2);
    const list = (field: string, name: string): BinRow => ({
      ...authored,
      path: `${authored.path}.${field.slice(2)}`,
      label: `${authored.label}.${name}`,
      name,
      node: "property",
      kind: "list",
      value: { type: "container", len: 1, itemKind: "embed" },
    });
    const angles = list(ROTATION.angles, "emitRotationAngles");
    const axes = list(ROTATION.axes, "emitRotationAxes");
    reads.set(rowKey(authored), [angles, axes]);
    reads.set(rowKey(angles), [
      {
        ...angles,
        path: `${angles.path}[0]`,
        name: "[0]",
        node: "element",
        value: { type: "struct", classHash: nameHash("ValueFloat"), class: "ValueFloat", len: 0 },
      },
    ]);
    reads.set(rowKey(axes), [
      {
        ...axes,
        path: `${axes.path}[0]`,
        name: "[0]",
        node: "element",
        kind: "vec3",
        value: { type: "vector", values: [0, 1, 0] },
      },
    ]);
    const { editProperty } = mount(authored);

    expect(screen.getByText("Axis 1")).toBeInTheDocument();
    expect(screen.getByText("Angle 1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add rotation" }));
    expect(editProperty).toHaveBeenCalledWith(holder, SHAPE_FIELD, addRotationEdits(1, 1));

    await userEvent.click(screen.getByRole("button", { name: "Remove rotation 1" }));
    expect(editProperty).toHaveBeenCalledWith(holder, SHAPE_FIELD, removeRotationEdits(0, 1, 1));
  });
});
