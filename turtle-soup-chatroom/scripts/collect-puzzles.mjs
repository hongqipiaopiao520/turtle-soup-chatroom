function decodeHtmlEntity(entity) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };
  if (entity.startsWith("#x")) {
    return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
  }
  if (entity.startsWith("#")) {
    return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
  }
  return named[entity] ?? `&${entity};`;
}

export function stripHtmlToText(html) {
  return html
    .replace(/<title[\s\S]*?<\/title>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(h[1-6]|p|div|article|section|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&([a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/g, (_match, entity) => decodeHtmlEntity(entity))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractTitleFromHtml(html, fallback = "") {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? stripHtmlToText(title).slice(0, 120) : fallback;
}

export function extractPuzzleCandidates(text, sourceUrl, sourceTitle) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];

  const sectionPattern = /(标题|题目|汤面|谜面|汤底|真相|答案|解析)[:：]/;
  const paragraphs = normalized.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const structured = paragraphs.find((paragraph) => sectionPattern.test(paragraph) && paragraph.length >= 20);
  const rawText = structured || normalized.split("\n").slice(0, 18).join("\n").trim();

  if (rawText.length < 12) {
    return [];
  }

  return [{ rawText, sourceUrl, sourceTitle }];
}

async function fetchSearchResults(query, searchEndpoint, fetcher) {
  if (!searchEndpoint) {
    throw new Error("缺少 PUZZLE_SEARCH_ENDPOINT，无法按关键词搜索");
  }
  const separator = searchEndpoint.includes("?") ? "&" : "?";
  const response = await fetcher(`${searchEndpoint}${separator}q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(`搜索失败：${response.status}`);
  }
  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      url: typeof item.url === "string" ? item.url : ""
    }))
    .filter((item) => item.url);
}

async function fetchUrlCandidate(url, fetcher, sourceTitle) {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`抓取失败：${response.status}`);
  }
  const html = await response.text();
  const title = sourceTitle || extractTitleFromHtml(html, url);
  return extractPuzzleCandidates(stripHtmlToText(html), url, title);
}

async function postCandidate(candidate, adminBaseUrl, adminToken, fetcher) {
  const response = await fetcher(`${adminBaseUrl.replace(/\/$/, "")}/api/admin/puzzles/import-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
    },
    body: JSON.stringify(candidate)
  });
  if (!response.ok) {
    throw new Error(`导入失败：${response.status}`);
  }
  await response.json().catch(() => null);
}

export async function collectPuzzles(options) {
  const fetcher = options.fetcher ?? fetch;
  const adminBaseUrl = options.adminBaseUrl ?? "http://localhost:8787";
  const adminToken = options.adminToken;
  const failed = [];
  let imported = 0;
  let skipped = 0;
  const targets = [];

  for (const url of options.urls ?? []) {
    targets.push({ url });
  }

  for (const query of options.queries ?? []) {
    try {
      const results = await fetchSearchResults(query, options.searchEndpoint, fetcher);
      targets.push(...results.map((result) => ({ url: result.url, sourceTitle: result.title })));
    } catch (error) {
      failed.push(`${query}: ${error instanceof Error ? error.message : "搜索失败"}`);
    }
  }

  for (const target of targets) {
    try {
      const candidates = await fetchUrlCandidate(target.url, fetcher, target.sourceTitle);
      if (candidates.length === 0) {
        skipped += 1;
        continue;
      }
      for (const candidate of candidates) {
        await postCandidate(candidate, adminBaseUrl, adminToken, fetcher);
        imported += 1;
      }
    } catch (error) {
      failed.push(`${target.url}: ${error instanceof Error ? error.message : "处理失败"}`);
    }
  }

  return { imported, skipped, failed };
}

function parseArgs(argv) {
  const options = {
    urls: [],
    queries: [],
    adminBaseUrl: process.env.ADMIN_BASE_URL || "http://localhost:8787",
    adminToken: process.env.ADMIN_TOKEN,
    searchEndpoint: process.env.PUZZLE_SEARCH_ENDPOINT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--url" && value) {
      options.urls.push(value);
      index += 1;
    } else if (arg === "--query" && value) {
      options.queries.push(value);
      index += 1;
    } else if (arg === "--admin-base-url" && value) {
      options.adminBaseUrl = value;
      index += 1;
    } else if (arg === "--admin-token" && value) {
      options.adminToken = value;
      index += 1;
    } else if (arg === "--search-endpoint" && value) {
      options.searchEndpoint = value;
      index += 1;
    }
  }

  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await collectPuzzles(parseArgs(process.argv.slice(2)));
  console.log(`Imported: ${result.imported}`);
  console.log(`Skipped: ${result.skipped}`);
  if (result.failed.length > 0) {
    console.log("Failed:");
    for (const item of result.failed) {
      console.log(`- ${item}`);
    }
  }
}
