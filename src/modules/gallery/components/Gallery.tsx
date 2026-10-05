import { useState } from "react";

import {
  EmptyState,
  PageInset,
  ReadingColumn,
  SearchField,
  Stack,
  Toolbar,
  ToolbarRow,
} from "@/components";

import { APP_CONDITIONS, type Conditions, type Ground, useRootConditions } from "../conditions";
import { ENTRIES, FAMILIES } from "../entries";
import { ConditionBar } from "./ConditionBar";
import { EntryCard } from "./EntryCard";

/**
 * Every shared component in every state, for checking a change against the conditions it has
 * to pass.
 *
 * A component is listed by a `<Component>.gallery.tsx` beside it in `src/components`. The page
 * exists in development builds only.
 */
export function Gallery() {
  const [conditions, setConditions] = useState<Conditions>(APP_CONDITIONS);
  const [ground, setGround] = useState<Ground>("900");
  const [query, setQuery] = useState("");
  useRootConditions(conditions);

  const needle = query.trim().toLowerCase();
  const shown = ENTRIES.filter((entry) => entry.name.toLowerCase().includes(needle));

  return (
    <div data-ui="Gallery" className="flex h-full flex-col select-none">
      <Toolbar>
        <ToolbarRow>
          <div className="flex w-64">
            <SearchField
              value={query}
              onChange={setQuery}
              label="Find a component"
              clearLabel="Clear"
            />
          </div>
          <ConditionBar
            conditions={conditions}
            onConditionsChange={setConditions}
            ground={ground}
            onGroundChange={setGround}
          />
        </ToolbarRow>
      </Toolbar>

      <PageInset>
        <div data-ui="Gallery:content" className="flex-1 overflow-auto">
          <ReadingColumn width="wide" gap={8}>
            {FAMILIES.map((family) => {
              const entries = shown.filter((entry) => entry.family === family.id);
              if (entries.length === 0) return null;

              return (
                <Stack key={family.id} as="section" gap={4} data-ui={`Gallery:${family.id}`}>
                  <h2 className="text-lg font-semibold text-surface-100">{family.label}</h2>
                  {entries.map((entry) => (
                    <EntryCard key={entry.name} entry={entry} ground={ground} />
                  ))}
                </Stack>
              );
            })}

            {shown.length === 0 && <EmptyState size="sm" title="No component matches" />}
          </ReadingColumn>
        </div>
      </PageInset>
    </div>
  );
}
