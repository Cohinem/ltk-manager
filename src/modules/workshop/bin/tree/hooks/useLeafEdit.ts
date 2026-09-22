import { createContext, useCallback, useState } from "react";

import {
  api,
  type AppError,
  type AssetRef,
  type BinDocumentId,
  type BinRow,
  type ValueEdit,
} from "@/lib/tauri";

import { assetKey } from "../../../preview/utils/assetRef";
import { noteRefused, queueForSave } from "../../../state";
import { rowKey } from "../utils/binRows";
import type { TypedLeaf } from "../utils/leafText";

export interface LeafEdit {
  readonly commit: (row: BinRow, typed: TypedLeaf) => void | Promise<boolean>;
  readonly refused: ReadonlyMap<string, AppError>;
  readonly editProperty?: (holder: BinRow, field: string, edits: ValueEdit[]) => Promise<boolean>;
  readonly removeItem?: (row: BinRow) => Promise<boolean>;
  readonly setPointer?: (
    holder: BinRow,
    field: string,
    className: string | null,
  ) => Promise<boolean>;
}

/** Leaf edits for layouts without tree navigation or structural actions. */
export const LeafEditContext = createContext<LeafEdit | null>(null);

/** Validated document mutations shared by the tree and class inspectors. */
export function useLeafEdit(document: BinDocumentId, asset: AssetRef, invalidate: () => void) {
  const [refused, setRefused] = useState<ReadonlyMap<string, AppError>>(new Map());
  const key = assetKey(asset);

  const mark = useCallback((at: string, error: AppError | null) => {
    setRefused((previous) => {
      if (error === null && !previous.has(at)) {
        return previous;
      }

      const next = new Map(previous);
      if (error === null) {
        next.delete(at);
      } else {
        next.set(at, error);
      }

      return next;
    });
  }, []);

  const landed = useCallback(() => {
    queueForSave(key, document);
    invalidate();
  }, [document, invalidate, key]);

  const commit = useCallback(
    async (row: BinRow, typed: TypedLeaf) => {
      const at = rowKey(row);
      if (!typed.ok) {
        mark(at, { code: "BIN_EDIT_REJECTED", address: at, rejection: typed.rejection });
        noteRefused(key);
        return false;
      }

      const result = await api.bin.patch(document, row.entry, row.path, typed.leaf);
      mark(at, result.ok ? null : result.error);
      if (!result.ok) {
        noteRefused(key);
        return false;
      }

      landed();
      return true;
    },
    [document, key, landed, mark],
  );

  const editProperty = useCallback(
    async (holder: BinRow, field: string, edits: ValueEdit[]) => {
      const result = await api.bin.editProperty(document, holder.entry, holder.path, field, edits);
      mark(rowKey(holder), result.ok ? null : result.error);
      if (!result.ok) {
        noteRefused(key);
        return false;
      }

      landed();
      return true;
    },
    [document, key, landed, mark],
  );

  const removeItem = useCallback(
    async (row: BinRow) => {
      const result = await api.bin.removeItem(document, row.entry, row.path);
      mark(rowKey(row), result.ok ? null : result.error);
      if (!result.ok) {
        noteRefused(key);
        return false;
      }

      landed();
      return true;
    },
    [document, key, landed, mark],
  );

  const setPointer = useCallback(
    async (holder: BinRow, field: string, className: string | null) => {
      const path = [holder.path, field.slice(2)].filter(Boolean).join(".");
      const result = await api.bin.setPointer(document, holder.entry, path, className);
      mark(`${holder.entry}:${path}`, result.ok ? null : result.error);
      if (!result.ok) {
        noteRefused(key);
        return false;
      }

      landed();
      return true;
    },
    [document, key, landed, mark],
  );

  return { commit, refused, mark, landed, editProperty, removeItem, setPointer };
}
