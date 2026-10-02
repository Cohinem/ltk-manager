import { Kbd } from "@/components";

/** A tooltip's text and the key that runs the same action. */
export function KeyHint({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      <Kbd shortcut={shortcut} />
    </span>
  );
}
