import { useEffect, type RefObject } from "react";

/**
 * Games leave only through their X: Esc and Back must keep them open. Browsers may
 * still close a modal `<dialog>` natively (e.g. a repeated Esc without user
 * activation bypasses the prevented `cancel`); reopen it so the visible state
 * never diverges from React's. The listener is removed on unmount, before the
 * asynchronous `close` event of the component's own `dialog.close()` fires.
 */
export function useKeepDialogOpen(dialog: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    function keepOpen() {
      if (!element || element.open || !element.isConnected) return;
      try { element.showModal(); } catch { /* removed from the document meanwhile */ }
    }
    element.addEventListener("close", keepOpen);
    return () => element.removeEventListener("close", keepOpen);
  }, [dialog]);
}
