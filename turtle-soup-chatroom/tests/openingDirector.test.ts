import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedPuzzle } from "../src/shared/types";
import {
  buildOpeningDirectorIntentPrompt,
  createOpeningDirectorPlans,
  parseOpeningDirectorIntentFallback,
  parseOpeningDirectorIntentResponse,
  parseOpeningDirectorIntentWithAi
} from "../server/openingDirector";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

const basePuzzle: ManagedPuzzle = {
  id: "parent-case",
  title: "亲情题",
  surface: "一个人参加亲人的葬礼后感到奇怪。",
  truth: "私有真相不能出现在推荐里。",
  solutionPoints: ["私有关键点"],
  difficulty: "hard",
  tags: ["本格", "红汤", "全人类", "高难"],
  author: "test",
  rating: 8.5,
  plays: 30,
  createdAt: "2026-06-23T00:00:00.000Z",
  status: "published",
  hints: [],
  estimatedMinutes: 20,
  qualityScore: 80,
  qualityIssues: [],
  qualitySummary: "ok",
  updatedAt: "2026-06-23T00:00:00.000Z",
  aiProfile: {
    themes: ["亲情", "父母"],
    moods: ["压抑", "反转"],
    twistTypes: ["关系误导"],
    contentWarnings: ["死亡"],
    suitableFor: ["标准局"],
    intensity: { gore: 1, horror: 2, sadness: 4, absurdity: 1 },
    spoilerFreePitch: "亲情关系里的异常行为是核心误导点。",
    estimatedQuestions: 18,
    profileVersion: 1,
    generatedAt: "2026-07-01T00:00:00.000Z"
  }
};

describe("opening director", () => {
  it("builds an AI intent prompt for structured JSON parsing", () => {
    const prompt = buildOpeningDirectorIntentPrompt("大V主持，涉及父母，不要太血腥");

    expect(prompt[0].content).toContain("开局导演");
    expect(prompt[0].content).toContain("只输出 JSON");
    expect(prompt[1].content).toContain("大V主持");
  });

  it("parses AI intent response", () => {
    const intent = parseOpeningDirectorIntentResponse(JSON.stringify({
      themes: ["父母"],
      moods: ["反转"],
      avoidThemes: [],
      preferredHostPersonaId: "dav",
      maxGore: 2,
      desiredLength: "short",
      confidence: 0.86
    }), "大V主持，涉及父母，不要太血腥");

    expect(intent.source).toBe("ai");
    expect(intent.themes).toContain("父母");
    expect(intent.preferredHostPersonaId).toBe("dav");
    expect(intent.maxGore).toBe(2);
  });

  it("uses AI intent parser when configured", async () => {
    vi.stubEnv("AI_BASE_URL", "https://example.test");
    vi.stubEnv("AI_API_KEY", "key");
    vi.stubEnv("AI_MODEL", "model");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          themes: ["父母"],
          moods: ["反转"],
          avoidThemes: [],
          preferredHostPersonaId: "dav",
          maxGore: 2,
          desiredLength: "short",
          confidence: 0.9
        }) } }]
      })
    } as unknown as Response);

    const intent = await parseOpeningDirectorIntentWithAi("大V主持，涉及父母，不要太血腥");

    expect(intent.source).toBe("ai");
    expect(intent.preferredHostPersonaId).toBe("dav");
  });

  it("falls back to rules when AI is unavailable", async () => {
    const intent = await parseOpeningDirectorIntentWithAi("大V主持，涉及父母，反转强一点，不要太血腥");

    expect(intent.source).toBe("fallback");
    expect(intent.themes).toContain("父母");
    expect(intent.moods).toContain("反转");
    expect(intent.preferredHostPersonaId).toBe("dav");
  });

  it("creates display-safe plans without full profiles or truth", async () => {
    const response = await createOpeningDirectorPlans({
      prompt: "涉及父母，反转强一点，不要太血腥",
      puzzles: [basePuzzle],
      limit: 1
    });

    expect(response.plans).toHaveLength(1);
    expect(response.plans[0].puzzle.title).toBe("亲情题");
    expect(response.plans[0].reason).toContain("亲情");
    const json = JSON.stringify(response);
    expect(json).not.toContain("私有真相");
    expect(json).not.toContain("私有关键点");
    expect(json).not.toContain("aiProfile");
  });

  it("surfaces spoiler-free semantic retrieval reasons", async () => {
    const response = await createOpeningDirectorPlans({
      prompt: "涉及父母但不要血腥",
      puzzles: [basePuzzle],
      limit: 1
    });

    expect(response.agentTrace.find((item) => item.toolName === "search_puzzles")?.summary).toContain("语义召回");
    expect(response.plans[0]).toMatchObject({
      retrievalMatches: expect.arrayContaining(["父母"]),
      retrievalScore: expect.any(Number)
    });
    expect(response.plans[0].matchSummary).toContain("父母");

    const retrievalJson = JSON.stringify(response.plans[0]);
    expect(retrievalJson).not.toContain("私有真相");
    expect(retrievalJson).not.toContain("私有关键点");
  });

  it("counts semantic retrieval matches before limiting plans", async () => {
    const siblingCase: ManagedPuzzle = {
      ...basePuzzle,
      id: "sibling-case",
      title: "家庭回声",
      tags: ["本格", "生活"],
      rating: 7.8,
      plays: 12,
      aiProfile: {
        ...basePuzzle.aiProfile!,
        themes: ["家庭", "亲情"],
        spoilerFreePitch: "家庭关系里的反常举动值得追问。"
      }
    };

    const response = await createOpeningDirectorPlans({
      prompt: "涉及父母但不要血腥",
      puzzles: [basePuzzle, siblingCase],
      limit: 1
    });

    expect(response.plans).toHaveLength(1);
    expect(response.agentTrace.find((item) => item.toolName === "search_puzzles")?.summary).toContain("语义召回 2 道");
  });

  it("returns a visible agent workflow trace before confirmation", async () => {
    const response = await createOpeningDirectorPlans({
      prompt: "涉及父母，反转强一点，不要太血腥",
      puzzles: [basePuzzle],
      limit: 1
    });

    expect(response.agentTrace.map((item) => item.label)).toEqual([
      "理解偏好",
      "搜索题库",
      "匹配画像",
      "生成方案",
      "等待确认"
    ]);
    expect(response.agentTrace.at(-1)).toMatchObject({
      id: "request_confirm",
      status: "waiting"
    });
  });

  it("exposes stable tool names for the opening agent trace", async () => {
    const response = await createOpeningDirectorPlans({
      prompt: "涉及父母，反转强一点，不要太血腥",
      puzzles: [basePuzzle],
      limit: 1
    });

    expect(response.agentTrace.map((item) => item.toolName)).toEqual([
      "parse_intent",
      "search_puzzles",
      "rank_profiles",
      "draft_plans",
      "request_confirm"
    ]);
    expect(response.agentTrace[0].inputSummary).toContain("涉及父母");
    expect(response.agentTrace[1].outputSummary).toContain("1 道");
  });

  it("returns a decision card instead of plans for ambiguous intensity requests", async () => {
    const response = await createOpeningDirectorPlans({
      prompt: "来个刺激一点的",
      puzzles: [basePuzzle],
      limit: 1
    });

    expect(response.plans).toEqual([]);
    expect(response.decision).toMatchObject({
      id: "clarify_intensity",
      title: "刺激优先还是推理优先？"
    });
    expect(response.decision?.options.map((option) => option.id)).toEqual(["more_intense", "more_reasoning"]);
    expect(response.agentTrace.at(-1)).toMatchObject({
      id: "request_confirm",
      status: "waiting",
      summary: "先选择一个理解方向"
    });
  });

  it("continues planning after a decision option is selected", async () => {
    const response = await createOpeningDirectorPlans({
      prompt: "来个刺激一点的",
      puzzles: [basePuzzle],
      limit: 1,
      decisionId: "more_reasoning"
    });

    expect(response.decision).toBeUndefined();
    expect(response.plans).toHaveLength(1);
    expect(response.intent.moods).toContain("反转");
  });
});
