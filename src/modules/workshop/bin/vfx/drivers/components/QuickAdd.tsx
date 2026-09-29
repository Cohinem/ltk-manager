import { type RefObject, use, useEffect, useMemo, useRef, useState } from "react";

import { CommandPalette, type PaletteGroupModel, type PaletteRow } from "@/components";
import { m } from "@/i18n";
import type { ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { COMPLEX_LIST } from "../../clipboard/emitterCopy";
import { useTemplateChoices } from "../../templates/TemplateMenus";
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

/**
 * The Graph pane's quick add: a `CommandPalette` over what can be added where it opened, which a
 * pick adds and closes. "Adding from the keyboard" in docs/ux/BIN_EDITOR.md.
 *
 * Over a master node it lists the node's unwritten fields and its forces, and everywhere a new
 * emitter and the emitter and system templates, which land after that node or last. Opened by an empty
 * socket it lists what plugs into that socket. Escape or a press outside closes it.
 */
export function QuickAdd({ at, masters, onClose }: QuickAddProps) {
  const fields = useQuickFieldSections(at.plug === null ? at.master : null);
  const emitter = useNewEmitter(masters);
  const entry = use(GraphActionsContext)?.entry ?? "";
  const after = at.master === null ? null : { entry, wire: at.master.wire, name: at.master.name };
  const templates = useTemplateChoices({ entry, after }, "emitter");
  const systemTemplates = useTemplateChoices({ entry, after }, "system");
  const plugged = at.plug?.sections;
  const entries = useMemo(() => {
    const system =
      emitter === null
        ? []
        : [{ title: m.workshop_bin_graph_quick_system_label(), choices: [emitter] }];
    const starters = [
      { title: m.workshop_bin_graph_quick_templates_label(), choices: templates },
      { title: m.workshop_bin_graph_quick_system_templates_label(), choices: systemTemplates },
    ];
    return entriesOf(plugged ?? [...fields, ...system, ...starters]);
  }, [plugged, fields, emitter, templates, systemTemplates]);

  const [text, setText] = useState("");
  const shown = useMemo(() => matching(entries, text), [entries, text]);
  const groups = useMemo(() => groupsOf(shown), [shown]);

  const panel = useRef<HTMLDivElement>(null);
  usePressOutside(panel, onClose);

  const title =
    at.plug?.title ??
    (at.master === null
      ? m.workshop_bin_graph_quick_add_label()
      : m.workshop_bin_graph_quick_add_to_label({ name: at.master.name }));

  function select(key: string) {
    const entry = shown.find((candidate) => candidate.key === key);
    if (entry === undefined) return;

    onClose();
    entry.pick();
  }

  return (
    <div
      ref={panel}
      data-ui="QuickAdd"
      className="nodrag nopan absolute z-20 w-72"
      style={{ left: at.x, top: at.y }}
    >
      <CommandPalette
        query={text}
        onQueryChange={setText}
        placeholder={title}
        groups={groups}
        onSelect={select}
        onClose={onClose}
        emptyMessage={m.workshop_bin_graph_quick_add_empty()}
      />
    </div>
  );
}

/**
 * Call `onPress` on a pointer press outside `ref`.
 *
 * Listens in the capture phase, because the canvas stops the press from bubbling to start a pan.
 */
function usePressOutside(ref: RefObject<HTMLElement | null>, onPress: () => void) {
  useEffect(() => {
    function press(event: PointerEvent) {
      if (ref.current?.contains(event.target as Node) === false) onPress();
    }

    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
  }, [ref, onPress]);
}

/** `entries` as the palette's groups, one per section in the order the sections first appear. */
function groupsOf(entries: readonly QuickEntry[]): PaletteGroupModel[] {
  const groups = new Map<string, PaletteRow[]>();
  for (const entry of entries) {
    const rows = groups.get(entry.section) ?? [];
    rows.push({ id: entry.key, name: entry.text });
    groups.set(entry.section, rows);
  }

  return [...groups].map(([section, rows]) => ({ id: section, label: section, rows }));
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
