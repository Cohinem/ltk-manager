import { PlusIcon } from "@phosphor-icons/react";
import { type ReactNode, use, useEffect, useMemo, useRef, useState } from "react";

import { Button, Count, Inline, SegmentedControl, Stack } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";

import type { ViewContext } from "../../classes/components/ClassCells";
import { FieldLabelsContext } from "../../classes/state/fieldLabels";
import { Notice } from "../../shared/preview/Notice";
import { useColliderEdit, useColliderFiles } from "../hooks/useColliders";
import { useDynamicsEdit } from "../hooks/useDynamicsEdit";
import { useMeshItems } from "../hooks/useDynamicsRows";
import { type Picked, usePicked } from "../hooks/usePicked";
import { useSkinBind } from "../hooks/useSkinBind";
import { SkinChoiceContext } from "../state/skinChoice";
import { dynamicsDiagnostics } from "../utils/dynamicsDiagnostics";
import { addSocketEdits, socketName, takenNames } from "../utils/dynamicsEdits";
import { POSE_MODIFIERS, SOCKETS } from "../utils/dynamicsFields";
import { dynamicsLabel } from "../utils/dynamicsLabels";
import { modifierItem, type PhysicsItem, socketItem } from "../utils/physicsItems";
import { AddModifierMenu } from "./AddModifierMenu";
import { type PhysicsScope, PhysicsScopeContext, usePhysicsScope } from "./PhysicsCells";
import { ModifierFields, PhysicsFields, PhysicsHead } from "./PhysicsDetail";
import { PhysicsList } from "./PhysicsList";
import { SocketFields, SocketGizmoMode } from "./SocketFields";

export interface PhysicsPaneProps {
  readonly view: ViewContext;
  /** The skin object, `0x` and eight hex digits, and null where the view holds no row. */
  readonly entry: string | null;
}

/** Which of the skin's two lists the pane shows. */
type PhysicsTab = "modifiers" | "sockets";

/**
 * The pose modifiers and the sockets of a skin: a row of actions, the item picked in one
 * of the two lists, and under it the list or the item's fields.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md. The typed read says which item is which and
 * feeds the viewport, the fields are the document's own rows, and the two meet on the hash
 * path each item is read at.
 */
export function PhysicsPane({ view, entry }: PhysicsPaneProps) {
  if (entry === null) return <Notice text={m.workshop_bin_mesh_preview_missing_empty()} />;

  return (
    <Stack fill data-ui="PhysicsPane">
      <FieldLabelsContext value={dynamicsLabel}>
        <Loaded view={view} entry={entry} />
      </FieldLabelsContext>
    </Stack>
  );
}

function Loaded({ view, entry }: { view: ViewContext; entry: string }) {
  const { document } = view;
  const bind = useSkinBind(document, entry);
  const shapes = useColliderFiles(bind.skin ?? undefined);
  const colliders = useColliderEdit(document, entry, bind.skin ?? undefined);
  const scope = useMemo<PhysicsScope | null>(() => {
    if (bind.skin === null) return null;

    const { skin, pose } = bind;
    const diagnostics = dynamicsDiagnostics(skin, pose);
    return { document, entry, skin, pose, shapes, colliders, diagnostics };
  }, [document, entry, bind, shapes, colliders]);

  if (bind.skin === null) return <Notice text={bind.notice} />;
  if (scope === null) return null;

  return (
    <PhysicsScopeContext value={scope}>
      <Lists />
    </PhysicsScopeContext>
  );
}

function Lists() {
  const { document, entry, skin, pose } = usePhysicsScope();
  const send = useDynamicsEdit(entry);
  const [tab, setTab] = useState<PhysicsTab>("modifiers");

  const modifierRows = useMeshItems(document, entry, POSE_MODIFIERS, skin.poseModifiers.length);
  const socketRows = useMeshItems(document, entry, SOCKETS, skin.sockets.length);
  const modifiers = useMemo(
    () => skin.poseModifiers.map((each) => modifierItem(each, pose)),
    [skin.poseModifiers, pose],
  );
  const sockets = useMemo(
    () => skin.sockets.map((each) => socketItem(each, pose)),
    [skin.sockets, pose],
  );
  const modifierPick = usePicked(modifiers);
  const socketPick = usePicked(sockets);

  const modifier = skin.poseModifiers.find((each) => each.path === modifierPick.item?.path);
  const modifierRow = rowAt(modifierRows, modifierPick.item?.path);
  const socket = skin.sockets.find((each) => each.path === socketPick.item?.path);
  const socketRow = rowAt(socketRows, socketPick.item?.path);

  /* The viewport's gizmo stands on the socket picked here, while the sockets show. */
  const setSocket = use(SkinChoiceContext)?.setSocket;
  const moved = tab === "sockets" ? (socketPick.item?.path ?? null) : null;
  useEffect(() => {
    setSocket?.(moved);

    return () => setSocket?.(null);
  }, [moved, setSocket]);

  return (
    <>
      <div
        data-ui="PhysicsPane:toolbar"
        className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-700/50 px-2 py-1.5 select-none"
      >
        <SegmentedControl
          size="xs"
          className="font-sans"
          aria-label={m.workshop_bin_physics_tabs_label()}
          value={tab}
          onChange={setTab}
          options={[
            {
              value: "modifiers",
              label: (
                <TabLabel
                  title={m.workshop_bin_physics_modifiers_title()}
                  count={modifiers.length}
                />
              ),
            },
            {
              value: "sockets",
              label: (
                <TabLabel title={m.workshop_bin_physics_sockets_title()} count={sockets.length} />
              ),
            },
          ]}
        />
        {tab === "modifiers" && send !== null && <AddModifierMenu />}
        {tab === "sockets" && send !== null && <AddSocketButton />}
      </div>
      {tab === "modifiers" && (
        <Listed
          items={modifiers}
          picked={modifierPick}
          label={m.workshop_bin_physics_modifiers_title()}
          empty={m.workshop_bin_physics_modifiers_empty()}
        >
          {modifier !== undefined && modifierRow !== undefined && (
            <ModifierFields row={modifierRow} modifier={modifier} />
          )}
        </Listed>
      )}
      {tab === "sockets" && (
        <Listed
          items={sockets}
          picked={socketPick}
          label={m.workshop_bin_physics_sockets_title()}
          empty={m.workshop_bin_physics_sockets_empty()}
          actions={socket !== undefined && <SocketGizmoMode socket={socket} />}
        >
          {socket !== undefined && socketRow !== undefined && (
            <SocketFields row={socketRow} socket={socket} />
          )}
        </Listed>
      )}
    </>
  );
}

interface ListedProps {
  readonly items: readonly PhysicsItem[];
  readonly picked: Picked;
  /** The list's accessible name. */
  readonly label: string;
  /** What the list says where it holds nothing. */
  readonly empty: string;
  /** The picked item's own controls. */
  readonly actions?: ReactNode;
  /** The fields of the picked item. */
  readonly children: ReactNode;
}

/** One list of the pane: its picked item, and under it the unfolded list or the item's fields. */
function Listed({ items, picked, label, empty, actions, children }: ListedProps) {
  const { item, index, listed } = picked;
  const step = (by: number) => {
    const next = items[index + by];
    if (next !== undefined) picked.pick(next.path);
  };

  /* A fold takes the element the focus was on out of the pane, so the focus is put on what
     took its place: the picked row of an unfolded list, and the head's caret over fields.
     A focus that sits in another pane is left where it is. */
  const head = useRef<HTMLDivElement>(null);
  const folded = useRef(listed);
  useEffect(() => {
    if (folded.current === listed) return;
    folded.current = listed;

    const pane = head.current?.parentElement ?? null;
    const focused = document.activeElement;
    if (pane === null || !(focused === document.body || pane.contains(focused))) return;

    const next = listed
      ? pane.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
      : head.current?.querySelector<HTMLElement>("button");
    next?.focus();
  }, [listed]);

  return (
    <>
      {item !== null && (
        <PhysicsHead
          ref={head}
          item={item}
          index={index}
          count={items.length}
          listed={listed}
          onToggle={picked.toggleListed}
          onStep={step}
          actions={actions}
        />
      )}
      {listed && (
        <PhysicsList
          items={items}
          selected={item?.path ?? null}
          onSelect={picked.pick}
          onOpen={picked.open}
          label={label}
          empty={empty}
        />
      )}
      {!listed && item !== null && <PhysicsFields path={item.path}>{children}</PhysicsFields>}
    </>
  );
}

function TabLabel({ title, count }: { title: string; count: number }) {
  return (
    <Inline as="span" gap={1}>
      {title}
      {count > 0 && <Count>{count}</Count>}
    </Inline>
  );
}

/** Adds a socket on the joint selected in the Skeleton pane or the viewport. */
function AddSocketButton() {
  const { entry, skin, pose } = usePhysicsScope();
  const send = useDynamicsEdit(entry);
  const selected = use(SkinChoiceContext)?.joint ?? null;
  const slot = selected === null ? -1 : pose.jointNamed(selected);
  if (slot < 0 || send === null) {
    return (
      <Button variant="ghost" size="xs" left={<PlusIcon />} disabled>
        {m.workshop_bin_physics_add_socket_label()}
      </Button>
    );
  }

  const joint = pose.skeleton.joints[slot].name;

  return (
    <Button
      variant="ghost"
      size="xs"
      left={<PlusIcon />}
      onClick={() =>
        send(addSocketEdits(skin, joint, socketName(joint, takenNames(pose, skin.sockets))))
      }
    >
      {m.workshop_bin_physics_add_socket_action({ joint })}
    </Button>
  );
}

/** The row read at the hash path `path`, which is how a typed item names its own. */
function rowAt(rows: readonly BinRow[], path: string | undefined): BinRow | undefined {
  return rows.find((row) => row.path === path);
}
