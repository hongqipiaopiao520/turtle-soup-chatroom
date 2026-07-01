import { z } from "zod";
import type { HostAnswer, HostCriticReview, HostPersonaId, Puzzle } from "../src/shared/types";
import { parseSolutionPointDefinitions } from "./puzzleImporter";

const criticRisks = [
  "spoiler",
  "invalid_misuse",
  "progress_inflation",
  "style_boundary",
  "hallucination",
  "mode_violation",
  "parse_error",
  "critic_unavailable"
] as const;

const CriticReviewSchema = z.object({
  status: z.enum(["passed", "flagged", "error"]),
  severity: z.enum(["none", "low", "medium", "high"]),
  action: z.enum(["allow", "strip_style", "downgrade_progress", "replace_with_fallback", "manual_review"]),
  risks: z.array(z.enum(criticRisks)).default([]),
  rationale: z.string().max(500).default(""),
  suggestedAnswerType: z.enum(["yes", "no", "irrelevant", "partial", "invalid", "solved", "unsolved"]).optional(),
  suggestedAnswer: z.string().max(240).optional(),
  suggestedStyleText: z.string().max(120).optional(),
  suggestedProgress: z.number().min(0).max(100).optional(),
  suggestedCoveredPointIds: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).default(0)
});

export interface ReviewHostAnswerInput {
  roomId: string;
  puzzle: Puzzle;
  hostPersonaId: HostPersonaId;
  currentProgress: number;
  history: HostAnswer[];
  answer: HostAnswer;
}

export function getCriticConfig() {
  return {
    baseUrl: process.env.AI_CRITIC_BASE_URL || process.env.AI_BASE_URL || process.env.MIMO_BASE_URL,
    apiKey: process.env.AI_CRITIC_API_KEY || process.env.AI_API_KEY || process.env.MIMO_API_KEY,
    model: process.env.AI_CRITIC_MODEL || process.env.AI_MODEL || process.env.MIMO_AGENT_MODEL
  };
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function now() {
  return new Date().toISOString();
}

function clampConfidence(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function baseReview(input: Omit<HostCriticReview, "id" | "durationMs" | "reviewedAt">, durationMs = 0): HostCriticReview {
  return {
    id: id("critic"),
    ...input,
    confidence: clampConfidence(input.confidence),
    durationMs,
    reviewedAt: now()
  };
}

export function errorCriticReview(message: string, durationMs = 0): HostCriticReview {
  return baseReview({
    status: "error",
    severity: "low",
    action: "manual_review",
    risks: ["critic_unavailable"],
    rationale: message,
    confidence: 0
  }, durationMs);
}

function extractJsonText(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) return fenced.trim();
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw;
}

function normalizeCriticStatus(value: unknown): HostCriticReview["status"] {
  const text = String(value ?? "").trim().toLowerCase();
  if (["passed", "pass", "ok", "通过", "正常", "无问题"].includes(text)) return "passed";
  if (["flagged", "flag", "warning", "warn", "risk", "风险", "警告", "需复核", "需要复核"].includes(text)) return "flagged";
  return "error";
}

function normalizeSeverity(value: unknown): HostCriticReview["severity"] {
  const text = String(value ?? "").trim().toLowerCase();
  if (["none", "无", "无风险"].includes(text)) return "none";
  if (["medium", "mid", "中", "中等"].includes(text)) return "medium";
  if (["high", "严重", "高", "高危"].includes(text)) return "high";
  return "low";
}

function normalizeAction(value: unknown): HostCriticReview["action"] {
  const text = String(value ?? "").trim().toLowerCase();
  if (["allow", "pass", "通过", "允许"].includes(text)) return "allow";
  if (["strip_style", "stripstyle", "remove_style", "去掉风格", "去除风格", "删除风格"].includes(text)) return "strip_style";
  if (["downgrade_progress", "lower_progress", "降低进度", "下调进度"].includes(text)) return "downgrade_progress";
  if (["replace_with_fallback", "fallback", "safe_fallback", "安全兜底", "替换"].includes(text)) return "replace_with_fallback";
  return "manual_review";
}

function normalizeRisk(value: unknown): HostCriticReview["risks"][number] | undefined {
  const text = String(value ?? "").trim().toLowerCase();
  if (["spoiler", "leak", "泄露", "剧透", "汤底泄露", "剧透风险"].includes(text)) return "spoiler";
  if (["invalid_misuse", "invalid", "误用invalid", "无效回答误用", "换个问法误用"].includes(text)) return "invalid_misuse";
  if (["progress_inflation", "progress", "进度虚高", "进度过高", "进度膨胀"].includes(text)) return "progress_inflation";
  if (["style_boundary", "style", "话术越界", "风格越界", "攻击玩家"].includes(text)) return "style_boundary";
  if (["hallucination", "幻觉", "编造", "新增事实"].includes(text)) return "hallucination";
  if (["mode_violation", "mode", "模式违规", "格式违规"].includes(text)) return "mode_violation";
  if (["parse_error", "parse", "解析错误"].includes(text)) return "parse_error";
  if (["critic_unavailable", "unavailable", "不可用"].includes(text)) return "critic_unavailable";
  return undefined;
}

function normalizeCriticPayload(payload: unknown) {
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const status = normalizeCriticStatus(data.status ?? data.verdict ?? data.result);
  const risks = Array.isArray(data.risks)
    ? data.risks.map(normalizeRisk).filter((risk): risk is HostCriticReview["risks"][number] => Boolean(risk))
    : [];
  return {
    status,
    severity: normalizeSeverity(data.severity),
    action: normalizeAction(data.action),
    risks,
    rationale: String(data.rationale ?? data.reason ?? data.comment ?? "").slice(0, 500),
    suggestedAnswerType: data.suggestedAnswerType,
    suggestedAnswer: typeof data.suggestedAnswer === "string" ? data.suggestedAnswer.slice(0, 240) : undefined,
    suggestedStyleText: typeof data.suggestedStyleText === "string" ? data.suggestedStyleText.slice(0, 120) : undefined,
    suggestedProgress: data.suggestedProgress,
    suggestedCoveredPointIds: Array.isArray(data.suggestedCoveredPointIds) ? data.suggestedCoveredPointIds.map(String) : undefined,
    confidence: clampConfidence(data.confidence)
  };
}

export function parseCriticResponse(raw: string, options: { model?: string; durationMs?: number } = {}): HostCriticReview {
  try {
    const payload = JSON.parse(extractJsonText(raw));
    const parsed = CriticReviewSchema.safeParse(payload);
    const data = parsed.success ? parsed.data : normalizeCriticPayload(payload);
    return baseReview({
      ...data,
      risks: data.risks,
      rationale: data.rationale || (data.status === "passed" ? "未发现明显问题。" : "需要人工复核。"),
      ...(options.model ? { model: options.model } : {})
    }, options.durationMs ?? 0);
  } catch {
    return baseReview({
      status: "error",
      severity: "low",
      action: "manual_review",
      risks: ["parse_error"],
      rationale: "质检结果不是合法 JSON，需要人工复核。",
      confidence: 0,
      ...(options.model ? { model: options.model } : {})
    }, options.durationMs ?? 0);
  }
}

export function buildCriticPrompt(input: ReviewHostAnswerInput) {
  const pointDefinitions = parseSolutionPointDefinitions(input.puzzle.solutionPoints);
  const previous = input.history.filter((item) => item.id !== input.answer.id).slice(-12);
  return [
    {
      role: "system" as const,
      content: [
        "你是 AI 海龟汤主持质检员，不是游戏主持人。",
        "你的任务是审查某条 AI 主持回答是否符合海龟汤规则，而不是重新主持游戏。",
        "重点检查：是否剧透汤底或关键点、是否引入汤底外的新事实、progress 是否虚高、是否误用 invalid/换个问法、角色 styleText 是否越界、普通提问是否违反是/不是/无关/部分相关/换个问法的规则。",
        "可以给建议修正，但 suggestedAnswer 和 suggestedStyleText 不能泄露汤底或关键点。",
        "如果问题不严重，status 用 passed，action 用 allow。",
        "如果存在风险，status 用 flagged，并选择最接近的 action。",
        "输出必须是 JSON，不要 Markdown，不要额外解释。",
        "JSON 格式：{\"status\":\"passed|flagged|error\",\"severity\":\"none|low|medium|high\",\"action\":\"allow|strip_style|downgrade_progress|replace_with_fallback|manual_review\",\"risks\":[\"spoiler|invalid_misuse|progress_inflation|style_boundary|hallucination|mode_violation\"],\"rationale\":\"简短中文原因\",\"suggestedAnswerType\":\"可选\",\"suggestedAnswer\":\"可选\",\"suggestedStyleText\":\"可选\",\"suggestedProgress\":0,\"suggestedCoveredPointIds\":[\"可选\"],\"confidence\":0}"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `房间：${input.roomId}`,
        `主持人角色：${input.hostPersonaId}`,
        `汤面：${input.puzzle.surface}`,
        `汤底：${input.puzzle.truth}`,
        `关键点：${pointDefinitions.map((point) => `${point.id}=${point.label}(${point.weight})${point.aliases.length ? ` 同义:${point.aliases.join("/")}` : ""}`).join("；")}`,
        `当前房间完成度：${input.currentProgress}`,
        `历史问答：${previous.map((item) => `Q:${item.question} A:${item.answer}${item.styleText ? ` ${item.styleText}` : ""} progress=${item.progress}`).join("\n") || "暂无"}`,
        `待审查问题：${input.answer.question}`,
        `AI回答：answerType=${input.answer.answerType} answer=${input.answer.answer} styleText=${input.answer.styleText ?? ""} progress=${input.answer.progress} progressDelta=${input.answer.progressDelta} coveredPointIds=${(input.answer.coveredPointIds ?? []).join(",")} confidence=${input.answer.coverageConfidence ?? 0}`
      ].join("\n\n")
    }
  ];
}

const CRITIC_TIMEOUT_MS = Number(process.env.AI_CRITIC_TIMEOUT_MS) || 8000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function reviewHostAnswer(input: ReviewHostAnswerInput): Promise<HostCriticReview> {
  const { baseUrl, apiKey, model } = getCriticConfig();
  if (!baseUrl || !apiKey || !model) {
    return errorCriticReview("AI 质检尚未配置。请设置 AI_CRITIC_* 或 AI_* 环境变量。");
  }
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: buildCriticPrompt(input)
      })
    }, CRITIC_TIMEOUT_MS);
    const durationMs = Date.now() - startedAt;
    if (!response.ok) {
      return errorCriticReview(`AI 质检请求失败。（${response.status}）`, durationMs);
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseCriticResponse(payload.choices?.[0]?.message?.content || "", { model, durationMs });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error && error.name === "AbortError" ? "AI 质检超时，需要人工复核。" : "AI 质检暂时不可用，需要人工复核。";
    return errorCriticReview(message, durationMs);
  }
}
