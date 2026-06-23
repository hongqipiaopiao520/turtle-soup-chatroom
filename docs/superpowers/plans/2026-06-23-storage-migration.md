# Deployable Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile local JSON persistence with a deployable storage layer while preserving the current MVP behavior.

**Architecture:** Introduce repository interfaces first, then back them with SQLite for single-server deployment. Keep room persistence as full `RoomState` snapshots in phase one to reduce risk, and move puzzle/admin data into queryable tables so题库管理 can grow cleanly. Keep the storage boundary narrow enough to swap SQLite for Postgres later.

**Tech Stack:** TypeScript, Express, Socket.IO, Vitest, SQLite, existing React/Vite app.

## Global Constraints

- Preserve the current game flow and socket event payloads.
- Keep `.env` local-only and never commit secrets.
- Single-server deploy target comes first; Postgres and Redis are later upgrades.
- Room state must survive process restart.
- Published puzzles must be loaded from storage, not hard-coded seed data, after migration.
- Tests must cover repository behavior before business code switches to it.

---

## Storage Direction

### Short Term

Use SQLite:

- one file, e.g. `data/app.sqlite`
- easy VPS deployment
- safer than hand-written JSON under concurrent writes
- supports later admin search/filter/review queries

### Later

Move to Postgres when the product needs:

- multiple Node instances
- managed backups
- dashboard analytics
- large题库审核量
- Socket.IO horizontal scaling with Redis adapter

---

## Target Data Model

### `puzzles`

Stores both published puzzles and admin drafts.

```sql
CREATE TABLE puzzles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  surface TEXT NOT NULL,
  truth TEXT NOT NULL,
  solution_points_json TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  author TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  raw_text TEXT,
  source_url TEXT,
  source_title TEXT,
  hints_json TEXT NOT NULL DEFAULT '[]',
  estimated_minutes INTEGER NOT NULL DEFAULT 15,
  quality_score INTEGER NOT NULL DEFAULT 0,
  quality_issues_json TEXT NOT NULL DEFAULT '[]',
  quality_summary TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `rooms`

Phase one stores full room snapshots. This keeps current room logic small and avoids premature normalization.

```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

---

## Files

- Create: `turtle-soup-chatroom/server/storage/database.ts`
  - Opens SQLite, applies migrations, exposes `getDatabase()`.
- Create: `turtle-soup-chatroom/server/storage/migrations.ts`
  - Contains ordered SQL migration strings.
- Create: `turtle-soup-chatroom/server/storage/puzzleRepository.ts`
  - Converts DB rows to `Puzzle` / managed puzzle records.
- Create: `turtle-soup-chatroom/server/storage/roomRepository.ts`
  - Saves and loads full `RoomState` snapshots.
- Create: `turtle-soup-chatroom/server/storage/seedDatabase.ts`
  - Inserts current `seedPuzzles` into DB when empty.
- Modify: `turtle-soup-chatroom/server/index.ts`
  - Initialize DB and seed puzzles before registering routes.
- Modify: `turtle-soup-chatroom/server/socketHandlers.ts`
  - Read puzzles from repository instead of static `seedPuzzles`.
- Modify: `turtle-soup-chatroom/server/roomPersistence.ts`
  - Either remove after migration or turn into JSON fallback for tests only.
- Modify: `turtle-soup-chatroom/src/data/seedPuzzles.ts`
  - Keep as bootstrap seed, not runtime source of truth.
- Modify: `turtle-soup-chatroom/src/shared/types.ts`
  - Add admin puzzle status/types.
- Test: `turtle-soup-chatroom/tests/storage/*.test.ts`
- Test: update existing `roomPersistence`, `roomStore`, and socket/API tests as needed.

---

## Phase 1: Storage Boundary

### Task 1: Define Storage Types

**Files:**
- Modify: `turtle-soup-chatroom/src/shared/types.ts`

**Interfaces:**

```ts
export type PuzzleStatus = "draft" | "reviewing" | "published" | "rejected";

export interface ManagedPuzzle extends Puzzle {
  status: PuzzleStatus;
  rawText?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  hints: string[];
  estimatedMinutes: number;
  qualityScore: number;
  qualityIssues: string[];
  qualitySummary: string;
  reviewedAt?: string;
  publishedAt?: string;
  updatedAt: string;
}
```

**Steps:**

- [x] Add `PuzzleStatus` and `ManagedPuzzle`.
- [x] Update tests that construct `Puzzle` only if TypeScript requires it.
- [x] Run `npm run build`.
- [x] Commit: `feat: add managed puzzle types`.

### Task 2: Add SQLite Database Module

**Files:**
- Create: `turtle-soup-chatroom/server/storage/database.ts`
- Create: `turtle-soup-chatroom/server/storage/migrations.ts`
- Test: `turtle-soup-chatroom/tests/storage/database.test.ts`
- Modify: `turtle-soup-chatroom/package.json`

**Dependency:**

Use `better-sqlite3` unless deployment constraints require another driver.

**Steps:**

- [x] Install runtime and type dependency:

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

- [x] Add migration SQL for `schema_migrations`, `puzzles`, and `rooms`.
- [x] Add `openDatabase(filePath?: string)` that creates parent directories and applies unapplied migrations.
- [x] Test that an empty temp DB gets all tables.
- [x] Test that running migrations twice is idempotent.
- [x] Run `npm run test -- tests/storage/database.test.ts`.
- [x] Commit: `feat: add sqlite storage foundation`.

### Task 3: Add Puzzle Repository

**Files:**
- Create: `turtle-soup-chatroom/server/storage/puzzleRepository.ts`
- Create: `turtle-soup-chatroom/server/storage/seedDatabase.ts`
- Test: `turtle-soup-chatroom/tests/storage/puzzleRepository.test.ts`

**Interfaces:**

```ts
export interface PuzzleRepository {
  listPublished(): Puzzle[];
  listManaged(status?: PuzzleStatus): ManagedPuzzle[];
  upsertManaged(puzzle: ManagedPuzzle): ManagedPuzzle;
  publish(id: string): ManagedPuzzle;
  reject(id: string): ManagedPuzzle;
}
```

**Steps:**

- [x] Write row-to-model and model-to-row converters for JSON fields.
- [x] Insert the current `seedPuzzles` as `published` records when `puzzles` is empty.
- [x] Test `listPublished()` returns only published puzzles.
- [x] Test JSON fields round-trip: `solutionPoints`, `tags`, `hints`, `qualityIssues`.
- [x] Test `publish(id)` sets `status = "published"` and `publishedAt`.
- [x] Run repository tests.
- [x] Commit: `feat: add puzzle repository`.

---

## Phase 2: Move Runtime Reads To Storage

### Task 4: Serve Puzzles From Repository

**Files:**
- Modify: `turtle-soup-chatroom/server/index.ts`
- Modify: `turtle-soup-chatroom/server/socketHandlers.ts`
- Modify: `turtle-soup-chatroom/src/client/useRoomSocket.ts` if public puzzle loading becomes API-driven.
- Test: `turtle-soup-chatroom/tests/apiPuzzles.test.ts`

**Steps:**

- [x] Initialize SQLite on server startup.
- [x] Seed DB from `seedPuzzles` only if the table is empty.
- [x] Change `/api/puzzles` to return `puzzleRepository.listPublished()`.
- [x] Change `room:create` to look up puzzle by id from repository.
- [x] Keep frontend seed usage temporarily if needed, but plan to remove it after API loading is wired.
- [x] Test `/api/puzzles` excludes `truth` but includes `solutionPoints` only if current public API still needs it.
- [x] Test `room:create` rejects unpublished/missing puzzle ids.
- [x] Run full tests and build.
- [x] Commit: `feat: load puzzles from storage`.

### Task 5: Persist Rooms To SQLite

**Files:**
- Create: `turtle-soup-chatroom/server/storage/roomRepository.ts`
- Modify: `turtle-soup-chatroom/server/index.ts`
- Modify: `turtle-soup-chatroom/server/socketHandlers.ts`
- Test: `turtle-soup-chatroom/tests/storage/roomRepository.test.ts`

**Interfaces:**

```ts
export interface RoomRepository {
  loadAll(): RoomState[];
  save(room: RoomState): void;
  saveAll(rooms: RoomState[]): void;
  remove(roomId: string): void;
}
```

**Steps:**

- [x] Test saving and loading one room snapshot.
- [x] Test `remove(roomId)` deletes the snapshot.
- [x] On startup, call `importRoomsSnapshot(roomRepository.loadAll())`.
- [x] Replace `savePersistedRooms(exportRoomsSnapshot())` with `roomRepository.saveAll(exportRoomsSnapshot())`.
- [x] When an empty room is removed, delete it from SQLite too.
- [x] Keep `data/rooms.json` migration path: if SQLite has no rooms and JSON exists, import it once.
- [x] Run full tests and build.
- [x] Commit: `feat: persist rooms in sqlite`.

---

## Phase 3: Admin Puzzle Workbench Foundation

### Task 6: Add Admin Puzzle API

**Files:**
- Create: `turtle-soup-chatroom/server/adminPuzzleRoutes.ts`
- Modify: `turtle-soup-chatroom/server/index.ts`
- Test: `turtle-soup-chatroom/tests/adminPuzzleRoutes.test.ts`

**Routes:**

```txt
GET  /api/admin/puzzles?status=reviewing
POST /api/admin/puzzles/import-text
POST /api/admin/puzzles/:id/publish
POST /api/admin/puzzles/:id/reject
```

**Steps:**

- [x] Add route tests for list, import text placeholder, publish, reject.
- [x] For `import-text`, initially store `rawText` and `status = "draft"` without LLM.
- [x] Add simple admin token guard using `ADMIN_TOKEN` env var; in dev, allow missing token only when `NODE_ENV !== "production"`.
- [x] Run route tests.
- [x] Commit: `feat: add admin puzzle api`.

### Task 7: Add LLM Structuring For Imported Text

**Files:**
- Create: `turtle-soup-chatroom/server/puzzleImporter.ts`
- Modify: `turtle-soup-chatroom/server/adminPuzzleRoutes.ts`
- Test: `turtle-soup-chatroom/tests/puzzleImporter.test.ts`

**Interfaces:**

```ts
export interface PuzzleImportResult {
  puzzle: ManagedPuzzle;
}

export async function importPuzzleFromText(rawText: string): Promise<PuzzleImportResult>
```

**Steps:**

- [x] Use existing MIMO/OpenAI-compatible config pattern from `server/aiHost.ts`.
- [x] Prompt LLM to return strict JSON for `title`, `surface`, `truth`, `solutionPoints`, `hints`, `difficulty`, `tags`, `qualityScore`, `qualityIssues`, `qualitySummary`.
- [x] Validate output with Zod.
- [x] Fallback to `draft` with quality issue if LLM fails.
- [x] Test valid LLM JSON becomes `reviewing`.
- [x] Test invalid LLM JSON becomes `draft` with an issue.
- [x] Run importer tests.
- [x] Commit: `feat: structure imported puzzles with ai`.

---

## Phase 4: Deployment Readiness

### Task 8: Add Deployment Config And Docs

**Files:**
- Modify: `turtle-soup-chatroom/.env.example`
- Modify: `turtle-soup-chatroom/README.md`
- Create: `turtle-soup-chatroom/scripts/backup-sqlite.mjs`

**Environment Variables:**

```txt
DATABASE_URL=file:./data/app.sqlite
ADMIN_TOKEN=replace_me
PORT=8787
```

**Steps:**

- [x] Document single-server deploy: install deps, set env, run build, start server.
- [x] Document that `data/app.sqlite` must be on persistent disk.
- [x] Add backup script that copies SQLite file to `data/backups/app-YYYY-MM-DD-HH-mm-ss.sqlite`.
- [x] Test backup script against a temp DB path.
- [x] Commit: `docs: add sqlite deployment guide`.

---

## Phase 5: Later Upgrade Path

Do not implement in this migration, but keep it visible:

- Postgres adapter implementing the same repository interfaces.
- Redis-backed Socket.IO adapter for multiple server instances.
- Normalized room event tables if analytics/replay becomes important.
- Object storage for imported source snapshots if raw content gets large.

---

## Verification Checklist

- [x] `npm run test`
- [x] `npm run build`
- [ ] Create room, ask host, restart server, rejoin room.
- [x] Import a draft puzzle, publish it, refresh homepage, create room from it. (Covered by repository/API/client tests; manual browser publish UI not built yet.)
- [x] Confirm `data/rooms.json` is no longer required for normal runtime.
- [x] Confirm `data/app.sqlite` survives process restart via repository persistence tests.
