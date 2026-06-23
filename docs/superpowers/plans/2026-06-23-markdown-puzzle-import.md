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

- [ ] Add failing tests for table parsing, title cleanup, source link parsing, and `ManagedPuzzle` conversion.
- [ ] Run `npm run test -- tests/importPuzzlesMd.test.ts`; expect failure because the script is missing.
- [ ] Implement parser and conversion helpers.
- [ ] Run `npm run test -- tests/importPuzzlesMd.test.ts`; expect pass.
- [ ] Commit: `feat: parse markdown puzzle table`.

### Task 2: SQLite Import CLI

**Files:**
- Modify: `scripts/import-puzzles-md.mjs`
- Modify: `scripts/import-puzzles-md.d.mts`
- Modify: `package.json`
- Test: `tests/importPuzzlesMd.test.ts`

**Steps:**

- [ ] Add failing test that imports two parsed rows into a temporary SQLite database and returns `{ imported: 2, skipped: 0 }`.
- [ ] Run `npm run test -- tests/importPuzzlesMd.test.ts`; expect failure because database import is missing.
- [ ] Implement `importMarkdownPuzzles(options)`.
- [ ] Add `import:puzzles-md` npm script.
- [ ] Run `npm run test -- tests/importPuzzlesMd.test.ts`; expect pass.
- [ ] Commit: `feat: import markdown puzzles into review queue`.

### Task 3: Real Import And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-23-markdown-puzzle-import.md`

**Steps:**

- [ ] Run `npm run import:puzzles-md -- --file /Users/levi/海龟汤去重总表.md --limit 10`.
- [ ] Verify `/api/admin/puzzles?status=reviewing` includes the imported rows.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Document usage in README.
- [ ] Mark verification results in this plan.
- [ ] Commit: `docs: document markdown puzzle import`.

