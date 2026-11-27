// The editor and its PATCH must agree even when a deployment still uses the historical schema.
export async function hasExerciseCopyColumns(database: D1Database) {
  const count = await database.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('exercises') WHERE name IN ('sequence_id', 'template_exercise_id')").first<number>("n");
  return count === 2;
}
