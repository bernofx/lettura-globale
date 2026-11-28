import { Eye, GripVertical, Pencil, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { dropIndex } from "../../domain/reorder";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";

type OrderItem = { id: string; title: string; details?: string[]; custom?: boolean };
type Drag = {
  ids: string[];
  from: number;
  pointerId: number;
  startY: number;
  startListTop: number;
  midpoints: number[];
  tops: number[];
};
type DragPreview = { from: number; offset: number; to: number; tops: number[] };

export function SequenceOrderList({ items, onMove, onEdit, onRemove }: { items: OrderItem[]; onEdit?: (id: string) => void; onMove: (id: string, toIndex: number) => void; onRemove: (id: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const activeDrag = useRef<Drag | null>(null);
  const suppressPointerClick = useRef(false);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [positionDialog, setPositionDialog] = useState<{ itemId: string; order: string; to: number } | null>(null);
  const titleId = useId();
  const detailsTitleId = useId();
  const [viewing, setViewing] = useState<{ item: OrderItem; position: number } | null>(null);
  const focusAfterMove = useRef<number | null>(null);
  useEffect(() => {
    const position = focusAfterMove.current;
    if (position === null) return;
    focusAfterMove.current = null;
    list.current?.querySelectorAll<HTMLButtonElement>(".sequence-drag-handle")[position]?.focus();
  }, [items]);
  const order = JSON.stringify(items.map(item => item.id));
  const selectedIndex = positionDialog?.order === order ? items.findIndex((item) => item.id === positionDialog.itemId) : -1;

  const move = (item: OrderItem, from: number, to: number) => {
    if (to === from || to < 0 || to >= items.length) return;
    focusAfterMove.current = to;
    onMove(item.id, to);
    setAnnouncement(`${item.title} spostato in posizione ${to + 1} di ${items.length}`);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (!event.isPrimary || event.button !== 0 || !list.current || activeDrag.current) return;
    const rows = [...list.current.querySelectorAll<HTMLElement>(":scope > article")];
    if (rows.length !== items.length) return;
    const rects = rows.map((row) => row.getBoundingClientRect());
    const startListTop = list.current.getBoundingClientRect().top;
    suppressPointerClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeDrag.current = { ids: items.map((item) => item.id), from: index, pointerId: event.pointerId, startY: event.clientY, startListTop,
      midpoints: rects.map((rect) => rect.top - startListTop + rect.height / 2),
      tops: rects.map((rect) => rect.top - startListTop) };
  };

  const dragPosition = (event: PointerEvent<HTMLButtonElement>, drag: Drag) => {
    const listTop = list.current?.getBoundingClientRect().top ?? drag.startListTop;
    const offset = event.clientY - drag.startY + drag.startListTop - listTop;
    return { from: drag.from, offset, to: dropIndex(drag.midpoints[drag.from] + offset, drag.midpoints, drag.from), tops: drag.tops };
  };

  const continueDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = activeDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const next = dragPosition(event, drag);
    if (Math.abs(next.offset) > 4) suppressPointerClick.current = true;
    if (suppressPointerClick.current) setPreview(next);
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = activeDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    activeDrag.current = null;
    setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled) return;
    const { offset, to } = dragPosition(event, drag);
    const orderUnchanged = drag.ids.length === items.length && drag.ids.every((id, index) => items[index].id === id);
    if (Math.abs(offset) > 4) suppressPointerClick.current = true;
    if (suppressPointerClick.current && orderUnchanged) move(items[drag.from], drag.from, to);
  };

  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, item: OrderItem, index: number) => {
    const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    move(item, index, to);
  };

  const shiftFor = (index: number) => {
    if (!preview) return 0;
    if (index === preview.from) return preview.offset;
    const direction = preview.from < preview.to && index > preview.from && index <= preview.to ? -1
      : preview.from > preview.to && index < preview.from && index >= preview.to ? 1 : 0;
    return direction ? (preview.tops[index + direction] ?? preview.tops[index]) - preview.tops[index] : 0;
  };

  return <>
    <div ref={list} className={`sequence-order-list ${preview ? "is-dragging" : ""}`}>
      {items.map((item, index) => <article key={item.id} className={preview?.from === index ? "dragging" : undefined} style={preview ? { transform: `translateY(${shiftFor(index)}px)` } : undefined}>
        <button type="button" className="sequence-drag-handle" aria-haspopup="dialog" disabled={items.length < 2}
          aria-label={`Sposta ${item.title}, posizione ${index + 1} di ${items.length}`} title="Trascina o scegli la posizione"
          onPointerDown={(event) => startDrag(event, index)} onPointerMove={continueDrag} onPointerUp={(event) => endDrag(event)}
          onPointerCancel={(event) => endDrag(event, true)} onLostPointerCapture={(event) => endDrag(event, true)}
          onKeyDown={(event) => onHandleKey(event, item, index)}
          onClick={(event) => {
            if (event.detail && suppressPointerClick.current) return;
            setPositionDialog({ itemId: item.id, order, to: index });
          }}>
          <GripVertical aria-hidden="true" />
        </button>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <strong>{item.title}</strong>
        <div className="sequence-step-actions">
          {item.details && <button type="button" className="sequence-step-view" aria-haspopup="dialog" onClick={() => setViewing({ item, position: index + 1 })} aria-label={`Configurazione del passo ${index + 1}: ${item.title}`} title="Vedi la configurazione"><Eye aria-hidden="true" /></button>}
          {onEdit && <button type="button" className="sequence-step-edit" onClick={() => onEdit(item.id)} aria-label={`Modifica il passo ${index + 1}: ${item.title}`}><Pencil aria-hidden="true" /></button>}
          <button type="button" className="sequence-remove" onClick={() => onRemove(item.id)} aria-label={`Rimuovi ${item.title} dalla sequenza`}><X aria-hidden="true" /></button>
        </div>
      </article>)}
    </div>
    <p className="visually-hidden" role="status">{announcement}</p>
    {positionDialog && selectedIndex >= 0 && <Modal labelledBy={titleId} onClose={() => setPositionDialog(null)} trapFocus onSubmit={(event) => {
      event.preventDefault();
      move(items[selectedIndex], selectedIndex, positionDialog.to);
      setPositionDialog(null);
    }}>
      <ModalTitle id={titleId}>Sposta {items[selectedIndex].title}</ModalTitle>
      <label className="sequence-position-field">Nuova posizione
        <select value={positionDialog.to} onChange={(event) => setPositionDialog({ ...positionDialog, to: Number(event.target.value) })}>
          {items.map((item, index) => <option key={item.id} value={index}>{index + 1} · {item.title}</option>)}
        </select>
      </label>
      <ModalActions onCancel={() => setPositionDialog(null)}><button className="primary-button" disabled={positionDialog.to === selectedIndex || positionDialog.to >= items.length}>Sposta</button></ModalActions>
    </Modal>}
    {viewing && <Modal labelledBy={detailsTitleId} onClose={() => setViewing(null)} closeButton trapFocus>
      <ModalTitle id={detailsTitleId} eyebrow={`PASSO ${viewing.position}`}>{viewing.item.title}</ModalTitle>
      <p className="sequence-step-origin">{viewing.item.custom ? "Personalizzato per questa sequenza" : "Usa il modello del catalogo"}</p>
      <ul className="sequence-step-config">{viewing.item.details?.map(line => <li key={line}>{line}</li>)}</ul>
      <ModalActions onCancel={() => setViewing(null)} cancelLabel="Chiudi">
        {onEdit && <button type="button" className="primary-button" onClick={() => { const id = viewing.item.id; setViewing(null); onEdit(id); }}><Pencil aria-hidden="true" />Modifica il passo</button>}
      </ModalActions>
    </Modal>}
  </>;
}
