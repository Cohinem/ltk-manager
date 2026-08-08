const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";

export type DdChampionSummary = {
  id: string;
  key: string;
  name: string;
  title: string;
  blurb: string;
  tags: string[];
  image: { full: string; sprite: string; group: string };
  info: { attack: number; defense: number; magic: number; difficulty: number };
};

export type DdSkin = {
  id: string;
  num: number;
  name: string;
  chromas: boolean;
};

export type DdChampionDetail = DdChampionSummary & {
  lore: string;
  skins: DdSkin[];
  allytips: string[];
  enemytips: string[];
  partype: string;
};

export function championSquareImg(version: string, champId: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/champion/${champId}.png`;
}

export function championSplashImg(champId: string, skinNum: number): string {
  return `${DDRAGON_BASE}/cdn/img/champion/splash/${champId}_${skinNum}.jpg`;
}

export function championLoadingImg(champId: string, skinNum: number): string {
  return `${DDRAGON_BASE}/cdn/img/champion/loading/${champId}_${skinNum}.jpg`;
}

export function championCenteredImg(champId: string, skinNum: number): string {
  return `${DDRAGON_BASE}/cdn/img/champion/centered/${champId}_${skinNum}.jpg`;
}

let versionCache: string | null = null;
let versionPromise: Promise<string> | null = null;

export async function fetchLatestVersion(): Promise<string> {
  if (versionCache) return versionCache;
  if (versionPromise) return versionPromise;
  versionPromise = fetch(`${DDRAGON_BASE}/api/versions.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`versions ${r.status}`);
      return r.json() as Promise<string[]>;
    })
    .then((arr) => {
      const v = arr[0];
      if (!v) throw new Error("no versions");
      versionCache = v;
      return v;
    })
    .finally(() => {
      versionPromise = null;
    });
  return versionPromise;
}

export async function fetchChampionList(version: string): Promise<Record<string, DdChampionSummary>> {
  const res = await fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`);
  if (!res.ok) throw new Error(`champion list ${res.status}`);
  const json = (await res.json()) as { data: Record<string, DdChampionSummary> };
  return json.data;
}

function stripChromaVariants(skins: DdSkin[]): DdSkin[] {
  const baseNames = new Set(skins.filter((s) => s.chromas).map((s) => s.name));
  return skins.filter((s) => {
    if (s.chromas) return true;
    const paren = s.name.indexOf(" (");
    if (paren === -1) return true;
    const prefix = s.name.slice(0, paren);
    return !baseNames.has(prefix);
  });
}

export async function fetchChampionDetail(version: string, champId: string): Promise<DdChampionDetail> {
  const res = await fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion/${champId}.json`);
  if (!res.ok) throw new Error(`champion ${champId} ${res.status}`);
  const json = (await res.json()) as { data: Record<string, DdChampionDetail> };
  const detail = json.data[champId];
  if (!detail) throw new Error(`no data for ${champId}`);
  return { ...detail, skins: stripChromaVariants(detail.skins) };
}
