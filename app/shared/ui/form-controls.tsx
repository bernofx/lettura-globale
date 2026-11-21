import type { ReactNode } from "react";

/** Checkbox with a bold title and a short explanation underneath. */
export function CheckLine({ checked, onChange, title, detail, className, disabled }: { checked: boolean; onChange: (checked: boolean) => void; title: ReactNode; detail?: ReactNode; className?: string; disabled?: boolean }) {
  return <label className={["check-line", className].filter(Boolean).join(" ")}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
  </label>;
}

/** Adult PIN input: digits only, up to 8, masked, with password-manager hints. */
export function PinField({ value, onChange, autoFocus, placeholder }: { value: string; onChange: (pin: string) => void; autoFocus?: boolean; placeholder?: string }) {
  return <label>PIN<input
    autoFocus={autoFocus}
    type="password"
    inputMode="numeric"
    maxLength={8}
    value={value}
    onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
    autoComplete="current-password"
    placeholder={placeholder}
    required
  /></label>;
}
