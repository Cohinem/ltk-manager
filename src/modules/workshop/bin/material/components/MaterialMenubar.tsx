import {
  ArrowsClockwiseIcon,
  FrameCornersIcon,
  GridFourIcon,
  SphereIcon,
  SwatchesIcon,
} from "@phosphor-icons/react";
import { lazy, Suspense, use } from "react";

import { m } from "@/i18n";
import type { CommandMenu, CommandMenuEntry } from "@/modules/editor";
import {
  usePreviewGround,
  usePreviewMaterialOnShape,
  usePreviewTurntable,
  useSetPreviewDisplay,
} from "@/stores";

import { ClassMenubar } from "../../menus/components/ClassMenubar";
import { cameraSubmenu, viewModeSubmenu } from "../../menus/components/LazyPreviewItems";
import { useObjectMenus } from "../../menus/hooks/useObjectMenus";
import { ObjectMenuContext } from "../../menus/state/objectMenu";
import { usePaneCommandLookup } from "../../menus/state/paneCommands";
import { SKIN_FIT_COMMAND } from "../../skin/utils/skinCommands";
import { useLinkingSkin } from "../hooks/useLinkingSkin";
import { MATERIAL_FIT_COMMAND } from "../utils/materialCommands";

const ShapeItems = lazy(() =>
  import("./MaterialViewport").then((module) => ({ default: module.ShapeItems })),
);
const ShaderMaterialItems = lazy(() =>
  import("./ShaderMaterialMenu").then((module) => ({ default: module.ShaderMaterialItems })),
);
const PermutationItems = lazy(() =>
  import("./PermutationMenu").then((module) => ({ default: module.PermutationItems })),
);

/**
 * The menu bar of a `StaticMaterialDef` or, with `shader`, a `CustomShaderDef`.
 * "The material shell" in docs/ux/BIN_EDITOR.md.
 *
 * A shader def adds the Shader menu, whose items read the def while the menu is open.
 */
export function MaterialMenubar({ shader = false }: { shader?: boolean }) {
  const base = useObjectMenus();
  const menu = use(ObjectMenuContext);
  const entry = menu?.object.entry ?? null;
  const linking = useLinkingSkin(menu?.document ?? 0, shader ? null : entry);
  const lookup = usePaneCommandLookup();

  const onShapeChosen = usePreviewMaterialOnShape();
  const turntable = usePreviewTurntable();
  const ground = usePreviewGround();
  const setDisplay = useSetPreviewDisplay();

  const onShape = shader || onShapeChosen || linking.status !== "skin";
  const shapeReason = m.workshop_bin_menu_material_shape_reason();
  const fit = lookup(MATERIAL_FIT_COMMAND) ?? lookup(SKIN_FIT_COMMAND);

  const preview: CommandMenuEntry[] = [
    linking.status === "skin" && {
      kind: "check",
      id: "material.onShape",
      title: m.workshop_bin_material_preview_on_shape_label(),
      icon: <SphereIcon className="size-4" />,
      checked: onShapeChosen,
      run: () => setDisplay({ previewMaterialOnShape: !onShapeChosen }),
    },
    {
      kind: "submenu",
      id: "material.shape",
      title: m.workshop_bin_material_shape_label(),
      className: "w-36",
      items: [
        {
          kind: "slot",
          id: "material.shape.items",
          node: (
            <Suspense fallback={null}>
              <ShapeItems />
            </Suspense>
          ),
        },
      ],
    },
    {
      kind: "check",
      id: "material.turntable",
      title: m.workshop_bin_material_preview_turntable_label(),
      icon: <ArrowsClockwiseIcon className="size-4" />,
      checked: turntable,
      run: onShape ? () => setDisplay({ previewTurntable: !turntable }) : null,
    },
    {
      kind: "check",
      id: "material.ground",
      title: m.workshop_bin_preview_stage_label(),
      icon: <GridFourIcon className="size-4" />,
      checked: ground,
      run: onShape ? () => setDisplay({ previewGround: !ground }) : null,
    },
    { kind: "separator" },
    cameraSubmenu(),
    viewModeSubmenu(),
    { kind: "separator" },
    {
      kind: "command",
      id: MATERIAL_FIT_COMMAND,
      title: m.workshop_bin_material_fit_action(),
      icon: <FrameCornersIcon className="size-4" />,
      run: fit?.run ?? null,
      reason: fit === null ? shapeReason : fit.reason,
    },
  ];

  const menus: CommandMenu[] = [
    base.file(),
    base.edit(),
    base.view(),
    {
      id: "preview",
      title: m.workshop_bin_menu_preview_label(),
      className: "w-60",
      items: preview,
    },
  ];

  if (shader && entry !== null && menu !== null) {
    menus.push({
      id: "shader",
      title: m.workshop_bin_menu_shader_label(),
      className: "max-h-96 w-72 overflow-y-auto scrollbar-md",
      items: [
        {
          kind: "submenu",
          id: "shader.material",
          title: m.workshop_bin_shader_material_label(),
          icon: <SwatchesIcon className="size-4" />,
          className: "max-h-96 w-80 overflow-y-auto scrollbar-md",
          items: [
            {
              kind: "slot",
              id: "shader.material.items",
              node: (
                <Suspense fallback={null}>
                  <ShaderMaterialItems document={menu.document} entry={entry} />
                </Suspense>
              ),
            },
          ],
        },
        { kind: "separator" },
        {
          kind: "slot",
          id: "shader.permutation",
          node: (
            <Suspense fallback={null}>
              <PermutationItems document={menu.document} entry={entry} />
            </Suspense>
          ),
        },
      ],
    });
  }

  return <ClassMenubar menus={menus} />;
}
