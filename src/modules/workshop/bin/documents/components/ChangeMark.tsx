import { ArrowUUpLeftIcon, CaretDownIcon, GitDiffIcon } from "@phosphor-icons/react";
import { use } from "react";
import { useShallow } from "zustand/react/shallow";

import { Button, ContextMenu, Menu, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinRow, ChangeBaseline, ChangeKind } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { rowKey } from "../../tree/utils/binRows";
import { ChangedRowsContext, useRevertRow, useRowChange } from "../hooks/useChanges";
import { useChangeViewStore } from "../state/changeView";

const TONE: Record<ChangeKind | "within", string> = {
  changed: "bg-warning",
  added: "bg-success",
  removed: "bg-danger",
  within: "border border-warning bg-transparent",
};

/**
 * The mark of a row or a node that differs from the baseline: a filled dot for a changed,
 * added or removed value, and a ring for a holder with a change under it.
 */
export function ChangeMark({ rowKey: key, className }: { rowKey: string; className?: string }) {
  const change = useRowChange(key);
  const baseline = use(ChangedRowsContext)?.baseline;
  if (change === null || baseline === undefined) return null;

  const label = changeLabel(change, baseline);
  return (
    <Tooltip content={label}>
      <span
        role="img"
        aria-label={label}
        data-change={change}
        className={twMerge("h-1.5 w-1.5 shrink-0 rounded-full", TONE[change], className)}
      />
    </Tooltip>
  );
}

function changeLabel(change: ChangeKind | "within", baseline: ChangeBaseline): string {
  const game = baseline === "game";
  switch (change) {
    case "added":
      return game ? m.workshop_bin_change_added_game_label() : m.workshop_bin_change_added_label();
    case "removed":
      return game
        ? m.workshop_bin_change_removed_game_label()
        : m.workshop_bin_change_removed_label();
    case "within":
      return game
        ? m.workshop_bin_change_within_game_label()
        : m.workshop_bin_change_within_label();
    default:
      return game
        ? m.workshop_bin_change_changed_game_label()
        : m.workshop_bin_change_changed_label();
  }
}

/** Revert on a row that differs from the baseline, which writes the baseline's value back. */
export function RevertMenuItem({ row }: { row: BinRow }) {
  const change = useRowChange(rowKey(row));
  const baseline = use(ChangedRowsContext)?.baseline;
  const revert = useRevertRow();
  if (revert === null || change === null || change === "within" || row.node !== "property") {
    return null;
  }

  return (
    <ContextMenu.Item icon={<ArrowUUpLeftIcon />} onClick={() => void revert(row)}>
      {baseline === "game"
        ? m.workshop_bin_change_revert_game_action()
        : m.workshop_bin_change_revert_action()}
    </ContextMenu.Item>
  );
}

/**
 * The change marks' menu: whether rows carry marks, whether changed rows alone show, and
 * what a change is measured from.
 */
export function ChangesMenu() {
  const { marks, toggleMarks, baseline, setBaseline, changedOnly, toggleChangedOnly } =
    useChangeViewStore(useShallow((state) => state));

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-label={m.workshop_bin_change_menu_label()}
            title={m.workshop_bin_change_menu_label()}
            data-pressed={changedOnly || undefined}
            className="data-pressed:bg-accent-500/15 data-pressed:text-accent-300"
            left={<GitDiffIcon weight="bold" className="h-3.5 w-3.5" />}
            right={<CaretDownIcon weight="bold" className="h-3 w-3" />}
          />
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup data-ui="ChangesMenu" className="w-60">
            <Menu.CheckboxItem checked={marks} onCheckedChange={toggleMarks}>
              {m.workshop_bin_change_marks_action()}
            </Menu.CheckboxItem>
            <Menu.CheckboxItem checked={changedOnly} onCheckedChange={toggleChangedOnly}>
              {m.workshop_bin_change_only_action()}
            </Menu.CheckboxItem>
            <Menu.Separator />
            <Menu.RadioGroup
              value={baseline}
              onValueChange={(value) => setBaseline(value as ChangeBaseline)}
            >
              <Menu.RadioItem value="opened">{m.workshop_bin_change_opened_label()}</Menu.RadioItem>
              <Menu.RadioItem value="game">{m.workshop_bin_change_game_label()}</Menu.RadioItem>
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
