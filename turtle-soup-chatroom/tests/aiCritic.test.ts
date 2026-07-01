import { afterEach, describe, expect, it, vi } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { buildCriticPrompt, parseCriticResponse, reviewHostAnswer, type ReviewHostAnswerInput } from "../server/aiCritic";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function makeInput(): ReviewHostAnswerInput {
  return {
    roomId: "room-1",
    puzzle: seedPuzzles[0],
    hostPersonaId: "dav",
    currentProgress: 42,
    history: [],
    answer: {
      id: "answer-1",
      playerId: "player-1",
      playerName: "玩家",
      question: "她是在告别吗？",
      answerType: "partial",
      answer: "部分相关",
      styleText: "这次总算有点方向。😏",
      progress: 42,
      progressDelta: 20,
      contributionScore: 250,
      isBreakthrough: true,
      pinned: false,
      coveredPointIds: ["point-1"],
      coverageConfidence: 0.8,
      createdAt: "2026-06-23T00:00:00.000Z"
    }
  };
}

function configureCriticEnv() {
  process.env.AI_CRITIC_BASE_URL = "https://critic.example/v1";
  process.env.AI_CRITIC_API_KEY = "critic-key";
  process.env.AI_CRITIC_MODEL = "critic-model";
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

describe("aiCritic", () => {
  it("parses structured critic JSON", () => {
    const review = parseCriticResponse(JSON.stringify({
      status: "flagged",
      severity: "medium",
      action: "downgrade_progress",
      risks: ["progress_inflation"],
      rationale: "进度偏高",
      suggestedProgress: 30,
      confidence: 0.72
    }), { model: "critic-model", durationMs: 120 });

    expect(review).toMatchObject({
      status: "flagged",
      severity: "medium",
      action: "downgrade_progress",
      risks: ["progress_inflation"],
      rationale: "进度偏高",
      suggestedProgress: 30,
      confidence: 0.72,
      model: "critic-model",
      durationMs: 120
    });
    expect(review.id).toMatch(/^critic_/);
    expect(review.reviewedAt).toBeTruthy();
  });

  it("falls back to an error review for malformed model output", () => {
    const review = parseCriticResponse("不是 JSON");

    expect(review).toMatchObject({
      status: "error",
      action: "manual_review",
      risks: ["parse_error"]
    });
  });

  it("normalizes markdown and loose critic fields", () => {
    const review = parseCriticResponse('```json\n{"status":"warning","severity":"高","action":"review","risks":["剧透风险","进度虚高"],"reason":"可能说多了","confidence":"0.66"}\n```');

    expect(review).toMatchObject({
      status: "flagged",
      severity: "high",
      action: "manual_review",
      risks: ["spoiler", "progress_inflation"],
      rationale: "可能说多了",
      confidence: 0.66
    });
  });

  it("builds a prompt with truth, host answer, and review rules", () => {
    const messages = buildCriticPrompt(makeInput());
    const prompt = `${messages[0].content}\n${messages[1].content}`;

    expect(prompt).toContain("质检员");
    expect(prompt).toContain(seedPuzzles[0].truth);
    expect(prompt).toContain("是否剧透");
    expect(prompt).toContain("她是在告别吗？");
    expect(prompt).toContain("progressDelta=20");
  });

  it("calls the critic model and parses the review", async () => {
    configureCriticEnv();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          status: "passed",
          severity: "none",
          action: "allow",
          risks: [],
          rationale: "未发现明显问题。",
          confidence: 0.9
        }) } }]
      })
    } as unknown as Response);

    await expect(reviewHostAnswer(makeInput())).resolves.toMatchObject({
      status: "passed",
      action: "allow",
      model: "critic-model"
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://critic.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer critic-key" }),
        body: expect.stringContaining('"model":"critic-model"')
      })
    );
  });

  it("returns an error review when critic config is missing", async () => {
    await expect(reviewHostAnswer(makeInput())).resolves.toMatchObject({
      status: "error",
      risks: ["critic_unavailable"]
    });
  });
});
