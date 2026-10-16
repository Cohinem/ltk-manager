import { useQuery } from "@tanstack/react-query";
import { createContext, use, useMemo } from "react";

import type { DataTableColumn } from "@/components";
import { m } from "@/i18n";
import type { BinRow, SchemaParam } from "@/lib/tauri";

import { Cell, type WidgetProps } from "../../classes/components/ClassCells";
import { nameHash } from "../../shared/utils/binHash";
import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { useElementField, useEntryWrite } from "../hooks/useEntryEdits";
import { useShaderReadOptions } from "../hooks/useMaterialProgram";
import type { ListKind } from "../state/declaredTable";
import type { DeclaredRow } from "../utils/declaredRows";
import { type ShaderMark, type ShaderMarks, shaderMarks } from "../utils/shaderMarks";
import { DeclaredCell, Heading } from "./DeclaredRow";
import { DeclaredTable } from "./DeclaredTable";
import { isColor, LiveParam, SwatchLaneContext } from "./LiveParam";
import { FIELD, VALUE_WIDTH, ValueCell } from "./MaterialCells";

/** The fields of a shader def's list classes, by hash. */
const SHADER_FIELD = {
  data: nameHash("data"),
  defaultTexturePath: nameHash("defaultTexturePath"),
  samplerName: nameHash("samplerName"),
  onByDefault: nameHash("onByDefault"),
  /* The runtime flag of `ShaderStaticSwitch`. The hash tables hold no name for it. */
  runtime: "0x066e669c",
} as const;

const PARAMETERS: ListKind = {
  list: nameHash("parameters"),
  className: "ShaderPhysicalParameter",
  nameField: FIELD.name,
};
const TEXTURES: ListKind = {
  list: nameHash("textures"),
  className: "ShaderTexture",
  nameField: FIELD.name,
};
const STATIC_SWITCHES: ListKind = {
  list: nameHash("staticSwitches"),
  className: "ShaderStaticSwitch",
  nameField: FIELD.name,
};

const FILL = "w-full";
const FILL_CUT = "w-full max-w-0 min-w-28";
const BOX = "flex shrink-0 items-center";
const NO_NAMES: readonly string[] = [];

interface ShaderRead {
  /** The hash of the material that the preview draws, which a held value is keyed by. */
  readonly drawn: string | null;
  readonly marks: ShaderMarks | null;
  /** `true` if a parameter of the def is a color, so every row reserves space for a swatch. */
  readonly colors: boolean;
}

const NO_READ: ShaderRead = { drawn: null, marks: null, colors: false };

const ShaderReadContext = createContext<ShaderRead>(NO_READ);

/* `material` disables the live drag but shows no note, since a material sets most rows. */
const MARK_TEXT: Record<ShaderMark, (() => string) | null> = {
  unread: m.workshop_bin_shader_mark_unread_label,
  absent: m.workshop_bin_shader_mark_absent_label,
  material: null,
};

/** Returns the drawn material, the row marks and the swatch lane of a shader def's tables. */
function useShaderRead({ view }: WidgetProps): ShaderRead {
  const read = useQuery(useShaderReadOptions(view.document, view.entry, true)).data ?? null;

  return useMemo(() => {
    if (read === null) return NO_READ;

    const schema = read.program.passes[0]?.pass.schema;
    return {
      drawn: read.program.hash,
      marks: shaderMarks(read, schema?.switches ?? []),
      colors: schema?.params.some(isColor) ?? false,
    };
  }, [read]);
}

/** Returns the marks of one table as the text its name column shows, by row name. */
function markTexts(marks: ReadonlyMap<string, ShaderMark> | undefined): Map<string, string> {
  const texts = new Map<string, string>();
  for (const [name, mark] of marks ?? []) {
    const text = MARK_TEXT[mark];
    if (text !== null) texts.set(name, text());
  }
  return texts;
}

function DefaultValue({ row }: { row: DeclaredRow<never> }) {
  if (row.element === null) return null;
  return <ElementDefault element={row.element} name={row.name} />;
}

/**
 * A parameter's default, dragged live on the preview. It edits as a plain vector if the preview
 * material sets its own value or the drawn permutation does not read it.
 */
function ElementDefault({ element, name }: { element: BinRow; name: string }) {
  const { drawn, marks } = use(ShaderReadContext);
  const edit = use(LeafEditContext);
  const writeEntry = useEntryWrite();
  const data = useElementField(element, SHADER_FIELD.data);

  const mark = marks?.params.get(name);
  const vector = data?.value.type === "vector" ? data.value : null;
  const live =
    edit !== null &&
    writeEntry !== null &&
    drawn !== null &&
    (data === undefined || vector !== null) &&
    mark === undefined;
  if (!live) {
    return <ValueCell element={element} field={SHADER_FIELD.data} className={VALUE_WIDTH} />;
  }

  const stored = vector === null ? null : vector.values.map((each) => each ?? 0);

  const param: SchemaParam = {
    name,
    physical: name,
    fields: 0b1111,
    default: [0, 0, 0, 0],
  };
  const write = async (values: number[]) => {
    if (data === undefined) {
      return writeEntry(element, SHADER_FIELD.data, { type: "vector", values });
    }
    return (await edit.commit(data, { ok: true, leaf: { type: "vector", values } })) !== false;
  };

  return (
    <Cell row={data} className={VALUE_WIDTH}>
      <LiveParam param={param} material={drawn} stored={stored} write={write} />
    </Cell>
  );
}

/** One field of the row's element, in the leaf editor its type takes. */
function FieldCell({
  row,
  field,
  className,
}: {
  row: DeclaredRow<never>;
  field: string;
  className: string;
}) {
  if (row.element === null) return null;
  return <ValueCell element={row.element} field={field} className={className} />;
}

const PARAM_COLUMNS: DataTableColumn<DeclaredRow<never>>[] = [
  {
    id: "default",
    header: () => <Heading className={FILL}>{m.workshop_bin_shader_default_label()}</Heading>,
    cell: ({ row }) => (
      <DeclaredCell className={FILL}>
        <DefaultValue row={row.original} />
      </DeclaredCell>
    ),
  },
];

const TEXTURE_COLUMNS: DataTableColumn<DeclaredRow<never>>[] = [
  {
    id: "texture",
    header: () => <Heading className={FILL}>{m.workshop_bin_material_texture_label()}</Heading>,
    cell: ({ row }) => (
      <DeclaredCell className={FILL_CUT}>
        <FieldCell row={row.original} field={SHADER_FIELD.defaultTexturePath} className={FILL} />
      </DeclaredCell>
    ),
  },
  {
    id: "sampler",
    header: () => <Heading>{m.workshop_bin_shader_sampler_label()}</Heading>,
    cell: ({ row }) => (
      <DeclaredCell>
        <FieldCell row={row.original} field={SHADER_FIELD.samplerName} className={BOX} />
      </DeclaredCell>
    ),
  },
];

const SWITCH_COLUMNS: DataTableColumn<DeclaredRow<never>>[] = [
  {
    id: "on",
    header: () => <Heading>{m.workshop_bin_shader_on_by_default_label()}</Heading>,
    cell: ({ row }) => (
      <DeclaredCell>
        <FieldCell row={row.original} field={SHADER_FIELD.onByDefault} className={BOX} />
      </DeclaredCell>
    ),
  },
  {
    id: "runtime",
    header: () => <Heading className={FILL}>{m.workshop_bin_shader_runtime_label()}</Heading>,
    cell: ({ row }) => (
      <DeclaredCell className={FILL}>
        <FieldCell row={row.original} field={SHADER_FIELD.runtime} className={BOX} />
      </DeclaredCell>
    ),
  },
];

/**
 * `parameters` as a table of each physical parameter and its default, dragged live on the
 * preview. "The material shell" in docs/ux/BIN_EDITOR.md.
 */
export function ShaderParams(props: WidgetProps) {
  const read = useShaderRead(props);
  return (
    <ShaderReadContext value={read}>
      <SwatchLaneContext value={read.colors}>
        <DeclaredTable
          {...props}
          kind={PARAMETERS}
          declarations={null}
          names={NO_NAMES}
          columns={PARAM_COLUMNS}
          notes={markTexts(read.marks?.params)}
        />
      </SwatchLaneContext>
    </ShaderReadContext>
  );
}

/** `textures` as a table of each texture, its default path and its shared sampler. */
export function ShaderTextures(props: WidgetProps) {
  const read = useShaderRead(props);
  return (
    <DeclaredTable
      {...props}
      kind={TEXTURES}
      declarations={null}
      names={NO_NAMES}
      columns={TEXTURE_COLUMNS}
      notes={markTexts(read.marks?.textures)}
    />
  );
}

/** `staticSwitches` as a table of each switch, its default and whether it is read at run time. */
export function ShaderSwitches(props: WidgetProps) {
  const read = useShaderRead(props);
  return (
    <DeclaredTable
      {...props}
      kind={STATIC_SWITCHES}
      declarations={null}
      names={NO_NAMES}
      columns={SWITCH_COLUMNS}
      notes={markTexts(read.marks?.switches)}
    />
  );
}
