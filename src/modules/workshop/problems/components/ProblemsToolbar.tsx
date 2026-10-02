import type { RefObject } from "react";

import { Count, SearchField } from "@/components";

interface ProblemsToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Problems the filter leaves on screen, against `total` for the count. */
  shown: number;
  total: number;
  /** The box a find reaches, which the document owns because the key is its own. */
  boxRef: RefObject<HTMLInputElement | null>;
}

/** The document's toolbar row: the filter, and how much of the run it leaves. */
export function ProblemsToolbar({
  query,
  onQueryChange,
  shown,
  total,
  boxRef,
}: ProblemsToolbarProps) {
  return (
    <>
      <SearchField
        value={query}
        onChange={onQueryChange}
        label="Filter problems"
        clearLabel="Clear the filter"
        inputRef={boxRef}
        textClassName="text-row"
      />

      {query.trim().length > 0 && (
        <Count>
          {shown} of {total}
        </Count>
      )}
    </>
  );
}
