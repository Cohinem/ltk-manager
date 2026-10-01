import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  Combobox,
  SegmentedControl,
  useComboboxFilter,
  useComboboxFilteredItems,
} from "@/components";
import { m } from "@/i18n";
import { usePreviewUrl } from "@/lib/previewUrl";
import type { AssetRef, BinDocumentId, UiCharacter, UiTexture } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { uiQueries } from "../api/uiQueries";
import { chooseTooltip, type TooltipSample } from "../engine/model/tooltip";
import { useAtlasLayout } from "../hooks/useAtlasLayout";
import { useTooltipSamples } from "../hooks/useLoadoutView";
import {
  useAtlasPreviewActions,
  useAtlasPreviewStore,
  useFrameSettings,
} from "../state/atlasPreview";

/** The width an icon is asked for at, twice its drawn size for a sharp thumbnail. */
const ICON_WIDTH = 40;

/** A character row's height, `h-8`, which the virtualizer lays every row at. */
const ROW_HEIGHT = 32;
/** The rows rendered beyond each edge of the popup, so a fast scroll shows no gap. */
const OVERSCAN = 12;

const NO_CHARACTERS: UiCharacter[] = [];

export interface TooltipBarProps {
  readonly document: BinDocumentId;
  /** The view controller, as `0x` and eight digits. */
  readonly entry: string;
}

/**
 * The row over the canvas of a view whose controller lays out a tooltip, which picks the ability
 * whose tooltip fills it: a character, searched among every character the object index holds a
 * record for, then its passive or one of its abilities. Nothing renders for any other view.
 */
export function TooltipBar({ document, entry }: TooltipBarProps) {
  const { view } = useAtlasLayout(document, entry, "controller");
  if (view?.tooltip == null) return null;

  return <TooltipRow document={document} />;
}

function TooltipRow({ document }: { document: BinDocumentId }) {
  const { samples: drawn, tooltipSample } = useFrameSettings();
  const { samples, pending } = useTooltipSamples(document, drawn);
  const { setTooltipSample } = useAtlasPreviewActions();
  const chosen = chooseTooltip(samples, tooltipSample);

  return (
    <div
      data-ui="TooltipBar"
      className="flex h-10 shrink-0 items-center gap-2 border-b border-surface-700/50 px-2 select-none"
    >
      <span className="shrink-0 text-meta text-surface-400">
        {m.workshop_bin_atlas_tooltip_title()}
      </span>
      <CharacterPicker document={document} />
      {chosen !== null && (
        <SegmentedControl
          size="xs"
          aria-label={m.workshop_bin_atlas_tooltip_ability_label()}
          value={chosen.id}
          onChange={setTooltipSample}
          options={samples.map((sample) => ({
            value: sample.id,
            label: <AbilityLabel sample={sample} />,
            name: sample.name,
          }))}
        />
      )}
      {pending && <SpinnerGapIcon className="h-3.5 w-3.5 shrink-0 animate-spin text-surface-400" />}
      {!pending && chosen === null && (
        <span className="min-w-0 truncate text-meta text-surface-400">
          {m.workshop_bin_atlas_tooltip_no_abilities_hint()}
        </span>
      )}
      {chosen !== null && (
        <span className="min-w-0 truncate text-meta text-surface-200">{chosen.name}</span>
      )}
      {!drawn && (
        <span className="ml-auto shrink-0 text-meta text-surface-400">
          {m.workshop_bin_atlas_tooltip_samples_off_hint()}
        </span>
      )}
    </div>
  );
}

/** An ability's segment: its icon and the key that casts it. */
function AbilityLabel({ sample }: { sample: TooltipSample }) {
  return (
    <span className="flex items-center gap-1.5">
      <TextureIcon texture={sample.icon} className="h-4 w-4" />
      {sample.hotkey ?? m.workshop_bin_atlas_tooltip_passive_label()}
    </span>
  );
}

/**
 * The character whose abilities the samples are, searched by its name or its ID among every
 * character the object index holds a record for. An ID is the folder the game's paths name the
 * character by, which it spells byte for byte, so it draws in mono.
 *
 * The list holds thousands of rows, so it renders only the window the popup scrolls to.
 */
function CharacterPicker({ document }: { document: BinDocumentId }) {
  const sandbox = useSandbox();
  const read = useQuery(uiQueries.characters(document, sandbox));
  const characters = read.data ?? NO_CHARACTERS;
  const id = useAtlasPreviewStore((state) => state.tooltipCharacter);
  const { setTooltipCharacter } = useAtlasPreviewActions();
  const filter = useComboboxFilter();
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);
  const rows = useRef<RowVirtualizer | null>(null);
  const chosen = useMemo(
    () =>
      characters.find((each) => each.id.toLowerCase() === id.toLowerCase()) ?? {
        id,
        name: null,
        icon: null,
      },
    [characters, id],
  );

  return (
    <Combobox.Root<UiCharacter>
      virtualized
      items={characters}
      value={chosen}
      onValueChange={(next) => next && setTooltipCharacter(next.id)}
      onItemHighlighted={(item, { reason, index }) => {
        if (item !== undefined && reason === "keyboard") rows.current?.scrollToIndex(index);
      }}
      itemToStringLabel={(character) => character.name ?? character.id}
      itemToStringValue={(character) => character.id}
      isItemEqualToValue={(character, value) => character.id === value.id}
      filter={(character, query) =>
        filter.contains(character, query, (item) => `${item.name ?? ""} ${item.id}`)
      }
    >
      <div className="relative w-56 shrink-0" data-ui="TooltipBar:character">
        <TextureIcon
          texture={chosen.icon}
          className="pointer-events-none absolute top-1.5 left-1.5 h-4 w-4"
        />
        <Combobox.Input
          aria-label={m.workshop_bin_atlas_tooltip_character_label()}
          placeholder={m.workshop_bin_atlas_tooltip_character_placeholder()}
          className="h-7 pr-8 pl-7 text-meta"
        />
        <Combobox.Trigger className="absolute top-0 right-0 flex h-full items-center pr-2.5">
          <Combobox.Icon />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner className="min-w-(--anchor-width)">
          <Combobox.Popup ref={setPopup} className="max-h-80">
            <Combobox.Empty>
              {read.isPending
                ? m.workshop_bin_atlas_tooltip_character_pending()
                : m.workshop_bin_atlas_tooltip_character_empty()}
            </Combobox.Empty>
            <Combobox.List>
              <CharacterRows scroller={popup} rows={rows} />
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

type RowVirtualizer = Virtualizer<HTMLDivElement, Element>;

/** The rows of the characters the filter keeps that `scroller` shows, and a few either side. */
function CharacterRows({
  scroller,
  rows,
}: {
  scroller: HTMLDivElement | null;
  rows: RefObject<RowVirtualizer | null>;
}) {
  const characters = useComboboxFilteredItems<UiCharacter>();
  const virtualizer = useVirtualizer({
    count: characters.length,
    getScrollElement: () => scroller,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  useLayoutEffect(() => {
    rows.current = virtualizer;
  }, [rows, virtualizer]);

  return (
    <div role="presentation" className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => {
        const character = characters[row.index];
        if (character === undefined) return null;

        return (
          <Combobox.Item
            key={character.id}
            index={row.index}
            value={character}
            className="absolute top-0 left-0 h-8 w-full gap-2 pr-2"
            /* The virtualizer's offset, which no class can hold. */
            style={{ transform: `translateY(${row.start}px)` }}
          >
            <TextureIcon texture={character.icon} className="h-5 w-5" />
            <span className="min-w-0 flex-1 truncate text-row">
              {character.name ?? character.id}
            </span>
            {character.name !== null && character.name !== character.id && (
              <span className="shrink-0 font-mono text-mono-row text-surface-400">
                {character.id}
              </span>
            )}
          </Combobox.Item>
        );
      })}
    </div>
  );
}

/** A texture as a small square, and an empty square where there is none. */
function TextureIcon({ texture, className }: { texture: UiTexture | null; className: string }) {
  if (texture?.asset == null) {
    /* DS-RADIUS */
    return (
      <span aria-hidden className={twMerge("shrink-0 rounded-sm bg-surface-800", className)} />
    );
  }

  return <TextureImage asset={texture.asset} className={className} />;
}

function TextureImage({ asset, className }: { asset: AssetRef; className: string }) {
  const url = usePreviewUrl(asset, ICON_WIDTH);

  return (
    /* DS-RADIUS */
    <img
      src={url}
      alt=""
      loading="lazy"
      draggable={false}
      className={twMerge("shrink-0 rounded-sm object-cover", className)}
    />
  );
}
