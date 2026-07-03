import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import type { PuzzleRepository } from "../server/storage/puzzleRepository";
import { seedPuzzles } from "../src/data/seedPuzzles";
import type { ManagedPuzzle, PuzzleAiProfile } from "../src/shared/types";

const servers: Server[] = [];

const profile: PuzzleAiProfile = {
  themes: ["亲情", "父母"],
  moods: ["反转"],
  twistTypes: ["误导"],
  contentWarnings: [],
  suitableFor: ["标准局"],
  intensity: { gore: 1, horror: 1, sadness: 3, absurdity: 1 },
  spoilerFreePitch: "不剧透推荐语。",
  estimatedQuestions: 18,
  profileVersion: 1,
  generatedAt: "2026-07-01T00:00:00.000Z"
};

function makeManagedPuzzle(index: number): ManagedPuzzle {
  return {
    ...seedPuzzles[index],
    status: "published",
    hints: [],
    estimatedMinutes: 15,
    qualityScore: 80,
    qualityIssues: [],
    qualitySummary: "ok",
    publishedAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    aiProfile: index === 0 ? profile : { ...profile, themes: ["生活"], spoilerFreePitch: "生活异常开局。" }
  };
}

function makeRepository(): PuzzleRepository {
  const managed = [makeManagedPuzzle(0), makeManagedPuzzle(1)];
  return {
    findById: (id) => managed.find((puzzle) => puzzle.id === id),
    listPublished: () => managed.map(({ truth, solutionPoints, aiProfile, status, rawText, sourceUrl, sourceTitle, hints, estimatedMinutes, qualityScore, qualityIssues, qualitySummary, reviewedAt, publishedAt, updatedAt, ...publicFields }) => {
      void truth;
      void solutionPoints;
      void aiProfile;
      void status;
      void rawText;
      void sourceUrl;
      void sourceTitle;
      void estimatedMinutes;
      void qualityScore;
      void qualityIssues;
      void qualitySummary;
      void reviewedAt;
      void publishedAt;
      void updatedAt;
      return { ...publicFields, hintCount: hints.length };
    }),
    listManaged: (status) => status ? managed.filter((puzzle) => puzzle.status === status) : managed,
    upsertManaged: (puzzle) => puzzle,
    updateManaged: () => { throw new Error("unused"); },
    updateTags: () => { throw new Error("unused"); },
    updateAiProfile: () => { throw new Error("unused"); },
    deleteManaged: () => { throw new Error("unused"); },
    publish: () => { throw new Error("unused"); },
    reject: () => { throw new Error("unused"); }
  };
}

async function listen(app: ReturnType<typeof createApp>) {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server failed");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("opening director route", () => {
  it("returns public opening plans", async () => {
    const baseUrl = await listen(createApp(makeRepository()));
    const response = await fetch(`${baseUrl}/api/agent/opening-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "涉及父母，反转强一点，不要太血腥" })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plans.length).toBeGreaterThan(0);
    expect(body.agentTrace.map((item: { label: string }) => item.label)).toEqual([
      "理解偏好",
      "搜索题库",
      "匹配画像",
      "生成方案",
      "等待确认"
    ]);
    const json = JSON.stringify(body);
    expect(json).not.toContain("truth");
    expect(json).not.toContain("solutionPoints");
    expect(json).not.toContain("aiProfile");
  });

  it("rejects empty prompts", async () => {
    const baseUrl = await listen(createApp(makeRepository()));
    const response = await fetch(`${baseUrl}/api/agent/opening-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "" })
    });

    expect(response.status).toBe(400);
  });
});
