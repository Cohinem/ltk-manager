import { useState } from "react";

import { Button, Dialog, Field } from "@/components";
import { m } from "@/i18n";

import type { PlaceableActions } from "../hooks/usePlaceableActions";
import { itemId, type PlacedItem } from "../utils/mapOutline";

export interface RenamePlaceableDialogProps {
  readonly placed: PlacedItem;
  readonly actions: PlaceableActions;
  readonly onClose: () => void;
}

/**
 * Renames one placeable, and every map action field that names it, as one undo step. Per
 * "Rename rewrites references" in docs/ux/MAP_EDITOR.md.
 */
export function RenamePlaceableDialog({ placed, actions, onClose }: RenamePlaceableDialogProps) {
  const [name, setName] = useState(placed.item.name);
  const [pending, setPending] = useState(false);
  const ref = { chunk: placed.chunk.entry, key: placed.item.key };
  const unchanged = name.trim() === placed.item.name;
  const free = unchanged || actions.nameFree(ref, name);

  async function submit() {
    if (unchanged || !free) return;

    setPending(true);
    const renamed = await actions.rename(placed, name);
    setPending(false);
    if (renamed) onClose();
  }

  return (
    <Dialog.Shell
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={m.workshop_bin_map_rename_title()}
      size="sm"
    >
      <Dialog.Form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Dialog.Body>
          <Field.Root>
            <Field.Label>{m.workshop_bin_map_rename_name_label()}</Field.Label>
            <Field.Control
              key={itemId(ref.chunk, ref.key)}
              value={name}
              onChange={(event) => setName(event.target.value)}
              hasError={!free}
              autoFocus
              className="font-mono"
            />
            {!free && <Field.Error>{m.workshop_bin_map_rename_taken_error()}</Field.Error>}
          </Field.Root>
        </Dialog.Body>
        <Dialog.Footer>
          <Button size="lg" variant="ghost" type="button" onClick={onClose} disabled={pending}>
            {m.common_cancel_action()}
          </Button>
          <Button size="lg" type="submit" disabled={unchanged || !free} loading={pending}>
            {m.workshop_bin_map_rename_action()}
          </Button>
        </Dialog.Footer>
      </Dialog.Form>
    </Dialog.Shell>
  );
}
