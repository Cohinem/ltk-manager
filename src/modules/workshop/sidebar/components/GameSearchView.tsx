import { useRef } from "react";

import { Count, EmptyState, SearchField, Spinner } from "@/components";
import { m } from "@/i18n";
import { DocumentToolbar } from "@/modules/editor";

import {
  CollapseFindAction,
  GameFindResults,
  MatchCount,
  useGameFind,
  useGameSearchRevealTarget,
} from "../../gameBrowser";
import { focusRows } from "../../shared/utils/focusRows";
import {
  useGameSearchPattern,
  useGameSearchRegex,
  useSetGameSearchPattern,
  useSetGameSearchRegex,
} from "../../state";

/** Every file of the install the pattern matches, folded back under its directories. */
export function GameSearchView() {
  const pattern = useGameSearchPattern();
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <DocumentToolbar active>
        <GameSearchBox onCommit={() => focusRows(bodyRef.current)} />
        <CollapseFindAction />
      </DocumentToolbar>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        {pattern.length === 0 && <EmptyState size="sm" title={m.workshop_game_search_label()} />}
        {pattern.length > 0 && <GameFindResults />}
      </div>
    </>
  );
}

function GameSearchBox({ onCommit }: { onCommit: () => void }) {
  const pattern = useGameSearchPattern();
  const regex = useGameSearchRegex();
  const setPattern = useSetGameSearchPattern();
  const setRegex = useSetGameSearchRegex();
  const boxRef = useRef<HTMLInputElement>(null);

  const { data, error, isFetching } = useGameFind(pattern, regex);
  const counted = pattern.length > 0 && data && data.total > 0 && !error;

  useGameSearchRevealTarget(boxRef);

  return (
    <SearchField
      value={pattern}
      onChange={setPattern}
      regex={regex}
      onRegexChange={setRegex}
      label={m.workshop_game_search_label()}
      regexLabel={m.workshop_game_search_regex_label()}
      regexToggleLabel={m.workshop_game_search_regex_action()}
      clearLabel={m.workshop_game_search_clear_action()}
      onCommit={onCommit}
      inputRef={boxRef}
    >
      {counted && (
        <Count>
          <MatchCount result={data} />
        </Count>
      )}
      {isFetching && <Spinner size={12} className="shrink-0" />}
    </SearchField>
  );
}
