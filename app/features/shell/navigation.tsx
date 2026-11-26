import { BarChart3, BookOpenCheck, ChevronRight, Gamepad2, Home, Library, LogOut, Menu, MessageSquareText, Palette, Play, Settings, UserCog, UserRound } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { type InterfaceStyle } from "../../domain/appearance";
import { AppVersionBadge } from "../../components/app-update";
import { backendStatusInfo } from "../../shared/cloud-client";
import { type BackendStatus, type ChildProfile, type Therapist, type View } from "../../shared/types";

/** Every view reachable from the menu or history, including the settings tabs. */
export const appViews: View[] = ["home", "library", "exercises", "session", "games", "caa", "stats", "profiles", "appearance"];
/** Views grouped under one menu entry and switched with tabs. */
export const settingsViews: { id: View; label: string; icon: typeof Home }[] = [
  { id: "profiles", label: "Profili", icon: UserCog },
  { id: "appearance", label: "Aspetto", icon: Palette },
];

const navItems: { id: View; label: string; icon: typeof Home; group?: View[] }[] = [
  { id: "home", label: "Oggi", icon: Home },
  { id: "library", label: "Libreria", icon: Library },
  { id: "exercises", label: "Esercizi", icon: BookOpenCheck },
  { id: "session", label: "Sessione", icon: Play },
  { id: "games", label: "Giochi", icon: Gamepad2 },
  { id: "caa", label: "Storie in CAA", icon: MessageSquareText },
  { id: "stats", label: "Progressi", icon: BarChart3 },
  { id: "profiles", label: "Impostazioni", icon: Settings, group: settingsViews.map(item => item.id) },
];

export function SettingsTabs({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  return <div className="page settings-tabs-row"><nav className="settings-tabs" aria-label="Impostazioni">
    {settingsViews.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={view === id ? "selected" : ""} aria-current={view === id ? "page" : undefined} onClick={() => onNavigate(id)}><Icon size={18} aria-hidden="true" />{label}</button>)}
  </nav></div>;
}

const studioNavigation = [
  { heading: "Lavoro", items: ["home", "session", "exercises", "stats"] },
  { heading: "Contenuti", items: ["library", "caa", "games"] },
  { heading: null, items: ["profiles"] },
] as const satisfies ReadonlyArray<{ heading: string | null; items: readonly View[] }>;

export function Sidebar({ view, onNavigate, open, onClose, therapist, onLogout, backendStatus, interfaceStyle }: { view: View; onNavigate: (view: View) => void; open: boolean; onClose: () => void; therapist: Therapist; onLogout: () => void; backendStatus: BackendStatus; interfaceStyle: InterfaceStyle }) {
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.querySelector<HTMLButtonElement>(".topbar .menu-button");
    const nav = sidebar.current;
    const initial = nav?.querySelector<HTMLButtonElement>(".nav-item.active") ?? nav?.querySelector<HTMLButtonElement>(".nav-item");
    initial?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, [open]);
  const initials = `${therapist.firstName[0] ?? ""}${therapist.lastName[0] ?? ""}`;
  const status = backendStatusInfo(backendStatus);
  const renderItem = ({ id, label, icon: Icon, group }: (typeof navItems)[number]) => {
    const active = view === id || group?.includes(view);
    return <button key={id} type="button" data-area={id} className={active ? "nav-item active" : "nav-item"}
      aria-current={active ? "page" : undefined} onClick={() => onNavigate(id)}>
      <Icon size={20} strokeWidth={2} aria-hidden="true" /><span>{label}</span>
    </button>;
  };

  return <>
    {open && <button type="button" className="sidebar-backdrop" onClick={onClose} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} aria-label="Chiudi menu" />}
    <aside ref={sidebar} id="main-navigation" className={`sidebar ${open ? "open" : ""}`} onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }}>
      <div className="brand"><span className="brand-mark brand-logo" aria-hidden="true" /><span>Lettura<br /><strong>Globale</strong></span></div>
      <nav aria-label="Navigazione principale">
        {interfaceStyle === "studio" ? studioNavigation.map(({ heading, items }) => <Fragment key={items[0]}>
          {heading && <p className="nav-section">{heading}</p>}
          {items.map((id) => {
            const item = navItems.find((entry) => entry.id === id);
            return item && renderItem(item);
          })}
        </Fragment>) : navItems.map(renderItem)}
      </nav>
      {/* The top bar always shows the status; the menu adds the explanation only when something needs attention. */}
      {status.tone !== "ready" && <div className={`sidebar-note cloud-status-${status.tone}`}><span className="status-dot" /><div><strong>{status.label}</strong><small>{status.detail}</small></div></div>}
      <div className="profile-card"><button type="button" onClick={() => onNavigate("profiles")}><span className="avatar">{initials}</span><span><strong>{therapist.firstName}</strong><small>{therapist.role}</small></span><Settings size={17} /></button><button type="button" className="logout-button" onClick={onLogout} aria-label="Esci"><LogOut size={16} /></button></div>
    </aside>
  </>;
}

export function Topbar({ menuOpen, onMenu, therapist, child, childProfiles, onSelectChild, onOpenProfiles, backendStatus, onOpenSaveJournal }: { menuOpen: boolean; onMenu: () => void; therapist: Therapist; child: ChildProfile; childProfiles: ChildProfile[]; onSelectChild: (id: string) => void; onOpenProfiles: () => void; backendStatus: BackendStatus; onOpenSaveJournal: () => void }) {
  const status = backendStatusInfo(backendStatus);
  return <header className="topbar"><button className="icon-button menu-button" onClick={onMenu} aria-expanded={menuOpen} aria-controls="main-navigation" aria-label="Apri menu"><Menu /></button><label className="child-pill"><span className="child-avatar" style={{ background: child.avatarColor }}>{child.firstName[0]}</span><span><small>Profilo attivo</small><strong>{child.firstName}</strong></span><select value={child.id} onChange={(event) => onSelectChild(event.target.value)} aria-label="Cambia bambino">{childProfiles.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select><ChevronRight size={16} /></label><div className="topbar-right"><AppVersionBadge /><button type="button" className={`cloud-indicator cloud-status-${status.tone}`} onClick={onOpenSaveJournal} aria-label={`${status.label}. Apri diagnosi salvataggi`} title={`${status.label} — Apri diagnosi salvataggi`}><i className="status-dot" aria-hidden="true" /><span>{status.label}</span></button><button className="icon-button" onClick={onOpenProfiles} aria-label={`Profilo di ${therapist.firstName}`}><UserRound /></button></div></header>;
}
