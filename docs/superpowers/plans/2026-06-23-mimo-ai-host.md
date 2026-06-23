# MIMO AI Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local turtle-soup room use the provided MIMO model configuration for real AI host answers.

**Architecture:** Keep the existing OpenAI-compatible `/chat/completions` host adapter. Add a small server-side environment loader and a normalized AI config helper so the app supports both generic `AI_*` variables and MIMO-specific `MIMO_*` variables without exposing secrets to the frontend.

**Tech Stack:** Node.js, TypeScript, Vite, React, Express, Socket.IO, Vitest.

## Global Constraints

- `.env` remains local-only and ignored by git.
- `AI_*` variables take precedence over `MIMO_*` variables when both are present.
- `MIMO_AGENT_MODEL` is the default host model; `MIMO_FAST_MODEL` is kept available for later fast paths.
- No new runtime dependency unless the standard Node.js APIs cannot handle the file loading.
- Every behavior change must be covered by Vitest before implementation.

---

### Task 1: Server Environment Loading and MIMO Config

**Files:**
- Create: `turtle-soup-chatroom/server/env.ts`
- Modify: `turtle-soup-chatroom/server/index.ts`
- Modify: `turtle-soup-chatroom/server/aiHost.ts`
- Test: `turtle-soup-chatroom/tests/aiHost.test.ts`

**Interfaces:**
- Produces: `loadLocalEnv(cwd?: string): void`
- Produces: `getAiHostConfig(): { baseUrl?: string; apiKey?: string; model?: string }`
- Consumes: `askHost(input: AskHostInput)` uses `getAiHostConfig()`

- [ ] **Step 1: Write failing tests**

Add tests that:
- Create a temporary `.env` with `MIMO_BASE_URL`, `MIMO_API_KEY`, and `MIMO_AGENT_MODEL`, then verify `loadLocalEnv()` populates `process.env`.
- Set only `MIMO_*` variables, call `askHost()`, and verify `fetch` is called with the MIMO base URL, bearer token, and model.
- Set both `AI_*` and `MIMO_*` variables, call `askHost()`, and verify `AI_*` wins.

- [ ] **Step 2: Verify tests fail**

Run: `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test -- tests/aiHost.test.ts`

Expected: FAIL because `server/env.ts` and `getAiHostConfig()` do not exist.

- [ ] **Step 3: Implement minimal env loader and config helper**

Create `server/env.ts` using `node:fs`, `node:path`, and simple `.env` line parsing. Update `server/index.ts` to call `loadLocalEnv()` before server setup. Update `server/aiHost.ts` to read normalized config through `getAiHostConfig()`.

- [ ] **Step 4: Verify tests pass**

Run: `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test -- tests/aiHost.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:
- `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test`
- `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build`

Expected: both PASS.

### Task 2: Documentation and Local Verification

**Files:**
- Modify: `turtle-soup-chatroom/.env.example`
- Modify: `turtle-soup-chatroom/README.md`

**Interfaces:**
- Consumes: Task 1's `AI_*` and `MIMO_*` support.
- Produces: Copy-pasteable local setup instructions for MIMO-backed AI host testing.

- [ ] **Step 1: Update example env**

Show both generic `AI_*` and MIMO-specific variables, with placeholder values only.

- [ ] **Step 2: Update README**

Document that the server loads `.env` locally, that `AI_*` takes precedence, and that MIMO values can be used directly.

- [ ] **Step 3: Manual verification**

Start the app with `npm run dev`, create a room, ask the AI host a yes/no question, and confirm the answer is no longer the configuration fallback.

- [ ] **Step 4: Commit**

Commit only tracked code/docs changes. Do not commit `.env`.
