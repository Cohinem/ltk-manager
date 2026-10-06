import { CubeIcon, ImageIcon } from "@phosphor-icons/react";
import type { NodeProps } from "@xyflow/react";
import { use, useMemo } from "react";

import { useClassSchema } from "../../../classes/hooks/useClassSchema";
import { emitterLabel } from "../../inspector/utils/emitterLabels";
import { renderPreviewed } from "../utils/driverLayout";
import type { RenderItem } from "../utils/graphItems";
import { itemSubtitle, itemTitle } from "../utils/nodeText";
import { outputTop } from "../utils/outputSocket";
import { drawnInSection } from "../utils/renderSection";
import { embeddedValues } from "../utils/socketEmbed";
import { ClassAction } from "./ClassAction";
import { MasterLine, type MasterLineProps, StructBody } from "./EmitterNodes";
import { FIELD_PAD, FieldBody, holderRow, SectionLine, useRowsAt } from "./FieldLines";
import { GeometryPreview } from "./GeometryPreview";
import { GraphActionsContext } from "./graphActions";
import { NodeHeader, Output, type RenderFlowNode } from "./GraphNodes";
import { RenderAdd } from "./MasterAdd";
import { NodeFrame } from "./NodeFrame";
import { RenderPreview } from "./RenderPreview";
import { ShapeInViewButton } from "./ShapeOverlay";

/**
 * A component node of an emitter's fields, and an input per struct or keyed value its rows hold.
 *
 * The Texture node gathers the texture and render fields, the ones `VfxLegacyRenderComponent`
 * gathers, under the texture's picture. The Geometry node gathers the spawn shape, the primitive
 * and the fields that orient it, under a view of the emitter's particles over its spawn shape,
 * and its header shows the shape in the viewport.
 */
export function RenderNodeView({ data, selected }: NodeProps<RenderFlowNode>) {
  const { item, width, height, nameWidth } = data.placed;

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      item={item}
      plate={renderPreviewed(item) ? "none" : "inside"}
    >
      <NodeHeader
        icon={item.role === "geometry" ? CubeIcon : ImageIcon}
        /* DS-KIND-HUE, DS-TEXT */
        iconTone={item.role === "geometry" ? "text-graph-geometry-text" : "text-bin-class-text"}
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
        extra={
          <>
            {item.role === "geometry" && <ShapeInViewButton id={item.id} />}
            <RenderAdd item={item} />
          </>
        }
      />
      {item.role === "geometry" && <GeometryPreview item={item} />}
      {item.role === "texture" && <RenderPreview item={item} />}
      <div className={FIELD_PAD}>
        <RenderBody item={item} nameWidth={nameWidth} />
      </div>
      <Output kind={null} top={outputTop(item)} />
    </NodeFrame>
  );
}

function RenderBody({ item, nameWidth }: { item: RenderItem; nameWidth?: number }) {
  const actions = use(GraphActionsContext);
  const entry = actions?.entry ?? "";
  const rows = useRowsAt(item.wire, item.rowCount);
  const { data: schema } = useClassSchema(item.classHash === "" ? null : item.classHash);
  const holder = useMemo(() => holderRow(entry, item.wire), [entry, item.wire]);
  const embedded = useMemo(() => embeddedValues(item), [item]);
  const shown = useMemo(() => (rows === null ? [] : [...rows.values()]), [rows]);

  /* The rows are the emitter's, so the node keys its link checks apart from the master's. */
  return (
    <FieldBody wire={item.id} rows={shown} nameWidth={nameWidth}>
      {item.fields.map((field) => (
        <RenderLine
          key={field.hash}
          field={field}
          row={rows?.get(`${item.wire}.${field.hash.slice(2)}`)}
          holder={holder}
          schema={schema?.fields}
          owner={item.classHash}
          embedded={embedded}
          nameWidth={nameWidth}
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
  const { field, row, embedded, nameWidth } = props;
  if (field.input?.type !== "struct" || !drawnInSection(field.hash, field.input)) {
    return <MasterLine {...props} />;
  }

  const label = emitterLabel(field.hash, row?.name) ?? row?.name ?? field.hash;
  return (
    <>
      <SectionLine title={label} action={<ClassAction item={field.input} />} />
      <StructBody item={field.input} nameWidth={nameWidth} embedded={embedded} />
    </>
  );
}
