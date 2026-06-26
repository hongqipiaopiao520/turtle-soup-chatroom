import { afterEach, describe, expect, it, vi } from "vitest";
import { buildImportPrompt, createFallbackDraft, createImportFingerprintId, importPuzzleFromText, parsePuzzleImportResponse } from "../server/puzzleImporter";
import { inferPuzzleTagsFromText, normalizePuzzleTags } from "../server/puzzleTags";

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

describe("puzzle tag taxonomy", () => {
  it("normalizes public tags into stable non-spoilery taxonomy order", () => {
    expect(normalizePuzzleTags({
      tags: ["尸体替换", "本格", "犯罪悬疑", "高难", "硬核逻辑", "有死人", "全人类", "黑汤"],
      difficulty: "hard",
      surface: "男人回家后发现父亲不对劲。",
      truth: "父亲已经被替换，尸体被藏起来。"
    })).toEqual(["本格", "红汤", "全人类", "高难"]);
  });

  it("infers safe public tags from puzzle text", () => {
    expect(inferPuzzleTagsFromText({
      difficulty: "medium",
      surface: "男人喝了一口冷水后立刻报警。",
      truth: "水原本是热的，说明有人进入房间并动过杯中液体。"
    })).toEqual(["本格", "清汤", "全人类", "中级"]);
  });

  it("uses explicit AI tag fields instead of regex-overriding valid labels", () => {
    expect(normalizePuzzleTags({
      tags: ["变格", "清汤", "含非人", "入门"],
      difficulty: "easy",
      surface: "房间里传来鬼的声音。",
      truth: "真正说话的是幽灵。"
    })).toEqual(["变格", "清汤", "含非人", "入门"]);
  });
});

describe("parsePuzzleImportResponse", () => {
  it("creates stable import ids so duplicate raw imports upsert the same puzzle", () => {
    const first = createImportFingerprintId("标题：雨夜站台\n汤面：女孩消失。", "https://example.test/a", "来源 A");
    const second = createImportFingerprintId("标题：雨夜站台\r\n汤面：女孩消失。", "https://example.test/a", "来源 A");
    const different = createImportFingerprintId("标题：雨夜站台\n汤面：女孩消失。", "https://example.test/b", "来源 A");

    expect(first).toBe(second);
    expect(first).toMatch(/^import_[a-f0-9]{16}$/);
    expect(different).not.toBe(first);
  });

  it("parses valid structured puzzle JSON", () => {
    const result = parsePuzzleImportResponse(JSON.stringify({
      title: "雨夜站台",
      surface: "女孩向空气道谢后消失。",
      truth: "她在参加告别仪式。",
      solutionPoints: ["告别仪式", "录音"],
      hints: ["关注声音来源"],
      difficulty: "medium",
      tagAnalysis: {
        worldview: "本格",
        soupColor: "清汤",
        roleType: "全人类",
        difficultyTag: "中级"
      },
      tags: ["悬疑", "温情"],
      qualityScore: 86,
      qualityIssues: ["汤底还可以补细节"],
      qualitySummary: "适合线上多人推理"
    }));

    expect(result).toMatchObject({
      title: "雨夜站台",
      surface: "女孩向空气道谢后消失。",
      truth: "她在参加告别仪式。",
      status: "published",
      solutionPoints: ["50|point-1|告别仪式", "50|point-2|录音"],
      qualityScore: 86
    });
    expect(result.tags).toEqual(["本格", "清汤", "全人类", "中级"]);
    expect(result.publishedAt).toBeTruthy();
  });

  it("keeps concrete answer facts out of imported public tags", () => {
    const result = parsePuzzleImportResponse(JSON.stringify({
      title: "保姆",
      surface: "保姆一周没来，我发现家里好像有人。",
      truth: "叙述者梦游时杀死保姆，并把尸体藏在水箱里。",
      solutionPoints: ["叙述者梦游", "保姆死亡", "尸体在水箱"],
      hints: ["注意叙述者状态"],
      difficulty: "hard",
      tagAnalysis: {
        worldview: "变格",
        soupColor: "红汤",
        roleType: "全人类",
        difficultyTag: "高难"
      },
      tags: ["本格", "保姆死亡", "尸体水箱", "心理诡计", "黑汤"],
      qualityScore: 82,
      qualityIssues: [],
      qualitySummary: "结构完整"
    }));

    expect(result.tags).toEqual(["变格", "红汤", "全人类", "高难"]);
    expect(result.tags).not.toContain("保姆死亡");
    expect(result.tags).not.toContain("尸体水箱");
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
        标签分析: {
          世界观: "本格",
          汤色: "清汤",
          角色类型: "全人类",
          难度标签: "入门"
        },
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
      qualityScore: 86,
      qualityIssues: []
    });
    expect(result.tags).toEqual(["本格", "清汤", "全人类", "入门"]);
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
          tagAnalysis: {
            worldview: "本格",
            soupColor: "清汤",
            roleType: "全人类",
            difficultyTag: "入门"
          },
          tags: ["本格"],
          qualityScore: 91,
          qualityIssues: [],
          qualitySummary: "结构清晰"
        }) } }]
      })
    } as unknown as Response);

    const result = await importPuzzleFromText("原始题目");

    expect(result.puzzle.status).toBe("published");
    expect(result.puzzle.publishedAt).toBeTruthy();
    expect(result.puzzle.title).toBe("冷掉的水");
    expect(result.puzzle.tags).toEqual(["本格", "清汤", "全人类", "入门"]);
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

describe("buildImportPrompt", () => {
  it("asks the AI editor to prepare independent and verifiable key points", () => {
    const messages = buildImportPrompt("标题：测试\n汤面：测试\n汤底：测试");
    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain("独立");
    expect(systemPrompt).toContain("可验证");
    expect(systemPrompt).toContain("关键因果");
    expect(systemPrompt).toContain("不要把同一个事实拆成多个重复点");
    expect(systemPrompt).toContain("tags 是公开给玩家看的筛选标签");
    expect(systemPrompt).toContain("tagAnalysis 是公开标签的逐字段判断");
    expect(systemPrompt).toContain("必须基于汤底判断标签");
    expect(systemPrompt).toContain("父亲被替换");
    expect(systemPrompt).toContain("solutionPoints");
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
