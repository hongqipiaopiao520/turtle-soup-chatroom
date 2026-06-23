import { describe, expect, it, vi } from "vitest";
import {
  collectPuzzles,
  extractPuzzleCandidates,
  stripHtmlToText
} from "../scripts/collect-puzzles.mjs";

describe("collect-puzzles", () => {
  it("strips html into readable text", () => {
    expect(stripHtmlToText("<main><h1>雨夜站台</h1><p>汤面：女孩消失。</p><script>bad()</script></main>"))
      .toContain("雨夜站台\n汤面：女孩消失。");
  });

  it("extracts puzzle candidates from title, surface, and truth sections", () => {
    const candidates = extractPuzzleCandidates(
      "标题：冷掉的水\n汤面：男人喝了一口冷水后报警。\n汤底：他发现家里有人进来过。",
      "https://example.test/puzzle",
      "来源标题"
    );

    expect(candidates).toEqual([
      {
        rawText: "标题：冷掉的水\n汤面：男人喝了一口冷水后报警。\n汤底：他发现家里有人进来过。",
        sourceUrl: "https://example.test/puzzle",
        sourceTitle: "来源标题"
      }
    ]);
  });

  it("fetches direct urls and posts candidates to the admin import endpoint", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue("<title>来源 A</title><article><h1>冷掉的水</h1><p>汤面：男人喝冷水后报警。</p><p>汤底：杯中水被换过。</p></article>")
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "imported" })
      });

    await expect(collectPuzzles({
      urls: ["https://example.test/a"],
      adminBaseUrl: "http://localhost:8787",
      adminToken: "secret",
      fetcher: fetcher as unknown as typeof fetch
    })).resolves.toEqual({ imported: 1, skipped: 0, failed: [] });

    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:8787/api/admin/puzzles/import-text", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({
        rawText: "冷掉的水\n汤面：男人喝冷水后报警。\n汤底：杯中水被换过。",
        sourceUrl: "https://example.test/a",
        sourceTitle: "来源 A"
      })
    });
  });

  it("uses a configured search endpoint for query input", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [{ title: "搜索结果", url: "https://example.test/result" }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue("<h1>搜索结果</h1><p>汤面：有人笑了。</p><p>汤底：铃声是暗号。</p>")
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "imported" })
      });

    const result = await collectPuzzles({
      queries: ["海龟汤"],
      searchEndpoint: "https://search.example.test/api",
      adminBaseUrl: "http://localhost:8787",
      fetcher: fetcher as unknown as typeof fetch
    });

    expect(result.imported).toBe(1);
    expect(fetcher).toHaveBeenNthCalledWith(1, "https://search.example.test/api?q=%E6%B5%B7%E9%BE%9F%E6%B1%A4");
  });
});
