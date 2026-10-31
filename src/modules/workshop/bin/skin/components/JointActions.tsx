import {
  AnchorIcon,
  CircleDashedIcon,
  CompassIcon,
  DotsThreeIcon,
  PillIcon,
  ProhibitIcon,
  PushPinIcon,
  SpiralIcon,
  WaveSineIcon,
} from "@phosphor-icons/react";
import { Fragment, type ReactNode } from "react";

import { IconButton, Menu } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, SkinModel } from "@/lib/tauri";
import type { Pose } from "@/modules/viewport";

import { usePaneCommands } from "../../menus/state/paneCommands";
import { useColliderEdit, useColliderFiles } from "../hooks/useColliders";
import { useDynamicsEdit } from "../hooks/useDynamicsEdit";
import { capsuleMate, NO_SHAPES, withCapsule, withSphere } from "../utils/colliders";
import {
  addOrientationEdits,
  addSocketEdits,
  addSpringEdits,
  excludeJointEdits,
  firstChain,
  includeJointEdits,
  removeEdits,
  simulateFromEdits,
  socketName,
  takenNames,
} from "../utils/dynamicsEdits";
import { type JointRoles, jointTree } from "../utils/dynamicsModel";
import { listCommands, SKIN_JOINT_LIST } from "../utils/skinCommands";

export interface JointActionsProps {
  readonly document: BinDocumentId;
  /** The skin object, `0x` and eight hex digits. */
  readonly entry: string;
  readonly skin: SkinModel;
  readonly pose: Pose;
  /** The joint the actions are of, by slot. */
  readonly slot: number;
  readonly roles: JointRoles;
  /** The selected joint and the one selected before it, by slot, and -1 for none. */
  readonly selected: number;
  readonly before: number;
}

/**
 * What a reader does to a joint: simulate from it, leave it out of a tree, hang a socket
 * or a spring on it, and stand a collision shape on it.
 *
 * "The skeleton pane" in docs/ux/SKIN_EDITOR.md. The items are worked out when the menu
 * opens, since the outline draws one trigger a joint.
 */
export function JointActions(props: JointActionsProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <IconButton
            size="row"
            icon={<DotsThreeIcon />}
            label={m.workshop_bin_skeleton_actions_label()}
            tooltip={false}
            reveal
            onClick={(event) => event.stopPropagation()}
          />
        }
      />
      <Menu.Content align="end" data-ui="JointActions" className="w-64">
        <Items {...props} />
      </Menu.Content>
    </Menu.Root>
  );
}

/** Offers the actions of the selected joint to the bar, which the Physics menu lists. */
export function JointCommands(props: JointActionsProps) {
  const actions = useJointActions(props);

  usePaneCommands(
    "skin.skeleton.joint",
    listCommands(
      SKIN_JOINT_LIST,
      actions.map((action) => ({ title: action.title, run: action.run })),
    ),
  );

  return null;
}

/** One action on a joint. A change of `group` draws a separator in the menu. */
interface JointAction {
  readonly key: string;
  readonly group: "simulation" | "attachments" | "colliders";
  readonly title: string;
  readonly icon: ReactNode;
  readonly danger?: boolean;
  readonly run: () => void;
}

/** Returns the actions on the joint of `props`, and none if the skin takes no edits. */
function useJointActions({
  document,
  entry,
  skin,
  pose,
  slot,
  roles,
  selected,
  before,
}: JointActionsProps): JointAction[] {
  const send = useDynamicsEdit(entry);
  const shapes = useColliderFiles(skin);
  const colliders = useColliderEdit(document, entry, skin);
  if (send === null) return [];

  const joint = pose.skeleton.joints[slot].name;
  const chain = firstChain(skin);
  const groups = chain?.groups ?? [];
  const under = jointTree(skin, pose, slot);
  const held = chain === null ? NO_SHAPES : (shapes.get(chain.path) ?? NO_SHAPES);
  const above = pose.parents[slot];
  const mate = capsuleMate(pose, slot, selected, before);
  const free = !roles.treeRoot && !roles.simulated && !roles.excluded;
  /* A save writes the whole file, so a file that is named and not read yet takes no shape. */
  const unread = chain?.colliderFile?.asset != null && !shapes.has(chain.path);

  const actions: JointAction[] = [];

  if (free && groups.length === 0) {
    actions.push({
      key: "simulate",
      group: "simulation",
      title: m.workshop_bin_skeleton_simulate_action(),
      icon: <WaveSineIcon />,
      run: () =>
        send(
          simulateFromEdits(
            skin,
            joint,
            chain === null ? { kind: "newChain" } : { kind: "newGroup", chain },
          ),
        ),
    });
  }

  if (free) {
    groups.forEach((group, at) => {
      actions.push({
        key: group.path,
        group: "simulation",
        title: m.workshop_bin_skeleton_simulate_group_action({ index: at + 1 }),
        icon: <WaveSineIcon />,
        run: () => send(simulateFromEdits(skin, joint, { kind: "group", group })),
      });
    });
  }

  if (free && chain !== null && groups.length > 0) {
    actions.push({
      key: "simulate-new-group",
      group: "simulation",
      title: m.workshop_bin_skeleton_simulate_new_group_action(),
      icon: <WaveSineIcon />,
      run: () => send(simulateFromEdits(skin, joint, { kind: "newGroup", chain })),
    });
  }

  if (under !== null && under.root) {
    actions.push({
      key: "stop",
      group: "simulation",
      title: m.workshop_bin_skeleton_stop_action(),
      icon: <PushPinIcon />,
      danger: true,
      run: () => send(removeEdits(under.tree.path)),
    });
  }

  if (under !== null && roles.simulated) {
    actions.push({
      key: "exclude",
      group: "simulation",
      title: m.workshop_bin_skeleton_exclude_action(),
      icon: <ProhibitIcon />,
      run: () => send(excludeJointEdits(under.tree.path, joint)),
    });
  }

  if (under !== null && under.excludedAt >= 0) {
    actions.push({
      key: "include",
      group: "simulation",
      title: m.workshop_bin_skeleton_include_action(),
      icon: <WaveSineIcon />,
      run: () => send(includeJointEdits(under.tree.path, under.excludedAt)),
    });
  }

  actions.push({
    key: "socket",
    group: "attachments",
    title: m.workshop_bin_skeleton_add_socket_action(),
    icon: <AnchorIcon />,
    run: () => send(addSocketEdits(skin, joint, socketName(joint, takenNames(pose, skin.sockets)))),
  });

  if (!roles.spring) {
    actions.push({
      key: "spring",
      group: "attachments",
      title: m.workshop_bin_skeleton_add_spring_action(),
      icon: <SpiralIcon />,
      run: () => send(addSpringEdits(skin, joint)),
    });
  }

  if (!roles.orientation) {
    actions.push({
      key: "orientation",
      group: "attachments",
      title: m.workshop_bin_skeleton_add_orientation_action(),
      icon: <CompassIcon />,
      run: () => send(addOrientationEdits(skin, joint)),
    });
  }

  if (chain === null || colliders === null || unread) return actions;

  actions.push({
    key: "sphere",
    group: "colliders",
    title: m.workshop_bin_skeleton_add_sphere_action(),
    icon: <CircleDashedIcon />,
    run: () => colliders.commit(chain, withSphere(held, pose, slot)),
  });

  if (above >= 0) {
    actions.push({
      key: "capsule-above",
      group: "colliders",
      title: m.workshop_bin_skeleton_add_capsule_action({
        joint: pose.skeleton.joints[above].name,
      }),
      icon: <PillIcon />,
      run: () => colliders.commit(chain, withCapsule(held, pose, slot, above)),
    });
  }

  if (mate >= 0) {
    actions.push({
      key: "capsule-mate",
      group: "colliders",
      title: m.workshop_bin_skeleton_add_capsule_action({
        joint: pose.skeleton.joints[mate].name,
      }),
      icon: <PillIcon />,
      run: () => colliders.commit(chain, withCapsule(held, pose, slot, mate)),
    });
  }

  return actions;
}

function Items(props: JointActionsProps) {
  const actions = useJointActions(props);

  return actions.map((action, at) => (
    <Fragment key={action.key}>
      {at > 0 && actions[at - 1].group !== action.group && <Menu.Separator />}
      <Menu.Item
        icon={action.icon}
        variant={action.danger === true ? "danger" : "default"}
        onClick={action.run}
      >
        {action.title}
      </Menu.Item>
    </Fragment>
  ));
}
