import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackDraft, importPuzzleFromText, parsePuzzleImportResponse } from "../server/puzzleImporter";

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
      solutionPoints: ["50|point-1|告别仪式", "50|point-2|录音"],
      qualityScore: 86
    });
  });

  it("normalizes imported solution points into weighted non-duplicative facts", () => {
    const result = parsePuzzleImportResponse(JSON.stringify({
      title: "冷掉的水",
      surface: "男人喝了一口冷水后立刻报警。",
      truth: "他离家前倒的是热水。杯子变冷且位置没变，说明有人进入房间并替换了杯中液体，他意识到独居住所被入侵。",
      solutionPoints: ["水原本是热的", "杯子位置没变但水变冷", "有人进入房间", "有人替换或动过杯中液体", "男人意识到住所被入侵"],
      hints: ["注意水温"],
      difficulty: "easy",
      tags: ["本格"],
      qualityScore: 88,
      qualityIssues: [],
      qualitySummary: "结构清晰"
    }));

    expect(result.solutionPoints).toEqual([
      "25|water-state|杯中液体状态异常|水变冷,原本是热水",
      "15|cup-position|杯子位置没有明显变化|杯子没动,位置没变",
      "25|intrusion|有人进入房间|有人来过,有人进屋",
      "25|liquid-tampered|有人替换或动过杯中液体|换水,动过水,替换液体",
      "10|realization|男人意识到住所被入侵|报警原因,发现入侵"
    ]);
  });

  it("accepts fenced JSON and common Chinese field variants from AI output", () => {
    const result = parsePuzzleImportResponse([
      "```json",
      JSON.stringify({
        题目: "空白车票",
        汤面: "一个人看见空白车票后立刻把灯关掉。",
        汤底: "车票是密室逃脱提示卡，荧光油墨需要关灯才会显现。",
        关键点: ["车票不是交通票", "使用荧光油墨", "关灯后线索显现"],
        提示: ["注意光线"],
        难度: "简单",
        标签: "本格, 入门",
        质量评分: "86",
        质量问题: "无",
        质量摘要: "结构清晰"
      }),
      "```"
    ].join("\n"));

    expect(result).toMatchObject({
      title: "空白车票",
      surface: "一个人看见空白车票后立刻把灯关掉。",
      truth: "车票是密室逃脱提示卡，荧光油墨需要关灯才会显现。",
      difficulty: "easy",
      tags: ["本格", "入门"],
      qualityScore: 86,
      qualityIssues: []
    });
  });

  it("replaces AI semantic English point ids with neutral numbered ids", () => {
    const result = parsePuzzleImportResponse(JSON.stringify({
      title: "火鸡",
      surface: "一家人在雪地里吃火鸡。",
      truth: "叙述者精神异常，所谓火鸡其实是人肉。",
      solutionPoints: [
        "30|mental_illness|叙述者患有精神疾病|精神分裂",
        "30|cannibalism|所谓火鸡其实是人肉|吃人肉",
        "40|snow_death|真实场景在雪地并最终冻死|雪地,冻死"
      ],
      hints: [],
      difficulty: "hard",
      tags: ["黑暗"],
      qualityScore: 80,
      qualityIssues: [],
      qualitySummary: "关键点完整"
    }));

    expect(result.solutionPoints).toEqual([
      "30|point-1|叙述者患有精神疾病|精神分裂",
      "30|point-2|所谓火鸡其实是人肉|吃人肉",
      "40|point-3|真实场景在雪地并最终冻死|雪地,冻死"
    ]);
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
    expect(result.puzzle.solutionPoints).toEqual([
      "50|water-state|杯中液体状态异常|水变冷,原本是热水",
      "50|intrusion|有人进入房间|有人来过,有人进屋"
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.test/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"model":"test-model"')
      })
    );
  });

  it("fails loudly when the provider request fails", async () => {
    configureAiEnv();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network failed"));

    await expect(importPuzzleFromText("失败题目原文")).rejects.toThrow("AI 增强失败：请求异常");
  });

  it("fails loudly on provider HTTP errors", async () => {
    configureAiEnv();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: vi.fn()
    } as unknown as Response);

    await expect(importPuzzleFromText([
      "标题：火车",
      "汤面：这是一辆行驶的火车。",
      "汤底：我们是一条由人组成的火车，每一节车厢由人拼接。"
    ].join("\n"))).rejects.toThrow("AI 增强失败：HTTP 429");
  });

  it("fails loudly on stuck provider requests", async () => {
    configureAiEnv();
    process.env.AI_IMPORT_TIMEOUT_MS = "20";
    globalThis.fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      const signal = (init as RequestInit).signal as AbortSignal | undefined;
      signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })) as unknown as typeof fetch;

    await expect(importPuzzleFromText([
      "标题：火车",
      "汤面：这是一辆行驶的火车。",
      "汤底：我们是一条由人组成的火车，每一节车厢由人拼接。"
    ].join("\n"))).rejects.toThrow("AI 增强失败：请求超时");
  });

  it("fails loudly on invalid AI response format", async () => {
    configureAiEnv();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ title: "火车" }) } }]
      })
    } as unknown as Response);

    await expect(importPuzzleFromText([
      "标题：火车",
      "汤面：这是一辆行驶的火车。",
      "汤底：我们是一条由人组成的火车，每一节车厢由人拼接。"
    ].join("\n"))).rejects.toThrow(/AI 返回格式不合格：.*surface.*truth.*solutionPoints/);
  });
});

describe("createFallbackDraft", () => {
  it("structures labeled raw text without AI", () => {
    const draft = createFallbackDraft([
      "标题：宿舍",
      "汤面：今天天气很热，老大在宿舍门口吃冰棍。",
      "汤底：这是雪山循环，帐篷外的人都是过去的自己。"
    ].join("\n"));

    expect(draft.title).toBe("宿舍");
    expect(draft.surface).toBe("今天天气很热，老大在宿舍门口吃冰棍。");
    expect(draft.truth).toBe("这是雪山循环，帐篷外的人都是过去的自己。");
    expect(draft.qualityIssues).not.toContain("LLM 结构化失败");
    expect(draft.qualityIssues).toContain("关键点待补充");
    expect(draft.qualitySummary).toBe("已从原始文本解析出标题、汤面和汤底，关键点待补充。");
  });
});
