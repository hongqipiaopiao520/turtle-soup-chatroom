import type {
  Difficulty,
  HostPersonaId,
  ManagedPuzzle,
  OpeningDirectorIntent,
  OpeningDirectorPlan,
  OpeningDirectorResponse,
  PublicPuzzle
} from "../src/shared/types";

const HOST_PERSONA_IDS: HostPersonaId[] = ["xiaowai", "dav", "guigui"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function unique(values: string[], max = 8) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, max);
}

function clamp(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
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

export function buildOpeningDirectorIntentPrompt(prompt: string) {
  return [
    {
      role: "system" as const,
      content: [
        "你是海龟汤开局导演 Agent 的意图解析器。",
        "把玩家自然语言开局需求解析成结构化 JSON。",
        "只输出 JSON，不要 Markdown。",
        "JSON 格式：{\"themes\":[\"父母\"],\"moods\":[\"反转\"],\"avoidThemes\":[\"校园\"],\"preferredDifficulty\":\"easy|medium|hard\",\"preferredHostPersonaId\":\"xiaowai|dav|guigui\",\"maxGore\":2,\"playerCount\":3,\"desiredLength\":\"short|standard|long\",\"confidence\":0.8}",
        "如果玩家说大V、冷面、压迫，preferredHostPersonaId=dav。",
        "如果玩家说小歪、轻松、吐槽，preferredHostPersonaId=xiaowai。",
        "如果玩家说龟龟、慢一点、佛系，preferredHostPersonaId=guigui。",
        "maxGore 范围 0-5；不要太血腥、不恶心通常是 2。",
        "缺失字段可以省略。"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: prompt
    }
  ];
}

export function parseOpeningDirectorIntentFallback(prompt: string): OpeningDirectorIntent {
  const themes: string[] = [];
  const moods: string[] = [];
  const avoidThemes: string[] = [];
  if (/父母|爸爸|妈妈|父亲|母亲/.test(prompt)) themes.push("父母");
  if (/亲情|家庭|家人/.test(prompt)) themes.push("亲情");
  if (/血腥|红汤|尸体|死亡/.test(prompt)) themes.push("血腥");
  if (/密室|封闭/.test(prompt)) themes.push("密室");
  if (/反转|误导/.test(prompt)) moods.push("反转");
  if (/压抑|沉重|刀/.test(prompt)) moods.push("压抑");
  if (/轻松|清淡|新手/.test(prompt)) moods.push("轻松");
  if (/不要.*校园|避开.*校园/.test(prompt)) avoidThemes.push("校园");
  if (/不要.*父母|避开.*亲情/.test(prompt)) avoidThemes.push("父母", "亲情");

  return {
    rawText: prompt,
    themes: unique(themes),
    moods: unique(moods),
    avoidThemes: unique(avoidThemes),
    preferredDifficulty: /新手|简单|入门/.test(prompt) ? "easy" : /困难|难一点|硬核|老手/.test(prompt) ? "hard" : undefined,
    preferredHostPersonaId: /大v|dav|冷面|压迫/i.test(prompt) ? "dav" : /龟龟|慢|佛系/.test(prompt) ? "guigui" : /小歪|轻松|吐槽/.test(prompt) ? "xiaowai" : undefined,
    maxGore: /不要太血腥|别太血腥|不重口|不要恶心/.test(prompt) ? 2 : /血腥|重口/.test(prompt) ? 5 : undefined,
    playerCount: Number(prompt.match(/(\d+)\s*(个)?\s*(人|朋友|玩家)/)?.[1]) || undefined,
    desiredLength: /短|快|10 ?分钟|十五分钟/.test(prompt) ? "short" : /长|慢慢玩|不限/.test(prompt) ? "long" : undefined,
    confidence: 0.45,
    source: "fallback"
  };
}

export function parseOpeningDirectorIntentResponse(raw: string, prompt: string): OpeningDirectorIntent {
  try {
    const payload = JSON.parse(extractJsonText(raw)) as Partial<OpeningDirectorIntent>;
    return {
      rawText: prompt,
      themes: unique(Array.isArray(payload.themes) ? payload.themes.map(String) : []),
      moods: unique(Array.isArray(payload.moods) ? payload.moods.map(String) : []),
      avoidThemes: unique(Array.isArray(payload.avoidThemes) ? payload.avoidThemes.map(String) : []),
      preferredDifficulty: DIFFICULTIES.includes(payload.preferredDifficulty as Difficulty) ? payload.preferredDifficulty : undefined,
      preferredHostPersonaId: HOST_PERSONA_IDS.includes(payload.preferredHostPersonaId as HostPersonaId) ? payload.preferredHostPersonaId : undefined,
      maxGore: payload.maxGore === undefined ? undefined : Math.round(clamp(payload.maxGore, 0, 5)),
      playerCount: payload.playerCount === undefined ? undefined : Math.round(clamp(payload.playerCount, 1, 12)),
      desiredLength: payload.desiredLength === "short" || payload.desiredLength === "standard" || payload.desiredLength === "long" ? payload.desiredLength : undefined,
      confidence: clamp(payload.confidence ?? 0.7, 0, 1),
      source: "ai"
    };
  } catch {
    return parseOpeningDirectorIntentFallback(prompt);
  }
}

function getAiConfig() {
  return {
    baseUrl: process.env.AI_BASE_URL || process.env.MIMO_BASE_URL,
    apiKey: process.env.AI_API_KEY || process.env.MIMO_API_KEY,
    model: process.env.AI_MODEL || process.env.MIMO_AGENT_MODEL
  };
}

export async function parseOpeningDirectorIntentWithAi(prompt: string): Promise<OpeningDirectorIntent> {
  const { baseUrl, apiKey, model } = getAiConfig();
  if (!baseUrl || !apiKey || !model) return parseOpeningDirectorIntentFallback(prompt);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_INTENT_TIMEOUT_MS) || 12000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: buildOpeningDirectorIntentPrompt(prompt)
      })
    });
    if (!response.ok) return parseOpeningDirectorIntentFallback(prompt);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return parseOpeningDirectorIntentResponse(payload.choices?.[0]?.message?.content ?? "", prompt);
  } catch {
    return parseOpeningDirectorIntentFallback(prompt);
  } finally {
    clearTimeout(timeout);
  }
}

function toPublicPuzzle(puzzle: ManagedPuzzle): PublicPuzzle {
  return {
    id: puzzle.id,
    title: puzzle.title,
    surface: puzzle.surface,
    difficulty: puzzle.difficulty,
    tags: puzzle.tags,
    author: puzzle.author,
    rating: puzzle.rating,
    plays: puzzle.plays,
    createdAt: puzzle.createdAt,
    hintCount: puzzle.hints.length
  };
}

function scorePuzzle(puzzle: ManagedPuzzle, intent: OpeningDirectorIntent) {
  const profile = puzzle.aiProfile;
  const source = `${puzzle.title}\n${puzzle.surface}\n${puzzle.tags.join(" ")}\n${profile?.themes.join(" ") ?? ""}\n${profile?.moods.join(" ") ?? ""}`;
  let score = 0;
  for (const theme of intent.themes) {
    if (profile?.themes.includes(theme)) score += 24;
    if (source.includes(theme)) score += 8;
  }
  for (const mood of intent.moods) {
    if (profile?.moods.includes(mood)) score += 14;
    if (source.includes(mood)) score += 5;
  }
  for (const avoided of intent.avoidThemes) {
    if (source.includes(avoided)) score -= 60;
  }
  if (typeof intent.maxGore === "number" && profile) {
    score += profile.intensity.gore <= intent.maxGore ? 12 : -60;
  }
  if (intent.preferredDifficulty && puzzle.difficulty === intent.preferredDifficulty) score += 10;
  score += Math.min(10, puzzle.rating);
  score += Math.min(8, Math.log10(Math.max(1, puzzle.plays)) * 3);
  return score;
}

function hostForPlan(intent: OpeningDirectorIntent, puzzle: ManagedPuzzle): HostPersonaId {
  if (intent.preferredHostPersonaId) return intent.preferredHostPersonaId;
  if (intent.preferredDifficulty === "hard" || intent.moods.includes("压抑")) return "dav";
  if (puzzle.aiProfile?.moods.includes("温柔")) return "guigui";
  return "xiaowai";
}

function questionLimitForPlan(intent: OpeningDirectorIntent, puzzle: ManagedPuzzle) {
  const estimated = puzzle.aiProfile?.estimatedQuestions ?? (puzzle.difficulty === "easy" ? 12 : puzzle.difficulty === "hard" ? 22 : 16);
  if (intent.desiredLength === "short") return Math.max(10, Math.min(15, estimated));
  if (intent.desiredLength === "long") return Math.max(20, Math.min(30, estimated + 5));
  return Math.max(12, Math.min(25, estimated));
}

function confidenceLabel(score: number): OpeningDirectorPlan["confidence"] {
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function intensitySummary(puzzle: ManagedPuzzle) {
  const intensity = puzzle.aiProfile?.intensity;
  if (!intensity) return "强度未知";
  const gore = intensity.gore <= 1 ? "血腥低" : intensity.gore <= 3 ? "血腥中" : "血腥高";
  const sadness = intensity.sadness <= 1 ? "压抑低" : intensity.sadness <= 3 ? "压抑中" : "压抑高";
  return `${gore} / ${sadness}`;
}

function createPlan(puzzle: ManagedPuzzle, intent: OpeningDirectorIntent, score: number, index: number): OpeningDirectorPlan {
  const chips = unique([
    ...(puzzle.aiProfile?.themes ?? puzzle.tags).slice(0, 3),
    ...(puzzle.aiProfile?.moods ?? []).slice(0, 2),
    puzzle.difficulty === "easy" ? "新手友好" : puzzle.difficulty === "hard" ? "高难" : "标准"
  ], 6);
  return {
    id: `${puzzle.id}-${index}`,
    puzzle: toPublicPuzzle(puzzle),
    title: index === 0 ? "首选开局" : index === 1 ? "备选口味" : "稳妥方案",
    reason: puzzle.aiProfile?.spoilerFreePitch ?? "这题热度和评分稳定，适合作为默认开局。",
    matchSummary: chips.length ? `匹配 ${chips.slice(0, 3).join(" / ")}` : "按热度与评分推荐",
    chips,
    contentIntensity: intensitySummary(puzzle),
    hostPersonaId: hostForPlan(intent, puzzle),
    questionLimit: questionLimitForPlan(intent, puzzle),
    confidence: confidenceLabel(score),
    source: intent.source === "ai" ? "ai-intent-profile-score" : puzzle.aiProfile ? "profile-score" : "fallback"
  };
}

export async function createOpeningDirectorPlans(input: { prompt: string; puzzles: ManagedPuzzle[]; limit?: number }): Promise<OpeningDirectorResponse> {
  const intent = await parseOpeningDirectorIntentWithAi(input.prompt.trim());
  const limit = Math.max(1, Math.min(3, input.limit ?? 3));
  const scored = input.puzzles
    .filter((puzzle) => puzzle.status === "published")
    .map((puzzle) => ({ puzzle, score: scorePuzzle(puzzle, intent) }))
    .sort((left, right) => right.score - left.score || right.puzzle.rating - left.puzzle.rating)
    .slice(0, limit);

  return {
    intent,
    plans: scored.map((item, index) => createPlan(item.puzzle, intent, item.score, index)),
    fallbackUsed: intent.source === "fallback" || scored.some((item) => !item.puzzle.aiProfile)
  };
}
