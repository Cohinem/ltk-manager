import { type ReactNode } from "react";

export interface PageInsetProps {
  children: ReactNode;
  /** Drawn over the panel's edge rather than inside it, such as a drawer. */
  overlay?: ReactNode;
  "data-ui"?: string;
}

/**
 * The rounded panel under a page's toolbar that holds its content, per "The inset region holds
 * cards" in docs/ux/HOME.md.
 */
export function PageInset({ children, overlay, "data-ui": dataUi }: PageInsetProps) {
  return (
    <div className="relative mx-2 flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        data-ui={dataUi}
        className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-700 bg-surface-900 shadow-pressed"
      >
        {children}
      </div>
      {overlay}
    </div>
  );
}
