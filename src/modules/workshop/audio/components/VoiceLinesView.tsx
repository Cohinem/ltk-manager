import { type KeyboardEvent, use, useEffect, useMemo, useRef, useState } from "react";

import { ContextMenu, EmptyState, Spinner } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";
import type { AudienceLine, BinEdit, ValueEdit, VoiceRule, VoiceSituation } from "@/lib/tauri";
import { useAudioInspector, useSetAudioInspector } from "@/stores";
import { twMerge } from "@/utils";

import type { ViewContext, WidgetProps } from "../../bin/classes/components/ClassCells";
import { LeafEditContext } from "../../bin/tree/hooks/useLeafEdit";
import { rowKey } from "../../bin/tree/utils/binRows";
import { previewDocument } from "../../documents/utils/contentDocument";
import { useOpenDocumentAs } from "../../state";
import { useCopyForSkin, useVoiceEdit, useVoiceLines, ruleTemplate } from "../api/voiceLines";
import { useLinePlayer } from "../hooks/useLinePlayer";
import { useTreePicks } from "../hooks/useTreePicks";
import {
  useBankEventStore,
  useChooseVoiceSkin,
  useRuleFocus,
  useVoiceSkin,
} from "../state/voiceLines";
import { rowLanes } from "../utils/lanes";
import { movedIndex, treeStep } from "../utils/rowKeys";
import { pickMode } from "../utils/rowSelection";
import { spellOf, CLASS } from "../utils/voiceConditions";
import { ruleChance } from "../utils/voiceConditions";
import {
  chanceEdits,
  cooldownEdit,
  duplicateEdits,
  fieldPath,
  objectPath,
  priorityEdits,
  removeEdits,
  rulesPath,
  shortNameEdits,
  situationsEdit,
} from "../utils/voiceEdits";
import {
  audienceSummary,
  unresolvedCount,
  voiceLineRows,
  type VoiceLineRow,
} from "../utils/voiceLines";
import {
  lineFor,
  simulateTrigger,
  triggerChoices,
  type TriggerContext,
} from "../utils/voiceTrigger";
import { AUDIO_LIST_GROUP } from "./audioRow";
import { Lead, PlayButton, RowFrame, rowId } from "./EventRowParts";
import { type InspectorSubject, VoiceLineInspector } from "./VoiceLineInspector";
import { type LineActions, VoiceLineMenu } from "./VoiceLineMenu";
import {
  AddRuleLine,
  type LineCell,
  lineCells,
  RuleCells,
  type RuleRow,
  SituationText,
} from "./VoiceLineRows";
import { SharedNotice, VoiceLinesHeader } from "./VoiceLinesHeader";

/**
 * The Voice lines section of a `ContextualActionData` object: the view of its situations and
 * rules, which edits the object's open document when the tab takes edits.
 */
export function VoiceLinesSection({ view }: WidgetProps) {
  const editable = use(LeafEditContext) !== null;

  return (
    <div className="font-sans text-row">
      <VoiceLinesView view={view} editable={editable} />
    </div>
  );
}

/** The trigger a situation's play simulates before the reader sets one. */
const ANY_TRIGGER: TriggerContext = { target: null, spell: null, audience: "owner" };

/** The length of the `mSituations` field hash that a rule's path from the object's root starts with. */
const SITUATIONS_PREFIX = 8;

interface VoiceLinesViewProps {
  readonly view: ViewContext;
  readonly editable: boolean;
}

/**
 * The situations of an object as group headers, each rule one line under its header, beside an
 * inspector of the selected line.
 *
 * The names resolve as one skin, chosen in the header and kept per object. A header plays one
 * simulated trigger, and its menu plays every resolved line. Picked rules take a chance knob,
 * the inspector's fields, Delete, Ctrl+D and the moves together, each as one undo step. Per
 * "Voice lines" in docs/ux/CONTEXTUAL_VOICE.md.
 */
function VoiceLinesView({ view, editable }: VoiceLinesViewProps) {
  const remembered = useVoiceSkin(view.entry);
  const choose = useChooseVoiceSkin();
  const read = useVoiceLines(view.document, view.entry, remembered);
  const data = read.data;

  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [onlyUnresolved, setOnlyUnresolved] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [cellName, setCellName] = useState<LineCell>("short");
  const [entering, setEntering] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<TriggerContext>(ANY_TRIGGER);
  const [dismissed, setDismissed] = useState(false);
  const [edited, setEdited] = useState(false);
  const [menuRow, setMenuRow] = useState<VoiceLineRow | null>(null);
  const inspecting = useAudioInspector();
  const setInspecting = useSetAudioInspector();
  const player = useLinePlayer();
  const copy = useCopyToClipboard();
  const open = useOpenDocumentAs();
  const askBank = useBankEventStore((state) => state.ask);
  const list = useRef<HTMLDivElement>(null);

  const send = useVoiceEdit(view);
  const object = view.objectName(view.entry);
  const copyForSkin = useCopyForSkin({ ...view, object });

  const rows = useMemo(
    () =>
      data === undefined
        ? []
        : voiceLineRows(data.lines, folded, { text: filter, unresolved: onlyUnresolved }, editable),
    [data, folded, filter, onlyUnresolved, editable],
  );
  const lanes = useMemo(() => rowLanes(rows), [rows]);
  const ruleRows = useMemo(
    () => new Map(rows.flatMap((row) => (row.kind === "rule" ? [[row.key, row] as const] : []))),
    [rows],
  );
  const picks = useTreePicks<RuleRow>(ruleRows, selected, setSelected);
  const choices = useMemo(
    () => (data === undefined ? { spells: [], targets: [] } : triggerChoices(data.lines)),
    [data],
  );

  const focus = useRuleFocus(view.entry);
  const settled = useRef(0);
  useEffect(() => {
    if (focus === null || focus.serial === settled.current) return;

    settled.current = focus.serial;
    const key = `r:${focus.path.slice(SITUATIONS_PREFIX)}`;
    setSelected(key);
    requestAnimationFrame(() =>
      document.getElementById(rowId(key))?.scrollIntoView({ block: "center" }),
    );
  }, [focus]);

  if (read.error !== null && data === undefined) {
    return <EmptyState size="sm" title={m.audio_voice_failed_empty()} />;
  }
  if (data === undefined) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  const skin = data.skins.find((each) => each.bin === data.skin) ?? null;
  const selectedIndex = rows.findIndex((row) => row.key === selected);
  const selectedRow = rows[selectedIndex];
  const picked = (row: VoiceLineRow): RuleRow[] => {
    if (row.kind !== "rule") return [];
    return picks.picked.has(row.key) && picks.targets.length > 1 ? [...picks.targets] : [row];
  };

  async function editSituations(edits: readonly ValueEdit[]): Promise<boolean> {
    const applied = await send(situationsEdit(view.entry, edits));
    if (applied) setEdited(true);
    return applied;
  }

  async function editObject(edit: BinEdit): Promise<boolean> {
    const applied = await send(edit);
    if (applied) setEdited(true);
    return applied;
  }

  function lineOf(rule: VoiceRule): AudienceLine | null {
    return lineFor(rule, trigger.audience) ?? audienceSummary(rule.audio).line;
  }

  function playRule(rule: VoiceRule, line: AudienceLine | null = lineOf(rule)) {
    if (line?.event == null) return;
    player.play({ key: `${rule.path}:${line.audience}`, event: line.event });
  }

  function playSituation(situation: VoiceSituation) {
    const rule = simulateTrigger(situation, trigger, Math.random);
    const line = rule === null ? null : lineFor(rule, trigger.audience);
    if (rule === null || line?.event == null) return;

    player.play({ key: `s:${situation.path}`, event: line.event });
  }

  function playAll(situation: VoiceSituation) {
    player.playAll(
      situation.rules.flatMap((rule) => {
        const line = lineOf(rule);
        return line?.event == null
          ? []
          : [{ key: `${rule.path}:${line.audience}`, event: line.event }];
      }),
    );
  }

  async function addRule(situation: VoiceSituation) {
    const text = await ruleTemplate(m.audio_voice_new_rule_name(), "");
    if (text === null) return;

    const added = `r:${rulesPath(situation)}[${situation.rules.length}]`;
    const landed = await editSituations([
      { type: "pasteItem", path: rulesPath(situation), index: null, text, unique: null },
    ]);
    if (!landed) return;

    setSelected(added);
    setEntering(`${added}:short`);
  }

  function chanceOf(row: RuleRow, percent: number) {
    const chances = picked(row).flatMap((each) => {
      const chance = ruleChance(each.rule);
      return chance === null ? [] : [chance];
    });
    return editSituations(chanceEdits(chances, percent));
  }

  function composedName(rule: VoiceRule, line: AudienceLine): string | null {
    const spell = rule.conditions.find((each) => each.class === CLASS.spellName);
    const segment = spell === undefined ? null : spellOf(spell);
    return (
      line.candidates.find((name) => segment !== null && name.includes(`_${segment}_`)) ??
      line.candidates[0] ??
      null
    );
  }

  function actionsOf(row: VoiceLineRow): LineActions {
    const none: LineActions = {
      play: null,
      playAll: null,
      add: null,
      duplicate: null,
      remove: null,
      moveUp: null,
      moveDown: null,
      createEvent: null,
      showInBank: null,
      showInTree: null,
      copyShort: null,
    };
    const showInTree = (path: string) =>
      view.onShowInProperties === undefined
        ? null
        : () => view.onShowInProperties?.(rowKey({ entry: view.entry, path: objectPath(path) }));

    if (row.kind === "add")
      return { ...none, add: editable ? () => void addRule(row.situation) : null };
    if (row.kind === "situation") {
      return {
        ...none,
        play: () => playSituation(row.situation),
        playAll: () => playAll(row.situation),
        add: editable ? () => void addRule(row.situation) : null,
        showInTree: showInTree(row.situation.path),
      };
    }

    const rules = picked(row);
    const line = lineOf(row.rule);
    const event = line?.event ?? null;
    const [bank] = data?.banks ?? [];
    const name = line === null || event !== null ? null : composedName(row.rule, line);
    const move = (to: number) =>
      editable && rules.length === 1 && to >= 0 && to < row.situation.rules.length
        ? () =>
            void editObject({
              kind: "moveItem",
              entry: view.entry,
              path: objectPath(row.rule.path),
              to,
            }).then((landed) => landed && setSelected(`r:${rulesPath(row.situation)}[${to}]`))
        : null;

    return {
      ...none,
      play: event === null ? null : () => playRule(row.rule),
      add: editable ? () => void addRule(row.situation) : null,
      duplicate: editable
        ? () =>
            void editSituations(
              duplicateEdits(
                row.situation,
                rules.map(({ rule, index }) => ({ rule, index })),
              ),
            )
        : null,
      remove: editable
        ? () => void editSituations(removeEdits(rules.map((each) => each.rule.path)))
        : null,
      moveUp: move(row.index - 1),
      moveDown: move(row.index + 1),
      createEvent:
        name === null || bank?.asset == null
          ? null
          : () => {
              const asset = bank.asset;
              if (asset === null) return;
              askBank(asset, { kind: "create", name });
              open(previewDocument(asset, bank.path), "default");
            },
      showInBank:
        event?.asset == null
          ? null
          : () => {
              const asset = event.asset;
              if (asset === null) return;
              askBank(asset, { kind: "show", event: event.id });
              open(previewDocument(asset, event.bank), "default");
            },
      showInTree: showInTree(row.rule.path),
      copyShort:
        line === null ? null : () => void copy(line.short, m.audio_voice_copy_short_action()),
    };
  }

  function fold(row: VoiceLineRow, next: boolean) {
    setFolded((current) => {
      const updated = new Set(current);
      if (next) updated.delete(row.key);
      else updated.add(row.key);
      return updated;
    });
  }

  function selectAt(index: number, range = false) {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (row === undefined) return;

    picks.pick(row.key, range ? "range" : "only");
    document.getElementById(rowId(row.key))?.scrollIntoView({ block: "nearest" });
  }

  function activeCell(row: VoiceLineRow | undefined): LineCell | null {
    if (row === undefined) return null;
    const cells = lineCells(row);
    return cells.includes(cellName) ? cellName : (cells[0] ?? null);
  }

  function returnFocus() {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) list.current?.focus();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;

    const row = selectedRow;
    const command = event.ctrlKey || event.metaKey;
    const actions = row === undefined ? null : actionsOf(row);
    const run = (action: (() => void) | null | undefined) => {
      event.preventDefault();
      action?.();
    };

    if (
      row !== undefined &&
      !command &&
      !event.altKey &&
      (event.key === "F2" || event.key === "Enter")
    ) {
      const cell = activeCell(row);
      if (row.kind === "rule" && cell !== null && editable) {
        event.preventDefault();
        setEntering(`${row.key}:${cell}`);
        return;
      }
      if (row.kind === "add") return run(actions?.add);
    }
    if (command && event.key === "Enter") return run(actions?.add);
    if (command && event.key.toLowerCase() === "d") return run(actions?.duplicate);
    if (!command && event.key === "Delete") return run(actions?.remove);
    if (event.altKey && event.key === "ArrowUp") return run(actions?.moveUp);
    if (event.altKey && event.key === "ArrowDown") return run(actions?.moveDown);
    if (command && event.key.toLowerCase() === "c") return run(actions?.copyShort);
    if (command && event.key.toLowerCase() === "a") return run(picks.pickAll);
    if (event.key === " ") return run(actions?.play);
    if (event.key === "Escape") {
      event.preventDefault();
      if (player.playing !== null) player.stop();
      else if (row !== undefined) picks.pick(row.key, "only");
      return;
    }

    const target = event.altKey ? null : movedIndex(event.key, selectedIndex, rows.length);
    if (target !== null) {
      event.preventDefault();
      selectAt(target, event.shiftKey);
      return;
    }

    if (row !== undefined && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const cells = lineCells(row);
      const at = cells.indexOf(activeCell(row) ?? "short");
      const next = cells[at + (event.key === "ArrowRight" ? 1 : -1)];
      if (row.kind === "rule" && next !== undefined) {
        setCellName(next);
        return;
      }

      const openKeys = new Set(rows.flatMap((each) => (each.open ? [each.key] : [])));
      const step = treeStep(event.key, rows, selectedIndex, openKeys);
      if (step?.kind === "expand") {
        const stepped = rows.find((each) => each.key === step.key);
        if (stepped !== undefined) fold(stepped, step.open);
      }
      if (step?.kind === "select") selectAt(step.index);
    }
  }

  const subject: InspectorSubject | null =
    selectedRow?.kind === "situation"
      ? { kind: "situation", situation: selectedRow.situation }
      : picks.targets.length > 0
        ? { kind: "rules", rules: picks.targets.map((each) => each.rule) }
        : selectedRow?.kind === "rule"
          ? { kind: "rules", rules: [selectedRow.rule] }
          : null;

  function line(row: VoiceLineRow, index: number) {
    const lane = lanes[index];
    const playing = isPlaying(row, player.playing);
    const frame = {
      row,
      open: row.open,
      selected: row.key === selected || picks.picked.has(row.key),
      playing,
      onSelect: (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
        picks.pick(row.key, pickMode(event)),
      onExpand: (next: boolean) => fold(row, next),
      onHover: () => undefined,
    };
    const lead = (
      <Lead
        row={row}
        blocks={lane?.blocks ?? []}
        ends={lane?.ends}
        index={index}
        open={row.open}
        expandable={row.expandable}
        onExpand={frame.onExpand}
      />
    );

    if (row.kind === "situation") {
      const resolved = row.situation.rules.some(
        (rule) => lineFor(rule, trigger.audience)?.event != null,
      );
      return (
        <RowFrame {...frame}>
          {lead}
          <PlayButton
            playable={resolved}
            playing={player.playing === `s:${row.situation.path}`}
            onToggle={() =>
              player.playing === null ? playSituation(row.situation) : player.stop()
            }
          />
          <SituationText situation={row.situation} />
        </RowFrame>
      );
    }
    if (row.kind === "add") {
      return (
        <RowFrame {...frame}>
          {lead}
          <span className="w-5 shrink-0" />
          <AddRuleLine onAdd={() => void addRule(row.situation)} />
        </RowFrame>
      );
    }

    const shown = lineOf(row.rule);
    const enteringCell = entering?.startsWith(`${row.key}:`)
      ? (entering.slice(row.key.length + 1) as LineCell)
      : null;
    return (
      <RowFrame
        {...frame}
        onEdit={
          editable ? () => setEntering(`${row.key}:${activeCell(row) ?? "short"}`) : undefined
        }
      >
        {lead}
        <PlayButton
          playable={shown?.event != null}
          playing={playing}
          onToggle={() => (playing ? player.stop() : playRule(row.rule))}
        />
        <RuleCells
          row={row}
          active={row.key === selected ? activeCell(row) : null}
          entering={enteringCell}
          onEntering={(cell) => {
            setEntering(cell === null ? null : `${row.key}:${cell}`);
            if (cell === null) returnFocus();
          }}
          banks={data?.banks ?? []}
          edits={
            editable
              ? {
                  chance: (percent) => chanceOf(row, percent),
                  name: (name) =>
                    editSituations([
                      {
                        type: "setLeaf",
                        path: fieldPath(row.rule.path, "mRuleName"),
                        value: { type: "string", value: name },
                      },
                    ]),
                  priority: (priority) =>
                    editSituations(
                      picked(row).flatMap((each) => priorityEdits(each.rule.path, priority)),
                    ),
                  short: (short) =>
                    editSituations(
                      shortNameEdits(row.rule.path, shown?.audience ?? "owner", short),
                    ),
                }
              : null
          }
        />
      </RowFrame>
    );
  }

  const shared = data.skins.length > 1 && !dismissed && !edited;

  return (
    <div
      data-ui="VoiceLinesView"
      className="flex flex-col rounded-md border border-surface-700/50 bg-surface-900"
    >
      <VoiceLinesHeader
        data={data}
        onSkin={(bin) => choose(view.entry, bin)}
        onCooldown={editable ? (seconds) => editObject(cooldownEdit(view.entry, seconds)) : null}
        filter={filter}
        onFilter={setFilter}
        unresolved={unresolvedCount(data.lines)}
        onlyUnresolved={onlyUnresolved}
        onOnlyUnresolved={setOnlyUnresolved}
        trigger={trigger}
        onTrigger={setTrigger}
        choices={choices}
        inspecting={inspecting}
        onInspecting={setInspecting}
      />
      {shared && (
        <SharedNotice
          count={data.skins.length}
          skin={editable ? skin : null}
          onCopy={(target) => void copyForSkin(target)}
          onDismiss={() => setDismissed(true)}
        />
      )}
      <div className="flex min-w-0 items-start">
        <ContextMenu.Root>
          <ContextMenu.Trigger
            ref={list}
            role="tree"
            tabIndex={0}
            aria-label={m.audio_voice_list_label()}
            aria-multiselectable
            aria-activedescendant={selected === null ? undefined : rowId(selected)}
            onKeyDown={handleKeyDown}
            onContextMenuCapture={() => setMenuRow(selectedRow ?? null)}
            onFocus={(event) => {
              if (event.target === event.currentTarget && selectedIndex < 0) selectAt(0);
            }}
            data-ui="VoiceLinesView:list"
            className={twMerge(
              AUDIO_LIST_GROUP,
              "min-w-0 flex-1 overflow-x-auto py-1 scrollbar-md select-none focus-visible:outline-none",
            )}
          >
            {rows.length === 0 && (
              <p className="px-3 py-2 text-meta text-surface-400">{m.audio_voice_empty()}</p>
            )}
            <div className="flex min-w-max flex-col">
              {rows.map((row, index) => (
                <div
                  key={row.key}
                  onContextMenu={() => {
                    if (!picks.picked.has(row.key)) picks.pick(row.key, "only");
                    setMenuRow(row);
                  }}
                >
                  {line(row, index)}
                </div>
              ))}
            </div>
          </ContextMenu.Trigger>
          {menuRow !== null && (
            <ContextMenu.Content>
              <VoiceLineMenu actions={actionsOf(menuRow)} />
            </ContextMenu.Content>
          )}
        </ContextMenu.Root>
        {inspecting && (
          <div className="sticky top-8 self-start">
            <VoiceLineInspector
              subject={subject}
              document={view.document}
              entry={view.entry}
              onEdit={editable ? editSituations : null}
              onPlay={(rule, shownLine) => playRule(rule, shownLine)}
              playing={player.playing}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Returns `true` if `playing`, the key of what plays, is a line of `row` or its situation. */
function isPlaying(row: VoiceLineRow, playing: string | null): boolean {
  if (playing === null) return false;
  if (row.kind === "situation") return playing === `s:${row.situation.path}`;
  if (row.kind === "rule") return playing.startsWith(`${row.rule.path}:`);
  return false;
}
