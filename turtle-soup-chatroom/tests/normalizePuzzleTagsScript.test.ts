import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizePuzzleTagsDatabase } from "../scripts/normalize-puzzle-tags.mjs";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";

const roots: string[] = [];
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function makeDbPath() {
  const root = join(tmpdir(), `tag-cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  roots.push(root);
  mkdirSync(root, { recursive: true });
  return join(root, "app.sqlite");
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
  roots.length = 0;
});

describe("normalize puzzle tags script", () => {
  it("dry-runs by default and writes only with write enabled", async () => {
    const dbPath = makeDbPath();
    const db = openDatabase(dbPath);
    const repository = createPuzzleRepository(db);
    const now = new Date().toISOString();
    repository.upsertManaged({
      ...seedPuzzles[0],
      id: "legacy-tags",
      surface: "我在镜子里看见了和爸爸一模一样的人。",
      truth: "爸爸已经被替换，真正的爸爸被杀死藏了起来。",
      solutionPoints: ["父亲被替换"],
      status: "published",
      rawText: "旧题",
      sourceUrl: undefined,
      sourceTitle: "测试",
      hints: [],
      estimatedMinutes: 15,
      qualityScore: 80,
      qualityIssues: [],
      qualitySummary: "旧数据",
      tags: ["父亲被替换", "悬疑"],
      reviewedAt: now,
      publishedAt: now,
      updatedAt: now
    });
    db.close();

    const dryRun = await normalizePuzzleTagsDatabase({ dbPath, write: false });
    expect(dryRun.changed).toBe(1);

    const afterDryRunDb = openDatabase(dbPath);
    expect(createPuzzleRepository(afterDryRunDb).findById("legacy-tags")?.tags).toEqual(["父亲被替换", "悬疑"]);
    afterDryRunDb.close();

    const written = await normalizePuzzleTagsDatabase({ dbPath, write: true });
    expect(written.changed).toBe(1);

    const afterWriteDb = openDatabase(dbPath);
    expect(createPuzzleRepository(afterWriteDb).findById("legacy-tags")?.tags).not.toContain("父亲被替换");
    afterWriteDb.close();
  });

  it("can use AI tag analysis when requested", async () => {
    process.env.AI_BASE_URL = "https://example.test";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "test-model";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          worldview: "变格",
          soupColor: "红汤",
          roleType: "全人类",
          difficultyTag: "高难",
          tags: ["变格", "红汤", "全人类", "高难"]
        }) } }]
      })
    } as unknown as Response);
    const dbPath = makeDbPath();
    const db = openDatabase(dbPath);
    const repository = createPuzzleRepository(db);
    const now = new Date().toISOString();
    repository.upsertManaged({
      ...seedPuzzles[0],
      id: "legacy-ai-tags",
      surface: "我在雪地里吃火鸡。",
      truth: "叙述者精神异常，所谓火鸡其实是人肉。",
      solutionPoints: ["精神异常", "人肉"],
      status: "published",
      rawText: "旧题",
      sourceUrl: undefined,
      sourceTitle: "测试",
      hints: [],
      estimatedMinutes: 15,
      qualityScore: 80,
      qualityIssues: [],
      qualitySummary: "旧数据",
      tags: ["本格", "清汤", "全人类", "入门"],
      reviewedAt: now,
      publishedAt: now,
      updatedAt: now
    });
    db.close();

    const result = await normalizePuzzleTagsDatabase({ dbPath, write: true, ai: true });

    expect(result.changed).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalled();
    const afterWriteDb = openDatabase(dbPath);
    expect(createPuzzleRepository(afterWriteDb).findById("legacy-ai-tags")?.tags).toEqual(["变格", "红汤", "全人类", "高难"]);
    afterWriteDb.close();
  });
});
