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
});
