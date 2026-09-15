import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useCallback, useMemo, useRef, useState } from "react";

import {
  type AppError,
  api,
  type AssetRef,
  type BinDocumentId,
  type BinRow,
  type NewItem,
} from "@/lib/tauri";
import type { Result } from "@/utils/result";

import { assetKey } from "../../../preview/utils/assetRef";
import { queueForSave, noteRefused } from "../../../state";
import { type AddSuggestion, fieldWire, propertyOf, shapeOf } from "../utils/addProperty";
import {
  type AddLine,
  addLineKey,
  childCount,
  holdsClass,
  insertShift,
  droppedInside,
  droppedUnder,
  lineTarget,
  moveShift,
  removeShift,
  renamedKey,
  rowKey,
  type RowLine,
  shiftedKey,
} from "../utils/binRows";
import type { TypedLeaf } from "../utils/leafText";
import type { RowEdit } from "../utils/rowEdits";

/** The kinds whose new row takes focus in a field, where a value is typed straight after the add. */
const FOCUSED_KINDS: ReadonlySet<string> = new Set([
  "i8",
  "u8",
  "i16",
  "u16",
  "i32",
  "u32",
  "i64",
  "u64",
  "f32",
  "vec2",
  "vec3",
  "vec4",
  "rgba",
  "string",
  "hash",
  "file",
  "link",
]);

/** The query roots that read a bin document's values, which a patch leaves stale. */
const DOCUMENT_READS = [
  ["bin-children"],
  ["bin-read"],
  ["bin-roots"],
  ["bin-file-roots"],
  ["bin-addable"],
  ["bin-item-classes"],
  ["vfx-system"],
  ["skin"],
  ["skin-graph"],
] as const;

const NO_REFUSALS: ReadonlyMap<string, AppError> = new Map();

/** How the rows of an editable tree take an edit. "Editing" in docs/ux/BIN_EDITOR.md. */
export interface BinEdit {
  /** Send what the reader typed to the leaf `row` draws, or mark the row where it cannot be sent. */
  commit: (row: BinRow, typed: TypedLeaf) => void;
  /** Why the backend refused the last edit a row sent, by row key. */
  refused: ReadonlyMap<string, AppError>;
  /** Add what `suggestion` names under the holder of `line`, then focus the new value. */
  add: (line: AddLine, suggestion: AddSuggestion) => Promise<Result<null>>;
  /** Put what `text` names into the holder of `line`: an item, an entry under the key, or a class. */
  insert: (line: AddLine, text: string) => Promise<Result<unknown>>;
  /** Run the structural edit `edit` on the row `line` draws. */
  run: (line: RowLine, edit: RowEdit) => void;
  /** Set the key of the map entry `line` draws to `text`. */
  setKey: (line: RowLine, text: string) => void;
  /** `Enter` on the value under `key`, which returns focus to the line the value was added from. */
  enter: (key: string) => void;
  /** Close the insert line open in the tree. */
  closeInsert: () => void;
  /** The row value or the add line to focus once it draws. */
  focusKey: string | null;
  /** The focus request landed. */
  settleFocus: () => void;
}

/** How a tree takes focus and keeps its expansion through an edit, which the tree owns. */
export interface TreeFocus {
  readonly key: string | null;
  readonly settle: () => void;
  /** Open the holder `row` draws, page it in to its end, and focus its add line. */
  readonly addTo: (row: BinRow) => void;
  /** Focus `key` once it draws, opening `opening` first where it is not null. */
  readonly to: (key: string, opening: string | null) => void;
  /** Open the insert line before child `index` of the holder under `holder`, and focus it. */
  readonly insertAt: (holder: string, index: number) => void;
  readonly closeInsert: () => void;
  /** Page the holder under `holder` in up to its row `count`. */
  readonly reach: (holder: string, count: number) => void;
  /** Carry the expanded rows through an edit that moved them: each key where it went, or out. */
  readonly remap: (remap: (key: string) => string | null) => void;
}

/** The edits of the enclosing tree. Null where the tree is read-only. */
export const BinEditContext = createContext<BinEdit | null>(null);

/** The edits the row under `key` takes, and whether its last one was refused. */
export function useRowEdit(key: string): { edit: BinEdit | null; refusal: AppError | undefined } {
  const edit = use(BinEditContext);
  return { edit, refusal: edit?.refused.get(key) };
}

/**
 * Every read of every bin document marked stale, which a patch, an undo and a reload need.
 *
 * The ids of other tabs over the asset read the same tree, and the frontend does not know
 * which ids those are.
 */
export function useInvalidateBinReads(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    for (const root of DOCUMENT_READS) {
      void queryClient.invalidateQueries({ queryKey: root });
    }
  }, [queryClient]);
}

/** The row key a path under `entry` is drawn under. */
function keyOf(entry: string, path: string): string {
  return rowKey({ entry, path });
}

/**
 * The edits one tree sends to `document`, each saving the asset after the wait.
 *
 * An edit that lands leaves every read of every bin stale.
 */
export function useBinEditor(
  document: BinDocumentId,
  asset: AssetRef,
  editable: boolean,
  focus: TreeFocus,
): BinEdit | null {
  const invalidate = useInvalidateBinReads();
  const [refused, setRefused] = useState(NO_REFUSALS);
  /* The value added last and the line it came from, which Enter on the value returns to. */
  const returns = useRef<{ from: string; to: string } | null>(null);
  const key = assetKey(asset);

  const mark = useCallback((at: string, error: AppError | null) => {
    setRefused((previous) => {
      if (error === null && !previous.has(at)) return previous;
      const next = new Map(previous);
      if (error === null) next.delete(at);
      else next.set(at, error);
      return next;
    });
  }, []);

  const landed = useCallback(() => {
    queueForSave(key, document);
    invalidate();
  }, [document, invalidate, key]);

  /* Focus the value added under `added`, and let Enter on it return to `line`. */
  const focusAdded = useCallback(
    (added: string, kind: string, line: string | null) => {
      if (holdsClass(kind)) {
        focus.to(addLineKey(added), added);
        return;
      }
      focus.to(added, null);
      returns.current = line === null ? null : { from: added, to: line };
    },
    [focus],
  );

  const commit = useCallback(
    (row: BinRow, typed: TypedLeaf) => {
      const at = rowKey(row);
      if (!typed.ok) {
        mark(at, { code: "BIN_EDIT_REJECTED", address: at, rejection: typed.rejection });
        noteRefused(key);
        return;
      }
      void api.bin.patch(document, row.entry, row.path, typed.leaf).then((result) => {
        mark(at, result.ok ? null : result.error);
        if (!result.ok) {
          noteRefused(key);
          return;
        }
        landed();
      });
    },
    [document, key, landed, mark],
  );

  const add = useCallback(
    async (line: AddLine, suggestion: AddSuggestion) => {
      const result = await api.bin.addProperty(
        document,
        line.entry,
        line.path,
        propertyOf(suggestion),
      );
      if (!result.ok) return result;
      landed();

      const added = keyOf(
        line.entry,
        `${line.path}${line.path === "" ? "" : "."}${fieldWire(suggestion)}`,
      );
      const shape = shapeOf(suggestion);
      if (shape.kind === "embed") focus.to(addLineKey(added), added);
      else if (FOCUSED_KINDS.has(shape.kind)) focusAdded(added, shape.kind, line.key);
      return result;
    },
    [document, focus, focusAdded, landed],
  );

  const insert = useCallback(
    async (line: AddLine, text: string): Promise<Result<unknown>> => {
      const { target } = line;
      const holder = keyOf(line.entry, line.path);

      if (target.kind === "pointer") {
        const result = await api.bin.setPointer(document, line.entry, line.path, text);
        if (!result.ok) return result;
        landed();
        focus.to(addLineKey(holder), holder);
        return result;
      }
      if (target.kind === "property") return { ok: true, value: null };

      const valueKind = target.kind === "entry" ? target.valueKind : target.itemKind;
      const item: NewItem = {
        index: line.index,
        key: target.kind === "entry" ? text : null,
        class: target.kind !== "entry" && holdsClass(valueKind) ? text : null,
      };
      const result = await api.bin.insertItem(document, line.entry, line.path, item);
      if (!result.ok) return result;
      landed();

      const at = line.index;
      if (at !== null) {
        if (target.kind === "item")
          focus.remap((each) => shiftedKey(each, holder, insertShift(at)));
        focus.closeInsert();
      }
      if (target.kind === "option" && !holdsClass(valueKind)) {
        focus.to(holder, null);
        return result;
      }
      focusAdded(keyOf(line.entry, result.value), valueKind, at === null ? line.key : null);
      return result;
    },
    [document, focus, focusAdded, landed],
  );

  /* An item of a leaf kind needs nothing typed, so it goes straight in. */
  const insertLeaf = useCallback(
    async (holder: BinRow, index: number | null) => {
      const target = lineTarget(holder.value);
      if (target?.kind !== "item" && target?.kind !== "option") return;
      const holderKey = rowKey(holder);
      const result = await api.bin.insertItem(document, holder.entry, holder.path, {
        index,
        key: null,
        class: null,
      });
      if (!result.ok) {
        mark(holderKey, result.error);
        return;
      }
      mark(holderKey, null);
      landed();

      if (target.kind === "option") {
        focus.to(holderKey, null);
        return;
      }
      if (index !== null) focus.remap((each) => shiftedKey(each, holderKey, insertShift(index)));
      focus.reach(holderKey, childCount(holder) + 1);
      const added = keyOf(holder.entry, result.value);
      focus.to(added, holderKey);
      returns.current = index === null ? { from: added, to: addLineKey(holderKey) } : null;
    },
    [document, focus, landed, mark],
  );

  /* One call that changes the tree under `row`, marking the row where it is refused. */
  const send = useCallback(
    async <T>(row: BinRow, call: Promise<Result<T>>, then: (value: T) => void) => {
      const result = await call;
      mark(rowKey(row), result.ok ? null : result.error);
      if (!result.ok) return;
      landed();
      then(result.value);
    },
    [landed, mark],
  );

  const run = useCallback(
    (line: RowLine, edit: RowEdit) => {
      const { row, parent } = line;
      const at = rowKey(row);
      const leafTarget = (holder: BinRow) => {
        const target = lineTarget(holder.value);
        return (
          (target?.kind === "item" || target?.kind === "option") && !holdsClass(target.itemKind)
        );
      };

      switch (edit) {
        case "addProperty":
        case "addEntry":
        case "setClass":
          focus.addTo(row);
          return;
        case "addItem":
        case "setValue":
          if (leafTarget(row)) void insertLeaf(row, null);
          else focus.addTo(row);
          return;
        case "insertAfter":
          if (parent === null) return;
          if (leafTarget(parent)) void insertLeaf(parent, line.index + 1);
          else focus.insertAt(rowKey(parent), line.index + 1);
          return;
        case "moveUp":
        case "moveDown": {
          if (parent?.value.type !== "container") return;
          const to = line.index + (edit === "moveUp" ? -1 : 1);
          if (to < 0 || to >= parent.value.len) return;
          const holder = rowKey(parent);
          void send(row, api.bin.moveItem(document, row.entry, row.path, to), (path) => {
            focus.remap((each) => shiftedKey(each, holder, moveShift(line.index, to)));
            focus.to(keyOf(row.entry, path), null);
          });
          return;
        }
        case "removeItem":
        case "removeEntry": {
          if (parent === null) return;
          const holder = rowKey(parent);
          const listed = parent.value.type === "container";
          void send(row, api.bin.removeItem(document, row.entry, row.path), () => {
            focus.remap((each) =>
              listed ? shiftedKey(each, holder, removeShift(line.index)) : droppedUnder(at)(each),
            );
          });
          return;
        }
        case "clearValue": {
          const path = parent?.value.type === "optional" ? row.path : `${row.path}[0]`;
          void send(row, api.bin.removeItem(document, row.entry, path), () => {
            focus.remap(droppedUnder(keyOf(row.entry, path)));
          });
          return;
        }
        case "setNull":
          void send(row, api.bin.setPointer(document, row.entry, row.path, null), () => {
            focus.remap(droppedInside(at));
          });
          return;
        case "removeProperty":
          void send(row, api.bin.removeProperty(document, row.entry, row.path), () => {
            focus.remap(droppedUnder(at));
          });
          return;
      }
    },
    [document, focus, insertLeaf, send],
  );

  const setKey = useCallback(
    (line: RowLine, text: string) => {
      const { row } = line;
      const from = rowKey(row);
      void send(row, api.bin.setKey(document, row.entry, row.path, text), (path) => {
        const to = keyOf(row.entry, path);
        if (to !== from) focus.remap((each) => renamedKey(each, from, to));
      });
    },
    [document, focus, send],
  );

  const enter = useCallback(
    (at: string) => {
      const pending = returns.current;
      if (pending?.from !== at) return;
      returns.current = null;
      focus.to(pending.to, null);
    },
    [focus],
  );

  return useMemo(
    () =>
      editable
        ? {
            commit,
            refused,
            add,
            insert,
            run,
            setKey,
            enter,
            closeInsert: focus.closeInsert,
            focusKey: focus.key,
            settleFocus: focus.settle,
          }
        : null,
    [editable, commit, refused, add, insert, run, setKey, enter, focus],
  );
}
