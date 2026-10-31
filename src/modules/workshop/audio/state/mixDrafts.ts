import { create } from "zustand";

import type { NodeProperty } from "@/lib/tauri";

import type { MixDraft } from "../utils/voiceMix";

interface MixDraftState {
  readonly drafts: readonly MixDraft[];
  /** Sets the draft of its object's property, in place of the draft before it. */
  readonly set: (draft: MixDraft) => void;
  /** Drops the draft of `property` of `object`, if there is one. */
  readonly clear: (object: number, property: NodeProperty) => void;
}

function sameField(draft: MixDraft, object: number, property: NodeProperty): boolean {
  return draft.object === object && draft.property === property;
}

/**
 * The values of the knobs that turn, before their edits land.
 *
 * A knob writes its value here on each step, and the event player reads it, so a voice that
 * plays follows the knob. Per "Playback of properties" in docs/ux/AUDIO.md.
 */
export const useMixDraftStore = create<MixDraftState>((set) => ({
  drafts: [],
  set: (draft) =>
    set((state) => ({
      drafts: [
        ...state.drafts.filter((each) => !sameField(each, draft.object, draft.property)),
        draft,
      ],
    })),
  clear: (object, property) =>
    set((state) =>
      state.drafts.some((each) => sameField(each, object, property))
        ? { drafts: state.drafts.filter((each) => !sameField(each, object, property)) }
        : state,
    ),
}));
