import { useQuery } from "@tanstack/react-query";
import { use, useMemo } from "react";

import { m } from "@/i18n";

import { audioQueries } from "../../../audio/api/queries";
import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { LinkAssetContext } from "../../links/hooks/useLinkTargets";
import {
  type SuggestList,
  type SuggestQuery,
  SuggestInput,
} from "../../shared/components/SuggestInput";
import { type EventSuggestion, eventGroups, unitOfGroup } from "../utils/eventSuggestions";

interface EventInputProps {
  /** The field's value: an event name, or empty. */
  value: string;
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

/**
 * An edit field for an event name, with the events of the bin's character skin suggested below
 * it, and the game's events while a search is typed.
 *
 * "A sound field" in docs/ux/BIN_EDITOR.md. `Enter` picks the top suggestion while the draft is
 * search terms.
 */
export function EventInput({ value, ...props }: EventInputProps) {
  return (
    <SuggestInput<EventSuggestion, string>
      {...props}
      value={value}
      source={value}
      useSuggestions={useEventList}
      enterPicks={() => true}
      itemText={(suggestion) => suggestion.name}
      itemKey={(suggestion) => suggestion.name}
      groupLabel={(group) => unitOfGroup(group) ?? m.workshop_bin_event_game_label()}
      renderItem={(suggestion) => <EventRow suggestion={suggestion} />}
      moreHint={(count) => m.workshop_bin_path_more_hint({ count })}
      searchingLabel={m.workshop_bin_path_searching_label()}
      name="EventInput"
    />
  );
}

const NO_NAMES: readonly string[] = [];

/** Reads the scoped bank units of the field's bin while the list is open, and the game's events
 * that the query matches. */
function useEventList(draft: SuggestQuery, value: string): SuggestList<EventSuggestion> {
  const sandbox = useSandbox();
  const asset = use(LinkAssetContext);
  const scoped = useQuery({ ...audioQueries.scopedEvents(sandbox, asset), enabled: draft.open });
  const search = useQuery({
    ...audioQueries.searchEvents(draft.query ?? ""),
    enabled: draft.open && draft.query !== null,
  });

  const game = draft.query === null ? NO_NAMES : (search.data?.names ?? NO_NAMES);
  const groups = useMemo(
    () => (draft.open ? eventGroups(scoped.data ?? [], game, draft.query, value) : []),
    [draft.open, draft.query, scoped.data, game, value],
  );
  const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
  const more =
    draft.query !== null && search.data !== undefined
      ? Math.max(0, search.data.total - search.data.names.length)
      : 0;

  return {
    groups,
    more: shown === 0 ? 0 : more,
    searching: (draft.open && scoped.isLoading) || (draft.query !== null && search.isFetching),
  };
}

/** One suggestion row: the event name, and a mark on the field's current value. */
function EventRow({ suggestion }: { suggestion: EventSuggestion }) {
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <span className="min-w-0 truncate text-surface-100">{suggestion.name}</span>
      {suggestion.current && (
        <span className="shrink-0 text-meta text-accent-400">
          {m.workshop_bin_path_current_label()}
        </span>
      )}
    </span>
  );
}
