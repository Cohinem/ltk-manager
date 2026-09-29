import { Fragment } from "react";

import { Code, ExternalLink, HoverCard, Spinner } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AppError, ClassRef, ClassSchema } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useClassDocs } from "../hooks/useClassDocs";
import { useClassObjectCount } from "../hooks/useClassObjectCount";
import { useClassSchema } from "../hooks/useClassSchema";
import { classPageUrl } from "../utils/metaWiki";
import { DocProse } from "./DocProse";

interface ClassCardProps {
  /** `0x` and eight hex digits. */
  classHash: string;
  /** The class as the tables name it. Null where no table does. */
  name: string | null;
}

/** The text size of the class and field cards, a step above a hover card's own. */
export const CARD_TEXT = "text-row";

/**
 * A class name, and what the schema says about it while the pointer is on it.
 *
 * "The class card" in docs/ux/BIN_EDITOR.md. The body mounts when the card opens, which
 * is when its queries run.
 */
export function ClassCard({ classHash, name }: ClassCardProps) {
  const label = name ?? classHash;

  return (
    <HoverCard
      label={label}
      className={twMerge("w-max max-w-md min-w-80", CARD_TEXT)}
      content={<ClassCardBody classHash={classHash} name={name} />}
    >
      <span
        className={twMerge(
          /* DS-KIND-HUE, DS-TEXT */
          "min-w-0 truncate text-bin-class-text decoration-dotted underline-offset-2 hover:underline",
          name === null && "font-mono text-code",
        )}
      >
        {label}
      </span>
    </HoverCard>
  );
}

/** A class the schema names, as its own card. */
export function ClassRefCard({ reference }: { reference: ClassRef }) {
  return <ClassCard classHash={reference.hash} name={reference.name} />;
}

/** The class at `classHash`, named by the schema, as its own card. */
export function SchemaClassCard({ classHash }: { classHash: string }) {
  const { data } = useClassSchema(classHash);
  return <ClassCard classHash={classHash} name={data?.name ?? null} />;
}

function ClassCardBody({ classHash, name }: ClassCardProps) {
  const { data, error, isPending } = useClassSchema(classHash);

  return (
    <div data-ui="ClassCard" className="flex flex-col gap-2">
      <header className="flex min-w-0 flex-col gap-0.5">
        {name !== null && (
          <span className="truncate font-medium text-surface-50 select-text">{name}</span>
        )}
        {name === null && <Code className="self-start select-text">{classHash}</Code>}
        {data && data.bases.length > 0 && <Bases bases={data.bases} />}
      </header>
      {data && <Counts classHash={classHash} schema={data} />}
      <ClassDoc classHash={classHash} />
      <footer className="flex items-center justify-between gap-3">
        <Basis pending={isPending} error={error} schema={data} />
        {name !== null && (
          <ExternalLink href={classPageUrl(name)} className="shrink-0">
            {m.workshop_bin_meta_wiki_action()}
          </ExternalLink>
        )}
      </footer>
    </div>
  );
}

/** The classes the class derives from, nearest first, each opening its own card. */
function Bases({ bases }: { bases: readonly ClassRef[] }) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-surface-400">
      {m.workshop_bin_class_bases_label()}
      {bases.map((base, at) => (
        <Fragment key={base.hash}>
          {at > 0 && <span aria-hidden>,</span>}
          <ClassRefCard reference={base} />
        </Fragment>
      ))}
    </span>
  );
}

/** The fields the class declares, and the objects of the install that declare it. */
function Counts({ classHash, schema }: { classHash: string; schema: ClassSchema }) {
  const objects = useClassObjectCount(classHash);

  return (
    <span className="flex items-center gap-1.5 text-surface-300 tabular-nums">
      {m.workshop_bin_class_field_count_label({ count: schema.fields.length })}
      {objects !== null && (
        <>
          <span aria-hidden className="text-surface-500">
            ·
          </span>
          {m.workshop_bin_class_object_count_label({ count: objects })}
        </>
      )}
    </span>
  );
}

/** The wiki's documentation for the class itself. Renders nothing when the wiki has none. */
function ClassDoc({ classHash }: { classHash: string }) {
  const { data } = useClassDocs(classHash);

  if (!data?.class) return null;
  return <DocProse doc={data.class} />;
}

interface BasisProps {
  pending: boolean;
  error: AppError | null;
  schema: ClassSchema | null | undefined;
}

/** What the schema had to say, which is the patch it answered at or that it had no line. */
function Basis({ pending, error, schema }: BasisProps) {
  if (pending) return <Spinner size="sm" />;
  if (error)
    return <span className="min-w-0 truncate text-surface-400">{errorSummary(error)}</span>;
  if (schema === null) {
    return <span className="text-surface-400">{m.workshop_bin_class_unknown_empty()}</span>;
  }
  /* A build number names no patch a modder reads, so a schema read at a build the install
     does not have says nothing rather than a number nobody can place. */
  if (!schema?.patch) return <span />;
  return (
    <span className="text-surface-400">
      {m.workshop_bin_at_patch_label({ patch: schema.patch })}
    </span>
  );
}
