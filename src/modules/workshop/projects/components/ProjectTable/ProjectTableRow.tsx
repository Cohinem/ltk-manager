import { memo } from "react";

import {
  ArrangedCurrentRing,
  type RowDensity,
  tableCellClass,
  tableCellStyle,
  tableContentClass,
  tableEdgeClass,
  tableRowFillClass,
} from "@/components";
import type { WorkshopProject } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useWorkshopSelectionStore } from "../../../state";
import { useWorkshopTestState } from "../../../testing/api/useWorkshopTestState";
import { useProjectThumbnail } from "../../api/useProjectThumbnail";
import { ProjectCardContextMenu, useProjectMenuScope } from "../ProjectCardParts";
import type { ProjectColumnSpec, ProjectRowView } from "./columns";

interface ProjectTableRowProps {
  project: WorkshopProject;
  rowKey: string;
  columns: ProjectColumnSpec[];
  density: RowDensity;
  /** Whether this is the current row, the one the keys move from. */
  isCurrent: boolean;
  /** Whether the rows above and below are picked too, so the picks draw as one block. */
  joinTop: boolean;
  joinBottom: boolean;
  /** Offset from the top of the rows, from the virtualizer. */
  top: number;
  height: number;
  onPress: (event: React.MouseEvent, rowKey: string, path: string) => void;
  onRowEnter: (rowKey: string, path: string, buttons: number) => void;
  onEdit: (project: WorkshopProject) => void;
}

/**
 * One project's row in the workshop table.
 *
 * A bare press opens the project, as a card does, and a modifier picks it. Per
 * "The table" in docs/ux/WORKSHOP.md.
 */
export const ProjectTableRow = memo(function ProjectTableRow({
  project,
  rowKey,
  columns,
  density,
  isCurrent,
  joinTop,
  joinBottom,
  top,
  height,
  onPress,
  onRowEnter,
  onEdit,
}: ProjectTableRowProps) {
  const { data: thumbnailUrl } = useProjectThumbnail(project.path, project.thumbnailPath);
  const selected = useWorkshopSelectionStore((s) => s.selectedPaths.has(project.path));
  const testState = useWorkshopTestState(project);
  const { scope, onContextMenu } = useProjectMenuScope(project);

  const locked = testState.kind !== "idle";
  const isTestingThis = testState.kind === "building-this" || testState.kind === "running-this";
  const view: ProjectRowView = { project, thumbnailUrl, selected, locked, isTestingThis, onEdit };

  function handleClick(event: React.MouseEvent) {
    if ((event.target as HTMLElement).closest("[data-no-row]")) return;
    onPress(event, rowKey, project.path);
  }

  const row = (
    <div
      role="row"
      aria-selected={selected}
      aria-current={isCurrent || undefined}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onPointerEnter={(event) => onRowEnter(rowKey, project.path, event.buttons)}
      style={{
        height,
        transform: `translateY(${top}px)`,
        gridTemplateColumns: "var(--table-cols)",
      }}
      className={twMerge(
        "group/row absolute inset-x-0 top-0 grid cursor-pointer items-stretch py-px text-row text-surface-400 select-none",
        joinTop && "pt-0",
        joinBottom && "pb-0",
        tableRowFillClass(isCurrent, selected),
        locked && !isTestingThis && "opacity-50",
      )}
    />
  );

  return (
    <ProjectCardContextMenu card={row} scope={scope} project={project} onEdit={onEdit}>
      {columns.map((column, index) => {
        const { Cell } = column;
        return (
          <div
            key={column.id}
            role="gridcell"
            style={tableCellStyle(column)}
            className={tableCellClass(
              column,
              tableEdgeClass(index, columns.length, joinTop, joinBottom),
            )}
          >
            <div className={tableContentClass(column, false)}>
              <Cell view={view} rowKey={rowKey} density={density} />
            </div>
          </div>
        );
      })}
      {isCurrent && <ArrangedCurrentRing className="inset-x-0 inset-y-px" />}
    </ProjectCardContextMenu>
  );
});
