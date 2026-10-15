import { use, useMemo } from "react";

import { useToast } from "@/components";
import { errorSummary, m } from "@/i18n";

import { useDeclares } from "../../documents/hooks/useDeclared";
import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { declaredAdd, groupedAdd, type IdleEffectAdd } from "../utils/idleEffectEdits";
import { sendEach } from "./useDynamicsEdit";

/**
 * Returns the add of one idle effect, and null if the view does not edit.
 *
 * A document that saves its own bytes takes the add as one undo step. A declared document takes
 * it as the narrow calls of `declaredAdd`. A refusal is shown in a toast, because the add leaves
 * no field to mark.
 */
export function useIdleEffectAdd(): ((add: IdleEffectAdd) => void) | null {
  const edit = use(LeafEditContext);
  const send = edit?.send;
  const landed = edit?.landed;
  const declares = useDeclares();
  const toast = useToast();

  return useMemo(() => {
    if (send === undefined || landed === undefined) return null;

    return (add: IdleEffectAdd) => {
      const calls = declares ? declaredAdd(add) : [groupedAdd(add)];
      void sendEach({ send, landed }, calls).then((refused) => {
        if (refused !== null) {
          toast.error(m.workshop_bin_edit_refused_title(), errorSummary(refused));
        }
      });
    };
  }, [send, landed, declares, toast]);
}
