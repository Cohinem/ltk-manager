import { PathIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";

import { Button, Select } from "@/components";
import { errorSummary, m } from "@/i18n";
import {
  type AssetRef,
  type BinDocumentId,
  type EffectSystem,
  type SpellPreview,
} from "@/lib/tauri";

import { assetKey } from "../../../preview/utils/assetRef";
import { useBinDocument } from "../../documents/hooks/useBinDocument";
import { skinQueries } from "../../skin/api/skinQueries";
import { Notice } from "../../vfx/preview/components/Notice";
import { spellQueries } from "../api/spellQueries";
import { compileFlight } from "../utils/flight";
import { spellEffect } from "../utils/spellSuggestions";
import { MissileOptions } from "./MissileOptions";

const MissileViewport = lazy(() => import("./MissileViewport"));

export interface SkinSource {
  readonly document: BinDocumentId;
  readonly entry: string;
}

export interface MissilePaneProps {
  readonly asset: AssetRef;
  readonly entry: string;
  readonly skin: SkinSource;
}

/** One selected spell declaration, held open for the isolated missile preview. */
export function MissilePane({ asset, entry, skin }: MissilePaneProps) {
  const { state, reopen } = useBinDocument(asset, entry);
  if (state.status === "failed")
    return <Failure message={errorSummary(state.error)} retry={reopen} />;
  if (state.status !== "open") return <Notice text={m.workshop_spells_loading_label()} />;
  return <MissileRead document={state.handle.document} entry={entry} skin={skin} />;
}

function MissileRead({ document, entry, skin }: SkinSource & { skin: SkinSource }) {
  const read = useQuery(spellQueries.preview(document, entry));
  const skinRead = useQuery(skinQueries.skin(skin.document, skin.entry));
  const error = read.error ?? skinRead.error;
  if (error !== null)
    return (
      <Failure
        message={errorSummary(error)}
        retry={() => {
          void read.refetch();
          void skinRead.refetch();
        }}
      />
    );
  if (read.data === undefined || skinRead.data === undefined)
    return <Notice text={m.workshop_spells_loading_label()} />;
  return <MissileSetup preview={read.data} effects={skinRead.data.effectSystems} skin={skin} />;
}

function effectId(effect: EffectSystem): string {
  return `${effect.key}:${effect.system}:${effect.source === null ? "own" : assetKey(effect.source)}`;
}

function MissileSetup({
  preview,
  effects,
  skin,
}: {
  preview: SpellPreview;
  effects: readonly EffectSystem[];
  skin: SkinSource;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [anchors, setAnchors] = useState([-400, 0, 400, 0, 100]);
  const names = useQuery(
    spellQueries.effects(
      skin.document,
      effects.map((item) => item.system),
    ),
  );
  const automatic = spellEffect(
    effects,
    preview.effectKey,
    preview.effectName,
    names.data?.objects,
  );
  const suggested = automatic === null ? null : effectId(automatic);
  const effect = effects.find((effect) => effectId(effect) === (picked ?? suggested));
  const [fromX, fromZ, toX, toZ, height] = anchors;
  const flight = useMemo(
    () =>
      preview.missile === null
        ? null
        : compileFlight(preview.missile, [fromX, height, fromZ], [toX, height, toZ]),
    [preview, fromX, fromZ, toX, toZ, height],
  );
  const invalid = preview.issues.some((issue) => issue.kind === "invalid");
  const items = effects
    .map((item) => ({
      value: effectId(item),
      label: names.data?.objects[item.system]?.path.split("/").at(-1) ?? item.system,
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
  const selected = items.find((item) => item.value === (picked ?? suggested));
  const movement = preview.missile?.movement;
  let blocked: { title: string; description: string } | null = null;
  if (invalid)
    blocked = {
      title: m.workshop_missile_data_title(),
      description: m.workshop_missile_data_hint(),
    };
  else if (preview.missile === null)
    blocked = {
      title: m.workshop_missile_missing_title(),
      description: m.workshop_missile_missing_empty(),
    };
  else if (movement?.kind === "unsupported" || movement?.kind === "missing")
    blocked = {
      title: m.workshop_missile_motion_title(),
      description: m.workshop_missile_motion_hint(),
    };
  else if (flight === null)
    blocked = {
      title: m.workshop_missile_invalid_title(),
      description: m.workshop_missile_invalid_hint(),
    };
  else if (effect === undefined)
    blocked = {
      title: m.workshop_missile_choose_title(),
      description: m.workshop_missile_choose_hint(),
    };

  return (
    <div data-ui="MissilePane" className="flex min-h-0 flex-1 flex-col overflow-auto scrollbar-md">
      <div className="flex shrink-0 flex-col gap-2 border-b border-surface-700/40 px-3 py-3">
        <div className="flex items-center justify-between gap-3 text-meta">
          <span className="font-medium text-surface-200">
            {m.workshop_missile_effect_short_label()}
          </span>
          <span className="text-surface-400">{m.workshop_missile_isolated_label()}</span>
        </div>
        <Select.Root
          items={items}
          value={selected?.value ?? null}
          onValueChange={setPicked}
          disabled={effects.length === 0}
        >
          <Select.Trigger
            aria-label={m.workshop_missile_effect_label()}
            className="h-8 min-w-0 gap-2 bg-surface-900 px-2 text-meta"
          >
            <Select.Value
              className="min-w-0 truncate"
              placeholder={m.workshop_missile_effect_label()}
            >
              {selected?.label}
            </Select.Value>
            <Select.Icon />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner>
              <Select.Popup>
                {items.map((item) => (
                  <Select.Item key={item.value} value={item.value} className="text-meta">
                    {item.label}
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
        {picked !== null && (
          <p className="text-meta text-surface-400">{m.workshop_missile_effect_manual_hint()}</p>
        )}
      </div>
      {blocked !== null && (
        <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <PathIcon weight="duotone" className="size-8 text-surface-400" />
          <div className="flex max-w-80 flex-col gap-2">
            <h3 className="text-sm font-medium text-surface-200">{blocked.title}</h3>
            <p className="text-meta leading-relaxed text-surface-400">{blocked.description}</p>
          </div>
        </div>
      )}
      {blocked === null && flight !== null && effect !== undefined && (
        <div className="flex flex-1 shrink-0 flex-col p-3">
          <Suspense fallback={<Notice text={m.workshop_spells_loading_label()} />}>
            <EffectPreview
              key={`${effectId(effect)}:${JSON.stringify(flight)}`}
              effect={effect}
              document={skin.document}
              flight={flight}
            />
          </Suspense>
        </div>
      )}
      <MissileOptions preview={preview} anchors={anchors} setAnchors={setAnchors} effect={effect} />
    </div>
  );
}

function EffectPreview({
  effect,
  document,
  flight,
}: {
  effect: EffectSystem;
  document: BinDocumentId;
  flight: NonNullable<ReturnType<typeof compileFlight>>;
}) {
  if (effect.source !== null)
    return <ForeignEffect asset={effect.source} entry={effect.system} flight={flight} />;
  return <MissileViewport document={document} entry={effect.system} flight={flight} />;
}

function ForeignEffect({
  asset,
  entry,
  flight,
}: {
  asset: AssetRef;
  entry: string;
  flight: NonNullable<ReturnType<typeof compileFlight>>;
}) {
  const { state, reopen } = useBinDocument(asset, entry);
  if (state.status === "failed")
    return <Failure message={errorSummary(state.error)} retry={reopen} />;
  if (state.status !== "open") return <Notice text={m.workshop_spells_loading_label()} />;
  return <MissileViewport document={state.handle.document} entry={entry} flight={flight} />;
}

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="flex flex-col gap-2 p-2 text-meta">
      <p className="text-danger-text select-text">{message}</p>
      <Button size="xs" onClick={retry}>
        {m.workshop_objects_retry_action()}
      </Button>
    </div>
  );
}
