const CDRAGON_BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default";
const CDRAGON_SKINS = `${CDRAGON_BASE}/v1/skins.json`;

export type CdChampion = {
  id: number;
  name: string;
  title: string;
  roles: string[];
  skins: CdChampionSkin[];
};

export type CdChampionSkin = {
  id: number;
  name: string;
  isBase: boolean;
  splashPath: string;
  tilePath: string;
  loadScreenPath: string;
  rarity: string;
  isLegacy: boolean;
  chromas: CdChroma[];
};

export type CdChroma = {
  id: number;
  name: string;
  chromaPath: string;
  tilePath: string;
  colors: string[];
  description: string;
};

export type CdSkin = {
  id: number;
  name: string;
  isBase: boolean;
  splashPath: string;
  uncenteredSplashPath: string | null;
  tilePath: string;
  loadScreenPath: string;
  rarity: string;
  isLegacy: boolean;
  chromaPath: string | null;
  description: string | null;
  chromas: CdChroma[] | null;
};

let skinsCache: Record<string, CdSkin> | null = null;
let skinsPromise: Promise<Record<string, CdSkin>> | null = null;

async function getSkinsJson(): Promise<Record<string, CdSkin>> {
  if (skinsCache) return skinsCache;
  if (skinsPromise) return skinsPromise;
  skinsPromise = fetch(CDRAGON_SKINS)
    .then((r) => {
      if (!r.ok) throw new Error(`cdragon skins ${r.status}`);
      return r.json() as Promise<Record<string, CdSkin>>;
    })
    .then((d) => {
      skinsCache = d;
      return d;
    })
    .finally(() => {
      skinsPromise = null;
    });
  return skinsPromise;
}

export function cdnChromaImg(chromaPath: string): string {
  return `${CDRAGON_BASE}${chromaPath}`;
}

function assetUrl(path: unknown): string | undefined {
  if (typeof path !== "string" || path.trim() === "") return undefined;
  const lower = path.toLowerCase();
  const marker = "/lol-game-data/assets";
  const index = lower.indexOf(marker);
  const relative = index >= 0 ? lower.slice(index + marker.length) : lower;
  return relative.startsWith("/") ? `${CDRAGON_BASE}${relative}` : `${CDRAGON_BASE}/${relative}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeChampionChroma(raw: unknown, championId: number): CdChroma | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "number" ? value.id : Number(value.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    name: stringValue(value.name) || `Chroma ${id}`,
    chromaPath: `${CDRAGON_BASE}/v1/champion-chroma-images/${championId}/${id}.png`,
    tilePath: assetUrl(value.tilePath) ?? "",
    colors: stringList(value.colors).filter((color) => color.startsWith("#")),
    description: stringValue(value.description),
  };
}

function normalizeChampionSkin(raw: unknown, championId: number): CdChampionSkin | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "number" ? value.id : Number(value.id);
  if (!Number.isFinite(id)) return null;
  const centered = assetUrl(value.splashPath);
  const uncentered = assetUrl(value.uncenteredSplashPath);
  const loadScreen = assetUrl(value.loadScreenPath);
  const tile = assetUrl(value.tilePath);
  const splash = uncentered ?? centered ?? loadScreen ?? tile;
  if (!splash) return null;
  const chromas = Array.isArray(value.chromas)
    ? value.chromas
        .map((chroma) => normalizeChampionChroma(chroma, championId))
        .filter((chroma): chroma is CdChroma => chroma !== null)
    : [];
  return {
    id,
    name: stringValue(value.name) || "Unknown skin",
    isBase: value.isBase === true,
    splashPath: splash,
    tilePath: tile ?? splash,
    loadScreenPath: loadScreen ?? splash,
    rarity: stringValue(value.rarity),
    isLegacy: value.isLegacy === true,
    chromas,
  };
}

export async function fetchCdChampion(championId: string): Promise<CdChampion> {
  const response = await fetch(
    `${CDRAGON_BASE}/v1/champions/${encodeURIComponent(championId)}.json`,
  );
  if (!response.ok) throw new Error(`cdragon champion ${championId} ${response.status}`);
  const raw = (await response.json()) as Record<string, unknown>;
  const id = typeof raw.id === "number" ? raw.id : Number(championId);
  const skins = Array.isArray(raw.skins)
    ? raw.skins
        .map((skin) => normalizeChampionSkin(skin, id))
        .filter((skin): skin is CdChampionSkin => skin !== null)
    : [];
  return {
    id,
    name: stringValue(raw.name) || "Unknown champion",
    title: stringValue(raw.title) || stringValue(raw.description),
    roles: stringList(raw.roles),
    skins: skins.sort((a, b) => Number(b.isBase) - Number(a.isBase) || a.id - b.id),
  };
}

export function cdragonAsset(path: string): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default${path}`;
}

export async function fetchCdSkin(champName: string, ddSkinName: string): Promise<CdSkin | null> {
  const skins = await getSkinsJson();
  const targetName = ddSkinName === "default" ? champName : ddSkinName;
  const candidates = Object.values(skins).filter((s) => s.name === targetName);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;
  const folderHint = champName.replace(/[^a-zA-Z]/g, "").toLowerCase();
  const byFolder = candidates.find((c) => c.splashPath.toLowerCase().includes(folderHint));
  return byFolder ?? candidates[0] ?? null;
}

export async function fetchChromasForSkin(
  champName: string,
  ddSkinName: string,
): Promise<CdChroma[]> {
  const skin = await fetchCdSkin(champName, ddSkinName);
  return skin?.chromas ?? [];
}

/** Batch lookup for the whole roster of a champion — used by carousel for rarity/chroma badges. */
export async function fetchCdSkinMapForChampion(champName: string): Promise<Map<string, CdSkin>> {
  const skins = await getSkinsJson();
  const folderHint = champName.replace(/[^a-zA-Z]/g, "").toLowerCase();
  const map = new Map<string, CdSkin>();
  for (const s of Object.values(skins)) {
    if (!s.splashPath.toLowerCase().includes(folderHint)) continue;
    if (!map.has(s.name)) map.set(s.name, s);
  }
  // ensure base skin uses champion name key (DDragon calls it "default")
  const base = [...map.values()].find((s) => s.isBase);
  if (base) map.set("default", base);
  return map;
}

export function tierLabel(rarity: string | undefined): string | null {
  if (!rarity || rarity === "kNoRarity") return null;
  const m: Record<string, string> = {
    kRare: "RARE",
    kEpic: "EPIC",
    kLegendary: "LEGENDARY",
    kMythic: "MYTHIC",
    kUltimate: "ULTIMATE",
    kExalted: "EXALTED",
    kTranscendent: "TRANSCENDENT",
  };
  return m[rarity] ?? rarity.replace(/^k/, "").toUpperCase();
}

// ---- palette helpers ----

function hashString(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return h >>> 0;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  const r = parseInt(m[1]!, 16) / 255;
  const g = parseInt(m[2]!, 16) / 255;
  const b = parseInt(m[3]!, 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

const raritySat: Record<string, number> = {
  kNoRarity: 42,
  kRare: 58,
  kEpic: 66,
  kLegendary: 78,
  kMythic: 82,
  kUltimate: 86,
  kExalted: 80,
  kTranscendent: 88,
};

export type SkinPalette = {
  primary: string;
  secondary: string;
  bg: string;
  bg2: string;
  glow: string;
  soft: string;
  accent: string;
};

function hsl(h: number, s: number, l: number): string {
  return `hsl(${((h % 360) + 360) % 360} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}%)`;
}
function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${((h % 360) + 360) % 360} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}% / ${a})`;
}

function paletteFromHsl(h: number, s: number, l: number): SkinPalette {
  const s1 = Math.max(48, s);
  const l1 = Math.max(46, Math.min(64, l));
  const bg = hsl(h, Math.max(18, s1 - 30), 9);
  const bg2 = hsl((h + 10) % 360, Math.max(14, s1 - 34), 14);
  const primary = hsl(h, s1, l1);
  const secondary = hsl((h + 16) % 360, Math.max(42, s1 - 8), Math.max(34, l1 - 12));
  const glow = hsla(h, s1, l1, 0.22);
  const soft = hsla(h, s1, l1, 0.14);
  return { primary, secondary, bg, bg2, glow, soft, accent: primary };
}

export function skinPalette(
  cdSkin: { name: string; rarity: string } | null,
  chroma: CdChroma | null,
  fallbackName: string,
): SkinPalette {
  if (chroma?.colors?.[0]) {
    const parsed = hexToHsl(chroma.colors[0]);
    if (parsed) return paletteFromHsl(parsed.h, Math.max(58, parsed.s), parsed.l);
  }
  const baseName = cdSkin?.name ?? fallbackName;
  const rarity = cdSkin?.rarity;
  const hash = hashString(`${baseName}::${rarity ?? "kNoRarity"}`);
  const h = hash % 360;
  const sBase = rarity && raritySat[rarity] != null ? raritySat[rarity]! : 58;
  const s = Math.max(44, Math.min(88, sBase + ((hash >> 8) % 16) - 8));
  const l = 56 + ((hash >> 16) % 10) - 5;
  return paletteFromHsl(h, s, l);
}
