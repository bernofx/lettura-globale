// A word's overall status from first attempts in the chosen mode. The thresholds match the
// colour key of the progress table; fewer than three attempts are not a trend yet.
export type WordProgressStatus = "secure" | "growing" | "reinforce" | "few";

export const MIN_ATTEMPTS_FOR_STATUS = 3;

export const wordProgressStatusLabels: Record<WordProgressStatus, string> = {
  secure: "Sicura",
  growing: "In crescita",
  reinforce: "Da rinforzare",
  few: "Pochi dati",
};

export function wordProgressStatus(correct: number, total: number): WordProgressStatus {
  if (total < MIN_ATTEMPTS_FOR_STATUS) return "few";
  const percent = (correct / total) * 100;
  if (percent >= 80) return "secure";
  if (percent >= 50) return "growing";
  return "reinforce";
}
