import type { GraphClip } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";

/** A written animation name followed through unambiguous graph wrappers. */
export function spellAnimation(name: string | null, clips: readonly GraphClip[]): GraphClip | null {
  if (typeof name !== "string" || name.trim() === "") return null;
  const hash = nameHash(name);
  let clip = clips.find(
    (clip) => clip.hash === hash || clip.name.toLowerCase() === name.toLowerCase(),
  );
  const visited = new Set<string>();
  while (clip !== undefined && !visited.has(clip.hash)) {
    if (clip.animation?.asset != null) return clip;
    visited.add(clip.hash);
    if (clip.children.length !== 1) return null;
    const child = clip.children[0].hash;
    clip = clips.find((entry) => entry.hash === child);
  }
  return null;
}
