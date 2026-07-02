import type { Difficulty, PuzzleAiProfile } from "../src/shared/types";

export const PUZZLE_AI_PROFILE_VERSION = 1;

interface ProfileInput {
  title: string;
  surface: string;
  truth: string;
  difficulty: Difficulty;
  tags: string[];
  estimatedMinutes?: number;
}

const COMMON_THEMES = ["亲情", "父母", "家庭", "死亡", "密室", "校园", "职场", "恋爱", "朋友", "动物", "怪谈", "生活"];
const COMMON_MOODS = ["压抑", "轻松", "荒诞", "悬疑", "惊悚", "温柔", "反转", "黑色幽默"];

function uniqueLimited(values: unknown, fallback: string[], max = 6) {
  const source = Array.isArray(values) ? values.map(String) : fallback;
  return Array.from(new Set(source.map((item) => item.trim()).filter(Boolean))).slice(0, max);
}

function clampRating(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.round(numeric)));
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

function inferThemes(text: string) {
  return COMMON_THEMES.filter((theme) => text.includes(theme) || (theme === "父母" && /爸爸|妈妈|父亲|母亲/.test(text))).slice(0, 4);
}

function inferMoods(text: string) {
  const moods = COMMON_MOODS.filter((mood) => text.includes(mood));
  if (/死|尸|葬礼|杀/.test(text)) moods.push("压抑", "悬疑");
  if (/笑|大笑|玩笑/.test(text)) moods.push("荒诞");
  return Array.from(new Set(moods)).slice(0, 4);
}

export function generateFallbackPuzzleAiProfile(input: ProfileInput): PuzzleAiProfile {
  const text = `${input.title}\n${input.surface}\n${input.truth}\n${input.tags.join(" ")}`;
  const themes = inferThemes(text);
  const moods = inferMoods(text);
  return {
    themes: themes.length ? themes : input.tags.slice(0, 4),
    moods: moods.length ? moods : ["悬疑"],
    twistTypes: input.difficulty === "hard" ? ["多层误导"] : ["核心反转"],
    contentWarnings: /死|尸|葬礼|杀/.test(text) ? ["死亡"] : [],
    suitableFor: input.difficulty === "easy" ? ["新手局"] : input.difficulty === "hard" ? ["老手局"] : ["标准局"],
    intensity: {
      gore: /血|肢解|尸体/.test(text) ? 3 : 1,
      horror: /鬼|幽灵|怪谈|尸/.test(text) ? 3 : 1,
      sadness: /父母|爸爸|妈妈|亲情|葬礼/.test(text) ? 4 : 2,
      absurdity: /荒诞|大笑|离谱/.test(text) ? 3 : 1
    },
    spoilerFreePitch: `${input.tags.join("、") || "海龟汤"}题，适合想要${input.difficulty === "hard" ? "更强误导" : "清晰线索"}的玩家。`,
    estimatedQuestions: input.difficulty === "easy" ? 12 : input.difficulty === "hard" ? 22 : 16,
    profileVersion: PUZZLE_AI_PROFILE_VERSION,
    generatedAt: new Date().toISOString()
  };
}

export function buildPuzzleAiProfilePrompt(input: ProfileInput) {
  return [
    {
      role: "system" as const,
      content: [
        "你是海龟汤题库的 AI 内容画像编辑。",
        "你会看到汤底，但输出必须是公开给玩家看的 spoiler-free 画像。",
        "不要输出汤底具体事实、凶手身份、作案方式、关键道具、具体因果链。",
        "只输出 JSON，不要 Markdown。",
        "JSON 格式：{\"themes\":[\"亲情\"],\"moods\":[\"压抑\"],\"twistTypes\":[\"关系误导\"],\"contentWarnings\":[\"死亡\"],\"suitableFor\":[\"标准局\"],\"intensity\":{\"gore\":1,\"horror\":2,\"sadness\":4,\"absurdity\":1},\"spoilerFreePitch\":\"一句不剧透推荐语\",\"estimatedQuestions\":18}",
        "intensity 四项范围 0-5。",
        "estimatedQuestions 范围 6-30。"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `标题：${input.title}`,
        `难度：${input.difficulty}`,
        `公开标签：${input.tags.join("、") || "无"}`,
        `汤面：${input.surface}`,
        `汤底：${input.truth}`
      ].join("\n\n")
    }
  ];
}

export function parsePuzzleAiProfileResponse(raw: string, input: ProfileInput): PuzzleAiProfile {
  try {
    const payload = JSON.parse(extractJsonText(raw)) as Partial<PuzzleAiProfile>;
    const fallback = generateFallbackPuzzleAiProfile(input);
    return {
      themes: uniqueLimited(payload.themes, fallback.themes),
      moods: uniqueLimited(payload.moods, fallback.moods),
      twistTypes: uniqueLimited(payload.twistTypes, fallback.twistTypes),
      contentWarnings: uniqueLimited(payload.contentWarnings, fallback.contentWarnings),
      suitableFor: uniqueLimited(payload.suitableFor, fallback.suitableFor),
      intensity: {
        gore: clampRating(payload.intensity?.gore, 0, 5),
        horror: clampRating(payload.intensity?.horror, 0, 5),
        sadness: clampRating(payload.intensity?.sadness, 0, 5),
        absurdity: clampRating(payload.intensity?.absurdity, 0, 5)
      },
      spoilerFreePitch: typeof payload.spoilerFreePitch === "string" && payload.spoilerFreePitch.trim()
        ? payload.spoilerFreePitch.trim().slice(0, 90)
        : fallback.spoilerFreePitch,
      estimatedQuestions: clampRating(payload.estimatedQuestions, 6, 30),
      profileVersion: PUZZLE_AI_PROFILE_VERSION,
      generatedAt: new Date().toISOString()
    };
  } catch {
    return generateFallbackPuzzleAiProfile(input);
  }
}

function getAiConfig() {
  return {
    baseUrl: process.env.AI_BASE_URL || process.env.MIMO_BASE_URL,
    apiKey: process.env.AI_API_KEY || process.env.MIMO_API_KEY,
    model: process.env.AI_MODEL || process.env.MIMO_AGENT_MODEL
  };
}

export async function generatePuzzleAiProfile(input: ProfileInput): Promise<PuzzleAiProfile> {
  const { baseUrl, apiKey, model } = getAiConfig();
  if (!baseUrl || !apiKey || !model) return generateFallbackPuzzleAiProfile(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_PROFILE_TIMEOUT_MS) || 30000);
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
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: buildPuzzleAiProfilePrompt(input)
      })
    });
    if (!response.ok) return generateFallbackPuzzleAiProfile(input);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return parsePuzzleAiProfileResponse(payload.choices?.[0]?.message?.content ?? "", input);
  } catch {
    return generateFallbackPuzzleAiProfile(input);
  } finally {
    clearTimeout(timeout);
  }
}
