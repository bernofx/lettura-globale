import { BarChart3, BookOpenCheck, ChevronRight, Gamepad2, Home, Library, LogOut, Menu, Palette, Play, Settings, UserCog, UserRound } from "lucide-react";
import { AppVersionBadge } from "../../components/app-update";
import { backendStatusInfo } from "../../shared/cloud-client";
import { type BackendStatus, type ChildProfile, type Therapist, type View } from "../../shared/types";

export const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Oggi", icon: Home },
  { id: "library", label: "Libreria", icon: Library },
  { id: "exercises", label: "Configurazione", icon: BookOpenCheck },
  { id: "session", label: "Sessione", icon: Play },
  { id: "games", label: "Giochi", icon: Gamepad2 },
  { id: "caa", label: "Storie in CAA", icon: BookOpenCheck },
  { id: "stats", label: "Progressi", icon: BarChart3 },
  { id: "appearance", label: "Aspetto", icon: Palette },
  { id: "profiles", label: "Profili", icon: UserCog },
];

export function Sidebar({ view, onNavigate, open, onClose, therapist, onLogout, backendStatus }: { view: View; onNavigate: (view: View) => void; open: boolean; onClose: () => void; therapist: Therapist; onLogout: () => void; backendStatus: BackendStatus }) {
  const initials = `${therapist.firstName[0] ?? ""}${therapist.lastName[0] ?? ""}`;
  const status = backendStatusInfo(backendStatus);
  return <>{open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Chiudi menu" />}<aside className={`sidebar ${open ? "open" : ""}`}><div className="brand"><span className="brand-mark brand-logo" aria-hidden="true" /><span>Lettura<br /><strong>Globale</strong></span></div><nav aria-label="Navigazione principale">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => onNavigate(id)}><Icon size={20} strokeWidth={2} /><span>{label}</span></button>)}</nav>{/* The top bar always shows the status; the menu adds the explanation only when something needs attention. */}{status.tone !== "ready" && <div className={`sidebar-note cloud-status-${status.tone}`}><span className="status-dot" /><div><strong>{status.label}</strong><small>{status.detail}</small></div></div>}<div className="profile-card"><button onClick={() => onNavigate("profiles")}><span className="avatar">{initials}</span><span><strong>{therapist.firstName}</strong><small>{therapist.role}</small></span><Settings size={17} /></button><button className="logout-button" onClick={onLogout} aria-label="Esci"><LogOut size={16} /></button></div></aside></>;
}

export function Topbar({ onMenu, therapist, child, childProfiles, onSelectChild, onOpenProfiles, backendStatus, onOpenSaveJournal }: { onMenu: () => void; therapist: Therapist; child: ChildProfile; childProfiles: ChildProfile[]; onSelectChild: (id: string) => void; onOpenProfiles: () => void; backendStatus: BackendStatus; onOpenSaveJournal: () => void }) {
  const status = backendStatusInfo(backendStatus);
  return <header className="topbar"><button className="icon-button menu-button" onClick={onMenu} aria-label="Apri menu"><Menu /></button><label className="child-pill"><span className="child-avatar" style={{ background: child.avatarColor }}>{child.firstName[0]}</span><span><small>Profilo attivo</small><strong>{child.firstName}</strong></span><select value={child.id} onChange={(event) => onSelectChild(event.target.value)} aria-label="Cambia bambino">{childProfiles.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select><ChevronRight size={16} /></label><div className="topbar-right"><AppVersionBadge /><button type="button" className={`cloud-indicator cloud-status-${status.tone}`} onClick={onOpenSaveJournal} aria-label={`${status.label}. Apri diagnosi salvataggi`} title={`${status.label} — Apri diagnosi salvataggi`}><i className="status-dot" aria-hidden="true" /><span>{status.label}</span></button><button className="icon-button" onClick={onOpenProfiles} aria-label={`Profilo di ${therapist.firstName}`}><UserRound /></button></div></header>;
}
