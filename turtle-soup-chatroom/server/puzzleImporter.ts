import { z } from "zod";
import { createHash } from "node:crypto";
import type { Difficulty, ManagedPuzzle, PuzzleStatus, SolutionPointDefinition } from "../src/shared/types";
import { getAiHostConfig } from "./aiHost";
import { normalizePuzzleTags } from "./puzzleTags";

const PuzzleImportSchema = z.object({
  title: z.string().min(1).max(80),
  surface: z.string().min(1).max(500),
  truth: z.string().min(1).max(2000),
  solutionPoints: z.array(z.string().min(1)).min(1).max(12),
  hints: z.array(z.string().min(1)).max(10).default([]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string().min(1)).max(10).default([]),
  qualityScore: z.number().min(0).max(100),
  qualityIssues: z.array(z.string()).max(16).default([]),
  qualitySummary: z.string().max(500).default("")
});

type PuzzleImportPayload = z.input<typeof PuzzleImportSchema>;

export interface PuzzleImportResult {
  puzzle: ManagedPuzzle;
}

function normalizeRawText(rawText: string) {
  return rawText.trim().replace(/\r\n/g, "\n");
}

export function createImportFingerprintId(rawText: string, sourceUrl?: string, sourceTitle?: string) {
  const fingerprint = [
    normalizeRawText(rawText),
    sourceUrl?.trim() ?? "",
    sourceTitle?.trim() ?? ""
  ].join("\n---source---\n");
  return `import_${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`;
}

function importTimeoutMs() {
  const configured = Number(process.env.AI_IMPORT_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 60000;
}

function fallbackTitle(rawText: string) {
  return normalizeRawText(rawText).split("\n").find(Boolean)?.slice(0, 40) || "未命名题目";
}

function parseLabeledRawText(rawText: string) {
  const lines = normalizeRawText(rawText).split("\n");
  const fields: Partial<Record<"title" | "surface" | "truth", string[]>> = {};
  let currentField: "title" | "surface" | "truth" | undefined;
  const labelMap: Record<string, "title" | "surface" | "truth"> = {
    标题: "title",
    题名: "title",
    汤面: "surface",
    谜面: "surface",
    汤底: "truth",
    谜底: "truth",
    真相: "truth"
  };

  for (const line of lines) {
    const match = line.match(/^\s*(标题|题名|汤面|谜面|汤底|谜底|真相)\s*[:：]\s*(.*)$/);
    if (match) {
      currentField = labelMap[match[1]];
      fields[currentField] = [match[2].trim()].filter(Boolean);
      continue;
    }
    if (currentField && line.trim()) {
      fields[currentField] = [...(fields[currentField] ?? []), line.trim()];
    }
  }

  const title = fields.title?.join("\n").trim();
  const surface = fields.surface?.join("\n").trim();
  const truth = fields.truth?.join("\n").trim();
  if (!title && !surface && !truth) return undefined;
  return { title, surface, truth };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function textOrUndefined(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function isEmptyListText(value: string) {
  return /^(无|没有|暂无|空|none|null|n\/a|na)$/i.test(value.trim());
}

function stringList(value: unknown, options: { splitCommas: boolean; limit?: number } = { splitCommas: true }) {
  const items: string[] = [];
  const pushText = (text: string) => {
    const trimmed = text.trim();
    if (trimmed && !isEmptyListText(trimmed)) items.push(trimmed);
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = textOrUndefined(item);
      if (text) pushText(text);
    }
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return stringList(JSON.parse(trimmed), options);
      } catch {
        // Treat it as plain text below.
      }
    }
    if (!isEmptyListText(trimmed)) {
      const splitter = options.splitCommas ? /[\n,，、;；]+/ : /[\n;；]+/;
      for (const item of trimmed.split(splitter)) pushText(item);
    }
  }

  const deduped = Array.from(new Set(items));
  return typeof options.limit === "number" ? deduped.slice(0, options.limit) : deduped;
}

function numberOrDefault(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(100, Math.max(0, numberValue));
}

function normalizeDifficultyValue(value: unknown): Difficulty {
  const text = String(value ?? "").trim().toLowerCase();
  if (/^(easy|简单|入门|低|低难度|新手)$/.test(text)) return "easy";
  if (/^(hard|困难|高|高难度|较难)$/.test(text)) return "hard";
  return "medium";
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("AI 返回格式不合格：JSON 缺失");
}

function parseJsonObject(raw: string) {
  try {
    return JSON.parse(extractJsonText(raw)) as unknown;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("AI 返回格式不合格")) throw error;
    throw new Error("AI 返回格式不合格：JSON 解析失败");
  }
}

function unwrapImportPayload(value: unknown) {
  if (Array.isArray(value)) return value[0];
  if (!isRecord(value)) return value;
  for (const key of ["puzzle", "data", "result", "题目"]) {
    const nested = value[key];
    if (isRecord(nested)) return nested;
  }
  return value;
}

function normalizeSolutionPointItem(item: unknown, index: number) {
  if (typeof item === "string") return item.trim();
  if (!isRecord(item)) return "";

  const weightValue = readField(item, ["weight", "score", "分值", "权重"]);
  const idValue = readField(item, ["id", "key", "keyId", "pointId", "编号"]);
  const label = textOrUndefined(readField(item, [
    "label",
    "fact",
    "description",
    "content",
    "关键事实",
    "关键点",
    "描述",
    "内容"
  ]));
  if (!label) return "";

  const aliases = stringList(readField(item, ["aliases", "synonyms", "同义说法", "同义词", "别名"]), {
    splitCommas: true,
    limit: 6
  });
  const weight = Number(weightValue);
  if (!Number.isFinite(weight)) return label;

  const idValueText = textOrUndefined(idValue);
  const pointId = idValueText && /^point-\d+$/i.test(idValueText) ? idValueText : `point-${index + 1}`;
  return aliases.length > 0 ? `${weight}|${pointId}|${label}|${aliases.join(",")}` : `${weight}|${pointId}|${label}`;
}

function normalizeSolutionPoints(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => normalizeSolutionPointItem(item, index))
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof value === "string") {
    return stringList(value, { splitCommas: false, limit: 12 });
  }

  return [];
}

function normalizeTagFields(value: unknown) {
  if (!isRecord(value)) return [];
  return [
    textOrUndefined(readField(value, ["worldview", "world", "世界观"])),
    textOrUndefined(readField(value, ["soupColor", "tone", "汤色"])),
    textOrUndefined(readField(value, ["roleType", "roles", "角色类型"])),
    textOrUndefined(readField(value, ["difficultyTag", "difficulty", "难度标签"]))
  ].filter((tag): tag is string => Boolean(tag));
}

function normalizeImportPayload(value: unknown): PuzzleImportPayload {
  const payload = unwrapImportPayload(value);
  if (!isRecord(payload)) {
    return {
      title: "",
      surface: "",
      truth: "",
      solutionPoints: [],
      hints: [],
      difficulty: "medium",
      tags: [],
      qualityScore: 0,
      qualityIssues: [],
      qualitySummary: ""
    };
  }

  return {
    title: textOrUndefined(readField(payload, ["title", "标题", "题目", "题名", "name"])) ?? "",
    surface: textOrUndefined(readField(payload, ["surface", "汤面", "谜面", "question", "story"])) ?? "",
    truth: textOrUndefined(readField(payload, ["truth", "汤底", "谜底", "真相", "answer", "solution"])) ?? "",
    solutionPoints: normalizeSolutionPoints(readField(payload, [
      "solutionPoints",
      "keyPoints",
      "points",
      "facts",
      "关键点",
      "解谜点",
      "得分点",
      "核心线索"
    ])),
    hints: stringList(readField(payload, ["hints", "hint", "提示", "线索提示"]), { splitCommas: true, limit: 10 }),
    difficulty: normalizeDifficultyValue(readField(payload, ["difficulty", "难度"])),
    tags: [
      ...normalizeTagFields(readField(payload, ["tagAnalysis", "tagsAnalysis", "标签分析"])),
      ...stringList(readField(payload, ["tags", "tag", "标签", "分类"]), { splitCommas: true, limit: 10 })
    ],
    qualityScore: numberOrDefault(readField(payload, ["qualityScore", "score", "质量评分", "评分"]), 0),
    qualityIssues: stringList(readField(payload, ["qualityIssues", "issues", "质量问题", "问题"]), {
      splitCommas: true,
      limit: 16
    }),
    qualitySummary: textOrUndefined(readField(payload, ["qualitySummary", "summary", "质量摘要", "摘要", "评价"])) ?? ""
  };
}

function formatImportIssue(issue: z.ZodIssue) {
  const field = issue.path.join(".") || "root";
  if (issue.code === "invalid_type" && issue.received === "undefined") return `${field} 缺失`;
  if (issue.code === "invalid_type") return `${field} 类型不对`;
  if (issue.code === "invalid_enum_value") return `${field} 只能是 easy/medium/hard`;
  if (issue.code === "too_small") {
    const minimum = "minimum" in issue ? issue.minimum : 1;
    return `${field} 至少 ${minimum} 个/字`;
  }
  if (issue.code === "too_big") {
    const maximum = "maximum" in issue ? issue.maximum : "上限";
    return `${field} 超过 ${maximum} 个/字`;
  }
  return `${field} ${issue.message}`;
}

function parseImportPayload(raw: string) {
  const normalized = normalizeImportPayload(parseJsonObject(raw));
  const parsed = PuzzleImportSchema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(formatImportIssue).join("；");
    throw new Error(`AI 返回格式不合格：${issues}`);
  }
  return parsed.data;
}

function splitAliases(value: string) {
  return value.split(/[,，/、]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[\s，,。！？!?；;：:"“”'‘’、/|()-]/g, "");
}

function splitPointCandidates(value: string) {
  return value
    .split(/[。！？!?；;\n]/)
    .flatMap((item) => item.split(/，|,/))
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .filter((item) => !/广告|查看详情|送礼物|发布于|编辑于/.test(item));
}

const curatedPointIds = new Set(["water-state", "cup-position", "intrusion", "liquid-tampered", "realization"]);

function formatPoint(point: SolutionPointDefinition, index?: number) {
  const safeId = /^point-\d+$/i.test(point.id) || curatedPointIds.has(point.id)
    ? point.id
    : `point-${(index ?? 0) + 1}`;
  const base = `${point.weight}|${safeId}|${point.label}`;
  return point.aliases.length > 0 ? `${base}|${point.aliases.join(",")}` : base;
}

function normalizeWeights(points: SolutionPointDefinition[]) {
  const total = points.reduce((sum, point) => sum + Math.max(point.weight, 0), 0);
  if (total <= 0) {
    const equalWeight = Math.max(1, Math.round(100 / Math.max(points.length, 1)));
    return points.map((point) => ({ ...point, weight: equalWeight }));
  }

  let used = 0;
  return points.map((point, index) => {
    const isLast = index === points.length - 1;
    const weight = isLast ? 100 - used : Math.max(1, Math.round((Math.max(point.weight, 0) / total) * 100));
    used += weight;
    return { ...point, weight };
  });
}

export function parseSolutionPointDefinitions(points: string[]): SolutionPointDefinition[] {
  return points
    .map((rawPoint, index) => {
      const raw = rawPoint.trim();
      const pipeParts = raw.split("|").map((part) => part.trim());
      if (pipeParts.length >= 3 && Number.isFinite(Number(pipeParts[0]))) {
        return {
          weight: Number(pipeParts[0]),
          id: pipeParts[1] || `point-${index + 1}`,
          label: pipeParts[2],
          aliases: splitAliases(pipeParts[3] ?? "")
        };
      }

      const readableParts = raw.split("::").map((part) => part.trim());
      if (readableParts.length >= 2 && Number.isFinite(Number(readableParts[1]))) {
        return {
          id: `point-${index + 1}`,
          label: readableParts[0],
          weight: Number(readableParts[1]),
          aliases: splitAliases(readableParts[2] ?? "")
        };
      }

      return {
        id: `point-${index + 1}`,
        label: raw,
        weight: 1,
        aliases: []
      };
    })
    .filter((point) => point.label);
}

function knownFactDefinitions(text: string): SolutionPointDefinition[] {
  const definitions: SolutionPointDefinition[] = [];
  const add = (point: SolutionPointDefinition) => {
    if (!definitions.some((item) => item.id === point.id)) definitions.push(point);
  };

  if (/水|液体|杯/.test(text) && /(热水|本来是热|原本是热|水温|冷水|变冷|水变冷)/.test(text)) {
    add({
      id: "water-state",
      label: "杯中液体状态异常",
      weight: 25,
      aliases: ["水变冷", "原本是热水"]
    });
  }
  if (/杯/.test(text) && /(位置没变|位置没有变|没动|未移动|原处)/.test(text)) {
    add({
      id: "cup-position",
      label: "杯子位置没有明显变化",
      weight: 15,
      aliases: ["杯子没动", "位置没变"]
    });
  }
  if (/(有人|陌生人|小偷|入侵者).{0,8}(进入|进|来过|闯入)|进入房间|进房|进屋|住所被入侵|家里被闯入/.test(text)) {
    add({
      id: "intrusion",
      label: "有人进入房间",
      weight: 25,
      aliases: ["有人来过", "有人进屋"]
    });
  }
  if (/(替换|换了|换过|动过|碰过).{0,8}(水|液体|杯)|杯中液体|杯里的水/.test(text)) {
    add({
      id: "liquid-tampered",
      label: "有人替换或动过杯中液体",
      weight: 25,
      aliases: ["换水", "动过水", "替换液体"]
    });
  }
  if (/(意识到|发现|知道|判断|明白|报警).{0,12}(入侵|闯入|有人来过|不安全|住所|家里)/.test(text)) {
    add({
      id: "realization",
      label: "男人意识到住所被入侵",
      weight: 10,
      aliases: ["报警原因", "发现入侵"]
    });
  }

  return definitions;
}

function isCoveredByKnownFact(candidate: string, knownFacts: SolutionPointDefinition[]) {
  const key = normalizeKey(candidate);
  return knownFacts.some((fact) => {
    const terms = [fact.label, ...fact.aliases].map(normalizeKey);
    if (terms.some((term) => term && (key.includes(term) || term.includes(key)))) return true;
    if (fact.id === "water-state" && /(水|液体|杯).*(热|冷|温)|热水|冷水|变冷/.test(candidate)) return true;
    if (fact.id === "cup-position" && /杯.*(位置|没动|没变)|位置没变/.test(candidate)) return true;
    if (fact.id === "intrusion" && /(进入|进房|进屋|入侵|闯入|来过)/.test(candidate)) return true;
    if (fact.id === "liquid-tampered" && /(替换|换|动过|碰过).*(水|液体|杯)|杯中液体/.test(candidate)) return true;
    if (fact.id === "realization" && /(意识到|发现|知道|报警|入侵)/.test(candidate)) return true;
    return false;
  });
}

export function normalizeImportedSolutionPoints(input: {
  surface: string;
  truth: string;
  solutionPoints: string[];
}) {
  const rawPoints = input.solutionPoints.map((point) => point.trim()).filter(Boolean);
  if (rawPoints.length === 0) return [];

  const parsed = parseSolutionPointDefinitions(rawPoints);
  const hasWeightedPoints = rawPoints.some((point) => {
    const pipeParts = point.split("|").map((part) => part.trim());
    const readableParts = point.split("::").map((part) => part.trim());
    return (pipeParts.length >= 3 && Number.isFinite(Number(pipeParts[0]))) ||
      (readableParts.length >= 2 && Number.isFinite(Number(readableParts[1])));
  });
  if (hasWeightedPoints) {
    return normalizeWeights(parsed).map((point, index) => formatPoint(point, index));
  }

  const combinedText = [input.surface, input.truth, ...rawPoints].join("\n");
  const knownFacts = knownFactDefinitions(combinedText);
  const candidates = rawPoints.length > 0 ? rawPoints : splitPointCandidates(combinedText);
  const genericFacts: SolutionPointDefinition[] = [];
  const seen = new Set(knownFacts.map((point) => point.id));

  for (const candidate of candidates) {
    if (isCoveredByKnownFact(candidate, knownFacts)) continue;
    const key = normalizeKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    genericFacts.push({
      id: `point-${genericFacts.length + 1}`,
      label: candidate,
      weight: 1,
      aliases: []
    });
    if (knownFacts.length + genericFacts.length >= 8) break;
  }

  return normalizeWeights([...knownFacts, ...genericFacts].slice(0, 8)).map((point, index) => formatPoint(point, index));
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
  status: PuzzleStatus;
  sourceUrl?: string;
  sourceTitle?: string;
}): ManagedPuzzle {
  const now = new Date().toISOString();
  const fingerprintText = input.rawText || [input.title, input.surface, input.truth].join("\n");
  const publishedAt = input.status === "published" ? now : undefined;
  return {
    id: createImportFingerprintId(fingerprintText, input.sourceUrl, input.sourceTitle),
    title: input.title,
    surface: input.surface,
    truth: input.truth,
    solutionPoints: normalizeImportedSolutionPoints({
      surface: input.surface,
      truth: input.truth,
      solutionPoints: input.solutionPoints
    }),
    difficulty: input.difficulty,
    tags: normalizePuzzleTags({
      tags: input.tags,
      difficulty: input.difficulty,
      surface: input.surface,
      truth: input.truth
    }),
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
    reviewedAt: publishedAt,
    publishedAt,
    updatedAt: now
  };
}

export function parsePuzzleImportResponse(raw: string, rawText = "", sourceUrl?: string, sourceTitle?: string): ManagedPuzzle {
  const parsed = parseImportPayload(raw);
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
    status: "published"
  });
}

export function createFallbackDraft(rawText: string, sourceUrl?: string, sourceTitle?: string, aiFailureReason?: string): ManagedPuzzle {
  const normalized = normalizeRawText(rawText);
  const labeled = parseLabeledRawText(normalized);
  const hasStructuredFields = Boolean(labeled?.title && labeled.surface && labeled.truth);
  const qualityIssues = [
    ...(aiFailureReason ? [aiFailureReason] : []),
    hasStructuredFields ? "关键点待补充" : "字段解析失败"
  ];
  return createManagedPuzzle({
    rawText: normalized,
    sourceUrl,
    sourceTitle,
    title: labeled?.title || fallbackTitle(normalized),
    surface: labeled?.surface || normalized.slice(0, 180) || "待补充汤面",
    truth: labeled?.truth || "待结构化汤底",
    solutionPoints: [],
    hints: [],
    difficulty: "medium",
    tags: [],
    qualityScore: 0,
    qualityIssues,
    qualitySummary: hasStructuredFields
      ? "已从原始文本解析出标题、汤面和汤底，关键点待补充。"
      : "原始文本已保存，等待重新结构化。",
    status: "draft"
  });
}

export function buildImportPrompt(rawText: string) {
  return [
    {
      role: "system" as const,
      content: [
        "你是海龟汤题库编辑。",
        "请把用户提供的原始题目整理成适合线上多人推理的结构化题目。",
        "不要输出 Markdown，只输出 JSON。",
        "必须使用英文键名：title, surface, truth, solutionPoints, hints, difficulty, tagAnalysis, tags, qualityScore, qualityIssues, qualitySummary。",
        "difficulty 只能是 easy、medium、hard。",
        "solutionPoints 必须是 3 到 8 个不重复的原子事实，作为后续 AI 主持评分依据。",
        "每个 solutionPoint 都必须独立、可验证，并覆盖汤底的关键因果、核心诡计或必要身份关系。",
        "不要机械按原文行数或句子拆点；合并同一事实的状态变化、前后描述和同义表达。",
        "solutionPoints 优先输出字符串格式：权重|point-编号|中文关键事实|中文同义说法1,中文同义说法2；所有权重加总建议为 100。",
        "不要使用英文语义 id，例如 mental_illness；id 用 point-1、point-2 这种编号即可。",
        "tags、hints、qualityIssues 必须是字符串数组；qualityScore 必须是数字。",
        "tagAnalysis 是公开标签的逐字段判断，格式为 {\"worldview\":\"本格|变格\",\"soupColor\":\"清汤|红汤\",\"roleType\":\"全人类|含非人\",\"difficultyTag\":\"入门|中级|高难\"}。",
        "tags 是公开给玩家看的筛选标签，必须按 tagAnalysis 的 worldview、soupColor、roleType、difficultyTag 顺序复制为 4 项数组。",
        "禁止写会剧透汤底的具体事实、角色真相、凶手身份、尸体位置、道具答案。不要输出黑汤。",
        "必须基于汤底判断标签，不要只看汤面。鬼、幽灵、怪物、人偶、机器人、动物角色 => 含非人；人格分裂、梦游、幻觉、精神疾病 => 变格，但仍然是全人类。",
        "例如不要把“父亲被替换”“尸体在水箱”“水被换过”“凶手是保安”写成标签，这些只能放进 solutionPoints。",
        "不要把同一个事实拆成多个重复点，例如“水原本是热的”和“水变冷”应合并为一个液体状态异常点。",
        "输出示例：{\"title\":\"冷掉的水\",\"surface\":\"男人喝了一口冷水后报警。\",\"truth\":\"水本来是热的，说明有人进过房间。\",\"solutionPoints\":[\"50|point-1|杯中液体状态异常|水变冷,原本是热水\",\"50|point-2|有人进入房间|有人来过,有人进屋\"],\"hints\":[\"注意水温\"],\"difficulty\":\"easy\",\"tagAnalysis\":{\"worldview\":\"本格\",\"soupColor\":\"清汤\",\"roleType\":\"全人类\",\"difficultyTag\":\"入门\"},\"tags\":[\"本格\",\"清汤\",\"全人类\",\"入门\"],\"qualityScore\":88,\"qualityIssues\":[],\"qualitySummary\":\"结构清晰\"}"
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
    throw new Error("AI 未配置");
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), importTimeoutMs());
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
        messages: buildImportPrompt(normalized)
      })
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`AI 增强失败：HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content || "";
    if (!content.trim()) {
      throw new Error("AI 返回内容为空");
    }

    try {
      return {
        puzzle: parsePuzzleImportResponse(content, normalized, sourceUrl, sourceTitle)
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("AI 返回格式不合格")) throw error;
      throw new Error("AI 返回格式不合格");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI 增强失败：请求超时");
    }
    if (error instanceof Error && (
      error.message.startsWith("AI ") ||
      error.message.startsWith("AI增强失败") ||
      error.message.startsWith("AI 增强失败")
    )) {
      throw error;
    }
    throw new Error("AI 增强失败：请求异常");
  }
}
