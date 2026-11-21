import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

type ModalProps = {
  /** id of the element that names the dialog (usually the `ModalTitle`). */
  labelledBy?: string;
  /** Extra classes for the panel, e.g. `wide`, `delete-modal`. */
  className?: string;
  /** Called on Escape and by the optional close button. */
  onClose?: () => void;
  /** Renders the top-right “Chiudi” button (requires `onClose`). */
  closeButton?: boolean;
  /** When set, the panel is a `<form>` and submits through this handler. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
};

/**
 * Shared modal shell: overlay, dialog semantics, Escape to close, initial focus
 * inside the panel and focus restoration on close. Visual styles stay in the
 * existing `.modal-layer` / `.modal` CSS.
 */
export function Modal({ labelledBy, className, onClose, closeButton = false, onSubmit, children }: ModalProps) {
  const panel = useRef<HTMLDivElement & HTMLFormElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panel.current;
    if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const panelClass = ["modal", className].filter(Boolean).join(" ");
  const content = <>
    {closeButton && onClose && <button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button>}
    {children}
  </>;
  return <div
    className="modal-layer"
    role="dialog"
    aria-modal="true"
    aria-labelledby={labelledBy}
    onKeyDown={(event) => {
      if (event.key !== "Escape" || !onCloseRef.current) return;
      event.stopPropagation();
      onCloseRef.current();
    }}
  >
    {onSubmit
      ? <form ref={panel} className={panelClass} tabIndex={-1} onSubmit={onSubmit}>{content}</form>
      : <div ref={panel} className={panelClass} tabIndex={-1}>{content}</div>}
  </div>;
}

/** Eyebrow + dialog heading, linked to the modal through `id`. */
export function ModalTitle({ id, eyebrow, children }: { id: string; eyebrow?: ReactNode; children: ReactNode }) {
  return <>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={id}>{children}</h2></>;
}

/** Footer with the secondary “Annulla” action followed by the primary actions. */
export function ModalActions({ onCancel, cancelLabel = "Annulla", cancelDisabled, children }: { onCancel?: () => void; cancelLabel?: ReactNode; cancelDisabled?: boolean; children?: ReactNode }) {
  return <div className="modal-actions">
    {onCancel && <button className="ghost-button" type="button" disabled={cancelDisabled} onClick={onCancel}>{cancelLabel}</button>}
    {children}
  </div>;
}

type ConfirmDialogProps = {
  labelledBy: string;
  eyebrow: ReactNode;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Destructive confirmation used for deletions and archiving. */
export function ConfirmDialog({ labelledBy, eyebrow, title, children, confirmLabel, onCancel, onConfirm }: ConfirmDialogProps) {
  return <Modal labelledBy={labelledBy} className="delete-modal" onClose={onCancel}>
    <span className="delete-icon"><AlertTriangle /></span>
    <ModalTitle id={labelledBy} eyebrow={eyebrow}>{title}</ModalTitle>
    {children}
    <ModalActions onCancel={onCancel}>
      <button className="danger-button solid" type="button" onClick={onConfirm}><Trash2 />{confirmLabel}</button>
    </ModalActions>
  </Modal>;
}
