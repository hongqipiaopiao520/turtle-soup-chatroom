# Turtle Soup Agent Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current AI opening director from a one-shot recommendation widget into a staged turtle-soup Agent system with visible planning, tool use, confirmation, and later RAG, room assistance, and admin data governance.

**Architecture:** Ship in six independently useful phases. Phase 1 changes the homepage from "prompt in, plans out" to an Agent console that exposes observation, planning, tool execution, and confirmation before room creation. Later phases add richer tool traces, decision cards, RAG retrieval, in-room context assistance, and admin-side puzzle intelligence without making the first phase depend on them.

**Tech Stack:** React, TypeScript, Express, SQLite-backed puzzle repository, Vitest, existing OpenAI-compatible `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` integration, CSS modules through `src/styles.css`.

## Global Constraints

- Do not expose puzzle truth, solution points, or full `aiProfile` to public homepage APIs.
- `create_room` / room creation is the final action after user confirmation, never an automatic recommendation side effect.
- All Agent traces shown to players must be spoiler-free.
- Each phase must be independently testable and shippable.
- Use existing host persona IDs: `xiaowai`, `dav`, `guigui`.
- Keep the homepage first screen focused on the game: case desk plus Agent console.

---

## Phase Overview

### Phase 1: Homepage Agent Console

**Product Outcome:** The first screen shows an Agent, not a search box. The user sees how the Agent understands the request, searches the puzzle set, ranks profiles, drafts plans, and waits for confirmation.

**Page Position:**

```text
Homepage first screen
├─ Left: 今日案件桌
└─ Right: 开局 Agent 控制台
```

**UI Effects:**

- Replace `AI 开局导演` copy with `开局 Agent`.
- Show a compact step timeline:
  - `理解偏好`
  - `搜索题库`
  - `匹配画像`
  - `生成方案`
  - `等待确认`
- Plan cards remain visible, but their CTA copy becomes a confirmation action such as `确认开局`.
- Loading state animates the current step, not just the submit button.
- Empty state explains that the Agent will configure puzzle, host, and question count.

**Backend Work:**

- Extend `OpeningDirectorResponse` with an `agentTrace` array.
- Each trace item contains:
  - `id`
  - `label`
  - `status`
  - `summary`
  - `detail`
- Generate trace items in `server/openingDirector.ts` from existing intent/scoring behavior.

**Acceptance:**

- Homepage markup contains `开局 Agent`.
- Homepage markup contains the trace labels.
- API response includes trace items for intent, search, ranking, plan drafting, and confirmation.
- Clicking a plan still opens the name dialog and creates the room only after confirmation.

### Phase 2: Tool Trace Visualization

**Product Outcome:** The user can tell the Agent is calling tools, not merely generating prose.

**Page Position:** Inside the same homepage Agent console, below the input and above plan cards.

**UI Effects:**

```text
Agent 工具轨迹
parse_intent      识别父母 / 反转 / 低血腥
search_puzzles    找到 18 道候选
rank_profiles     筛掉高血腥候选
draft_plans       生成 3 个开局方案
request_confirm   等待你确认
```

**Backend Work:**

- Add a small internal tool registry in `server/openingDirector.ts`.
- Represent each step as a typed tool result.
- Return player-facing labels while keeping internal tool IDs available for tests.

**Acceptance:**

- Trace items expose stable tool IDs.
- UI renders tool IDs or readable tool aliases consistently.
- Failure paths show fallback trace summaries.

### Phase 3: Decision Cards

**Product Outcome:** The Agent asks before acting when player intent is ambiguous or conflicting.

**Page Position:** In the homepage Agent console, decision cards temporarily replace plan cards.

**Trigger Examples:**

- `新手` plus `高难反转`
- `血腥一点` without a gore boundary
- Low intent confidence
- Multiple close-scoring candidates with different styles

**UI Effects:**

```text
我有两个理解方向：
A. 刺激优先：更强冲击，压抑更重
B. 推理优先：反转更强，血腥中低
```

**Backend Work:**

- Extend `OpeningDirectorResponse` with optional `decision`.
- Add decision options with stable IDs and prompt patches.
- Add request support for `decisionId`.

**Acceptance:**

- Ambiguous prompts return a decision instead of plans.
- Selecting a decision continues to plan generation.
- No room creation happens before the decision is resolved.

### Phase 4: RAG Puzzle Retrieval

**Product Outcome:** Natural-language puzzle search becomes semantic retrieval plus profile reranking instead of tag matching only.

**Page Position:** The homepage Agent cards show semantic match reasons. Admin page shows retrieval/profile readiness.

**Data Inputs:**

- title
- surface
- tags
- `aiProfile.themes`
- `aiProfile.moods`
- `aiProfile.spoilerFreePitch`
- `aiProfile.contentWarnings`
- `aiProfile.estimatedQuestions`

**Backend Work:**

- Add embedding generation script for managed puzzles.
- Store vector rows or serialized vectors in SQLite.
- Implement top-k retrieval, then rerank with current profile scoring.
- Keep truth and solution points server-only.

**Acceptance:**

- Prompt such as `涉及父母但不要血腥` returns semantically relevant puzzles even without exact tag text.
- Plan cards show spoiler-free match reasons.
- Existing fallback scoring still works when embeddings are missing.

### Phase 5: In-Room Companion Agent

**Product Outcome:** The Agent continues after room creation by observing question history and suggesting next inquiry directions without spoiling the answer.

**Page Position:**

```text
Room page
├─ Left: 汤面档案
├─ Center: 主持人问答
├─ Bottom: 提问/推理操作台
└─ Right: compact Agent observation module
```

**UI Effects:**

```text
Agent 观察
已确认：地点、人物关系
未确认：时间变化、水的状态
建议下一问：水原本是热的吗？
```

**Backend Work:**

- Summarize room Q&A into confirmed, denied, unknown facts.
- Generate one suggested next question.
- Apply strict spoiler checks.

**Acceptance:**

- Suggestions depend on actual room history.
- The module stays visually secondary to the host Q&A.
- No truth or solution-point leak appears in public output.

### Phase 6: Admin Puzzle Agent

**Product Outcome:** The admin console becomes the data-governance side of the Agent system.

**Page Position:** Upgrade current admin `AI 画像` panel into `题库 Agent 审核台`.

**UI Effects:**

```text
题库 Agent 审核
画像完整度：86%
推荐可用性：高
剧透风险：低
标签可信度：中

建议：
1. 补充 contentWarning：死亡
2. 推荐语略剧透，建议重写
3. 适合标准局，不适合新手局
```

**Backend Work:**

- Build an audit helper that reads `ManagedPuzzle` plus `aiProfile`.
- Produce readiness, spoiler risk, tag confidence, and recommended fixes.
- Keep existing `generate-ai-profiles` endpoint as the profile generation primitive.

**Acceptance:**

- Admin can see whether a puzzle is ready for Agent recommendation.
- Admin can refresh profile and audit separately.
- Audit output improves frontend recommendation quality without exposing spoilers to players.

---

## Immediate Execution: Phase 1

### Task 1: Add Agent Trace Types And API Contract

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `server/openingDirector.ts`
- Test: `tests/openingDirector.test.ts`
- Test: `tests/openingDirectorRoutes.test.ts`

**Interfaces:**

- Produces:
  - `OpeningDirectorTraceItem`
  - `OpeningDirectorTraceStatus`
  - `OpeningDirectorResponse.agentTrace`

**Steps:**

- [ ] Add failing tests that expect `createOpeningDirectorPlans()` to return trace labels: `理解偏好`, `搜索题库`, `匹配画像`, `生成方案`, `等待确认`.
- [ ] Run `npm test -- tests/openingDirector.test.ts tests/openingDirectorRoutes.test.ts` and verify failure.
- [ ] Add the trace types and response field.
- [ ] Build trace items from existing intent/scoring values.
- [ ] Run targeted tests and verify pass.

### Task 2: Render Homepage Agent Console

**Files:**

- Modify: `src/components/HomePage.tsx`
- Modify: `src/styles.css`
- Test: `tests/homePageUi.test.tsx`
- Test: `tests/stylesLayout.test.ts`

**Interfaces:**

- Consumes: `OpeningDirectorResponse.agentTrace`
- Produces: homepage markup for `开局 Agent` and trace labels.

**Steps:**

- [ ] Add failing UI tests for `开局 Agent`, `Agent 工作流`, and the five trace labels.
- [ ] Run `npm test -- tests/homePageUi.test.tsx tests/stylesLayout.test.ts` and verify failure.
- [ ] Store returned `agentTrace` in homepage state.
- [ ] Render the trace above plan cards.
- [ ] Rename CTA to `确认开局`.
- [ ] Add responsive CSS for the Agent trace.
- [ ] Run targeted tests and verify pass.

### Task 3: Verify Phase 1 End To End

**Files:**

- Test: all changed tests
- Build: production build

**Steps:**

- [ ] Run `npm test -- tests/openingDirector.test.ts tests/openingDirectorRoutes.test.ts tests/homePageUi.test.tsx tests/stylesLayout.test.ts`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start the dev server and inspect homepage manually if time allows.

