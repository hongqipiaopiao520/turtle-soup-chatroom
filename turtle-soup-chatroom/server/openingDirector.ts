import type {
  Difficulty,
  HostPersonaId,
  ManagedPuzzle,
  OpeningDirectorDecision,
  OpeningDirectorIntent,
  OpeningDirectorPlan,
  OpeningDirectorResponse,
  OpeningDirectorTraceItem,
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

function expandSemanticTerms(term: string) {
  const synonymMap: Record<string, string[]> = {
    父母: ["父母", "爸爸", "妈妈", "父亲", "母亲", "家庭", "亲情", "家人"],
    亲情: ["亲情", "父母", "家庭", "家人", "爸爸", "妈妈"],
    家庭: ["家庭", "家人", "亲情", "父母"],
    血腥: ["血腥", "红汤", "尸体", "死亡", "重口"],
    重口: ["重口", "血腥", "红汤", "尸体"],
    反转: ["反转", "误导", "错觉", "真相反转"],
    压抑: ["压抑", "沉重", "悲伤", "悲剧"],
    密室: ["密室", "封闭", "房间", "室内"],
    校园: ["校园", "学校", "学生", "老师"],
    新手: ["新手", "入门", "简单", "轻松"],
    高难: ["高难", "困难", "硬核", "本格"]
  };
  return synonymMap[term] ?? [term];
}

function extractPromptTerms(intent: OpeningDirectorIntent) {
  const rawTerms = intent.rawText.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) ?? [];
  return unique([
    ...intent.themes,
    ...intent.moods,
    ...rawTerms.filter((term) => term.length <= 8),
    intent.preferredDifficulty === "easy" ? "新手" : "",
    intent.preferredDifficulty === "hard" ? "高难" : ""
  ], 16);
}

function createRetrievalDocument(puzzle: ManagedPuzzle) {
  const profile = puzzle.aiProfile;
  return [
    puzzle.title,
    puzzle.surface,
    puzzle.tags.join(" "),
    profile?.themes.join(" ") ?? "",
    profile?.moods.join(" ") ?? "",
    profile?.twistTypes.join(" ") ?? "",
    profile?.contentWarnings.join(" ") ?? "",
    profile?.suitableFor.join(" ") ?? "",
    profile?.spoilerFreePitch ?? ""
  ].join("\n");
}

function semanticRetrievePuzzle(puzzle: ManagedPuzzle, intent: OpeningDirectorIntent) {
  const document = createRetrievalDocument(puzzle);
  const matches: string[] = [];
  let score = 0;

  for (const term of extractPromptTerms(intent)) {
    const expanded = expandSemanticTerms(term);
    const matched = expanded.some((candidate) => document.includes(candidate));
    if (!matched) continue;
    matches.push(term);
    score += intent.themes.includes(term) ? 18 : intent.moods.includes(term) ? 12 : 5;
  }

  for (const avoided of intent.avoidThemes) {
    if (expandSemanticTerms(avoided).some((candidate) => document.includes(candidate))) {
      score -= 30;
    }
  }

  if (typeof intent.maxGore === "number" && puzzle.aiProfile?.intensity.gore !== undefined) {
    score += puzzle.aiProfile.intensity.gore <= intent.maxGore ? 6 : -36;
  }

  return {
    score,
    matches: unique(matches, 5)
  };
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

function createPlan(
  puzzle: ManagedPuzzle,
  intent: OpeningDirectorIntent,
  score: number,
  index: number,
  retrieval: { score: number; matches: string[] }
): OpeningDirectorPlan {
  const chips = unique([
    ...retrieval.matches,
    ...(puzzle.aiProfile?.themes ?? puzzle.tags).slice(0, 3),
    ...(puzzle.aiProfile?.moods ?? []).slice(0, 2),
    puzzle.difficulty === "easy" ? "新手友好" : puzzle.difficulty === "hard" ? "高难" : "标准"
  ], 6);
  const retrievalSummary = retrieval.matches.length ? `语义命中 ${retrieval.matches.slice(0, 3).join(" / ")}` : "";
  return {
    id: `${puzzle.id}-${index}`,
    puzzle: toPublicPuzzle(puzzle),
    title: index === 0 ? "首选开局" : index === 1 ? "备选口味" : "稳妥方案",
    reason: puzzle.aiProfile?.spoilerFreePitch ?? "这题热度和评分稳定，适合作为默认开局。",
    matchSummary: retrievalSummary || (chips.length ? `匹配 ${chips.slice(0, 3).join(" / ")}` : "按热度与评分推荐"),
    retrievalMatches: retrieval.matches,
    retrievalScore: retrieval.score,
    chips,
    contentIntensity: intensitySummary(puzzle),
    hostPersonaId: hostForPlan(intent, puzzle),
    questionLimit: questionLimitForPlan(intent, puzzle),
    confidence: confidenceLabel(score),
    source: intent.source === "ai" ? "ai-intent-profile-score" : puzzle.aiProfile ? "profile-score" : "fallback"
  };
}

function describeIntent(intent: OpeningDirectorIntent) {
  const parts = [
    ...intent.themes,
    ...intent.moods,
    intent.preferredDifficulty === "easy" ? "新手" : intent.preferredDifficulty === "hard" ? "高难" : "",
    typeof intent.maxGore === "number" ? `血腥≤${intent.maxGore}` : "",
    intent.preferredHostPersonaId === "dav" ? "大V" : intent.preferredHostPersonaId === "guigui" ? "龟龟" : intent.preferredHostPersonaId === "xiaowai" ? "小歪" : ""
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "开放口味";
}

function createAgentTrace(input: {
  intent: OpeningDirectorIntent;
  publishedCount: number;
  semanticMatchCount: number;
  rankedCount: number;
  planCount: number;
  fallbackUsed: boolean;
  waitingForDecision?: boolean;
}): OpeningDirectorTraceItem[] {
  const status = input.fallbackUsed ? "fallback" : "done";
  return [
    {
      id: "parse_intent",
      toolName: "parse_intent",
      label: "理解偏好",
      status,
      summary: describeIntent(input.intent),
      detail: input.intent.source === "ai" ? "AI 已解析你的口味、强度和主持偏好。" : "AI 暂不可用，已用规则解析偏好。",
      inputSummary: input.intent.rawText,
      outputSummary: describeIntent(input.intent)
    },
    {
      id: "search_puzzles",
      toolName: "search_puzzles",
      label: "搜索题库",
      status: "done",
      summary: `找到 ${input.publishedCount} 道可开局题目，语义召回 ${input.semanticMatchCount} 道`,
      detail: "只使用已发布题目，汤底和关键点不会暴露给首页。",
      inputSummary: "已发布题库",
      outputSummary: `${input.semanticMatchCount} 道语义候选`
    },
    {
      id: "rank_profiles",
      toolName: "rank_profiles",
      label: "匹配画像",
      status: input.fallbackUsed ? "fallback" : "done",
      summary: `按画像重排 ${input.rankedCount} 道候选`,
      detail: input.fallbackUsed ? "部分题目缺少画像，已混合热度、评分和规则排序。" : "已按主题、情绪、强度、难度和热度综合排序。",
      inputSummary: describeIntent(input.intent),
      outputSummary: `${input.rankedCount} 道已排序`
    },
    {
      id: "draft_plans",
      toolName: "draft_plans",
      label: "生成方案",
      status: "done",
      summary: `生成 ${input.planCount} 个开局方案`,
      detail: "每个方案会配置题目、主持人、问数和不剧透推荐理由。",
      inputSummary: `${input.rankedCount} 道已排序候选`,
      outputSummary: `${input.planCount} 个方案`
    },
    {
      id: "request_confirm",
      toolName: "request_confirm",
      label: "等待确认",
      status: "waiting",
      summary: input.waitingForDecision ? "先选择一个理解方向" : "选择一个方案后再创建房间",
      detail: input.waitingForDecision ? "你的需求有多种解释，确认方向后再继续检索。" : "开房是最后一步工具调用，不会自动推进。",
      inputSummary: input.waitingForDecision ? "模糊偏好" : `${input.planCount} 个方案`,
      outputSummary: input.waitingForDecision ? "等待方向选择" : "等待玩家确认"
    }
  ];
}

const intensityDecision: OpeningDirectorDecision = {
  id: "clarify_intensity",
  title: "刺激优先还是推理优先？",
  reason: "“刺激一点”可能是更重口，也可能是更强反转。先选方向，我再继续配题。",
  options: [
    {
      id: "more_intense",
      title: "刺激优先",
      description: "接受更强冲击和压抑感，但仍不直接剧透。",
      promptPatch: "血腥和压抑可以更强，优先刺激感"
    },
    {
      id: "more_reasoning",
      title: "推理优先",
      description: "控制血腥，优先选择反转和推理张力。",
      promptPatch: "不要太血腥，反转和推理性更强"
    }
  ]
};

function needsIntensityDecision(prompt: string, intent: OpeningDirectorIntent, decisionId?: string) {
  if (decisionId) return false;
  return /刺激|重口|血腥一点|吓人一点/.test(prompt)
    && typeof intent.maxGore !== "number"
    && !intent.moods.includes("反转");
}

function applyDecision(intent: OpeningDirectorIntent, decisionId?: string): OpeningDirectorIntent {
  if (decisionId === "more_intense") {
    return {
      ...intent,
      moods: unique([...intent.moods, "压抑"]),
      maxGore: intent.maxGore ?? 4,
      desiredLength: intent.desiredLength ?? "standard"
    };
  }
  if (decisionId === "more_reasoning") {
    return {
      ...intent,
      moods: unique([...intent.moods, "反转"]),
      maxGore: intent.maxGore ?? 2,
      desiredLength: intent.desiredLength ?? "standard"
    };
  }
  return intent;
}

export async function createOpeningDirectorPlans(input: { prompt: string; puzzles: ManagedPuzzle[]; limit?: number; decisionId?: string }): Promise<OpeningDirectorResponse> {
  const prompt = input.prompt.trim();
  const parsedIntent = await parseOpeningDirectorIntentWithAi(prompt);
  const intent = applyDecision(parsedIntent, input.decisionId);
  const limit = Math.max(1, Math.min(3, input.limit ?? 3));
  const published = input.puzzles.filter((puzzle) => puzzle.status === "published");
  const pendingDecision = needsIntensityDecision(prompt, intent, input.decisionId);
  if (pendingDecision) {
    return {
      intent,
      plans: [],
      agentTrace: createAgentTrace({
        intent,
        publishedCount: published.length,
        semanticMatchCount: 0,
        rankedCount: 0,
        planCount: 0,
        fallbackUsed: intent.source === "fallback",
        waitingForDecision: true
      }),
      decision: intensityDecision,
      fallbackUsed: intent.source === "fallback"
    };
  }

  const scoredCandidates = published
    .map((puzzle) => {
      const retrieval = semanticRetrievePuzzle(puzzle, intent);
      return {
        puzzle,
        retrieval,
        score: scorePuzzle(puzzle, intent) + retrieval.score
      };
    });
  const semanticMatchCount = scoredCandidates.filter((item) => item.retrieval.matches.length > 0).length;
  const scored = scoredCandidates
    .sort((left, right) => right.score - left.score || right.puzzle.rating - left.puzzle.rating)
    .slice(0, limit);
  const fallbackUsed = intent.source === "fallback" || scored.some((item) => !item.puzzle.aiProfile);

  return {
    intent,
    plans: scored.map((item, index) => createPlan(item.puzzle, intent, item.score, index, item.retrieval)),
    agentTrace: createAgentTrace({
      intent,
      publishedCount: published.length,
      semanticMatchCount,
      rankedCount: published.length,
      planCount: scored.length,
      fallbackUsed
    }),
    fallbackUsed
  };
}
