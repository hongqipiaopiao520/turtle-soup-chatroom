import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRoomCompanionAssistPrompt,
  createRoomCompanionAssist
} from "../server/roomCompanionAssistant";
import type { RoomCompanionAssistRequest } from "../src/shared/types";

function makeRequest(overrides: Partial<RoomCompanionAssistRequest> = {}): RoomCompanionAssistRequest {
  return {
    action: "next_question",
    snapshot: {
      puzzle: {
        title: "冷掉的水",
        surface: "男人喝了一口冷水后立刻报警。",
        difficulty: "easy",
        tags: ["生活", "本格"]
      },
      stageLabel: "追关键变量",
      progressNote: "36% · 已问 4/20 问",
      summary: "局面开始打开，继续追问最有增量的异常点。",
      confirmed: ["这件事发生在室内吗？"],
      toVerify: ["报警和水本身有关吗？"],
      offTrack: ["他在国外吗？"],
      nextQuestion: "水的来源或状态发生过变化吗？",
      recentAnswers: [
        {
          question: "水的状态关键吗？",
          answerType: "partial",
          answer: "有关。",
          progressDelta: 12
        }
      ]
    },
    ...overrides
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("room companion assistant", () => {
  it("falls back without AI config and never needs private truth", async () => {
    const response = await createRoomCompanionAssist(makeRequest({
      draftGuess: "我猜真相和水温有关。"
    }));

    expect(response.source).toBe("fallback");
    expect(response.title).toContain("下一问");
    expect(JSON.stringify(response)).not.toContain("私有汤底");
  });

  it("calls AI with compact public context and parses short JSON", async () => {
    vi.stubEnv("AI_BASE_URL", "https://example.test");
    vi.stubEnv("AI_API_KEY", "key");
    vi.stubEnv("AI_MODEL", "model");
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "下一问建议",
                body: "水已经有关，别再问水温本身。",
                suggestion: "水在被喝之前被换过吗？",
                chips: ["公开问答", "低 token"]
              })
            }
          }
        ]
      })
    } as unknown as Response);

    const response = await createRoomCompanionAssist(makeRequest(), fetcher as unknown as typeof fetch);

    expect(response.source).toBe("ai");
    expect(response.suggestion).toBe("水在被喝之前被换过吗？");
    const [, init] = fetcher.mock.calls[0];
    const payload = JSON.parse(init.body as string);
    expect(payload.max_tokens).toBeLessThanOrEqual(260);
    expect(payload.messages[1].content.length).toBeLessThan(1800);
    expect(payload.messages[1].content).not.toContain("私有汤底");
  });

  it("builds a prompt that forbids spoiler output", () => {
    const messages = buildRoomCompanionAssistPrompt(makeRequest());

    expect(messages[0].content).toContain("不得输出最终真相");
    expect(messages[0].content).toContain("只输出 JSON");
  });
});
