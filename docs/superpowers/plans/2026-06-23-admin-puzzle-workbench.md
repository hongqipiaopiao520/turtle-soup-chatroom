# Admin Puzzle Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first usable admin puzzle workflow with review/edit/publish UI and a script MVP for collecting online candidate puzzle text.

**Architecture:** Keep editorial operations behind `/api/admin` and `/admin`. The collection script feeds the existing import endpoint instead of writing SQLite directly. The public homepage continues to read only published puzzles from `/api/puzzles`.

**Tech Stack:** React 19, TypeScript, Express, Vitest, SQLite through `better-sqlite3`, existing OpenAI-compatible MIMO importer.

## Global Constraints

- Keep the player-facing homepage and room flow behavior unchanged.
- Do not expose puzzle `truth` through `/api/puzzles`.
- Production admin API calls require `Authorization: Bearer <ADMIN_TOKEN>`.
- Network collection is a script MVP, not a hidden auto-publish feature.
- Use TDD for behavior changes.
- Use Node 20+ for local verification because `better-sqlite3@12` requires modern Node.

---

## File Structure

- `server/adminPuzzleRoutes.ts`: add validation and update helper for managed puzzle edits.
- `server/storage/puzzleRepository.ts`: add `updateManaged(id, input)` or reuse `upsertManaged` through a route helper while preserving status and immutable fields.
- `src/client/adminPuzzles.ts`: client functions for list, import, update, publish, reject.
- `src/components/AdminPage.tsx`: admin workbench UI.
- `src/App.tsx`: route `/admin` to the admin page.
- `src/styles.css`: admin layout and form styles.
- `scripts/collect-puzzles.mjs`: collect candidates from direct URLs or search endpoints and post them to the admin import API.
- `scripts/collect-puzzles.d.mts`: TypeScript declarations for test imports.
- `README.md`: document `/admin` and collection script usage.
- `tests/adminPuzzleRoutes.test.ts`: add update helper coverage.
- `tests/adminPuzzlesClient.test.ts`: client request coverage.
- `tests/adminPageUi.test.tsx`: server-render coverage for admin page.
- `tests/collectPuzzles.test.ts`: parser and import workflow coverage.

---

### Task 1: Add Managed Puzzle Update API

**Files:**
- Modify: `server/adminPuzzleRoutes.ts`
- Modify: `server/storage/puzzleRepository.ts`
- Test: `tests/adminPuzzleRoutes.test.ts`

**Interfaces:**
- Produces: `updateAdminPuzzle(repository, puzzleId, input): ManagedPuzzle`
- Produces: `PuzzleRepository.updateManaged(id: string, input: ManagedPuzzleUpdate): ManagedPuzzle`
- Consumes: existing `ManagedPuzzle`, `PuzzleStatus`, `Difficulty`

**Steps:**

- [x] Add a failing test to `tests/adminPuzzleRoutes.test.ts`:

```ts
it("updates editable puzzle fields without changing status", () => {
  const { db, repository } = makeRepository();
  const draft = importTextDraft(repository, { rawText: "旧标题\n旧汤面" });

  const updated = updateAdminPuzzle(repository, draft.id, {
    title: "新标题",
    surface: "新的汤面",
    truth: "新的汤底",
    solutionPoints: ["关键点一", "关键点二"],
    hints: ["提示一"],
    difficulty: "hard",
    tags: ["本格", "测试"],
    qualityScore: 82,
    qualityIssues: ["需要人工复核"],
    qualitySummary: "结构完整",
    sourceTitle: "来源名",
    sourceUrl: "https://example.test/puzzle",
    rawText: "原始文本"
  });

  expect(updated.status).toBe("draft");
  expect(updated.title).toBe("新标题");
  expect(updated.solutionPoints).toEqual(["关键点一", "关键点二"]);
  expect(updated.tags).toEqual(["本格", "测试"]);
  expect(updated.updatedAt).not.toBe(draft.updatedAt);
  db.close();
});
```

- [x] Run `npm run test -- tests/adminPuzzleRoutes.test.ts`; expect failure because `updateAdminPuzzle` is missing.
- [x] Add `ManagedPuzzleUpdate` type and `updateManaged` to `PuzzleRepository`.
- [x] Implement `updateAdminPuzzle` with Zod validation in `server/adminPuzzleRoutes.ts`.
- [x] Add `PUT /api/admin/puzzles/:id` route.
- [x] Run `npm run test -- tests/adminPuzzleRoutes.test.ts`; expect pass.
- [x] Commit: `feat: add admin puzzle update api`.

### Task 2: Add Admin Client

**Files:**
- Create: `src/client/adminPuzzles.ts`
- Test: `tests/adminPuzzlesClient.test.ts`

**Interfaces:**
- Produces: `fetchAdminPuzzles(options?: { status?: PuzzleStatus; token?: string; fetcher?: typeof fetch }): Promise<ManagedPuzzle[]>`
- Produces: `importAdminPuzzleText(input, options): Promise<ManagedPuzzle>`
- Produces: `updateAdminPuzzle(id, input, options): Promise<ManagedPuzzle>`
- Produces: `publishAdminPuzzle(id, options): Promise<ManagedPuzzle>`
- Produces: `rejectAdminPuzzle(id, options): Promise<ManagedPuzzle>`

**Steps:**

- [x] Add failing client tests for authenticated list, import, update, publish, and reject.
- [x] Run `npm run test -- tests/adminPuzzlesClient.test.ts`; expect failure because file is missing.
- [x] Implement `src/client/adminPuzzles.ts` with a small `adminFetch` helper.
- [x] Run `npm run test -- tests/adminPuzzlesClient.test.ts`; expect pass.
- [x] Commit: `feat: add admin puzzle client`.

### Task 3: Add Admin Workbench UI

**Files:**
- Create: `src/components/AdminPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/adminPageUi.test.tsx`

**Interfaces:**
- Consumes: admin client functions from Task 2.
- Produces: `/admin` route in `App`.

**Steps:**

- [x] Add failing server-render tests that `AdminPage` renders "题库审核台", "粘贴原文导入", "保存修改", "发布", and selected puzzle fields.
- [x] Run `npm run test -- tests/adminPageUi.test.tsx`; expect failure because `AdminPage` is missing.
- [x] Implement `AdminPage` with status filter, import form, list, editor, and actions.
- [x] Route `window.location.pathname === "/admin"` to `AdminPage` in `App`.
- [x] Add admin CSS with compact two-column workbench layout and responsive single-column fallback.
- [x] Run `npm run test -- tests/adminPageUi.test.tsx`; expect pass.
- [x] Run `npm run build`; expect pass.
- [x] Commit: `feat: add admin puzzle workbench`.

### Task 4: Add Collection Script MVP

**Files:**
- Create: `scripts/collect-puzzles.mjs`
- Create: `scripts/collect-puzzles.d.mts`
- Modify: `package.json`
- Test: `tests/collectPuzzles.test.ts`

**Interfaces:**
- Produces: `stripHtmlToText(html: string): string`
- Produces: `extractPuzzleCandidates(text: string, sourceUrl?: string, sourceTitle?: string): Array<{ rawText: string; sourceUrl?: string; sourceTitle?: string }>`
- Produces: `collectPuzzles(options): Promise<{ imported: number; skipped: number; failed: string[] }>`
- CLI: `npm run collect:puzzles -- --url https://example.test/a --admin-token dev`

**Steps:**

- [x] Add failing tests for HTML stripping, candidate extraction, and posting imports.
- [x] Run `npm run test -- tests/collectPuzzles.test.ts`; expect failure because script is missing.
- [x] Implement direct URL collection and import posting.
- [x] Add optional `--query` support through `PUZZLE_SEARCH_ENDPOINT` that returns JSON `{ results: [{ title, url }] }`.
- [x] Add `collect:puzzles` script to `package.json`.
- [x] Run `npm run test -- tests/collectPuzzles.test.ts`; expect pass.
- [x] Commit: `feat: add puzzle collection script`.

### Task 5: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-23-admin-puzzle-workbench.md`

**Steps:**

- [x] Document `/admin`, `ADMIN_TOKEN`, and `npm run collect:puzzles` usage.
- [x] Run `npm run test`.
- [x] Run `npm run build`.
- [x] Browser verify `/admin`: import raw text, edit, save, publish, refresh `/`. (Browser text input was blocked by the virtual clipboard layer, so import/save/publish were executed through the same local admin API and verified in `/admin` plus `/`.)
- [x] Mark this checklist with the verification results.
- [ ] Commit: `docs: document admin puzzle workflow`.

## Verification Results

- `npm run test`: 17 files passed, 62 tests passed.
- `npm run build`: `tsc --noEmit && vite build` passed.
- `/admin` browser check: workbench rendered, published test puzzle appeared, no console errors.
- `/` browser check: published test puzzle appeared publicly, `truth` text did not appear on the homepage, no console errors.
