import { openDatabase } from "../server/storage/database.ts";
import { createPuzzleRepository } from "../server/storage/puzzleRepository.ts";
import { analyzePuzzleTagsWithAi, normalizePuzzleTags } from "../server/puzzleTags.ts";

function databasePath() {
  const fromEnv = process.env.DATABASE_PATH || process.env.DATABASE_URL || "file:./data/app.sqlite";
  return fromEnv.startsWith("file:") ? fromEnv.slice("file:".length) : fromEnv;
}

export async function normalizePuzzleTagsDatabase({ dbPath = databasePath(), write = false, status, ai = false } = {}) {
  const db = openDatabase(dbPath);
  const repository = createPuzzleRepository(db);
  const puzzles = repository.listManaged(status);
  let changed = 0;
  let unchanged = 0;
  const changes = [];

  for (const puzzle of puzzles) {
    const nextTags = ai
      ? await analyzePuzzleTagsWithAi({
        title: puzzle.title,
        difficulty: puzzle.difficulty,
        surface: puzzle.surface,
        truth: puzzle.truth
      })
      : normalizePuzzleTags({
        tags: puzzle.tags,
        difficulty: puzzle.difficulty,
        surface: puzzle.surface,
        truth: puzzle.truth
      });
    if (JSON.stringify(nextTags) === JSON.stringify(puzzle.tags)) {
      unchanged += 1;
      continue;
    }
    changed += 1;
    changes.push({ id: puzzle.id, title: puzzle.title, before: puzzle.tags, after: nextTags });
    if (write) {
      repository.updateTags(puzzle.id, nextTags);
    }
  }

  db.close();
  return { changed, unchanged, changes };
}

function parseArgs(argv) {
  const options = { dbPath: databasePath(), write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--db" && value) {
      options.dbPath = value;
      index += 1;
    } else if (arg === "--status" && value) {
      options.status = value;
      index += 1;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--ai") {
      options.ai = true;
    }
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await normalizePuzzleTagsDatabase(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    mode: process.argv.includes("--write") ? "write" : "dry-run",
    analyzer: process.argv.includes("--ai") ? "ai" : "local",
    changed: result.changed,
    unchanged: result.unchanged,
    preview: result.changes.slice(0, 20)
  }, null, 2));
}
