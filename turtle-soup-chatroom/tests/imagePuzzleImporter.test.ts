import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildImageImportMessages,
  importPuzzleTextFromImages,
  parseImageImportResponse
} from "../server/imagePuzzleImporter";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

describe("imagePuzzleImporter", () => {
  it("parses image import JSON and preserves original line breaks", () => {
    const result = parseImageImportResponse(JSON.stringify({
      title: "媳妇的葬礼",
      surface: "2月20日，媳妇去世了。\n我听到院子里有人窃窃私语。\n\n2月21日，妈妈说爸爸不对劲。",
      truth: "镜子里的人替换了爸爸。\n后来妈妈也被替换。",
      correctedNotes: ["修正：窃紫 -> 窃窃私语"]
    }));

    expect(result.rawText).toBe([
      "标题：媳妇的葬礼",
      "汤面：2月20日，媳妇去世了。\n我听到院子里有人窃窃私语。\n\n2月21日，妈妈说爸爸不对劲。",
      "汤底：镜子里的人替换了爸爸。\n后来妈妈也被替换。"
    ].join("\n"));
    expect(result.correctedNotes).toEqual(["修正：窃紫 -> 窃窃私语"]);
  });

  it("builds multimodal messages with image roles", () => {
    const messages = buildImageImportMessages({
      images: [
        { dataUrl: "data:image/png;base64,abc", role: "surface" },
        { dataUrl: "data:image/png;base64,def", role: "truth" }
      ]
    });

    expect(JSON.stringify(messages)).toContain("保留原图中的段落换行");
    expect(JSON.stringify(messages)).toContain("图片 1 类型：surface");
    expect(JSON.stringify(messages)).toContain("data:image/png;base64,def");
  });

  it("calls the configured multimodal model", async () => {
    process.env.AI_BASE_URL = "https://example.test";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "mimo-vision";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          title: "图导入",
          surface: "汤面第一行\n汤面第二行",
          truth: "汤底第一行\n汤底第二行",
          correctedNotes: []
        }) } }]
      })
    } as unknown as Response);

    const result = await importPuzzleTextFromImages({
      images: [{ dataUrl: "data:image/png;base64,abc", role: "full" }]
    });

    expect(result.rawText).toContain("汤面第一行\n汤面第二行");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.test/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining("mimo-vision")
      })
    );
  });
});
