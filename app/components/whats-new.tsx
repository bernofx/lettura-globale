import { APP_VERSION } from "../app-version";
import { RELEASE_NOTES } from "../release-notes";

export function WhatsNew() {
  return <details className="whats-new"><summary><span>Novità dell’ultima versione</span><small>v{APP_VERSION}</small></summary><div><h3>{RELEASE_NOTES.title}</h3><ul>{RELEASE_NOTES.items.map((item) => <li key={item}>{item}</li>)}</ul></div></details>;
}
