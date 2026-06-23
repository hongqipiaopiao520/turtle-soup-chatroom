# Room Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep MVP room data available across local server restarts.

**Architecture:** Keep the existing in-memory `roomStore` as the runtime source of truth. Add snapshot import/export functions and a small JSON file persistence adapter used by the server on startup and after room mutations.

**Tech Stack:** Node.js `fs/path`, TypeScript, Vitest, Express, Socket.IO.

## Global Constraints

- Use JSON file persistence only; do not add SQLite or a database in this phase.
- Persist only room state, not API keys or frontend localStorage.
- Default data path is `data/rooms.json` under the app directory.
- The data directory must be git-ignored.
- Corrupt or missing persistence files must not prevent dev server startup.

---

### Task 1: Store Snapshot Import and Export

**Files:**
- Modify: `turtle-soup-chatroom/server/roomStore.ts`
- Modify: `turtle-soup-chatroom/tests/roomStore.test.ts`

**Interfaces:**
- Produces: `exportRoomsSnapshot(): RoomState[]`
- Produces: `importRoomsSnapshot(nextRooms: RoomState[]): void`

- [ ] **Step 1: Write failing tests**

Add a test that creates a room, adds chat, exports the snapshot, resets rooms, imports the snapshot, and can rejoin the same room with the same player id.

- [ ] **Step 2: Verify tests fail**

Run: `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test -- tests/roomStore.test.ts`

Expected: FAIL because snapshot functions do not exist.

- [ ] **Step 3: Implement snapshot functions**

`exportRoomsSnapshot()` returns a shallow array of room states. `importRoomsSnapshot()` clears the current map and restores each room by id.

- [ ] **Step 4: Verify tests pass**

Run: `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test -- tests/roomStore.test.ts`

Expected: PASS.

### Task 2: JSON Persistence Adapter

**Files:**
- Create: `turtle-soup-chatroom/server/roomPersistence.ts`
- Create: `turtle-soup-chatroom/tests/roomPersistence.test.ts`

**Interfaces:**
- Produces: `getRoomsFilePath(): string`
- Produces: `loadPersistedRooms(filePath?: string): RoomState[]`
- Produces: `savePersistedRooms(rooms: RoomState[], filePath?: string): void`

- [ ] **Step 1: Write failing tests**

Test saving and loading a room snapshot to a temporary file, missing file returns `[]`, and corrupt JSON returns `[]`.

- [ ] **Step 2: Verify tests fail**

Run: `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test -- tests/roomPersistence.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement adapter**

Use `mkdirSync(dirname(filePath), { recursive: true })`, `writeFileSync`, `readFileSync`, and `JSON.parse`. Validate minimally that parsed value is an array.

- [ ] **Step 4: Verify tests pass**

Run: `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test -- tests/roomPersistence.test.ts`

Expected: PASS.

### Task 3: Server Integration

**Files:**
- Modify: `turtle-soup-chatroom/server/index.ts`
- Modify: `turtle-soup-chatroom/server/socketHandlers.ts`
- Modify: `.gitignore`
- Modify: `turtle-soup-chatroom/README.md`

**Interfaces:**
- Server startup calls `importRoomsSnapshot(loadPersistedRooms())`.
- Socket handlers call `savePersistedRooms(exportRoomsSnapshot())` after create, join, chat, host answer, pin, and leave mutations.

- [ ] **Step 1: Load persisted rooms at startup**

Import and call persistence functions after local env is loaded and before socket handlers are registered.

- [ ] **Step 2: Save after mutations**

Add a local `persistRooms()` helper in `socketHandlers.ts`.

- [ ] **Step 3: Ignore persisted data**

Add `turtle-soup-chatroom/data/` to root `.gitignore`.

- [ ] **Step 4: Document persistence**

README says rooms are saved to `data/rooms.json` and remain local-only.

- [ ] **Step 5: Verify**

Run full tests and build. Manually create a room, restart dev server, and rejoin the same room URL.
