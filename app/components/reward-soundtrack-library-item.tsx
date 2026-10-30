"use client";

import { useEffect, useRef } from "react";
import { REWARD_SOUNDTRACK } from "../domain/reward-soundtrack";

export function RewardSoundtrackLibraryItem() {
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const player = audio.current;
    return () => { if (player) { player.pause(); player.removeAttribute("src"); player.load(); } };
  }, []);
  return <div className="sound-setting reward-soundtrack-setting"><div><strong>{REWARD_SOUNDTRACK.title}</strong><small>La tua musica, durante il premio e nella festa finale. Si ripete finché il gioco è aperto e rispetta volume e audio disattivato.</small><small>{REWARD_SOUNDTRACK.source}</small></div><audio ref={audio} controls preload="none" src={REWARD_SOUNDTRACK.url} aria-label={`Ascolta ${REWARD_SOUNDTRACK.title}`} /></div>;
}
