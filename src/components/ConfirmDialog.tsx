import { WarningIcon } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useRef } from "react";
import { create } from "zustand";

import { m } from "@/i18n";

import { AlertBox } from "./AlertBox";
import { Button } from "./Button";
import { Dialog, type DialogOverlaySize } from "./Dialog";
import type { StatusTone } from "./tone";

/** How grave the answer is, as the callout's tone. */
export type ConfirmTone = Extract<StatusTone, "danger" | "warning">;

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** What the dialog is called, in its header. */
  title: ReactNode;
  /** The question, as the callout's own line. Without it the body is plain prose. */
  heading?: ReactNode;
  /** What confirming does, under the heading. */
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  onConfirm: () => void;
  /** Whether the answer is still being acted on, which spins the confirm button. */
  pending?: boolean;
  /** Hold the confirm button until the reader has done what the body asks. */
  confirmDisabled?: boolean;
  tone?: ConfirmTone;
  /** The glyph beside the heading. */
  icon?: ReactNode;
  size?: DialogOverlaySize;
  /** Whatever else the reader needs to decide, under the description. */
  children?: ReactNode;
}

/**
 * A dialog that asks one question and offers one destructive answer.
 *
 * With a `heading` the body is an `AlertBox` in the dialog's tone, and without one it is the
 * `description` as plain prose. Anything more than that is its own dialog.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  heading,
  description,
  confirmLabel,
  cancelLabel = m.common_cancel_action(),
  onConfirm,
  pending,
  confirmDisabled = false,
  tone = "danger",
  icon,
  size = "sm",
  children,
}: ConfirmDialogProps) {
  const hasBody = description !== undefined || children !== undefined;

  return (
    <Dialog.Shell open={open} onClose={onClose} title={title} size={size}>
      <Dialog.Body>
        {heading === undefined && (
          <div className="text-sm text-surface-400">
            {description}
            {children}
          </div>
        )}

        {heading !== undefined && (
          <AlertBox
            tone={tone}
            title={heading}
            icon={icon ?? <WarningIcon weight="duotone" className="size-5" />}
          >
            {hasBody && (
              <>
                {description}
                {children}
              </>
            )}
          </AlertBox>
        )}
      </Dialog.Body>

      <Dialog.Footer>
        <Button size="lg" variant="ghost" onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          size="lg"
          variant="filled"
          tone="danger"
          onClick={onConfirm}
          loading={pending}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Button>
      </Dialog.Footer>
    </Dialog.Shell>
  );
}

/** What a `confirm()` call asks, minus everything the host answers for itself. */
export type ConfirmRequest = Omit<ConfirmDialogProps, "open" | "onClose" | "onConfirm" | "pending">;

interface ConfirmHostStore {
  /** The question on screen, and what to settle its promise with. */
  pending: (ConfirmRequest & { settle: (answer: boolean) => void }) | null;
  ask: (request: ConfirmRequest, settle: (answer: boolean) => void) => void;
  answer: (answer: boolean) => void;
}

const useConfirmHostStore = create<ConfirmHostStore>()((set, get) => ({
  pending: null,
  /* A second question replaces the first, which the first's caller reads as a
     refusal - nothing may act on an answer the reader never gave. */
  ask: (request, settle) => {
    get().pending?.settle(false);
    set({ pending: { ...request, settle } });
  },
  answer: (answer) => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.settle(answer);
  },
}));

/**
 * Ask one destructive question, from wherever the reader asked for it.
 *
 * The dialog is mounted by `ConfirmHost` rather than by the caller, so a menu
 * that unmounts as it closes can still raise one. A question that needs its own
 * pending state or its own fields is a `ConfirmDialog` the caller mounts.
 */
export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  const ask = useConfirmHostStore((s) => s.ask);
  return useCallback((request) => new Promise<boolean>((resolve) => ask(request, resolve)), [ask]);
}

/** Where every `useConfirm` question draws. Mounted once, above the router. */
export function ConfirmHost() {
  const pending = useConfirmHostStore((s) => s.pending);
  const answer = useConfirmHostStore((s) => s.answer);

  /* The request outlives its own dismissal by one transition, so the dialog
     animates out on the text it was asking rather than on nothing. */
  const shown = useRef<ConfirmRequest | null>(null);
  if (pending) shown.current = pending;
  const request = shown.current;
  if (!request) return null;

  return (
    <ConfirmDialog
      {...request}
      open={pending !== null}
      onClose={() => answer(false)}
      onConfirm={() => answer(true)}
    />
  );
}
