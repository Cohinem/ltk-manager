import { WarningIcon } from "@phosphor-icons/react";

import { Chip, InputDefaultContext, Readout, Tooltip } from "@/components";

import { nameHash } from "../../../shared/utils/binHash";
import { JointPicker } from "../../../skin/components/JointPicker";

/** One hash of a list, with its name when a hash table has one. */
export interface HeldName {
  /** `0x` and eight hex digits. */
  readonly hash: string;
  readonly name: string | null;
}

interface NameChipsProps {
  /** The add field's accessible name and placeholder. */
  addLabel: string;
  held: readonly HeldName[];
  /** The names in the loaded file. Empty until a file has loaded. */
  offered: readonly string[];
  /** The text shown for an empty list. It states what the engine does with an empty list. */
  emptyLabel: string;
  /** The tooltip of a chip whose hash matches no name in the loaded file. */
  unmatchedHint: string;
  /** Null when the document is read-only. */
  onAdd: ((name: string) => void) | null;
  onRemove: ((index: number) => void) | null;
}

/**
 * A list of name hashes as removable chips, with a field that adds a name.
 *
 * When `offered` has names, the field is a combobox over the names not yet in the list.
 * Otherwise it is a text field for a typed name. The bin stores hashes only, so a chip shows
 * the name in `offered` whose hash matches.
 */
export function NameChips({
  addLabel,
  held,
  offered,
  emptyLabel,
  unmatchedHint,
  onAdd,
  onRemove,
}: NameChipsProps) {
  const names = new Map(offered.map((name) => [nameHash(name), name]));
  const taken = new Set(held.map((each) => each.hash.toLowerCase()));
  const open = offered.filter((name) => !taken.has(nameHash(name)));

  return (
    <span data-ui="NameChips" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-0.5">
      {held.length === 0 && (
        <span className="font-sans text-meta text-surface-400 italic">{emptyLabel}</span>
      )}
      {held.map((each, index) => {
        const known = names.get(each.hash.toLowerCase());
        const text = known ?? each.name ?? each.hash;
        const unmatched = offered.length > 0 && known === undefined;

        return (
          <Chip
            key={`${each.hash}:${index}`}
            removeLabel={text}
            onRemove={onRemove === null ? undefined : () => onRemove(index)}
          >
            {unmatched && (
              <Tooltip content={unmatchedHint}>
                <WarningIcon weight="duotone" className="size-3 text-warning-text" />
              </Tooltip>
            )}
            <span className="select-text">{text}</span>
          </Chip>
        );
      })}
      {onAdd !== null && offered.length > 0 && open.length > 0 && (
        <span className="w-32 shrink-0">
          <JointPicker
            label={addLabel}
            placeholder={addLabel}
            joints={open}
            value={null}
            onPick={onAdd}
          />
        </span>
      )}
      {onAdd !== null && offered.length === 0 && (
        <InputDefaultContext value>
          <Readout
            key={held.length}
            value=""
            placeholder={addLabel}
            aria-label={addLabel}
            className="w-32"
            onCommit={(text) => {
              if (text.trim() !== "") onAdd(text.trim());
            }}
          />
        </InputDefaultContext>
      )}
    </span>
  );
}
