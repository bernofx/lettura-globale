"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export function usePointerDrop(disabled: boolean, onDrop: (id: string) => void, target: { selector: string; dataKey: string } = { selector: "[data-answer-id]", dataKey: "answerId" }) {
  const [offset, setOffset] = useState({ x: 0, y: 0, active: false });
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const onDropRef = useRef(onDrop);
  useEffect(() => { onDropRef.current = onDrop; }, [onDrop]);

  const reset = () => {
    start.current = null;
    setOffset({ x: 0, y: 0, active: false });
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    moved.current = false;
    start.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!start.current) return;
    const x = event.clientX - start.current.x;
    const y = event.clientY - start.current.y;
    if (!moved.current && Math.hypot(x, y) < 7) return;
    moved.current = true;
    event.preventDefault();
    setOffset({ x, y, active: true });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const wasMoved = moved.current;
    const dropTarget = wasMoved ? document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(target.selector) : null;
    const answerId = dropTarget?.dataset[target.dataKey];
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    reset();
    if (wasMoved && answerId) onDropRef.current(answerId);
  };
  const onPointerCancel = () => {
    moved.current = false;
    reset();
  };
  const consumeDraggedClick = () => {
    if (!moved.current) return false;
    moved.current = false;
    return true;
  };

  return { offset, consumeDraggedClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
