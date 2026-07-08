import type {
  RoomCompanionAssistAction,
  RoomCompanionAssistRequest,
  RoomCompanionAssistResponse,
  RoomCompanionSnapshot
} from "../src/shared/types";

const ACTION_LABELS: Record<RoomCompanionAssistAction, string> = {
  next_question: "想下一问",
  summarize_clues: "整理线索",
  check_guess: "检查推理"
};

const assistCache = new Map<string, RoomCompanionAssistResponse>();

function trimText(value: unknown, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function unique(values: string[], max = 6) {
  return Array.from(new Set(values.map((value) => trimText(value, 60)).filter(Boolean))).slice(0, max);
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  return trimmed;
}

function getAiConfig() {
  return {
    baseUrl: process.env.AI_COMPANION_BASE_URL || process.env.AI_BASE_URL || process.env.MIMO_BASE_URL,
    apiKey: process.env.AI_COMPANION_API_KEY || process.env.AI_API_KEY || process.env.MIMO_API_KEY,
    model: process.env.AI_COMPANION_MODEL || process.env.AI_MODEL || process.env.MIMO_AGENT_MODEL
  };
}

function sanitizeSnapshot(snapshot: RoomCompanionSnapshot): RoomCompanionSnapshot {
  return {
    puzzle: {
      title: trimText(snapshot.puzzle.title, 40),
      surface: trimText(snapshot.puzzle.surface, 140),
      difficulty: snapshot.puzzle.difficulty,
      tags: unique(snapshot.puzzle.tags, 6)
    },
    stageLabel: trimText(snapshot.stageLabel, 20),
    progressNote: trimText(snapshot.progressNote, 32),
    summary: trimText(snapshot.summary, 90),
    confirmed: unique(snapshot.confirmed, 3),
    toVerify: unique(snapshot.toVerify, 3),
    offTrack: unique(snapshot.offTrack, 2),
    nextQuestion: trimText(snapshot.nextQuestion, 80),
    recentAnswers: snapshot.recentAnswers.slice(0, 6).map((answer) => ({
      question: trimText(answer.question, 80),
      answerType: answer.answerType,
      answer: trimText(answer.answer, 60),
      progressDelta: Math.max(0, Math.min(100, Number(answer.progressDelta) || 0))
    }))
  };
}

function compactInput(input: RoomCompanionAssistRequest) {
  return {
    action: input.action,
    snapshot: sanitizeSnapshot(input.snapshot),
    draftGuess: trimText(input.draftGuess, 300)
  };
}

function cacheKey(input: RoomCompanionAssistRequest) {
  return JSON.stringify(compactInput(input));
}

function summarizeLines(label: string, values: string[]) {
  return values.length ? `${label}：${values.join("；")}` : `${label}：暂无`;
}

function fallbackAssist(input: RoomCompanionAssistRequest): RoomCompanionAssistResponse {
  const snapshot = sanitizeSnapshot(input.snapshot);
  const baseChips = unique(["0 token fallback", snapshot.stageLabel, snapshot.progressNote], 3);
  if (input.action === "summarize_clues") {
    return {
      action: input.action,
      title: "线索整理",
      body: [
        summarizeLines("已确认", snapshot.confirmed),
        summarizeLines("待验证", snapshot.toVerify),
        summarizeLines("少走弯路", snapshot.offTrack)
      ].join("。"),
      suggestion: snapshot.summary,
      chips: baseChips,
      source: "fallback",
      cached: false
    };
  }
  if (input.action === "check_guess") {
    const hasDraft = Boolean(trimText(input.draftGuess, 300));
    return {
      action: input.action,
      title: hasDraft ? "推理检查" : "先写推理",
      body: hasDraft
        ? "我只能根据公开线索检查表达完整性：你的推理需要覆盖人物关系、异常触发点、时间顺序，以及为什么会出现题面行为。"
        : "写下你的完整推理后，我再帮你检查是否缺少关键公开线索。",
      suggestion: hasDraft ? "如果能解释待验证项，再切到推理提交会更稳。" : "至少写出“谁、为什么、怎么导致题面结果”。",
      chips: baseChips,
      source: "fallback",
      cached: false
    };
  }
  return {
    action: input.action,
    title: "下一问建议",
    body: `当前阶段是“${snapshot.stageLabel}”。${snapshot.summary}`,
    suggestion: snapshot.nextQuestion,
    chips: baseChips,
    source: "fallback",
    cached: false
  };
}

export function buildRoomCompanionAssistPrompt(input: RoomCompanionAssistRequest) {
  const compact = compactInput(input);
  return [
    {
      role: "system" as const,
      content: [
        "你是海龟汤陪玩 Agent，不是主持人。",
        "只根据用户提供的公开题面、公开问答和阶段摘要给建议。",
        "不得输出最终真相，不得猜汤底，不得创造未确认事实。",
        "目标是低 token、短建议、帮助玩家下一步行动。",
        "只输出 JSON，不要 Markdown。",
        "JSON 格式：{\"title\":\"下一问建议\",\"body\":\"一句理由\",\"suggestion\":\"具体可执行动作或问题\",\"chips\":[\"公开问答\",\"低 token\"]}"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        action: ACTION_LABELS[compact.action],
        snapshot: compact.snapshot,
        draftGuess: compact.draftGuess || undefined
      })
    }
  ];
}

function parseAiResponse(raw: string, input: RoomCompanionAssistRequest, model: string): RoomCompanionAssistResponse {
  try {
    const payload = JSON.parse(extractJsonText(raw)) as Partial<RoomCompanionAssistResponse>;
    const fallback = fallbackAssist(input);
    return {
      action: input.action,
      title: trimText(payload.title, 24) || fallback.title,
      body: trimText(payload.body, 160) || fallback.body,
      suggestion: trimText(payload.suggestion, 100) || fallback.suggestion,
      chips: unique(Array.isArray(payload.chips) ? payload.chips.map(String) : [], 4),
      source: "ai",
      model,
      cached: false
    };
  } catch {
    return fallbackAssist(input);
  }
}

export async function createRoomCompanionAssist(
  input: RoomCompanionAssistRequest,
  fetcher: typeof fetch = fetch
): Promise<RoomCompanionAssistResponse> {
  const key = cacheKey(input);
  const cached = assistCache.get(key);
  if (cached) return { ...cached, cached: true };

  const { baseUrl, apiKey, model } = getAiConfig();
  if (!baseUrl || !apiKey || !model) {
    const fallback = fallbackAssist(input);
    assistCache.set(key, fallback);
    return fallback;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_COMPANION_TIMEOUT_MS) || 9000);
  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: Math.min(260, Number(process.env.AI_COMPANION_MAX_TOKENS) || 240),
        response_format: { type: "json_object" },
        messages: buildRoomCompanionAssistPrompt(input)
      })
    });
    if (!response.ok) {
      const fallback = fallbackAssist(input);
      assistCache.set(key, fallback);
      return fallback;
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = parseAiResponse(payload.choices?.[0]?.message?.content ?? "", input, model);
    assistCache.set(key, parsed);
    return parsed;
  } catch {
    const fallback = fallbackAssist(input);
    assistCache.set(key, fallback);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
