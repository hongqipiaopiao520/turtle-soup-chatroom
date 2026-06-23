import { z } from "zod";
import type { HostAnswerType, Puzzle } from "../src/shared/types";

const HostDecisionSchema = z.object({
  answerType: z.enum(["yes", "no", "irrelevant", "partial", "solved", "unsolved"]),
  answer: z.string().min(1).max(240)
});

export interface AskHostInput {
  puzzle: Puzzle;
  history: Array<{ question: string; answer: string }>;
  question: string;
  mode: "question" | "guess";
}

export interface HostDecision {
  answerType: HostAnswerType;
  answer: string;
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
      return parsed.data;
    }

    const fallback = JSON.parse(raw) as { answer?: unknown };
    return {
      answerType: "partial",
      answer: String(fallback.answer || raw).slice(0, 240)
    };
  } catch {
    return {
      answerType: "partial",
      answer: raw.slice(0, 240)
    };
  }
}

export function buildHostPrompt(input: AskHostInput) {
  const modeRule =
    input.mode === "guess"
      ? "玩家正在提交最终推理。判断是否已经覆盖汤底关键事实。"
      : "玩家正在普通提问。只能回答是、不是、无关或部分相关，不要泄露汤底。";

  return [
    {
      role: "system" as const,
      content: [
        "你是线上海龟汤游戏的 AI 主持人。",
        "你必须严格基于汤底回答，不能编造新事实。",
        "普通提问只允许 answerType 为 yes、no、irrelevant、partial。",
        "最终推理只允许 answerType 为 solved 或 unsolved。",
        "输出必须是 JSON，不要 Markdown，不要额外解释。",
        "JSON 格式：{\"answerType\":\"yes|no|irrelevant|partial|solved|unsolved\",\"answer\":\"一句中文回答\"}"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `汤面：${input.puzzle.surface}`,
        `汤底：${input.puzzle.truth}`,
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
      answer: "AI 主持人尚未配置。请在服务端设置 AI_* 或 MIMO_* 环境变量。"
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
        answer: `汤仙人暂时走神了，请稍后重试。（${response.status}）`
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return parseHostResponse(payload.choices?.[0]?.message?.content || "");
  } catch {
    return {
      answerType: "partial",
      answer: "汤仙人暂时走神了，请稍后重试。"
    };
  }
}
