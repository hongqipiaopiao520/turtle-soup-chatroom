import { describe, expect, it } from "vitest";
import type { ManagedPuzzle } from "../src/shared/types";
import { createPuzzleAgentAudit } from "../src/shared/puzzleAgentAudit";

function makePuzzle(): ManagedPuzzle {
  return {
    id: "audit-puzzle",
    title: "雨夜站台",
    surface: "深夜的站台空无一人，女孩却向空气道谢，然后消失了。",
    truth: "女孩正在参加一次沉浸式告别仪式。",
    solutionPoints: ["沉浸式告别仪式", "不是真的消失"],
    difficulty: "medium",
    tags: ["悬疑", "温情"],
    author: "测试",
    rating: 8.1,
    plays: 42,
    createdAt: "2026-06-23T00:00:00.000Z",
    status: "published",
    hints: ["注意耳机"],
    estimatedMinutes: 16,
    qualityScore: 86,
    qualityIssues: [],
    qualitySummary: "结构完整，可以人工复核。",
    updatedAt: "2026-06-23T00:01:00.000Z",
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
}

describe("puzzle agent audit", () => {
  it("audits agent readiness without exposing the puzzle truth", () => {
    const audit = createPuzzleAgentAudit(makePuzzle());

    expect(audit.profileCompleteness).toBeGreaterThanOrEqual(80);
    expect(audit.recommendationReadiness).toBe("高");
    expect(audit.spoilerRisk).toBe("低");
    expect(audit.tagConfidence).toBe("中");
    expect(audit.suggestions.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain("沉浸式告别仪式");
  });

  it("marks puzzles without profiles as not ready", () => {
    const audit = createPuzzleAgentAudit({ ...makePuzzle(), aiProfile: undefined });

    expect(audit.profileCompleteness).toBeLessThan(50);
    expect(audit.recommendationReadiness).toBe("低");
    expect(audit.suggestions).toContain("先生成 AI 画像，再进入开局 Agent 推荐池。");
  });
});
