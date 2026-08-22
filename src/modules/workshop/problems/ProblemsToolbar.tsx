import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useRef } from "react";

import { FieldControl, FieldRoot, IconButton } from "@/components";

interface ProblemsToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Problems the filter leaves on screen, against `total` for the count. */
  shown: number;
  total: number;
}

/** The document's toolbar row: the filter, and how much of the run it leaves. */
export function ProblemsToolbar({ query, onQueryChange, shown, total }: ProblemsToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <FieldRoot className="relative min-w-0 flex-1">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
        <FieldControl
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query.length > 0) {
              event.preventDefault();
              onQueryChange("");
            }
          }}
          placeholder="Filter problems"
          aria-label="Filter problems"
          autoComplete="off"
          spellCheck={false}
          className="h-6 pr-7 pl-7 text-row select-text"
        />
        {query && (
          <IconButton
            icon={<XIcon weight="bold" className="h-3 w-3" />}
            variant="transparent"
            size="xs"
            compact
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear the filter"
            className="absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2"
          />
        )}
      </FieldRoot>

      {query.trim().length > 0 && (
        <span className="shrink-0 text-meta text-surface-400 tabular-nums select-none">
          {shown} of {total}
        </span>
      )}
    </>
  );
}
