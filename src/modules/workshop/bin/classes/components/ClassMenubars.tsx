import { AtlasMenubar, ElementMenubar, FontMenubar } from "../../atlas/components/AtlasMenubar";
import { MapMenubar } from "../../map/components/MapMenubar";
import { MaterialMenubar } from "../../material/components/MaterialMenubar";
import { ObjectMenubar } from "../../menus/components/ClassMenubar";
import { nameHash } from "../../shared/utils/binHash";
import { AnimationGraphMenubar, SkinMenubar } from "../../skin/components/SkinMenubar";
import { VfxMenubar } from "../../vfx/components/VfxMenubar";
import { animationGraphLayout, type ClassLayout, voiceLinesLayout } from "../utils/classLayouts";

const CUSTOM_SHADER_DEF = nameHash("CustomShaderDef");

/** The menu bar of `layout`. Voice lines draws its own, per docs/ux/CONTEXTUAL_VOICE.md. */
export function ClassMenubarOf({ layout, classHash }: { layout: ClassLayout; classHash: string }) {
  if (layout === voiceLinesLayout) return null;
  if (layout === animationGraphLayout) return <AnimationGraphMenubar />;

  switch (layout.shell) {
    case "vfx":
      return <VfxMenubar />;
    case "skin":
      return <SkinMenubar />;
    case "map":
      return <MapMenubar />;
    case "material":
      return <MaterialMenubar shader={classHash === CUSTOM_SHADER_DEF} />;
    case "atlas":
      return <AtlasMenubar />;
    case "element":
      return <ElementMenubar />;
    case "font":
      return <FontMenubar />;
    case undefined:
      return <ObjectMenubar />;
  }
}
