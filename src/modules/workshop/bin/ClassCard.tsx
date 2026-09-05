import { CopyIcon, HashIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { twMerge } from "tailwind-merge";

import { Button, Code, Popover, Spinner } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { errorSummary, m } from "@/i18n";
import type { ClassSchema, FieldSchema } from "@/lib/tauri";

/* The leaf rather than the references barrel, which pulls the document that draws a
   class card of its own. */
import { classReferences, useFindReferences } from "../references/useFindReferences";
import { shapeTag } from "./kindTag";
import { useClassSchema } from "./useClassSchema";

/** Hover for this long opens the card, the tooltip delay. A click does not wait. */
const CARD_DELAY = 600;

interface ClassCardProps {
  /** `0x` and eight hex digits. */
  classHash: string;
  /** The class as the tables name it. Null where no table does. */
  name: string | null;
}

/**
 * A class name as a control: a card on hover, pinned by a click, closed by `Esc`.
 *
 * "The class card" in docs/ux/BIN_EDITOR.md. The body mounts when the card opens, which
 * is when its query runs.
 */
export function ClassCard({ classHash, name }: ClassCardProps) {
  const label = name ?? classHash;

  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={CARD_DELAY}
        render={<button type="button" onClick={keepRowShut} />}
        className={twMerge(
          "min-w-0 cursor-pointer truncate rounded-sm text-left text-surface-400 decoration-dotted underline-offset-2 hover:underline",
          name === null && "font-mono text-code",
        )}
      >
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6}>
          <Popover.Popup aria-label={label} className="w-80 p-3 text-meta select-none">
            <ClassCardBody classHash={classHash} name={name} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A click on the control pins the card. The row under it keeps its expansion. */
function keepRowShut(event: ReactMouseEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

function ClassCardBody({ classHash, name }: ClassCardProps) {
  const copy = useCopyToClipboard();
  const find = useFindReferences();
  const { data, error, isPending } = useClassSchema(classHash);

  return (
    <div data-ui="ClassCard" className="flex flex-col gap-2">
      <header className="flex min-w-0 flex-col items-start gap-1">
        {name !== null && (
          <span className="max-w-full truncate text-row font-medium text-surface-100 select-text">
            {name}
          </span>
        )}
        <Code className="select-text">{classHash}</Code>
      </header>
      {isPending && <Spinner size="sm" />}
      {error && <span className="text-surface-400">{errorSummary(error)}</span>}
      {data === null && (
        <span className="text-surface-400">{m.workshop_bin_class_unknown_empty()}</span>
      )}
      {data && <Fields schema={data} />}
      <footer className="flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="xs"
          left={<MagnifyingGlassIcon />}
          onClick={() => find(classReferences(classHash, name))}
        >
          {m.workshop_references_find_class_action()}
        </Button>
        {name !== null && (
          <Button
            variant="ghost"
            size="xs"
            left={<CopyIcon />}
            onClick={() => void copy(name, m.workshop_bin_name_label())}
          >
            {m.workshop_bin_copy_name_action()}
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          left={<HashIcon />}
          onClick={() => void copy(classHash, m.workshop_bin_hash_label())}
        >
          {m.workshop_bin_copy_hash_action()}
        </Button>
      </footer>
    </div>
  );
}

/** The schema's fields at the card's build, each with its kind. */
function Fields({ schema }: { schema: ClassSchema }) {
  return (
    <div className="flex min-h-0 flex-col gap-1">
      <span className="flex items-center gap-2 text-surface-400">
        <span>{m.workshop_bin_class_fields_label({ count: schema.fields.length })}</span>
        <span aria-hidden>·</span>
        <span>{m.workshop_bin_at_build_label({ build: schema.build })}</span>
      </span>
      <ul className="flex max-h-64 flex-col overflow-y-auto scrollbar-md select-text">
        {schema.fields.map((field) => (
          <Field key={field.hash} field={field} />
        ))}
      </ul>
    </div>
  );
}

/** One field: its name, and its kind at the card's build. A field with none there is dim. */
function Field({ field }: { field: FieldSchema }) {
  return (
    <li className="flex items-center gap-2 rounded-sm px-1 py-px hover:bg-surface-veil">
      <span
        className={twMerge(
          "truncate text-surface-200",
          field.name === null && "font-mono text-code text-surface-300",
          field.declared === null && "text-surface-400",
        )}
      >
        {field.name ?? field.hash}
      </span>
      {field.declared !== null && (
        <span className="ml-auto shrink-0 font-mono text-code text-surface-400">
          {shapeTag(field.declared)}
        </span>
      )}
    </li>
  );
}
