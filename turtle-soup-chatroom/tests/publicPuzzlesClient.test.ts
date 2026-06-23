import { describe, expect, it, vi } from "vitest";
import { fetchPublicPuzzles } from "../src/client/puzzles";

describe("fetchPublicPuzzles", () => {
  it("loads public puzzles from the API", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: "public-puzzle",
          title: "公开题",
          surface: "一个人笑了。",
          solutionPoints: ["关键点"],
          difficulty: "easy",
          tags: ["入门"],
          author: "测试",
          rating: 8,
          plays: 1,
          createdAt: "2026-06-23"
        }
      ])
    });

    await expect(fetchPublicPuzzles(fetcher as unknown as typeof fetch)).resolves.toEqual([
      expect.objectContaining({ id: "public-puzzle", title: "公开题" })
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/puzzles");
  });

  it("throws when the API returns an error", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchPublicPuzzles(fetcher as unknown as typeof fetch)).rejects.toThrow("题库加载失败：500");
  });
});
