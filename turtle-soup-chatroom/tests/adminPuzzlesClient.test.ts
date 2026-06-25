import { describe, expect, it, vi } from "vitest";
import {
  fetchAdminPuzzles,
  importAdminPuzzleText,
  parseAdminPuzzleImages,
  publishAdminPuzzleBatch,
  publishAdminPuzzle,
  rejectAdminPuzzle,
  updateAdminPuzzle
} from "../src/client/adminPuzzles";

function jsonResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(payload)
  };
}

describe("admin puzzle client", () => {
  it("loads managed puzzles with an optional status and token", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse([{ id: "puzzle-1", title: "题目一" }]));

    await expect(fetchAdminPuzzles({ status: "reviewing", token: "secret", fetcher: fetcher as unknown as typeof fetch }))
      .resolves.toEqual([expect.objectContaining({ id: "puzzle-1" })]);

    expect(fetcher).toHaveBeenCalledWith("/api/admin/puzzles?status=reviewing", {
      headers: { Authorization: "Bearer secret" }
    });
  });

  it("imports raw text through the admin API", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ id: "imported", title: "导入题" }));

    await importAdminPuzzleText(
      { rawText: "题目原文", sourceTitle: "来源", sourceUrl: "https://example.test/a" },
      { token: "secret", fetcher: fetcher as unknown as typeof fetch }
    );

    expect(fetcher).toHaveBeenCalledWith("/api/admin/puzzles/import-text", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({ rawText: "题目原文", sourceTitle: "来源", sourceUrl: "https://example.test/a" })
    });
  });

  it("parses puzzle screenshots through the admin API", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      rawText: "标题：图导入\n汤面：第一行\n第二行\n汤底：真相"
    }));
    const surface = makeTestFile("surface", "surface.png");
    const truth = makeTestFile("truth", "truth.png");

    await parseAdminPuzzleImages(
      {
        images: [
          { file: surface, role: "surface" },
          { file: truth, role: "truth" }
        ]
      },
      { token: "secret", fetcher: fetcher as unknown as typeof fetch }
    );

    expect(fetcher).toHaveBeenCalledWith("/api/admin/puzzles/import-images/parse", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
      body: expect.any(FormData)
    });
    const body = fetcher.mock.calls[0]?.[1]?.body as FormData;
    expect(body.getAll("images").map((file) => (file as File).name)).toEqual(["surface.png", "truth.png"]);
    expect(body.getAll("roles")).toEqual(["surface", "truth"]);
  });

  it("updates a managed puzzle", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ id: "puzzle-1", title: "新标题" }));

    await updateAdminPuzzle(
      "puzzle-1",
      {
        title: "新标题",
        surface: "汤面",
        truth: "汤底",
        solutionPoints: ["关键点"],
        hints: [],
        difficulty: "easy",
        tags: ["入门"],
        qualityScore: 70,
        qualityIssues: [],
        qualitySummary: "可发布"
      },
      { fetcher: fetcher as unknown as typeof fetch }
    );

    expect(fetcher).toHaveBeenCalledWith("/api/admin/puzzles/puzzle-1", expect.objectContaining({
      method: "PUT",
      headers: { "Content-Type": "application/json" }
    }));
  });

  it("publishes and rejects managed puzzles", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ id: "puzzle-1", status: "published" }));

    await publishAdminPuzzle("puzzle-1", { token: "secret", fetcher: fetcher as unknown as typeof fetch });
    await rejectAdminPuzzle("puzzle-2", { token: "secret", fetcher: fetcher as unknown as typeof fetch });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/admin/puzzles/puzzle-1/publish", {
      method: "POST",
      headers: { Authorization: "Bearer secret" }
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/admin/puzzles/puzzle-2/reject", {
      method: "POST",
      headers: { Authorization: "Bearer secret" }
    });
  });

  it("publishes several managed puzzles and reports row-level failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "puzzle-1", status: "published" }))
      .mockResolvedValueOnce(jsonResponse({ message: "已经被删除" }, { ok: false, status: 404 }));

    const result = await publishAdminPuzzleBatch(["puzzle-1", "puzzle-2"], {
      token: "secret",
      fetcher: fetcher as unknown as typeof fetch
    });

    expect(result.published).toEqual([expect.objectContaining({ id: "puzzle-1" })]);
    expect(result.failed).toEqual([{ id: "puzzle-2", message: "已经被删除" }]);
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/admin/puzzles/puzzle-1/publish", {
      method: "POST",
      headers: { Authorization: "Bearer secret" }
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/admin/puzzles/puzzle-2/publish", {
      method: "POST",
      headers: { Authorization: "Bearer secret" }
    });
  });

  it("throws with the API message when a request fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ message: "未授权" }, { ok: false, status: 401 }));

    await expect(fetchAdminPuzzles({ fetcher: fetcher as unknown as typeof fetch })).rejects.toThrow("未授权");
  });
});

function makeTestFile(content: string, name: string) {
  const file = new Blob([content], { type: "image/png" }) as File;
  Object.defineProperty(file, "name", { value: name });
  return file;
}
