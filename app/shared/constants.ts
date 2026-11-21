import { type SessionActivity } from "../domain/session-compilation";
import { type Exercise } from "./types";

export const helpTypes = ["Indicazione verbale", "Gesto", "Riduci le opzioni", "Evidenzia", "Dimostrazione"];

export const exerciseKind = (exercise: Exercise): SessionActivity => exercise.kind ?? "recognition";

export const libraryCategories = ["Azioni", "Animali", "Parti del corpo", "Vestiti", "Oggetti della natura", "Cibi", "Casa", "Trasporti", "Oggetti", "Scuola", "Luoghi", "Giochi", "Persone", "Altro"];

/** How long the adult must hold “Termina” to leave a running session. */
export const PROTECTED_EXIT_HOLD_MS = 2_000;
export const PROTECTED_EXIT_HOLD_HINT = `Per uscire tieni premuto Termina per ${PROTECTED_EXIT_HOLD_MS / 1000} secondi`;
