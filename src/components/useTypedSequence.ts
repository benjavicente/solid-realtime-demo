import { getHotkeyManager, type LetterKey } from "@tanstack/hotkeys";
import { onSettled } from "solid-js";

/**
 * Calls `onMatch` when the user types `word` anywhere on the page (outside form
 * fields). Used for hidden commands (easter eggs). Built on the framework-agnostic
 * core of TanStack Hotkeys, registered once the app runs in the browser.
 */
export function useTypedSequence(word: string, onMatch: () => void) {
  onSettled(() => {
    const keys = [...word.toUpperCase()] as LetterKey[];
    const handle = getHotkeyManager().register(keys, () => onMatch(), {
      // Letters still reach the page normally; only the full word triggers.
      preventDefault: false,
      stopPropagation: false,
      timeout: 1500,
    });
    return () => handle.unregister();
  });
}
