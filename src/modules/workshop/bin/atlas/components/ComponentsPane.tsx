import {
  ArrowsClockwiseIcon,
  CircleHalfIcon,
  CircleNotchIcon,
  ClockClockwiseIcon,
  CropIcon,
  CursorClickIcon,
  DotsSixIcon,
  DropHalfIcon,
  FilmStripIcon,
  FrameCornersIcon,
  GaugeIcon,
  HourglassIcon,
  type Icon,
  ImageSquareIcon,
  LineSegmentIcon,
  PaintBucketIcon,
  RowsIcon,
  SelectionIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  SpinnerIcon,
  SquaresFourIcon,
  StackIcon,
  SunHorizonIcon,
  SunIcon,
  TextTIcon,
  TimerIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { Button, Count, Grid, Inline, Kbd, SearchField, Stack, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { Notice } from "../../shared/preview/Notice";
import { addTargetOf } from "../engine/edit/newElement";
import { classAlias } from "../engine/model/classNames";
import {
  type ElementKind,
  KIND_CATEGORIES,
  type KindCategory,
  kindOf,
  matchingKinds,
} from "../engine/model/elementKinds";
import { useAddElement } from "../hooks/useAddElement";
import { useAtlasView } from "../hooks/useAtlasSources";
import { useSectionOpen, useViewPreview, viewKey } from "../state/atlasPreview";
import { usePlacing, usePlacingActions } from "../state/placing";
import { ReadOnlyNote } from "./ReadOnlyNote";
import { SectionHeading } from "./sectionParts";

const KIND_ICON: Readonly<Record<string, Icon>> = {
  UiElementIconData: ImageSquareIcon,
  UiElementTextData: TextTIcon,
  UiElementRegionData: SelectionIcon,
  UiElementScissorRegionData: CropIcon,
  UiElementParticleSystemData: SparkleIcon,
  UiElementGroupData: SquaresFourIcon,
  UiElementGroupManagedLayoutData: RowsIcon,
  UiElementGroupFramedData: FrameCornersIcon,
  UiElementGroupButtonData: CursorClickIcon,
  UiElementGroupSliderData: SlidersHorizontalIcon,
  UiElementGroupMeterData: GaugeIcon,
  UiElementEffectAnimationData: FilmStripIcon,
  UiElementEffectCooldownData: HourglassIcon,
  UiElementEffectCooldownRadialData: ClockClockwiseIcon,
  UiElementEffectCircleMaskCooldownData: TimerIcon,
  UiElementEffectAmmoData: DotsSixIcon,
  UiElementEffectFillPercentageData: PaintBucketIcon,
  UiElementEffectArcFillData: CircleNotchIcon,
  UiElementEffectGlowData: SunIcon,
  UiElementEffectLineData: LineSegmentIcon,
  UiElementEffectDesaturateData: DropHalfIcon,
  UiElementEffectCircleMaskDesaturateData: CircleHalfIcon,
  UiElementEffectInstancedData: StackIcon,
  UiElementEffectRotatingIconData: ArrowsClockwiseIcon,
  UiElementEffectAnimatedRotatingIconData: SpinnerIcon,
  UiElementEffectGlowingRotatingIconData: SunHorizonIcon,
};

const CATEGORY_TITLE: Record<KindCategory, () => string> = {
  basic: m.workshop_bin_atlas_add_category_basic_label,
  group: m.workshop_bin_atlas_add_category_group_label,
  control: m.workshop_bin_atlas_add_category_control_label,
  effect: m.workshop_bin_atlas_add_category_effect_label,
};

/** The narrowest a tile gets, which fits a two-line alias under its glyph. */
const TILE_MIN_WIDTH = "4.75rem";

const PRIMARY_BUTTON = 0;
/** The bit of a pointer event's `buttons` the primary button holds. */
const PRIMARY_HELD = 1;

export interface ComponentsPaneProps {
  readonly document: BinDocumentId;
  readonly entry: string;
}

/**
 * The components pane: every kind of element an author adds to the view, as tiles under a search
 * box, grouped under headings that fold.
 *
 * A tile is placed rather than added somewhere chosen in the pane. A click picks it up, and the
 * canvas or a row of the layers pane then takes it where the pointer puts it down. A drag out of
 * the tile does the same in one gesture. A click on the tile again, or Escape, lets go of it. A
 * double click adds one beside the selection, where `addTargetOf` says, centred on the screen.
 *
 * A search lists the matching kinds on one grid with no headings. The tiles are disabled where
 * `useAddElement` says the view takes no new element.
 */
export function ComponentsPane({ document, entry }: ComponentsPaneProps) {
  const { tree, error, pending } = useAtlasView(document, entry);
  const key = viewKey(document, entry);
  const { selected } = useViewPreview(key);
  const placing = usePlacing(key);
  const { start, stop } = usePlacingActions();
  const adder = useAddElement(key, tree);

  const [query, setQuery] = useState("");
  const kinds = useMemo(() => matchingKinds(query), [query]);

  if (error !== null) return <Notice text={m.workshop_bin_atlas_view_error()} />;
  if (pending || tree === null) return <Notice text={m.workshop_bin_atlas_view_pending()} />;
  if (tree.scenes.size === 0) return <Notice text={m.workshop_bin_atlas_layers_empty()} />;

  const { block } = adder;
  const searching = query.trim() !== "";
  const carried = placing === null ? undefined : kindOf(placing.kind);

  const addBeside = (kind: ElementKind) => {
    const target = addTargetOf(tree, selected);
    stop();
    if (target !== null) void adder.add(kind, target);
  };

  const tiles = (listed: readonly ElementKind[]) => (
    <Grid minColumnWidth={TILE_MIN_WIDTH} gap={1}>
      {listed.map((kind) => (
        <KindTile
          key={kind.class}
          kind={kind}
          carried={placing?.kind === kind.class}
          disabled={block !== null || adder.busy}
          onPick={() => {
            if (placing?.kind === kind.class) stop();
            else start({ view: key, kind: kind.class, dragged: false });
          }}
          onDragOut={() => start({ view: key, kind: kind.class, dragged: true })}
          onAddBeside={() => addBeside(kind)}
        />
      ))}
    </Grid>
  );

  return (
    <div data-ui="ComponentsPane" className="flex min-h-0 flex-1 flex-col select-none">
      <div className="flex shrink-0 flex-col gap-1.5 p-1.5 pb-1">
        <SearchField
          value={query}
          onChange={setQuery}
          label={m.workshop_bin_atlas_add_search_label()}
          clearLabel={m.workshop_bin_atlas_layers_search_clear_action()}
        >
          {searching && <Count>{kinds.length}</Count>}
        </SearchField>
        {block === null && carried === undefined && (
          <HintLine text={m.workshop_bin_atlas_add_hint()} />
        )}
        {block === null && carried !== undefined && (
          <Inline gap={1.5} justify="between">
            <HintLine
              text={m.workshop_bin_atlas_add_placing_hint({ kind: classAlias(carried.class) })}
            />
            <Kbd shortcut="Esc" />
          </Inline>
        )}
        {block === "readOnly" && <ReadOnlyNote reason={adder.readOnly} className="text-meta" />}
        {block === "variant" && <HintLine text={m.workshop_bin_atlas_add_variant_hint()} />}
        {block === "undeclared" && <HintLine text={m.workshop_bin_atlas_add_undeclared_hint()} />}
      </div>
      {kinds.length === 0 && <Notice text={m.workshop_bin_atlas_add_no_match_empty()} />}
      {/* DS-SCROLLBAR */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5 scrollbar-md">
        {searching && tiles(kinds)}
        {!searching && (
          <Stack gap={2}>
            {KIND_CATEGORIES.map((category) => (
              <KindSection key={category} category={category}>
                {tiles(kinds.filter((kind) => kind.category === category))}
              </KindSection>
            ))}
          </Stack>
        )}
      </div>
    </div>
  );
}

function HintLine({ text }: { text: string }) {
  return <span className="min-w-0 text-meta text-surface-400">{text}</span>;
}

function KindSection({ category, children }: { category: KindCategory; children: ReactNode }) {
  const id = `kinds:${category}`;
  const open = useSectionOpen(id);

  return (
    <Stack as="section" gap={1}>
      <SectionHeading id={id} title={CATEGORY_TITLE[category]()} />
      {open && children}
    </Stack>
  );
}

interface KindTileProps {
  readonly kind: ElementKind;
  /** The tile is the one being placed. */
  readonly carried: boolean;
  readonly disabled: boolean;
  /** A click, which picks the tile up or lets go of it. */
  readonly onPick: () => void;
  /** The pointer left the tile with the primary button still down on it. */
  readonly onDragOut: () => void;
  readonly onAddBeside: () => void;
}

/** One kind as a tile: its glyph over its alias, with its class as the hint. */
function KindTile({ kind, carried, disabled, onPick, onDragOut, onAddBeside }: KindTileProps) {
  const Glyph = KIND_ICON[kind.class] ?? SelectionIcon;
  const pressed = useRef(false);

  return (
    <Tooltip content={<span className="font-mono">{kind.class}</span>}>
      <Button
        variant="ghost"
        disabled={disabled}
        aria-pressed={carried}
        /* A tile stacks its glyph over its label, so it is taller than the heights of DS-SIZE. */
        className={twMerge(
          "h-auto w-full min-w-0 flex-col justify-start gap-1 px-1 py-2 text-fine font-normal text-surface-300",
          carried && "bg-accent-500/15 text-accent-300 hover:bg-accent-500/15",
        )}
        onPointerDown={(event) => {
          pressed.current = event.button === PRIMARY_BUTTON;
        }}
        onPointerUp={() => {
          pressed.current = false;
        }}
        onPointerLeave={(event) => {
          if (pressed.current && (event.buttons & PRIMARY_HELD) !== 0) onDragOut();
          pressed.current = false;
        }}
        onClick={onPick}
        onDoubleClick={onAddBeside}
      >
        <Glyph className={twMerge("size-6 shrink-0", !carried && "text-surface-200")} />
        <span className="line-clamp-2 w-full text-center break-words">
          {classAlias(kind.class)}
        </span>
      </Button>
    </Tooltip>
  );
}
