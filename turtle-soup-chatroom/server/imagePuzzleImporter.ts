import { z } from "zod";
import { getAiHostConfig } from "./aiHost";

const ImageImportSchema = z.object({
  title: z.string().trim().max(80).default(""),
  surface: z.string().trim().min(1),
  truth: z.string().trim().min(1),
  correctedNotes: z.array(z.string().trim()).default([])
});

export interface ImageImportInput {
  images: Array<{ dataUrl: string; role?: "auto" | "surface" | "truth" | "full" }>;
}

export interface ImageImportResult {
  title: string;
  surface: string;
  truth: string;
  rawText: string;
  correctedNotes: string[];
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseJsonObject(raw: string) {
  const trimmed = raw.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    throw new Error("图片解析失败：AI 返回格式不合格");
  }
}

function composeRawText(input: { title: string; surface: string; truth: string }) {
  return [
    `标题：${input.title || "图片导入题目"}`,
    `汤面：${input.surface}`,
    `汤底：${input.truth}`
  ].join("\n");
}

export function parseImageImportResponse(raw: string): ImageImportResult {
  const parsed = ImageImportSchema.parse(parseJsonObject(raw));
  const title = normalizeNewlines(parsed.title);
  const surface = normalizeNewlines(parsed.surface);
  const truth = normalizeNewlines(parsed.truth);
  return {
    title,
    surface,
    truth,
    rawText: composeRawText({ title, surface, truth }),
    correctedNotes: parsed.correctedNotes.map(normalizeNewlines).filter(Boolean)
  };
}

export function buildImageImportMessages(input: ImageImportInput) {
  return [
    {
      role: "system" as const,
      content: [
        {
          type: "text",
          text: [
            "你是海龟汤题库图片导入助手。",
            "请从用户上传的截图中识别标题、汤面和汤底。",
            "必须修正明显 OCR 错别字，但不要改写剧情事实。",
            "必须保留原图中的段落换行，尤其是日期、日记、分段叙事。",
            "如果图片分别是汤面和汤底，请按图片内容合并。",
            "只输出 JSON，不要 Markdown。",
            "JSON 格式：{\"title\":\"标题\",\"surface\":\"保留换行的汤面\",\"truth\":\"保留换行的汤底\",\"correctedNotes\":[\"修正说明\"]}"
          ].join("\n")
        }
      ]
    },
    {
      role: "user" as const,
      content: [
        {
          type: "text",
          text: input.images.map((image, index) => `图片 ${index + 1} 类型：${image.role ?? "auto"}`).join("\n")
        },
        ...input.images.map((image) => ({
          type: "image_url",
          image_url: { url: image.dataUrl }
        }))
      ]
    }
  ];
}

export async function importPuzzleTextFromImages(input: ImageImportInput): Promise<ImageImportResult> {
  if (input.images.length === 0) throw new Error("请先选择图片");
  const { baseUrl, apiKey, model } = getAiHostConfig();
  if (!baseUrl || !apiKey || !model) throw new Error("AI 未配置");

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: buildImageImportMessages(input)
    })
  });

  if (!response.ok) throw new Error(`图片解析失败：HTTP ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("图片解析失败：AI 返回内容为空");
  return parseImageImportResponse(content);
}
