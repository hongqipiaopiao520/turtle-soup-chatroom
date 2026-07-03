import { describe, expect, it, vi } from "vitest";
import { fetchOpeningDirectorPlans } from "../src/client/openingDirector";

describe("opening director client", () => {
  it("posts prompt and returns response", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        intent: { rawText: "父母", themes: [], moods: [], avoidThemes: [], confidence: 1, source: "fallback" },
        plans: [],
        fallbackUsed: false
      })
    } as unknown as Response);

    const result = await fetchOpeningDirectorPlans({ prompt: "父母", limit: 2 }, fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/agent/opening-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "父母", limit: 2 })
    });
    expect(result.plans).toEqual([]);
  });

  it("posts selected decision options", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        intent: { rawText: "刺激", themes: [], moods: ["反转"], avoidThemes: [], confidence: 1, source: "fallback" },
        plans: [],
        agentTrace: [],
        fallbackUsed: false
      })
    } as unknown as Response);

    await fetchOpeningDirectorPlans({ prompt: "刺激", limit: 2, decisionId: "more_reasoning" }, fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/agent/opening-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "刺激", limit: 2, decisionId: "more_reasoning" })
    });
  });
});
