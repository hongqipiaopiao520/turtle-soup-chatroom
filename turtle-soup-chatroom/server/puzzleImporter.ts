import { z } from "zod";
import type { Difficulty, ManagedPuzzle } from "../src/shared/types";
import { getAiHostConfig } from "./aiHost";

const PuzzleImportSchema = z.object({
  title: z.string().min(1).max(60),
  surface: z.string().min(1).max(240),
  truth: z.string().min(1).max(1000),
  solutionPoints: z.array(z.string().min(1)).min(1).max(10),
  hints: z.array(z.string().min(1)).max(8).default([]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string().min(1)).max(8).default([]),
  qualityScore: z.number().min(0).max(100),
  qualityIssues: z.array(z.string()).max(12).default([]),
  qualitySummary: z.string().max(400).default("")
});

export interface PuzzleImportResult {
  puzzle: ManagedPuzzle;
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeRawText(rawText: string) {
  return rawText.trim().replace(/\r\n/g, "\n");
}

function fallbackTitle(rawText: string) {
  return normalizeRawText(rawText).split("\n").find(Boolean)?.slice(0, 40) || "未命名题目";
}

function createManagedPuzzle(input: {
  rawText: string;
  title: string;
  surface: string;
  truth: string;
  solutionPoints: string[];
  hints: string[];
  difficulty: Difficulty;
  tags: string[];
  qualityScore: number;
  qualityIssues: string[];
  qualitySummary: string;
  status: "draft" | "reviewing";
  sourceUrl?: string;
  sourceTitle?: string;
}): ManagedPuzzle {
  const now = new Date().toISOString();
  return {
    id: id("puzzle"),
    title: input.title,
    surface: input.surface,
    truth: input.truth,
    solutionPoints: input.solutionPoints,
    difficulty: input.difficulty,
    tags: input.tags,
    author: "题库导入",
    rating: 0,
    plays: 0,
    createdAt: now,
    status: input.status,
    rawText: normalizeRawText(input.rawText),
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    hints: input.hints,
    estimatedMinutes: 15,
    qualityScore: Math.round(input.qualityScore),
    qualityIssues: input.qualityIssues,
    qualitySummary: input.qualitySummary,
    updatedAt: now
  };
}

export function parsePuzzleImportResponse(raw: string, rawText = "", sourceUrl?: string, sourceTitle?: string): ManagedPuzzle {
  const parsed = PuzzleImportSchema.parse(JSON.parse(raw));
  return createManagedPuzzle({
    rawText,
    sourceUrl,
    sourceTitle,
    title: parsed.title,
    surface: parsed.surface,
    truth: parsed.truth,
    solutionPoints: parsed.solutionPoints,
    hints: parsed.hints,
    difficulty: parsed.difficulty,
    tags: parsed.tags,
    qualityScore: parsed.qualityScore,
    qualityIssues: parsed.qualityIssues,
    qualitySummary: parsed.qualitySummary,
    status: "reviewing"
  });
}

export function createFallbackDraft(rawText: string, sourceUrl?: string, sourceTitle?: string): ManagedPuzzle {
  const normalized = normalizeRawText(rawText);
  return createManagedPuzzle({
    rawText: normalized,
    sourceUrl,
    sourceTitle,
    title: fallbackTitle(normalized),
    surface: normalized.slice(0, 180) || "待补充汤面",
    truth: "待结构化汤底",
    solutionPoints: [],
    hints: [],
    difficulty: "medium",
    tags: [],
    qualityScore: 0,
    qualityIssues: ["LLM 结构化失败"],
    qualitySummary: "原始文本已保存，等待重新结构化。",
    status: "draft"
  });
}

function buildImportPrompt(rawText: string) {
  return [
    {
      role: "system" as const,
      content: [
        "你是海龟汤题库编辑。",
        "请把用户提供的原始题目整理成适合线上多人推理的结构化题目。",
        "不要输出 Markdown，只输出 JSON。",
        "JSON 字段：title, surface, truth, solutionPoints, hints, difficulty, tags, qualityScore, qualityIssues, qualitySummary。",
        "difficulty 只能是 easy、medium、hard。",
        "solutionPoints 是后续 AI 主持评分依据，必须拆成 3 到 8 个关键事实。"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: rawText
    }
  ];
}

export async function importPuzzleFromText(rawText: string, sourceUrl?: string, sourceTitle?: string): Promise<PuzzleImportResult> {
  const { baseUrl, apiKey, model } = getAiHostConfig();
  const normalized = normalizeRawText(rawText);
  if (!baseUrl || !apiKey || !model) {
    return { puzzle: createFallbackDraft(normalized, sourceUrl, sourceTitle) };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: buildImportPrompt(normalized)
      })
    });

    if (!response.ok) {
      return { puzzle: createFallbackDraft(normalized, sourceUrl, sourceTitle) };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return {
      puzzle: parsePuzzleImportResponse(payload.choices?.[0]?.message?.content || "", normalized, sourceUrl, sourceTitle)
    };
  } catch {
    return { puzzle: createFallbackDraft(normalized, sourceUrl, sourceTitle) };
  }
}
