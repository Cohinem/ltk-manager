import { type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { Code, Popover } from "@/components";
import { m } from "@/i18n";
import type { DeclaredObject } from "@/lib/tauri";

import { declaringFileContext } from "../documents/contentDocument";
import type { OpenIntent } from "../palette/types";
import { clickIntent, useOpenDocumentAs } from "../state";
import { decideFileLink, decideHash, decideObjectLink } from "./linkDecision";
import { useLayerCopy, useLinkOpen, useLinkTargets } from "./useLinkTargets";

/** Hover for this long opens the card, the tooltip delay. */
const CARD_DELAY = 600;

interface ObjectChipProps {
  /** `0x` and eight hex digits. */
  hash: string;
  /** The object's path as the tables name it. Null where no table does. */
  name: string | null;
  /** A `link` value, which draws dim hex where nothing declares it. A `hash` stays text. */
  kind: "link" | "hash";
}

/**
 * A `link` or a `hash` as a chip that opens the object tab, per "Links" in
 * docs/ux/BIN_EDITOR.md.
 *
 * A click that lands while the index is absent builds it. The tree opens the target
 * on the check's answer.
 */
export function ObjectChip({ hash, name, kind }: ObjectChipProps) {
  const targets = useLinkTargets();
  const declared = targets.declared.get(hash);
  const decision = kind === "link" ? decideObjectLink(hash, targets) : decideHash(hash, targets);
  const { wantOpen, wanting } = useLinkOpen();
  const open = useOpenDocumentAs();

  const label = name ?? declared?.path ?? hash;
  if (decision.kind === "text" && kind === "link") return <Hex>{hash}</Hex>;
  if (decision.kind === "text") return <Text mono={name === null}>{label}</Text>;
  if (decision.kind === "pending") return <Text mono={name === null}>{label}</Text>;
  if (decision.kind === "warm") {
    return (
      <LinkChip
        label={label}
        mono={name === null}
        pending={wanting.has(hash)}
        onOpen={(intent) => wantOpen(hash, intent)}
      />
    );
  }

  return (
    <LinkChip
      label={label}
      mono={name === null}
      card={declared && <TargetCard hash={hash} declared={declared} />}
      onOpen={(intent) => open(decision.document, intent)}
    />
  );
}

interface FileChipProps {
  /** Sixteen hex digits. */
  hash: string;
  /** The chunk's path as the tables name it. Null where no table does. */
  path: string | null;
}

/**
 * A `file` link as a chip that opens the chunk's preview, carrying the side that
 * answered: the layer's title, or the archive's name.
 */
export function FileChip({ hash, path }: FileChipProps) {
  const targets = useLinkTargets();
  const layer = useLayerCopy(path);
  const open = useOpenDocumentAs();
  const decision = decideFileLink(path, targets, layer);

  if (path === null) return <Hex>{hash}</Hex>;
  if (decision.kind !== "chip") return <Text mono>{path}</Text>;

  return (
    <span className="flex min-w-0 items-center gap-2">
      <LinkChip label={path} mono onOpen={(intent) => open(decision.document, intent)} />
      {decision.side !== undefined && (
        <span className="shrink-0 text-meta text-surface-400">{decision.side}</span>
      )}
    </span>
  );
}

interface LinkChipProps {
  label: string;
  /** The label is a hash or a path rather than a name. */
  mono: boolean;
  /** The click was taken and the index is building. */
  pending?: boolean;
  /** The hover card. Absent while the target is not resolved. */
  card?: ReactNode;
  onOpen: (intent: OpenIntent) => void;
}

/** A mono `Code` chip, per DS-CODE-CHIP, opening on click and beside on `Ctrl+click`. */
export function LinkChip({ label, mono, pending = false, card, onOpen }: LinkChipProps) {
  const button = (
    <button
      type="button"
      data-ui="LinkChip"
      className={twMerge(
        "max-w-full min-w-0 cursor-pointer truncate rounded-sm text-left",
        pending && "animate-pulse",
      )}
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onOpen(clickIntent(event));
      }}
    >
      <Code
        className={twMerge("hover:bg-surface-veil hover:text-surface-100", !mono && "font-sans")}
      >
        {label}
      </Code>
    </button>
  );
  if (!card) return button;

  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={CARD_DELAY} render={button} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6}>
          <Popover.Popup aria-label={label} className="w-80 p-3 text-meta select-none">
            {card}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The target's path, its class, its declaring file and its declaration count. */
function TargetCard({ hash, declared }: { hash: string; declared: DeclaredObject }) {
  const [first] = declared.declarations;
  return (
    <div data-ui="LinkChip:card" className="flex flex-col gap-2">
      <header className="flex min-w-0 flex-col items-start gap-1">
        <span className="max-w-full truncate text-row font-medium text-surface-100 select-text">
          {declared.path}
        </span>
        <Code className="select-text">{hash}</Code>
      </header>
      {first && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-surface-400">{m.workshop_bin_class_label()}</dt>
          <dd className="min-w-0 truncate text-surface-200 select-text">{first.class}</dd>
          <dt className="text-surface-400">{m.workshop_bin_declared_in_label()}</dt>
          <dd className="min-w-0 truncate font-mono text-code text-surface-200 select-text">
            {declaringFileContext(first.asset, first.file)}
          </dd>
        </dl>
      )}
      <span className="text-surface-400">
        {m.workshop_bin_declarations_label({ count: declared.declarations.length })}
      </span>
    </div>
  );
}

function Text({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      className={twMerge("truncate text-surface-200 select-text", mono && "font-mono text-code")}
    >
      {children}
    </span>
  );
}

function Hex({ children }: { children: ReactNode }) {
  return (
    <span className="truncate font-mono text-code text-surface-400 select-text">{children}</span>
  );
}
