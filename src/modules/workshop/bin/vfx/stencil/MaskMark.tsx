import {
  ExcludeSquareIcon,
  type Icon,
  IntersectSquareIcon,
  SelectionAllIcon,
  SubtractSquareIcon,
} from "@phosphor-icons/react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { useMaskHovered, useSetMaskHovered } from "./maskHover";
import type { MaskRole, MaskUse } from "./maskModel";
import { emitterNames, maskShort, roleLine } from "./maskText";
import { useStencilMask } from "./useStencil";

const GLYPH: Record<MaskRole, Icon> = {
  writes: SelectionAllIcon,
  inside: IntersectSquareIcon,
  outside: ExcludeSquareIcon,
  writesOutside: SubtractSquareIcon,
};

/**
 * The mask an emitter uses, as a chip on its lane or its graph frame: a glyph for its role and
 * the mask's short name.
 *
 * Its hover names the role and lists the emitters on the other side of the mask, and lights
 * every other mark of the same mask. "The stencil" in docs/ux/BIN_EDITOR.md.
 */
export function MaskMark({ use, className }: { use: MaskUse; className?: string }) {
  const mask = useStencilMask(use.key);
  const lit = useMaskHovered(use.key);
  const setHovered = useSetMaskHovered();
  const Glyph = GLYPH[use.role];
  const line = roleLine(use.role, use.name);
  const writers = mask?.writers ?? [];
  const testers = mask?.testers ?? [];

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-1">
          <span>{line}</span>
          {writers.length > 0 && (
            <span className="text-surface-400">
              {m.workshop_bin_stencil_mask_writers_description({ names: emitterNames(writers) })}
            </span>
          )}
          {testers.length > 0 && (
            <span className="text-surface-400">
              {m.workshop_bin_stencil_mark_testers_hint({ names: emitterNames(testers) })}
            </span>
          )}
        </span>
      }
    >
      <span
        role="img"
        aria-label={line}
        data-ui="MaskMark"
        data-mask={use.key}
        /* DS-RADIUS */
        className={twMerge(
          "flex shrink-0 items-center gap-0.5 rounded-sm px-0.5 font-mono text-meta text-surface-400",
          lit && "bg-accent-500/15 text-accent-300",
          className,
        )}
        onPointerEnter={() => setHovered(use.key)}
        onPointerLeave={() => setHovered(null)}
      >
        <Glyph weight="bold" className="size-3 shrink-0" />
        <span className="max-w-12 truncate">{maskShort(use.name)}</span>
      </span>
    </Tooltip>
  );
}
