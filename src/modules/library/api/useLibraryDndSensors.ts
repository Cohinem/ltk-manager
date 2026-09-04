import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/** Far enough that a click on a card is never read as the start of a drag. */
const POINTER = { activationConstraint: { distance: 8 } };

const KEYBOARD = { coordinateGetter: sortableKeyboardCoordinates };

/** The sensors every library list drags with, as one value per session. */
export function useLibraryDndSensors() {
  return useSensors(useSensor(PointerSensor, POINTER), useSensor(KeyboardSensor, KEYBOARD));
}
