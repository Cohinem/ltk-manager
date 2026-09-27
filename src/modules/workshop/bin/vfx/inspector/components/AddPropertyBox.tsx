import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { use, useEffect, useMemo, useState } from "react";

import { Combobox } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { binQueries } from "../../../documents/hooks/useBinDocument";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { RowDocumentContext } from "../../../tree/state/rowFold";
import {
  type AddSuggestion,
  fieldWire,
  propertyOf,
  shapeOf,
  suggestionLabel,
} from "../../../tree/utils/addProperty";
import { fieldHash, rowKey } from "../../../tree/utils/binRows";
import { shapeTag } from "../../../values/utils/kindTag";
import { useEmitters } from "../state/emitterChoice";
import { addSuggestions } from "../utils/addSuggestions";
import { fieldGroup, type InspectorGroup } from "../utils/emitterGroups";
import { emitterLabel } from "../utils/emitterLabels";

interface AddPropertyBoxProps {
  /** The emitter's struct row, which the property is added to. */
  holder: BinRow;
  /** The field hash of a property that landed, as `0x` and eight hex digits. */
  onAdded: (hash: string) => void;
  onClose: () => void;
}

/**
 * The inspector's add box, drawn in place of the property search while Add property is on.
 *
 * A pick adds the field at its schema default and clears the box for the next one. `Escape`
 * empties a box that holds text and otherwise closes it.
 */
export function AddPropertyBox({ holder, onAdded, onClose }: AddPropertyBoxProps) {
  const document = use(RowDocumentContext);
  const edit = use(LeafEditContext);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(false);
  const addable = useQuery({
    ...binQueries.addable(document ?? 0, holder.entry, holder.path),
    enabled: document !== null,
  });
  const suggestions = useMemo(
    () => addSuggestions(addable.data?.fields ?? [], text),
    [addable.data, text],
  );
  const refused = edit?.refused.get(rowKey(holder)) ?? null;

  const add = edit?.addProperty;
  if (document === null || add === undefined) return null;

  function pick(suggestion: AddSuggestion | null) {
    if (suggestion === null || pending || add === undefined) return;

    setPending(true);
    void add(holder, propertyOf(suggestion)).then((added) => {
      setPending(false);
      if (!added) return;

      setText("");
      onAdded(`0x${fieldWire(suggestion)}`);
    });
  }

  const label = m.workshop_bin_inspector_add_placeholder();

  return (
    <Combobox.Root<AddSuggestion>
      items={suggestions}
      inputValue={text}
      onInputValueChange={(next, details) => {
        if (details.reason === "input-clear" || details.reason === "none") return;
        setText(next);
      }}
      onValueChange={pick}
      open={open && suggestions.length > 0}
      onOpenChange={setOpen}
      filter={() => true}
      autoHighlight
      itemToStringLabel={suggestionLabel}
      itemToStringValue={suggestionLabel}
    >
      <div className="relative min-w-0 flex-1">
        <PlusIcon className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
        <Combobox.Input
          autoFocus
          placeholder={label}
          aria-label={label}
          aria-invalid={refused !== null || undefined}
          title={refused === null ? undefined : errorSummary(refused)}
          disabled={pending}
          spellCheck={false}
          autoComplete="off"
          className={twMerge(
            "h-6 w-full pl-7 text-xs select-text",
            refused !== null && "border-danger",
          )}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;

            event.preventDefault();
            if (text === "") onClose();
            else setText("");
          }}
        />
      </div>
      <Combobox.Portal>
        <Combobox.Positioner side="bottom" align="start" sideOffset={2}>
          <Combobox.Popup className="max-h-72 min-w-80 py-0.5">
            <Combobox.List>
              {(suggestion: AddSuggestion) => (
                <Combobox.Item
                  key={suggestionKey(suggestion)}
                  value={suggestion}
                  className="gap-2 px-2 py-1 text-row"
                >
                  <SuggestionText suggestion={suggestion} />
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function suggestionKey(suggestion: AddSuggestion): string {
  return suggestion.kind === "declared" ? suggestion.field.hash : `custom:${suggestion.field}`;
}

/** A suggestion as the inspector names its rows: the label, then the field and its kind. */
function SuggestionText({ suggestion }: { suggestion: AddSuggestion }) {
  const name =
    suggestion.kind === "declared"
      ? (suggestion.field.name ?? suggestion.field.hash)
      : suggestion.field;
  const label =
    suggestion.kind === "declared" ? emitterLabel(suggestion.field.hash, name) : undefined;

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="truncate text-surface-100">{label ?? name}</span>
      {label !== undefined && (
        <span className="truncate font-mono text-code text-surface-400">{name}</span>
      )}
      {/* DS-KIND-HUE */}
      <span className="ml-auto shrink-0 font-mono text-code text-bin-kind-text">
        {shapeTag(shapeOf(suggestion))}
      </span>
    </span>
  );
}

/**
 * Aim the inspector at a property once it is drawn, which a read after the add answers.
 *
 * The section it lands in may not exist until then, so the aim waits for the row rather than
 * following the add at once.
 */
export function useAddedJump(groups: readonly InspectorGroup[]): (hash: string) => void {
  const { card, chooseGroup } = useEmitters();
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    if (added === null || card === undefined) return;

    const drawn = groups.some((group) => group.rows.some((row) => fieldHash(row.path) === added));
    if (!drawn) return;

    setAdded(null);
    chooseGroup({ key: card.key, group: fieldGroup(added) });
  }, [added, card, groups, chooseGroup]);

  return setAdded;
}
