/** Synthetic data only; never load an account export into performance tests. */
export function statePerformanceFixture(turns = 1000) {
  const createdAt = "2026-10-20T10:00:00.000Z";
  const library = Array.from({ length: 40 }, (_, index) => ({ id: `word-${index}`, word: `Demo ${index}`, category: "Demo", emoji: "⭐", source: "Test", license: "Test", author: "Test" }));
  const attempts = Array.from({ length: turns }, (_, index) => ({
    id: `attempt-${index}`, sessionId: `session-${Math.floor(index / 10)}`, sessionItemId: `turn-${index}`, exerciseId: "exercise", wordId: library[index % 40].id,
    answerId: library[index % 40].id, optionIds: library.slice(0, 4).map((item) => item.id), correct: true, firstAttempt: true,
    mode: "test", createdAt, childId: "child", therapistId: "adult",
  }));
  const sessionHistory = Array.from({ length: Math.ceil(turns / 10) }, (_, index) => ({
    id: `session-${index}`, childId: "child", therapistId: "adult", title: "Demo", source: "sequence", mode: "test", presentation: "images", startedAt: createdAt, completedAt: createdAt, comment: "",
    items: attempts.slice(index * 10, index * 10 + 10).map((attempt) => ({
      id: attempt.sessionItemId, exerciseId: "exercise", exerciseTitle: "Demo", kind: "recognition", firstCorrect: true,
      target: { itemId: attempt.wordId, word: "Demo", category: "Demo" }, options: library.slice(0, 4).map((item) => ({ itemId: item.id, word: item.word, category: item.category })),
      responses: [{ answerId: attempt.answerId, label: "Demo", correct: true, firstAttempt: true, createdAt }], helpLabels: ["Gesto"],
    })),
  }));
  return {
    schemaVersion: 1, therapists: [{ id: "adult", firstName: "Demo", lastName: "", email: "adult@example.test", role: "Terapista", childIds: ["child"] }],
    children: [{ id: "child", firstName: "Demo", lastName: "", birthYear: "", notes: "", avatarColor: "#fff" }], activeChildId: "child",
    library, exercises: [{ id: "exercise", title: "Demo", kind: "recognition", promptId: "word-0", optionIds: library.slice(0, 4).map((item) => item.id) }],
    sequences: [{ id: "sequence", title: "Demo", therapistId: "adult", exerciseIds: ["exercise"] }], attempts, helps: [], sessionHistory,
  };
}
