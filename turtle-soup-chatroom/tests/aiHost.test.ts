import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { askHost, buildHostPrompt, parseHostResponse, type AskHostInput } from "../server/aiHost";
import { loadLocalEnv } from "../server/env";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

const askHostInput: AskHostInput = {
  puzzle: {
    id: "puzzle-1",
    title: "测试汤",
    surface: "一个人进了餐厅，点了一碗汤，然后哭了。",
    truth: "汤让他想起了过去的事故。",
    solutionPoints: ["汤和过去事故有关", "玩家需要确认情绪原因"],
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
    const result = parseHostResponse('{"answerType":"yes","answer":"是。这个方向有帮助。","progress":35}');
    expect(result).toEqual({
      answerType: "yes",
      answer: "是。这个方向有帮助。",
      progress: 35
    });
  });

  it("falls back to partial for non-json model output", () => {
    const result = parseHostResponse("也许有关，但不能直接确认。");
    expect(result.answerType).toBe("partial");
    expect(result.answer).toContain("也许有关");
    expect(result.progress).toBe(0);
  });

  it("rejects unknown answer types", () => {
    const result = parseHostResponse('{"answerType":"maybe","answer":"不知道","progress":200}');
    expect(result.answerType).toBe("partial");
    expect(result.answer).toBe("不知道");
    expect(result.progress).toBe(100);
  });

  it("defaults missing progress to zero", () => {
    const result = parseHostResponse('{"answerType":"no","answer":"不是。"}');
    expect(result).toEqual({
      answerType: "no",
      answer: "不是。",
      progress: 0
    });
  });

  it("keeps valid answer type when progress needs normalization", () => {
    const result = parseHostResponse('{"answerType":"yes","answer":"是。","progress":"42"}');
    expect(result).toEqual({
      answerType: "yes",
      answer: "是。",
      progress: 42
    });
  });

  it("parses covered solution point ids from structured host JSON", () => {
    const result = parseHostResponse(
      '{"answerType":"partial","answer":"覆盖了入侵方向。","progress":50,"coveredPointIds":["intrusion","liquid-tampered"],"coverageConfidence":0.82}'
    );

    expect(result).toEqual({
      answerType: "partial",
      answer: "覆盖了入侵方向。",
      progress: 50,
      coveredPointIds: ["intrusion", "liquid-tampered"],
      coverageConfidence: 0.82
    });
  });
});

describe("askHost", () => {
  it("uses MIMO configuration when generic AI configuration is absent", async () => {
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    process.env.MIMO_BASE_URL = "https://mimo.example/v1";
    process.env.MIMO_API_KEY = "mimo-key";
    process.env.MIMO_AGENT_MODEL = "mimo-agent";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"answerType":"yes","answer":"是。"}' } }]
      })
    } as unknown as Response);

    await expect(askHost(askHostInput)).resolves.toEqual({
      answerType: "yes",
      answer: "是。",
      progress: 0
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://mimo.example/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mimo-key"
        }),
        body: expect.stringContaining('"model":"mimo-agent"')
      })
    );
  });

  it("prefers generic AI configuration over MIMO configuration", async () => {
    process.env.AI_BASE_URL = "https://ai.example/v1";
    process.env.AI_API_KEY = "ai-key";
    process.env.AI_MODEL = "ai-model";
    process.env.MIMO_BASE_URL = "https://mimo.example/v1";
    process.env.MIMO_API_KEY = "mimo-key";
    process.env.MIMO_AGENT_MODEL = "mimo-agent";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"answerType":"no","answer":"不是。"}' } }]
      })
    } as unknown as Response);

    await expect(askHost(askHostInput)).resolves.toEqual({
      answerType: "no",
      answer: "不是。",
      progress: 0
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://ai.example/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ai-key"
        }),
        body: expect.stringContaining('"model":"ai-model"')
      })
    );
  });

  it("falls back safely when fetch throws", async () => {
    configureAiEnv();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network failed"));

    await expect(askHost(askHostInput)).resolves.toEqual({
      answerType: "partial",
      answer: "小歪暂时走神了，请稍后重试。",
      progress: 0
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
      answer: "小歪暂时走神了，请稍后重试。",
      progress: 0
    });
  });
});

describe("buildHostPrompt", () => {
  it("instructs the AI host to judge final guesses by core logic instead of exact wording", () => {
    const messages = buildHostPrompt({
      ...askHostInput,
      mode: "guess",
      question: "最终推理：这碗汤让他想起事故，所以他哭了。"
    });
    const systemPrompt = messages[0].content;
    const userPrompt = messages[1].content;

    expect(systemPrompt).toContain("同义表达");
    expect(systemPrompt).toContain("核心逻辑");
    expect(systemPrompt).toContain("不要要求玩家逐字命中关键点");
    expect(userPrompt).toContain("最终推理");
  });
});

describe("loadLocalEnv", () => {
  it("loads values from a local .env file without overriding existing process env", () => {
    const projectDir = join(tmpdir(), `turtle-env-${Date.now()}`);
    mkdirSync(projectDir, { recursive: true });
    process.env.MIMO_API_KEY = "existing-key";
    writeFileSync(
      join(projectDir, ".env"),
      [
        "MIMO_BASE_URL=https://mimo.example/v1",
        "MIMO_API_KEY=file-key",
        "MIMO_AGENT_MODEL=mimo-agent"
      ].join("\n")
    );

    loadLocalEnv(projectDir);

    expect(process.env.MIMO_BASE_URL).toBe("https://mimo.example/v1");
    expect(process.env.MIMO_API_KEY).toBe("existing-key");
    expect(process.env.MIMO_AGENT_MODEL).toBe("mimo-agent");

    rmSync(projectDir, { recursive: true, force: true });
  });
});
