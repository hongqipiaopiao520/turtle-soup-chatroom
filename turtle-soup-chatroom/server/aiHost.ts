import { z } from "zod";
import type { HostAnswerType, HostPersonaId, Puzzle } from "../src/shared/types";
import { parseSolutionPointDefinitions } from "./puzzleImporter";

export type StylePolicy = "none" | "optional" | "encouraged";

interface HostPersonaDefinition {
  id: HostPersonaId;
  displayName: string;
  personality: string;
  rules: string[];
}

export const HOST_PERSONAS: Record<HostPersonaId, HostPersonaDefinition> = {
  xiaowai: {
    id: "xiaowai",
    displayName: "小歪",
    personality: "轻松、俏皮、略带调侃，但整体友好。",
    rules: ["可以温和吐槽问题方向。", "不要攻击玩家本人。", "不要泄露汤底或新增事实。"]
  },
  dav: {
    id: "dav",
    displayName: "大V",
    personality: "毒舌侦探型，理性、冷淡，会嘲讽绕远推理和低质量问题。",
    rules: ["只能吐槽问题、推理方向或脑洞。", "不攻击玩家本人。", "不使用辱骂、歧视、低俗表达。", "不要泄露汤底或新增事实。"]
  },
  guigui: {
    id: "guigui",
    displayName: "龟龟",
    personality: "慢悠悠、可爱、佛系，偶尔使用“龟龟”口癖。",
    rules: ["语气放慢、可爱、友好。", "可以偶尔使用龟龟口癖。", "不要泄露汤底或新增事实。"]
  }
};

const HOST_PERSONA_IDS: HostPersonaId[] = ["xiaowai", "dav", "guigui"];

function normalizeHostPersonaId(value: unknown): HostPersonaId {
  return HOST_PERSONA_IDS.includes(value as HostPersonaId) ? (value as HostPersonaId) : "xiaowai";
}

export function calculateStylePolicy(input: { mode: "question" | "guess"; currentProgress?: number }): StylePolicy {
  if (input.mode === "guess") return "none";
  return clampProgress(input.currentProgress ?? 0) >= 80 ? "encouraged" : "optional";
}

const BLOCKED_STYLE_TERMS = ["傻逼", "蠢货", "白痴", "智障", "废物", "滚", "操", "妈的", "他妈", "fuck", "shit"];

function normalizeComparableText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function truncateByCodePoint(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

function containsSensitivePuzzleText(styleText: string, puzzle: Puzzle) {
  const normalizedStyle = normalizeComparableText(styleText);
  if (!normalizedStyle) return false;

  const sensitiveTexts = [puzzle.truth, ...puzzle.solutionPoints]
    .map((item) => normalizeComparableText(item || ""))
    .filter((item) => item.length >= 4);

  return sensitiveTexts.some((item) => normalizedStyle.includes(item));
}

function sanitizeStyleText(rawStyleText: unknown, input: { puzzle: Puzzle; stylePolicy: StylePolicy }): string | undefined {
  if (input.stylePolicy === "none" || typeof rawStyleText !== "string") return undefined;
  const trimmed = rawStyleText.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  const styleText = truncateByCodePoint(trimmed, 40);
  const lowered = styleText.toLowerCase();
  if (BLOCKED_STYLE_TERMS.some((term) => lowered.includes(term))) return undefined;
  if (containsSensitivePuzzleText(styleText, input.puzzle)) return undefined;
  return styleText;
}

const hostAnswerTypes: HostAnswerType[] = ["yes", "no", "irrelevant", "partial", "invalid", "solved", "unsolved"];

const HostDecisionSchema = z.object({
  answerType: z.enum(["yes", "no", "irrelevant", "partial", "invalid", "solved", "unsolved"]),
  answer: z.string().min(1).max(240),
  styleText: z.string().max(120).optional(),
  progress: z.number().min(0).max(100).default(0),
  coveredPointIds: z.array(z.string()).default([]),
  coverageConfidence: z.number().min(0).max(1).default(0)
});

const SHORT_ANSWERS: Record<HostAnswerType, string> = {
  yes: "是",
  no: "不是",
  irrelevant: "无关",
  partial: "部分相关",
  invalid: "换个问法",
  solved: "已解出",
  unsolved: "尚未解出"
};

function sanitizeAnswer(answerType: HostAnswerType, rawAnswer: string): string {
  if (answerType === "solved" || answerType === "unsolved") {
    return rawAnswer.slice(0, 240);
  }
  return SHORT_ANSWERS[answerType] ?? rawAnswer.slice(0, 20);
}

export interface AskHostInput {
  puzzle: Puzzle;
  history: Array<{ question: string; answer: string }>;
  question: string;
  mode: "question" | "guess";
  currentProgress?: number;
  hostPersonaId?: HostPersonaId;
  stylePolicy?: StylePolicy;
}

export interface HostDecision {
  answerType: HostAnswerType;
  answer: string;
  styleText?: string;
  progress: number;
  coveredPointIds?: string[];
  coverageConfidence?: number;
}

function withOptionalCoverage(decision: HostDecision, context?: { puzzle: Puzzle; stylePolicy: StylePolicy }): HostDecision {
  const coveredPointIds = decision.coveredPointIds?.filter(Boolean) ?? [];
  const coverageConfidence = Math.max(0, Math.min(1, Number(decision.coverageConfidence) || 0));
  const styleText = context ? sanitizeStyleText(decision.styleText, context) : undefined;
  return {
    answerType: decision.answerType,
    answer: sanitizeAnswer(decision.answerType, decision.answer),
    ...(styleText ? { styleText } : {}),
    progress: decision.progress,
    ...(coveredPointIds.length > 0 ? { coveredPointIds } : {}),
    ...(coverageConfidence > 0 ? { coverageConfidence } : {})
  };
}

function clampProgress(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeAnswerType(value: unknown): HostAnswerType {
  return hostAnswerTypes.includes(value as HostAnswerType) ? (value as HostAnswerType) : "partial";
}

export function getAiHostConfig() {
  return {
    baseUrl: process.env.AI_BASE_URL || process.env.MIMO_BASE_URL,
    apiKey: process.env.AI_API_KEY || process.env.MIMO_API_KEY,
    model: process.env.AI_MODEL || process.env.MIMO_AGENT_MODEL
  };
}

export function parseHostResponse(raw: string, context?: { puzzle: Puzzle; stylePolicy: StylePolicy }): HostDecision {
  try {
    const parsed = HostDecisionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return withOptionalCoverage(parsed.data, context);
    }

    const fallback = JSON.parse(raw) as { answer?: unknown; answerType?: unknown; progress?: unknown; styleText?: unknown };
    return withOptionalCoverage({
      answerType: normalizeAnswerType(fallback.answerType),
      answer: String(fallback.answer || raw).slice(0, 240),
      styleText: typeof fallback.styleText === "string" ? fallback.styleText : undefined,
      progress: clampProgress(fallback.progress),
      coveredPointIds: Array.isArray((fallback as { coveredPointIds?: unknown }).coveredPointIds)
        ? (fallback as { coveredPointIds: unknown[] }).coveredPointIds.map(String)
        : [],
      coverageConfidence: Math.max(0, Math.min(1, Number((fallback as { coverageConfidence?: unknown }).coverageConfidence) || 0))
    });
  } catch {
    return withOptionalCoverage({
      answerType: "partial",
      answer: raw.slice(0, 240),
      progress: 0,
      coveredPointIds: [],
      coverageConfidence: 0
    }, context);
  }
}

export function buildHostPrompt(input: AskHostInput) {
  const pointDefinitions = parseSolutionPointDefinitions(input.puzzle.solutionPoints);
  const currentProgress = clampProgress(input.currentProgress ?? 0);
  const hostPersonaId = normalizeHostPersonaId(input.hostPersonaId);
  const persona = HOST_PERSONAS[hostPersonaId];
  const stylePolicy = input.stylePolicy ?? calculateStylePolicy({ mode: input.mode, currentProgress });
  const modeRule =
    input.mode === "guess"
      ? "玩家正在提交最终推理。按核心逻辑、主要反转和关键因果判断是否已经解出汤底。"
      : "玩家正在普通提问。只能回答是、不是、无关、部分相关或换个问法，不要泄露汤底。";

  return [
    {
      role: "system" as const,
      content: [
        "你是线上海龟汤游戏的 AI 主持人。",
        "你必须严格基于汤底回答，不能编造新事实。",
        "参考标准海龟汤玩法：普通提问 QUERY 只回答方向，最终推理 SOLVE 判断玩家理论是否抓住核心真相。",
        "普通提问只允许 answerType 为 yes、no、irrelevant、partial、invalid。",
        "invalid 表示需要玩家换个问法；只有当玩家输入不是是/否问题、问题自相矛盾、或完全无法按海龟汤规则回答时才使用。",
        "如果只是前提未确认，优先使用 no、partial 或 irrelevant，不要频繁使用 invalid。",
        "普通提问的 answer 字段只能是一个词：是、不是、无关、部分相关、换个问法。不要补充解释，不要给出任何额外信息。",
        `主持人角色：${persona.displayName}。性格：${persona.personality}`,
        `角色边界：${persona.rules.join(" ")}`,
        `stylePolicy=${stylePolicy}。styleText 是可选角色风格短句，不参与判题或计分，最多 40 个中文字符。`,
        "stylePolicy=none 时 styleText 必须为空；optional 时只有自然时才给一句；encouraged 时可以给一句符合角色的短文案。",
        "styleText 不得泄露汤底、关键点、新事实，不得攻击玩家本人，不得使用辱骂、歧视、低俗表达。",
        "answer 字段保持规则答案，不要把角色文案放进 answer。",
        "普通提问如果确认关键事实、排除重大误区或命中关键因果，progress 必须高于当前完成度，并填写 coveredPointIds。",
        "普通提问即使只回答是/不是，也要根据玩家已经确认的信息给出贡献分所需的 progress；不要只有最终推理才涨分。",
        "推理提交可以使用 answerType solved 或 unsolved。",
        "推理提交的 answer 可以用一句话说明缺少什么方向，但不要泄露汤底。",
        "推理提交不要要求玩家逐字命中关键点；同义表达、合理改写、代词指代和等价因果链都可以视为覆盖。",
        "只要最终推理覆盖主要反转、核心逻辑、关键因果和核心身份/动机，即使遗漏少量细节，也应判为 solved，progress 给 100。",
        "如果最终推理很接近但缺少关键因果，answerType 用 unsolved，progress 可给 80-94，并用一句话提示缺少方向，但不要直接泄露汤底。",
        "每次回复都要评估玩家群体已经接近汤底的完成度 progress，范围 0-100；progress 不能低于已给出的当前完成度。",
        "progress 达到 95 表示已经足以解锁汤底。",
        "coveredPointIds 填写语义上已经覆盖的关键点 id；同义表达也算覆盖，不要卡具体措辞。",
        "输出必须是 JSON，不要 Markdown，不要额外解释。",
        "JSON 格式：{\"answerType\":\"yes|no|irrelevant|partial|invalid|solved|unsolved\",\"answer\":\"一句中文回答\",\"styleText\":\"可选角色风格短句\",\"progress\":0,\"coveredPointIds\":[\"point-id\"],\"coverageConfidence\":0}"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `汤面：${input.puzzle.surface}`,
        `主持人：${persona.displayName}(${hostPersonaId})`,
        `stylePolicy：${stylePolicy}`,
        `汤底：${input.puzzle.truth}`,
        `关键点：${pointDefinitions.map((point) => `${point.id}=${point.label}(${point.weight})${point.aliases.length ? ` 同义:${point.aliases.join("/")}` : ""}`).join("；")}`,
        `当前完成度：${currentProgress}`,
        `历史问答：${input.history.map((item) => `Q:${item.question} A:${item.answer}`).join("\n") || "暂无"}`,
        `规则：${modeRule}`,
        `玩家输入：${input.question}`
      ].join("\n\n")
    }
  ];
}

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 15000;
const AI_MAX_RETRIES = 1;

function errorDecision(message: string): HostDecision {
  return {
    answerType: "partial",
    answer: message,
    progress: 0
  };
}

export function isHostErrorDecision(decision: HostDecision): boolean {
  return decision.answerType === "partial" && decision.progress === 0;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function askHost(input: AskHostInput): Promise<HostDecision> {
  const { baseUrl, apiKey, model } = getAiHostConfig();
  const currentProgress = clampProgress(input.currentProgress ?? 0);
  const stylePolicy = input.stylePolicy ?? calculateStylePolicy({ mode: input.mode, currentProgress });
  const requestInput = {
    ...input,
    hostPersonaId: normalizeHostPersonaId(input.hostPersonaId),
    currentProgress,
    stylePolicy
  };

  if (!baseUrl || !apiKey || !model) {
    return errorDecision("AI 主持人尚未配置。请在服务端设置 AI_* 或 MIMO_* 环境变量。");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = JSON.stringify({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: buildHostPrompt(requestInput)
  });

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body
      }, AI_TIMEOUT_MS);

      if (!response.ok) {
        const durationMs = Date.now() - startedAt;
        console.warn("[aiHost] non-ok response", { status: response.status, attempt, durationMs });
        // 5xx can retry; 4xx don't retry
        if (response.status >= 500 && attempt < AI_MAX_RETRIES) {
          continue;
        }
        return errorDecision(`小歪暂时走神了，请稍后重试。（${response.status}）`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return parseHostResponse(payload.choices?.[0]?.message?.content || "", {
        puzzle: requestInput.puzzle,
        stylePolicy
      });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      console.warn("[aiHost] request failed", { attempt, durationMs, error: err instanceof Error ? err.message : String(err) });
      if (attempt < AI_MAX_RETRIES) {
        continue;
      }
      const message = err instanceof Error && err.name === "AbortError"
        ? "小歪思考超时了，请稍后重试。"
        : "小歪暂时走神了，请稍后重试。";
      return errorDecision(message);
    }
  }

  return errorDecision("小歪暂时走神了。");
}
