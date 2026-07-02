# AI Opening Director Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP AI opening director that turns a player's natural-language intent into 2-3 confirmed room-start plans, without exposing full AI puzzle profiles through public puzzle data.

**Architecture:** Store spoiler-safe puzzle AI profiles on the server, use a real-time AI intent parser as the primary Agent reasoning step, fall back to deterministic parsing/scoring, and return only display-safe recommendation summaries to the homepage. The user chooses a decision card, then the existing Socket.IO room creation flow starts the room with the selected puzzle, host persona, and question limit.

**Tech Stack:** React 19, TypeScript, Express 5, SQLite via better-sqlite3, zod, existing OpenAI-compatible `/chat/completions` AI config, Socket.IO room creation.

## Global Constraints

- Do not put full `aiProfile` on `PublicPuzzle`.
- Do not return full `aiProfile` from `/api/puzzles` or `/api/agent/opening-plans`.
- Server-side recommendation may use `truth`, `solutionPoints`, and `aiProfile`; public responses must never include `truth`, `solutionPoints`, `aiProfile`, exact solution facts, or key causality.
- MVP has exactly four implementation tasks: profile storage, Opening Director API, homepage cards, open-room linkage.
- Real-time AI intent parsing is the primary path; deterministic rule parsing is the fallback.
- Do not add an external vector database in this MVP.
- Reuse existing AI env vars: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, plus legacy `MIMO_*` fallbacks.
- Keep homepage output as decision cards, not a chat transcript.
- The user confirms a plan before any room is created.
- No cross-session memory, post-game recap, or admin UI in this MVP.
- Existing room creation remains Socket.IO `room:create`.
- Use Node 24 when running tests/build in this local environment because `better-sqlite3` is compiled for Node 24.

---

## Product Definition

### User Story

On the homepage, a player types one sentence:

- `涉及父母，反转强一点，不要太血腥`
- `我和两个朋友玩，新手局，别太长`
- `大V主持，来个压迫感强的`

The AI opening director returns 2-3 decision cards. Each card includes:

- Puzzle title and public surface
- Spoiler-free reason
- Display chips such as `亲情`, `反转`, `新手友好`
- A short content intensity summary such as `血腥低 / 压抑中`
- Recommended host persona
- Question limit
- Confidence label
- `开这局` action

The player clicks `开这局`, enters a name in the existing dialog, and the app creates the room using the selected puzzle, host persona, and question limit.

### Non-Goals

- No long-term player preference memory.
- No game-end recap.
- No direct room creation before user confirmation.
- No public `aiProfile`.
- No external vector DB or embeddings in MVP.
- No admin UI for profile generation in MVP.

---

## File Structure

### Task 1: Server-Only Puzzle AI Profile Storage

- Modify: `src/shared/types.ts`
  - Add `PuzzleAiProfile`.
  - Add `aiProfile?: PuzzleAiProfile` to `ManagedPuzzle` only.
  - Leave `PublicPuzzle` unchanged except existing fields.
- Modify: `server/storage/migrations.ts`
  - Add AI profile columns.
- Modify: `server/storage/puzzleRepository.ts`
  - Read/write `aiProfile` for managed/internal puzzles.
  - Keep `toPublicPuzzle` from returning `aiProfile`.
- Create: `server/puzzleAiProfile.ts`
  - Generate spoiler-safe profiles.
  - Provide deterministic fallback profile generation.
- Tests:
  - `tests/storage/database.test.ts`
  - `tests/storage/puzzleRepository.test.ts`
  - `tests/puzzleAiProfile.test.ts`
  - `tests/apiPuzzles.test.ts`

### Task 2: Opening Director API With AI Intent Parser

- Modify: `src/shared/types.ts`
  - Add `OpeningDirectorIntent`, `OpeningDirectorPlan`, `OpeningDirectorResponse`.
- Create: `server/openingDirector.ts`
  - Primary: AI intent parser.
  - Fallback: deterministic parser.
  - Score published managed puzzles using server-only profiles.
  - Return display-safe plans only.
- Modify: `server/app.ts`
  - Add `POST /api/agent/opening-plans`.
- Create: `src/client/openingDirector.ts`
  - Front-end fetch client.
- Tests:
  - `tests/openingDirector.test.ts`
  - `tests/openingDirectorClient.test.ts`
  - Route helper tests inside `tests/apiPuzzles.test.ts` or `tests/openingDirectorRoutes.test.ts` without adding `supertest`.

### Task 3: Homepage Decision Cards

- Modify: `src/components/HomePage.tsx`
  - Add compact `AI 开局导演` panel.
  - Render prompt input, examples, loading/error state, and decision cards.
- Modify: `src/styles.css`
  - Add restrained command-panel and decision-card styling.
- Tests:
  - `tests/homePageUi.test.tsx`
  - `tests/stylesLayout.test.ts`

### Task 4: Open-Room Linkage

- Modify: `src/App.tsx`
  - Pass `onStartDirectedPlan` to `HomePage`.
  - Extend create-name request with preselected host persona and question limit.
- Modify: `src/components/HomePage.tsx`
  - Call `onStartDirectedPlan(plan)` from `开这局`.
- Tests:
  - `tests/nameDialogUi.test.tsx`
  - `tests/homePageUi.test.tsx`

---

## Shared Interfaces

Add to `src/shared/types.ts`:

```ts
export interface PuzzleAiProfile {
  themes: string[];
  moods: string[];
  twistTypes: string[];
  contentWarnings: string[];
  suitableFor: string[];
  intensity: {
    gore: number;
    horror: number;
    sadness: number;
    absurdity: number;
  };
  spoilerFreePitch: string;
  estimatedQuestions: number;
  profileVersion: number;
  generatedAt: string;
}

export interface OpeningDirectorIntent {
  rawText: string;
  themes: string[];
  moods: string[];
  avoidThemes: string[];
  preferredDifficulty?: Difficulty;
  preferredHostPersonaId?: HostPersonaId;
  maxGore?: number;
  playerCount?: number;
  desiredLength?: "short" | "standard" | "long";
  confidence: number;
  source: "ai" | "fallback";
}

export type OpeningDirectorSource = "profile-score" | "ai-intent-profile-score" | "fallback";

export interface OpeningDirectorPlan {
  id: string;
  puzzle: PublicPuzzle;
  title: string;
  reason: string;
  matchSummary: string;
  chips: string[];
  contentIntensity: string;
  hostPersonaId: HostPersonaId;
  questionLimit: number;
  confidence: "high" | "medium" | "low";
  source: OpeningDirectorSource;
}

export interface OpeningDirectorRequest {
  prompt: string;
  limit?: number;
}

export interface OpeningDirectorResponse {
  intent: OpeningDirectorIntent;
  plans: OpeningDirectorPlan[];
  fallbackUsed: boolean;
}
```

Modify `ManagedPuzzle` only:

```ts
export interface ManagedPuzzle extends Puzzle {
  // existing fields...
  aiProfile?: PuzzleAiProfile;
}
```

Do not change `PublicPuzzle` to include `aiProfile`.

---

## Task 1: Server-Only Puzzle AI Profile Storage

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `server/storage/migrations.ts`
- Modify: `server/storage/puzzleRepository.ts`
- Create: `server/puzzleAiProfile.ts`
- Test: `tests/storage/database.test.ts`
- Test: `tests/storage/puzzleRepository.test.ts`
- Test: `tests/puzzleAiProfile.test.ts`
- Test: `tests/apiPuzzles.test.ts`

**Interfaces:**
- Produces: `PuzzleAiProfile`
- Produces: `PuzzleRepository.updateAiProfile(id: string, profile: PuzzleAiProfile): ManagedPuzzle`
- Produces: `generatePuzzleAiProfile(input): Promise<PuzzleAiProfile>`
- Guarantees: `PublicPuzzle` and `/api/puzzles` never include `aiProfile`.

- [ ] **Step 1: Write failing database migration test**

Add to `tests/storage/database.test.ts`:

```ts
it("creates AI profile columns for server-only opening recommendations", () => {
  const root = join(tmpdir(), `turtle-db-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);

  const db = openDatabase(join(root, "app.sqlite"));
  const columns = db.prepare("pragma table_info(puzzles)").all() as Array<{ name: string }>;

  expect(columns.map((column) => column.name)).toContain("ai_profile_json");
  expect(columns.map((column) => column.name)).toContain("ai_profile_version");
  expect(columns.map((column) => column.name)).toContain("ai_profile_generated_at");
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
env PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test -- tests/storage/database.test.ts
```

Expected: FAIL because profile columns do not exist.

- [ ] **Step 3: Add shared type without changing PublicPuzzle**

In `src/shared/types.ts`:

```ts
export interface PuzzleAiProfile {
  themes: string[];
  moods: string[];
  twistTypes: string[];
  contentWarnings: string[];
  suitableFor: string[];
  intensity: {
    gore: number;
    horror: number;
    sadness: number;
    absurdity: number;
  };
  spoilerFreePitch: string;
  estimatedQuestions: number;
  profileVersion: number;
  generatedAt: string;
}
```

Add only to `ManagedPuzzle`:

```ts
aiProfile?: PuzzleAiProfile;
```

Do not edit `PublicPuzzle`.

- [ ] **Step 4: Add migration**

Append version 2 in `server/storage/migrations.ts`:

```ts
{
  version: 2,
  sql: `
    alter table puzzles add column ai_profile_json text;
    alter table puzzles add column ai_profile_version integer not null default 0;
    alter table puzzles add column ai_profile_generated_at text;
  `
}
```

- [ ] **Step 5: Update repository mapping**

In `server/storage/puzzleRepository.ts`, import `PuzzleAiProfile`:

```ts
import type { Difficulty, ManagedPuzzle, Puzzle, PuzzleAiProfile, PuzzleStatus } from "../../src/shared/types";
```

Extend `PuzzleRow`:

```ts
ai_profile_json?: string | null;
ai_profile_version: number;
ai_profile_generated_at?: string | null;
```

Add:

```ts
function parseAiProfile(row: PuzzleRow): PuzzleAiProfile | undefined {
  if (!row.ai_profile_json) return undefined;
  try {
    const parsed = JSON.parse(row.ai_profile_json) as PuzzleAiProfile;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.themes)) return undefined;
    return {
      ...parsed,
      profileVersion: row.ai_profile_version || parsed.profileVersion || 0,
      generatedAt: row.ai_profile_generated_at ?? parsed.generatedAt ?? row.updated_at
    };
  } catch {
    return undefined;
  }
}
```

Add to `toManagedPuzzle`:

```ts
aiProfile: parseAiProfile(row),
```

Do not add `aiProfile` to `toPublicPuzzle`.

Extend the upsert SQL with:

```sql
ai_profile_json,
ai_profile_version,
ai_profile_generated_at
```

Add bound values:

```ts
aiProfileJson: puzzle.aiProfile ? JSON.stringify(puzzle.aiProfile) : null,
aiProfileVersion: puzzle.aiProfile?.profileVersion ?? 0,
aiProfileGeneratedAt: puzzle.aiProfile?.generatedAt ?? null
```

Extend `PuzzleRepository`:

```ts
updateAiProfile(id: string, profile: PuzzleAiProfile): ManagedPuzzle;
```

Implement:

```ts
updateAiProfile(id: string, profile: PuzzleAiProfile) {
  const existing = requirePuzzle(findById(id), id);
  return this.upsertManaged({
    ...existing,
    aiProfile: profile,
    updatedAt: nextTimestampAfter(existing.updatedAt)
  });
}
```

- [ ] **Step 6: Add repository privacy test**

Add to `tests/storage/puzzleRepository.test.ts`:

```ts
it("stores AI profiles internally but keeps public puzzles clean", () => {
  const db = makeDb();
  const repository = createPuzzleRepository(db);
  repository.upsertManaged({
    ...seedPuzzles[0],
    id: "profiled-puzzle",
    status: "published",
    hints: [],
    estimatedMinutes: 15,
    qualityScore: 80,
    qualityIssues: [],
    qualitySummary: "ok",
    publishedAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z"
  });

  repository.updateAiProfile("profiled-puzzle", {
    themes: ["亲情", "父母"],
    moods: ["压抑", "反转"],
    twistTypes: ["关系误导"],
    contentWarnings: ["死亡"],
    suitableFor: ["标准局"],
    intensity: { gore: 1, horror: 2, sadness: 4, absurdity: 1 },
    spoilerFreePitch: "家庭关系里的异常行为是核心误导点。",
    estimatedQuestions: 18,
    profileVersion: 1,
    generatedAt: "2026-07-01T00:00:00.000Z"
  });

  expect(repository.findById("profiled-puzzle")?.aiProfile?.themes).toEqual(["亲情", "父母"]);
  const publicPuzzle = repository.listPublished().find((puzzle) => puzzle.id === "profiled-puzzle");
  expect(publicPuzzle).not.toHaveProperty("truth");
  expect(publicPuzzle).not.toHaveProperty("solutionPoints");
  expect(publicPuzzle).not.toHaveProperty("aiProfile");
  db.close();
});
```

- [ ] **Step 7: Create profile generator tests**

Create `tests/puzzleAiProfile.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPuzzleAiProfilePrompt,
  generatePuzzleAiProfile,
  parsePuzzleAiProfileResponse
} from "../server/puzzleAiProfile";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("puzzle AI profile", () => {
  const input = {
    title: "姥姥的葬礼",
    surface: "2月20日，我和父母回乡下参加姥姥的葬礼。",
    truth: "父母的行为异常和家庭关系有关。",
    difficulty: "hard" as const,
    tags: ["本格", "红汤", "全人类", "高难"],
    estimatedMinutes: 20
  };

  it("builds a prompt that uses private truth but asks for spoiler-free output", () => {
    const prompt = buildPuzzleAiProfilePrompt(input);
    expect(prompt[0].content).toContain("不要输出汤底具体事实");
    expect(prompt[1].content).toContain("汤底");
  });

  it("parses and clamps profile JSON", () => {
    const profile = parsePuzzleAiProfileResponse(JSON.stringify({
      themes: ["亲情", "父母", "亲情"],
      moods: ["压抑"],
      twistTypes: ["关系误导"],
      contentWarnings: ["死亡"],
      suitableFor: ["老手局"],
      intensity: { gore: 9, horror: 2, sadness: 4, absurdity: -1 },
      spoilerFreePitch: "家庭关系里的异常行为是核心误导点。",
      estimatedQuestions: 99
    }), input);

    expect(profile.themes).toEqual(["亲情", "父母"]);
    expect(profile.intensity.gore).toBe(5);
    expect(profile.intensity.absurdity).toBe(0);
    expect(profile.estimatedQuestions).toBe(30);
    expect(profile.profileVersion).toBe(1);
  });

  it("falls back without AI config", async () => {
    const profile = await generatePuzzleAiProfile(input);
    expect(profile.themes.length).toBeGreaterThan(0);
    expect(profile.spoilerFreePitch).toBeTruthy();
  });
});
```

- [ ] **Step 8: Implement `server/puzzleAiProfile.ts`**

Create `server/puzzleAiProfile.ts` with:

```ts
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
```

- [ ] **Step 9: Add API privacy test**

In `tests/apiPuzzles.test.ts`, add or extend an assertion:

```ts
expect(JSON.stringify(response.body)).not.toContain("aiProfile");
expect(JSON.stringify(response.body)).not.toContain("truth");
expect(JSON.stringify(response.body)).not.toContain("solutionPoints");
```

- [ ] **Step 10: Run Task 1 tests**

Run:

```bash
env PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test -- tests/storage/database.test.ts tests/storage/puzzleRepository.test.ts tests/puzzleAiProfile.test.ts tests/apiPuzzles.test.ts
```

Expected: PASS.

---

## Task 2: Opening Director API With AI Intent Parser

**Files:**
- Modify: `src/shared/types.ts`
- Create: `server/openingDirector.ts`
- Modify: `server/app.ts`
- Create: `src/client/openingDirector.ts`
- Test: `tests/openingDirector.test.ts`
- Test: `tests/openingDirectorClient.test.ts`
- Test: `tests/openingDirectorRoutes.test.ts`

**Interfaces:**
- Produces: `parseOpeningDirectorIntentWithAi(prompt: string): Promise<OpeningDirectorIntent>`
- Produces: `parseOpeningDirectorIntentFallback(prompt: string): OpeningDirectorIntent`
- Produces: `createOpeningDirectorPlans(input: { prompt: string; puzzles: ManagedPuzzle[]; limit?: number }): Promise<OpeningDirectorResponse>`
- Produces: `POST /api/agent/opening-plans`
- Guarantees: route response contains display summaries only, not `aiProfile`.

- [ ] **Step 1: Add opening director shared types**

Add the `OpeningDirectorIntent`, `OpeningDirectorPlan`, `OpeningDirectorRequest`, and `OpeningDirectorResponse` interfaces from the "Shared Interfaces" section to `src/shared/types.ts`.

- [ ] **Step 2: Write AI intent parser tests**

Create `tests/openingDirector.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedPuzzle } from "../src/shared/types";
import {
  buildOpeningDirectorIntentPrompt,
  createOpeningDirectorPlans,
  parseOpeningDirectorIntentFallback,
  parseOpeningDirectorIntentResponse,
  parseOpeningDirectorIntentWithAi
} from "../server/openingDirector";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

const basePuzzle: ManagedPuzzle = {
  id: "parent-case",
  title: "亲情题",
  surface: "一个人参加亲人的葬礼后感到奇怪。",
  truth: "私有真相不能出现在推荐里。",
  solutionPoints: ["私有关键点"],
  difficulty: "hard",
  tags: ["本格", "红汤", "全人类", "高难"],
  author: "test",
  rating: 8.5,
  plays: 30,
  createdAt: "2026-06-23T00:00:00.000Z",
  status: "published",
  hints: [],
  estimatedMinutes: 20,
  qualityScore: 80,
  qualityIssues: [],
  qualitySummary: "ok",
  updatedAt: "2026-06-23T00:00:00.000Z",
  aiProfile: {
    themes: ["亲情", "父母"],
    moods: ["压抑", "反转"],
    twistTypes: ["关系误导"],
    contentWarnings: ["死亡"],
    suitableFor: ["标准局"],
    intensity: { gore: 1, horror: 2, sadness: 4, absurdity: 1 },
    spoilerFreePitch: "亲情关系里的异常行为是核心误导点。",
    estimatedQuestions: 18,
    profileVersion: 1,
    generatedAt: "2026-07-01T00:00:00.000Z"
  }
};

describe("opening director", () => {
  it("builds an AI intent prompt for structured JSON parsing", () => {
    const prompt = buildOpeningDirectorIntentPrompt("大V主持，涉及父母，不要太血腥");
    expect(prompt[0].content).toContain("开局导演");
    expect(prompt[0].content).toContain("只输出 JSON");
    expect(prompt[1].content).toContain("大V主持");
  });

  it("parses AI intent response", () => {
    const intent = parseOpeningDirectorIntentResponse(JSON.stringify({
      themes: ["父母"],
      moods: ["反转"],
      avoidThemes: [],
      preferredHostPersonaId: "dav",
      maxGore: 2,
      desiredLength: "short",
      confidence: 0.86
    }), "大V主持，涉及父母，不要太血腥");

    expect(intent.source).toBe("ai");
    expect(intent.themes).toContain("父母");
    expect(intent.preferredHostPersonaId).toBe("dav");
    expect(intent.maxGore).toBe(2);
  });

  it("uses AI intent parser when configured", async () => {
    vi.stubEnv("AI_BASE_URL", "https://example.test");
    vi.stubEnv("AI_API_KEY", "key");
    vi.stubEnv("AI_MODEL", "model");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          themes: ["父母"],
          moods: ["反转"],
          avoidThemes: [],
          preferredHostPersonaId: "dav",
          maxGore: 2,
          desiredLength: "short",
          confidence: 0.9
        }) } }]
      })
    } as unknown as Response);

    const intent = await parseOpeningDirectorIntentWithAi("大V主持，涉及父母，不要太血腥");

    expect(intent.source).toBe("ai");
    expect(intent.preferredHostPersonaId).toBe("dav");
  });

  it("falls back to rules when AI is unavailable", async () => {
    const intent = await parseOpeningDirectorIntentWithAi("大V主持，涉及父母，反转强一点，不要太血腥");

    expect(intent.source).toBe("fallback");
    expect(intent.themes).toContain("父母");
    expect(intent.moods).toContain("反转");
    expect(intent.preferredHostPersonaId).toBe("dav");
  });

  it("creates display-safe plans without full profiles or truth", async () => {
    const response = await createOpeningDirectorPlans({
      prompt: "涉及父母，反转强一点，不要太血腥",
      puzzles: [basePuzzle],
      limit: 1
    });

    expect(response.plans).toHaveLength(1);
    expect(response.plans[0].puzzle.title).toBe("亲情题");
    expect(response.plans[0].reason).toContain("亲情");
    const json = JSON.stringify(response);
    expect(json).not.toContain("私有真相");
    expect(json).not.toContain("私有关键点");
    expect(json).not.toContain("aiProfile");
  });
});
```

- [ ] **Step 3: Implement `server/openingDirector.ts`**

Create `server/openingDirector.ts`:

```ts
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
  const { truth, solutionPoints, aiProfile, status, rawText, sourceUrl, sourceTitle, hints, estimatedMinutes, qualityScore, qualityIssues, qualitySummary, reviewedAt, publishedAt, updatedAt, ...publicFields } = puzzle;
  void truth;
  void solutionPoints;
  void aiProfile;
  void status;
  void rawText;
  void sourceUrl;
  void sourceTitle;
  void hints;
  void estimatedMinutes;
  void qualityScore;
  void qualityIssues;
  void qualitySummary;
  void reviewedAt;
  void publishedAt;
  void updatedAt;
  return {
    ...publicFields,
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
```

- [ ] **Step 4: Add client tests**

Create `tests/openingDirectorClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchOpeningDirectorPlans } from "../src/client/openingDirector";

describe("opening director client", () => {
  it("posts prompt and returns response", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ intent: { rawText: "父母", themes: [], moods: [], avoidThemes: [], confidence: 1, source: "fallback" }, plans: [], fallbackUsed: false })
    } as unknown as Response);

    const result = await fetchOpeningDirectorPlans({ prompt: "父母", limit: 2 }, fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/agent/opening-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "父母", limit: 2 })
    });
    expect(result.plans).toEqual([]);
  });
});
```

- [ ] **Step 5: Add client**

Create `src/client/openingDirector.ts`:

```ts
import type { OpeningDirectorRequest, OpeningDirectorResponse } from "../shared/types";

export async function fetchOpeningDirectorPlans(
  input: OpeningDirectorRequest,
  fetcher: typeof fetch = fetch
): Promise<OpeningDirectorResponse> {
  const response = await fetcher("/api/agent/opening-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | OpeningDirectorResponse | null;
  if (!response.ok) {
    throw new Error((payload && "message" in payload && payload.message) || `开局导演失败：${response.status}`);
  }
  return payload as OpeningDirectorResponse;
}
```

- [ ] **Step 6: Add route tests without new dependencies**

Create `tests/openingDirectorRoutes.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { createApp } from "../server/app";
import type { ManagedPuzzle } from "../src/shared/types";
import type { PuzzleRepository } from "../server/storage/puzzleRepository";

const servers: Server[] = [];

function makeRepository(): PuzzleRepository {
  const managed = seedPuzzles.map((puzzle, index): ManagedPuzzle => ({
    ...puzzle,
    status: "published",
    hints: [],
    estimatedMinutes: 15,
    qualityScore: 80,
    qualityIssues: [],
    qualitySummary: "ok",
    publishedAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    aiProfile: {
      themes: index === 0 ? ["亲情", "父母"] : ["生活"],
      moods: ["反转"],
      twistTypes: ["误导"],
      contentWarnings: [],
      suitableFor: ["标准局"],
      intensity: { gore: 1, horror: 1, sadness: 3, absurdity: 1 },
      spoilerFreePitch: "不剧透推荐语。",
      estimatedQuestions: 18,
      profileVersion: 1,
      generatedAt: "2026-07-01T00:00:00.000Z"
    }
  }));
  return {
    findById: (id) => managed.find((puzzle) => puzzle.id === id),
    listPublished: () => managed,
    listManaged: (status) => status ? managed.filter((puzzle) => puzzle.status === status) : managed,
    upsertManaged: (puzzle) => puzzle,
    updateManaged: () => { throw new Error("unused"); },
    updateTags: () => { throw new Error("unused"); },
    updateAiProfile: () => { throw new Error("unused"); },
    deleteManaged: () => { throw new Error("unused"); },
    publish: () => { throw new Error("unused"); },
    reject: () => { throw new Error("unused"); }
  };
}

async function listen(app: ReturnType<typeof createApp>) {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server failed");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("opening director route", () => {
  it("returns public opening plans", async () => {
    const baseUrl = await listen(createApp(makeRepository()));
    const response = await fetch(`${baseUrl}/api/agent/opening-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "涉及父母，反转强一点，不要太血腥" })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plans.length).toBeGreaterThan(0);
    const json = JSON.stringify(body);
    expect(json).not.toContain("truth");
    expect(json).not.toContain("solutionPoints");
    expect(json).not.toContain("aiProfile");
  });

  it("rejects empty prompts", async () => {
    const baseUrl = await listen(createApp(makeRepository()));
    const response = await fetch(`${baseUrl}/api/agent/opening-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "" })
    });

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 7: Add route**

In `server/app.ts`, import:

```ts
import { z } from "zod";
import { createOpeningDirectorPlans } from "./openingDirector";
```

Add schema:

```ts
const OpeningPlansSchema = z.object({
  prompt: z.string().trim().min(1).max(300),
  limit: z.number().int().min(1).max(3).optional()
});
```

Add after `/api/puzzles`:

```ts
app.post("/api/agent/opening-plans", async (request, response) => {
  try {
    const parsed = OpeningPlansSchema.parse(request.body);
    response.json(await createOpeningDirectorPlans({
      prompt: parsed.prompt,
      puzzles: puzzleRepository.listManaged("published"),
      limit: parsed.limit
    }));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "开局导演生成失败" });
  }
});
```

- [ ] **Step 8: Run Task 2 tests**

Run:

```bash
env PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test -- tests/openingDirector.test.ts tests/openingDirectorClient.test.ts tests/openingDirectorRoutes.test.ts
```

Expected: PASS.

---

## Task 3: Homepage Decision Cards

**Files:**
- Modify: `src/components/HomePage.tsx`
- Modify: `src/styles.css`
- Test: `tests/homePageUi.test.tsx`
- Test: `tests/stylesLayout.test.ts`

**Interfaces:**
- Consumes: `fetchOpeningDirectorPlans`
- Consumes: `OpeningDirectorPlan`
- Produces: homepage compact panel and decision cards.

- [ ] **Step 1: Add HomePage tests**

Add to `tests/homePageUi.test.tsx`:

```ts
it("renders a compact AI opening director entry", () => {
  const markup = renderToStaticMarkup(
    <HomePage puzzles={publicSeedPuzzles} onOpenPuzzle={() => undefined} onRandomPuzzle={() => undefined} />
  );

  expect(markup).toContain("AI 开局导演");
  expect(markup).toContain("涉及父母，反转强一点，不要太血腥");
  expect(markup).toContain("生成开局方案");
});
```

- [ ] **Step 2: Update HomePage imports and props**

In `src/components/HomePage.tsx`, import:

```ts
import { Bot, Loader2 } from "lucide-react";
import { fetchOpeningDirectorPlans } from "../client/openingDirector";
import type { OpeningDirectorPlan } from "../shared/types";
```

Add prop:

```ts
onStartDirectedPlan?: (plan: OpeningDirectorPlan) => void;
```

- [ ] **Step 3: Add HomePage state and handler**

Inside `HomePage`:

```ts
const [directorPrompt, setDirectorPrompt] = useState("涉及父母，反转强一点，不要太血腥");
const [directorPlans, setDirectorPlans] = useState<OpeningDirectorPlan[]>([]);
const [directorError, setDirectorError] = useState("");
const [isDirectorLoading, setIsDirectorLoading] = useState(false);

async function generateOpeningPlans() {
  const prompt = directorPrompt.trim();
  if (!prompt) return;
  setIsDirectorLoading(true);
  setDirectorError("");
  try {
    const response = await fetchOpeningDirectorPlans({ prompt, limit: 3 });
    setDirectorPlans(response.plans);
  } catch (error) {
    setDirectorError(error instanceof Error ? error.message : "开局导演暂时不可用");
    setDirectorPlans([]);
  } finally {
    setIsDirectorLoading(false);
  }
}
```

- [ ] **Step 4: Add compact panel below hero**

Place this after `</section>` for `.home-hero` and before `.toolbar`, so it does not compete with the case desk:

```tsx
<section className="opening-director-panel" aria-labelledby="opening-director-title">
  <div className="opening-director-head">
    <span className="panel-kicker"><Bot size={14} /> AI 开局导演</span>
    <h2 id="opening-director-title">说出想玩的感觉，我来配题、主持和问数。</h2>
  </div>
  <form
    className="opening-director-form"
    onSubmit={(event) => {
      event.preventDefault();
      void generateOpeningPlans();
    }}
  >
    <input
      value={directorPrompt}
      onChange={(event) => setDirectorPrompt(event.target.value)}
      maxLength={300}
      placeholder="比如：涉及父母，反转强一点，不要太血腥"
    />
    <button className="primary-button" type="submit" disabled={isDirectorLoading}>
      {isDirectorLoading ? <Loader2 size={16} /> : <Sparkles size={16} />}
      生成开局方案
    </button>
  </form>
  <div className="opening-director-examples" aria-label="示例偏好">
    {["新手局，别太长", "大V主持，压迫感强一点", "血腥一点，但不要恶心"].map((example) => (
      <button type="button" key={example} onClick={() => setDirectorPrompt(example)}>{example}</button>
    ))}
  </div>
  {directorError && <p className="opening-director-error">{directorError}</p>}
  {directorPlans.length > 0 && (
    <div className="opening-director-plans">
      {directorPlans.map((plan) => (
        <article className="opening-plan-card" key={plan.id}>
          <span>{plan.title}</span>
          <h3>{plan.puzzle.title}</h3>
          <p>{plan.reason}</p>
          <div className="opening-plan-chips">
            {plan.chips.map((chip) => <small key={chip}>{chip}</small>)}
          </div>
          <dl>
            <div><dt>主持</dt><dd>{plan.hostPersonaId === "dav" ? "大V" : plan.hostPersonaId === "guigui" ? "龟龟" : "小歪"}</dd></div>
            <div><dt>问数</dt><dd>{plan.questionLimit === 0 ? "不限" : `${plan.questionLimit} 问`}</dd></div>
            <div><dt>强度</dt><dd>{plan.contentIntensity}</dd></div>
          </dl>
          <button className="primary-button" type="button" onClick={() => onStartDirectedPlan?.(plan)}>
            <Play size={16} /> 开这局
          </button>
        </article>
      ))}
    </div>
  )}
</section>
```

- [ ] **Step 5: Add CSS**

Add to `src/styles.css`:

```css
.opening-director-panel {
  border: 1px solid rgba(221, 205, 158, 0.14);
  border-radius: 8px;
  background: rgba(12, 18, 16, 0.72);
  padding: 18px;
}

.opening-director-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.opening-director-head h2 {
  max-width: 680px;
  margin: 6px 0 0;
  color: var(--text);
  font-size: 20px;
  line-height: 1.25;
}

.opening-director-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 14px;
}

.opening-director-form input {
  min-height: 46px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(2, 4, 4, 0.54);
  color: var(--text);
  font: inherit;
  padding: 0 14px;
}

.opening-director-examples,
.opening-plan-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.opening-director-examples {
  margin-top: 12px;
}

.opening-director-examples button,
.opening-plan-chips small {
  border: 1px solid rgba(126, 163, 147, 0.22);
  border-radius: 999px;
  background: rgba(126, 163, 147, 0.08);
  color: var(--muted);
  font-weight: 700;
  padding: 6px 10px;
}

.opening-director-plans {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.opening-plan-card {
  display: grid;
  gap: 10px;
  min-height: 250px;
  border: 1px solid rgba(221, 205, 158, 0.16);
  border-radius: 8px;
  background: rgba(4, 7, 7, 0.58);
  padding: 16px;
}

.opening-plan-card > span {
  color: var(--accent);
  font-size: 13px;
  font-weight: 900;
}

.opening-plan-card h3 {
  margin: 0;
  color: var(--text);
  font-size: 24px;
}

.opening-plan-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.opening-plan-card dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.opening-plan-card dt {
  color: var(--muted);
  font-size: 12px;
}

.opening-plan-card dd {
  margin: 2px 0 0;
  color: var(--text);
  font-weight: 900;
}

.opening-director-error {
  color: #f0a4a4;
  font-weight: 800;
}

@media (max-width: 900px) {
  .opening-director-form,
  .opening-director-plans {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Add CSS tests**

Add to `tests/stylesLayout.test.ts`:

```ts
it("keeps the opening director compact and card based", () => {
  expect(css).toMatch(/\.opening-director-panel\s*\{/);
  expect(css).toMatch(/\.opening-director-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/s);
  expect(css).toMatch(/\.opening-director-plans\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  expect(css).toMatch(/@media \(max-width:\s*900px\)[\s\S]*\.opening-director-plans\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
```

- [ ] **Step 7: Run Task 3 tests**

Run:

```bash
env PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test -- tests/homePageUi.test.tsx tests/stylesLayout.test.ts
```

Expected: PASS.

---

## Task 4: Open-Room Linkage

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/HomePage.tsx`
- Test: `tests/nameDialogUi.test.tsx`
- Test: `tests/homePageUi.test.tsx`

**Interfaces:**
- Consumes: `OpeningDirectorPlan`
- Produces: name dialog preselection for host persona and question limit.
- Reuses: `roomSocket.createRoom(puzzle, playerName, { questionLimit, hostPersonaId })`.

- [ ] **Step 1: Extend `NameRequest`**

In `src/App.tsx`, change `NameRequest` to:

```ts
type NameRequest =
  | {
      kind: "create";
      puzzle: PublicPuzzle;
      unlimitedQuestions: boolean;
      hostPersonaId?: HostPersonaId;
      questionLimit?: number;
      source?: "manual" | "opening-director";
    }
  | { kind: "join"; roomId: string };
```

- [ ] **Step 2: Add directed plan handler**

Import:

```ts
import type { HostPersonaId, OpeningDirectorPlan, PublicPuzzle } from "./shared/types";
```

Add in `PlayerApp`:

```ts
function startDirectedRoom(plan: OpeningDirectorPlan) {
  setNameRequest({
    kind: "create",
    puzzle: plan.puzzle,
    unlimitedQuestions: plan.questionLimit === 0,
    questionLimit: plan.questionLimit,
    hostPersonaId: plan.hostPersonaId,
    source: "opening-director"
  });
}
```

Pass to `HomePage`:

```tsx
onStartDirectedPlan={startDirectedRoom}
```

- [ ] **Step 3: Preserve directed options on submit**

In `submitName`, inside `nameRequest.kind === "create"`, call:

```ts
roomSocket.createRoom(nameRequest.puzzle, trimmedName, {
  questionLimit: options.unlimitedQuestions ? 0 : nameRequest.questionLimit,
  hostPersonaId: options.hostPersonaId ?? nameRequest.hostPersonaId
});
```

- [ ] **Step 4: Preselect host in `NameDialog`**

Change host state:

```ts
const [hostPersonaId, setHostPersonaId] = useState<HostPersonaId>(
  request.kind === "create" ? request.hostPersonaId ?? "xiaowai" : "xiaowai"
);
```

Add strip:

```tsx
{request.kind === "create" && request.source === "opening-director" && (
  <div className="name-dialog-agent-strip">
    AI 开局导演已配好主持人和问数，确认昵称后开局。
  </div>
)}
```

- [ ] **Step 5: Add dialog test**

Extend `tests/nameDialogUi.test.tsx`:

```ts
it("shows opening director context for directed room creation", () => {
  const markup = renderToStaticMarkup(
    <NameDialog
      request={{
        kind: "create",
        puzzle: publicSeedPuzzles[0],
        unlimitedQuestions: false,
        hostPersonaId: "dav",
        questionLimit: 18,
        source: "opening-director"
      }}
      onCancel={() => undefined}
      onSubmit={() => undefined}
    />
  );

  expect(markup).toContain("AI 开局导演已配好主持人和问数");
  expect(markup).toContain('value="dav"');
});
```

- [ ] **Step 6: Add strip CSS**

In `src/styles.css`:

```css
.name-dialog-agent-strip {
  border: 1px solid rgba(221, 177, 75, 0.28);
  border-radius: 8px;
  background: rgba(221, 177, 75, 0.08);
  color: var(--text);
  font-weight: 800;
  padding: 10px 12px;
}
```

- [ ] **Step 7: Run Task 4 tests**

Run:

```bash
env PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test -- tests/nameDialogUi.test.tsx tests/homePageUi.test.tsx
```

Expected: PASS.

---

## Final Verification

- [ ] **Run targeted suite**

```bash
env PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test -- tests/storage/database.test.ts tests/storage/puzzleRepository.test.ts tests/puzzleAiProfile.test.ts tests/apiPuzzles.test.ts tests/openingDirector.test.ts tests/openingDirectorClient.test.ts tests/openingDirectorRoutes.test.ts tests/homePageUi.test.tsx tests/stylesLayout.test.ts tests/nameDialogUi.test.tsx
```

- [ ] **Run full suite**

```bash
env PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test
```

- [ ] **Run production build**

```bash
env PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
```

- [ ] **Manual QA**

Open `http://localhost:5173/` and verify:

- Homepage case desk remains the strongest visual element.
- AI opening director appears as a compact command panel below the hero.
- Prompt `涉及父母，反转强一点，不要太血腥` returns 2-3 cards.
- Network response for `/api/agent/opening-plans` contains no `truth`, `solutionPoints`, or `aiProfile`.
- Clicking `开这局` opens the existing name dialog.
- The selected host persona is preselected.
- Submitting name creates a room using the existing socket flow.

---

## Deferred After MVP

- Admin UI button for profile regeneration.
- Batch profile regeneration scripts.
- Embeddings/vector recall over spoiler-safe profile text.
- AI rerank after deterministic top-N retrieval.
- Post-game recap and player preference memory.

---

## Self-Review

- Spec coverage: The plan now satisfies the requested constraints: no full `aiProfile` in `PublicPuzzle`, four MVP tasks, and real-time AI intent parsing as primary path with rule fallback.
- Public data boundary: `aiProfile` remains server-only; public APIs return only display-safe plan summaries.
- Scope control: Admin UI, vector search, rerank, memory, and recap are deferred.
- Dependency hygiene: Route tests avoid `supertest` and do not add new dependencies.
