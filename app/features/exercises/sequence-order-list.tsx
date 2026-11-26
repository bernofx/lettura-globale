import { GripVertical, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { dropIndex } from "../../domain/reorder";

type OrderItem = { id: string; title: string };
type Drag = { id: string; from: number; pointerId: number; startY: number; offset: number; to: number; midpoints: number[]; step: number };

/**
 * Sequence order with a drag handle on the left of each row. The handle also works from the
 * keyboard (Up/Down arrows) and announces every move, so dragging is never the only way.
 */
export function SequenceOrderList({ items, onMove, onRemove }: { items: OrderItem[]; onMove: (id: string, toIndex: number) => void; onRemove: (id: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const focusAfterMove = useRef<string | null>(null);

  useEffect(() => {
    const id = focusAfterMove.current;
    if (!id) return;
    focusAfterMove.current = null;
    list.current?.querySelector<HTMLButtonElement>(`[data-handle-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: false });
  }, [items]);

  const announce = (item: OrderItem, to: number) => setAnnouncement(`${item.title} spostato in posizione ${to + 1} di ${items.length}`);

  const move = (item: OrderItem, from: number, to: number) => {
    if (to === from || to < 0 || to >= items.length) return;
    focusAfterMove.current = item.id;
    onMove(item.id, to);
    announce(item, to);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, item: OrderItem, index: number) => {
    if (event.button !== 0 || !list.current) return;
    const rows = [...list.current.querySelectorAll<HTMLElement>(":scope > article")];
    const rects = rows.map((row) => row.getBoundingClientRect());
    if (rects.length !== items.length) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const step = rects.length > 1 ? rects[1].top - rects[0].top : rects[0].height;
    setDrag({ id: item.id, from: index, pointerId: event.pointerId, startY: event.clientY, offset: 0, to: index, midpoints: rects.map((rect) => rect.top + rect.height / 2), step });
  };

  const continueDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const offset = event.clientY - drag.startY;
    const to = dropIndex(drag.midpoints[drag.from] + offset, drag.midpoints, drag.from);
    setDrag({ ...drag, offset, to });
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>, item: OrderItem, cancelled = false) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
    if (!cancelled) move(item, drag.from, drag.to);
  };

  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, item: OrderItem, index: number) => {
    const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    move(item, index, to);
  };

  const shiftFor = (index: number) => {
    if (!drag) return 0;
    if (index === drag.from) return drag.offset;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.step;
    if (drag.from > drag.to && index < drag.from && index >= drag.to) return drag.step;
    return 0;
  };

  return <>
    <div ref={list} className={`sequence-order-list ${drag ? "is-dragging" : ""}`}>
      {items.map((item, index) => <article key={item.id} className={drag?.id === item.id ? "dragging" : undefined} style={drag ? { transform: `translateY(${shiftFor(index)}px)` } : undefined}>
        <button type="button" className="sequence-drag-handle" data-handle-id={item.id} aria-label={`Sposta ${item.title}, posizione ${index + 1} di ${items.length}. Trascina oppure usa le frecce su e giù`} title="Trascina per spostare"
          onPointerDown={(event) => startDrag(event, item, index)} onPointerMove={continueDrag} onPointerUp={(event) => endDrag(event, item)} onPointerCancel={(event) => endDrag(event, item, true)} onKeyDown={(event) => onHandleKey(event, item, index)}>
          <GripVertical aria-hidden="true" />
        </button>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <strong>{item.title}</strong>
        <button type="button" className="sequence-remove" onClick={() => onRemove(item.id)} aria-label={`Rimuovi ${item.title} dalla sequenza`}><X /></button>
      </article>)}
    </div>
    <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
  </>;
}
