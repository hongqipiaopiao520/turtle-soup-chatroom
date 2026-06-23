import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { askHost, parseHostResponse, type AskHostInput } from "../server/aiHost";
import { loadLocalEnv } from "../server/env";

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
      answer: "是。"
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
      answer: "不是。"
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
