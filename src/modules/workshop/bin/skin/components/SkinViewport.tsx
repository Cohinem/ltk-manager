import {
  BoneIcon,
  DotsThreeVerticalIcon,
  FrameCornersIcon,
  GridFourIcon,
  MapTrifoldIcon,
  SparkleIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { useFrame } from "@react-three/fiber";
import { useQueries, useQuery } from "@tanstack/react-query";
import { type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ButtonGroup, IconButton, Menu, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { AssetRef, BinDocumentId, GraphClip, SkinModel } from "@/lib/tauri";
import {
  Armature,
  Character,
  createPose,
  FitCamera,
  meshBounds,
  type Pose,
  type SceneClock,
  sequencePose,
  snappedPose,
  useCharacterTextures,
  useSceneColors,
  Viewport,
  viewportQueries,
} from "@/modules/viewport";
import {
  usePreviewArmature,
  usePreviewCamera,
  usePreviewGround,
  usePreviewJointNames,
  usePreviewMidlane,
  useSetPreviewDisplay,
} from "@/stores";

import { assetKey } from "../../../preview/utils/assetRef";
import { vfxQueries } from "../../vfx/hooks/useVfxSystem";
import { CameraMenu } from "../../vfx/preview/components/CameraMenu";
import { Notice } from "../../vfx/preview/components/Notice";
import { Passes } from "../../vfx/rendering/components/Passes";
import { distorts } from "../../vfx/rendering/utils/drawKind";
import { fades } from "../../vfx/rendering/utils/softParticle";
import { skinQueries } from "../api/skinQueries";
import { DocumentOpener, type GraphSource, useSkinGraphSource } from "../hooks/useGraphSource";
import { useSkinKeys } from "../hooks/useSkinKeys";
import { overriddenHidden, SkinChoiceContext, useSkinChoice } from "../state/skinChoice";
import {
  hiddenAt,
  particleCues,
  snapCues,
  timedSteps,
  type VisibilityEntry,
  visibilityTimeline,
} from "../utils/clipEvents";
import { foldedTime } from "../utils/follow";
import {
  BIND_POSE,
  bindingOf,
  jointSlot,
  nearestValue,
  openingClip,
  parameterValues,
  playableClips,
  playlistOf,
  systemModel,
  textureAssets,
} from "../utils/skinScene";
import { ClipEffect } from "./ClipEffect";
import { IdleEffect } from "./IdleEffect";
import { type PlayingStep, SkinTransport } from "./SkinTransport";

/** `useFrame` runs the lowest priority first, so the clock moves before anything samples it. */
const BEFORE_THE_SCENE = -1;

const NO_CLIPS: readonly GraphClip[] = [];

/** Where the character's feet stand, which the match camera stands off. */
const FEET = [0, 0, 0] as const;

export interface SkinViewportProps {
  readonly document: BinDocumentId;
  /** What the document was read from, which tells a graph another file declares apart. */
  readonly asset: AssetRef;
  /** The skin object, `0x` and eight hex digits. */
  readonly entry: string;
}

/**
 * One skin on its skeleton, posed by a clip of its graph and wearing its idle effects.
 *
 * A graph the index says another file declares is read through a second handle, as the
 * idle effect table reads a foreign resolver. Every other graph is read through the
 * skin's own document, which looks in the files it links.
 */
export default function SkinViewport({ document, asset, entry }: SkinViewportProps) {
  const { skin: read, source, opener } = useSkinGraphSource(document, asset, entry);

  if (read.error !== null) return <Notice text={m.workshop_bin_mesh_preview_failed_empty()} />;
  if (read.data === undefined) {
    return <Notice text={m.workshop_bin_mesh_preview_loading_label()} />;
  }

  /* The scene stays mounted while the graph's declaration answers, so the canvas and the
     textures it holds are not built twice. */
  return (
    <>
      {opener}
      <SkinScene skin={read.data} document={document} source={source} />
    </>
  );
}

interface SkinSceneProps {
  readonly skin: SkinModel;
  /** The skin's own document, which declares the systems its idle effects name. */
  readonly document: BinDocumentId;
  /** Where the skin's animation graph is read from. */
  readonly source: GraphSource;
}

function SkinScene({ skin, document, source }: SkinSceneProps) {
  const own = useSkinChoice();
  const { clock, picked, setPicked, playing, setPlaying, speed, setSpeed } =
    use(SkinChoiceContext) ?? own;
  const { effects, setEffects, submesh, pickSubmesh, mask } = use(SkinChoiceContext) ?? own;
  const { parameter, setParameter, shown, setShown, resetShown } = use(SkinChoiceContext) ?? own;

  const ground = usePreviewGround();
  const midlane = usePreviewMidlane();
  const camera = usePreviewCamera();
  const armature = usePreviewArmature();
  const jointNames = usePreviewJointNames();
  const setDisplay = useSetPreviewDisplay();

  const mesh = useQuery(viewportQueries.mesh(skin.mesh?.asset ?? null));
  const skeleton = useQuery(viewportQueries.skeleton(skin.skeleton?.asset ?? null));
  const graph = useQuery(skinQueries.graph(source.document, source.graph));
  const listed = useMemo(
    () => (graph.data === undefined ? NO_CLIPS : playableClips(graph.data.clips)),
    [graph.data],
  );

  const held = picked === BIND_POSE || listed.some((clip) => clip.hash === picked) ? picked : null;
  const chosen = held ?? openingClip(listed)?.hash ?? BIND_POSE;
  const chosenClip = listed.find((each) => each.hash === chosen) ?? null;
  const values = useMemo(
    () => (chosenClip === null ? null : parameterValues(chosenClip)),
    [chosenClip],
  );
  /* A parametric clip plays at the pair value nearest what the reader set, and at its
     first pair's value before they set one. */
  const at = useMemo(() => {
    if (values === null) return null;
    return nearestValue(values, parameter ?? chosenClip?.parameters[0] ?? values[0]);
  }, [values, chosenClip, parameter]);
  /* The atomic clips the chosen one plays, in order: itself, or what a composite reaches. */
  const playlist = useMemo(() => {
    if (chosenClip === null || graph.data === undefined) return NO_CLIPS;
    return playlistOf(chosenClip, graph.data.clips, at);
  }, [chosenClip, graph.data, at]);
  const clipModels = useQueries({
    queries: playlist.map((step) => viewportQueries.clip(step.animation?.asset ?? null)),
    combine: (results) => results.map((result) => result.data ?? null),
  });
  const stepPoses = useMemo(() => {
    const bones = skeleton.data;
    return bones === undefined ? [] : clipModels.map((model) => createPose(bones, model));
  }, [skeleton.data, clipModels]);
  const sequenced = useMemo(
    () => (skeleton.data === undefined ? null : sequencePose(skeleton.data, stepPoses)),
    [skeleton.data, stepPoses],
  );
  /* The clip's events, placed on the pass: what they hide and show, what they spawn, and
     which joints they stand on others. */
  const timed = useMemo(
    () =>
      timedSteps(
        playlist,
        stepPoses.map((step) => step.duration),
        clipModels.map((model) => model?.fps ?? null),
      ),
    [playlist, stepPoses, clipModels],
  );
  const pose = useMemo(() => {
    if (sequenced === null) return null;
    const snaps = snapCues(timed).map((cue) => ({
      ...cue,
      joint: jointSlot(sequenced, cue.joint),
      snapTo: jointSlot(sequenced, cue.snapTo),
    }));
    return snappedPose(sequenced, snaps);
  }, [sequenced, timed]);
  const duration = pose?.duration ?? 0;
  const steps = useMemo<PlayingStep[]>(
    () =>
      playlist.map((step, at) => ({
        hash: step.hash,
        name: step.name,
        duration: stepPoses[at]?.duration ?? 0,
      })),
    [playlist, stepPoses],
  );
  const maskWeights = useMemo(() => {
    const weights = graph.data?.masks.find((each) => each.hash === mask)?.weights;
    return weights === undefined ? null : Float32Array.from(weights, (weight) => weight ?? 0);
  }, [graph.data, mask]);

  const submeshes = useMemo(() => mesh.data?.ranges.map((range) => range.name) ?? [], [mesh.data]);
  const timeline = useMemo(
    () => visibilityTimeline(skin.hidden, submeshes, timed),
    [skin.hidden, submeshes, timed],
  );
  const [cued, setHidden] = useState<readonly string[]>(skin.hidden);
  const hidden = useMemo(() => overriddenHidden(cued, shown), [cued, shown]);
  /* The names are painted on a canvas over the scene, mounted here where the DOM is. */
  const [labels, setLabels] = useState<HTMLCanvasElement | null>(null);
  const cues = useMemo(() => particleCues(timed, skin.effectSystems), [timed, skin.effectSystems]);
  /* A system a linked file declares is read through a handle on that file, held open
     beside the skin's own document as a foreign graph is. */
  const sources = useMemo(() => {
    const seen = new Map<string, AssetRef>();
    for (const cue of cues) if (cue.source !== null) seen.set(assetKey(cue.source), cue.source);
    return [...seen.entries()];
  }, [cues]);
  const [opened, setOpened] = useState<ReadonlyMap<string, BinDocumentId>>(() => new Map());
  const openSource = useCallback((id: string, handle: BinDocumentId | null) => {
    setOpened((held) => {
      const next = new Map(held);
      if (handle === null) next.delete(id);
      else next.set(id, handle);
      return next;
    });
  }, []);
  const cueModels = useQueries({
    queries: cues.map((cue) => {
      const handle = cue.source === null ? document : (opened.get(assetKey(cue.source)) ?? null);
      if (handle === null) return { ...vfxQueries.system(document, cue.system), enabled: false };
      return vfxQueries.system(handle, cue.system);
    }),
    combine: (results) =>
      results.map((result) => (result.data === undefined ? null : systemModel(result.data))),
  });

  const assets = useMemo(() => textureAssets(skin), [skin]);
  const textures = useCharacterTextures(assets);
  const bindingFor = useCallback(
    (submesh: string) => bindingOf(skin, textures, submesh),
    [skin, textures],
  );
  const colors = useSceneColors();
  const scale = skin.scale ?? 1;
  const bounds = useMemo(
    () => (mesh.data === undefined ? null : meshBounds(mesh.data, skin.hidden, scale)),
    [mesh.data, skin.hidden, scale],
  );
  /* Fit answers the F key and the button. A change of preset frames again on its own. */
  const [fitToken, setFitToken] = useState(0);
  const refit = useCallback(() => setFitToken((token) => token + 1), []);

  const keys = useSkinKeys({ clock, playing, setPlaying, speed, setSpeed, fit: refit });

  const idle = useMemo(
    () =>
      skin.idleEffects.flatMap((effect) =>
        effect.system === null ? [] : [{ effect, system: effect.system }],
      ),
    [skin],
  );
  const systems = useQueries({
    queries: idle.map(({ system }) => vfxQueries.system(document, system)),
  });
  const models = systems.map((query) =>
    query.data === undefined ? null : systemModel(query.data),
  );
  const worn = [...models, ...cueModels];
  const loaded = worn.map((model) => (model === null ? "-" : "+")).join("");
  const warps = effects && worn.some((model) => model?.emitters.some(distorts) ?? false);
  const softens = effects && worn.some((model) => model?.emitters.some(fades) ?? false);

  /* A clip changing starts the pose and every idle effect over together, so an effect
     rides the clip from its first frame. The pose a preview mounts on keeps the time the
     clock stood at, which is what a change of frame asks of it. */
  const posed = useRef<Pose | null>(null);
  useEffect(() => {
    if (posed.current !== null && pose !== null && posed.current !== pose) clock.restart();
    posed.current = pose;
  }, [clock, pose]);

  /* An effect that joins replays to the clock's time, so the clock folds into one pass
     of the clip first, which draws the same frame of the pose. */
  useEffect(() => {
    const folded = foldedTime(clock.time, duration);
    if (folded !== clock.time) clock.seek(folded);
  }, [clock, duration, loaded, effects]);

  if (!skin.mesh?.asset || !skin.skeleton?.asset) {
    return <Notice text={m.workshop_bin_mesh_preview_missing_empty()} />;
  }
  if (mesh.error !== null || skeleton.error !== null) {
    return <Notice text={m.workshop_bin_mesh_preview_failed_empty()} />;
  }
  if (mesh.data === undefined || pose === null) {
    return <Notice text={m.workshop_bin_mesh_preview_loading_label()} />;
  }

  return (
    <>
      {sources.map(([id, asset]) => (
        <SourceOpener key={id} id={id} asset={asset} onOpen={openSource} />
      ))}
      <div
        ref={keys}
        tabIndex={-1}
        data-ui="SkinViewport"
        className="relative min-h-0 flex-1 outline-none"
      >
        <Viewport
          stage={ground}
          textured={midlane}
          camera={camera}
          onCameraStand={(preset) => setDisplay({ previewCamera: preset })}
        >
          <Clock clock={clock} playing={playing} speed={speed} />
          <VisibilityCues
            timeline={timeline}
            clock={clock}
            duration={duration}
            onChange={setHidden}
          />
          <FitCamera bounds={bounds} ground={FEET} token={fitToken} />
          <Passes warps={warps} softens={softens} />
          <Character
            mesh={mesh.data}
            pose={pose}
            clock={clock}
            bindingOf={bindingFor}
            colors={colors}
            hidden={hidden}
            scale={scale}
            highlighted={submesh}
            jointWeights={maskWeights}
            onSubmeshPick={pickSubmesh}
          >
            {effects &&
              idle.map(({ effect }, at) => {
                const system = models[at];
                if (system === null) return null;
                return (
                  <IdleEffect
                    key={`${at}:${effect.effectKey}`}
                    effect={effect}
                    system={system}
                    pose={pose}
                    clock={clock}
                    scale={scale}
                  />
                );
              })}
            {effects &&
              cues.map((cue, at) => {
                const system = cueModels[at];
                if (system === null || system === undefined) return null;
                return (
                  <ClipEffect
                    key={cue.key}
                    cue={cue}
                    system={system}
                    pose={pose}
                    clock={clock}
                    scale={scale}
                    duration={duration}
                  />
                );
              })}
          </Character>
          {armature && (
            <Armature
              pose={pose}
              clock={clock}
              scale={scale}
              colors={colors}
              jointWeights={maskWeights}
              labels={jointNames ? labels : null}
            />
          )}
        </Viewport>
        {armature && jointNames && (
          <canvas
            ref={setLabels}
            data-ui="SkinViewport:joint-names"
            aria-hidden
            className="pointer-events-none absolute inset-0 font-mono text-fine select-none"
          />
        )}

        <div
          data-ui="SkinViewport:controls"
          /* DS-GLASS, DS-RADIUS, DS-VEIL. The descendant selector outranks each button's own size. */
          className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-surface-veil bg-scrim p-0.5 shadow-md backdrop-blur-sm [&_button]:text-meta"
        >
          <ViewToggle
            label={m.workshop_bin_preview_stage_label()}
            active={ground}
            icon={<GridFourIcon weight="bold" className="h-4 w-4" />}
            onClick={() => setDisplay({ previewGround: !ground })}
          />
          {ground && (
            <ViewToggle
              label={m.workshop_bin_preview_midlane_label()}
              active={midlane}
              icon={<MapTrifoldIcon weight="bold" className="h-4 w-4" />}
              onClick={() => setDisplay({ previewMidlane: !midlane })}
            />
          )}
          {(idle.length > 0 || cues.length > 0) && (
            <ViewToggle
              label={m.workshop_bin_mesh_preview_effects_label()}
              active={effects}
              icon={<SparkleIcon weight="bold" className="h-4 w-4" />}
              onClick={() => setEffects(!effects)}
            />
          )}
          <ButtonGroup>
            <ViewToggle
              label={m.workshop_bin_preview_armature_label()}
              active={armature}
              icon={<BoneIcon weight="bold" className="h-4 w-4" />}
              onClick={() => setDisplay({ previewArmature: !armature })}
            />
            <ArmatureMenu />
          </ButtonGroup>
          <SubmeshMenu
            submeshes={submeshes}
            hidden={hidden}
            overridden={shown.size > 0}
            onShow={setShown}
            onReset={resetShown}
          />
          <CameraMenu />
          <Tooltip content={m.workshop_bin_mesh_preview_fit_action()}>
            <IconButton
              variant="ghost"
              size="xs"
              compact
              aria-label={m.workshop_bin_mesh_preview_fit_action()}
              icon={<FrameCornersIcon weight="bold" className="h-4 w-4" />}
              onClick={refit}
            />
          </Tooltip>
        </div>
      </div>

      <SkinTransport
        clock={clock}
        duration={duration}
        playing={playing}
        speed={speed}
        clips={listed}
        clip={chosen}
        steps={steps}
        parameter={values === null || at === null ? null : { values, value: at }}
        onParameterChange={setParameter}
        onPlayingChange={setPlaying}
        onSpeedChange={setSpeed}
        onClipChange={setPicked}
      />
    </>
  );
}

interface ViewToggleProps {
  readonly label: string;
  readonly active: boolean;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}

/** One of the preview's switches: an icon that reads as on through its accent fill, named on hover. */
function ViewToggle({ label, active, icon, onClick }: ViewToggleProps) {
  return (
    <Tooltip content={label}>
      <IconButton
        variant="ghost"
        size="xs"
        compact
        aria-label={label}
        aria-pressed={active}
        /* DS-VEIL, DS-RADIUS */
        className={active ? "bg-accent-500/15 text-accent-300 hover:bg-accent-500/25" : undefined}
        icon={icon}
        onClick={onClick}
      />
    </Tooltip>
  );
}

/** What the armature draws besides its bones, as ticks behind the kebab beside its switch. */
function ArmatureMenu() {
  const armature = usePreviewArmature();
  const jointNames = usePreviewJointNames();
  const setDisplay = useSetPreviewDisplay();

  return (
    <Menu.Root>
      <Tooltip content={m.workshop_bin_preview_armature_menu_label()}>
        <Menu.Trigger
          render={
            <IconButton
              variant="ghost"
              size="xs"
              compact
              aria-label={m.workshop_bin_preview_armature_menu_label()}
              icon={<DotsThreeVerticalIcon weight="bold" className="h-4 w-4" />}
            />
          }
        />
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner align="end">
          <Menu.Popup data-ui="ArmatureMenu" className="w-44">
            <Menu.CheckboxItem
              checked={armature && jointNames}
              disabled={!armature}
              onCheckedChange={(checked) => setDisplay({ previewJointNames: checked })}
            >
              {m.workshop_bin_preview_joint_names_label()}
            </Menu.CheckboxItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface SourceOpenerProps {
  /** What the owner keys the handle under. */
  readonly id: string;
  readonly asset: AssetRef;
  readonly onOpen: (id: string, handle: BinDocumentId | null) => void;
}

/** One linked file a cue's system lives in, held open and reported under its key. */
function SourceOpener({ id, asset, onOpen }: SourceOpenerProps) {
  const report = useCallback((handle: BinDocumentId | null) => onOpen(id, handle), [id, onOpen]);
  return <DocumentOpener asset={asset} onOpen={report} />;
}

interface SubmeshMenuProps {
  /** The `.skn`'s submeshes in its order. */
  readonly submeshes: readonly string[];
  /** The submeshes hidden right now, by the skin, the clip and the reader together. */
  readonly hidden: readonly string[];
  /** The reader has shown or hidden one by hand. */
  readonly overridden: boolean;
  readonly onShow: (submesh: string, shown: boolean) => void;
  readonly onReset: () => void;
}

/**
 * Each submesh of the mesh as a tick, which shows or hides it by hand over what the skin
 * and the clip's events say, and a row that lets them all go again.
 */
function SubmeshMenu({ submeshes, hidden, overridden, onShow, onReset }: SubmeshMenuProps) {
  const skipped = new Set(hidden.map((name) => name.toLowerCase()));
  return (
    <Menu.Root>
      <Tooltip content={m.workshop_bin_preview_submeshes_label()}>
        <Menu.Trigger
          render={
            <IconButton
              variant="ghost"
              size="xs"
              compact
              aria-label={m.workshop_bin_preview_submeshes_label()}
              /* DS-VEIL, DS-RADIUS */
              className={
                overridden ? "bg-accent-500/15 text-accent-300 hover:bg-accent-500/25" : undefined
              }
              icon={<StackIcon weight="bold" className="h-4 w-4" />}
            />
          }
        />
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner align="end">
          <Menu.Popup data-ui="SubmeshMenu" className="max-h-80 w-56 overflow-y-auto scrollbar-md">
            {submeshes.map((name) => (
              <Menu.CheckboxItem
                key={name}
                closeOnClick={false}
                checked={!skipped.has(name.toLowerCase())}
                onCheckedChange={(checked) => onShow(name, checked)}
              >
                <span className="truncate font-mono text-code select-text">{name}</span>
              </Menu.CheckboxItem>
            ))}
            {overridden && (
              <>
                <Menu.Separator />
                <Menu.Item onClick={onReset}>
                  {m.workshop_bin_preview_submeshes_reset_action()}
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The scene's clock, spending each frame's time before the scene is sampled. */
function Clock({ clock, playing, speed }: { clock: SceneClock; playing: boolean; speed: number }) {
  useFrame((_, delta) => {
    if (playing) clock.advance(delta * speed);
  }, BEFORE_THE_SCENE);
  return null;
}

interface VisibilityCuesProps {
  readonly timeline: readonly VisibilityEntry[];
  readonly clock: SceneClock;
  /** Seconds one pass of the pose lasts, which the timeline is read over. */
  readonly duration: number;
  /** The submeshes hidden from this frame on, called on the frames that change them alone. */
  readonly onChange: (hidden: readonly string[]) => void;
}

/**
 * The submesh visibility events of the playing clip, applied as the clock reaches them.
 *
 * Each entry of the timeline is one array, so the character rebinds on the few frames
 * an event falls on and on none of the rest.
 */
function VisibilityCues({ timeline, clock, duration, onChange }: VisibilityCuesProps) {
  const last = useRef<readonly string[] | null>(null);
  useFrame(() => {
    const now = hiddenAt(timeline, foldedTime(clock.time, duration));
    if (now === last.current) return;
    last.current = now;
    onChange(now);
  }, BEFORE_THE_SCENE);
  return null;
}
