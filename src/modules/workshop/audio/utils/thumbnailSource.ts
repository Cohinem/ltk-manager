import type { EventTree, MediaLocation } from "@/lib/tauri";

import { eventSounds, type RandomSource } from "./eventTree";

/** Picks the first weighted playlist item, so a row draws the same media each time. */
const FIRST_PICK: RandomSource = () => 0;

/** Returns the first media that a press of the event `tree` plays, or `null` without one. */
export function firstEventMedia(tree: EventTree): MediaLocation | null {
  return eventSounds(tree, FIRST_PICK)[0] ?? null;
}
