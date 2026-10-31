import {
  ArrowCounterClockwiseIcon,
  FrameCornersIcon,
  SquareSplitHorizontalIcon,
  StackIcon,
} from "@phosphor-icons/react";

import { Menu } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";

import { chooseTooltip } from "../engine/model/tooltip";
import { sceneOf } from "../engine/model/tree";
import { variantSlots } from "../engine/model/variants";
import { useAtlasLayout } from "../hooks/useAtlasLayout";
import { useTooltipSamples } from "../hooks/useLoadoutView";
import { useSceneFrames } from "../hooks/useSceneFrames";
import {
  useAtlasPreviewActions,
  useFrameSettings,
  useViewPreview,
  useViewVariant,
  viewKey,
} from "../state/atlasPreview";
import { VARIANT_BASE } from "./VariantsPane";

/** The view that a slot of the menu bar reads while its menu is open. */
export interface AtlasBarItemsProps {
  readonly document: BinDocumentId;
  /** The view controller object. */
  readonly entry: string;
}

function DisabledItem({ title, reason }: { title: string; reason: string }) {
  return (
    <Menu.Item disabled reason={reason}>
      {title}
    </Menu.Item>
  );
}

/** The base and the override slots of the view, as the variants pane lists them. */
export function VariantItems({ document, entry }: AtlasBarItemsProps) {
  const { view } = useAtlasLayout(document, entry);
  const key = viewKey(document, entry);
  const drawn = useViewVariant(key);
  const { setVariant } = useAtlasPreviewActions();

  const slots = view === null ? [] : variantSlots(view.files);
  if (slots.length === 0) {
    return (
      <DisabledItem
        title={m.workshop_bin_atlas_variants_base_label()}
        reason={m.workshop_bin_atlas_variants_empty()}
      />
    );
  }

  return (
    <Menu.RadioGroup
      value={drawn ?? VARIANT_BASE}
      onValueChange={(value: string) => setVariant(key, value === VARIANT_BASE ? null : value)}
    >
      <Menu.RadioItem value={VARIANT_BASE}>
        {m.workshop_bin_atlas_variants_base_label()}
      </Menu.RadioItem>
      {slots.map((slot) => (
        <Menu.RadioItem key={slot.slot} value={slot.slot} disabled={!slot.shipped}>
          {slot.slot}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}

/** The abilities of the tooltip sample, as the tooltip row lists them. */
export function TooltipSampleItems({ document, entry }: AtlasBarItemsProps) {
  const { view } = useAtlasLayout(document, entry);
  const { samples: drawn, tooltipSample } = useFrameSettings();
  const hasTooltip = view?.tooltip != null;
  const { samples } = useTooltipSamples(document, hasTooltip && drawn);
  const { setTooltipSample } = useAtlasPreviewActions();

  const title = m.workshop_bin_atlas_tooltip_ability_label();
  if (!hasTooltip) {
    return <DisabledItem title={title} reason={m.workshop_bin_menu_atlas_tooltip_reason()} />;
  }

  if (!drawn) {
    return <DisabledItem title={title} reason={m.workshop_bin_atlas_tooltip_samples_off_hint()} />;
  }

  const chosen = chooseTooltip(samples, tooltipSample);
  if (chosen === null) {
    return <DisabledItem title={title} reason={m.workshop_bin_atlas_tooltip_no_abilities_hint()} />;
  }

  return (
    <Menu.RadioGroup value={chosen.id} onValueChange={(value: string) => setTooltipSample(value)}>
      {samples.map((sample) => (
        <Menu.RadioItem key={sample.id} value={sample.id}>
          {sample.name}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}

/** The frame actions of the primary selection's scene, as `SceneMenu` lists them. */
export function SceneFrameItems({ document, entry }: AtlasBarItemsProps) {
  const { tree } = useAtlasLayout(document, entry);
  const { selected } = useViewPreview(viewKey(document, entry));
  const scene = tree === null || selected === null ? null : sceneOf(tree, selected);
  const frames = useSceneFrames(document, entry, scene);

  const title = m.workshop_bin_atlas_frame_own_action();
  if (frames === null) {
    return <DisabledItem title={title} reason={m.workshop_bin_menu_atlas_selection_reason()} />;
  }

  if (frames.stacked) {
    return <DisabledItem title={title} reason={m.workshop_bin_menu_atlas_stacked_reason()} />;
  }

  const { drawOwn, others, drawOnFrame, split, reset } = frames;

  return (
    <>
      <Menu.Item
        icon={<FrameCornersIcon className="size-4" />}
        disabled={drawOwn === null}
        reason={m.workshop_bin_menu_atlas_frame_own_reason()}
        onClick={drawOwn ?? undefined}
      >
        {title}
      </Menu.Item>
      <Menu.SubmenuRoot>
        <Menu.SubmenuTrigger icon={<StackIcon className="size-4" />} disabled={others.length === 0}>
          {m.workshop_bin_atlas_frame_join_label()}
        </Menu.SubmenuTrigger>
        <Menu.SubmenuContent className="max-h-80 w-60 overflow-y-auto scrollbar-md">
          {others.map((frame) => (
            <Menu.Item key={frame.head} onClick={() => drawOnFrame(frame.head)}>
              {frame.label}
            </Menu.Item>
          ))}
        </Menu.SubmenuContent>
      </Menu.SubmenuRoot>
      <Menu.Item
        icon={<SquareSplitHorizontalIcon className="size-4" />}
        disabled={split === null}
        reason={m.workshop_bin_menu_atlas_frame_split_reason()}
        onClick={split ?? undefined}
      >
        {m.workshop_bin_atlas_frame_split_action()}
      </Menu.Item>
      <Menu.Item
        icon={<ArrowCounterClockwiseIcon className="size-4" />}
        disabled={reset === null}
        reason={m.workshop_bin_menu_atlas_frame_reset_reason()}
        onClick={reset ?? undefined}
      >
        {m.workshop_bin_atlas_frame_reset_action()}
      </Menu.Item>
    </>
  );
}
