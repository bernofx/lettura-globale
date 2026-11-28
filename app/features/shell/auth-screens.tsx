import { AlertTriangle, BookOpenCheck, Check, ChevronRight, KeyRound, LogOut, RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useRef, useState } from "react";
import { createPersistentTherapistSession, THERAPIST_SESSION_STORAGE_KEY } from "../../domain/therapist-session";
import { cloudLoginErrorMessage, loginToCloud } from "../../domain/cloud-auth-client";
import { fetchWithTimeout } from "../../shared/cloud-client";
import { type ChildProfile, type Therapist } from "../../shared/types";
import { PinField } from "../../shared/ui/form-controls";

export function LoadingScreen({ label, stalled = false, onRetry, onContinueLocal }: { label: string; stalled?: boolean; onRetry?: () => void; onContinueLocal?: () => void }) {
  return <main className="auth-loading"><Sparkles /><span>{label}</span>{stalled && <div className="loading-recovery"><p>Il caricamento sta richiedendo più tempo del previsto.</p><div>{onContinueLocal && <button className="ghost-button" type="button" onClick={onContinueLocal}>Usa i dati locali</button>}<button className="primary-button" type="button" onClick={onRetry ?? (() => window.location.reload())}><RefreshCw />Riprova</button></div></div>}</main>;
}

export function PublicPreviewError() {
  return <main className="auth-page public-preview-error"><section className="login-card"><div className="auth-icon"><AlertTriangle /></div><span className="eyebrow">ANTEPRIMA</span><h1>Link non disponibile</h1><p>Questa anteprima è incompleta, scaduta o non disponibile. Chiedi a chi l’ha creata di controllare gli esercizi e generare un nuovo link.</p><button className="primary-button large" onClick={() => { window.history.replaceState({}, "", "/"); window.location.reload(); }}>Torna alla home</button></section></main>;
}

export function PublicPreviewDone({ onRestart }: { onRestart: () => void }) {
  return <main className="auth-page public-preview-error public-preview-done"><section className="login-card"><div className="auth-icon"><Check /></div><span className="eyebrow">ANTEPRIMA</span><h1>Anteprima completata</h1><p>Hai terminato gli esercizi condivisi. Puoi chiudere questa pagina oppure ricominciare dall’inizio.</p><button className="primary-button large" onClick={onRestart}><RefreshCw />Ricomincia</button></section></main>;
}

export function PublicLanding({ onLogin }: { onLogin: () => void }) {
  return <main className="auth-page public-landing"><section className="auth-brand"><span className="brand-mark brand-logo large" aria-hidden="true" /><span>Lettura <strong>Globale</strong></span><h1>Imparare a leggere, una parola alla volta.</h1><p>Attività visive semplici e personalizzabili per accompagnare bambini, terapisti e famiglie.</p></section><section className="login-card welcome-card"><div className="auth-icon"><BookOpenCheck /></div><span className="eyebrow">AREA RISERVATA</span><h2>Pronto per iniziare?</h2><p>Accedi con il tuo profilo adulto per aprire il pannello, scegliere il bambino e avviare gli esercizi.</p><button className="primary-button large" onClick={onLogin}><KeyRound />Accedi al pannello</button><div className="welcome-points"><span><Check />Lettura globale con immagini e parole</span><span><Check />Esercizi IL / LA</span><span><Check />Progressi e aiuti registrati</span></div></section></main>;
}

export function TherapistLogin({ defaultEmail, onBack }: { defaultEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(defaultEmail);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const therapistId = await loginToCloud((input, init) => fetchWithTimeout(input, init, 10_000), email, pin);
      localStorage.setItem(THERAPIST_SESSION_STORAGE_KEY, createPersistentTherapistSession(therapistId));
      // Reload the authenticated, role-filtered cloud state; do not retain the
      // previous adult's in-memory view or reinterpret local PINs as a login.
      window.location.reload();
    } catch (error) {
      setError(cloudLoginErrorMessage(error));
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  return <main className="auth-page"><section className="auth-brand"><span className="brand-mark brand-logo large" aria-hidden="true" /><span>Lettura <strong>Globale</strong></span><p>Uno spazio semplice per preparare e guidare le attività di lettura.</p></section><section className="login-card"><button className="text-button login-back" type="button" onClick={onBack}>← Torna alla pagina iniziale</button><div className="auth-icon"><ShieldCheck /></div><span className="eyebrow">ACCESSO ADULTO</span><h1>Accedi al pannello</h1><p>Scegli il bambino associato dopo l’accesso.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="username" required /></label><PinField value={pin} onChange={(value) => { setPin(value); setError(""); }} placeholder="••••" />{error && <div className="login-error" role="alert">{error}</div>}<button className="primary-button large" type="submit" disabled={submitting}><KeyRound />{submitting ? "Accesso…" : "Accedi"}</button></form><small className="auth-disclaimer">L’accesso collega questo dispositivo ai dati salvati nel cloud.</small></section></main>;
}

export function ChildChooser({ therapist, childProfiles, onChoose, onLogout, onCaa, onGames }: { therapist: Therapist; childProfiles: ChildProfile[]; onChoose: (id: string) => void; onLogout: () => void; onCaa: () => void; onGames: () => void }) {
  const available = childProfiles.filter((child) => therapist.childIds.includes(child.id));
  return <main className="auth-page child-choice-page"><section className="login-card wide-choice"><span className="eyebrow">PROFILO ATTIVO</span><h1>Con chi lavori oggi?</h1><p>Sono mostrati soltanto i bambini associati a {therapist.firstName}.</p><div className="child-choice-grid">{available.map((child) => <button key={child.id} onClick={() => onChoose(child.id)}><span className="profile-avatar" style={{ background: child.avatarColor }}>{child.firstName.slice(0, 1)}</span><strong>{child.firstName} {child.lastName}</strong><small>Anno {child.birthYear}</small><ChevronRight /></button>)}</div>{!available.length && <div className="empty-mini"><Users /><p>Nessun bambino associato.</p><small>Il profilo dovrà essere collegato dall’amministratore.</small></div>}<button className="primary-button" onClick={onCaa}>Apri Storie in CAA senza scegliere un bambino</button><button className="ghost-button" onClick={onGames}>Apri Giochi</button><button className="text-button" onClick={onLogout}><LogOut />Esci</button></section></main>;
}
