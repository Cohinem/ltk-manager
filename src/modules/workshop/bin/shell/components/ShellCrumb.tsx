import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Menu } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { useEmitters } from "../../vfx/inspector/state/emitterChoice";
import { nameOf } from "../../vfx/inspector/utils/emitterCards";
import { type EmitterGroup, GROUP_TITLE } from "../../vfx/inspector/utils/emitterGroups";
import type { EmitterCardData } from "../../vfx/inspector/utils/emitterTypes";

/**
 * System, emitter, a child lane's emitter and group, each a segment aiming the inspector.
 *
 * "The shell" in docs/ux/BIN_EDITOR.md.
 */
export function ShellCrumb({ system }: { system: string }) {
  const { target, aim, card, root, group, child, chooseCard } = useEmitters();

  return (
    <nav
      data-ui="ShellCrumb"
      aria-label={m.workshop_bin_shell_crumb_label()}
      className="flex min-w-0 items-center gap-0.5 text-row select-none"
    >
      <CrumbSegment on={target === "system"} onClick={() => aim("system")}>
        <span className="min-w-0 truncate">{system}</span>
      </CrumbSegment>
      {root !== undefined && (
        <>
          <CrumbCaret />
          <CrumbSegment
            on={child === null && target === "emitter"}
            onClick={() => (child === null ? aim("emitter") : chooseCard(root.key))}
          >
            <span className="min-w-0 truncate">{nameOf(root)}</span>
            <CrumbIndex index={root.index} />
          </CrumbSegment>
        </>
      )}
      {child !== null && (
        <>
          <CrumbCaret />
          <CrumbSegment on={target === "emitter"} onClick={() => aim("emitter")}>
            <span className="min-w-0 truncate">{child.emitter.name}</span>
            <CrumbIndex index={child.emitter.listIndex} />
          </CrumbSegment>
        </>
      )}
      {card !== undefined && group !== null && (
        <>
          <CrumbCaret />
          <GroupSegment card={card} group={group} />
        </>
      )}
    </nav>
  );
}

/* Button's xs box, so a segment lines up with the row's controls. DS-RADIUS, DS-VEIL */
const SEGMENT =
  "flex h-7 min-w-0 cursor-pointer items-center gap-1 rounded-md px-2 font-medium transition-colors";

const SEGMENT_OFF = "text-surface-400 hover:bg-surface-veil hover:text-surface-100";

function CrumbCaret() {
  return <CaretRightIcon weight="bold" className="size-3 shrink-0 text-surface-500" />;
}

function CrumbIndex({ index }: { index: number }) {
  return <span className="shrink-0 font-normal tabular-nums opacity-60">[{index}]</span>;
}

function CrumbSegment({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={on ? "location" : undefined}
      className={twMerge(SEGMENT, on ? "bg-accent-500/15 text-accent-300" : SEGMENT_OFF)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The last segment, which is a menu of the groups the emitter sets.
 *
 * It names the group last picked and never the one on screen, so its own label holds
 * still under the pointer. "The crumb holds still and the header moves" in
 * docs/ux/BIN_EDITOR.md.
 */
function GroupSegment({ card, group }: { card: EmitterCardData; group: EmitterGroup }) {
  const { chooseGroup } = useEmitters();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <button
            type="button"
            className={twMerge(
              SEGMENT,
              "shrink-0",
              SEGMENT_OFF,
              "data-[popup-open]:bg-surface-veil",
            )}
          >
            {GROUP_TITLE[group]()}
            <CaretDownIcon weight="bold" className="size-3 shrink-0" />
          </button>
        }
      />
      <Menu.Content align="start" sideOffset={4} className="w-40">
        {card.groups.map((each) => (
          <Menu.Item
            key={each.group}
            onClick={() => chooseGroup({ key: card.key, group: each.group })}
          >
            {GROUP_TITLE[each.group]()}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}
