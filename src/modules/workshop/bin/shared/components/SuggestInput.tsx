import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";

import { Combobox, FieldDiscardContext, InputDefaultContext, OVERLINE } from "@/components";
import { twMerge } from "@/utils";

/** Why the field loses focus, when the blur must not commit the draft. */
type Leaving = "discard" | "picked" | null;

/** One labelled group of suggestions, in the shape the grouped combobox expects. */
export interface SuggestGroup<T> {
  readonly value: string;
  readonly items: readonly T[];
}

/** What a suggest field's list shows for its draft. */
export interface SuggestList<T> {
  readonly groups: readonly SuggestGroup<T>[];
  /** The matches past the listed ones, which the list counts under it. */
  readonly more: number;
  /** A search for the current query has not returned yet. */
  readonly searching: boolean;
}

/** What a suggest field reads for one draft. */
export interface SuggestQuery {
  /** The typed search, or null while the draft is untouched or cleared. */
  readonly query: string | null;
  /** The list is open. A source searches only while it is open. */
  readonly open: boolean;
}

export interface SuggestInputProps<T, S> {
  /** The field's value. */
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
  /** What `useSuggestions` reads the suggestions of, beside the draft. */
  source: S;
  /** Reads the suggestions of the draft. A hook, called on every render. */
  useSuggestions: (draft: SuggestQuery, source: S) => SuggestList<T>;
  /** `true` if `Enter` on the search `query` picks the top suggestion rather than the text. */
  enterPicks: (query: string) => boolean;
  /** The text the field writes for `item`. */
  itemText: (item: T) => string;
  /** A key of `item` that is unique in its group. */
  itemKey: (item: T) => string;
  groupLabel: (group: string) => string;
  /** Draws one suggestion row. */
  renderItem: (item: T) => ReactNode;
  /** The line under the list that counts `more`. */
  moreHint: (count: number) => string;
  /** The line of a list that waits for its search. */
  searchingLabel: string;
  /** The `data-ui` name of the field, and of its list with `:list` after it. */
  name: string;
}

/**
 * An edit field with grouped suggestions under it, committed like a `Readout` draft.
 *
 * The draft is committed on blur or on `Enter`, and `Escape` discards it. A picked suggestion is
 * committed at once. `Enter` picks the highlighted suggestion, the top one while `enterPicks`
 * holds for the draft, and waits for a pending search before it does.
 */
export function SuggestInput<T, S>({
  value,
  placeholder,
  "aria-label": ariaLabel,
  invalid,
  autoFocus,
  onCommit,
  onLeave,
  onEnter,
  source,
  useSuggestions,
  enterPicks,
  itemText,
  itemKey,
  groupLabel,
  renderItem,
  moreHint,
  searchingLabel,
  name,
}: SuggestInputProps<T, S>) {
  const implicit = use(InputDefaultContext);
  const discard = use(FieldDiscardContext);
  const [draft, setDraft] = useState<{ text: string; over: string } | null>(null);
  if (draft !== null && draft.over !== value) {
    setDraft(null);
  }

  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const highlighted = useRef<T | undefined>(undefined);
  const leaving = useRef<Leaving>(null);
  /* An `Enter` on search terms before any suggestion answered picks the top one once they do. */
  const pickWhenAnswered = useRef(false);

  const shown = draft?.text ?? (implicit ? "" : value);
  const query = draft === null || draft.text.trim() === "" ? null : draft.text;
  const { groups, more, searching } = useSuggestions({ query, open }, source);
  const autoHighlight = query !== null && enterPicks(query);
  const listed = open && (groups.length > 0 || searching);

  /* A committed draft stays until the value changes under it, so a refused value keeps its text. */
  function leave() {
    const reason = leaving.current;
    leaving.current = null;
    pickWhenAnswered.current = false;
    setOpen(false);

    const committed = reason === null && draft !== null && (draft.text !== value || implicit);
    if (committed) {
      onCommit(draft.text);
    } else {
      setDraft(null);
    }
    if (reason === "discard") discard?.();

    onLeave?.();
  }

  function pick(item: T | null, byKey: boolean) {
    if (item === null) return;

    leaving.current = "picked";
    const text = itemText(item);
    if (text !== value || implicit) onCommit(text);
    input.current?.blur();

    if (byKey) onEnter?.();
  }

  useEffect(() => {
    if (!pickWhenAnswered.current || searching) return;
    pickWhenAnswered.current = false;

    const top = groups[0]?.items[0];
    if (top !== undefined) {
      pick(top, true);
      return;
    }
    input.current?.blur();
    onEnter?.();
  });

  function keys(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      /* The combobox selects the highlighted suggestion, and `pick` then blurs the field. */
      if (listed && isListed(groups, highlighted.current)) return;

      event.preventDefault();
      if (autoHighlight && searching && !event.ctrlKey && !event.metaKey) {
        pickWhenAnswered.current = true;
        return;
      }
      event.currentTarget.blur();
      if (!event.ctrlKey && !event.metaKey) onEnter?.();
    }

    if (event.key === "Escape") {
      leaving.current = "discard";
      event.currentTarget.blur();
    }
  }

  return (
    <Combobox.Root<T>
      items={groups}
      value={null}
      inputValue={shown}
      onInputValueChange={(next, details) => {
        if (details.reason !== "input-change") return;
        setDraft({ text: next, over: value });
        setOpen(true);
      }}
      onValueChange={(item, details) => pick(item, details.event instanceof KeyboardEvent)}
      onItemHighlighted={(item) => {
        highlighted.current = item;
      }}
      open={listed}
      onOpenChange={setOpen}
      filter={() => true}
      autoHighlight={autoHighlight}
      itemToStringLabel={itemText}
      itemToStringValue={itemText}
    >
      <Combobox.Input
        ref={input}
        placeholder={implicit ? (placeholder ?? value) : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        autoComplete="off"
        autoFocus={autoFocus}
        data-ui={name}
        data-draft={(draft !== null && (draft.text !== value || implicit)) || undefined}
        data-value-field
        className={twMerge(
          "h-[var(--readout-height,auto)] w-auto min-w-0 flex-1 rounded-sm bg-surface-veil-soft px-[var(--readout-padding-x,0.375rem)] py-0.5",
          "font-mono text-[length:inherit] text-surface-200 tabular-nums select-text focus:ring-0 focus:outline-none",
          /* DS-VEIL, DS-HOVER, DS-RADIUS */
          "border-surface-veil hover:border-accent-hover focus:border-accent-500",
          invalid && "border-danger",
          implicit &&
            draft === null &&
            "border-dashed bg-transparent placeholder:text-surface-400 focus:border-solid",
        )}
        onFocus={(event) => {
          if (autoFocus) event.currentTarget.select();
          setOpen(true);
        }}
        onClick={stopRowClick}
        onKeyDown={keys}
        onBlur={leave}
      />
      <Combobox.Content
        side="bottom"
        align="start"
        sideOffset={2}
        data-ui={`${name}:list`}
        className="max-h-80 w-[max(var(--anchor-width),32rem)] max-w-[40rem]"
        onMouseDown={keepFocus}
      >
        <Combobox.List>
          {(group: SuggestGroup<T>) => (
            <Combobox.Group key={group.value} items={group.items}>
              <Combobox.GroupLabel className={twMerge(OVERLINE, "px-2 pt-1.5 pb-0.5 select-none")}>
                {groupLabel(group.value)}
              </Combobox.GroupLabel>
              <Combobox.Collection>
                {(item: T) => (
                  <Combobox.Item
                    key={itemKey(item)}
                    value={item}
                    className="font-mono text-mono-row"
                  >
                    {renderItem(item)}
                  </Combobox.Item>
                )}
              </Combobox.Collection>
            </Combobox.Group>
          )}
        </Combobox.List>
        {more > 0 && (
          <div className="px-2 py-1 text-meta text-surface-400 select-none">{moreHint(more)}</div>
        )}
        {searching && groups.length === 0 && (
          <div className="px-2 py-1 text-meta text-surface-400 select-none">{searchingLabel}</div>
        )}
      </Combobox.Content>
    </Combobox.Root>
  );
}

/** Whether `item` is in the current groups. A stale highlight can point to a removed row. */
function isListed<T>(groups: readonly SuggestGroup<T>[], item: T | undefined): boolean {
  return item !== undefined && groups.some((group) => group.items.includes(item));
}

/* Stop the click here, so the row's click handler does not run. */
function stopRowClick(event: ReactMouseEvent<HTMLInputElement>) {
  event.stopPropagation();
}

/* A press on the list's scrollbar or a group label would blur the field and commit the search
   terms as the value. */
function keepFocus(event: ReactMouseEvent<HTMLDivElement>) {
  event.preventDefault();
}
