import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPuzzleAiProfilePrompt,
  generatePuzzleAiProfile,
  parsePuzzleAiProfileResponse
} from "../server/puzzleAiProfile";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("puzzle AI profile", () => {
  const input = {
    title: "姥姥的葬礼",
    surface: "2月20日，我和父母回乡下参加姥姥的葬礼。",
    truth: "父母的行为异常和家庭关系有关。",
    difficulty: "hard" as const,
    tags: ["本格", "红汤", "全人类", "高难"],
    estimatedMinutes: 20
  };

  it("builds a prompt that uses private truth but asks for spoiler-free output", () => {
    const prompt = buildPuzzleAiProfilePrompt(input);

    expect(prompt[0].content).toContain("不要输出汤底具体事实");
    expect(prompt[1].content).toContain("汤底");
  });

  it("parses and clamps profile JSON", () => {
    const profile = parsePuzzleAiProfileResponse(JSON.stringify({
      themes: ["亲情", "父母", "亲情"],
      moods: ["压抑"],
      twistTypes: ["关系误导"],
      contentWarnings: ["死亡"],
      suitableFor: ["老手局"],
      intensity: { gore: 9, horror: 2, sadness: 4, absurdity: -1 },
      spoilerFreePitch: "家庭关系里的异常行为是核心误导点。",
      estimatedQuestions: 99
    }), input);

    expect(profile.themes).toEqual(["亲情", "父母"]);
    expect(profile.intensity.gore).toBe(5);
    expect(profile.intensity.absurdity).toBe(0);
    expect(profile.estimatedQuestions).toBe(30);
    expect(profile.profileVersion).toBe(1);
  });

  it("falls back without AI config", async () => {
    const profile = await generatePuzzleAiProfile(input);

    expect(profile.themes.length).toBeGreaterThan(0);
    expect(profile.spoilerFreePitch).toBeTruthy();
  });
});
