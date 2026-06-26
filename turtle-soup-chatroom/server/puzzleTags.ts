import type { Difficulty } from "../src/shared/types";

const WORLD_TAGS = ["本格", "变格"] as const;
const TONE_TAGS = ["清汤", "红汤"] as const;
const ROLE_TAGS = ["全人类", "含非人"] as const;
const DIFFICULTY_TAGS = ["入门", "中级", "高难"] as const;

export const PUBLIC_TAG_ORDER = [
  ...WORLD_TAGS,
  ...TONE_TAGS,
  ...ROLE_TAGS,
  ...DIFFICULTY_TAGS
] as const;

const PUBLIC_TAG_SET = new Set<string>(PUBLIC_TAG_ORDER);
const WORLD_TAG_SET = new Set<string>(WORLD_TAGS);
const TONE_TAG_SET = new Set<string>(TONE_TAGS);
const ROLE_TAG_SET = new Set<string>(ROLE_TAGS);
const DIFFICULTY_TAG_SET = new Set<string>(DIFFICULTY_TAGS);

const TAG_ALIASES: Record<string, string> = {
  现实: "本格",
  现实逻辑: "本格",
  非现实: "变格",
  超自然: "变格",
  鬼怪: "变格",
  清: "清汤",
  红: "红汤",
  人类: "全人类",
  非人: "含非人",
  动物: "含非人",
  幽灵: "含非人",
  机器人: "含非人",
  简单: "入门",
  easy: "入门",
  medium: "中级",
  困难: "高难",
  hard: "高难"
};

const SPOILER_PATTERNS = [
  /替换|换过|动过/,
  /凶手|真凶|犯人/,
  /尸体.*(藏|换|吃|啃)|人肉|食人|肢解/,
  /父亲|母亲|爸爸|妈妈|保安|护工|妹妹|哥哥|姐姐|弟弟/,
  /精神分裂|人格分裂|多重人格/,
  /水变冷|热水|冷水/,
  /打火机|婚戒|镜子/
];

export interface NormalizePuzzleTagsInput {
  tags: string[];
  difficulty: Difficulty;
  surface: string;
  truth: string;
}

export type InferPuzzleTagsInput = Omit<NormalizePuzzleTagsInput, "tags">;

export interface AnalyzePuzzleTagsInput extends InferPuzzleTagsInput {
  title?: string;
}

const TAG_FIELDS = {
  worldview: WORLD_TAG_SET,
  soupColor: TONE_TAG_SET,
  roleType: ROLE_TAG_SET,
  difficultyTag: DIFFICULTY_TAG_SET
};

function difficultyTag(difficulty: Difficulty) {
  if (difficulty === "easy") return "入门";
  if (difficulty === "hard") return "高难";
  return "中级";
}

function normalizeTagText(tag: string) {
  return tag.replace(/^#+/, "").trim();
}

function isSpoilerTag(tag: string) {
  if (PUBLIC_TAG_SET.has(tag)) return false;
  return SPOILER_PATTERNS.some((pattern) => pattern.test(tag));
}

function safePush(tags: string[], tag: string | undefined) {
  if (!tag || !PUBLIC_TAG_SET.has(tag) || tags.includes(tag)) return;
  tags.push(tag);
}

function hasNonHumanSignal(text: string) {
  return /(鬼|幽灵|灵异|闹鬼|妖怪|怪物|人偶|机器人|动物|非人|魔法|穿越|科幻)/.test(text);
}

function inferWorld(text: string) {
  return /(鬼|幽灵|灵异|闹鬼|穿越|魔法|怪物|机器人|科幻|人格分裂|精神分裂|精神异常|梦游|幻觉)/.test(text) ? "变格" : "本格";
}

function inferTone(text: string) {
  if (/(死|尸|杀|谋杀|自杀|他杀|死亡|尸体|人肉|食人)/.test(text)) return "红汤";
  return "清汤";
}

function inferRole(text: string) {
  return hasNonHumanSignal(text) ? "含非人" : "全人类";
}

function inferPuzzleTagsFromTextWithoutNormalize(input: NormalizePuzzleTagsInput) {
  const text = `${input.surface}\n${input.truth}`;
  return [
    inferWorld(text),
    inferTone(text),
    inferRole(text)
  ];
}

export function normalizePuzzleTags(input: NormalizePuzzleTagsInput) {
  const explicitTags: string[] = [];

  for (const rawTag of input.tags) {
    const normalized = normalizeTagText(rawTag);
    if (!normalized || isSpoilerTag(normalized)) continue;
    const canonical = TAG_ALIASES[normalized] ?? normalized;
    if (PUBLIC_TAG_SET.has(canonical) && !explicitTags.includes(canonical)) {
      explicitTags.push(canonical);
    }
  }

  const world = explicitTags.find((tag) => WORLD_TAG_SET.has(tag)) ?? inferWorld(`${input.surface}\n${input.truth}`);
  const tone = explicitTags.find((tag) => TONE_TAG_SET.has(tag)) ?? inferTone(`${input.surface}\n${input.truth}`);
  const role = explicitTags.find((tag) => ROLE_TAG_SET.has(tag)) ?? inferRole(`${input.surface}\n${input.truth}`);
  const difficulty = explicitTags.find((tag) => DIFFICULTY_TAG_SET.has(tag)) ?? difficultyTag(input.difficulty);
  const tags: string[] = [];

  for (const tag of [world, tone, role, difficulty]) {
    safePush(tags, tag);
  }

  return PUBLIC_TAG_ORDER.filter((tag) => tags.includes(tag));
}

export function inferPuzzleTagsFromText(input: InferPuzzleTagsInput) {
  const text = `${input.surface}\n${input.truth}`;
  return normalizePuzzleTags({
    ...input,
    tags: [
      inferWorld(text),
      inferTone(text),
      inferRole(text),
      difficultyTag(input.difficulty)
    ]
  });
}

function getTagAiConfig() {
  return {
    baseUrl: process.env.AI_BASE_URL || process.env.MIMO_BASE_URL,
    apiKey: process.env.AI_API_KEY || process.env.MIMO_API_KEY,
    model: process.env.AI_MODEL || process.env.MIMO_AGENT_MODEL
  };
}

function tagTimeoutMs() {
  const configured = Number(process.env.AI_TAG_TIMEOUT_MS || process.env.AI_IMPORT_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 30000;
}

export function buildPuzzleTagPrompt(input: AnalyzePuzzleTagsInput) {
  return [
    {
      role: "system" as const,
      content: [
        "你是海龟汤题库标签编辑。",
        "请只判断公开给玩家看的 4 个筛选标签，不要输出任何会剧透汤底的具体事实。",
        "必须只输出 JSON，不要 Markdown，不要解释。",
        "JSON 格式：{\"worldview\":\"本格\",\"soupColor\":\"清汤\",\"roleType\":\"全人类\",\"difficultyTag\":\"入门\",\"tags\":[\"本格\",\"清汤\",\"全人类\",\"入门\"]}",
        "逐字段判断，不要只填 tags 数组。",
        "worldview 只能是 本格 或 变格。",
        "soupColor 只能是 清汤 或 红汤。",
        "roleType 只能是 全人类 或 含非人。",
        "difficultyTag 只能是 入门、中级 或 高难。",
        "tags 必须恰好 4 个，并且按 worldview、soupColor、roleType、difficultyTag 的顺序复制字段值。",
        "必须基于汤底判断，不要只看汤面。",
        "本格=现实逻辑成立；变格=含灵异、鬼魂、穿越、人格分裂、梦游、幻觉、怪物、魔法、科幻等非现实设定。",
        "清汤=没有死亡、尸体或杀害；红汤=有人死亡、有尸体或发生杀害。不要输出黑汤。",
        "全人类=角色都是现实人类；含非人=有动物、人偶、幽灵、鬼、机器人、怪物等。",
        "注意：鬼、幽灵、怪物、人偶、机器人、动物角色 => 含非人；人格分裂、梦游、幻觉、精神疾病 => 变格，但仍然是全人类。",
        "含非人不是具体剧透，是允许公开的筛选标签。",
        "入门=线索直白；中级=一层反转或需要多轮提问；高难=多层嵌套、强误导或冷门知识。",
        "不要输出“有死人”“悬疑”“心理诡计”“道具诡计”等额外标签。"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        input.title ? `标题：${input.title}` : "",
        `难度字段：${input.difficulty}`,
        `汤面：${input.surface}`,
        `汤底：${input.truth}`
      ].filter(Boolean).join("\n\n")
    }
  ];
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

export function parsePuzzleTagResponse(raw: string, fallbackInput: NormalizePuzzleTagsInput) {
  try {
    const payload = JSON.parse(extractJsonText(raw)) as {
      tags?: unknown;
      worldview?: unknown;
      soupColor?: unknown;
      roleType?: unknown;
      difficultyTag?: unknown;
    };
    const structuredTags = [
      typeof payload.worldview === "string" && TAG_FIELDS.worldview.has(payload.worldview) ? payload.worldview : undefined,
      typeof payload.soupColor === "string" && TAG_FIELDS.soupColor.has(payload.soupColor) ? payload.soupColor : undefined,
      typeof payload.roleType === "string" && TAG_FIELDS.roleType.has(payload.roleType) ? payload.roleType : undefined,
      typeof payload.difficultyTag === "string" && TAG_FIELDS.difficultyTag.has(payload.difficultyTag) ? payload.difficultyTag : undefined
    ].filter((tag): tag is string => Boolean(tag));
    const tags = structuredTags.length === 4
      ? structuredTags
      : Array.isArray(payload.tags) ? payload.tags.map(String) : [];
    return normalizePuzzleTags({ ...fallbackInput, tags });
  } catch {
    return normalizePuzzleTags(fallbackInput);
  }
}

export async function analyzePuzzleTagsWithAi(input: AnalyzePuzzleTagsInput) {
  const { baseUrl, apiKey, model } = getTagAiConfig();
  const fallbackInput = { ...input, tags: [] };
  if (!baseUrl || !apiKey || !model) {
    return normalizePuzzleTags(fallbackInput);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), tagTimeoutMs());
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
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: buildPuzzleTagPrompt(input)
      })
    });

    if (!response.ok) {
      throw new Error(`AI 标签分析失败：HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return parsePuzzleTagResponse(payload.choices?.[0]?.message?.content || "", fallbackInput);
  } finally {
    clearTimeout(timeout);
  }
}
