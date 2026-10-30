import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Combobox } from "@/components";
import { m } from "@/i18n";
import type { SoundTarget } from "@/lib/tauri";

import { audioQueries, type BankRevision } from "../api/queries";
import { matchingTargets, targetLabel } from "../utils/soundTargets";

interface SoundTargetPickerProps {
  readonly revision: BankRevision;
  /** The name of the event that the picked field takes. */
  readonly name: string;
  readonly onPick: (target: SoundTarget) => void;
  readonly onClose: () => void;
}

/**
 * The inline picker of Use in: the clip events, VFX systems and emitter audio of the project's
 * bins, filtered by bin, object or field path as the text is typed.
 *
 * Enter sets the highlighted field to the event and Escape closes the picker. A field that holds
 * another event shows that name. Per "Using an event" in docs/ux/AUDIO.md.
 */
export function SoundTargetPicker({ revision, name, onPick, onClose }: SoundTargetPickerProps) {
  const targets = useQuery(audioQueries.soundTargets(revision));
  const [query, setQuery] = useState("");
  const matches = useMemo(() => matchingTargets(targets.data ?? [], query), [targets.data, query]);

  return (
    <Combobox.Root<SoundTarget>
      items={matches}
      filter={null}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(target) => target && onPick(target)}
      onOpenChange={(open, details) => {
        if (!open && details.reason !== "item-press") onClose();
      }}
      itemToStringLabel={targetLabel}
      defaultOpen
    >
      <Combobox.Input
        size="xs"
        autoFocus
        data-draft
        aria-label={m.audio_use_label({ name })}
        placeholder={m.audio_use_placeholder()}
        className="w-80"
      />
      <Combobox.Content positionerClassName="min-w-(--anchor-width)" className="max-h-80 w-md">
        <Combobox.List>
          {(target: SoundTarget) => (
            <Combobox.Item
              key={`${target.row.bin}:${target.row.objectHash}:${target.row.property?.path ?? ""}`}
              value={target}
              className="flex-col items-start gap-0 pr-2"
            >
              <span className="w-full truncate text-row">{targetLabel(target)}</span>
              <span className="w-full truncate text-meta text-surface-400">
                {target.value === ""
                  ? target.row.bin
                  : m.audio_use_current_label({ bin: target.row.bin, name: target.value })}
              </span>
            </Combobox.Item>
          )}
        </Combobox.List>
        <Combobox.Empty>
          {targets.isPending ? m.audio_use_loading_empty() : m.audio_use_empty()}
        </Combobox.Empty>
      </Combobox.Content>
    </Combobox.Root>
  );
}
