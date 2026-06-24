import { z } from "zod";
import type { HostAnswerType, Puzzle } from "../src/shared/types";
import { parseSolutionPointDefinitions } from "./puzzleImporter";

const hostAnswerTypes: HostAnswerType[] = ["yes", "no", "irrelevant", "partial", "solved", "unsolved"];

const HostDecisionSchema = z.object({
  answerType: z.enum(["yes", "no", "irrelevant", "partial", "solved", "unsolved"]),
  answer: z.string().min(1).max(240),
  progress: z.number().min(0).max(100).default(0),
  coveredPointIds: z.array(z.string()).default([]),
  coverageConfidence: z.number().min(0).max(1).default(0)
});

export interface AskHostInput {
  puzzle: Puzzle;
  history: Array<{ question: string; answer: string }>;
  question: string;
  mode: "question" | "guess";
  currentProgress?: number;
}

export interface HostDecision {
  answerType: HostAnswerType;
  answer: string;
  progress: number;
  coveredPointIds?: string[];
  coverageConfidence?: number;
}

function withOptionalCoverage(decision: HostDecision): HostDecision {
  const coveredPointIds = decision.coveredPointIds?.filter(Boolean) ?? [];
  const coverageConfidence = Math.max(0, Math.min(1, Number(decision.coverageConfidence) || 0));
  return {
    answerType: decision.answerType,
    answer: decision.answer,
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

export function parseHostResponse(raw: string): HostDecision {
  try {
    const parsed = HostDecisionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return withOptionalCoverage(parsed.data);
    }

    const fallback = JSON.parse(raw) as { answer?: unknown; answerType?: unknown; progress?: unknown };
    return withOptionalCoverage({
      answerType: normalizeAnswerType(fallback.answerType),
      answer: String(fallback.answer || raw).slice(0, 240),
      progress: clampProgress(fallback.progress),
      coveredPointIds: Array.isArray((fallback as { coveredPointIds?: unknown }).coveredPointIds)
        ? (fallback as { coveredPointIds: unknown[] }).coveredPointIds.map(String)
        : [],
      coverageConfidence: Math.max(0, Math.min(1, Number((fallback as { coverageConfidence?: unknown }).coverageConfidence) || 0))
    });
  } catch {
    return {
      answerType: "partial",
      answer: raw.slice(0, 240),
      progress: 0,
      coveredPointIds: [],
      coverageConfidence: 0
    };
  }
}

export function buildHostPrompt(input: AskHostInput) {
  const pointDefinitions = parseSolutionPointDefinitions(input.puzzle.solutionPoints);
  const currentProgress = clampProgress(input.currentProgress ?? 0);
  const modeRule =
    input.mode === "guess"
      ? "玩家正在提交最终推理。按核心逻辑、主要反转和关键因果判断是否已经解出汤底。"
      : "玩家正在普通提问。只能回答是、不是、无关或部分相关，不要泄露汤底。";

  return [
    {
      role: "system" as const,
      content: [
        "你是线上海龟汤游戏的 AI 主持人。",
        "你必须严格基于汤底回答，不能编造新事实。",
        "参考标准海龟汤玩法：普通提问 QUERY 只回答方向，最终推理 SOLVE 判断玩家理论是否抓住核心真相。",
        "普通提问只允许 answerType 为 yes、no、irrelevant、partial。",
        "推理提交可以使用 answerType solved 或 unsolved。",
        "推理提交不要要求玩家逐字命中关键点；同义表达、合理改写、代词指代和等价因果链都可以视为覆盖。",
        "只要最终推理覆盖主要反转、核心逻辑、关键因果和核心身份/动机，即使遗漏少量细节，也应判为 solved，progress 给 100。",
        "如果最终推理很接近但缺少关键因果，answerType 用 unsolved，progress 可给 80-94，并用一句话提示缺少方向，但不要直接泄露汤底。",
        "每次回复都要评估玩家群体已经接近汤底的完成度 progress，范围 0-100；progress 不能低于已给出的当前完成度。",
        "progress 达到 95 表示已经足以解锁汤底。",
        "coveredPointIds 填写语义上已经覆盖的关键点 id；同义表达也算覆盖，不要卡具体措辞。",
        "输出必须是 JSON，不要 Markdown，不要额外解释。",
        "JSON 格式：{\"answerType\":\"yes|no|irrelevant|partial|solved|unsolved\",\"answer\":\"一句中文回答\",\"progress\":0,\"coveredPointIds\":[\"point-id\"],\"coverageConfidence\":0}"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `汤面：${input.puzzle.surface}`,
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

export async function askHost(input: AskHostInput): Promise<HostDecision> {
  const { baseUrl, apiKey, model } = getAiHostConfig();

  if (!baseUrl || !apiKey || !model) {
    return {
      answerType: "partial",
      answer: "AI 主持人尚未配置。请在服务端设置 AI_* 或 MIMO_* 环境变量。",
      progress: 0
    };
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
        messages: buildHostPrompt(input)
      })
    });

    if (!response.ok) {
      return {
        answerType: "partial",
        answer: `小歪暂时走神了，请稍后重试。（${response.status}）`,
        progress: 0
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return parseHostResponse(payload.choices?.[0]?.message?.content || "");
  } catch {
    return {
      answerType: "partial",
      answer: "小歪暂时走神了，请稍后重试。",
      progress: 0
    };
  }
}
