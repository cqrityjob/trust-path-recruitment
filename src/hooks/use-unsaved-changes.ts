import { useRef } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useT } from "@/i18n/context";

/** Protect both in-app navigation and reloads; release only after a successful save. */
export function useUnsavedChanges(dirty: boolean) {
  const { t } = useT();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      // Jumping to another section of the same form does not discard it.
      if (
        current.pathname === next.pathname &&
        JSON.stringify(current.search) === JSON.stringify(next.search)
      )
        return false;
      return dirtyRef.current && !window.confirm(t("ui.unsaved.leave"));
    },
    enableBeforeUnload: () => dirtyRef.current,
  });
  // Mutations may navigate before React commits the updated clean state.
  return () => {
    dirtyRef.current = false;
  };
}
