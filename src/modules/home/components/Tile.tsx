import type { ReactNode } from "react";

import { twMerge } from "@/utils";

interface TileProps {
  title: string;
  /** One control at the header's trailing edge. */
  action?: ReactNode;
  /** A row ruled off under the body, for what the tile leads out to. */
  foot?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-ui": string;
}

/** One titled card of the page, framed as the library and workshop frame theirs. */
export function Tile({ title, action, foot, children, className, "data-ui": dataUi }: TileProps) {
  return (
    <section
      data-ui={dataUi}
      className={twMerge(
        "flex min-w-0 flex-col rounded-xl border border-surface-600 bg-surface-900 shadow-concave",
        className,
      )}
    >
      <header className="flex min-h-11 items-center justify-between gap-2 px-4 pt-3 pb-2 select-none">
        <h2 className="text-sm font-semibold text-surface-100">{title}</h2>
        {action}
      </header>
      <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
      {foot && <div className="border-t border-surface-700 px-2 py-2">{foot}</div>}
    </section>
  );
}
