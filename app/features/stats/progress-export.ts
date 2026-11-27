import { androidBridge } from "../../domain/android-bridge";
import type { SessionHistoryRecord } from "../../domain/session-history";
import { buildExcelProgressCsv } from "../../domain/progress-csv";
import { type Attempt, type LibraryItem } from "../../shared/types";
import type { ProgressExercise } from "../../domain/progress-data";

export function downloadProgressCsv(attempts: Attempt[], exercises: ProgressExercise[], library: LibraryItem[], histories: SessionHistoryRecord[]) {
  const blob = new Blob([buildExcelProgressCsv(attempts, { exercises, library, histories })], { type: "text/csv;charset=utf-16le" });
  const native = androidBridge();
  if (native) {
    if (blob.size > 5_900_000) { window.alert("Esportazione troppo grande per l’app: usa il browser sul PC."); return; }
    const reader = new FileReader();
    reader.onload = () => native.saveCsv(String(reader.result).split(",")[1]);
    reader.onerror = () => window.alert("Esportazione CSV non riuscita.");
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "lettura-globale-progressi.csv"; link.click(); URL.revokeObjectURL(url);
}
