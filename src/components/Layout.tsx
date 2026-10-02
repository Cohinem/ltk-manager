import { createElement, type CSSProperties, type HTMLAttributes, type Ref } from "react";

/** A step on the spacing scale, in multiples of `--space-001`. */
export type Space = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 4 | 5 | 6 | 8 | 10 | 12;

/** An element a layout primitive may render as. */
export type LayoutElement =
  | "div"
  | "section"
  | "article"
  | "header"
  | "footer"
  | "main"
  | "nav"
  | "aside"
  | "ul"
  | "ol"
  | "li"
  | "span";

export type LayoutAlign = "start" | "center" | "end" | "stretch" | "baseline";

export type LayoutJustify = "start" | "center" | "end" | "between";

/** A window width under which a `Grid` drops to one column. */
export type LayoutBreakpoint = "md" | "lg";

interface LayoutBaseProps extends Omit<HTMLAttributes<HTMLElement>, "className" | "style"> {
  as?: LayoutElement;
  ref?: Ref<HTMLElement>;
  /** Take the free space of a flex parent, and let the contents shrink below their own size. */
  fill?: boolean;
  "data-ui"?: string;
}

const ALIGN: Record<LayoutAlign, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};

const JUSTIFY: Record<LayoutJustify, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};

/** The CSS length of a spacing step, on the zoomed 4.5px scale. */
export function space(step: Space): string {
  if (step === 0) {
    return "0px";
  }

  if (Number.isInteger(step)) {
    return `var(--space-${String(step).padStart(3, "0")})`;
  }

  return `calc(${step} * var(--space-001))`;
}

function renderLayout(
  { as = "div", fill, ref, children, ...rest }: LayoutBaseProps,
  layout: "stack" | "inline" | "grid",
  vars: Record<`--layout-${string}`, string>,
  collapse?: LayoutBreakpoint,
) {
  return createElement(
    as,
    {
      ...rest,
      ref,
      "data-layout": layout,
      "data-layout-fill": fill ? "" : undefined,
      "data-layout-collapse": collapse,
      style: vars as CSSProperties,
    },
    children,
  );
}

export interface StackProps extends LayoutBaseProps {
  gap?: Space;
  align?: LayoutAlign;
  justify?: LayoutJustify;
}

/** Children in a column, spaced by `gap`. */
export function Stack({ gap = 0, align = "stretch", justify = "start", ...props }: StackProps) {
  return renderLayout(props, "stack", {
    "--layout-gap": space(gap),
    "--layout-align": ALIGN[align],
    "--layout-justify": JUSTIFY[justify],
  });
}

export interface InlineProps extends LayoutBaseProps {
  gap?: Space;
  /** The gap between wrapped lines, when it differs from `gap`. */
  rowGap?: Space;
  align?: LayoutAlign;
  justify?: LayoutJustify;
  wrap?: boolean;
}

/** Children in a row, vertically centered and spaced by `gap`. */
export function Inline({
  gap = 0,
  rowGap,
  align = "center",
  justify = "start",
  wrap = false,
  ...props
}: InlineProps) {
  return renderLayout(props, "inline", {
    "--layout-gap": space(gap),
    "--layout-row-gap": space(rowGap ?? gap),
    "--layout-align": ALIGN[align],
    "--layout-justify": JUSTIFY[justify],
    "--layout-wrap": wrap ? "wrap" : "nowrap",
  });
}

interface GridBaseProps extends LayoutBaseProps {
  gap?: Space;
  rowGap?: Space;
  align?: LayoutAlign;
  /** One column below this window width. */
  collapseBelow?: LayoutBreakpoint;
}

export type GridProps = GridBaseProps &
  (
    | {
        /** A count of equal columns, or a `grid-template-columns` value. */
        columns: number | string;
        minColumnWidth?: never;
      }
    | {
        /** As many equal columns as fit, none narrower than this length. */
        minColumnWidth: string;
        columns?: never;
      }
  );

const ONE_COLUMN = "minmax(0, 1fr)";

function gridTemplate(columns: number | string | undefined, minColumnWidth: string | undefined) {
  if (minColumnWidth !== undefined) {
    return `repeat(auto-fill, minmax(min(${minColumnWidth}, 100%), 1fr))`;
  }

  if (typeof columns === "number") {
    return `repeat(${columns}, minmax(0, 1fr))`;
  }

  return columns ?? ONE_COLUMN;
}

/** Children on a grid of explicit or auto-filled columns. */
export function Grid({
  columns,
  minColumnWidth,
  gap = 0,
  rowGap,
  align = "stretch",
  collapseBelow,
  ...props
}: GridProps) {
  return renderLayout(
    props,
    "grid",
    {
      "--layout-columns": gridTemplate(columns, minColumnWidth),
      "--layout-gap": space(gap),
      "--layout-row-gap": space(rowGap ?? gap),
      "--layout-align": ALIGN[align],
    },
    collapseBelow,
  );
}

export type FillProps = Omit<LayoutBaseProps, "fill">;

/** A block that takes the free space of its flex parent. */
export function Fill({ as = "div", ref, children, ...rest }: FillProps) {
  return createElement(as, { ...rest, ref, "data-layout-fill": "" }, children);
}
