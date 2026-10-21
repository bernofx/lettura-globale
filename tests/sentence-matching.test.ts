import assert from "node:assert/strict";
import test from "node:test";
import { createSentenceMatchingRounds, sentenceMatchingAvailability } from "../app/domain/sentence-matching.ts";

const scenes = ["gatto", "cane", "bimbo", "mamma"].flatMap((subject) => ["mangia", "dorme", "corre", "salta", "gioca"].map((verb) => ({
  id: `${subject}-${verb}`,
  contentKind: "sentence" as const,
  phraseStructure: "subject-verb" as const,
  subject,
  verb,
  image: `/${subject}-${verb}.webp`,
})));

test("un grado con due immagini mantiene il soggetto e cambia il verbo", () => {
  const rounds = createSentenceMatchingRounds(scenes, { rounds: 3, optionCount: 2, difficulty: 1 }, () => 0.4);
  assert.equal(rounds.length, 3);
  for (const round of rounds) {
    const prompt = scenes.find((item) => item.id === round.promptId)!;
    const distractor = scenes.find((item) => item.id === round.optionIds.find((id) => id !== prompt.id))!;
    assert.equal(distractor.subject, prompt.subject);
    assert.notEqual(distractor.verb, prompt.verb);
  }
});

test("due gradi producono una matrice completa due soggetti per due verbi", () => {
  const [round] = createSentenceMatchingRounds(scenes, { rounds: 1, optionCount: 4, difficulty: 2 }, () => 0.3);
  const options = round.optionIds.map((id) => scenes.find((item) => item.id === id)!);
  assert.equal(new Set(options.map((item) => item.subject)).size, 2);
  assert.equal(new Set(options.map((item) => item.verb)).size, 2);
  assert.equal(new Set(options.map((item) => `${item.subject}:${item.verb}`)).size, 4);
});

test("rifiuta due gradi con due immagini o pool senza matrice", () => {
  assert.equal(sentenceMatchingAvailability(scenes, { rounds: 1, optionCount: 2, difficulty: 2 }).valid, false);
  assert.equal(sentenceMatchingAvailability(scenes.filter((item) => item.subject === "gatto"), { rounds: 1, optionCount: 4, difficulty: 2 }).valid, false);
});

test("ignora parole, scene senza immagine e struttura col complemento", () => {
  const invalid = [
    { ...scenes[0], contentKind: "word" as const },
    { ...scenes[1], image: undefined },
    { ...scenes[2], phraseStructure: "subject-verb-complement" as const, complement: "la palla" },
  ];
  assert.equal(sentenceMatchingAvailability(invalid, { rounds: 1, optionCount: 2, difficulty: 1 }).poolCount, 0);
});
