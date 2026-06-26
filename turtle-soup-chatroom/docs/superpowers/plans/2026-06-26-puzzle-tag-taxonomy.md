# Puzzle Tag Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make imported puzzle tags stable, non-spoilery, and useful for player filtering by separating public taxonomy tags from internal solution points.

**Architecture:** Add a shared server-side tag taxonomy/normalizer, apply it to AI imports and Markdown imports, and update prompts/tests so public `tags` only contain allowed category labels. Keep `solutionPoints` as the internal judging facts; do not encode core twists or answer facts in public tags.

**Tech Stack:** TypeScript server modules, ESM Markdown import script, Vitest tests, existing `ManagedPuzzle.tags: string[]` schema.

## Global Constraints

- Do not add a new database column in this iteration; public tags still use `tags: string[]`.
- Public tags must be player-facing and must not reveal concrete solution facts such as "尸体替换", "父亲被替换", "水被换过", "凶手是保安".
- Internal answer facts remain in `solutionPoints`.
- Tags should normally be 5-7 items, max 8 after normalization.
- Tag order must be stable: world view -> soup tone -> death -> role type -> theme/style -> reasoning type -> difficulty label.
- Keep current `difficulty: "easy" | "medium" | "hard"` unchanged, but mirror it to Chinese public tags: `入门` / `中级` / `高难`.
- Existing imported puzzles should remain readable; unknown legacy tags may be mapped or dropped by the normalizer.
- Historical cleanup must be dry-run by default. A command must require `--write` before changing SQLite data.
- Management UI reanalysis should use the same normalizer as the script; do not maintain two tag rules.

---

## File Structure

- Create `server/puzzleTags.ts`: owns the allowed vocabulary, alias mapping, spoiler filtering, and `normalizePuzzleTags(...)`.
- Create `scripts/normalize-puzzle-tags.mjs`: one-shot online cleanup script for existing SQLite puzzle rows, dry-run by default.
- Modify `server/puzzleImporter.ts`: normalize AI-returned tags during `createManagedPuzzle(...)` and tighten `buildImportPrompt(...)`.
- Modify `server/adminPuzzleRoutes.ts`: add admin route for reanalyzing tags for one or many puzzles.
- Modify `server/storage/puzzleRepository.ts`: add a small update helper for replacing only tags on an existing puzzle.
- Modify `src/client/adminPuzzles.ts`: add client function for tag reanalysis.
- Modify `src/components/AdminPage.tsx`: add "重新分析标签" action for selected puzzles.
- Modify `scripts/import-puzzles-md.mjs`: replace the current loose `tagsFor(...)` with the shared normalizer and lightweight text inference.
- Modify `tests/puzzleImporter.test.ts`: cover AI import tag normalization and spoiler-tag removal.
- Modify `tests/importPuzzlesMd.test.ts`: cover Markdown import taxonomy tags.
- Modify `tests/adminPuzzleRoutes.test.ts`: cover admin tag reanalysis.
- Modify `tests/adminPuzzlesClient.test.ts`: cover client request shape.
- Modify `tests/adminPageUi.test.tsx`: cover that the management UI exposes the action.
- Optional later UI task: update home filter grouping if the flat tag dropdown becomes too long. This plan does not require home-page UI changes.

---

### Task 1: Add Public Tag Taxonomy Normalizer

**Files:**
- Create: `server/puzzleTags.ts`
- Test: `tests/puzzleImporter.test.ts`

**Interfaces:**
- Produces:
  - `PUBLIC_TAG_ORDER: readonly string[]`
  - `normalizePuzzleTags(input: NormalizePuzzleTagsInput): string[]`
  - `inferPuzzleTagsFromText(input: InferPuzzleTagsInput): string[]`
- Consumes: `Difficulty` from `src/shared/types.ts`

- [ ] **Step 1: Write failing tests for allowed tags and spoiler removal**

Add these imports at the top of `tests/puzzleImporter.test.ts`:

```ts
import { inferPuzzleTagsFromText, normalizePuzzleTags } from "../server/puzzleTags";
```

Add this test block before `describe("parsePuzzleImportResponse", ...)`:

```ts
describe("puzzle tag taxonomy", () => {
  it("normalizes public tags into stable non-spoilery taxonomy order", () => {
    expect(normalizePuzzleTags({
      tags: ["尸体替换", "本格", "犯罪悬疑", "高难", "硬核逻辑", "有死人", "全人类", "黑汤"],
      difficulty: "hard",
      surface: "男人回家后发现父亲不对劲。",
      truth: "父亲已经被替换，尸体被藏起来。"
    })).toEqual(["本格", "黑汤", "有死人", "全人类", "犯罪", "逻辑硬核", "高难"]);
  });

  it("infers safe public tags from puzzle text", () => {
    expect(inferPuzzleTagsFromText({
      difficulty: "medium",
      surface: "男人喝了一口冷水后立刻报警。",
      truth: "水原本是热的，说明有人进入房间并动过杯中液体。"
    })).toEqual(["本格", "清汤", "无死人", "全人类", "日常", "逻辑硬核", "中级"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/puzzleImporter.test.ts
```

Expected: FAIL because `server/puzzleTags.ts` does not exist.

- [ ] **Step 3: Create `server/puzzleTags.ts`**

Create `server/puzzleTags.ts` with:

```ts
import type { Difficulty } from "../src/shared/types";

const WORLD_TAGS = ["本格", "变格"] as const;
const TONE_TAGS = ["清汤", "红汤", "黑汤"] as const;
const DEATH_TAGS = ["有死人", "无死人"] as const;
const ROLE_TAGS = ["全人类", "含非人"] as const;
const STYLE_TAGS = [
  "日常",
  "亲情",
  "爱情",
  "友情",
  "治愈",
  "校园",
  "古风",
  "犯罪",
  "悬疑",
  "心理惊悚",
  "细思极恐",
  "都市怪谈",
  "搞笑",
  "脑洞",
  "黑色幽默",
  "灵异",
  "科幻",
  "穿越",
  "武侠修仙",
  "童话",
  "末日",
  "密室"
] as const;
const REASONING_TAGS = [
  "视角诡计",
  "文字陷阱",
  "常识科普",
  "心理诡计",
  "逻辑硬核",
  "道具诡计",
  "短汤脑洞"
] as const;
const DIFFICULTY_TAGS = ["入门", "中级", "高难"] as const;

export const PUBLIC_TAG_ORDER = [
  ...WORLD_TAGS,
  ...TONE_TAGS,
  ...DEATH_TAGS,
  ...ROLE_TAGS,
  ...STYLE_TAGS,
  ...REASONING_TAGS,
  ...DIFFICULTY_TAGS
] as const;

const PUBLIC_TAG_SET = new Set<string>(PUBLIC_TAG_ORDER);

const TAG_ALIASES: Record<string, string> = {
  现实: "本格",
  现实逻辑: "本格",
  非现实: "变格",
  超自然: "变格",
  鬼怪: "变格",
  清: "清汤",
  红: "红汤",
  黑: "黑汤",
  死人: "有死人",
  死亡: "有死人",
  没死人: "无死人",
  无死亡: "无死人",
  人类: "全人类",
  非人: "含非人",
  动物: "含非人",
  幽灵: "含非人",
  机器人: "含非人",
  犯罪悬疑: "犯罪",
  谋杀: "犯罪",
  杀人: "犯罪",
  恐怖: "心理惊悚",
  惊悚: "心理惊悚",
  病娇: "心理惊悚",
  硬核逻辑: "逻辑硬核",
  逻辑: "逻辑硬核",
  机关: "道具诡计",
  道具: "道具诡计",
  文字游戏: "文字陷阱",
  谐音梗: "文字陷阱",
  脑筋急转弯: "短汤脑洞",
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

function inferWorld(text: string) {
  return /(鬼|幽灵|灵异|穿越|魔法|怪物|机器人|科幻|人格分裂|精神分裂|梦游|幻觉)/.test(text) ? "变格" : "本格";
}

function inferTone(text: string) {
  if (/(肢解|人肉|食人|啃食|腐烂|恋尸|变态|重口|血肉)/.test(text)) return "黑汤";
  if (/(死|尸|杀|谋杀|自杀|他杀|死亡|尸体)/.test(text)) return "红汤";
  return "清汤";
}

function inferDeath(text: string) {
  return /(死|尸|杀|谋杀|自杀|他杀|死亡|尸体)/.test(text) ? "有死人" : "无死人";
}

function inferRole(text: string) {
  return /(鬼|幽灵|机器人|动物|人偶|怪物|非人)/.test(text) ? "含非人" : "全人类";
}

function inferStyle(text: string) {
  if (/(犯罪|谋杀|凶手|警察|作案|杀人)/.test(text)) return "犯罪";
  if (/(鬼|灵异|怪谈|闹鬼)/.test(text)) return "灵异";
  if (/(亲情|爸爸|妈妈|父亲|母亲|家人)/.test(text)) return "亲情";
  if (/(学校|校园|同学|老师)/.test(text)) return "校园";
  if (/(搞笑|笑|荒诞)/.test(text)) return "搞笑";
  return "日常";
}

function inferReasoning(text: string) {
  if (/(第一人称|视角|身份错位|误以为)/.test(text)) return "视角诡计";
  if (/(谐音|双关|歧义|字|名字)/.test(text)) return "文字陷阱";
  if (/(精神分裂|人格|幻觉|梦游|认知)/.test(text)) return "心理诡计";
  if (/(机关|凶器|道具|杯|镜子|电梯|门|窗|水)/.test(text)) return "道具诡计";
  if (text.length < 160) return "短汤脑洞";
  return "逻辑硬核";
}

export function inferPuzzleTagsFromText(input: InferPuzzleTagsInput) {
  const text = `${input.surface}\n${input.truth}`;
  return normalizePuzzleTags({
    ...input,
    tags: [
      inferWorld(text),
      inferTone(text),
      inferDeath(text),
      inferRole(text),
      inferStyle(text),
      inferReasoning(text),
      difficultyTag(input.difficulty)
    ]
  });
}

export function normalizePuzzleTags(input: NormalizePuzzleTagsInput) {
  const inferred = inferPuzzleTagsFromTextWithoutNormalize(input);
  const sourceTags = [...input.tags, ...inferred, difficultyTag(input.difficulty)];
  const tags: string[] = [];

  for (const rawTag of sourceTags) {
    const normalized = normalizeTagText(rawTag);
    if (!normalized || isSpoilerTag(normalized)) continue;
    safePush(tags, TAG_ALIASES[normalized] ?? normalized);
  }

  return PUBLIC_TAG_ORDER.filter((tag) => tags.includes(tag)).slice(0, 8);
}

function inferPuzzleTagsFromTextWithoutNormalize(input: NormalizePuzzleTagsInput) {
  const text = `${input.surface}\n${input.truth}`;
  return [
    inferWorld(text),
    inferTone(text),
    inferDeath(text),
    inferRole(text),
    inferStyle(text),
    inferReasoning(text)
  ];
}
```

- [ ] **Step 4: Run tests to verify Task 1 passes**

Run:

```bash
npm test -- tests/puzzleImporter.test.ts
```

Expected: PASS for the new taxonomy tests, existing importer tests may still fail until Task 2 if they assert old tag behavior.

- [ ] **Step 5: Commit Task 1**

```bash
git add server/puzzleTags.ts tests/puzzleImporter.test.ts
git commit -m "feat: add puzzle tag taxonomy normalizer"
```

---

### Task 2: Apply Taxonomy to AI Imports and Prompt

**Files:**
- Modify: `server/puzzleImporter.ts`
- Test: `tests/puzzleImporter.test.ts`

**Interfaces:**
- Consumes: `normalizePuzzleTags(...)` from `server/puzzleTags.ts`
- Produces: AI-imported `ManagedPuzzle.tags` always normalized to safe public taxonomy tags.

- [ ] **Step 1: Write failing parse/import tests**

In `tests/puzzleImporter.test.ts`, update the existing `"parses valid structured puzzle JSON"` assertion to include normalized tags:

```ts
expect(result.tags).toEqual(["本格", "红汤", "有死人", "全人类", "悬疑", "中级"]);
```

Add a new test inside `describe("parsePuzzleImportResponse", ...)`:

```ts
it("keeps concrete answer facts out of imported public tags", () => {
  const result = parsePuzzleImportResponse(JSON.stringify({
    title: "保姆",
    surface: "保姆一周没来，我发现家里好像有人。",
    truth: "叙述者梦游时杀死保姆，并把尸体藏在水箱里。",
    solutionPoints: ["叙述者梦游", "保姆死亡", "尸体在水箱"],
    hints: ["注意叙述者状态"],
    difficulty: "hard",
    tags: ["本格", "保姆死亡", "尸体水箱", "心理诡计", "黑汤"],
    qualityScore: 82,
    qualityIssues: [],
    qualitySummary: "结构完整"
  }));

  expect(result.tags).toEqual(["变格", "黑汤", "有死人", "全人类", "心理惊悚", "心理诡计", "高难"]);
  expect(result.tags).not.toContain("保姆死亡");
  expect(result.tags).not.toContain("尸体水箱");
});
```

- [ ] **Step 2: Run importer tests to verify failure**

Run:

```bash
npm test -- tests/puzzleImporter.test.ts
```

Expected: FAIL because `createManagedPuzzle(...)` still stores raw `input.tags`.

- [ ] **Step 3: Normalize tags in `server/puzzleImporter.ts`**

Add this import near the top:

```ts
import { normalizePuzzleTags } from "./puzzleTags";
```

In `createManagedPuzzle(...)`, replace:

```ts
tags: input.tags,
```

with:

```ts
tags: normalizePuzzleTags({
  tags: input.tags,
  difficulty: input.difficulty,
  surface: input.surface,
  truth: input.truth
}),
```

- [ ] **Step 4: Tighten `buildImportPrompt(...)`**

In `server/puzzleImporter.ts`, inside `buildImportPrompt(...)`, replace the current generic tag instruction:

```ts
"tags、hints、qualityIssues 必须是字符串数组；qualityScore 必须是数字。",
```

with:

```ts
"tags、hints、qualityIssues 必须是字符串数组；qualityScore 必须是数字。",
"tags 是公开给玩家看的筛选标签，禁止写会剧透汤底的具体事实、角色真相、凶手身份、尸体位置、道具答案。",
"tags 必须优先从这些词中选择，最多 7 个，顺序为：本格/变格；清汤/红汤/黑汤；有死人/无死人；全人类/含非人；日常、亲情、爱情、友情、治愈、校园、古风、犯罪、悬疑、心理惊悚、细思极恐、都市怪谈、搞笑、脑洞、黑色幽默、灵异、科幻、穿越、武侠修仙、童话、末日、密室；视角诡计、文字陷阱、常识科普、心理诡计、逻辑硬核、道具诡计、短汤脑洞；入门/中级/高难。",
"例如不要把“父亲被替换”“尸体在水箱”“水被换过”“凶手是保安”写成标签，这些只能放进 solutionPoints。",
```

Also replace the prompt example's tag list:

```ts
"输出示例：{\"title\":\"冷掉的水\",\"surface\":\"男人喝了一口冷水后报警。\",\"truth\":\"水本来是热的，说明有人进过房间。\",\"solutionPoints\":[\"50|point-1|杯中液体状态异常|水变冷,原本是热水\",\"50|point-2|有人进入房间|有人来过,有人进屋\"],\"hints\":[\"注意水温\"],\"difficulty\":\"easy\",\"tags\":[\"本格\"],\"qualityScore\":88,\"qualityIssues\":[],\"qualitySummary\":\"结构清晰\"}"
```

with:

```ts
"输出示例：{\"title\":\"冷掉的水\",\"surface\":\"男人喝了一口冷水后报警。\",\"truth\":\"水本来是热的，说明有人进过房间。\",\"solutionPoints\":[\"50|point-1|杯中液体状态异常|水变冷,原本是热水\",\"50|point-2|有人进入房间|有人来过,有人进屋\"],\"hints\":[\"注意水温\"],\"difficulty\":\"easy\",\"tags\":[\"本格\",\"清汤\",\"无死人\",\"全人类\",\"日常\",\"道具诡计\",\"入门\"],\"qualityScore\":88,\"qualityIssues\":[],\"qualitySummary\":\"结构清晰\"}"
```

- [ ] **Step 5: Add prompt test**

Add this test inside `describe("parsePuzzleImportResponse", ...)` or a new `describe("buildImportPrompt", ...)` block:

```ts
it("tells the import model to keep spoiler facts out of public tags", () => {
  const systemPrompt = buildImportPrompt("标题：测试")[0].content;

  expect(systemPrompt).toContain("tags 是公开给玩家看的筛选标签");
  expect(systemPrompt).toContain("禁止写会剧透汤底的具体事实");
  expect(systemPrompt).toContain("父亲被替换");
  expect(systemPrompt).toContain("solutionPoints");
});
```

If `buildImportPrompt` is not imported in `tests/puzzleImporter.test.ts`, update the import:

```ts
import {
  buildImportPrompt,
  createFallbackDraft,
  createImportFingerprintId,
  importPuzzleFromText,
  parsePuzzleImportResponse
} from "../server/puzzleImporter";
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- tests/puzzleImporter.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add server/puzzleImporter.ts tests/puzzleImporter.test.ts
git commit -m "feat: normalize ai import puzzle tags"
```

---

### Task 3: Apply Taxonomy to Markdown Import Script

**Files:**
- Modify: `scripts/import-puzzles-md.mjs`
- Test: `tests/importPuzzlesMd.test.ts`

**Interfaces:**
- Consumes: `inferPuzzleTagsFromText(...)` and `normalizePuzzleTags(...)` from `server/puzzleTags.ts`
- Produces: Markdown-imported puzzles use the same safe public tag taxonomy.

- [ ] **Step 1: Write failing Markdown import tests**

In `tests/importPuzzlesMd.test.ts`, update `"converts a parsed row into an auto-published managed puzzle"`:

Replace:

```ts
expect(puzzle.tags).toContain("许二木");
```

with:

```ts
expect(puzzle.tags).toEqual(["本格", "红汤", "有死人", "全人类", "犯罪", "中级"]);
expect(puzzle.tags).not.toContain("许二木");
```

Add this test inside `describe("markdown puzzle import", ...)`:

```ts
it("uses safe taxonomy tags instead of concrete markdown answer facts", () => {
  const puzzle = convertMarkdownRowToPuzzle({
    index: 9,
    title: "镜中人",
    surface: "我在镜子里看见了和爸爸一模一样的人。",
    truth: "爸爸已经被替换，真正的爸爸被杀死藏了起来。",
    sourceTitle: "许二木S1",
    sourceUrl: "https://example.test/source"
  });

  expect(puzzle.tags).toEqual(["本格", "红汤", "有死人", "全人类", "亲情", "道具诡计", "中级"]);
  expect(puzzle.tags).not.toContain("爸爸被替换");
  expect(puzzle.tags).not.toContain("许二木");
});
```

- [ ] **Step 2: Run Markdown tests to verify failure**

Run:

```bash
npm test -- tests/importPuzzlesMd.test.ts
```

Expected: FAIL because `tagsFor(...)` still returns source tags and loose labels.

- [ ] **Step 3: Import shared tag normalizer**

At the top of `scripts/import-puzzles-md.mjs`, replace:

```js
import { normalizeImportedSolutionPoints } from "../server/puzzleImporter.ts";
```

with:

```js
import { normalizeImportedSolutionPoints } from "../server/puzzleImporter.ts";
import { inferPuzzleTagsFromText, normalizePuzzleTags } from "../server/puzzleTags.ts";
```

- [ ] **Step 4: Replace `tagsFor(row)`**

Replace the current `tagsFor(row)` implementation with:

```js
function tagsFor(row) {
  const difficulty = difficultyFor(row);
  const inferred = inferPuzzleTagsFromText({
    difficulty,
    surface: row.surface,
    truth: row.truth
  });

  return normalizePuzzleTags({
    tags: inferred,
    difficulty,
    surface: row.surface,
    truth: row.truth
  });
}
```

- [ ] **Step 5: Avoid recomputing difficulty twice**

In `convertMarkdownRowToPuzzle(...)`, add:

```js
const difficulty = difficultyFor(row);
```

near:

```js
const issues = qualityIssuesFor(row);
const publishedAt = status === "published" ? now : undefined;
```

Then replace:

```js
difficulty: difficultyFor(row),
tags: tagsFor(row),
```

with:

```js
difficulty,
tags: tagsFor(row),
```

- [ ] **Step 6: Run Markdown tests**

Run:

```bash
npm test -- tests/importPuzzlesMd.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add scripts/import-puzzles-md.mjs tests/importPuzzlesMd.test.ts
git commit -m "feat: normalize markdown import puzzle tags"
```

---

### Task 4: Clean Historical Tags and Add Admin Reanalysis

**Files:**
- Create: `scripts/normalize-puzzle-tags.mjs`
- Modify: `server/storage/puzzleRepository.ts`
- Modify: `server/adminPuzzleRoutes.ts`
- Modify: `src/client/adminPuzzles.ts`
- Modify: `src/components/AdminPage.tsx`
- Test: `tests/adminPuzzleRoutes.test.ts`
- Test: `tests/adminPuzzlesClient.test.ts`
- Test: `tests/adminPageUi.test.tsx`

**Interfaces:**
- Consumes: `normalizePuzzleTags(...)` from `server/puzzleTags.ts`
- Produces:
  - `PuzzleRepository.updateTags(id: string, tags: string[]): ManagedPuzzle`
  - `POST /api/admin/puzzles/reanalyze-tags` with body `{ ids?: string[]; status?: PuzzleStatus | "all" }`
  - `reanalyzeAdminPuzzleTags(input, options)` client function
  - `node scripts/normalize-puzzle-tags.mjs --db ./data/app.sqlite --write` online cleanup command

- [ ] **Step 1: Write failing repository/admin route tests**

In `tests/adminPuzzleRoutes.test.ts`, add this import if needed:

```ts
import { reanalyzePuzzleTags } from "../server/adminPuzzleRoutes";
```

Add this test inside the admin route/import describe block:

```ts
it("reanalyzes safe taxonomy tags for selected historical puzzles", () => {
  const db = openDatabase(makeDbPath());
  const repository = createPuzzleRepository(db);
  const puzzle = importTextDraft(repository, {
    rawText: [
      "标题：保姆",
      "汤面：保姆一周没来，我发现家里好像有人。",
      "汤底：叙述者梦游时杀死保姆，并把尸体藏在水箱里。"
    ].join("\n")
  });
  repository.updateManaged(puzzle.id, {
    title: "保姆",
    surface: "保姆一周没来，我发现家里好像有人。",
    truth: "叙述者梦游时杀死保姆，并把尸体藏在水箱里。",
    solutionPoints: ["叙述者梦游", "保姆死亡", "尸体在水箱"],
    hints: [],
    difficulty: "hard",
    tags: ["保姆死亡", "尸体水箱", "心理诡计"],
    qualityScore: 80,
    qualityIssues: [],
    qualitySummary: "旧数据"
  });

  const result = reanalyzePuzzleTags(repository, { ids: [puzzle.id] });

  expect(result.updated).toHaveLength(1);
  expect(result.updated[0].tags).toEqual(["变格", "黑汤", "有死人", "全人类", "心理惊悚", "心理诡计", "高难"]);
  expect(result.updated[0].tags).not.toContain("保姆死亡");
  db.close();
});
```

- [ ] **Step 2: Run route test to verify failure**

Run:

```bash
npm test -- tests/adminPuzzleRoutes.test.ts
```

Expected: FAIL because `reanalyzePuzzleTags(...)` and repository tag-only update do not exist.

- [ ] **Step 3: Add `updateTags(...)` to repository**

In `server/storage/puzzleRepository.ts`, extend `PuzzleRepository`:

```ts
updateTags(id: string, tags: string[]): ManagedPuzzle;
```

Inside the returned object from `createPuzzleRepository(...)`, add:

```ts
updateTags(id: string, tags: string[]) {
  const existing = requirePuzzle(findById(id), id);
  return this.upsertManaged({
    ...existing,
    tags,
    updatedAt: nextTimestampAfter(existing.updatedAt)
  });
},
```

- [ ] **Step 4: Add admin reanalysis service and route**

In `server/adminPuzzleRoutes.ts`, add:

```ts
import { normalizePuzzleTags } from "./puzzleTags";
```

Add schema near the other schemas:

```ts
const ReanalyzeTagsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).max(500).optional(),
  status: z.enum(["all", "draft", "reviewing", "published", "rejected"]).default("all")
});
```

Add exported helper:

```ts
export function reanalyzePuzzleTags(repository: PuzzleRepository, input: unknown) {
  const parsed = ReanalyzeTagsSchema.parse(input);
  const candidates = parsed.ids?.length
    ? parsed.ids.map((id) => repository.findById(id)).filter((puzzle): puzzle is ManagedPuzzle => Boolean(puzzle))
    : repository.listManaged(parsed.status === "all" ? undefined : parsed.status);
  const updated: ManagedPuzzle[] = [];
  const unchanged: string[] = [];

  for (const puzzle of candidates) {
    const tags = normalizePuzzleTags({
      tags: puzzle.tags,
      difficulty: puzzle.difficulty,
      surface: puzzle.surface,
      truth: puzzle.truth
    });
    if (JSON.stringify(tags) === JSON.stringify(puzzle.tags)) {
      unchanged.push(puzzle.id);
      continue;
    }
    updated.push(repository.updateTags(puzzle.id, tags));
  }

  return { updated, unchanged };
}
```

In `createAdminPuzzleRouter(...)`, add before `/:id` routes:

```ts
router.post("/puzzles/reanalyze-tags", (request, response) => {
  try {
    response.json(reanalyzePuzzleTags(repository, request.body));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "标签重新分析失败" });
  }
});
```

- [ ] **Step 5: Run route tests**

Run:

```bash
npm test -- tests/adminPuzzleRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write failing client test**

In `tests/adminPuzzlesClient.test.ts`, import the new client:

```ts
import { reanalyzeAdminPuzzleTags } from "../src/client/adminPuzzles";
```

Add:

```ts
it("requests tag reanalysis for selected puzzles", async () => {
  const fetcher = vi.fn().mockResolvedValue(jsonResponse({ updated: [], unchanged: ["p1"] }));

  await reanalyzeAdminPuzzleTags({ ids: ["p1"] }, { fetcher });

  expect(fetcher).toHaveBeenCalledWith("/api/admin/puzzles/reanalyze-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: ["p1"] })
  });
});
```

- [ ] **Step 7: Add admin client function**

In `src/client/adminPuzzles.ts`, add:

```ts
export interface AdminTagReanalysisInput {
  ids?: string[];
  status?: PuzzleStatus | "all";
}

export interface AdminTagReanalysisResult {
  updated: ManagedPuzzle[];
  unchanged: string[];
}

export function reanalyzeAdminPuzzleTags(input: AdminTagReanalysisInput, options: AdminClientOptions = {}) {
  return adminFetch<AdminTagReanalysisResult>(
    "/api/admin/puzzles/reanalyze-tags",
    {
      method: "POST",
      headers: headers(options, true),
      body: JSON.stringify(input)
    },
    options
  );
}
```

- [ ] **Step 8: Run client tests**

Run:

```bash
npm test -- tests/adminPuzzlesClient.test.ts
```

Expected: PASS.

- [ ] **Step 9: Add management UI action**

In `src/components/AdminPage.tsx`, import the client:

```ts
reanalyzeAdminPuzzleTags,
```

Add a handler inside `AdminPage(...)`:

```tsx
async function reanalyzeSelectedTags() {
  const ids = selectedIds.length > 0 ? selectedIds : selectedPuzzle ? [selectedPuzzle.id] : [];
  if (ids.length === 0) {
    setMessage("请先选择要重新分析标签的题目");
    return;
  }
  setIsBusy(true);
  setMessage("正在重新分析标签...");
  try {
    const result = await reanalyzeAdminPuzzleTags({ ids }, { token: token.trim() || undefined });
    setPuzzles((current) => current.map((puzzle) => result.updated.find((item) => item.id === puzzle.id) ?? puzzle));
    if (result.updated.some((item) => item.id === selectedId)) {
      const updatedSelected = result.updated.find((item) => item.id === selectedId);
      setDraft(puzzleToDraft(updatedSelected));
    }
    setMessage(`已更新 ${result.updated.length} 条标签，${result.unchanged.length} 条无需修改`);
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setIsBusy(false);
  }
}
```

Add a button near the existing batch action controls:

```tsx
<button type="button" className="ghost-button" onClick={reanalyzeSelectedTags} disabled={isBusy}>
  <RefreshCw size={16} />
  重新分析标签
</button>
```

- [ ] **Step 10: Add UI smoke test**

In `tests/adminPageUi.test.tsx`, add or update a static render assertion:

```ts
it("shows tag reanalysis action in admin tools", () => {
  const markup = renderToStaticMarkup(<AdminPage disableInitialLoad initialPuzzles={[]} />);

  expect(markup).toContain("重新分析标签");
});
```

Run:

```bash
npm test -- tests/adminPageUi.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Write failing script test**

Create or update a script test file `tests/normalizePuzzleTagsScript.test.ts`:

```ts
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizePuzzleTagsDatabase } from "../scripts/normalize-puzzle-tags.mjs";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";
import { seedPuzzles } from "../src/data/seedPuzzles";

const roots: string[] = [];

function makeDbPath() {
  const root = join(tmpdir(), `tag-cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  roots.push(root);
  mkdirSync(root, { recursive: true });
  return join(root, "app.sqlite");
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("normalize puzzle tags script", () => {
  it("dry-runs by default and writes only with write enabled", () => {
    const dbPath = makeDbPath();
    const db = openDatabase(dbPath);
    const repository = createPuzzleRepository(db);
    repository.upsertManaged({
      ...seedPuzzles[0],
      id: "legacy-tags",
      truth: "爸爸已经被替换，真正的爸爸被杀死藏了起来。",
      solutionPoints: ["父亲被替换"],
      status: "published",
      rawText: "旧题",
      sourceUrl: undefined,
      sourceTitle: "测试",
      hints: [],
      estimatedMinutes: 15,
      qualityScore: 80,
      qualityIssues: [],
      qualitySummary: "旧数据",
      tags: ["父亲被替换", "悬疑"],
      reviewedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    db.close();

    const dryRun = normalizePuzzleTagsDatabase({ dbPath, write: false });
    expect(dryRun.changed).toBe(1);

    const afterDryRunDb = openDatabase(dbPath);
    expect(createPuzzleRepository(afterDryRunDb).findById("legacy-tags")?.tags).toEqual(["父亲被替换", "悬疑"]);
    afterDryRunDb.close();

    const written = normalizePuzzleTagsDatabase({ dbPath, write: true });
    expect(written.changed).toBe(1);

    const afterWriteDb = openDatabase(dbPath);
    expect(createPuzzleRepository(afterWriteDb).findById("legacy-tags")?.tags).not.toContain("父亲被替换");
    afterWriteDb.close();
  });
});
```

- [ ] **Step 12: Add `scripts/normalize-puzzle-tags.mjs`**

Create `scripts/normalize-puzzle-tags.mjs`:

```js
import { openDatabase } from "../server/storage/database.ts";
import { createPuzzleRepository } from "../server/storage/puzzleRepository.ts";
import { normalizePuzzleTags } from "../server/puzzleTags.ts";

export function normalizePuzzleTagsDatabase({ dbPath, write = false, status }) {
  const db = openDatabase(dbPath);
  const repository = createPuzzleRepository(db);
  const puzzles = repository.listManaged(status);
  let changed = 0;
  let unchanged = 0;
  const changes = [];

  for (const puzzle of puzzles) {
    const nextTags = normalizePuzzleTags({
      tags: puzzle.tags,
      difficulty: puzzle.difficulty,
      surface: puzzle.surface,
      truth: puzzle.truth
    });
    if (JSON.stringify(nextTags) === JSON.stringify(puzzle.tags)) {
      unchanged += 1;
      continue;
    }
    changed += 1;
    changes.push({ id: puzzle.id, title: puzzle.title, before: puzzle.tags, after: nextTags });
    if (write) {
      repository.updateTags(puzzle.id, nextTags);
    }
  }

  db.close();
  return { changed, unchanged, changes };
}

function parseArgs(argv) {
  const options = { dbPath: process.env.DATABASE_URL?.replace(/^file:/, "") || "./data/app.sqlite", write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--db" && value) {
      options.dbPath = value;
      index += 1;
    } else if (arg === "--status" && value) {
      options.status = value;
      index += 1;
    } else if (arg === "--write") {
      options.write = true;
    }
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = normalizePuzzleTagsDatabase(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    mode: process.argv.includes("--write") ? "write" : "dry-run",
    changed: result.changed,
    unchanged: result.unchanged,
    preview: result.changes.slice(0, 20)
  }, null, 2));
}
```

- [ ] **Step 13: Run script tests**

Run:

```bash
npm test -- tests/normalizePuzzleTagsScript.test.ts
```

Expected: PASS.

- [ ] **Step 14: Commit Task 4**

```bash
git add scripts/normalize-puzzle-tags.mjs server/storage/puzzleRepository.ts server/adminPuzzleRoutes.ts src/client/adminPuzzles.ts src/components/AdminPage.tsx tests/adminPuzzleRoutes.test.ts tests/adminPuzzlesClient.test.ts tests/adminPageUi.test.tsx tests/normalizePuzzleTagsScript.test.ts
git commit -m "feat: reanalyze historical puzzle tags"
```

**Online runbook after deploy:**

Preview only:

```bash
node scripts/backup-sqlite.mjs --db ./data/app.sqlite
node scripts/normalize-puzzle-tags.mjs --db ./data/app.sqlite
```

Apply:

```bash
node scripts/normalize-puzzle-tags.mjs --db ./data/app.sqlite --write
```

In Docker deployment, run inside the app container or with the mounted SQLite path used by `DATABASE_URL`.

---

### Task 5: Regression Sweep and Build Verification

**Files:**
- No planned code changes unless tests reveal regressions.

**Interfaces:**
- Confirms imports, filtering, and builds still work with taxonomy-normalized tags.

- [ ] **Step 1: Run focused importer tests**

Run:

```bash
npm test -- tests/puzzleImporter.test.ts tests/importPuzzlesMd.test.ts tests/adminPuzzleRoutes.test.ts tests/adminPuzzlesClient.test.ts tests/adminPageUi.test.tsx tests/normalizePuzzleTagsScript.test.ts tests/puzzleFilters.test.ts tests/homePageUi.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. If Vite warns about local Node version but completes successfully, record the warning in the final summary.

- [ ] **Step 4: Manual smoke check**

Start or reuse the local dev server:

```bash
npm run dev -- --host 127.0.0.1 --port 8790
```

Open:

```txt
http://127.0.0.1:8790/admin
```

Smoke test:
- Import one puzzle whose raw AI tags include a spoiler like `父亲被替换`.
- Verify the saved public tags are taxonomy tags, not the spoiler phrase.
- Open home page and confirm puzzle cards show only safe tags.

- [ ] **Step 5: Commit verification-only fixes if needed**

Only if Task 4 required code changes:

```bash
git add <changed-files>
git commit -m "test: cover puzzle tag taxonomy regressions"
```

---

## Self-Review

**Spec coverage:**
- Stable 5-module style taxonomy: covered by `PUBLIC_TAG_ORDER`.
- Avoid core-point tags: covered by `SPOILER_PATTERNS`, prompt text, and tests.
- Keep solution points as judging facts: no schema change; importer still normalizes `solutionPoints`.
- AI import and batch/import-text behavior: covered by `server/puzzleImporter.ts`.
- Markdown bulk import behavior: covered by `scripts/import-puzzles-md.mjs`.
- Historical cleanup: covered by `scripts/normalize-puzzle-tags.mjs`, dry-run default, and admin reanalysis route/UI.

**Placeholder scan:**
- No `TBD`, `TODO`, or unspecified test steps.
- Every task includes exact files, commands, and expected results.

**Type consistency:**
- `normalizePuzzleTags(input: NormalizePuzzleTagsInput): string[]` is used by both import paths.
- `inferPuzzleTagsFromText(input: InferPuzzleTagsInput): string[]` is used only for text-based inference.
- `Difficulty` remains `"easy" | "medium" | "hard"`.
