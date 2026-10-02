import { ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, use, useMemo, useState } from "react";

import { IconButton, Menu, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";

import { binQueries } from "../../../documents/hooks/useBinDocument";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { usePrimitivePick } from "../../inspector/components/PrimitivePicker";
import { PRIMITIVE_FIELD, PRIMITIVES } from "../../inspector/utils/primitives";
import { isPrimitive } from "../utils/driverLayout";
import type { StructItem } from "../utils/graphItems";
import { holderRow } from "../utils/holderRow";
import { GraphActionsContext, NO_DOCUMENT } from "./graphActions";

/**
 * A struct's class behind one action on its heading, since the class is metadata a creator
 * reaches for rarely: an icon button whose tooltip names the class, opening the classes it can
 * take. The primitive lists the primitives, and any other pointer the classes the file and the
 * schema offer for its field. Nothing draws for a list or a map, or where the view takes no edit.
 */
export function ClassAction({ item }: { item: StructItem }) {
  const entry = use(GraphActionsContext)?.entry ?? "";
  const holder = useMemo(() => holderRow(entry, item.holder), [entry, item.holder]);
  if (item.shape !== "struct") return null;

  if (isPrimitive(item)) return <PrimitiveAction item={item} holder={holder} />;
  return <PointerAction item={item} holder={holder} />;
}

/** The primitive's class, chosen among every primitive. */
function PrimitiveAction({ item, holder }: { item: StructItem; holder: BinRow }) {
  const chosen =
    item.classHash === null ? null : { classHash: item.classHash, class: item.className };
  const pick = usePrimitivePick(holder, PRIMITIVE_FIELD, chosen);
  if (pick === null) return null;

  return (
    <ActionMenu current={item.className ?? item.classHash}>
      <Menu.RadioGroup
        value={item.classHash ?? ""}
        onValueChange={(next) => typeof next === "string" && pick(next)}
      >
        {PRIMITIVES.map((primitive) => (
          <Menu.RadioItem key={primitive.hash} value={primitive.hash}>
            {primitive.label()}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </ActionMenu>
  );
}

/** A pointer's class, chosen among the classes its field takes, read when the menu opens. */
function PointerAction({ item, holder }: { item: StructItem; holder: BinRow }) {
  const actions = use(GraphActionsContext);
  const editProperty = use(LeafEditContext)?.editProperty;
  const [asked, setAsked] = useState(false);
  const classes = useQuery({
    ...binQueries.itemClasses(actions?.document ?? NO_DOCUMENT, actions?.entry ?? "", item.wire),
    enabled: asked && actions !== null,
  });
  const field = item.field;
  if (editProperty === undefined || field === null) return null;

  const choices = (classes.data ?? []).filter((each) => each.hash !== item.classHash);
  return (
    <ActionMenu current={item.className ?? item.classHash} onOpen={() => setAsked(true)}>
      {choices.map((choice) => (
        <Menu.Item
          key={choice.hash}
          onClick={() =>
            void editProperty(holder, field, [
              { type: "replacePointer", path: "", class: choice.hash },
            ])
          }
        >
          {choice.name ?? choice.hash}
        </Menu.Item>
      ))}
    </ActionMenu>
  );
}

function ActionMenu({
  current,
  onOpen,
  children,
}: {
  /** The class the struct holds, which the tooltip names. */
  current: string | null;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const label = m.workshop_bin_graph_change_class_action();

  return (
    <Menu.Root onOpenChange={(open) => open && onOpen?.()}>
      <Tooltip content={current === null ? label : `${label} · ${current}`}>
        <Menu.Trigger
          render={
            <IconButton
              aria-label={label}
              className="nodrag ml-auto text-surface-400"
              icon={<ArrowsLeftRightIcon className="size-3.5" />}
            />
          }
        />
      </Tooltip>
      <Menu.Content align="end" className="max-h-80 overflow-y-auto">
        {children}
      </Menu.Content>
    </Menu.Root>
  );
}
