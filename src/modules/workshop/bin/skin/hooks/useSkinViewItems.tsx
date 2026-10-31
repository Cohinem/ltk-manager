import {
  ArrowsOutCardinalIcon,
  BoneIcon,
  CloudFogIcon,
  EyeSlashIcon,
  FrameCornersIcon,
  GridFourIcon,
  IntersectThreeIcon,
  MapTrifoldIcon,
  MountainsIcon,
  SelectionIcon,
  SparkleIcon,
  SpeakerHighIcon,
  StackIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { lazy, Suspense, use } from "react";

import { HexshadeIcon } from "@/components";
import { m } from "@/i18n";
import type { CommandMenuEntry } from "@/modules/editor";
import {
  usePreviewArmature,
  usePreviewBackdrop,
  usePreviewGround,
  usePreviewJointNames,
  usePreviewMidlane,
  usePreviewMove,
  usePreviewMoveMode,
  usePreviewShaders,
  usePreviewSound,
  usePreviewSun,
  usePreviewPostEffects,
  usePreviewAmbientOcclusion,
  useSetPreviewDisplay,
} from "@/stores";

import { cameraSubmenu, viewModeSubmenu } from "../../menus/components/LazyPreviewItems";
import { ObjectMenuContext } from "../../menus/state/objectMenu";
import { SkinChoiceContext } from "../state/skinChoice";
import {
  type Lookup,
  MENU_ICON as ICON,
  listSubmenu,
  offerCheck,
  offerCommand,
} from "../utils/offerItems";
import {
  listedCommands,
  offerChecks,
  SKIN_BAKE_COMMAND,
  SKIN_FIT_COMMAND,
  SKIN_HIDE_UI_COMMAND,
  SKIN_OUTLINE_COMMAND,
  SKIN_POST_EFFECTS_COMMAND,
  SKIN_SUBMESH_LIST,
  SKIN_SUN_COMMAND,
  SKIN_VISIBILITY_COMMAND,
} from "../utils/skinCommands";
import { SKIN_KEYS } from "../utils/skinKeys";
import type { SkinGate } from "./useSkinGate";

/* In a separate chunk, because it reads the viewport barrel, which pulls three. */
const BackdropItems = lazy(() =>
  import("../components/SkinViewport").then((module) => ({ default: module.BackdropItems })),
);

/** Returns the Bake tangents item of the File menu, which a skin outside a project lacks. */
export function useSkinFileItems(lookup: Lookup, gate: SkinGate): CommandMenuEntry[] {
  const menu = use(ObjectMenuContext);
  if (menu?.asset.kind !== "layer") return [];

  return [
    offerCommand(
      SKIN_BAKE_COMMAND,
      m.workshop_bin_skin_tangents_action(),
      <SparkleIcon className={ICON} />,
      lookup(SKIN_BAKE_COMMAND),
      gate.preview,
    ),
  ];
}

/** Returns the preview's items of the View menu. */
export function useSkinViewItems(lookup: Lookup, gate: SkinGate): CommandMenuEntry[] {
  const backdrop = usePreviewBackdrop();
  const ground = usePreviewGround();
  const midlane = usePreviewMidlane();
  const move = usePreviewMove();
  const moveMode = usePreviewMoveMode();
  const armature = usePreviewArmature();
  const jointNames = usePreviewJointNames();
  const shaders = usePreviewShaders();
  const sound = usePreviewSound();
  const sun = usePreviewSun();
  const postEffects = usePreviewPostEffects();
  const ambientOcclusion = usePreviewAmbientOcclusion();
  const setDisplay = useSetPreviewDisplay();
  const choice = use(SkinChoiceContext);

  const blocked = gate.preview;
  const applies = blocked === null;
  const whenPreview = (run: () => void) => (applies ? run : null);
  const submeshes = listedCommands(lookup, SKIN_SUBMESH_LIST);

  return [
    viewModeSubmenu(),
    cameraSubmenu(),
    {
      kind: "command",
      id: SKIN_FIT_COMMAND,
      title: m.workshop_bin_mesh_preview_fit_action(),
      icon: <FrameCornersIcon className={ICON} />,
      shortcut: SKIN_KEYS.fit.shortcut,
      run: applies ? (lookup(SKIN_FIT_COMMAND)?.run ?? null) : null,
      reason: blocked ?? undefined,
    },
    { kind: "separator" },
    {
      kind: "submenu",
      id: "skin.backdrop",
      title: m.workshop_bin_preview_backdrop_label(),
      icon: <MountainsIcon className={ICON} />,
      className: "w-52",
      items: [
        {
          kind: "slot",
          id: "skin.backdrop.items",
          node: (
            <Suspense fallback={null}>
              <BackdropItems />
            </Suspense>
          ),
        },
      ],
    },
    offerCommand(
      SKIN_VISIBILITY_COMMAND,
      m.workshop_bin_preview_backdrop_visibility_label(),
      <IntersectThreeIcon className={ICON} />,
      lookup(SKIN_VISIBILITY_COMMAND),
      blocked,
    ),
    offerCommand(
      SKIN_SUN_COMMAND,
      m.workshop_bin_preview_sun_label(),
      <SunIcon className={ICON} />,
      lookup(SKIN_SUN_COMMAND),
      blocked,
    ),
    {
      kind: "command",
      id: "skin.sun.reset",
      title: m.workshop_bin_preview_sun_reset_action(),
      run: sun === null ? null : () => setDisplay({ previewSun: null }),
      reason: m.workshop_bin_menu_skin_custom_reason(),
    },
    offerCommand(
      SKIN_POST_EFFECTS_COMMAND,
      m.workshop_bin_preview_post_effects_label(),
      <CloudFogIcon className={ICON} />,
      lookup(SKIN_POST_EFFECTS_COMMAND),
      blocked,
    ),
    {
      kind: "command",
      id: "skin.postEffects.reset",
      title: m.workshop_bin_preview_post_effects_reset_action(),
      run:
        postEffects === null && ambientOcclusion === null
          ? null
          : () => setDisplay({ previewPostEffects: null, previewAmbientOcclusion: null }),
      reason: m.workshop_bin_menu_skin_custom_reason(),
    },
    { kind: "separator" },
    {
      kind: "check",
      id: "skin.placement",
      title: m.workshop_bin_preview_move_label(),
      icon: <ArrowsOutCardinalIcon className={ICON} />,
      checked: move,
      run: whenPreview(() => setDisplay({ previewMove: !move })),
    },
    {
      kind: "submenu",
      id: "skin.placement.options",
      title: m.workshop_bin_preview_move_menu_label(),
      className: "w-44",
      items: [
        {
          kind: "radio",
          id: "skin.placement.mode",
          value: moveMode,
          options: [
            { value: "translate", title: m.workshop_bin_preview_move_translate_label() },
            { value: "rotate", title: m.workshop_bin_preview_move_rotate_label() },
          ],
          onPick: (mode) =>
            setDisplay({ previewMove: true, previewMoveMode: mode as typeof moveMode }),
        },
        { kind: "separator" },
        {
          kind: "command",
          id: "skin.placement.reset",
          title: m.workshop_bin_preview_move_reset_action(),
          run: () =>
            setDisplay({ previewPlacement: null, previewPlacedOn: null, previewFacing: 0 }),
        },
      ],
    },
    {
      kind: "check",
      id: "skin.ground",
      title: m.workshop_bin_preview_stage_label(),
      icon: <GridFourIcon className={ICON} />,
      checked: ground,
      run: backdrop === null ? whenPreview(() => setDisplay({ previewGround: !ground })) : null,
    },
    {
      kind: "check",
      id: "skin.midlane",
      title: m.workshop_bin_preview_midlane_label(),
      icon: <MapTrifoldIcon className={ICON} />,
      checked: midlane,
      run:
        backdrop === null && ground
          ? whenPreview(() => setDisplay({ previewMidlane: !midlane }))
          : null,
    },
    { kind: "separator" },
    {
      kind: "check",
      id: "skin.armature",
      title: m.workshop_bin_preview_armature_label(),
      icon: <BoneIcon className={ICON} />,
      checked: armature,
      run: whenPreview(() => setDisplay({ previewArmature: !armature })),
    },
    {
      kind: "check",
      id: "skin.armature.names",
      title: m.workshop_bin_menu_skin_joint_names_label(),
      checked: armature && jointNames,
      run: armature ? whenPreview(() => setDisplay({ previewJointNames: !jointNames })) : null,
    },
    {
      kind: "check",
      id: "skin.shaders",
      title: m.workshop_bin_preview_shaders_label(),
      icon: <HexshadeIcon className={shaders ? ICON : `${ICON} grayscale`} />,
      checked: shaders,
      run: whenPreview(() => setDisplay({ previewShaders: !shaders })),
    },
    offerCheck(
      SKIN_OUTLINE_COMMAND,
      m.workshop_bin_preview_outlines_label(),
      <SelectionIcon className={ICON} />,
      lookup(SKIN_OUTLINE_COMMAND),
      blocked,
    ),
    {
      kind: "check",
      id: "skin.sound",
      title: m.audio_viewport_sound_label(),
      icon: <SpeakerHighIcon className={ICON} />,
      checked: sound,
      run: whenPreview(() => setDisplay({ previewSound: !sound })),
    },
    listSubmenu(
      "skin.submeshes",
      m.workshop_bin_preview_submeshes_label(),
      <StackIcon className={ICON} />,
      [
        ...offerChecks("skin.submeshes.item", submeshes),
        { kind: "separator" },
        {
          kind: "command",
          id: "skin.submeshes.reset",
          title: m.workshop_bin_preview_submeshes_reset_action(),
          run: choice !== null && choice.shown.size > 0 ? () => choice.resetShown() : null,
          reason: m.workshop_bin_menu_skin_custom_reason(),
        },
      ],
      blocked ?? (submeshes.length === 0 ? m.workshop_bin_menu_skin_preview_reason() : null),
      m.workshop_bin_menu_skin_preview_reason(),
    ),
    { kind: "separator" },
    offerCheck(
      SKIN_HIDE_UI_COMMAND,
      m.workshop_bin_preview_hide_ui_action(),
      <EyeSlashIcon className={ICON} />,
      lookup(SKIN_HIDE_UI_COMMAND),
      blocked,
    ),
  ];
}
