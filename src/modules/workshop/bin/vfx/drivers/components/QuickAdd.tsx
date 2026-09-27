import { use, useMemo, useState } from "react";

import { Combobox } from "@/components";
import { m } from "@/i18n";
import type { ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { COMPLEX_LIST } from "../../clipboard/emitterCopy";
import type { MasterItem } from "../utils/graphItems";
import { holderRow } from "../utils/holderRow";
import type { AddChoice, AddSection } from "./AddMenu";
import { GraphActionsContext, type SocketPlug } from "./graphActions";
import { useQuickFieldSections } from "./MasterAdd";

const FIELD = {
  emitterClass: nameHash("VfxEmitterDefinitionData"),
  emitterName: nameHash("emitterName"),
} as const;

/** The name a new emitter takes, numbered past any emitter of the system that holds it. */
const NEW_EMITTER = "Emitter";

/** Where the quick add opens, in the canvas box's pixels, and what it adds to. */
export interface QuickAddAt {
  readonly x: number;
  readonly y: number;
  /** The master node its fields go on, and null for the system alone. */
  readonly master: MasterItem | null;
  /** The empty socket it plugs into, whose choices replace every other. */
  readonly plug: SocketPlug | null;
}

interface QuickAddProps {
  at: QuickAddAt;
  /** Every master node of the graph, which numbers and names a new emitter. */
  masters: readonly MasterItem[];
  onClose: () => void;
}

/** One entry of the list, under the title of its section. */
interface QuickEntry extends AddChoice {
  readonly section: string;
}

/* DS-VEIL, DS-RADIUS */
const INPUT =
  "h-7 w-full min-w-0 rounded-sm border border-accent-500 bg-surface-900 px-2 font-mono text-code text-surface-100 placeholder:text-surface-400 focus:outline-none";

/**
 * The Graph pane's quick add: a search over what can be added where it opened, which a pick
 * adds and closes. "Adding from the keyboard" in docs/ux/BIN_EDITOR.md.
 *
 * Over a master node it lists the node's unwritten fields and its forces, and everywhere a new
 * emitter. Opened by an empty socket it lists what plugs into that socket. Escape or a press
 * outside closes it.
 */
export function QuickAdd({ at, masters, onClose }: QuickAddProps) {
  const fields = useQuickFieldSections(at.plug === null ? at.master : null);
  const emitter = useNewEmitter(masters);
  const plugged = at.plug?.sections;
  const entries = useMemo(() => {
    const system =
      emitter === null
        ? []
        : [{ title: m.workshop_bin_graph_quick_system_label(), choices: [emitter] }];
    return entriesOf(plugged ?? [...fields, ...system]);
  }, [plugged, fields, emitter]);
  const [text, setText] = useState("");
  const shown = useMemo(() => matching(entries, text), [entries, text]);
  const title =
    at.plug?.title ??
    (at.master === null
      ? m.workshop_bin_graph_quick_add_label()
      : m.workshop_bin_graph_quick_add_to_label({ name: at.master.name }));

  return (
    <div
      data-ui="QuickAdd"
      className="nodrag nopan bg-surface-850 absolute z-20 w-72 rounded-md border border-surface-veil-strong p-1 shadow-lg"
      style={{ left: at.x, top: at.y }}
    >
      <div className="truncate px-1 pb-1 text-meta text-surface-400 select-none">{title}</div>
      <Combobox.Root<QuickEntry>
        items={shown}
        inputValue={text}
        onInputValueChange={(next, details) => {
          if (details.reason === "input-clear" || details.reason === "none") return;
          setText(next);
        }}
        onValueChange={(entry) => {
          if (entry === null) return;
          onClose();
          entry.pick();
        }}
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        filter={() => true}
        autoHighlight
        itemToStringLabel={(entry) => entry.text}
        itemToStringValue={(entry) => entry.key}
      >
        <Combobox.Input
          autoFocus
          placeholder={m.workshop_bin_graph_quick_add_placeholder()}
          aria-label={title}
          spellCheck={false}
          autoComplete="off"
          className={INPUT}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
        />
        <Combobox.Portal>
          <Combobox.Positioner side="bottom" align="start" sideOffset={4}>
            <Combobox.Popup className="max-h-80 w-72 py-0.5">
              <Combobox.Empty>{m.workshop_bin_graph_quick_add_empty()}</Combobox.Empty>
              <Combobox.List>
                {(entry: QuickEntry) => (
                  <Combobox.Item
                    key={entry.key}
                    value={entry}
                    className="flex items-baseline gap-2 px-2 py-1 font-mono text-mono-row"
                  >
                    <span className="min-w-0 flex-1 truncate">{entry.text}</span>
                    <span className="shrink-0 font-sans text-meta text-surface-500">
                      {entry.section}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}

/** Every choice of `sections` as one list, each keyed apart by its section. */
function entriesOf(sections: readonly AddSection[]): QuickEntry[] {
  return sections.flatMap((section) =>
    section.choices.map((choice) => ({
      ...choice,
      key: `${section.title}\n${choice.key}`,
      section: section.title,
    })),
  );
}

/** The entries every word of `text` is found in, by the entry's text or its section's title. */
export function matching(entries: readonly QuickEntry[], text: string): QuickEntry[] {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];

  return entries.filter((entry) => {
    const haystack = `${entry.text} ${entry.section}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** The choice that appends a new complex emitter to the system, and null where nothing edits. */
function useNewEmitter(masters: readonly MasterItem[]): AddChoice | null {
  const entry = use(GraphActionsContext)?.entry ?? "";
  const editProperty = use(LeafEditContext)?.editProperty;
  if (entry === "" || editProperty === undefined) return null;

  const complex = masters.filter((master) => !master.simple);
  const index = complex.reduce((most, master) => Math.max(most, master.listIndex + 1), 0);
  const name = freeName(new Set(masters.map((master) => master.name)));
  return {
    key: "new-emitter",
    text: m.workshop_bin_graph_new_emitter_action(),
    pick: () => void editProperty(holderRow(entry, ""), COMPLEX_LIST, newEmitterEdits(index, name)),
  };
}

/** The edits that append an emitter named `name` as item `index` of the complex list. */
export function newEmitterEdits(index: number, name: string): ValueEdit[] {
  const item = `[${index}]`;
  return [
    { type: "insertItem", path: "", item: { index: null, key: null, class: FIELD.emitterClass } },
    { type: "ensureProperty", path: item, field: FIELD.emitterName },
    {
      type: "setLeaf",
      path: `${item}.${FIELD.emitterName.slice(2)}`,
      value: { type: "string", value: name },
    },
  ];
}

/** `NEW_EMITTER` numbered from 1 past every name `taken` holds. */
export function freeName(taken: ReadonlySet<string>): string {
  let at = 1;
  while (taken.has(`${NEW_EMITTER}${at}`)) {
    at += 1;
  }
  return `${NEW_EMITTER}${at}`;
}
