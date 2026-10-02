import { ARRANGED_HEADER_HEIGHT, ROW_HEIGHT, Skeleton, THUMB_SIZE } from "@/components";

import { useLibraryTableStore } from "../../state";

const ROWS = 12;

/** Name widths that vary from row to row, so the placeholder reads as a list of names. */
const NAME_WIDTHS = ["42%", "28%", "51%", "35%", "46%", "31%"];

/** The library table while the mods load, at the reader's row height. */
export function ModTableSkeleton() {
  const density = useLibraryTableStore((s) => s.density);
  const art = THUMB_SIZE[density];

  return (
    <div aria-hidden="true" className="min-h-0 flex-1 overflow-hidden">
      <div
        style={{ height: ARRANGED_HEADER_HEIGHT }}
        className="flex items-center gap-4 border-b border-surface-700 bg-surface-900 px-5"
      >
        <Skeleton width="4rem" height="0.625rem" />
        <Skeleton width="6rem" height="0.625rem" />
        <Skeleton width="5rem" height="0.625rem" />
      </div>
      <div className="mx-2 mt-1">
        {Array.from({ length: ROWS }, (_, index) => (
          <div
            key={index}
            style={{ height: ROW_HEIGHT[density] }}
            className="flex items-center gap-4 pr-3 pl-12"
          >
            <Skeleton width={28} height={16} />
            <Skeleton width={art.width} height={art.height} />
            <Skeleton width={NAME_WIDTHS[index % NAME_WIDTHS.length]} height="0.75rem" />
            <Skeleton width="4.5rem" height="0.75rem" className="ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
