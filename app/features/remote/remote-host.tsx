import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { type RemoteHostState } from "../../use-remote-session-host";

/* QRCode generates an in-memory data URL; Next Image cannot optimize this transient asset. */
/* eslint-disable @next/next/no-img-element */
export function ReadyPairing({ host }: { host: RemoteHostState }) {
  return <aside className="ready-pairing" aria-label="Collega il telefono con un codice QR">
    {host.qrDataUrl ? <img src={host.qrDataUrl} width={240} height={240} alt="Scansiona per collegare il telefono e avviare la sessione" /> : <span role="status">{host.status === "error" ? host.error : "Preparazione QR…"}</span>}
    {host.qrDataUrl && <small role="status">{host.status === "connected" ? "Telefono collegato · puoi premere Inizia" : "Scansiona per collegare il telefono"}</small>}
    {host.status === "error" && <button type="button" className="ghost-button" onClick={() => void host.refreshPairing()}>Rigenera QR</button>}
  </aside>;
}

export function RemoteHostBadge({ host }: { host: RemoteHostState }) {
  const [panel, setPanel] = useState<{ open: boolean; status: RemoteHostState["status"] }>({ open: false, status: host.status });
  if (panel.status !== host.status) setPanel({ open: host.status === "connected" ? false : panel.open, status: host.status });
  const panelOpen = panel.open;
  const statusLabel = host.status === "connected" ? "Telefono collegato"
    : host.status === "lost" ? "Connessione persa · controlli sul PC"
      : host.status === "pending" ? "Telefono in attesa di approvazione"
        : host.status === "creating" ? "Creazione QR…"
          : host.status === "error" ? "Controller non disponibile"
            : "Scansiona per collegare il telefono";
  return <div className={`session-phone-control remote-${host.status}`}>
    <button type="button" className="session-phone-dot" title={statusLabel} aria-label={statusLabel} onClick={() => setPanel((current) => ({ open: !current.open, status: host.status }))} aria-expanded={panelOpen}>
      <span className="remote-status-dot" aria-hidden="true" />
    </button>
    {panelOpen && <div className="remote-host-panel">
      {host.qrDataUrl && <img src={host.qrDataUrl} alt="QR per aprire la console adulta sul telefono" />}
      <div><strong>{statusLabel}</strong><p>{host.status === "connected" ? "L’avanzamento è controllato dal telefono." : host.status === "lost" ? "La sessione continua con i controlli locali finché il telefono non torna online." : "Apri il QR da un telefono e accedi con il profilo adulto."}</p></div>
      {host.status === "error" && <><small>{host.error}</small><button className="ghost-button" type="button" onClick={() => void host.refreshPairing()}><RefreshCw />Riprova</button></>}
      {(host.status === "waiting" || host.status === "lost" || host.status === "connected") && <button className="ghost-button" type="button" onClick={() => {
        if (host.status !== "connected" || window.confirm("Generare un nuovo QR? Il telefono collegato verrà disconnesso.")) void host.refreshPairing();
      }}><RefreshCw />{host.status === "connected" ? "Sostituisci telefono" : "Genera nuovo QR"}</button>}
    </div>}
  </div>;
}

/* eslint-enable @next/next/no-img-element */
