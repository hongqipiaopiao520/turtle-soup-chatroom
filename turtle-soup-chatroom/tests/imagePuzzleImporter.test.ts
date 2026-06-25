import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildImageImportMessages,
  getImageAiConfig,
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

  it("surfaces model guidance when image content is unreadable", () => {
    expect(() => parseImageImportResponse(JSON.stringify({
      title: "",
      surface: "",
      truth: "",
      correctedNotes: ["图片无法识别或内容为空，请重新上传包含海龟汤题目的完整截图。"]
    }))).toThrow("图片无法识别或内容为空，请重新上传包含海龟汤题目的完整截图。");
  });

  it("parses fenced JSON returned by the model", () => {
    const result = parseImageImportResponse([
      "```json",
      "{\"title\":\"图导入\",\"surface\":\"第一行\\n第二行\",\"truth\":\"真相\",\"correctedNotes\":[]}",
      "```"
    ].join("\n"));

    expect(result).toMatchObject({
      title: "图导入",
      surface: "第一行\n第二行",
      truth: "真相"
    });
  });

  it("falls back to labeled text when the model does not return strict JSON", () => {
    const result = parseImageImportResponse([
      "标题：媳妇的葬礼",
      "",
      "汤面：2月20日，媳妇去世了。",
      "我听到院子里有人窃窃私语。",
      "",
      "汤底：镜子里的人替换了爸爸。",
      "后来妈妈也被替换。",
      "",
      "修正说明：已修正 OCR 错别字"
    ].join("\n"));

    expect(result).toMatchObject({
      title: "媳妇的葬礼",
      surface: "2月20日，媳妇去世了。\n我听到院子里有人窃窃私语。",
      truth: "镜子里的人替换了爸爸。\n后来妈妈也被替换。"
    });
    expect(result.correctedNotes).toEqual(["已修正 OCR 错别字"]);
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

  it("prefers image-specific config and uses api-key auth for the official Mimo gateway", async () => {
    process.env.AI_BASE_URL = "https://text-only.example/v1";
    process.env.AI_API_KEY = "text-key";
    process.env.AI_MODEL = "text-model";
    process.env.AI_IMAGE_BASE_URL = "https://api.xiaomimimo.com/v1";
    process.env.AI_IMAGE_API_KEY = "image-key";
    process.env.AI_IMAGE_MODEL = "mimo-v2.5";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          title: "图导入",
          surface: "汤面",
          truth: "汤底",
          correctedNotes: []
        }) } }]
      })
    } as unknown as Response);

    await importPuzzleTextFromImages({
      images: [{ dataUrl: "data:image/png;base64,abc", role: "full" }]
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.xiaomimimo.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "api-key": "image-key"
        }),
        body: expect.stringContaining('"model":"mimo-v2.5"')
      })
    );
  });

  it("defaults to mimo-v2.5 for xiaomimimo image gateways when no image model is configured", () => {
    delete process.env.AI_IMAGE_MODEL;
    delete process.env.MIMO_IMAGE_MODEL;
    process.env.AI_IMAGE_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";
    process.env.AI_MODEL = "text-model";
    process.env.MIMO_AGENT_MODEL = "mimo-v2.5-pro";

    expect(getImageAiConfig()).toMatchObject({
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      model: "mimo-v2.5",
      authHeader: "authorization"
    });
  });

  it("surfaces upstream provider error messages for image parsing failures", async () => {
    process.env.AI_IMAGE_BASE_URL = "https://api.xiaomimimo.com/v1";
    process.env.AI_IMAGE_API_KEY = "image-key";
    process.env.AI_IMAGE_MODEL = "mimo-v2.5";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        error: { message: "No endpoints found that support image input" }
      }))
    } as unknown as Response);

    await expect(importPuzzleTextFromImages({
      images: [{ dataUrl: "data:image/png;base64,abc", role: "full" }]
    })).rejects.toThrow("图片解析失败：No endpoints found that support image input");
  });
});
