import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactNode } from "react";

import { MAX_TOASTS, toastManager, ToastViewport } from "./Toast";

interface ToastProviderProps {
  children: ReactNode;
}

/**
 * Where every toast draws. Mounted once, above the router.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  return (
    /* One past the cap, so Base UI never marks a toast inert in the frame before the
       viewport closes one for room. */
    <BaseToast.Provider timeout={0} limit={MAX_TOASTS + 1} toastManager={toastManager}>
      {children}
      <BaseToast.Portal>
        <ToastViewport />
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}
