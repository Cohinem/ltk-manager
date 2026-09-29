import { ArrowSquareOutIcon } from "@phosphor-icons/react";

import { IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { AssetRef } from "@/lib/tauri";

import { objectDocument } from "../../../documents/utils/contentDocument";
import type { OpenIntent } from "../../../palette/utils/types";
import { useOptionalProjectContext } from "../../../projects/state/ProjectContext";
import { clickIntent, handRig, type HostHint, useOpenDocumentAs } from "../../../state";
import type { RigModel } from "../engine/model/rig";

const SYSTEM_CLASS = "VfxSystemDefinitionData";

/** A particle system to open: the file that declares it, its entry, and its path and file. */
export interface EffectTarget {
  readonly asset: AssetRef;
  readonly entry: string;
  /** The object's path, or its entry where no table names it. */
  readonly path: string;
  /** The declaring file's path, or its hash where no table names it. */
  readonly file: string;
}

/**
 * Open a particle system in its own tab on the rig the view it is opened from built, named
 * `label` on the rig pill, and on the character `host` names where one rides it. "The rig
 * picks itself" in docs/plans/vfx-templates.md.
 */
export function useOpenEffect() {
  const open = useOpenDocumentAs();

  return (
    target: EffectTarget,
    rig: RigModel,
    label: string,
    intent: OpenIntent,
    host: HostHint | null = null,
  ) => {
    handRig(target.entry, { source: { kind: "context", label }, rig }, host);
    open(
      objectDocument(target.asset, target.entry, target.path, target.file, SYSTEM_CLASS),
      intent,
    );
  };
}

interface OpenEffectButtonProps {
  /** The system to open, and null while it is unknown. */
  target: EffectTarget | null;
  rig: RigModel | null;
  label: string;
}

/**
 * Open effect, beside the focused tab with `Ctrl` held. Nothing draws without a target, or
 * outside a project, where no tab opens.
 */
export function OpenEffectButton({ target, rig, label }: OpenEffectButtonProps) {
  const project = useOptionalProjectContext();
  if (project === null || target === null || rig === null) return null;

  return <OpenEffectAction target={target} rig={rig} label={label} />;
}

function OpenEffectAction({
  target,
  rig,
  label,
}: {
  target: EffectTarget;
  rig: RigModel;
  label: string;
}) {
  const openEffect = useOpenEffect();
  const action = m.workshop_bin_vfx_open_effect_action();
  return (
    <Tooltip content={m.workshop_bin_vfx_open_effect_hint()}>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={action}
        icon={<ArrowSquareOutIcon weight="bold" className="h-4 w-4" />}
        onClick={(event) => openEffect(target, rig, label, clickIntent(event))}
      />
    </Tooltip>
  );
}
