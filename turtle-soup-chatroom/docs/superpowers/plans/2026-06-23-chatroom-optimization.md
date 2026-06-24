# Chatroom Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the play loop for 知心李歪聊天室 by adding room recovery, tightening the room UI, supporting file-based puzzle imports, and making solution progress scoring more reliable.

**Architecture:** Keep the current React/Vite/Socket.IO/Express/SQLite shape. Add small focused client helpers for room session memory and import parsing, then evolve host scoring through compatible `solutionPoints` parsing so existing database rows still work. Avoid schema migration unless a task explicitly proves it is necessary.

**Tech Stack:** React 19, TypeScript, Vite 7, Socket.IO, Express 5, better-sqlite3, Vitest, lucide-react.

## Global Constraints

- Keep the public app name as `知心李歪聊天室`.
- Do not rename `package.json` package name, deployment paths, or existing database files as part of this work.
- Keep edits incremental and test-first.
- Keep old puzzle rows compatible: plain string `solutionPoints` must still work.
- All imported puzzle files enter the admin review queue; do not auto-publish batch imports.
- Prefer no new runtime dependencies. If a dependency becomes necessary, document why before adding it.
- Node in the current environment is `18.20.4`; `npm run build` currently exits 0 but Vite warns that it expects `20.19+` or `22.12+`.

---

## File Structure

- `src/App.tsx`: orchestrates home/detail/room views and should delegate local session memory to a helper.
- `src/client/roomSessionMemory.ts`: new client-only helper for storing, listing, pruning, and reading recent room sessions.
- `src/client/useRoomSocket.ts`: exposes reconnect status and rejoin calls; should clear stale errors when session events arrive.
- `src/components/HomePage.tsx`: shows a compact "continue room" affordance when a resumable session exists.
- `src/components/RoomPage.tsx`: makes leaving a room a soft navigation action and preserves session memory.
- `src/components/SidePanel.tsx`: owns right-rail layout, fixed chat scrolling, chat submit ergonomics, and case-note display.
- `src/components/HostPanel.tsx`: owns host Q&A feed, compact pin controls, busy/disabled states, and progress visibility.
- `src/styles.css`: implements room layout constraints, compact action controls, fixed chat scroll, mobile tabs or stacked layout polish.
- `src/client/adminPuzzles.ts`: adds batch/file import client functions.
- `src/client/puzzleFileImport.ts`: new pure parser for `.txt`, `.md`, and `.csv` admin file imports.
- `src/components/AdminPage.tsx`: adds file picker, import preview, batch submit, and import report UI.
- `server/adminPuzzleRoutes.ts`: adds a batch import endpoint that stores all imported items in the review queue.
- `server/puzzleImporter.ts`: adds helpers for parsing weighted solution point strings and normalizing import output.
- `server/aiHost.ts`: updates host response schema/prompt to return covered point IDs and confidence, while retaining progress fallback.
- `server/roomStore.ts`: tracks structured progress from host answers without requiring a room schema migration.
- `src/shared/types.ts`: adds compatible optional fields for weighted solution points and host answer coverage.
- `src/data/seedPuzzles.ts`: updates `cold-cup` solution point text to weighted, non-duplicative key facts.
- `tests/*`: adds focused Vitest coverage for session memory, UI static markup, import parsing/routes, scoring parse, and room progress behavior.

---

### Task 1: Room Session Memory Helper

**Files:**
- Create: `src/client/roomSessionMemory.ts`
- Create: `tests/roomSessionMemory.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces:
  - `type StoredRoomSession = { roomId: string; playerId: string; puzzleTitle?: string; updatedAt: string }`
  - `storeRoomSession(session: Omit<StoredRoomSession, "updatedAt">): StoredRoomSession`
  - `readRoomSession(roomId: string): StoredRoomSession | null`
  - `listRoomSessions(): StoredRoomSession[]`
  - `removeRoomSession(roomId: string): void`
  - `mostRecentRoomSession(): StoredRoomSession | null`
- Consumes: `window.localStorage`; must no-op safely when `window` is unavailable.

- [ ] **Step 1: Write failing tests for room session memory**

Add `tests/roomSessionMemory.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import {
  listRoomSessions,
  mostRecentRoomSession,
  readRoomSession,
  removeRoomSession,
  storeRoomSession
} from "../src/client/roomSessionMemory";

const originalWindow = globalThis.window;

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      }
    }
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow
  });
});

describe("roomSessionMemory", () => {
  it("stores and reads a room session by room id", () => {
    installLocalStorage();

    const stored = storeRoomSession({
      roomId: "room-a",
      playerId: "player-a",
      puzzleTitle: "冷掉的水"
    });

    expect(stored.roomId).toBe("room-a");
    expect(readRoomSession("room-a")).toMatchObject({
      roomId: "room-a",
      playerId: "player-a",
      puzzleTitle: "冷掉的水"
    });
  });

  it("lists newest sessions first and returns the most recent one", () => {
    installLocalStorage();

    storeRoomSession({ roomId: "room-old", playerId: "player-old" });
    storeRoomSession({ roomId: "room-new", playerId: "player-new" });

    expect(listRoomSessions().map((item) => item.roomId)).toEqual(["room-new", "room-old"]);
    expect(mostRecentRoomSession()?.roomId).toBe("room-new");
  });

  it("removes a stale room session", () => {
    installLocalStorage();

    storeRoomSession({ roomId: "room-a", playerId: "player-a" });
    removeRoomSession("room-a");

    expect(readRoomSession("room-a")).toBeNull();
    expect(listRoomSessions()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the memory tests and verify they fail**

Run:

```bash
npm test -- tests/roomSessionMemory.test.ts
```

Expected: fail because `src/client/roomSessionMemory.ts` does not exist.

- [ ] **Step 3: Implement session memory helper**

Create `src/client/roomSessionMemory.ts`:

```typescript
export interface StoredRoomSession {
  roomId: string;
  playerId: string;
  puzzleTitle?: string;
  updatedAt: string;
}

const SESSION_LIST_KEY = "turtle-room-sessions";
const MAX_SESSIONS = 5;

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function parseSessions(raw: string | null): StoredRoomSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredRoomSession);
  } catch {
    return [];
  }
}

function isStoredRoomSession(value: unknown): value is StoredRoomSession {
  const item = value as StoredRoomSession;
  return Boolean(item?.roomId && item?.playerId && item?.updatedAt);
}

function writeSessions(sessions: StoredRoomSession[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SESSION_LIST_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
}

export function listRoomSessions(): StoredRoomSession[] {
  if (!canUseStorage()) return [];
  return parseSessions(window.localStorage.getItem(SESSION_LIST_KEY)).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  );
}

export function storeRoomSession(session: Omit<StoredRoomSession, "updatedAt">): StoredRoomSession {
  const nextSession: StoredRoomSession = {
    ...session,
    updatedAt: new Date().toISOString()
  };
  const nextSessions = [
    nextSession,
    ...listRoomSessions().filter((item) => item.roomId !== session.roomId)
  ];
  writeSessions(nextSessions);
  return nextSession;
}

export function readRoomSession(roomId: string): StoredRoomSession | null {
  return listRoomSessions().find((session) => session.roomId === roomId) ?? null;
}

export function removeRoomSession(roomId: string) {
  writeSessions(listRoomSessions().filter((session) => session.roomId !== roomId));
}

export function mostRecentRoomSession(): StoredRoomSession | null {
  return listRoomSessions()[0] ?? null;
}
```

- [ ] **Step 4: Update `src/App.tsx` to use helper for existing URL rejoin**

Replace the local `roomSessionKey`, `readStoredPlayerId`, `storeRoomSession`, and `clearRoomSession` functions with imports:

```typescript
import {
  mostRecentRoomSession,
  readRoomSession,
  removeRoomSession,
  storeRoomSession
} from "./client/roomSessionMemory";
```

Change URL room lookup:

```typescript
const storedSession = readRoomSession(roomId);
if (storedSession) {
  roomSocket.rejoinRoom(roomId, storedSession.playerId);
  setView({ name: "room" });
} else {
  setNameRequest({ kind: "join", roomId });
}
```

Change session persistence:

```typescript
if (roomSocket.room && roomSocket.playerId) {
  storeRoomSession({
    roomId: roomSocket.room.id,
    playerId: roomSocket.playerId,
    puzzleTitle: roomSocket.room.puzzle.title
  });
}
```

Change stale clear:

```typescript
removeRoomSession(roomId);
```

Do not yet show the resume card; Task 2 owns that UI.

- [ ] **Step 5: Run memory tests**

Run:

```bash
npm test -- tests/roomSessionMemory.test.ts
```

Expected: pass.

- [ ] **Step 6: Run app build**

Run:

```bash
npm run build
```

Expected: exit 0. A Vite Node version warning may appear in this environment.

---

### Task 2: Resume Room From Home

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/HomePage.tsx`
- Modify: `src/styles.css`
- Create or modify: `tests/homePageUi.test.tsx`

**Interfaces:**
- Consumes Task 1 `StoredRoomSession` and `mostRecentRoomSession()`.
- Produces `HomePage` props:
  - `recentRoom?: StoredRoomSession | null`
  - `onResumeRoom?: (session: StoredRoomSession) => void`

- [ ] **Step 1: Add failing UI test for the continue room card**

Append to `tests/homePageUi.test.tsx`:

```typescript
it("renders a continue room action when a recent room exists", () => {
  const markup = renderToStaticMarkup(
    <HomePage
      puzzles={[]}
      recentRoom={{
        roomId: "room-a",
        playerId: "player-a",
        puzzleTitle: "冷掉的水",
        updatedAt: "2026-06-23T00:00:00.000Z"
      }}
      onOpenPuzzle={() => undefined}
      onRandomPuzzle={() => undefined}
      onResumeRoom={() => undefined}
    />
  );

  expect(markup).toContain("继续上次房间");
  expect(markup).toContain("冷掉的水");
});
```

- [ ] **Step 2: Run the HomePage UI test and verify it fails**

Run:

```bash
npm test -- tests/homePageUi.test.tsx
```

Expected: fail because `HomePage` does not accept or render `recentRoom`.

- [ ] **Step 3: Implement resume UI props in `HomePage`**

Update `src/components/HomePage.tsx` props:

```typescript
import type { StoredRoomSession } from "../client/roomSessionMemory";

export function HomePage({
  puzzles: availablePuzzles,
  recentRoom,
  onOpenPuzzle,
  onRandomPuzzle,
  onResumeRoom
}: {
  puzzles: PublicPuzzle[];
  recentRoom?: StoredRoomSession | null;
  onOpenPuzzle: (puzzle: PublicPuzzle) => void;
  onRandomPuzzle: () => void;
  onResumeRoom?: (session: StoredRoomSession) => void;
}) {
```

Render the card at the top of `.activity-panel`:

```tsx
{recentRoom && onResumeRoom && (
  <button className="resume-room-card" type="button" onClick={() => onResumeRoom(recentRoom)}>
    <span>继续上次房间</span>
    <strong>{recentRoom.puzzleTitle ?? recentRoom.roomId}</strong>
  </button>
)}
```

- [ ] **Step 4: Wire resume from `src/App.tsx`**

Add state:

```typescript
const [recentRoom, setRecentRoom] = useState(() => mostRecentRoomSession());
```

After storing a session, update `recentRoom`:

```typescript
setRecentRoom(mostRecentRoomSession());
```

Pass to `HomePage`:

```tsx
recentRoom={recentRoom}
onResumeRoom={(session) => {
  roomSocket.rejoinRoom(session.roomId, session.playerId);
  window.history.replaceState(null, "", `?room=${session.roomId}`);
  setView({ name: "room" });
}}
```

If a resume attempt returns `房间不存在` or `玩家不在房间内`, remove that session and refresh `recentRoom`.

- [ ] **Step 5: Style the resume card**

Add to `src/styles.css`:

```css
.resume-room-card {
  display: grid;
  gap: 5px;
  width: 100%;
  border: 1px solid rgba(216, 168, 79, 0.42);
  border-radius: 8px;
  background: rgba(216, 168, 79, 0.1);
  color: var(--text);
  cursor: pointer;
  margin-bottom: 12px;
  padding: 12px;
  text-align: left;
}

.resume-room-card span {
  color: var(--orange);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.resume-room-card strong {
  overflow-wrap: anywhere;
}
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
npm test -- tests/homePageUi.test.tsx tests/roomSessionMemory.test.ts
npm run build
```

Expected: tests pass; build exits 0 with possible Vite Node warning.

---

### Task 3: Room UI Layout and Chat Ergonomics

**Files:**
- Modify: `src/components/SidePanel.tsx`
- Modify: `src/components/HostPanel.tsx`
- Modify: `src/styles.css`
- Modify: `tests/roomUi.test.tsx`

**Interfaces:**
- Produces stable class hooks:
  - `.side-panel`
  - `.chat-section`
  - `.chat-list`
  - `.chat-input`
  - `.pin-answer-button`
- `SidePanel` should auto-scroll chat to bottom when `room.chatMessages.length` changes.
- Chat input should submit on Enter and allow Shift+Enter only if converted to a textarea. If it remains an input, Enter submits.

- [ ] **Step 1: Add failing static markup tests for compact pin and chat structure**

Append to `tests/roomUi.test.tsx`:

```typescript
it("renders compact pin controls without visible pin text", () => {
  const room = makeSolvedRoom();

  const markup = renderToStaticMarkup(
    <RoomPage
      room={room}
      playerId="player-host"
      onBack={() => undefined}
      onAsk={() => undefined}
      onPin={() => undefined}
      onSendChat={() => undefined}
    />
  );

  expect(markup).toContain("pin-answer-button");
  expect(markup).toContain('aria-label="收藏到卷宗"');
  expect(markup).not.toContain(">收藏</button>");
});

it("renders chat as a constrained scroll region", () => {
  const room = {
    ...makeSolvedRoom(),
    chatMessages: Array.from({ length: 24 }, (_, index) => ({
      id: `chat-${index}`,
      playerId: "player-host",
      playerName: "房主",
      body: `消息 ${index}`,
      createdAt: "2026-06-23T00:01:00.000Z"
    }))
  };

  const markup = renderToStaticMarkup(
    <SidePanel
      room={room}
      playerId="player-host"
      onOpenSettlement={() => undefined}
      onSendChat={() => undefined}
    />
  );

  expect(markup).toContain('class="side-section chat-section"');
  expect(markup).toContain('class="chat-list"');
  expect(markup).toContain("消息 23");
});
```

- [ ] **Step 2: Run the UI tests and verify at least the pin test fails**

Run:

```bash
npm test -- tests/roomUi.test.tsx
```

Expected: fail because pin button still includes visible text and lacks `pin-answer-button`.

- [ ] **Step 3: Make pin action compact in `HostPanel`**

Change the pin button:

```tsx
<button
  className={`icon-button pin-answer-button ${item.pinned ? "pin-answer-button-active" : ""}`}
  onClick={() => onPin(item.id)}
  title={item.pinned ? "已收藏到卷宗" : "收藏到卷宗"}
  aria-label={item.pinned ? "已收藏到卷宗" : "收藏到卷宗"}
>
  <Pin size={15} />
</button>
```

- [ ] **Step 4: Add chat auto-scroll and Enter submit in `SidePanel`**

Update imports:

```typescript
import { useEffect, useRef, useState } from "react";
```

Add refs/effect:

```typescript
const chatListRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const chatList = chatListRef.current;
  if (chatList) {
    chatList.scrollTop = chatList.scrollHeight;
  }
}, [room.chatMessages.length]);
```

Set ref and key handling:

```tsx
<div className="chat-list" ref={chatListRef}>
```

```tsx
<input
  value={chat}
  onChange={(event) => setChat(event.target.value)}
  onKeyDown={(event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitChat();
    }
  }}
  placeholder="输入消息..."
/>
```

- [ ] **Step 5: Tighten CSS layout**

Update the relevant section in `src/styles.css`:

```css
.side-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) minmax(120px, auto);
  gap: 12px;
  min-height: 0;
  overflow: hidden;
  background: transparent;
  box-shadow: none;
  border: 0;
}

.side-section {
  min-height: 0;
}

.chat-section {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
}

.chat-list {
  min-height: 0;
  max-height: none;
  padding-right: 4px;
  scrollbar-gutter: stable;
}

.pin-answer-button {
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
}

.pin-answer-button-active {
  border-color: rgba(216, 168, 79, 0.58);
  background: rgba(216, 168, 79, 0.14);
  color: #f4dca0;
}
```

For mobile, preserve readable stacking:

```css
@media (max-width: 760px) {
  .side-panel {
    overflow: visible;
  }

  .chat-section {
    min-height: 360px;
  }
}
```

- [ ] **Step 6: Run UI tests and build**

Run:

```bash
npm test -- tests/roomUi.test.tsx
npm run build
```

Expected: tests pass; build exits 0 with possible Vite Node warning.

---

### Task 4: Admin File Import Parser

**Files:**
- Create: `src/client/puzzleFileImport.ts`
- Create: `tests/puzzleFileImport.test.ts`

**Interfaces:**
- Produces:
  - `type ParsedPuzzleFileItem = { rawText: string; sourceTitle?: string; sourceUrl?: string }`
  - `parsePuzzleFileContent(input: { filename: string; content: string }): ParsedPuzzleFileItem[]`
- Supported formats:
  - `.txt`: split records by blank lines that contain at least one non-empty line.
  - `.md`: if a markdown table with `标题/汤面/汤底/来源` columns exists, convert each row into one raw text item; otherwise use `.txt` behavior.
  - `.csv`: parse simple quoted CSV with headers `title,surface,truth,sourceTitle,sourceUrl` or Chinese equivalents `标题,汤面,汤底,来源标题,来源URL`.

- [ ] **Step 1: Write failing parser tests**

Create `tests/puzzleFileImport.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parsePuzzleFileContent } from "../src/client/puzzleFileImport";

describe("parsePuzzleFileContent", () => {
  it("splits txt files by blank lines", () => {
    expect(
      parsePuzzleFileContent({
        filename: "puzzles.txt",
        content: "标题：A\n汤面：一\n汤底：二\n\n标题：B\n汤面：三\n汤底：四"
      }).map((item) => item.rawText)
    ).toEqual(["标题：A\n汤面：一\n汤底：二", "标题：B\n汤面：三\n汤底：四"]);
  });

  it("parses markdown table rows into raw import text", () => {
    const items = parsePuzzleFileContent({
      filename: "puzzles.md",
      content: [
        "| # | 标题 | 汤面 | 汤底 | 来源 |",
        "|---:|---|---|---|---|",
        "| 1 | 《冷掉的水》 | 男人喝冷水后报警。 | 热水变冷，住所被入侵。 | [来源A](https://example.test/a) |"
      ].join("\n")
    });

    expect(items).toHaveLength(1);
    expect(items[0].rawText).toContain("标题：冷掉的水");
    expect(items[0].rawText).toContain("汤底：热水变冷");
    expect(items[0].sourceTitle).toBe("来源A");
    expect(items[0].sourceUrl).toBe("https://example.test/a");
  });

  it("parses simple csv rows", () => {
    const items = parsePuzzleFileContent({
      filename: "puzzles.csv",
      content: [
        "标题,汤面,汤底,来源标题,来源URL",
        "冷掉的水,男人喝冷水后报警。,热水变冷，住所被入侵。,测试来源,https://example.test"
      ].join("\n")
    });

    expect(items).toEqual([
      {
        rawText: "标题：冷掉的水\n汤面：男人喝冷水后报警。\n汤底：热水变冷，住所被入侵。",
        sourceTitle: "测试来源",
        sourceUrl: "https://example.test"
      }
    ]);
  });
});
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```bash
npm test -- tests/puzzleFileImport.test.ts
```

Expected: fail because parser file does not exist.

- [ ] **Step 3: Implement parser**

Create `src/client/puzzleFileImport.ts` with pure functions:

```typescript
export interface ParsedPuzzleFileItem {
  rawText: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

function cleanCell(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/^《(.+)》$/, "$1")
    .trim();
}

function splitTxt(content: string): ParsedPuzzleFileItem[] {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((rawText) => ({ rawText }));
}

function parseSource(value: string) {
  const cleaned = cleanCell(value);
  const match = cleaned.match(/^\[([^\]]+)]\(([^)]+)\)$/);
  if (!match) return { sourceTitle: cleaned || undefined, sourceUrl: undefined };
  return { sourceTitle: match[1].trim(), sourceUrl: match[2].trim() || undefined };
}

function splitMarkdownRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed.slice(1, -1).split("|").map(cleanCell);
}

function parseMarkdownTable(content: string): ParsedPuzzleFileItem[] {
  const rows: ParsedPuzzleFileItem[] = [];
  for (const line of content.split(/\r?\n/)) {
    const cells = splitMarkdownRow(line);
    if (cells.length < 4) continue;
    if (cells[0] === "#" || cells[0].startsWith("---")) continue;
    const index = Number.parseInt(cells[0], 10);
    if (!Number.isFinite(index)) continue;
    const [title, surface, truth, source] = [cells[1], cells[2], cells[3], cells[4] ?? ""];
    const parsedSource = parseSource(source);
    rows.push({
      rawText: [`标题：${title}`, `汤面：${surface}`, `汤底：${truth}`].join("\n"),
      sourceTitle: parsedSource.sourceTitle,
      sourceUrl: parsedSource.sourceUrl
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cleanCell(current));
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(cleanCell(current));
  return cells;
}

function getField(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

function parseCsv(content: string): ParsedPuzzleFileItem[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim());
  const headers = splitCsvLine(lines[0] ?? "");
  return lines.slice(1).map(splitCsvLine).map((cells) => {
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const title = getField(row, ["title", "标题"]);
    const surface = getField(row, ["surface", "汤面"]);
    const truth = getField(row, ["truth", "汤底"]);
    return {
      rawText: [`标题：${title}`, `汤面：${surface}`, `汤底：${truth}`].join("\n"),
      sourceTitle: getField(row, ["sourceTitle", "来源标题"]) || undefined,
      sourceUrl: getField(row, ["sourceUrl", "来源URL", "来源 URL"]) || undefined
    };
  }).filter((item) => item.rawText.replace(/标题：|汤面：|汤底：|\n/g, "").trim());
}

export function parsePuzzleFileContent(input: { filename: string; content: string }): ParsedPuzzleFileItem[] {
  const filename = input.filename.toLowerCase();
  if (filename.endsWith(".csv")) return parseCsv(input.content);
  if (filename.endsWith(".md") || filename.endsWith(".markdown")) {
    const tableRows = parseMarkdownTable(input.content);
    return tableRows.length > 0 ? tableRows : splitTxt(input.content);
  }
  return splitTxt(input.content);
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
npm test -- tests/puzzleFileImport.test.ts
```

Expected: pass.

---

### Task 5: Admin Batch Import API and UI

**Files:**
- Modify: `server/adminPuzzleRoutes.ts`
- Modify: `src/client/adminPuzzles.ts`
- Modify: `src/components/AdminPage.tsx`
- Modify: `tests/adminPuzzleRoutes.test.ts`
- Modify: `tests/adminPageUi.test.tsx`

**Interfaces:**
- Consumes Task 4 `parsePuzzleFileContent`.
- Produces API:
  - `POST /api/admin/puzzles/import-batch`
  - body: `{ items: Array<{ rawText: string; sourceTitle?: string; sourceUrl?: string }> }`
  - response: `{ imported: ManagedPuzzle[]; failed: Array<{ index: number; message: string }> }`
- Produces client function:
  - `importAdminPuzzleBatch(items, options): Promise<AdminBatchImportResult>`

- [ ] **Step 1: Add failing route test**

Append to `tests/adminPuzzleRoutes.test.ts`:

```typescript
it("imports multiple raw puzzle items into the review queue", async () => {
  const repository = createPuzzleRepository(makeDb());
  const app = createApp(repository);

  const response = await request(app)
    .post("/api/admin/puzzles/import-batch")
    .send({
      items: [
        { rawText: "标题：A\n汤面：一\n汤底：二", sourceTitle: "文件A" },
        { rawText: "标题：B\n汤面：三\n汤底：四", sourceTitle: "文件B" }
      ]
    });

  expect(response.status).toBe(201);
  expect(response.body.imported).toHaveLength(2);
  expect(repository.listManaged("draft").length + repository.listManaged("reviewing").length).toBeGreaterThanOrEqual(2);
});
```

Use the existing test helpers in that file; if helper names differ, keep the same structure and adapt only names.

- [ ] **Step 2: Run route test and verify it fails**

Run:

```bash
npm test -- tests/adminPuzzleRoutes.test.ts
```

Expected: fail with 404 for `/import-batch`.

- [ ] **Step 3: Implement batch route**

In `server/adminPuzzleRoutes.ts`, add schema:

```typescript
const ImportBatchSchema = z.object({
  items: z.array(z.object({
    rawText: z.string().trim().min(1).max(10000),
    sourceTitle: z.string().trim().max(160).optional(),
    sourceUrl: z.string().trim().url().optional().or(z.literal(""))
  })).min(1).max(100)
});
```

Add helper:

```typescript
export async function importBatchWithAi(repository: PuzzleRepository, input: unknown) {
  const parsed = ImportBatchSchema.parse(input);
  const imported: ManagedPuzzle[] = [];
  const failed: Array<{ index: number; message: string }> = [];

  for (let index = 0; index < parsed.items.length; index += 1) {
    const item = parsed.items[index];
    try {
      imported.push(await importTextWithAi(repository, {
        rawText: item.rawText,
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl || undefined
      }));
    } catch (error) {
      failed.push({ index, message: error instanceof Error ? error.message : "导入失败" });
    }
  }

  return { imported, failed };
}
```

Add route before `/:id` routes:

```typescript
router.post("/puzzles/import-batch", async (request, response) => {
  try {
    response.status(201).json(await importBatchWithAi(repository, request.body));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "批量导入失败" });
  }
});
```

- [ ] **Step 4: Add client function**

In `src/client/adminPuzzles.ts`, add:

```typescript
export interface AdminBatchImportItem {
  rawText: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

export interface AdminBatchImportResult {
  imported: ManagedPuzzle[];
  failed: Array<{ index: number; message: string }>;
}

export async function importAdminPuzzleBatch(
  items: AdminBatchImportItem[],
  options: AdminRequestOptions = {}
): Promise<AdminBatchImportResult> {
  return adminRequest<AdminBatchImportResult>("/api/admin/puzzles/import-batch", {
    method: "POST",
    token: options.token,
    body: JSON.stringify({ items })
  });
}
```

If the local helper signatures differ, match the existing `importAdminPuzzleText` style exactly.

- [ ] **Step 5: Add AdminPage static UI test**

Append to `tests/adminPageUi.test.tsx`:

```typescript
it("renders file import controls", () => {
  const markup = renderToStaticMarkup(
    <AdminPage initialPuzzles={[makePuzzle()]} disableInitialLoad />
  );

  expect(markup).toContain("文件导入");
  expect(markup).toContain("选择文件");
  expect(markup).toContain("支持 .txt/.md/.csv");
});
```

- [ ] **Step 6: Run admin UI test and verify it fails**

Run:

```bash
npm test -- tests/adminPageUi.test.tsx
```

Expected: fail because file import controls are absent.

- [ ] **Step 7: Implement AdminPage file import controls**

In `src/components/AdminPage.tsx`:

Add imports:

```typescript
import { parsePuzzleFileContent, type ParsedPuzzleFileItem } from "../client/puzzleFileImport";
import { importAdminPuzzleBatch } from "../client/adminPuzzles";
```

Add state:

```typescript
const [fileItems, setFileItems] = useState<ParsedPuzzleFileItem[]>([]);
const [fileImportName, setFileImportName] = useState("");
```

Add handler:

```typescript
async function chooseImportFile(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) return;
  const content = await file.text();
  const items = parsePuzzleFileContent({ filename: file.name, content });
  setFileImportName(file.name);
  setFileItems(items);
  setMessage(items.length > 0 ? `已解析 ${items.length} 条，确认后导入` : "没有解析到可导入题目");
}
```

Add submit:

```typescript
async function importFileItems() {
  if (fileItems.length === 0) {
    setMessage("请先选择文件");
    return;
  }
  setIsBusy(true);
  setMessage("正在批量导入...");
  try {
    const result = await importAdminPuzzleBatch(fileItems, { token: token.trim() || undefined });
    setPuzzles((current) => [
      ...result.imported,
      ...current.filter((item) => !result.imported.some((imported) => imported.id === item.id))
    ]);
    setSelectedId(result.imported[0]?.id ?? selectedId);
    setFileItems([]);
    setMessage(`已导入 ${result.imported.length} 条，失败 ${result.failed.length} 条`);
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setIsBusy(false);
  }
}
```

Render a panel next to or below raw import:

```tsx
<section className="admin-import-panel admin-file-import-panel">
  <div>
    <h2>文件导入</h2>
    <p>支持 .txt/.md/.csv，解析后进入审核队列。</p>
  </div>
  <div className="admin-file-import-form">
    <label className="ghost-button">
      <DownloadCloud size={16} /> 选择文件
      <input type="file" accept=".txt,.md,.markdown,.csv" onChange={chooseImportFile} hidden />
    </label>
    <span>{fileImportName || "未选择文件"}</span>
    <strong>{fileItems.length > 0 ? `${fileItems.length} 条待导入` : "支持 .txt/.md/.csv"}</strong>
    <button className="primary-button" type="button" onClick={importFileItems} disabled={isBusy || fileItems.length === 0}>
      导入文件题目
    </button>
  </div>
</section>
```

- [ ] **Step 8: Add CSS for file import controls**

Add:

```css
.admin-file-import-form {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
}

.admin-file-import-form span,
.admin-file-import-form strong {
  color: var(--muted);
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .admin-file-import-form {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
```

- [ ] **Step 9: Run route/UI/parser tests and build**

Run:

```bash
npm test -- tests/adminPuzzleRoutes.test.ts tests/adminPageUi.test.tsx tests/puzzleFileImport.test.ts
npm run build
```

Expected: tests pass; build exits 0 with possible Vite Node warning.

---

### Task 6: Weighted Solution Point Parsing

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `server/puzzleImporter.ts`
- Create: `tests/solutionPoints.test.ts`

**Interfaces:**
- Produces:
  - `interface SolutionPointDefinition { id: string; label: string; weight: number; aliases: string[] }`
  - `parseSolutionPointDefinitions(points: string[]): SolutionPointDefinition[]`
- Compatible text forms:
  - Plain old point: `"有人进入房间"` -> equal default weight later normalized by scorer.
  - Weighted point: `"25|intrusion|有人进入房间|有人来过,有人进屋"`
  - Human readable point: `"有人进入房间 :: 25 :: 有人来过 / 有人进屋"`

- [ ] **Step 1: Write failing parser tests**

Create `tests/solutionPoints.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseSolutionPointDefinitions } from "../server/puzzleImporter";

describe("parseSolutionPointDefinitions", () => {
  it("parses old plain solution points with stable ids", () => {
    expect(parseSolutionPointDefinitions(["有人进入房间"])).toEqual([
      {
        id: "point-1",
        label: "有人进入房间",
        weight: 1,
        aliases: []
      }
    ]);
  });

  it("parses pipe weighted solution point definitions", () => {
    expect(parseSolutionPointDefinitions(["25|intrusion|有人进入房间|有人来过,有人进屋"])).toEqual([
      {
        id: "intrusion",
        label: "有人进入房间",
        weight: 25,
        aliases: ["有人来过", "有人进屋"]
      }
    ]);
  });

  it("parses human readable weighted point definitions", () => {
    expect(parseSolutionPointDefinitions(["有人替换或动过杯中液体 :: 25 :: 换水 / 动过水"])).toEqual([
      {
        id: "point-1",
        label: "有人替换或动过杯中液体",
        weight: 25,
        aliases: ["换水", "动过水"]
      }
    ]);
  });
});
```

- [ ] **Step 2: Run parser test and verify it fails**

Run:

```bash
npm test -- tests/solutionPoints.test.ts
```

Expected: fail because `parseSolutionPointDefinitions` does not exist.

- [ ] **Step 3: Add optional types**

In `src/shared/types.ts`, add:

```typescript
export interface SolutionPointDefinition {
  id: string;
  label: string;
  weight: number;
  aliases: string[];
}
```

Add optional host answer fields:

```typescript
coveredPointIds?: string[];
coverageConfidence?: number;
```

to `HostAnswer`.

- [ ] **Step 4: Implement parser in `server/puzzleImporter.ts`**

Add:

```typescript
import type { Difficulty, ManagedPuzzle, SolutionPointDefinition } from "../src/shared/types";
```

Replace the existing import line accordingly.

Add functions:

```typescript
function splitAliases(value: string) {
  return value.split(/[,，/、]/).map((item) => item.trim()).filter(Boolean);
}

export function parseSolutionPointDefinitions(points: string[]): SolutionPointDefinition[] {
  return points.map((rawPoint, index) => {
    const raw = rawPoint.trim();
    const pipeParts = raw.split("|").map((part) => part.trim());
    if (pipeParts.length >= 3 && Number.isFinite(Number(pipeParts[0]))) {
      return {
        weight: Number(pipeParts[0]),
        id: pipeParts[1] || `point-${index + 1}`,
        label: pipeParts[2],
        aliases: splitAliases(pipeParts[3] ?? "")
      };
    }

    const readableParts = raw.split("::").map((part) => part.trim());
    if (readableParts.length >= 2 && Number.isFinite(Number(readableParts[1]))) {
      return {
        id: `point-${index + 1}`,
        label: readableParts[0],
        weight: Number(readableParts[1]),
        aliases: splitAliases(readableParts[2] ?? "")
      };
    }

    return {
      id: `point-${index + 1}`,
      label: raw,
      weight: 1,
      aliases: []
    };
  }).filter((point) => point.label);
}
```

- [ ] **Step 5: Run parser test**

Run:

```bash
npm test -- tests/solutionPoints.test.ts
```

Expected: pass.

---

### Task 7: Structured Host Scoring and Room Progress

**Files:**
- Modify: `server/aiHost.ts`
- Modify: `server/roomStore.ts`
- Modify: `tests/aiHost.test.ts`
- Modify: `tests/roomStore.test.ts`

**Interfaces:**
- Consumes Task 6 `parseSolutionPointDefinitions`.
- Produces host decision:
  - `coveredPointIds: string[]`
  - `coverageConfidence: number`
  - `progress` retained for provider fallback.
- Scoring rule:
  - If `coveredPointIds` is present, compute progress from unique covered point weights.
  - Normalize weights to 100 if total weights are not exactly 100.
  - Never reduce room progress.
  - If no `coveredPointIds`, preserve existing `Math.max(previousProgress, decision.progress)` behavior.

- [ ] **Step 1: Add failing parseHostResponse test**

Append to `tests/aiHost.test.ts`:

```typescript
it("parses covered solution point ids from structured host JSON", () => {
  const result = parseHostResponse(
    '{"answerType":"partial","answer":"覆盖了入侵方向。","progress":50,"coveredPointIds":["intrusion","liquid-tampered"],"coverageConfidence":0.82}'
  );

  expect(result).toEqual({
    answerType: "partial",
    answer: "覆盖了入侵方向。",
    progress: 50,
    coveredPointIds: ["intrusion", "liquid-tampered"],
    coverageConfidence: 0.82
  });
});
```

- [ ] **Step 2: Add failing room progress test**

Append to `tests/roomStore.test.ts`:

```typescript
it("computes progress from weighted covered solution points", () => {
  const { room, playerId } = createRoom(
    {
      ...seedPuzzles[1],
      solutionPoints: [
        "25|water-state|杯中液体状态异常|水变冷,原本是热水",
        "15|cup-position|杯子位置没有明显变化|杯子没动",
        "25|intrusion|有人进入房间|有人来过,有人进屋",
        "25|liquid-tampered|有人替换或动过杯中液体|换水,动过水",
        "10|realization|男人意识到住所被入侵|报警原因"
      ]
    },
    "房主"
  );

  addHostAnswer(room.id, {
    playerId,
    playerName: "房主",
    question: "有人进来换了水，所以他知道家里被闯入？",
    answerType: "partial",
    answer: "方向很接近。",
    progress: 0,
    coveredPointIds: ["intrusion", "liquid-tampered", "realization"],
    coverageConfidence: 0.9
  });

  expect(getRoom(room.id)?.progress).toBe(60);
});
```

If TypeScript complains before Task 6 fields exist, complete Task 6 first.

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
npm test -- tests/aiHost.test.ts tests/roomStore.test.ts
```

Expected: fail because parser and room progress do not use covered point IDs yet.

- [ ] **Step 4: Extend host response schema**

In `server/aiHost.ts`, update schema:

```typescript
const HostDecisionSchema = z.object({
  answerType: z.enum(["yes", "no", "irrelevant", "partial", "solved", "unsolved"]),
  answer: z.string().min(1).max(240),
  progress: z.number().min(0).max(100).default(0),
  coveredPointIds: z.array(z.string()).default([]),
  coverageConfidence: z.number().min(0).max(1).default(0)
});
```

Update `HostDecision`:

```typescript
coveredPointIds?: string[];
coverageConfidence?: number;
```

Update fallback parse:

```typescript
coveredPointIds: Array.isArray(fallback.coveredPointIds) ? fallback.coveredPointIds.map(String) : [],
coverageConfidence: Math.max(0, Math.min(1, Number(fallback.coverageConfidence) || 0))
```

Update non-JSON fallback with empty coverage.

- [ ] **Step 5: Update host prompt to request point IDs**

In `buildHostPrompt`, import and use `parseSolutionPointDefinitions`:

```typescript
import { parseSolutionPointDefinitions } from "./puzzleImporter";
```

Add before return:

```typescript
const pointDefinitions = parseSolutionPointDefinitions(input.puzzle.solutionPoints);
```

Change user content key point line:

```typescript
`关键点：${pointDefinitions.map((point) => `${point.id}=${point.label}(${point.weight})${point.aliases.length ? ` 同义:${point.aliases.join("/")}` : ""}`).join("；")}`,
```

Change system JSON format line:

```typescript
"JSON 格式：{\"answerType\":\"yes|no|irrelevant|partial|solved|unsolved\",\"answer\":\"一句中文回答\",\"progress\":0,\"coveredPointIds\":[\"point-id\"],\"coverageConfidence\":0}"
```

Add rule:

```typescript
"coveredPointIds 只能填写玩家已经明确覆盖的关键点 id，不能因为接近就提前填写。"
```

- [ ] **Step 6: Compute weighted progress in `roomStore`**

In `server/roomStore.ts`, import:

```typescript
import { parseSolutionPointDefinitions } from "./puzzleImporter";
```

Extend the `addHostAnswer` input type to omit the new optional fields correctly by relying on `HostAnswer`.

Add helper:

```typescript
function progressFromCoveredPoints(puzzle: Puzzle, coveredPointIds?: string[]) {
  if (!coveredPointIds || coveredPointIds.length === 0) return undefined;
  const definitions = parseSolutionPointDefinitions(puzzle.solutionPoints);
  const totalWeight = definitions.reduce((sum, point) => sum + Math.max(point.weight, 0), 0);
  if (totalWeight <= 0) return undefined;
  const covered = new Set(coveredPointIds);
  const coveredWeight = definitions
    .filter((point) => covered.has(point.id))
    .reduce((sum, point) => sum + Math.max(point.weight, 0), 0);
  return clampProgress((coveredWeight / totalWeight) * 100);
}
```

Change progress calculation:

```typescript
const structuredProgress = progressFromCoveredPoints(room.puzzle, answer.coveredPointIds);
const reportedProgress = structuredProgress ?? answer.progress;
const nextProgress = Math.max(previousProgress, clampProgress(reportedProgress));
```

Make `item` retain fields:

```typescript
coveredPointIds: answer.coveredPointIds ?? [],
coverageConfidence: answer.coverageConfidence ?? 0,
```

- [ ] **Step 7: Run scoring tests**

Run:

```bash
npm test -- tests/aiHost.test.ts tests/roomStore.test.ts tests/solutionPoints.test.ts
```

Expected: pass.

---

### Task 8: Update Cold Cup Key Points and Admin Prompt

**Files:**
- Modify: `src/data/seedPuzzles.ts`
- Modify: `server/puzzleImporter.ts`
- Modify: `tests/importPuzzlesMd.test.ts`
- Modify: `tests/aiHost.test.ts`

**Interfaces:**
- Consumes Task 6 parser and Task 7 host scoring.
- Produces better default key points for `cold-cup`.

- [ ] **Step 1: Add failing seed puzzle expectation**

Create or append a test in `tests/solutionPoints.test.ts`:

```typescript
import { seedPuzzles } from "../src/data/seedPuzzles";

it("defines cold cup as weighted non-duplicative solution points", () => {
  const coldCup = seedPuzzles.find((puzzle) => puzzle.id === "cold-cup");
  expect(coldCup?.solutionPoints).toEqual([
    "25|water-state|杯中液体状态异常|水变冷,原本是热水",
    "15|cup-position|杯子位置没有明显变化|杯子没动,位置没变",
    "25|intrusion|有人进入房间|有人来过,有人进屋",
    "25|liquid-tampered|有人替换或动过杯中液体|换水,动过水,替换液体",
    "10|realization|男人意识到住所被入侵|报警原因,发现入侵"
  ]);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/solutionPoints.test.ts
```

Expected: fail because `cold-cup` still has old point strings.

- [ ] **Step 3: Update `cold-cup` solution points**

In `src/data/seedPuzzles.ts`, replace `cold-cup.solutionPoints` with:

```typescript
solutionPoints: [
  "25|water-state|杯中液体状态异常|水变冷,原本是热水",
  "15|cup-position|杯子位置没有明显变化|杯子没动,位置没变",
  "25|intrusion|有人进入房间|有人来过,有人进屋",
  "25|liquid-tampered|有人替换或动过杯中液体|换水,动过水,替换液体",
  "10|realization|男人意识到住所被入侵|报警原因,发现入侵"
],
```

- [ ] **Step 4: Update import prompt to avoid duplicate key points**

In `server/puzzleImporter.ts` `buildImportPrompt`, replace:

```typescript
"solutionPoints 是后续 AI 主持评分依据，必须拆成 3 到 8 个关键事实。"
```

with:

```typescript
"solutionPoints 是后续 AI 主持评分依据，必须拆成 3 到 8 个不重复的原子事实。",
"优先输出格式：权重|英文短id|关键事实|同义说法1,同义说法2；所有权重加总建议为 100。",
"不要把同一个事实拆成多个重复点，例如“水原本是热的”和“水变冷”应合并为一个液体状态异常点。"
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test -- tests/solutionPoints.test.ts tests/aiHost.test.ts tests/importPuzzlesMd.test.ts
npm run build
```

Expected: tests pass; build exits 0 with possible Vite Node warning.

---

### Task 9: Final Verification and Manual QA

**Files:**
- No required source edits unless verification reveals issues.

**Interfaces:**
- Verifies all previous tasks.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: all test files pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: exit 0. Record the Vite Node warning if still present.

- [ ] **Step 3: Start local dev server for browser QA**

Run:

```bash
npm run dev
```

Expected: server starts and Vite prints a localhost URL. Keep the session running until manual QA completes.

- [ ] **Step 4: Browser QA**

Use the in-app browser to verify:

- Home page title is `知心李歪聊天室`.
- A created room stores session memory.
- Returning home shows `继续上次房间`.
- Clicking continue rejoins the room.
- Right-side chat stays within its panel after at least 25 messages.
- Chat Enter sends a message.
- Pin button is compact and still adds a case note.
- Admin file import parses `.txt`, `.md`, and `.csv` sample files into pending items.
- Batch import result shows imported count.

- [ ] **Step 5: Stop dev server**

Stop the `npm run dev` session cleanly.

- [ ] **Step 6: Review git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only files in this plan plus existing rename changes are modified.

