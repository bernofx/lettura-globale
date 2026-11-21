import { LockKeyhole, Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { type RecoverableSession } from "../../domain/session-recovery";
import { verifyStoredPin } from "../../domain/pin-credentials";
import { type Therapist } from "../../shared/types";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";
import { PinField } from "../../shared/ui/form-controls";

export function SessionExitDialog({ therapist, onCancel, onConfirm }: { therapist: Therapist; onCancel: () => void; onConfirm: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const valid = therapist.pinHash ? await verifyStoredPin(pin, therapist.pinHash) : therapist.pin === pin;
    if (!valid) { setError("PIN non corretto."); return; }
    onConfirm();
  };
  return <Modal labelledBy="session-exit-title" className="protected-exit-modal" onClose={onCancel} onSubmit={submit}>
    <span className="auth-icon"><LockKeyhole /></span>
    <ModalTitle id="session-exit-title" eyebrow="USCITA PROTETTA">Termina la sessione?</ModalTitle>
    <p>Inserisci il PIN di {therapist.firstName} per tornare al pannello.</p>
    <PinField autoFocus value={pin} onChange={(value) => { setPin(value); setError(""); }} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <ModalActions onCancel={onCancel} cancelLabel="Continua l’esercizio">
      <button className="primary-button" type="submit" disabled={!pin}><LockKeyhole />Termina</button>
    </ModalActions>
  </Modal>;
}

export function SessionRecoveryDialog({ saved, childName, onResume, onDiscard }: { saved: RecoverableSession; childName: string; onResume: () => void; onDiscard: () => void }) {
  const position = Math.min(saved.currentIndex + 1, saved.plan.length);
  return <Modal labelledBy="session-recovery-title" className="recovery-modal">
    <span className="auth-icon"><RefreshCw /></span>
    <ModalTitle id="session-recovery-title" eyebrow="SESSIONE INTERROTTA">Riprendere da dove eri rimasto?</ModalTitle>
    <p><strong>{saved.descriptor.title}</strong> con {childName}, passaggio {position} di {saved.plan.length}.</p>
    <ModalActions onCancel={onDiscard} cancelLabel="Scarta">
      <button className="primary-button" type="button" onClick={onResume}><Play />Riprendi</button>
    </ModalActions>
  </Modal>;
}

export function UnavailableExercise({ onExit }: { onExit: () => void }) {
  return <main className="auth-page"><section className="login-card" role="alert"><h1>Esercizio incompleto</h1><p>La parola o una delle immagini non è disponibile. Controlla la configurazione prima di riprovare.</p><button className="primary-button" onClick={onExit}>Chiudi attività</button></section></main>;
}
