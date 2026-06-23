import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { getPublishedPuzzleForRoom } from "../server/socketHandlers";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";

const tmpRoots: string[] = [];

function makeRepository() {
  const root = join(tmpdir(), `turtle-socket-puzzles-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  const db = openDatabase(join(root, "app.sqlite"));
  return { db, repository: createPuzzleRepository(db) };
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("getPublishedPuzzleForRoom", () => {
  it("returns only published puzzles for room creation", () => {
    const { db, repository } = makeRepository();
    repository.upsertManaged({
      ...seedPuzzles[0],
      status: "published",
      hints: [],
      estimatedMinutes: 15,
      qualityScore: 80,
      qualityIssues: [],
      qualitySummary: "可发布",
      publishedAt: "2026-06-23T00:00:00.000Z",
      updatedAt: "2026-06-23T00:00:00.000Z"
    });
    repository.upsertManaged({
      ...seedPuzzles[1],
      status: "reviewing",
      hints: [],
      estimatedMinutes: 15,
      qualityScore: 70,
      qualityIssues: [],
      qualitySummary: "待审核",
      updatedAt: "2026-06-23T00:00:00.000Z"
    });

    expect(getPublishedPuzzleForRoom(repository, "rain-platform").id).toBe("rain-platform");
    expect(() => getPublishedPuzzleForRoom(repository, "cold-cup")).toThrow("题目不存在");
    expect(() => getPublishedPuzzleForRoom(repository, "missing")).toThrow("题目不存在");

    db.close();
  });
});
