import { describe, expect, it, vi } from "vitest";
import { createRoomCompanionSnapshot, fetchRoomCompanionAssist } from "../src/client/roomCompanion";
import { createRoomCompanionBrief } from "../src/shared/roomCompanionAgent";
import type { PublicRoomState } from "../src/shared/types";

function makeRoom(): PublicRoomState {
  return {
    id: "room-companion-client",
    hostPersonaId: "xiaowai",
    puzzle: {
      id: "puzzle-client",
      title: "冷掉的水",
      surface: "男人喝了一口冷水后立刻报警。",
      difficulty: "easy",
      tags: ["生活", "本格"],
      author: "测试",
      rating: 7.1,
      plays: 88,
      createdAt: "2026-06-23",
      hintCount: 0
    },
    status: "playing",
    players: [],
    hostLog: [
      {
        id: "a1",
        playerId: "p1",
        playerName: "玩家",
        question: "水的状态关键吗？",
        answerType: "partial",
        answer: "有关。",
        progress: 36,
        progressDelta: 12,
        contributionScore: 50,
        isBreakthrough: true,
        pinned: false,
        createdAt: "2026-06-23T00:01:00.000Z"
      }
    ],
    chatMessages: [],
    caseNotes: [],
    questionLimit: 20,
    questionsUsed: 1,
    progress: 36,
    answerUnlocked: false,
    truthRevealed: false,
    truth: "私有汤底不能发送给陪玩 Agent。",
    settlement: undefined,
    hintsRevealed: 0,
    hintRequestedBy: [],
    revealedHints: [],
    createdAt: "2026-06-23T00:00:00.000Z"
  };
}

describe("room companion client", () => {
  it("posts a compact public snapshot without truth", async () => {
    const room = makeRoom();
    const snapshot = createRoomCompanionSnapshot(room, createRoomCompanionBrief(room));
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        action: "next_question",
        title: "下一问建议",
        body: "公开线索摘要。",
        suggestion: "继续追水的状态。",
        chips: ["低 token"],
        source: "fallback",
        cached: false
      })
    } as unknown as Response);

    await fetchRoomCompanionAssist({ action: "next_question", snapshot }, fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/agent/room-companion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String)
    });
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.action).toBe("next_question");
    expect(body.snapshot.recentAnswers).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("私有汤底");
  });
});
