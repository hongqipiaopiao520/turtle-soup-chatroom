# Room Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the room flow stable enough for hands-on testing: refresh/rejoin works, invalid rooms are clear, invite copying has feedback, and player identity is explicit.

**Architecture:** Keep the in-memory MVP room store, but change room create/join/rejoin operations to return a `RoomSession` object containing `{ room, playerId }`. The client stores this session in `localStorage` per room, restores it on refresh, and falls back to the nickname dialog when no local session exists.

**Tech Stack:** TypeScript, React, Socket.IO, Vitest, browser `localStorage`.

## Global Constraints

- No login or account system in this phase.
- No database persistence in this phase.
- Existing invite URL shape remains `?room=<id>`.
- Existing room state shape remains compatible for rendering.
- Every store/protocol behavior change must have Vitest coverage before implementation.

---

### Task 1: Explicit Room Sessions

**Files:**
- Modify: `turtle-soup-chatroom/src/shared/types.ts`
- Modify: `turtle-soup-chatroom/server/roomStore.ts`
- Modify: `turtle-soup-chatroom/tests/roomStore.test.ts`

**Interfaces:**
- Produces: `interface RoomSession { room: RoomState; playerId: string }`
- Changes: `createRoom(puzzle, hostName): RoomSession`
- Changes: `joinRoom(roomId, playerName): RoomSession`
- Adds: `rejoinRoom(roomId, playerId): RoomSession`

- [ ] **Step 1: Write failing tests**

Add tests that assert:
- `createRoom()` returns the created host `playerId`.
- `joinRoom()` returns the joining player's `playerId`.
- `rejoinRoom()` returns the same room and player id for an existing player.
- `rejoinRoom()` throws `玩家不在房间内` for stale player ids.

- [ ] **Step 2: Verify tests fail**

Run: `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test -- tests/roomStore.test.ts`

Expected: FAIL because `createRoom()` and `joinRoom()` still return `RoomState`, and `rejoinRoom()` does not exist.

- [ ] **Step 3: Implement minimal store changes**

Update the store to return session objects while keeping all room mutations unchanged.

- [ ] **Step 4: Verify tests pass**

Run: `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test -- tests/roomStore.test.ts`

Expected: PASS.

### Task 2: Socket Session Protocol

**Files:**
- Modify: `turtle-soup-chatroom/server/socketHandlers.ts`
- Modify: `turtle-soup-chatroom/src/client/useRoomSocket.ts`

**Interfaces:**
- Server emits: `room:session` with `RoomSession` for create/join/rejoin.
- Server continues emitting: `room:state` with `RoomState` for broadcast updates.
- Client consumes: `room:session` to set both `room` and `playerId`.
- Client adds: `rejoinRoom(roomId: string, playerId: string): void`.

- [ ] **Step 1: Update server protocol**

`room:create`, `room:join`, and `room:rejoin` emit `room:session` to the current socket. `room:join` also broadcasts `room:state` so existing players see the newcomer.

- [ ] **Step 2: Update client hook**

Handle `room:session` explicitly and remove the “newest player” fallback.

- [ ] **Step 3: Run tests**

Run: `PATH=/Users/levi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test`

Expected: PASS.

### Task 3: Browser Refresh Recovery and UX Feedback

**Files:**
- Modify: `turtle-soup-chatroom/src/App.tsx`
- Modify: `turtle-soup-chatroom/src/components/RoomPage.tsx`
- Modify: `turtle-soup-chatroom/src/styles.css`

**Interfaces:**
- Local storage key: `turtle-room-session:<roomId>`
- Value: JSON string `{ "roomId": string, "playerId": string }`
- `RoomPage` receives optional `copiedInvite: boolean` and `onCopyInvite(): void`.

- [ ] **Step 1: Store session after create/join/rejoin**

When room and player id are present, save `{ roomId, playerId }` under the room key.

- [ ] **Step 2: Restore session on `?room=<id>`**

If local storage has a matching player id, call `rejoinRoom`. Otherwise show the nickname dialog.

- [ ] **Step 3: Handle invalid/stale room**

Show server errors as a toast and clear stale local storage for that room.

- [ ] **Step 4: Add invite copy feedback**

Clicking invite copies the URL and changes the button label to `已复制` for a short period. If clipboard is unavailable, still show the URL in the address bar and emit a toast error.

- [ ] **Step 5: Verify manually**

Create a room, refresh the page, confirm no nickname dialog appears and the same player remains. Open the room URL in a second browser/session and confirm nickname dialog appears. Try a fake `?room=missing` and confirm a clear error.
