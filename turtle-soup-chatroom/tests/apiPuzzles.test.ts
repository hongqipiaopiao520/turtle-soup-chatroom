import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { listPublicPuzzles } from "../server/app";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";

const tmpRoots: string[] = [];

function makeRepository() {
  const root = join(tmpdir(), `turtle-api-puzzles-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

describe("/api/puzzles", () => {
  it("returns published puzzles from storage without truth", async () => {
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

    const body = listPublicPuzzles(repository);
    db.close();

    expect(body).toHaveLength(1);
    expect(body?.[0].id).toBe("rain-platform");
    expect(body?.[0].surface).toBe(seedPuzzles[0].surface);
    expect(body?.[0].solutionPoints).toEqual(seedPuzzles[0].solutionPoints);
    expect(body?.[0]).not.toHaveProperty("truth");
  });
});
