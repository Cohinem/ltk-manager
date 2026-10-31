import { useQuery } from "@tanstack/react-query";
import { use, useMemo } from "react";

import { Menu } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, GraphClip } from "@/lib/tauri";

import { skinQueries } from "../api/skinQueries";
import { useSkinGraphSource } from "../hooks/useGraphSource";
import { SkinChoiceContext } from "../state/skinChoice";
import { BIND_POSE, chosenClipHash, playableClips } from "../utils/skinScene";

const NO_CLIPS: readonly GraphClip[] = [];

interface SkinClipItemsProps {
  readonly document: BinDocumentId;
  readonly entry: string;
}

/** The clip picks of the Animation menu: the bind pose and every clip that reaches a file. */
export function SkinClipItems({ document, entry }: SkinClipItemsProps) {
  const choice = use(SkinChoiceContext);
  const { source } = useSkinGraphSource(document, entry);
  const graph = useQuery(skinQueries.graph(source.document, source.graph));
  const listed = useMemo(
    () => (graph.data === undefined ? NO_CLIPS : playableClips(graph.data.clips)),
    [graph.data],
  );

  return (
    <Menu.RadioGroup
      value={chosenClipHash(listed, choice?.picked ?? null)}
      onValueChange={(clip: string) => choice?.setPicked(clip)}
    >
      <Menu.RadioItem value={BIND_POSE}>{m.workshop_bin_mesh_preview_bind_label()}</Menu.RadioItem>
      {listed.map((clip) => (
        <Menu.RadioItem key={clip.hash} value={clip.hash}>
          {clip.name}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}
