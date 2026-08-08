import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, Loader2, Palette, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components";
import { api } from "@/lib/tauri";
import { libraryKeys } from "@/modules/library/api/keys";

import { type CdChampionSkin, skinPalette, tierLabel } from "../api/cdragon";
import { championSquareImg } from "../api/ddragon";
import { useCdChampion, useChampionDetail, useChampionList, useNativeVersion } from "../api/queries";

export function NativePage() {
  const { data: version, isLoading: versionLoading, error: versionError } = useNativeVersion();
  const champQuery = useChampionList(version);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const champs = useMemo(() => {
    const map = champQuery.data;
    if (!map) return [];
    const list = Object.values(map);
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [champQuery.data, query]);

  const detailQuery = useChampionDetail(version, selected);
  const selectedChampion = selected ? champQuery.data?.[selected] : undefined;
  const cdChampionQuery = useCdChampion(selectedChampion?.key ?? null);

  useEffect(() => {
    if (!selected) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selected]);

  if (versionLoading || champQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-700 border-t-accent-500" />
          <span className="text-sm text-surface-400">Fetching champion roster…</span>
        </div>
      </div>
    );
  }

  if (versionError || champQuery.error) {
    const msg =
      (versionError as Error | undefined)?.message ?? (champQuery.error as Error | undefined)?.message ?? "Unknown error";
    return (
      <div className="flex h-full items-center justify-center bg-surface-900 p-8">
        <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-center">
          <p className="text-sm font-medium text-red-300">Couldn’t load champions</p>
          <p className="mt-1 text-xs text-surface-400">{msg}</p>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <SkinSelector
        championId={Number(selectedChampion?.key ?? 0)}
        detailQuery={detailQuery}
        cdChampionQuery={cdChampionQuery}
        onBack={() => setSelected(null)}
      />
    );
  }

  const total = champQuery.data ? Object.keys(champQuery.data).length : 0;

  return (
    <div className="flex h-full flex-col bg-surface-900">
      <div className="border-b border-surface-600 bg-surface-800/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-surface-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search champions…"
              autoFocus
              className="h-8 w-full rounded-lg border border-surface-600 bg-surface-800 pr-3 pl-10 text-sm text-surface-100 placeholder:text-surface-500 focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-surface-500 hover:bg-surface-700 hover:text-surface-200"
                aria-label="Clear search"
              >
                <span className="text-xs leading-none">×</span>
              </button>
            )}
          </div>
          <span className="text-xs text-surface-500">
            {champs.length} of {total} champions
          </span>
          <span className="hidden items-center gap-1.5 text-xs text-surface-500 sm:inline-flex">
            <span className="rounded border border-surface-600 bg-surface-800 px-1 py-0.5 font-mono text-[11px]">Esc</span> to go back
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {champs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-surface-400">No champions match “{query}”</p>
              <button type="button" onClick={() => setQuery("")} className="mt-2 text-xs text-accent-400 hover:text-accent-300">
                Clear search
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            {champs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900"
              >
                <div className="overflow-hidden rounded-lg border border-surface-700/70 bg-surface-800/60 transition-all group-hover:border-accent-500/40 group-hover:bg-surface-800">
                  <div className="aspect-square overflow-hidden bg-surface-950">
                    <img
                      src={championSquareImg(version!, c.id)}
                      alt={c.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.06]"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity = "0.35";
                      }}
                    />
                  </div>
                  <div className="px-2 py-2">
                    <div className="truncate text-xs font-medium leading-tight text-surface-100 group-hover:text-white">{c.name}</div>
                    <div className="truncate text-[11px] leading-tight text-surface-500">{c.title.replace(/^the\s+/i, "")}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SkinSelector({
  championId,
  detailQuery,
  cdChampionQuery,
  onBack,
}: {
  championId: number;
  detailQuery: ReturnType<typeof useChampionDetail>;
  cdChampionQuery: ReturnType<typeof useCdChampion>;
  onBack: () => void;
}) {
  const detail = detailQuery.data;
  const cdChampion = cdChampionQuery.data;
  const [skinIdx, setSkinIdx] = useState(0);
  const [chromaIdx, setChromaIdx] = useState<number | null>(null);
  const [chromasOpen, setChromasOpen] = useState(false);
  const [previewChromaId, setPreviewChromaId] = useState<number | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const chromaRootRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [applying, setApplying] = useState(false);
  const [appliedSkinKey, setAppliedSkinKey] = useState<string | null>(null);

  const skins = cdChampion?.skins ?? [];
  const activeSkin: CdChampionSkin | null = skins[skinIdx] ?? null;
  const chromas = activeSkin?.chromas ?? [];
  const activeHasChromas = chromas.length > 0;
  const splashSrc = activeSkin?.splashPath;
  const activeSkinName = activeSkin?.name ?? "";
  const activeChroma = chromaIdx != null ? (chromas[chromaIdx] ?? null) : null;
  const palette = useMemo(
    () => skinPalette(activeSkin, activeChroma, activeSkinName || detail?.name || "champion"),
    [activeSkin, activeChroma, activeSkinName, detail?.name],
  );
  const activeTier = tierLabel(activeSkin?.rarity);
  const appliedKey = activeSkin ? `${activeSkin.id}:${activeChroma?.id ?? "base"}` : null;
  const canApply = Boolean(activeSkin && !activeSkin.isBase && !applying);

  useEffect(() => {
    setSkinIdx(0);
    setChromaIdx(null);
    setAppliedSkinKey(null);
  }, [cdChampion?.id]);

  useEffect(() => {
    setChromaIdx(null);
    setChromasOpen(false);
    setPreviewChromaId(null);
  }, [skinIdx]);

  useEffect(() => {
    if (!chromasOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!chromaRootRef.current?.contains(event.target as Node)) setChromasOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChromasOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [chromasOpen]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setSkinIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setSkinIdx((i) => Math.min(skins.length - 1, i + 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [skins.length]);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const child = el.children[skinIdx] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [skinIdx]);

  if (detailQuery.isLoading || cdChampionQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0c10]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#c8aa6e]" />
      </div>
    );
  }

  if (!detail || !activeSkin) {
    return (
      <div className="flex h-full flex-col bg-[#070b10]">
        <div className="flex h-12 shrink-0 items-center px-4">
          <button type="button" onClick={onBack} className="inline-flex h-8 items-center gap-2 border border-[#c8aa6e]/45 bg-black/35 px-3 text-xs font-semibold tracking-[0.16em] text-[#c8aa6e] transition hover:bg-[#c8aa6e]/10">
            <ArrowLeft className="h-3.5 w-3.5" /> CHAMPIONS
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-white/60">Couldn’t load skins.</div>
      </div>
    );
  }

  const stepSkin = (direction: number) => {
    if (skins.length === 0) return;
    setSkinIdx((current) => (current + direction + skins.length) % skins.length);
  };
  const chromaCount = chromas.length;
  const previewChroma = chromas.find((chroma) => chroma.id === previewChromaId) ?? null;
  const previewSrc = previewChroma?.chromaPath || splashSrc;

  const applySkin = async () => {
    if (!activeSkin || activeSkin.isBase || applying) return;

    setApplying(true);
    try {
      const result = await api.applyLeagueSkin(championId, activeSkin.id, activeChroma?.id ?? null);
      if (!result.ok) {
        toast.error("Couldn’t apply skin", result.error.message);
        return;
      }

      setAppliedSkinKey(appliedKey);
      await queryClient.invalidateQueries({ queryKey: libraryKeys.mods() });
      toast.success("Skin applied", `${activeChroma?.name ?? activeSkinName} is ready for the next patch.`);
    } catch (error) {
      toast.error("Couldn’t apply skin", error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#05080d] text-white">
      <div className="absolute inset-0">
        {splashSrc && <img key={splashSrc} src={splashSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[center_18%]" draggable={false} />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#03070c] via-[#03070c]/45 to-[#03070c]/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#02050a]/85 via-transparent to-[#02050a]/60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.58)_100%)]" />
        <div className="absolute inset-0 opacity-25 transition-opacity duration-700" style={{ background: `radial-gradient(900px 560px at 54% 28%, ${palette.glow}, transparent 72%)` }} />
      </div>

      <div className="relative z-10 flex h-12 shrink-0 items-center px-4 sm:px-8">
        <button type="button" onClick={onBack} className="inline-flex h-8 items-center gap-2 border border-[#c8aa6e]/50 bg-black/35 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#c8aa6e] shadow-[0_4px_18px_rgba(0,0,0,0.25)] backdrop-blur-sm transition hover:border-[#f0d9a0] hover:bg-[#c8aa6e] hover:text-[#101820] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8aa6e]/50">
          <ArrowLeft className="h-3.5 w-3.5" /> Champions
        </button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-between gap-8 px-4 pb-6 pt-8 sm:px-8 lg:pt-14">
        <div className="max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            {detail.tags.map((tag) => <span key={tag} className="border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/65 backdrop-blur-sm">{tag}</span>)}
          </div>
          <h1 className="mt-3 font-serif text-5xl font-bold uppercase leading-none tracking-[0.04em] text-[#f0d9a0] drop-shadow-[0_3px_15px_rgba(0,0,0,0.8)] sm:text-7xl">{detail.name}</h1>
          <p className="mt-1 text-sm italic capitalize text-white/65 sm:text-base">{detail.title}</p>
          <div className="mt-5 flex items-center gap-3">
            <span className="h-px w-10 bg-[#c8aa6e]/70" />
            <p className="text-lg font-semibold text-white drop-shadow sm:text-2xl">{activeChroma?.name ?? activeSkinName}</p>
          </div>
          {activeTier && <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-[#c8aa6e]">{activeTier}</p>}
          <button
            type="button"
            onClick={() => void applySkin()}
            disabled={!canApply}
            title={activeSkin.isBase ? "The base champion has no LeagueSkins package" : undefined}
            className="mt-5 inline-flex h-10 items-center gap-2 border border-[#c8aa6e]/70 bg-[#c8aa6e] px-4 text-xs font-bold uppercase tracking-[0.18em] text-[#101820] shadow-[0_8px_25px_rgba(0,0,0,0.3)] transition hover:bg-[#f0d9a0] disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-black/35 disabled:text-white/45 disabled:shadow-none"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : appliedSkinKey === appliedKey ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {applying ? "Applying…" : appliedSkinKey === appliedKey ? "Applied" : activeSkin.isBase ? "Base skin" : "Apply skin"}
          </button>
        </div>

        {activeHasChromas && (
          <div ref={chromaRootRef} className="pointer-events-auto relative flex flex-col items-center">
            {chromasOpen && previewChroma && <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-4 w-[min(80vw,26rem)] -translate-x-1/2 overflow-hidden border border-[#c8aa6e]/60 bg-[#071019]/95 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.7)] backdrop-blur-md"><img src={previewSrc} alt={previewChroma.name} className="max-h-[min(60vh,24rem)] w-full object-contain" /><p className="truncate px-2 py-1.5 text-center text-sm font-semibold text-[#f0d9a0]">{previewChroma.name}</p></div>}
            {chromasOpen && <div role="group" aria-label={`Chromas for ${activeSkinName}`} className="mb-3 flex max-w-[min(90vw,34rem)] flex-wrap items-center justify-center gap-2.5" onMouseLeave={() => setPreviewChromaId(null)}>
              <button type="button" onClick={() => setChromaIdx(null)} onMouseEnter={() => setPreviewChromaId(null)} aria-pressed={chromaIdx === null} title={`${activeSkinName} — base colors`} className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[9px] font-semibold uppercase tracking-wider transition-all ${chromaIdx === null ? "scale-110 bg-[#c8aa6e] text-[#101820] shadow-[0_0_18px_rgba(200,170,110,0.7)]" : "bg-[#172331] text-white/70 ring-1 ring-white/15 hover:ring-[#c8aa6e]"}`}>Base</button>              {chromas.map((chroma, index) => {
 const first = chroma.colors[0] ?? "#777"; const second = chroma.colors[1]; const isSelected = chromaIdx === index; return <button key={chroma.id} type="button" onClick={() => setChromaIdx(index)} onMouseEnter={() => setPreviewChromaId(chroma.id)} onFocus={() => setPreviewChromaId(chroma.id)} aria-pressed={isSelected} aria-label={chroma.name} title={chroma.name} className={`h-9 w-9 shrink-0 rounded-full outline-none ring-1 transition-all duration-200 hover:scale-125 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-[#c8aa6e] ${isSelected ? "scale-125 ring-2 ring-[#c8aa6e] shadow-[0_0_18px_rgba(200,170,110,0.7)]" : "ring-white/20 hover:ring-[#c8aa6e]"}`} style={{ background: second && second.toLowerCase() !== first.toLowerCase() ? `linear-gradient(135deg, ${first} 0 50%, ${second} 50% 100%)` : first }} />; })}
            </div>}
            <button type="button" onClick={() => setChromasOpen((open) => !open)} aria-expanded={chromasOpen} aria-label={chromasOpen ? "Hide chromas" : `Show ${chromaCount} chromas`} className={`group relative grid h-14 w-14 place-items-center rounded-full outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#c8aa6e] ${chromasOpen ? "scale-105" : "hover:scale-110"}`}>
              <span className="absolute inset-0 rounded-full opacity-90 blur-[1px]" style={{ background: `conic-gradient(${chromas.flatMap((chroma) => chroma.colors).filter(Boolean).slice(0, 10).join(", ") || "#c8aa6e, #5ca9d6"})` }} />
              <span className="absolute inset-[3px] rounded-full bg-[#071019]/95 ring-1 ring-[#c8aa6e]/60 transition group-hover:ring-[#f0d9a0]" />
              <Palette className="relative h-5 w-5 text-[#c8aa6e]" />
              <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-[#071019] px-1.5 text-[10px] font-semibold text-[#c8aa6e] ring-1 ring-[#c8aa6e]/50">{chromaCount}</span>
            </button>
          </div>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 items-stretch border-t border-[#c8aa6e]/25 bg-[#071019]/90 px-2 py-2 backdrop-blur-md sm:px-6 sm:py-3">
        <button type="button" onClick={() => stepSkin(-1)} aria-label="Previous skin" className="hidden w-10 shrink-0 place-items-center border border-white/10 bg-black/25 text-[#c8aa6e] transition hover:bg-[#c8aa6e] hover:text-[#101820] sm:grid"><ChevronLeft className="h-4 w-4" /></button>
        <div ref={carouselRef} className="flex min-w-0 flex-1 gap-3 overflow-x-auto px-2 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="listbox" aria-label={`${detail.name} skins`}>
          {skins.map((skin, index) => {
            const selectedSkin = index === skinIdx;
            const label = skin.isBase ? detail.name : skin.name;
            const tier = tierLabel(skin.rarity);
            const count = skin.chromas.length;
            return <button key={skin.id} type="button" onClick={() => setSkinIdx(index)} aria-pressed={selectedSkin} title={label} className={`group gold-frame relative w-36 shrink-0 overflow-hidden border border-[#c8aa6e]/45 bg-[#0d1721] text-left outline-none transition-all duration-200 hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[#c8aa6e] sm:w-44 ${selectedSkin ? "-translate-y-1 border-[#c8aa6e] shadow-[0_0_24px_rgba(200,170,110,0.45)] ring-1 ring-[#c8aa6e]" : ""}`}>
              <div className="relative aspect-[16/9] overflow-hidden"><img src={skin.tilePath || skin.splashPath} alt={label} loading="lazy" className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105" /><div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05080d] via-[#05080d]/20 to-transparent" /></div>
              <div className="space-y-1 p-2"><p className="truncate text-[11px] font-semibold tracking-wide text-white/90 sm:text-xs">{label}</p><div className="flex flex-wrap items-center gap-1">{skin.isBase && <span className="rounded-sm bg-[#172331] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/55">Base</span>}
{tier && <span className="rounded-sm bg-[#c8aa6e]/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#c8aa6e]">{tier}</span>}{count > 0 && <span className="inline-flex items-center gap-1 rounded-sm bg-[#4a89aa]/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#8ecbe8]"><Palette className="h-2.5 w-2.5" />{count}</span>}</div></div>
            </button>;
          })}
        </div>
        <button type="button" onClick={() => stepSkin(1)} aria-label="Next skin" className="hidden w-10 shrink-0 place-items-center border border-white/10 bg-black/25 text-[#c8aa6e] transition hover:bg-[#c8aa6e] hover:text-[#101820] sm:grid"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
