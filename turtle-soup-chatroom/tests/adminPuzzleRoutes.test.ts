import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { importTextDraft, isAdminRequestAuthorized, listAdminPuzzles, publishAdminPuzzle, rejectAdminPuzzle } from "../server/adminPuzzleRoutes";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";

const tmpRoots: string[] = [];

function makeRepository() {
  const root = join(tmpdir(), `turtle-admin-routes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  const db = openDatabase(join(root, "app.sqlite"));
  return { db, repository: createPuzzleRepository(db) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("admin puzzle helpers", () => {
  it("allows dev requests without a token but enforces ADMIN_TOKEN in production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isAdminRequestAuthorized(undefined)).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_TOKEN", "secret");
    expect(isAdminRequestAuthorized("Bearer secret")).toBe(true);
    expect(isAdminRequestAuthorized("Bearer wrong")).toBe(false);
    expect(isAdminRequestAuthorized(undefined)).toBe(false);
  });

  it("imports raw text as a draft puzzle", () => {
    const { db, repository } = makeRepository();

    const draft = importTextDraft(repository, {
      rawText: "雨夜站台\n一个女孩向空气道谢后消失。",
      sourceUrl: "https://example.test/source",
      sourceTitle: "来源标题"
    });

    expect(draft.status).toBe("draft");
    expect(draft.title).toBe("雨夜站台");
    expect(draft.rawText).toContain("向空气道谢");
    expect(draft.sourceUrl).toBe("https://example.test/source");
    expect(repository.listManaged("draft")).toHaveLength(1);
    db.close();
  });

  it("lists, publishes, and rejects managed puzzles", () => {
    const { db, repository } = makeRepository();
    const first = importTextDraft(repository, { rawText: "第一题\n汤面一" });
    const second = importTextDraft(repository, { rawText: "第二题\n汤面二" });
    repository.upsertManaged({
      ...seedPuzzles[0],
      id: "published-seed",
      status: "published",
      hints: [],
      estimatedMinutes: 15,
      qualityScore: 80,
      qualityIssues: [],
      qualitySummary: "已发布",
      publishedAt: "2026-06-23T00:00:00.000Z",
      updatedAt: "2026-06-23T00:00:00.000Z"
    });

    const published = publishAdminPuzzle(repository, first.id);
    const rejected = rejectAdminPuzzle(repository, second.id);

    expect(published.status).toBe("published");
    expect(rejected.status).toBe("rejected");
    expect(listAdminPuzzles(repository, "draft")).toEqual([]);
    expect(listAdminPuzzles(repository, "published").map((puzzle) => puzzle.id)).toContain(first.id);
    expect(listAdminPuzzles(repository)).toHaveLength(3);
    db.close();
  });
});
