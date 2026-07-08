import { describe, expect, it } from "vitest";
import type { PublicRoomState } from "../src/shared/types";
import { createRoomCompanionBrief } from "../src/shared/roomCompanionAgent";

function makeRoom(): PublicRoomState {
  return {
    id: "room-companion",
    hostPersonaId: "xiaowai",
    puzzle: {
      id: "puzzle-companion",
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
        question: "这件事发生在室内吗？",
        answerType: "yes",
        answer: "是。",
        progress: 12,
        progressDelta: 12,
        contributionScore: 20,
        isBreakthrough: false,
        pinned: false,
        createdAt: "2026-06-23T00:01:00.000Z"
      },
      {
        id: "a2",
        playerId: "p1",
        playerName: "玩家",
        question: "报警和水本身有关吗？",
        answerType: "partial",
        answer: "有关，但不是水温本身。",
        progress: 28,
        progressDelta: 16,
        contributionScore: 30,
        isBreakthrough: true,
        pinned: true,
        createdAt: "2026-06-23T00:02:00.000Z"
      },
      {
        id: "a3",
        playerId: "p1",
        playerName: "玩家",
        question: "他在国外吗？",
        answerType: "irrelevant",
        answer: "无关。",
        progress: 28,
        progressDelta: 0,
        contributionScore: 0,
        isBreakthrough: false,
        pinned: false,
        createdAt: "2026-06-23T00:03:00.000Z"
      }
    ],
    chatMessages: [],
    caseNotes: [],
    questionLimit: 20,
    questionsUsed: 3,
    progress: 28,
    answerUnlocked: false,
    truthRevealed: false,
    truth: "私有汤底不能出现在陪玩 Agent 输出里。",
    settlement: undefined,
    hintsRevealed: 0,
    hintRequestedBy: [],
    revealedHints: [],
    createdAt: "2026-06-23T00:00:00.000Z"
  };
}

describe("room companion agent", () => {
  it("summarizes public host history without leaking truth", () => {
    const brief = createRoomCompanionBrief(makeRoom());

    expect(brief.confirmed).toContain("这件事发生在室内吗？");
    expect(brief.toVerify).toContain("报警和水本身有关吗？");
    expect(brief.offTrack).toContain("他在国外吗？");
    expect(brief.nextQuestion).toContain("水");
    expect(brief.stageLabel).toBe("建立边界");
    expect(brief.progressNote).toContain("28%");
    expect(brief.pulse).toContain("偏离主线");
    expect(JSON.stringify(brief)).not.toContain("私有汤底");
  });

  it("changes stage copy with room progress", () => {
    expect(createRoomCompanionBrief({ ...makeRoom(), hostLog: [], questionsUsed: 0, progress: 0 }).stageLabel).toBe("破冰建模");
    expect(createRoomCompanionBrief({ ...makeRoom(), questionsUsed: 8, progress: 72 }).stageLabel).toBe("收束推理");
    expect(createRoomCompanionBrief({ ...makeRoom(), questionsUsed: 16, progress: 92 }).stageLabel).toBe("临门一脚");
    expect(createRoomCompanionBrief({ ...makeRoom(), answerUnlocked: true, status: "solved", progress: 100 }).stageLabel).toBe("复盘整理");
  });
});
