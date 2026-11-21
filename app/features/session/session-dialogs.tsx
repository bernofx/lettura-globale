import { LockKeyhole, Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { type RecoverableSession } from "../../domain/session-recovery";
import { verifyStoredPin } from "../../domain/pin-credentials";
import { type Therapist } from "../../shared/types";

export function SessionExitDialog({ therapist, onCancel, onConfirm }: { therapist: Therapist; onCancel: () => void; onConfirm: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const valid = therapist.pinHash ? await verifyStoredPin(pin, therapist.pinHash) : therapist.pin === pin;
    if (!valid) { setError("PIN non corretto."); return; }
    onConfirm();
  };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="session-exit-title"><form className="modal protected-exit-modal" onSubmit={submit}><span className="auth-icon"><LockKeyhole /></span><span className="eyebrow">USCITA PROTETTA</span><h2 id="session-exit-title">Termina la sessione?</h2><p>Inserisci il PIN di {therapist.firstName} per tornare al pannello.</p><label>PIN<input autoFocus type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(""); }} autoComplete="current-password" /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="ghost-button" type="button" onClick={onCancel}>Continua l’esercizio</button><button className="primary-button" type="submit" disabled={!pin}><LockKeyhole />Termina</button></div></form></div>;
}

export function SessionRecoveryDialog({ saved, childName, onResume, onDiscard }: { saved: RecoverableSession; childName: string; onResume: () => void; onDiscard: () => void }) {
  const position = Math.min(saved.currentIndex + 1, saved.plan.length);
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="session-recovery-title"><div className="modal recovery-modal"><span className="auth-icon"><RefreshCw /></span><span className="eyebrow">SESSIONE INTERROTTA</span><h2 id="session-recovery-title">Riprendere da dove eri rimasto?</h2><p><strong>{saved.descriptor.title}</strong> con {childName}, passaggio {position} di {saved.plan.length}.</p><div className="modal-actions"><button className="ghost-button" type="button" onClick={onDiscard}>Scarta</button><button className="primary-button" type="button" onClick={onResume}><Play />Riprendi</button></div></div></div>;
}

export function UnavailableExercise({ onExit }: { onExit: () => void }) {
  return <main className="auth-page"><section className="login-card" role="alert"><h1>Esercizio incompleto</h1><p>La parola o una delle immagini non è disponibile. Controlla la configurazione prima di riprovare.</p><button className="primary-button" onClick={onExit}>Chiudi attività</button></section></main>;
}
