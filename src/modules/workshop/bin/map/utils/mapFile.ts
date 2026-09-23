import type { MapPath } from "@/lib/tauri";

/** The prefix a map's files sit under, which mirrors `MapPath` in core. */
const DATA_DIR = "data/";

/** The suffixes of a map's two files, which mirror `MapPath::geometry` and `::materials`. */
const MAP_SUFFIXES = [".mapgeo", ".materials.bin"] as const;

/**
 * The map a `.mapgeo` or a `.materials.bin` at `path` belongs to, and null for any other file.
 *
 * Both of a map's files are its entry path lowercased under `data/`, so the path gives the
 * map back. Whatever leads the last `data/` is where the file sits, an archive or a layer.
 */
export function mapPathOfFile(path: string | undefined): MapPath | null {
  if (path === undefined) return null;
  const spelled = path.replaceAll("\\", "/").toLowerCase();
  const suffix = MAP_SUFFIXES.find((each) => spelled.endsWith(each));
  if (suffix === undefined) return null;

  /* The last one, because an archive of the install sits under a `DATA/` of its own. */
  const nested = spelled.lastIndexOf(`/${DATA_DIR}`);
  if (nested < 0 && !spelled.startsWith(DATA_DIR)) return null;
  const rooted = nested + 1;
  const map = spelled.slice(rooted + DATA_DIR.length, -suffix.length);
  return map.length === 0 ? null : map;
}
