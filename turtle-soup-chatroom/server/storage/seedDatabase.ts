import type { AppDatabase } from "./database";
import { createPuzzleRepository } from "./puzzleRepository";
import type { ManagedPuzzle, Puzzle } from "../../src/shared/types";

function toManagedSeedPuzzle(puzzle: Puzzle): ManagedPuzzle {
  const now = new Date().toISOString();
  return {
    ...puzzle,
    status: "published",
    hints: [],
    estimatedMinutes: 15,
    qualityScore: 80,
    qualityIssues: [],
    qualitySummary: "初始内置题库",
    publishedAt: puzzle.createdAt,
    updatedAt: now
  };
}

export function seedPuzzleDatabase(db: AppDatabase, puzzles: Puzzle[]) {
  const existing = db.prepare("select count(*) as count from puzzles").get() as { count: number };
  if (existing.count > 0) return;

  const repository = createPuzzleRepository(db);
  const insert = db.transaction(() => {
    for (const puzzle of puzzles) {
      repository.upsertManaged(toManagedSeedPuzzle(puzzle));
    }
  });
  insert();
}
