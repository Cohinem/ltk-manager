import { twMerge } from "@/utils";

export interface TabLabelProps {
  title: string;
  /** Dim text after the title, saying where the document lives. */
  context?: string;
  /** The ephemeral tab, whose title is italic. */
  preview?: boolean;
}

/** A tab's title and its context, per "Title and context width" in docs/ux/PROJECT_EDITOR.md. */
export function TabLabel({ title, context, preview }: TabLabelProps) {
  const name = <span className={twMerge("truncate", preview && "italic")}>{title}</span>;
  if (!context) return name;

  return (
    <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5">
      {name}
      <span className="truncate text-meta text-surface-400">{context}</span>
    </span>
  );
}
