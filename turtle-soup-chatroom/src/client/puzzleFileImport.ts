export interface ParsedPuzzleFileItem {
  rawText: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

function cleanCell(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim()
    .replace(/^《(.+)》$/, "$1")
    .trim();
}

function splitTxt(content: string): ParsedPuzzleFileItem[] {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((rawText) => ({ rawText }));
}

function parseSource(value: string) {
  const cleaned = cleanCell(value);
  const match = cleaned.match(/^\[([^\]]+)]\(([^)]+)\)$/);
  if (!match) return { sourceTitle: cleaned || undefined, sourceUrl: undefined };
  return { sourceTitle: match[1].trim(), sourceUrl: match[2].trim() || undefined };
}

function splitMarkdownRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed.slice(1, -1).split("|").map(cleanCell);
}

function parseMarkdownTable(content: string): ParsedPuzzleFileItem[] {
  const rows: ParsedPuzzleFileItem[] = [];
  for (const line of content.split(/\r?\n/)) {
    const cells = splitMarkdownRow(line);
    if (cells.length < 4) continue;
    if (cells[0] === "#" || cells[0].startsWith("---")) continue;
    const index = Number.parseInt(cells[0], 10);
    if (!Number.isFinite(index)) continue;
    const [title, surface, truth, source] = [cells[1], cells[2], cells[3], cells[4] ?? ""];
    const parsedSource = parseSource(source);
    rows.push({
      rawText: [`标题：${title}`, `汤面：${surface}`, `汤底：${truth}`].join("\n"),
      sourceTitle: parsedSource.sourceTitle,
      sourceUrl: parsedSource.sourceUrl
    });
  }
  return rows;
}

function parseMarkdownSectionHeading(line: string) {
  const match = line.match(/^#{2,6}\s*(?:\d+\s*[.、]\s*)?(?:《([^》]+)》|(.+?))\s*$/);
  if (!match) return "";
  const title = cleanCell(match[1] ?? match[2] ?? "");
  if (!title || /^汤[面底]\s*[:：]?$/.test(title) || /^来源\s*[:：]?$/.test(title)) return "";
  return title;
}

function parseMarkdownLabeledLine(line: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(`^\\s*(?:\\*\\*)?${escapedLabel}\\s*[:：]\\s*(?:\\*\\*)?\\s*(.*?)\\s*$`));
  return match ? cleanCell(match[1] ?? "") : undefined;
}

function findMarkdownLabelLine(lines: string[], label: string, startIndex = 0) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (parseMarkdownLabeledLine(lines[index], label) !== undefined) return index;
  }
  return -1;
}

function cleanMarkdownBlock(lines: string[]) {
  return lines
    .join("\n")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseMarkdownHeadingSections(content: string): ParsedPuzzleFileItem[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const headings = lines
    .map((line, index) => ({ index, title: parseMarkdownSectionHeading(line) }))
    .filter((heading): heading is { index: number; title: string } => Boolean(heading.title));

  return headings
    .map<ParsedPuzzleFileItem | undefined>((heading, headingIndex) => {
      const nextHeading = headings[headingIndex + 1]?.index ?? lines.length;
      const sectionLines = lines.slice(heading.index + 1, nextHeading);
      const sourceLineIndex = findMarkdownLabelLine(sectionLines, "来源");
      const surfaceLineIndex = findMarkdownLabelLine(sectionLines, "汤面");
      const truthLineIndex = findMarkdownLabelLine(sectionLines, "汤底", surfaceLineIndex + 1);

      if (surfaceLineIndex < 0 || truthLineIndex < 0 || truthLineIndex <= surfaceLineIndex) return undefined;

      const sourceValue = sourceLineIndex >= 0 ? parseMarkdownLabeledLine(sectionLines[sourceLineIndex], "来源") ?? "" : "";
      const parsedSource: Pick<ParsedPuzzleFileItem, "sourceTitle" | "sourceUrl"> = sourceValue ? parseSource(sourceValue) : {};
      const inlineSurface = parseMarkdownLabeledLine(sectionLines[surfaceLineIndex], "汤面") ?? "";
      const inlineTruth = parseMarkdownLabeledLine(sectionLines[truthLineIndex], "汤底") ?? "";
      const surfaceBody = cleanMarkdownBlock(sectionLines.slice(surfaceLineIndex + 1, truthLineIndex));
      const truthBody = cleanMarkdownBlock(sectionLines.slice(truthLineIndex + 1));
      const surface = cleanCell([inlineSurface, surfaceBody].filter(Boolean).join("\n").trim());
      const truth = cleanCell([inlineTruth, truthBody].filter(Boolean).join("\n").trim());

      if (!surface || !truth) return undefined;
      return {
        rawText: [`标题：${heading.title}`, `汤面：${surface}`, `汤底：${truth}`].join("\n"),
        sourceTitle: parsedSource.sourceTitle,
        sourceUrl: parsedSource.sourceUrl
      };
    })
    .filter((item): item is ParsedPuzzleFileItem => Boolean(item));
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cleanCell(current));
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(cleanCell(current));
  return cells;
}

function getField(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

function parseCsv(content: string): ParsedPuzzleFileItem[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim());
  const headers = splitCsvLine(lines[0] ?? "");
  return lines
    .slice(1)
    .map(splitCsvLine)
    .map((cells) => {
      const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
      const title = getField(row, ["title", "标题"]);
      const surface = getField(row, ["surface", "汤面"]);
      const truth = getField(row, ["truth", "汤底"]);
      return {
        rawText: [`标题：${title}`, `汤面：${surface}`, `汤底：${truth}`].join("\n"),
        sourceTitle: getField(row, ["sourceTitle", "来源标题"]) || undefined,
        sourceUrl: getField(row, ["sourceUrl", "来源URL", "来源 URL"]) || undefined
      };
    })
    .filter((item) => item.rawText.replace(/标题：|汤面：|汤底：|\n/g, "").trim());
}

export function parsePuzzleFileContent(input: { filename: string; content: string }): ParsedPuzzleFileItem[] {
  const filename = input.filename.toLowerCase();
  if (filename.endsWith(".csv")) return parseCsv(input.content);
  if (filename.endsWith(".md") || filename.endsWith(".markdown")) {
    const tableRows = parseMarkdownTable(input.content);
    if (tableRows.length > 0) return tableRows;
    const sectionRows = parseMarkdownHeadingSections(input.content);
    return sectionRows.length > 0 ? sectionRows : splitTxt(input.content);
  }
  return splitTxt(input.content);
}
