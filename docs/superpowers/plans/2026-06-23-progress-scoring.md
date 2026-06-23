# Progress Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every host interaction into scored progress, unlock the answer at 95%, and show round settlement highlights like MVP and best answer.

**Architecture:** Add `solutionPoints` to puzzles and let the AI host return a normalized progress decision for every answer. Store enforces monotonic room progress, per-player contribution points, answer unlock, and settlement summary derived from host logs and player totals.

**Tech Stack:** TypeScript, React, Socket.IO, Vitest, existing OpenAI-compatible MIMO adapter.

## Global Constraints

- Every host ask, including ordinary questions, returns a `progress` score.
- Room progress never decreases.
- `progress >= 95` unlocks the answer; players can view the truth after unlock.
- Do not expose the full truth in special UI before unlock. Existing room payload still contains puzzle truth in this MVP; hardening that is a follow-up.
- No account/login system in this phase; scores are per room player id.

---

### Task 1: Types and Seed Key Points - Done

**Files:**
- Modify: `turtle-soup-chatroom/src/shared/types.ts`
- Modify: `turtle-soup-chatroom/src/data/seedPuzzles.ts`

**Interfaces:**
- Add to `Puzzle`: `solutionPoints: string[]`
- Add to `HostAnswer`: `progress: number`, `progressDelta: number`, `contributionScore: number`, `isBreakthrough: boolean`
- Add to `Player`: `score: number`, `hits: number`, `bestDelta: number`
- Add to `RoomState`: `progress: number`, `answerUnlocked: boolean`, `truthRevealed: boolean`

### Task 2: AI Progress Decision - Done

**Files:**
- Modify: `turtle-soup-chatroom/server/aiHost.ts`
- Modify: `turtle-soup-chatroom/tests/aiHost.test.ts`

**Interfaces:**
- Extend `HostDecision`: `progress: number`
- Parser defaults missing/invalid progress to `0`
- Prompt asks model to evaluate progress against `solutionPoints`

### Task 3: Store Scoring Rules - Done

**Files:**
- Modify: `turtle-soup-chatroom/server/roomStore.ts`
- Modify: `turtle-soup-chatroom/tests/roomStore.test.ts`

**Rules:**
- `newProgress = max(currentProgress, decision.progress)`
- `progressDelta = newProgress - previousProgress`
- `contributionScore = progressDelta * 10 + (progressDelta >= 20 ? 50 : 0) + (crosses 95 ? 80 : 0)`
- Player score accumulates contribution score.
- Player hits increments when `progressDelta > 0`.
- Player bestDelta stores max delta.
- Room `answerUnlocked = true` when progress reaches 95.
- Room status becomes `solved` when answer is unlocked.

### Task 4: Socket and UI - Done

**Files:**
- Modify: `turtle-soup-chatroom/server/socketHandlers.ts`
- Modify: `turtle-soup-chatroom/src/components/HostPanel.tsx`
- Modify: `turtle-soup-chatroom/src/components/SidePanel.tsx`
- Modify: `turtle-soup-chatroom/src/components/RoomPage.tsx`
- Modify: `turtle-soup-chatroom/src/styles.css`

**UI:**
- Show progress bar and percent in host panel.
- Each answer shows `+X%` and contribution score when applicable.
- Side panel shows contribution ranking.
- When answer is unlocked, show a `查看汤底` action/panel.
- Settlement highlights show MVP and best answer.

### Task 5: Verification - Done

Run:
- `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test`
- `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build`

Manual:
- Ask ordinary questions and confirm progress moves.
- Submit a near-complete inference and confirm answer unlocks at 95%.
- Confirm side panel shows MVP/best answer after unlock.
