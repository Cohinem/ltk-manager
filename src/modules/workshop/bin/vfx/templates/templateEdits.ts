import type { TemplateEmitter, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";

const EMITTER_NAME = nameHash("emitterName");

/**
 * The edits that land `emitters` as consecutive items of a list from `index`, each named
 * apart from `taken` and from the ones landed before it. Two edits an emitter, since each
 * template emitter holds its `emitterName`.
 *
 * One property edit, so one undo step, per "A template is a stored value" in
 * docs/plans/vfx-templates.md.
 */
export function landingEdits(
  emitters: readonly TemplateEmitter[],
  index: number,
  taken: ReadonlySet<string>,
): ValueEdit[] {
  const names = new Set(taken);

  return emitters.flatMap((emitter, offset) => {
    const item = `[${index + offset}]`;
    const name = freeName(names, emitter.name);
    names.add(name);

    return [
      { type: "pasteItem", path: "", index: index + offset, text: emitter.text, unique: null },
      {
        type: "setLeaf",
        path: `${item}.${EMITTER_NAME.slice(2)}`,
        value: { type: "string", value: name },
      },
    ] satisfies ValueEdit[];
  });
}

/** `base`, else `base2`, `base3` and on, the first `taken` does not hold. */
export function freeName(taken: ReadonlySet<string>, base: string): string {
  if (!taken.has(base)) return base;

  let at = 2;
  while (taken.has(`${base}${at}`)) {
    at += 1;
  }
  return `${base}${at}`;
}
