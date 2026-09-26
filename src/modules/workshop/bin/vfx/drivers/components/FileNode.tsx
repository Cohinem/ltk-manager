import { CubeIcon, FileIcon, type Icon, ImageIcon } from "@phosphor-icons/react";
import type { NodeProps } from "@xyflow/react";
import { useMemo } from "react";

import { RowValue } from "../../../tree/components/BinRow";
import type { FileItem, FileKind } from "../utils/graphItems";
import { itemSubtitle, itemTitle } from "../utils/nodeText";
import { FieldBody, Line, NoteLine, useRowsAt } from "./FieldLines";
import { type FileFlowNode, NodeHeader, Output } from "./GraphNodes";
import { NodeFrame } from "./NodeFrame";
import { FilePreview } from "./NodePreviews";

const FILE_ICON: Readonly<Record<FileKind, Icon>> = {
  texture: ImageIcon,
  mesh: CubeIcon,
  other: FileIcon,
};

/**
 * A file an emitter names: its preview by what it holds, over the path it edits.
 *
 * The field it feeds names the file's role, so the path takes the node's whole width.
 */
export function FileNodeView({ data, selected }: NodeProps<FileFlowNode>) {
  const { item, width, height } = data.placed;

  return (
    <NodeFrame item={item} width={width} height={height} selected={selected} plate="none">
      <NodeHeader
        icon={FILE_ICON[item.kind]}
        iconTone="text-doc-layer-text"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        wire={item.wire}
      />
      <FilePreview item={item} />
      <FileBody item={item} />
      <Output kind={null} />
    </NodeFrame>
  );
}

function FileBody({ item }: { item: FileItem }) {
  const rows = useRowsAt(item.holder, item.holderRows);
  const row = rows?.get(item.wire);
  const shown = useMemo(() => (row === undefined ? [] : [row]), [row]);

  return (
    <FieldBody wire={item.wire} rows={shown}>
      {row === undefined && <NoteLine label={item.label} />}
      {row !== undefined && (
        <Line className="px-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <RowValue row={row} />
          </div>
        </Line>
      )}
    </FieldBody>
  );
}
