import { z } from "zod";

const ImageImportSchema = z.object({
  title: z.string().trim().max(80).default(""),
  surface: z.string().trim().default(""),
  truth: z.string().trim().default(""),
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

interface ImageAiConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  authHeader: "authorization" | "api-key";
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
}

function parseJsonObject(raw: string) {
  const jsonText = extractJsonText(raw);
  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    try {
      return JSON.parse(JSON.parse(jsonText)) as unknown;
    } catch {
      const labeled = parseLabeledText(raw);
      if (labeled) return labeled;
      throw new Error("图片解析失败：AI 返回格式不合格");
    }
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
  const correctedNotes = parsed.correctedNotes.map(normalizeNewlines).filter(Boolean);
  if (!surface || !truth) {
    throw new Error(correctedNotes[0] || "图片解析失败：未识别到完整的汤面和汤底");
  }
  return {
    title,
    surface,
    truth,
    rawText: composeRawText({ title, surface, truth }),
    correctedNotes
  };
}

function parseLabeledText(raw: string) {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  const title = readLabeledSection(normalized, ["标题"]);
  const surface = readLabeledSection(normalized, ["汤面"]);
  const truth = readLabeledSection(normalized, ["汤底"]);
  const correctedNote = readLabeledSection(normalized, ["修正说明", "修正", "备注"]);
  if (!surface || !truth) return null;
  return {
    title: title || "",
    surface,
    truth,
    correctedNotes: correctedNote ? [correctedNote] : []
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

export function getImageAiConfig(): ImageAiConfig {
  const baseUrl =
    process.env.AI_IMAGE_BASE_URL ||
    process.env.MIMO_IMAGE_BASE_URL ||
    process.env.AI_BASE_URL ||
    process.env.MIMO_BASE_URL;
  const apiKey =
    process.env.AI_IMAGE_API_KEY ||
    process.env.MIMO_IMAGE_API_KEY ||
    process.env.AI_API_KEY ||
    process.env.MIMO_API_KEY;
  const model =
    process.env.AI_IMAGE_MODEL ||
    process.env.MIMO_IMAGE_MODEL ||
    (baseUrl && /xiaomimimo\.com/i.test(baseUrl) ? "mimo-v2.5" : undefined) ||
    process.env.AI_MODEL ||
    process.env.MIMO_AGENT_MODEL;
  const authHeader = isOfficialMimoBaseUrl(baseUrl) ? "api-key" : "authorization";
  return { baseUrl, apiKey, model, authHeader };
}

export async function importPuzzleTextFromImages(input: ImageImportInput): Promise<ImageImportResult> {
  if (input.images.length === 0) throw new Error("请先选择图片");
  const { baseUrl, apiKey, model, authHeader } = getImageAiConfig();
  if (!baseUrl || !apiKey || !model) throw new Error("AI 未配置");

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader === "api-key"
        ? { "api-key": apiKey }
        : { Authorization: `Bearer ${apiKey}` })
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 1024,
      temperature: 0.1,
      top_p: 0.95,
      stream: false,
      stop: null,
      frequency_penalty: 0,
      presence_penalty: 0,
      response_format: { type: "json_object" },
      messages: buildImageImportMessages(input)
    })
  });

  if (!response.ok) {
    const providerMessage = await readProviderErrorMessage(response);
    throw new Error(providerMessage ? `图片解析失败：${providerMessage}` : `图片解析失败：HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("图片解析失败：AI 返回内容为空");
  return parseImageImportResponse(content);
}

function isOfficialMimoBaseUrl(baseUrl?: string) {
  return Boolean(baseUrl && /:\/\/api\.xiaomimimo\.com(?:\/|$)/i.test(baseUrl));
}

async function readProviderErrorMessage(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw.trim()) return "";
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
    return parsed.error?.message || parsed.message || raw;
  } catch {
    return raw;
  }
}

function readLabeledSection(raw: string, labels: string[]) {
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const matchedLabel = labels.find((label) => line.startsWith(`${label}：`) || line.startsWith(`${label}:`));
    if (!matchedLabel) continue;
    const inline = line.replace(new RegExp(`^${matchedLabel}[：:]\\s*`), "").trim();
    const collected = inline ? [inline] : [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor];
      const trimmed = next.trim();
      if (labels.some((label) => trimmed.startsWith(`${label}：`) || trimmed.startsWith(`${label}:`))) break;
      if (/^(标题|汤面|汤底|修正说明|修正|备注)[：:]/.test(trimmed)) break;
      if (!trimmed && collected.length === 0) continue;
      if (!trimmed && collected.length > 0) {
        collected.push("");
        continue;
      }
      collected.push(next.trimEnd());
    }
    return normalizeNewlines(collected.join("\n"));
  }
  return "";
}
