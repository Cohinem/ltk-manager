import { useReactFlow } from "@xyflow/react";

import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";
import { useGraphMinimap, useSetPreviewDisplay } from "@/stores";

import type { PaneCommand, PaneFocusProps } from "../../../menus/state/paneCommands";
import type { EmitterRef } from "../../clipboard/emitterCopy";
import type { EmitterClipboard } from "../../clipboard/emitterKeys";
import { useReadOnlyReason, useShownPaneCommands } from "../../hooks/usePaneOffers";
import { nodeClassCommand, VFX_COMMAND, VFX_PANE } from "../../utils/vfxCommands";
import { useCyclePreviewBackdrop } from "../state/previewBackdrop";
import { itemClass } from "../utils/nodeText";
import type { GraphItem, MasterItem } from "../utils/systemGraph";
import { useBackdropLabel } from "./BackdropButton";
import { useClassChoices } from "./ClassAction";
import type { GraphActions } from "./graphActions";
import { itemFolds, structureRemoveLabel } from "./GraphMenu";
import type { NodeStructure } from "./nodeStructure";

interface GraphCommandsOptions {
  readonly actions: GraphActions | null;
  readonly clipboard: EmitterClipboard | null;
  readonly structure: NodeStructure;
  /** The emitters of the selected master nodes. */
  readonly selection: readonly EmitterRef[];
  readonly pickedEmitter: EmitterRef | null;
  /** The node selected alone. */
  readonly pickedItem: GraphItem | null;
  readonly pickedMaster: MasterItem | null;
  readonly onSelectAll: (selected: boolean) => void;
  readonly onQuickAdd: () => void;
  readonly onFit: () => void;
  readonly onFrame: (id: string) => void;
  readonly onCollapseAll: (collapsed: boolean) => void;
  readonly onResetLayout: () => void;
  readonly previewed: boolean;
  readonly onPreviewedChange: (previewed: boolean) => void;
  readonly looped: boolean;
  readonly onLoopedChange: (looped: boolean) => void;
}

/** Offers what the canvas can do to the menu bar, per "Menu bar" in docs/ux/VFX_GRAPH.md. */
export function useGraphCommands(options: GraphCommandsOptions): PaneFocusProps {
  const { actions, clipboard, structure, selection, pickedEmitter, pickedItem, pickedMaster } =
    options;

  const flow = useReactFlow();
  const minimap = useGraphMinimap();
  const setDisplay = useSetPreviewDisplay();
  const cycleBackdrop = useCyclePreviewBackdrop();
  const backdropLabel = useBackdropLabel();
  const copyText = useCopyToClipboard();
  const readOnly = useReadOnlyReason();
  const classes = useClassChoices(pickedItem);

  const entry = actions?.entry ?? "";
  const emitters = selection.length > 0;
  const node = pickedItem?.type === "master" ? null : pickedItem;
  const nodeDuplicate = node === null ? null : structure.duplicate(node);
  const nodeRemove = node === null ? null : structure.remove(node);
  const nodeReason = readOnly ?? m.workshop_bin_menu_vfx_node_reason();
  const editReason = readOnly ?? m.workshop_bin_menu_vfx_target_reason();
  const emitterReason = m.workshop_bin_menu_vfx_emitter_reason();

  const emitterRun = (
    run: ((emitters: readonly EmitterRef[]) => Promise<void>) | null | undefined,
  ) => (emitters && run != null ? () => void run(selection) : null);

  const duplicate = emitterRun(clipboard?.duplicate);
  const remove = emitterRun(clipboard?.remove);
  const paste = clipboard?.paste ?? null;

  const held = pickedItem === null ? null : itemClass(pickedItem);
  const className = held?.name ?? null;
  const folds = pickedItem !== null && itemFolds(pickedItem);
  const collapsed = pickedItem !== null && actions?.collapsed.has(pickedItem.id) === true;
  const append = pickedItem?.type === "struct" ? structure.append(pickedItem) : null;

  const classCommands = Object.fromEntries(
    (classes?.choices ?? []).map((choice, at): [string, PaneCommand] => [
      nodeClassCommand(at),
      { run: () => classes?.pick(choice.hash), checked: choice.current, title: choice.label },
    ]),
  );

  return useShownPaneCommands(VFX_PANE.graph, {
    [VFX_COMMAND.copy]: {
      run: emitterRun(clipboard?.copy),
      title: m.workshop_bin_emitter_copy_action(),
      reason: emitterReason,
    },
    [VFX_COMMAND.duplicate]: {
      run: duplicate ?? nodeDuplicate,
      title:
        nodeDuplicate !== null && !emitters
          ? m.workshop_bin_menu_vfx_node_duplicate_action()
          : m.workshop_bin_emitter_duplicate_action(),
      reason: editReason,
    },
    [VFX_COMMAND.paste]: {
      run: paste === null ? null : () => void paste(entry, pickedEmitter),
      title: m.workshop_bin_emitter_paste_action(),
      reason: readOnly,
    },
    [VFX_COMMAND.remove]: {
      run: remove ?? nodeRemove,
      title:
        nodeRemove !== null && node !== null && !emitters
          ? structureRemoveLabel(node)
          : m.workshop_bin_emitter_delete_action(),
      reason: editReason,
    },
    [VFX_COMMAND.selectAll]: { run: () => options.onSelectAll(true) },
    [VFX_COMMAND.selectNone]: { run: () => options.onSelectAll(false) },
    [VFX_COMMAND.quickAdd]: {
      run: readOnly === undefined ? options.onQuickAdd : null,
      reason: readOnly,
    },
    [VFX_COMMAND.quickField]: {
      run: pickedMaster === null || readOnly !== undefined ? null : options.onQuickAdd,
      reason: readOnly ?? emitterReason,
    },
    [VFX_COMMAND.graphItem]: {
      run: append,
      reason: readOnly ?? m.workshop_bin_menu_vfx_item_reason(),
    },
    [VFX_COMMAND.zoomIn]: { run: () => void flow.zoomIn({ duration: 150 }) },
    [VFX_COMMAND.zoomOut]: { run: () => void flow.zoomOut({ duration: 150 }) },
    [VFX_COMMAND.graphFit]: { run: options.onFit },
    [VFX_COMMAND.collapseAll]: { run: () => options.onCollapseAll(true) },
    [VFX_COMMAND.expandAll]: { run: () => options.onCollapseAll(false) },
    [VFX_COMMAND.graphPreview]: {
      run: () => options.onPreviewedChange(!options.previewed),
      checked: options.previewed,
    },
    [VFX_COMMAND.surfaceLoop]: {
      run: () => options.onLoopedChange(!options.looped),
      checked: options.looped,
    },
    [VFX_COMMAND.minimap]: {
      run: () => setDisplay({ graphMinimap: !minimap }),
      checked: minimap,
    },
    [VFX_COMMAND.backdrop]: { run: cycleBackdrop, title: backdropLabel },
    [VFX_COMMAND.frame]: {
      run: pickedItem === null ? null : () => options.onFrame(pickedItem.id),
      reason: m.workshop_bin_menu_vfx_node_reason(),
    },
    [VFX_COMMAND.collapseNode]: {
      run: folds ? () => actions?.toggleCollapsed(pickedItem.id) : null,
      title: collapsed
        ? m.workshop_bin_graph_expand_action()
        : m.workshop_bin_graph_collapse_action(),
      reason: m.workshop_bin_menu_vfx_node_reason(),
    },
    [VFX_COMMAND.collapseOthers]: {
      run: folds ? () => actions?.collapseOthers(pickedItem) : null,
      reason: m.workshop_bin_menu_vfx_node_reason(),
    },
    [VFX_COMMAND.copyClassName]: {
      run: className === null ? null : () => void copyText(className, m.workshop_bin_name_label()),
      reason: m.workshop_bin_menu_vfx_class_reason(),
    },
    [VFX_COMMAND.copyClassHash]: {
      run: held === null ? null : () => void copyText(held.hash, m.workshop_bin_hash_label()),
      reason: m.workshop_bin_menu_vfx_class_reason(),
    },
    [VFX_COMMAND.resetLayout]: { run: options.onResetLayout },
    [VFX_COMMAND.nodeDuplicate]: { run: nodeDuplicate, reason: nodeReason },
    [VFX_COMMAND.nodeRemove]: {
      run: nodeRemove,
      title: node === null ? undefined : structureRemoveLabel(node),
      reason: nodeReason,
    },
    ...classCommands,
  });
}
