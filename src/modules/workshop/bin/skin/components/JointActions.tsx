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

import { IconButton, Menu } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, SkinModel } from "@/lib/tauri";
import type { Pose } from "@/modules/viewport";

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
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
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

function Items({ document, entry, skin, pose, slot, roles, selected, before }: JointActionsProps) {
  const send = useDynamicsEdit(entry);
  const shapes = useColliderFiles(skin);
  const colliders = useColliderEdit(document, entry, skin);
  if (send === null) return null;

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

  return (
    <>
      {free && groups.length === 0 && (
        <Menu.Item
          icon={<WaveSineIcon />}
          onClick={() =>
            send(
              simulateFromEdits(
                skin,
                joint,
                chain === null ? { kind: "newChain" } : { kind: "newGroup", chain },
              ),
            )
          }
        >
          {m.workshop_bin_skeleton_simulate_action()}
        </Menu.Item>
      )}
      {free &&
        groups.map((group, at) => (
          <Menu.Item
            key={group.path}
            icon={<WaveSineIcon />}
            onClick={() => send(simulateFromEdits(skin, joint, { kind: "group", group }))}
          >
            {m.workshop_bin_skeleton_simulate_group_action({ index: at + 1 })}
          </Menu.Item>
        ))}
      {free && chain !== null && groups.length > 0 && (
        <Menu.Item
          icon={<WaveSineIcon />}
          onClick={() => send(simulateFromEdits(skin, joint, { kind: "newGroup", chain }))}
        >
          {m.workshop_bin_skeleton_simulate_new_group_action()}
        </Menu.Item>
      )}
      {under !== null && under.root && (
        <Menu.Item
          icon={<PushPinIcon />}
          variant="danger"
          onClick={() => send(removeEdits(under.tree.path))}
        >
          {m.workshop_bin_skeleton_stop_action()}
        </Menu.Item>
      )}
      {under !== null && roles.simulated && (
        <Menu.Item
          icon={<ProhibitIcon />}
          onClick={() => send(excludeJointEdits(under.tree.path, joint))}
        >
          {m.workshop_bin_skeleton_exclude_action()}
        </Menu.Item>
      )}
      {under !== null && under.excludedAt >= 0 && (
        <Menu.Item
          icon={<WaveSineIcon />}
          onClick={() => send(includeJointEdits(under.tree.path, under.excludedAt))}
        >
          {m.workshop_bin_skeleton_include_action()}
        </Menu.Item>
      )}
      <Menu.Separator />
      <Menu.Item
        icon={<AnchorIcon />}
        onClick={() =>
          send(addSocketEdits(skin, joint, socketName(joint, takenNames(pose, skin.sockets))))
        }
      >
        {m.workshop_bin_skeleton_add_socket_action()}
      </Menu.Item>
      {!roles.spring && (
        <Menu.Item icon={<SpiralIcon />} onClick={() => send(addSpringEdits(skin, joint))}>
          {m.workshop_bin_skeleton_add_spring_action()}
        </Menu.Item>
      )}
      {!roles.orientation && (
        <Menu.Item icon={<CompassIcon />} onClick={() => send(addOrientationEdits(skin, joint))}>
          {m.workshop_bin_skeleton_add_orientation_action()}
        </Menu.Item>
      )}
      {chain !== null && colliders !== null && !unread && (
        <>
          <Menu.Separator />
          <Menu.Item
            icon={<CircleDashedIcon />}
            onClick={() => colliders.commit(chain, withSphere(held, pose, slot))}
          >
            {m.workshop_bin_skeleton_add_sphere_action()}
          </Menu.Item>
          {above >= 0 && (
            <Menu.Item
              icon={<PillIcon />}
              onClick={() => colliders.commit(chain, withCapsule(held, pose, slot, above))}
            >
              {m.workshop_bin_skeleton_add_capsule_action({
                joint: pose.skeleton.joints[above].name,
              })}
            </Menu.Item>
          )}
          {mate >= 0 && (
            <Menu.Item
              icon={<PillIcon />}
              onClick={() => colliders.commit(chain, withCapsule(held, pose, slot, mate))}
            >
              {m.workshop_bin_skeleton_add_capsule_action({
                joint: pose.skeleton.joints[mate].name,
              })}
            </Menu.Item>
          )}
        </>
      )}
    </>
  );
}
