import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import {
  importTextDraft,
  importBatchWithAi,
  importTextWithAi,
  isAdminRequestAuthorized,
  listAdminPuzzles,
  publishAdminPuzzle,
  rejectAdminPuzzle,
  updateAdminPuzzle
} from "../server/adminPuzzleRoutes";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";

const tmpRoots: string[] = [];
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function makeRepository() {
  const root = join(tmpdir(), `turtle-admin-routes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  const db = openDatabase(join(root, "app.sqlite"));
  return { db, repository: createPuzzleRepository(db) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
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

  it("imports text with AI structure when configured", async () => {
    process.env.AI_BASE_URL = "https://example.test";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "test-model";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          title: "结构化题",
          surface: "一个人听见铃声后大笑。",
          truth: "铃声是约定好的安全信号。",
          solutionPoints: ["铃声是信号", "事先有约定"],
          hints: ["声音很关键"],
          difficulty: "medium",
          tags: ["悬疑"],
          qualityScore: 88,
          qualityIssues: [],
          qualitySummary: "可以进入审核"
        }) } }]
      })
    } as unknown as Response);
    const { db, repository } = makeRepository();

    const puzzle = await importTextWithAi(repository, { rawText: "原始题目" });

    expect(puzzle.status).toBe("reviewing");
    expect(puzzle.title).toBe("结构化题");
    expect(puzzle.solutionPoints).toEqual(["50|point-1|铃声是信号", "50|point-2|事先有约定"]);
    expect(repository.listManaged("reviewing")).toHaveLength(1);
    db.close();
  });

  it("imports multiple raw puzzle items into the review queue", async () => {
    process.env.AI_BASE_URL = "https://example.test";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "test-model";
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({
            title: "A",
            surface: "一",
            truth: "二",
            solutionPoints: ["关键点一"],
            hints: [],
            difficulty: "easy",
            tags: [],
            qualityScore: 80,
            qualityIssues: [],
            qualitySummary: "结构完整"
          }) } }]
        })
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: vi.fn()
      } as unknown as Response);
    const { db, repository } = makeRepository();

    const result = await importBatchWithAi(repository, {
      items: [
        { rawText: "标题：A\n汤面：一\n汤底：二", sourceTitle: "文件A" },
        { rawText: "标题：B\n汤面：三\n汤底：四", sourceTitle: "文件B" }
      ]
    });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({ title: "A", surface: "一", truth: "二", status: "reviewing" });
    expect(result.failed).toEqual([{ index: 1, message: "AI 增强失败：HTTP 429" }]);
    expect(repository.listManaged()).toHaveLength(1);
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

  it("updates editable puzzle fields without changing status", () => {
    const { db, repository } = makeRepository();
    const draft = importTextDraft(repository, { rawText: "旧标题\n旧汤面" });

    const updated = updateAdminPuzzle(repository, draft.id, {
      title: "新标题",
      surface: "新的汤面",
      truth: "新的汤底",
      solutionPoints: ["关键点一", "关键点二"],
      hints: ["提示一"],
      difficulty: "hard",
      tags: ["本格", "测试"],
      qualityScore: 82,
      qualityIssues: ["需要人工复核"],
      qualitySummary: "结构完整",
      sourceTitle: "来源名",
      sourceUrl: "https://example.test/puzzle",
      rawText: "原始文本"
    });

    expect(updated.status).toBe("draft");
    expect(updated.title).toBe("新标题");
    expect(updated.solutionPoints).toEqual(["关键点一", "关键点二"]);
    expect(updated.tags).toEqual(["本格", "测试"]);
    expect(updated.updatedAt).not.toBe(draft.updatedAt);
    db.close();
  });
});
