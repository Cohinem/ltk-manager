import { useCallback, useMemo } from "react";

import { barPlaceholder } from "./barMode";
import { buildCommandCandidate } from "./candidate";
import { useOpenProject, useProjectRows } from "./projectRows";
import { type PaletteBranchProps, ResultsPalette } from "./ResultsPalette";
import { parseQuery, WORKSHOP_SOURCES } from "./sources";
import type { PaletteRowData } from "./types";
import { useGlobalCommands } from "./useGlobalCommands";
import { usePaletteSearch } from "./usePaletteSearch";

/**
 * The bar's palette with no project open, which is what a prefix reaches.
 *
 * The grid behind the bar answers a plain query as it is typed, so this is the
 * scoped half: the projects a prefix or `Tab` narrows to, and the actions that
 * need no project.
 */
export function WorkshopPalette(props: PaletteBranchProps) {
  const { query, scope, onClose } = props;

  const parsed = useMemo(() => parseQuery(query, scope), [query, scope]);

  const projects = useProjectRows();
  const commands = useGlobalCommands();
  const candidates = useMemo(
    () => ({ projects, commands: commands.map(buildCommandCandidate) }),
    [commands, projects],
  );

  const groups = usePaletteSearch({ parsed, sources: WORKSHOP_SOURCES, candidates });
  const openProject = useOpenProject();

  const run = useCallback(
    ({ target }: PaletteRowData) => {
      if (target.kind === "prefix") return;

      onClose();
      if (target.kind === "command") target.command.run();
      else if (target.kind === "project") openProject(target.name);
    },
    [onClose, openProject],
  );

  return (
    <ResultsPalette
      {...props}
      parsed={parsed}
      groups={groups}
      placeholder={barPlaceholder("palette", false, scope)}
      run={run}
    />
  );
}
