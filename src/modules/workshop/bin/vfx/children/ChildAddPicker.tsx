import { PlusIcon, ShootingStarIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { Combobox, OVERLINE } from "@/components";
import { m } from "@/i18n";
import type { VfxObject } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { CutText } from "../../shared/components/CutText";
import { splitPath } from "../../shared/utils/textCut";
import { useVfxTemplates } from "../templates/templateQueries";
import { templateLabel } from "../templates/templateText";
import {
  type AddGroup,
  type AddGroupId,
  addGroups,
  type AddItem,
  addItems,
  type NamedStart,
} from "./childAdd";
import type { ChildActions } from "./useChildren";

interface ChildAddPickerProps {
  /** The edits a pick makes. A null `create` leaves the new effect section out. */
  actions: Pick<ChildActions, "add" | "create">;
  /** The systems a child can link, and none until they are read. */
  systems: readonly VfxObject[] | null | undefined;
  /** The emitter's system, which a child cannot link without a cycle. */
  holder: string;
  /** The input's placeholder and accessible name, which defaults to Add child. */
  label?: string;
}

/**
 * The combobox that adds a child to a set, in two sections: the effects a pick links, and a
 * new effect from Blank or a system template. Typing narrows both, and a pick adds the child
 * and clears the field.
 *
 * "Child particles" in docs/ux/BIN_EDITOR.md.
 */
export function ChildAddPicker({
  actions,
  systems,
  holder,
  label = m.workshop_bin_child_add_action(),
}: ChildAddPickerProps) {
  const templates = useVfxTemplates("system");
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const creates = actions.create !== null;
  const items = useMemo(() => {
    if (!creates) return addItems(systems, [], holder);

    const starts: NamedStart[] = [
      { start: { kind: "blank" }, label: m.workshop_bin_new_object_blank_label() },
      ...templates.map((template) => ({
        start: { kind: "template" as const, template },
        label: templateLabel(template),
      })),
    ];
    return addItems(systems, starts, holder);
  }, [systems, templates, holder, creates]);
  const groups = useMemo(() => addGroups(items, text), [items, text]);

  const pick = (item: AddItem | null) => {
    if (item === null) return;

    setText("");
    setOpen(false);
    if (item.kind === "link") void actions.add?.(item.entry);
    if (item.kind === "new") void actions.create?.(item.start);
  };

  return (
    <Combobox.Root<AddItem>
      items={groups}
      value={null}
      inputValue={text}
      onInputValueChange={(next, details) => {
        if (details.reason !== "input-change") return;
        setText(next);
        setOpen(true);
      }}
      onValueChange={pick}
      open={open}
      onOpenChange={setOpen}
      filter={() => true}
      autoHighlight
      itemToStringLabel={itemName}
      itemToStringValue={itemId}
    >
      <div data-ui="ChildAddPicker" className="relative min-w-0 flex-1">
        <PlusIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-surface-400" />
        <Combobox.Input
          placeholder={label}
          aria-label={label}
          disabled={actions.add === null}
          spellCheck={false}
          autoComplete="off"
          size="xs"
          className="nodrag pl-7 select-text"
          onFocus={() => setOpen(true)}
        />
      </div>
      <Combobox.Content
        side="bottom"
        align="start"
        sideOffset={2}
        data-ui="ChildAddPicker:list"
        className="max-h-80 w-[max(var(--anchor-width),28rem)] max-w-[36rem]"
      >
        <Combobox.List>
          {(group: AddGroup) => (
            <Combobox.Group key={group.value} items={group.items}>
              <Combobox.GroupLabel className={twMerge(OVERLINE, "px-2 pt-1.5 pb-0.5 select-none")}>
                {groupLabel(group.value)}
              </Combobox.GroupLabel>
              <Combobox.Collection>
                {(item: AddItem) => (
                  <Combobox.Item key={item.id} value={item} className="text-row">
                    <AddRow item={item} />
                  </Combobox.Item>
                )}
              </Combobox.Collection>
            </Combobox.Group>
          )}
        </Combobox.List>
        {groups.length === 0 && (
          <div className="px-2 py-1.5 text-meta text-surface-400 select-none">
            {m.workshop_bin_graph_quick_add_empty()}
          </div>
        )}
      </Combobox.Content>
    </Combobox.Root>
  );
}

function itemId(item: AddItem): string {
  return item.id;
}

function itemName(item: AddItem): string {
  return item.kind === "link" ? item.path : item.label;
}

function groupLabel(group: AddGroupId): string {
  return group === "link"
    ? m.workshop_bin_child_add_link_group_label()
    : m.workshop_bin_child_add_new_group_label();
}

const ROW = "flex w-full min-w-0 items-center gap-2";
const NAME = "shrink-0 font-medium text-surface-100";

/** One entry: a glyph for its section, and its name. An effect has its folder dimmed after it. */
function AddRow({ item }: { item: AddItem }) {
  if (item.kind === "new") {
    return (
      <span className={ROW}>
        <PlusIcon weight="bold" className="size-3.5 shrink-0 text-surface-300" />
        <span className={NAME}>{item.label}</span>
      </span>
    );
  }

  const { folder, file } = splitPath(item.path);
  return (
    <span className={ROW}>
      <ShootingStarIcon weight="duotone" className="size-3.5 shrink-0 text-accent-400" />
      <span className={NAME}>{file}</span>
      <CutText text={folder} className="text-surface-400" />
    </span>
  );
}
