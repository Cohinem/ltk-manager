import { ArchiveIcon } from "@phosphor-icons/react";

import { LayerIcon } from "@/components";
import { m } from "@/i18n";

import { layerTitle } from "../../../documents/utils/contentDocument";
import { fileKindFromPath } from "../../../gameBrowser/utils/fileKind";
import { useOptionalProjectContext } from "../../../projects/state/ProjectContext";
import { describeFileKind } from "../../../shared/utils/fileKindIcon";
import { CutText } from "../../shared/components/CutText";
import {
  type SuggestList,
  type SuggestQuery,
  SuggestInput,
} from "../../shared/components/SuggestInput";
import { splitPath } from "../../shared/utils/textCut";
import { usePathSuggestions } from "../hooks/usePathSuggestions";
import type { PathField } from "../utils/pathField";
import type { PathGroupId, PathSuggestion } from "../utils/pathSuggestions";

interface PathInputProps {
  /** The field's value: the path, or the hex of a chunk no table names. */
  value: string;
  field: PathField;
  placeholder?: string;
  "aria-label"?: string;
  /** The last text the field committed was refused. */
  invalid: boolean;
  /** Focus the field and select its text on mount. */
  autoFocus: boolean;
  onCommit: (text: string) => void;
  /** The field was left, after any commit. */
  onLeave?: () => void;
  /** The field was left by a bare `Enter`, after the commit and `onLeave`. */
  onEnter?: () => void;
}

/** What a path field's suggestions read beside the draft. */
interface PathSource {
  readonly field: PathField;
  readonly value: string;
}

/**
 * An edit field for a path value, with project and game files suggested below it.
 *
 * "A path field" in docs/ux/BIN_EDITOR.md. `Enter` picks the top suggestion while the draft is
 * search terms, and none while the draft contains `/`, so a typed path is written as typed.
 */
export function PathInput({ value, field, ...props }: PathInputProps) {
  return (
    <SuggestInput<PathSuggestion, PathSource>
      {...props}
      value={value}
      source={{ field, value }}
      useSuggestions={usePathList}
      enterPicks={(query) => field.enterPicks && !query.includes("/")}
      itemText={(suggestion) => suggestion.path}
      itemKey={(suggestion) => `${suggestion.source.kind}:${suggestion.path}`}
      groupLabel={groupLabel}
      renderItem={(suggestion) => <SuggestionRow suggestion={suggestion} />}
      moreHint={(count) => m.workshop_bin_path_more_hint({ count })}
      searchingLabel={m.workshop_bin_path_searching_label()}
      name="PathInput"
    />
  );
}

function usePathList(draft: SuggestQuery, source: PathSource): SuggestList<PathSuggestion> {
  return usePathSuggestions({ ...source, ...draft });
}

function groupLabel(group: string): string {
  switch (group as PathGroupId) {
    case "project":
      return m.workshop_bin_path_project_label();
    case "folder":
      return m.workshop_bin_path_folder_label();
    case "game":
      return m.workshop_bin_path_game_label();
  }
}

/** One suggestion row: kind icon, file name, dimmed folder, and the layer or archive. */
function SuggestionRow({ suggestion }: { suggestion: PathSuggestion }) {
  const project = useOptionalProjectContext();
  const { folder, file } = splitPath(suggestion.path);
  const kind = describeFileKind(fileKindFromPath(suggestion.path));
  const KindIcon = kind.icon;
  const { source } = suggestion;

  let side = source.kind === "game" ? archiveName(source.wad) : source.layer;
  if (source.kind === "layer" && project !== null) side = layerTitle(project, source.layer);

  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <span className="flex shrink-0" style={{ color: `var(${kind.tintToken})` }}>
        <KindIcon className="size-3.5" strokeWidth={1.75} />
      </span>
      <span className="shrink-0 font-medium text-surface-100">{file}</span>
      <CutText text={folder} className="text-surface-400" />
      {suggestion.current && (
        <span className="shrink-0 text-meta text-accent-400">
          {m.workshop_bin_path_current_label()}
        </span>
      )}
      <span className="flex max-w-40 shrink-0 items-center gap-1 text-meta text-surface-400">
        {/* DS-KIND-HUE */}
        {source.kind === "layer" && <LayerIcon className="size-3 shrink-0 text-doc-layer-text" />}
        {source.kind === "game" && <ArchiveIcon className="size-3 shrink-0" />}
        <span className="min-w-0 truncate">{side}</span>
      </span>
    </span>
  );
}

/** An archive's file name without the folder and the `.wad.client` suffix. */
function archiveName(wad: string): string {
  return wad.slice(wad.lastIndexOf("/") + 1).replace(/\.wad\.client$/i, "");
}
