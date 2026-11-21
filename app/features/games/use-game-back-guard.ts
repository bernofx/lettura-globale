import { useCallback, useLayoutEffect, useRef } from "react";

type GameHistoryEntry = { id: string; state: object; url: string };

/** Keep one same-document history step in front of an open game. */
export function useGameBackGuard(active: boolean) {
  const game = useRef<GameHistoryEntry | null>(null);
  const releasing = useRef(false);

  useLayoutEffect(() => {
    if (!active) return;
    const id = crypto.randomUUID();
    const history = window.history;
    const entry = { id, state: { ...history.state, lgGameGuard: id }, url: window.location.href };
    game.current = entry;
    if (!releasing.current) history.pushState(entry.state, "", entry.url);
    return () => {
      game.current = null;
      if (history.state?.lgGameGuard === id) {
        releasing.current = true;
        history.back();
      }
    };
  }, [active]);

  return useCallback(() => {
    const wasReleasing = releasing.current;
    releasing.current = false;
    const history = window.history;
    const entry = game.current;
    if (entry) {
      if (history.state?.lgGameGuard !== entry.id) history.pushState(entry.state, "", entry.url);
      return true;
    }
    // A browser Forward after closing may revisit the guard. Treat it as the underlying view.
    if (history.state?.lgGameGuard) {
      const state = { ...history.state };
      delete state.lgGameGuard;
      history.replaceState(state, "");
    }
    return wasReleasing;
  }, []);
}
