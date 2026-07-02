import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedPuzzles } from "../../src/data/seedPuzzles";
import type { ManagedPuzzle } from "../../src/shared/types";
import { openDatabase } from "../../server/storage/database";
import { createPuzzleRepository } from "../../server/storage/puzzleRepository";
import { seedPuzzleDatabase } from "../../server/storage/seedDatabase";

const tmpRoots: string[] = [];

function makeDb() {
  const root = join(tmpdir(), `turtle-puzzle-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  return openDatabase(join(root, "app.sqlite"));
}

function makeDraft(overrides: Partial<ManagedPuzzle> = {}): ManagedPuzzle {
  const now = "2026-06-23T00:00:00.000Z";
  return {
    ...seedPuzzles[0],
    id: "draft-rain-platform",
    title: "待审核雨夜站台",
    status: "reviewing",
    rawText: "原始题目文本",
    sourceUrl: "https://example.test/turtle",
    sourceTitle: "示例来源",
    hints: ["关注她感谢的对象"],
    estimatedMinutes: 18,
    qualityScore: 82,
    qualityIssues: ["汤面可以更短"],
    qualitySummary: "适合多人在线推理",
    reviewedAt: undefined,
    publishedAt: undefined,
    updatedAt: now,
    ...overrides
  };
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("PuzzleRepository", () => {
  it("seeds published puzzles when the puzzle table is empty", () => {
    const db = makeDb();
    seedPuzzleDatabase(db, seedPuzzles);
    seedPuzzleDatabase(db, []);

    const repository = createPuzzleRepository(db);
    expect(repository.listPublished().map((puzzle) => puzzle.id)).toEqual([
      "silent-elevator",
      "cold-cup",
      "rain-platform"
    ]);
    expect(db.prepare("select count(*) as count from puzzles").get()).toEqual({
      count: seedPuzzles.length
    });

    db.close();
  });

  it("lists only published puzzles for public gameplay", () => {
    const db = makeDb();
    const repository = createPuzzleRepository(db);
    repository.upsertManaged({ ...makeDraft(), status: "published", publishedAt: "2026-06-23T01:00:00.000Z" });
    repository.upsertManaged(makeDraft({ id: "draft-hidden", status: "reviewing" }));

    expect(repository.listPublished().map((puzzle) => puzzle.id)).toEqual(["draft-rain-platform"]);

    db.close();
  });

  it("round-trips managed puzzle JSON fields", () => {
    const db = makeDb();
    const repository = createPuzzleRepository(db);
    const draft = repository.upsertManaged(makeDraft());

    expect(draft).toMatchObject({
      solutionPoints: seedPuzzles[0].solutionPoints,
      tags: seedPuzzles[0].tags,
      hints: ["关注她感谢的对象"],
      qualityIssues: ["汤面可以更短"],
      qualityScore: 82,
      qualitySummary: "适合多人在线推理",
      status: "reviewing"
    });
    expect(repository.listManaged("reviewing")[0]).toEqual(draft);

    db.close();
  });

  it("stores AI profiles internally but keeps public puzzles clean", () => {
    const db = makeDb();
    const repository = createPuzzleRepository(db);
    repository.upsertManaged(makeDraft({
      id: "profiled-puzzle",
      status: "published",
      publishedAt: "2026-06-23T00:00:00.000Z"
    }));

    repository.updateAiProfile("profiled-puzzle", {
      themes: ["亲情", "父母"],
      moods: ["压抑", "反转"],
      twistTypes: ["关系误导"],
      contentWarnings: ["死亡"],
      suitableFor: ["标准局"],
      intensity: { gore: 1, horror: 2, sadness: 4, absurdity: 1 },
      spoilerFreePitch: "家庭关系里的异常行为是核心误导点。",
      estimatedQuestions: 18,
      profileVersion: 1,
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(repository.findById("profiled-puzzle")?.aiProfile?.themes).toEqual(["亲情", "父母"]);
    const publicPuzzle = repository.listPublished().find((puzzle) => puzzle.id === "profiled-puzzle");
    expect(publicPuzzle).not.toHaveProperty("truth");
    expect(publicPuzzle).not.toHaveProperty("solutionPoints");
    expect(publicPuzzle).not.toHaveProperty("aiProfile");
    db.close();
  });

  it("publishes and rejects managed puzzles", () => {
    const db = makeDb();
    const repository = createPuzzleRepository(db);
    repository.upsertManaged(makeDraft());
    repository.upsertManaged(makeDraft({ id: "draft-to-reject" }));

    const published = repository.publish("draft-rain-platform");
    const rejected = repository.reject("draft-to-reject");

    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();
    expect(rejected.status).toBe("rejected");
    expect(repository.listPublished().map((puzzle) => puzzle.id)).toEqual(["draft-rain-platform"]);

    db.close();
  });
});
