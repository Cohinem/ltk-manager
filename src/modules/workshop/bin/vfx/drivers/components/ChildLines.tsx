import { useQuery } from "@tanstack/react-query";
import { use, useMemo } from "react";

import type { VfxObject, VfxSystem } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { ChildAddPicker } from "../../children/ChildAddPicker";
import { type AuthoredChildSet, authoredChildSet } from "../../children/childModel";
import { type ChildActions, childQueries, useChildActions } from "../../children/useChildren";
import { vfxQueries } from "../../hooks/useVfxSystem";
import { holderRow } from "../utils/holderRow";
import { Line, NAME_COLUMN } from "./FieldLines";
import { GraphActionsContext, NO_DOCUMENT } from "./graphActions";

/** The label of a Children node's own line, in the name column its field rows share. */
export const CHILD_LINE_LABEL = twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate text-surface-300");

function systemName(system: VfxSystem): string | null {
  return system.name;
}

/** The edits of the child set of the emitter at hash path `emitterPath`, as the inspector sends them. */
export function useGraphChildActions(emitterPath: string, set: AuthoredChildSet) {
  const graph = use(GraphActionsContext);
  const document = graph?.document ?? NO_DOCUMENT;
  const entry = graph?.entry ?? "";
  const targets = useQuery({ ...childQueries.targets(document), enabled: graph !== null }).data;
  const name = useQuery({
    ...vfxQueries.system(document, entry),
    enabled: entry !== "",
    select: systemName,
  }).data;
  const row = useMemo(() => holderRow(entry, emitterPath), [entry, emitterPath]);

  return { actions: useChildActions(row, set, name ?? null, targets), targets, entry };
}

interface ChildAddLineProps {
  actions: ChildActions;
  targets: readonly VfxObject[] | undefined;
  /** The opened system's entry, which a child cannot link. */
  entry: string;
}

/** The line that adds a child: a system by link, an effect key, or a new system. */
export function ChildAddLine({ actions, targets, entry }: ChildAddLineProps) {
  return (
    <Line className="pr-2 pl-5.5">
      <ChildAddPicker actions={actions} systems={targets} holder={entry} />
    </Line>
  );
}

/**
 * The line a master node draws for a child set its emitter does not write yet: the picker
 * that writes the set and its first child in one edit.
 */
export function PendingChildrenLine({ emitterPath }: { emitterPath: string }) {
  const set = useMemo(() => authoredChildSet(null, emitterPath), [emitterPath]);
  const { actions, targets, entry } = useGraphChildActions(emitterPath, set);

  return <ChildAddLine actions={actions} targets={targets} entry={entry} />;
}
