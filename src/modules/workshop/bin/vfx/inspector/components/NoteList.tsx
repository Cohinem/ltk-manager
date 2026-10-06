import { statusGlyph, statusText } from "@/components";
import { twMerge } from "@/utils";

/** One line a group's notes draw: what the game does with the emitter, or a limit of the preview. */
export interface Note {
  readonly id: string;
  readonly tone: "warning" | "info";
  readonly text: string;
}

/** The notes at the top of an inspector group, one line each, and nothing for none. */
export function NoteList({ notes, name }: { notes: readonly Note[]; name: string }) {
  if (notes.length === 0) return null;

  return (
    <ul
      data-ui={name}
      className="flex flex-col gap-1 py-1 pr-1 pl-1.5 font-sans text-meta text-surface-300 select-none"
    >
      {notes.map((note) => {
        const Glyph = statusGlyph[note.tone];

        return (
          <li
            key={note.id}
            role={note.tone === "warning" ? "alert" : "status"}
            className="flex items-start gap-1.5"
          >
            {/* DS-TEXT */}
            <Glyph
              weight="duotone"
              className={twMerge("mt-px size-3.5 shrink-0", statusText[note.tone])}
            />
            <span className="min-w-0">{note.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
