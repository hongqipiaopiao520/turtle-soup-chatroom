# Markdown Puzzle Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a script that imports the local Markdown puzzle table into the SQLite review queue.

**Architecture:** Keep parsing and conversion in `scripts/import-puzzles-md.mjs`, reuse existing SQLite/repository modules through a small TypeScript runner, and default imported records to `reviewing` so the admin workbench remains the publishing gate.

**Tech Stack:** Node.js, TypeScript via `tsx`, SQLite through existing repository, Vitest.

## Global Constraints

- Do not modify `/Users/levi/海龟汤去重总表.md`.
- Default status is `reviewing`, not `published`.
- Re-running the import must not create duplicates.
- Do not call the LLM for this structured Markdown table.
- Keep public `/api/puzzles` unchanged.

---

### Task 1: Parser And Conversion

**Files:**
- Create: `scripts/import-puzzles-md.mjs`
- Create: `scripts/import-puzzles-md.d.mts`
- Test: `tests/importPuzzlesMd.test.ts`

**Steps:**

- [x] Add failing tests for table parsing, title cleanup, source link parsing, and `ManagedPuzzle` conversion.
- [x] Run `npm run test -- tests/importPuzzlesMd.test.ts`; expect failure because the script is missing.
- [x] Implement parser and conversion helpers.
- [x] Run `npm run test -- tests/importPuzzlesMd.test.ts`; expect pass.
- [x] Commit: `feat: parse markdown puzzle table`.

### Task 2: SQLite Import CLI

**Files:**
- Modify: `scripts/import-puzzles-md.mjs`
- Modify: `scripts/import-puzzles-md.d.mts`
- Modify: `package.json`
- Test: `tests/importPuzzlesMd.test.ts`

**Steps:**

- [x] Add failing test that imports two parsed rows into a temporary SQLite database and returns `{ imported: 2, skipped: 0 }`.
- [x] Run `npm run test -- tests/importPuzzlesMd.test.ts`; expect failure because database import is missing.
- [x] Implement `importMarkdownPuzzles(options)`.
- [x] Add `import:puzzles-md` npm script.
- [x] Run `npm run test -- tests/importPuzzlesMd.test.ts`; expect pass.
- [x] Commit: `feat: import markdown puzzles into review queue`.

### Task 3: Real Import And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-23-markdown-puzzle-import.md`

**Steps:**

- [x] Run `npm run import:puzzles-md -- --file /Users/levi/海龟汤去重总表.md --limit 10`.
- [x] Verify `/api/admin/puzzles?status=reviewing` includes the imported rows.
- [x] Run `npm run test`.
- [x] Run `npm run build`.
- [x] Document usage in README.
- [x] Mark verification results in this plan.
- [ ] Commit: `docs: document markdown puzzle import`.

## Verification Results

- Real import: `Imported: 10`, `Skipped: 0`.
- Review queue check: imported titles include `妹妹的房间`, `宿舍`, `秘密`, `圣诞礼物`, `保姆`, `信`, `兄妹`, `笔仙`, `跳楼的女人`, `歌声`; all status `reviewing`.
- `npm run test`: 18 files passed, 66 tests passed.
- `npm run build`: `tsc --noEmit && vite build` passed.
