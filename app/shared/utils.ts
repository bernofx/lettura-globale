import { type SyllableFilter } from "../domain/syllabification";

export function syllableFilterLabel(filter?: SyllableFilter) {
  if (!filter || filter === "all") return "tutte le sillabe";
  if (filter === "2-3") return "2 o 3 sillabe";
  if (filter === "4+") return "4 o più sillabe";
  return `${filter} sillabe`;
}

export function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}

export function browserRandomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
