import {
  AppWindowIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  PuzzlePieceIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";
import { revealPath } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { IconButton } from "./Button";
import { FieldAffix } from "./FieldAffix";
import { Field } from "./FormField";
import { Tooltip } from "./Tooltip";

const pathIcons = {
  directory: FolderIcon,
  file: FileIcon,
  executable: AppWindowIcon,
  library: PuzzlePieceIcon,
};

export interface FilesystemPathProps {
  value: string;
  /** The caller's known path type, without probing the filesystem. */
  kind: keyof typeof pathIcons;
  "aria-label": string;
  className?: string;
}

/** A selectable, read-only filesystem path with its type as a prefix icon. */
export function FilesystemPath({
  value,
  kind,
  "aria-label": ariaLabel,
  className,
}: FilesystemPathProps) {
  const Icon = pathIcons[kind];
  const displayedPath = value.replace(/\\/g, "/");
  return (
    <Field.Root
      data-ui="FilesystemPath"
      className={twMerge("group/path relative w-full min-w-0 text-row", className)}
    >
      <Field.Control
        value={displayedPath}
        readOnly
        aria-label={ariaLabel}
        title={displayedPath}
        spellCheck={false}
        className="h-7 min-w-0 pr-9 pl-9 font-mono text-code select-text"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-surface-400"
      >
        <Icon weight="duotone" className="h-4 w-4" />
      </span>
      <FieldAffix className="pointer-events-none opacity-0 transition-opacity group-focus-within/path:pointer-events-auto group-focus-within/path:opacity-100 group-hover/path:pointer-events-auto group-hover/path:opacity-100">
        <Tooltip content={m.common_path_open_action()}>
          <IconButton
            icon={<FolderOpenIcon weight="bold" className="h-4 w-4" />}
            aria-label={m.common_path_open_action()}
            variant="ghost"
            size="sm"
            compact
            className="h-full rounded-none"
            onClick={() => revealPath(value)}
          />
        </Tooltip>
      </FieldAffix>
    </Field.Root>
  );
}
