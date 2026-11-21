"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { SequenceCelebration } from "../../components/sequence-celebration";
import { playBalloonPop } from "../../domain/balloon-audio";
import { BALLOON_COLORS } from "../../domain/celebration";
import { feedbackContext } from "../../shared/audio";
import { startGameMusic } from "./game-music";
import { useKeepDialogOpen } from "./use-keep-dialog-open";

export function BalloonThumbnail() {
  return (
    <div className="coloring-card-art balloon-thumbnail" aria-hidden="true">
      {[BALLOON_COLORS[2], BALLOON_COLORS[0], BALLOON_COLORS[3]].map(color => (
        <span key={color} style={{ "--balloon-color": color } as CSSProperties}>
          <span className="celebration-balloon-body" />
        </span>
      ))}
    </div>
  );
}

export function BalloonGame({ soundVolume, onClose }: { soundVolume: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useKeepDialogOpen(dialog);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function popSound() {
    if (soundVolume > 0) void playBalloonPop(feedbackContext(), soundVolume);
  }

  return (
    <dialog ref={dialog} className="balloon-game-dialog" aria-label="Palloncini" onCancel={event => event.preventDefault()}>
      <SequenceCelebration mode="game" startMusic={startGameMusic} musicVolume={soundVolume * 0.55} onPop={popSound} onClose={onClose} />
    </dialog>
  );
}
