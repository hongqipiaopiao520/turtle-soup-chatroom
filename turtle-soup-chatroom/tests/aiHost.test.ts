import { afterEach, describe, expect, it, vi } from "vitest";
import { askHost, parseHostResponse, type AskHostInput } from "../server/aiHost";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

const askHostInput: AskHostInput = {
  puzzle: {
    id: "puzzle-1",
    title: "测试汤",
    surface: "一个人进了餐厅，点了一碗汤，然后哭了。",
    truth: "汤让他想起了过去的事故。",
    difficulty: "easy",
    tags: [],
    author: "测试主持",
    rating: 4.8,
    plays: 12,
    createdAt: "2026-06-22T00:00:00.000Z"
  },
  history: [],
  question: "汤和过去有关吗？",
  mode: "question"
};

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

describe("parseHostResponse", () => {
  it("parses structured host JSON", () => {
    const result = parseHostResponse('{"answerType":"yes","answer":"是。这个方向有帮助。"}');
    expect(result).toEqual({
      answerType: "yes",
      answer: "是。这个方向有帮助。"
    });
  });

  it("falls back to partial for non-json model output", () => {
    const result = parseHostResponse("也许有关，但不能直接确认。");
    expect(result.answerType).toBe("partial");
    expect(result.answer).toContain("也许有关");
  });

  it("rejects unknown answer types", () => {
    const result = parseHostResponse('{"answerType":"maybe","answer":"不知道"}');
    expect(result.answerType).toBe("partial");
    expect(result.answer).toBe("不知道");
  });
});

describe("askHost", () => {
  it("falls back safely when fetch throws", async () => {
    configureAiEnv();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network failed"));

    await expect(askHost(askHostInput)).resolves.toEqual({
      answerType: "partial",
      answer: "汤仙人暂时走神了，请稍后重试。"
    });
  });

  it("falls back safely when the provider returns invalid JSON", async () => {
    configureAiEnv();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token"))
    } as unknown as Response);

    await expect(askHost(askHostInput)).resolves.toEqual({
      answerType: "partial",
      answer: "汤仙人暂时走神了，请稍后重试。"
    });
  });
});
