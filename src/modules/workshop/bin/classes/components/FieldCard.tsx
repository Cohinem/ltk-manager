import type { ReactNode } from "react";

import { Code, ExternalLink, HoverCard, SeverityGlyph, Spinner } from "@/components";
import { errorSummary, m, Marked } from "@/i18n";
import type { AppError, ClassSchema, DeclaredKind, FieldSchema, KindShape } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { CutText } from "../../shared/components/CutText";
import { Swatch } from "../../values/components/ColorMark";
import { shapeTag } from "../../values/utils/kindTag";
import { useClassDocs } from "../hooks/useClassDocs";
import { useClassSchema } from "../hooks/useClassSchema";
import { fieldPageUrl } from "../utils/metaWiki";
import { type ColorScale, defaultText, earlierType } from "../utils/schemaField";
import { CARD_TEXT, ClassRefCard, SchemaClassCard } from "./ClassCard";
import { DocProse } from "./DocProse";

interface FieldCardProps {
  /** The class the field is read on. Null where the row's parent declares none. */
  classHash: string | null;
  /** `0x` and eight hex digits. */
  fieldHash: string;
  /** The field as the tables name it, or its hash where no table does. */
  name: string;
  /** Creator-facing trigger text, and the card's title. */
  label?: string;
  /** No table names the field, and `name` is its hash. */
  unnamed: boolean;
  declared: DeclaredKind | null;
  /** The tag of the kind the file writes, which a mismatch names beside the schema's. */
  fileTag?: string | null;
  /** A default the caller knows better than the schema, as JSON, such as a force's own. */
  defaultValue?: string | null;
  triggerClassName?: string;
  /** The name fills its box and is cut in the middle, rather than at its end. */
  cut?: boolean;
}

/**
 * A field name, and what the schema says about it while the pointer is on it.
 *
 * "The field card" in docs/ux/BIN_EDITOR.md. The body mounts when the card opens, which
 * is when its queries run. The wiki documentation for the field is looked up by `classHash`.
 */
export function FieldCard({
  classHash,
  fieldHash,
  name,
  label = name,
  unnamed,
  declared,
  fileTag = null,
  defaultValue = null,
  triggerClassName,
  cut = false,
}: FieldCardProps) {
  return (
    <HoverCard
      label={label}
      className={twMerge("w-max max-w-md min-w-72", CARD_TEXT)}
      content={
        <FieldCardBody
          classHash={classHash}
          fieldHash={fieldHash}
          name={name}
          label={label}
          unnamed={unnamed}
          declared={declared}
          fileTag={fileTag}
          defaultValue={defaultValue}
        />
      }
    >
      <span
        className={twMerge(
          "min-w-0 truncate decoration-dotted underline-offset-2 hover:underline",
          cut && "flex flex-1",
          triggerClassName,
        )}
      >
        {cut && <CutText text={label} />}
        {!cut && label}
      </span>
    </HoverCard>
  );
}

type FieldCardBodyProps = Required<
  Pick<FieldCardProps, "classHash" | "fieldHash" | "name" | "label" | "unnamed" | "declared">
> &
  Pick<FieldCardProps, "fileTag" | "defaultValue">;

function FieldCardBody({
  classHash,
  fieldHash,
  name,
  label,
  unnamed,
  declared,
  fileTag = null,
  defaultValue = null,
}: FieldCardBodyProps) {
  const { data, error, isPending } = useClassSchema(classHash);
  const field = data?.fields.find((candidate) => candidate.hash === fieldHash) ?? null;
  const shape = declared?.shape ?? field?.declared ?? null;

  return (
    <div data-ui="FieldCard" className="flex flex-col gap-2.5">
      <header className="flex min-w-0 flex-col gap-0.5 select-text">
        {!unnamed && label !== name && (
          <span className="truncate font-medium text-surface-50">{label}</span>
        )}
        <Signature
          name={unnamed ? fieldHash : name}
          shape={shape}
          classHash={field?.classHash ?? null}
        />
        {shape === null && (
          <span className="text-surface-400">{m.workshop_bin_field_undeclared_label()}</span>
        )}
      </header>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 empty:hidden">
        {field?.owner && (
          <Fact label={m.workshop_bin_field_declared_on_label()}>
            <ClassRefCard reference={field.owner} />
          </Fact>
        )}
        {field && <DefaultFact field={field} shape={shape} override={defaultValue} />}
      </dl>
      {declared?.mismatch && fileTag !== null && (
        <Mismatch fileTag={fileTag} declared={declared.shape} />
      )}
      {field && <EarlierType field={field} />}
      {classHash !== null && <FieldDoc classHash={classHash} fieldHash={fieldHash} />}
      <Footer
        classHash={classHash}
        fieldHash={fieldHash}
        pending={isPending && classHash !== null}
        error={error}
        schema={data}
      />
    </div>
  );
}

/** One labelled line of the card's facts. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-surface-400">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-surface-200">{children}</dd>
    </>
  );
}

interface SignatureProps {
  name: string;
  shape: KindShape | null;
  /** The class an embed, a pointer or the items hold. */
  classHash: string | null;
}

/** The field as a bin preview writes it: its name, then its kind and class after a colon. */
function Signature({ name, shape, classHash }: SignatureProps) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 font-mono text-code">
      <span className="min-w-0 truncate font-medium text-surface-50">
        {name}
        {shape !== null && <span className="text-surface-400">:</span>}
      </span>
      {/* DS-KIND-HUE, DS-TEXT */}
      {shape !== null && <span className="text-bin-kind-text">{shapeTag(shape)}</span>}
      {shape !== null && classHash !== null && <SchemaClassCard classHash={classHash} />}
    </span>
  );
}

/** The schema's default in the row's notation, and no line where the card shows none. */
function DefaultFact({
  field,
  shape,
  override,
}: {
  field: FieldSchema;
  shape: KindShape | null;
  override: string | null;
}) {
  const valueClass = useClassSchema(field.classHash).data?.name ?? null;
  const json = override ?? field.defaultValue;
  if (json === null) return null;

  const shown = defaultText(json, colorScale(shape, valueClass));
  if (shown === null) return null;

  return (
    <Fact label={m.workshop_bin_field_default_label()}>
      {shown.rgba !== null && <Swatch rgba={shown.rgba} />}
      {/* DS-CODE-CHIP */}
      <Code className="min-w-0 truncate select-text">{shown.text}</Code>
    </Fact>
  );
}

/** How a colour default writes its channels, or null for a default that is no colour. */
function colorScale(shape: KindShape | null, valueClass: string | null): ColorScale | null {
  if (shape?.kind === "rgba") return "byte";
  if (valueClass?.startsWith("ValueColor")) return "unit";
  return null;
}

/** The warning where the file's kind is not the one the schema declares. */
function Mismatch({ fileTag, declared }: { fileTag: string; declared: KindShape }) {
  return (
    <span className="flex items-start gap-1.5 text-surface-300">
      <SeverityGlyph severity="warning" />
      <span>
        <Marked
          text={m.workshop_bin_field_mismatch_description({
            file: fileTag,
            declared: shapeTag(declared),
          })}
        >
          {(kind) => <KindText tag={kind} />}
        </Marked>
      </span>
    </span>
  );
}

/** The type the field had before this one, where a patch changed it. */
function EarlierType({ field }: { field: FieldSchema }) {
  const earlier = earlierType(field);
  if (earlier === null) return null;

  const text =
    earlier.patch === null
      ? m.workshop_bin_field_retyped_unplaced_description({ kind: earlier.tag })
      : m.workshop_bin_field_retyped_description({ kind: earlier.tag, patch: earlier.patch });
  return (
    <span className="text-surface-400">
      <Marked text={text}>{(kind) => <KindText tag={kind} />}</Marked>
    </span>
  );
}

/** A kind in the bin preview's words and hue. */
function KindText({ tag }: { tag: string }) {
  /* DS-KIND-HUE, DS-TEXT */
  return <span className="font-mono text-code text-bin-kind-text">{tag}</span>;
}

interface FieldDocProps {
  classHash: string;
  fieldHash: string;
}

/** The wiki's documentation for the field. Renders nothing when the wiki has none. */
function FieldDoc({ classHash, fieldHash }: FieldDocProps) {
  const { data } = useClassDocs(classHash);
  const property = data?.properties[fieldHash];

  if (!property) return null;
  return <DocProse doc={property.doc} />;
}

interface FooterProps {
  classHash: string | null;
  fieldHash: string;
  pending: boolean;
  error: AppError | null;
  schema: ClassSchema | null | undefined;
}

/** The schema's read state while it has none, and the link to the wiki's section. */
function Footer({ classHash, fieldHash, pending, error, schema }: FooterProps) {
  if (pending) return <Spinner size="sm" />;
  if (error) return <span className="text-surface-400">{errorSummary(error)}</span>;
  if (classHash === null || schema === undefined) return null;
  return <FieldWikiLink classHash={classHash} fieldHash={fieldHash} />;
}

/** A link to the field's section on the wiki page of the class that documents it. */
function FieldWikiLink({ classHash, fieldHash }: FieldDocProps) {
  const { data } = useClassDocs(classHash);
  const property = data?.properties[fieldHash];

  if (!property) return null;
  return (
    <ExternalLink href={fieldPageUrl(property.owner, property.name)} className="self-end">
      {m.workshop_bin_meta_wiki_action()}
    </ExternalLink>
  );
}

/** The kind `schema` declares for a field, for a card that has no file row to read it from. */
export function schemaDeclared(
  schema: ClassSchema | null | undefined,
  fieldHash: string,
): DeclaredKind | null {
  const shape = schema?.fields.find((field) => field.hash === fieldHash)?.declared ?? null;
  if (shape === null) return null;
  return { shape, mismatch: false };
}

/** The schema's line for a field: its declared kind, or that it has none at this build. */
export function DeclaredLine({ declared }: { declared: DeclaredKind | null }) {
  if (declared === null) {
    return <span className="text-surface-400">{m.workshop_bin_field_undeclared_label()}</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-surface-300">
      {declared.mismatch && <SeverityGlyph severity="warning" />}
      <span>{m.workshop_bin_declared_label()}</span>
      <Code>{shapeTag(declared.shape)}</Code>
    </span>
  );
}
