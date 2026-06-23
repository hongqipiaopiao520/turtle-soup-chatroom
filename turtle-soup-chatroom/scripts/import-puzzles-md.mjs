import { readFileSync } from "node:fs";
function decodeEntity(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"");
}

function cleanCell(value) {
  return decodeEntity(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function cleanTitle(value) {
  return cleanCell(value).replace(/^《(.+)》$/, "$1").trim();
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cleanCell(cell));
}

export function parseSourceLink(value) {
  const cleaned = cleanCell(value);
  const match = cleaned.match(/^\[([^\]]+)]\(([^)]+)\)$/);
  if (!match) {
    return { sourceTitle: cleaned, sourceUrl: undefined };
  }
  return { sourceTitle: match[1].trim(), sourceUrl: match[2].trim() || undefined };
}

export function parseMarkdownPuzzleTable(content) {
  const rows = [];
  for (const line of content.split(/\r?\n/)) {
    const cells = splitMarkdownRow(line);
    if (cells.length < 5) continue;
    if (cells[0] === "#" || cells[0].startsWith("---")) continue;
    const index = Number.parseInt(cells[0], 10);
    if (!Number.isFinite(index)) continue;
    const source = parseSourceLink(cells[4]);
    rows.push({
      index,
      title: cleanTitle(cells[1]),
      surface: cleanCell(cells[2]),
      truth: cleanCell(cells[3]),
      ...source
    });
  }
  return rows;
}

function pinyinishSlug(value) {
  const known = {
    妹: "mei",
    的: "de",
    房: "fang",
    间: "jian",
    歌: "ge",
    声: "sheng"
  };
  const parts = [];
  for (const char of value) {
    if (/[\w-]/.test(char)) {
      parts.push(char.toLowerCase());
    } else if (known[char]) {
      parts.push(known[char]);
    }
  }
  const slug = parts.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug || Array.from(value).map((char) => char.codePointAt(0)?.toString(36)).filter(Boolean).join("-");
}

function makeId(row) {
  return `md-${row.index}-${pinyinishSlug(row.title)}`;
}

function addPoint(points, point) {
  const normalized = point.trim();
  if (!normalized || normalized.length > 18 || points.includes(normalized)) return;
  points.push(normalized);
}

function templatePoints(row) {
  const text = `${row.surface}\n${row.truth}`;
  const points = [];

  if (/妹妹[^。；，,]*头七|妹妹[^。；，,]*(尸体|坟|棺)/.test(text)) addPoint(points, "妹妹已经死亡");
  if (/摩擦地板|摩擦/.test(text)) addPoint(points, "棺内传出摩擦声");
  if (/棺材[^。；]*打开|棺椁[^。；]*打开|打开了/.test(text)) addPoint(points, "棺材被人打开");
  if (/老鼠/.test(text)) addPoint(points, "棺内钻入老鼠");
  if (/尸体[^。；]*(啃|面目全非)|啃食/.test(text)) addPoint(points, "尸体被老鼠啃食");
  if (/保安[^。；]*(恋尸癖)|恋尸癖/.test(text)) addPoint(points, "保安有恋尸癖");
  if (/保安[^。；]*(担心|败露)/.test(text)) addPoint(points, "保安担心败露");
  if (/(把我也|我也).{0,6}(鲨|杀)|结果我死了/.test(text)) addPoint(points, "叙述者被杀死");
  if (/头七/.test(text)) addPoint(points, "事件发生在头七");
  if (/扫墓|坟前|坟墓/.test(text)) addPoint(points, "叙述者去扫墓");
  if (/棺材|棺椁/.test(text)) addPoint(points, "异常来自棺材");

  return points;
}

function cleanPointCandidate(value) {
  return value
    .replace(/^(原来|于是|然后|随后|结果|因为|所以|然而|没想到|吓得)/, "")
    .replace(/^(我|他|她|他们|我们)(发现|知道|意识到)/, "")
    .replace(/[“”"']/g, "")
    .trim();
}

function splitClausePoints(value) {
  return value
    .split(/[。！？!?；;\n，,]/)
    .map(cleanPointCandidate)
    .filter((item) => item.length >= 5 && item.length <= 18)
    .filter((item) => !/广告|查看详情|送礼物|发布于|编辑于/.test(item));
}

function solutionPointsFor(row) {
  const points = templatePoints(row);
  for (const item of splitClausePoints(row.truth)) {
    addPoint(points, item);
    if (points.length >= 8) break;
  }

  if (points.length < 4) {
    for (const item of splitClausePoints(row.surface)) {
      addPoint(points, item);
      if (points.length >= 4) break;
    }
  }

  return points.slice(0, 8);
}

function difficultyFor(row) {
  const total = row.surface.length + row.truth.length;
  if (total > 650) return "hard";
  if (total < 160) return "easy";
  return "medium";
}

function tagsFor(row) {
  const tags = [];
  if (row.sourceTitle?.includes("许二木")) tags.push("许二木");
  if (row.sourceTitle?.includes("经典")) tags.push("经典");
  if (row.truth.includes("鬼") || row.surface.includes("诡") || row.truth.includes("灵异")) tags.push("灵异");
  if (row.truth.includes("杀") || row.truth.includes("尸") || row.truth.includes("死")) tags.push("悬疑");
  if (tags.length === 0) tags.push("待分类");
  return [...new Set(tags)].slice(0, 6);
}

function qualityIssuesFor(row) {
  const issues = [];
  const joined = `${row.surface}\n${row.truth}`;
  if (!row.sourceUrl) issues.push("缺少来源链接");
  if (row.truth.length > 900) issues.push("汤底较长，建议人工精简");
  if (/广告|查看详情|送礼物|发布于|编辑于/.test(joined)) issues.push("疑似包含平台噪声或广告文本");
  return issues;
}

function qualityScoreFor(row, issues) {
  let score = 70;
  if (row.sourceUrl) score += 8;
  if (row.surface.length > 20 && row.truth.length > 20) score += 8;
  score -= issues.length * 10;
  if (row.truth.length > 900) score -= 8;
  return Math.max(20, Math.min(90, score));
}

export function convertMarkdownRowToPuzzle(row, status = "reviewing") {
  const now = new Date().toISOString();
  const issues = qualityIssuesFor(row);
  const rawText = [
    `标题：${row.title}`,
    `汤面：${row.surface}`,
    `汤底：${row.truth}`,
    row.sourceTitle ? `来源：${row.sourceTitle}${row.sourceUrl ? ` ${row.sourceUrl}` : ""}` : ""
  ].filter(Boolean).join("\n");

  return {
    id: makeId(row),
    title: row.title,
    surface: row.surface,
    truth: row.truth,
    solutionPoints: solutionPointsFor(row),
    difficulty: difficultyFor(row),
    tags: tagsFor(row),
    author: row.sourceTitle || "Markdown 导入",
    rating: 0,
    plays: 0,
    createdAt: now,
    status,
    rawText,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    hints: [],
    estimatedMinutes: 15,
    qualityScore: qualityScoreFor(row, issues),
    qualityIssues: issues,
    qualitySummary: issues.length > 0 ? "已导入审核队列，建议处理质量问题后发布。" : "结构完整，等待人工审核。",
    updatedAt: now
  };
}

export function importMarkdownPuzzles(options) {
  const rows = parseMarkdownPuzzleTable(options.content)
    .filter((row) => !options.source || row.sourceTitle.includes(options.source))
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.title || !row.surface || !row.truth) {
      skipped += 1;
      continue;
    }
    options.repository.upsertManaged(convertMarkdownRowToPuzzle(row, options.status ?? "reviewing"));
    imported += 1;
  }

  return { imported, skipped };
}

function parseArgs(argv) {
  const options = { status: "reviewing" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--file" && value) {
      options.file = value;
      index += 1;
    } else if (arg === "--limit" && value) {
      options.limit = Number.parseInt(value, 10);
      index += 1;
    } else if (arg === "--source" && value) {
      options.source = value;
      index += 1;
    } else if (arg === "--status" && value) {
      options.status = value;
      index += 1;
    } else if (arg === "--database-url" && value) {
      options.databaseUrl = value;
      index += 1;
    }
  }
  return options;
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.file) {
    throw new Error("缺少 --file <path>");
  }
  if (options.databaseUrl) {
    process.env.DATABASE_URL = options.databaseUrl;
  }
  const { openDatabase } = await import("../server/storage/database.ts");
  const { createPuzzleRepository } = await import("../server/storage/puzzleRepository.ts");
  const db = openDatabase();
  const repository = createPuzzleRepository(db);
  const content = readFileSync(options.file, "utf8");
  const result = importMarkdownPuzzles({ ...options, content, repository });
  db.close();
  console.log(`Imported: ${result.imported}`);
  console.log(`Skipped: ${result.skipped}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
