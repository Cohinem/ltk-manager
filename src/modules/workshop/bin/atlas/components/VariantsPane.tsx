import { CaretRightIcon, WarningIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo, useState } from "react";

import { RadioGroup, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { Notice } from "../../shared/preview/Notice";
import {
  type VariantSlot,
  type VariantTarget,
  variantSlots,
  variantTargets,
} from "../engine/model/variants";
import type { View } from "../engine/model/view";
import { useAtlasView } from "../hooks/useAtlasSources";
import { useAtlasPreviewActions, useViewVariant, viewKey } from "../state/atlasPreview";

/** The radio value of the base, which no controller field name can be. */
const BASE = ":base";

export interface VariantsPaneProps {
  readonly document: BinDocumentId;
  readonly entry: string;
}

/**
 * The variants pane: the base and every override slot the controller links, one of them drawn
 * over the base on the canvas, and the records of the drawn one under the objects they patch.
 *
 * A mobile or tablet slot is marked as one the Windows client never lays, and a slot whose file
 * does not ship cannot be drawn. A record row selects its element, and a record the base no
 * longer fits carries why the client skips it.
 */
export function VariantsPane({ document, entry }: VariantsPaneProps) {
  const { view, tree, error, pending } = useAtlasView(document, entry);
  const key = viewKey(document, entry);
  const drawn = useViewVariant(key);
  const { setVariant, select } = useAtlasPreviewActions();
  const slots = useMemo(() => (view === null ? [] : variantSlots(view.files)), [view]);
  const targets = useMemo(() => (tree === null ? [] : variantTargets(tree)), [tree]);

  if (error !== null) return <Notice text={m.workshop_bin_atlas_view_error()} />;
  if (pending || view === null) return <Notice text={m.workshop_bin_atlas_view_pending()} />;
  if (slots.length === 0) return <Notice text={m.workshop_bin_atlas_variants_empty()} />;

  const base = view.files.find((file) => file.role === "base");

  return (
    <div
      data-ui="VariantsPane"
      /* DS-SCROLLBAR */
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5 pb-1.5 text-row scrollbar-md select-none"
    >
      <RadioGroup.Root
        aria-label={m.workshop_bin_pane_variants_label()}
        value={drawn ?? BASE}
        onValueChange={(value) => setVariant(key, value === BASE ? null : String(value))}
        className="gap-1"
      >
        <RadioGroup.Card
          value={BASE}
          title={m.workshop_bin_atlas_variants_base_label()}
          description={base === undefined ? undefined : fileName(base.path)}
          className="p-2"
        />
        {slots.map((slot) => (
          <SlotCard key={slot.slot} slot={slot} />
        ))}
      </RadioGroup.Root>

      {view.variant !== null && (
        <VariantRecords
          variant={view.variant}
          targets={targets}
          onSelect={(object) => select(key, object)}
        />
      )}
    </div>
  );
}

function SlotCard({ slot }: { slot: VariantSlot }) {
  return (
    <RadioGroup.Card
      value={slot.slot}
      title={slot.slot}
      description={fileName(slot.path)}
      badge={slotMark(slot)}
      disabled={!slot.shipped}
      className="p-2"
    />
  );
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** What sets a slot apart: a file that does not ship, or a slot the Windows client never lays. */
function slotMark(slot: VariantSlot): ReactNode {
  if (!slot.shipped) return <SlotMark label={m.workshop_bin_atlas_variants_missing_label()} />;
  if (slot.onPc) return null;

  return (
    <SlotMark
      label={m.workshop_bin_atlas_variants_not_pc_label()}
      hint={m.workshop_bin_atlas_variants_not_pc_hint()}
    />
  );
}

function SlotMark({ label, hint }: { label: string; hint?: string }) {
  const mark = (
    <span className="shrink-0 rounded-sm bg-surface-veil px-1 text-fine text-surface-300">
      {label}
    </span>
  );
  if (hint === undefined) return mark;
  return <Tooltip content={hint}>{mark}</Tooltip>;
}

interface VariantRecordsProps {
  readonly variant: NonNullable<View["variant"]>;
  readonly targets: readonly VariantTarget[];
  readonly onSelect: (object: string) => void;
}

/** What the drawn variant did, then its records under the objects they patch, each folded. */
function VariantRecords({ variant, targets, onSelect }: VariantRecordsProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const skipped = variant.records.filter((record) => record.skipped !== null).length;
  const toggle = (object: string) =>
    setOpen((held) => {
      const next = new Set(held);
      if (!next.delete(object)) next.add(object);
      return next;
    });

  return (
    <section
      className="flex flex-col gap-1"
      aria-label={m.workshop_bin_atlas_variants_records_title()}
    >
      <div className="flex flex-col px-1 text-meta text-surface-400">
        <span>
          {m.workshop_bin_atlas_variants_applied_label({
            applied: variant.records.length - skipped,
            skipped,
          })}
        </span>
        {(variant.added.length > 0 || variant.deleted.length > 0) && (
          <span>
            {m.workshop_bin_atlas_variants_objects_label({
              added: variant.added.length,
              deleted: variant.deleted.length,
            })}
          </span>
        )}
      </div>
      <ul className="flex flex-col">
        {targets.map((target) => (
          <TargetRow
            key={target.object}
            target={target}
            open={open.has(target.object)}
            onFold={() => toggle(target.object)}
            onSelect={() => onSelect(target.object)}
          />
        ))}
      </ul>
    </section>
  );
}

interface TargetRowProps {
  readonly target: VariantTarget;
  readonly open: boolean;
  readonly onFold: () => void;
  readonly onSelect: () => void;
}

function TargetRow({ target, open, onFold, onSelect }: TargetRowProps) {
  const stale = target.records.some((record) => record.skipped !== null);

  return (
    <li className="flex flex-col">
      {/* DS-VEIL, DS-RADIUS */}
      <div className="flex h-6 items-center gap-1.5 rounded-sm pr-1 hover:bg-surface-veil-soft">
        <button
          type="button"
          aria-expanded={open}
          aria-label={m.workshop_bin_atlas_variants_fold_action({ object: target.label })}
          className="flex h-4 w-3 shrink-0 cursor-pointer items-center justify-center text-surface-400"
          onClick={onFold}
        >
          <CaretRightIcon weight="bold" className={twMerge("size-3", open && "rotate-90")} />
        </button>
        <button
          type="button"
          className={twMerge(
            "flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left",
            !target.element && "text-surface-400",
          )}
          onClick={target.element ? onSelect : onFold}
        >
          <span className="min-w-0 truncate">{target.label}</span>
          {stale && <WarningIcon className="size-3.5 shrink-0 text-warning-text" />}
          <span className="ml-auto shrink-0 pl-2 text-meta text-surface-400">
            {m.workshop_bin_atlas_variants_records_label({ count: target.records.length })}
          </span>
        </button>
      </div>
      {open && (
        <ul className="flex flex-col pl-6">
          {target.records.map((record, at) => (
            <li
              key={`${record.path}:${at}`}
              className="flex h-5 items-center gap-1.5 font-mono text-code text-surface-300"
            >
              <span className="min-w-0 truncate select-text">{record.path}</span>
              {record.skipped !== null && (
                <Tooltip
                  content={m.workshop_bin_atlas_variants_skipped_hint({ reason: record.skipped })}
                >
                  <WarningIcon
                    aria-label={m.workshop_bin_atlas_variants_skipped_label()}
                    className="size-3.5 shrink-0 text-warning-text"
                  />
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
