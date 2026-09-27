import { ImageIcon } from "@phosphor-icons/react";
import type { NodeProps } from "@xyflow/react";
import { use, useMemo } from "react";

import { useClassSchema } from "../../../classes/hooks/useClassSchema";
import { emitterLabel } from "../../inspector/utils/emitterLabels";
import { renderPreviewHeight } from "../utils/driverLayout";
import type { RenderItem } from "../utils/graphItems";
import { itemSubtitle, itemTitle } from "../utils/nodeText";
import { outputTop } from "../utils/outputSocket";
import { drawnInSection } from "../utils/renderSection";
import { embeddedValues } from "../utils/socketEmbed";
import { MasterLine, type MasterLineProps, StructBody } from "./EmitterNodes";
import { FIELD_PAD, FieldBody, holderRow, SectionLine, useRowsAt } from "./FieldLines";
import { GraphActionsContext } from "./graphActions";
import { NodeHeader, Output, type RenderFlowNode } from "./GraphNodes";
import { RenderAdd } from "./MasterAdd";
import { NodeFrame } from "./NodeFrame";
import { RenderPreview } from "./RenderPreview";

/**
 * An emitter's primitive, texture and render fields as one Texture node, the fields
 * `VfxLegacyRenderComponent` gathers: the primitive's sketch and the texture's picture over
 * the rows, and an input per struct or keyed value the rows hold.
 */
export function RenderNodeView({ data, selected }: NodeProps<RenderFlowNode>) {
  const { item, width, height } = data.placed;

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      item={item}
      plate={renderPreviewHeight(item) > 0 ? "none" : "inside"}
    >
      <NodeHeader
        icon={ImageIcon}
        iconTone="text-bin-class-text"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
        extra={<RenderAdd item={item} />}
      />
      <RenderPreview item={item} />
      <div className={FIELD_PAD}>
        <RenderBody item={item} />
      </div>
      <Output kind={null} top={outputTop(item)} />
    </NodeFrame>
  );
}

function RenderBody({ item }: { item: RenderItem }) {
  const actions = use(GraphActionsContext);
  const entry = actions?.entry ?? "";
  const rows = useRowsAt(item.wire, item.rowCount);
  const { data: schema } = useClassSchema(item.classHash === "" ? null : item.classHash);
  const holder = useMemo(() => holderRow(entry, item.wire), [entry, item.wire]);
  const embedded = useMemo(() => embeddedValues(item), [item]);
  const shown = useMemo(() => (rows === null ? [] : [...rows.values()]), [rows]);

  /* The rows are the emitter's, so the node keys its link checks apart from the master's. */
  return (
    <FieldBody wire={item.id} rows={shown}>
      {item.fields.map((field) => (
        <RenderLine
          key={field.hash}
          field={field}
          row={rows?.get(`${item.wire}.${field.hash.slice(2)}`)}
          holder={holder}
          schema={schema?.fields}
          owner={item.classHash}
          embedded={embedded}
        />
      ))}
    </FieldBody>
  );
}

/**
 * One field of a Texture node: an effect folded in as a section of its fields, whose inputs
 * the node takes over, or the master's own line.
 */
function RenderLine(props: MasterLineProps) {
  const { field, row, embedded } = props;
  if (field.input?.type !== "struct" || !drawnInSection(field.hash, field.input)) {
    return <MasterLine {...props} />;
  }

  const label = emitterLabel(field.hash, row?.name) ?? row?.name ?? field.hash;
  return (
    <>
      <SectionLine title={label} />
      <StructBody item={field.input} embedded={embedded} />
    </>
  );
}
