import { CaretRightIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";

import { NumberField } from "@/components";
import { twMerge } from "@/utils";

import { useAtlasPreviewActions, useSectionOpen } from "../state/atlasPreview";

export interface SectionBlockProps {
  /** The name the section's fold is remembered by, the same for every element. */
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}

/** One titled block of the element inspector, which folds shut on its title. */
export function SectionBlock({ id, title, children }: SectionBlockProps) {
  const open = useSectionOpen(id);

  return (
    /* DS-GROUND, DS-RADIUS */
    <section className="flex flex-col gap-1.5 rounded-md border border-surface-700/50 bg-surface-900 p-2">
      <SectionHeading id={id} title={title} />
      {open && (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          {children}
        </div>
      )}
    </section>
  );
}

/** A section's title, as the switch that folds it. */
export function SectionHeading({ id, title }: { id: string; title: string }) {
  const open = useSectionOpen(id);
  const { toggleSection } = useAtlasPreviewActions();

  return (
    <h3 className="text-meta font-medium text-surface-300 select-none">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1 rounded-sm text-left hover:text-surface-100"
        onClick={() => toggleSection(id)}
      >
        <CaretRightIcon
          weight="bold"
          className={twMerge("h-3 w-3 shrink-0 text-surface-400", open && "rotate-90")}
        />
        {title}
      </button>
    </h3>
  );
}

/** One labelled line of a section. */
export function FieldLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="truncate text-meta text-surface-400 select-none">{label}</span>
      <div className="flex min-w-0 items-center gap-2 text-meta text-surface-200">{children}</div>
    </>
  );
}

export interface DraftNumberProps {
  readonly value: number;
  /** The short label that scrubs the value, such as `X`. */
  readonly scrub: string;
  readonly step?: number;
  readonly min?: number;
  readonly disabled: boolean;
  /** Write a committed value that differs from `value`. */
  readonly onCommit: (value: number) => void;
}

/**
 * A number field that holds what is typed or scrubbed until it is committed, and follows `value`
 * while nothing is held.
 */
export function DraftNumber({ value, scrub, step = 1, min, disabled, onCommit }: DraftNumberProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <NumberField
      value={draft}
      step={step}
      min={min}
      disabled={disabled}
      scrub={scrub}
      aria-label={scrub}
      rootClassName="min-w-0 flex-1"
      className="font-mono tabular-nums"
      onValueChange={(next) => {
        if (next !== null) setDraft(next);
      }}
      onValueCommitted={(next) => {
        if (next === null) {
          setDraft(value);
          return;
        }
        if (next !== value) onCommit(next);
      }}
    />
  );
}
