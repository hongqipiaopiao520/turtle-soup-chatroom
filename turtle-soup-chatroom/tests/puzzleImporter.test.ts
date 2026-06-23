import { afterEach, describe, expect, it, vi } from "vitest";
import { importPuzzleFromText, parsePuzzleImportResponse } from "../server/puzzleImporter";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function configureAiEnv() {
  process.env.AI_BASE_URL = "https://example.test";
  process.env.AI_API_KEY = "test-key";
  process.env.AI_MODEL = "test-model";
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

describe("parsePuzzleImportResponse", () => {
  it("parses valid structured puzzle JSON", () => {
    const result = parsePuzzleImportResponse(JSON.stringify({
      title: "雨夜站台",
      surface: "女孩向空气道谢后消失。",
      truth: "她在参加告别仪式。",
      solutionPoints: ["告别仪式", "录音"],
      hints: ["关注声音来源"],
      difficulty: "medium",
      tags: ["悬疑", "温情"],
      qualityScore: 86,
      qualityIssues: ["汤底还可以补细节"],
      qualitySummary: "适合线上多人推理"
    }));

    expect(result).toMatchObject({
      title: "雨夜站台",
      surface: "女孩向空气道谢后消失。",
      truth: "她在参加告别仪式。",
      status: "reviewing",
      solutionPoints: ["告别仪式", "录音"],
      qualityScore: 86
    });
  });
});

describe("importPuzzleFromText", () => {
  it("uses the configured model to structure imported text", async () => {
    configureAiEnv();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          title: "冷掉的水",
          surface: "男人喝了一口冷水后报警。",
          truth: "水本来是热的，说明有人进过房间。",
          solutionPoints: ["水本来是热的", "有人进房"],
          hints: ["留意水温变化"],
          difficulty: "easy",
          tags: ["本格"],
          qualityScore: 91,
          qualityIssues: [],
          qualitySummary: "结构清晰"
        }) } }]
      })
    } as unknown as Response);

    const result = await importPuzzleFromText("原始题目");

    expect(result.puzzle.status).toBe("reviewing");
    expect(result.puzzle.title).toBe("冷掉的水");
    expect(result.puzzle.solutionPoints).toEqual(["水本来是热的", "有人进房"]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.test/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"model":"test-model"')
      })
    );
  });

  it("falls back to a draft puzzle when the provider fails", async () => {
    configureAiEnv();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network failed"));

    const result = await importPuzzleFromText("失败题目原文");

    expect(result.puzzle.status).toBe("draft");
    expect(result.puzzle.rawText).toBe("失败题目原文");
    expect(result.puzzle.qualityIssues).toContain("LLM 结构化失败");
  });
});
