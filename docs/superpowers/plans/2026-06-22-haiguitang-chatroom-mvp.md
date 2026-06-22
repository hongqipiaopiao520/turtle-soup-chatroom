# Haiguitang Chatroom MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first playable “题库驱动的多人 AI 海龟汤聊天室” with puzzle browsing, room creation, real-time player chat, AI host Q&A, final guess checking, and a case notebook.

**Architecture:** Create a new TypeScript monorepo-style app in `turtle-soup-chatroom/`. The React/Vite client renders the dark detective-workbench UI; the Express + Socket.IO server owns rooms, player state, AI proxying, and answer parsing so API keys never reach the browser.

**Tech Stack:** React, Vite, TypeScript, Express, Socket.IO, Vitest, Zod, lucide-react, OpenAI-compatible Chat Completions API.

## Global Constraints

- Build the new app in `turtle-soup-chatroom/`; keep `work/LABYRINTH` read-only as a reference.
- Do not copy GPL-3.0 source code from `work/LABYRINTH`; borrow product ideas and interaction patterns only.
- Do not copy puzzle content from `haiguitang.net`; seed puzzles must be original or clearly marked demo content.
- Store AI credentials only in server environment variables: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
- The first version supports anonymous guest users with nicknames, not full accounts.
- Maximum players per room: 10.
- Host answers use only these answer types: `yes`, `no`, `irrelevant`, `partial`, `solved`, `unsolved`.
- UI style: dark detective workbench, dense cards, 8px border radius, no marketing hero as the first screen.

---

## File Structure

- `turtle-soup-chatroom/package.json`: scripts and dependencies.
- `turtle-soup-chatroom/tsconfig.json`: shared TypeScript configuration.
- `turtle-soup-chatroom/vite.config.ts`: Vite and test configuration.
- `turtle-soup-chatroom/index.html`: Vite entry document.
- `turtle-soup-chatroom/.env.example`: required AI server settings.
- `turtle-soup-chatroom/src/main.tsx`: React bootstrap.
- `turtle-soup-chatroom/src/App.tsx`: top-level client router/state coordinator.
- `turtle-soup-chatroom/src/styles.css`: visual system and layout.
- `turtle-soup-chatroom/src/shared/types.ts`: shared domain types.
- `turtle-soup-chatroom/src/shared/puzzleFilters.ts`: search/filter/sort utilities.
- `turtle-soup-chatroom/src/data/seedPuzzles.ts`: original demo puzzle data.
- `turtle-soup-chatroom/src/client/socket.ts`: Socket.IO client factory.
- `turtle-soup-chatroom/src/client/useRoomSocket.ts`: room socket hook and client reducer.
- `turtle-soup-chatroom/src/components/HomePage.tsx`: puzzle list and filters.
- `turtle-soup-chatroom/src/components/PuzzleCard.tsx`: compact puzzle card.
- `turtle-soup-chatroom/src/components/PuzzleDetail.tsx`: puzzle detail view.
- `turtle-soup-chatroom/src/components/RoomPage.tsx`: game room shell.
- `turtle-soup-chatroom/src/components/HostPanel.tsx`: AI host Q&A panel.
- `turtle-soup-chatroom/src/components/SidePanel.tsx`: players, chat, notebook.
- `turtle-soup-chatroom/server/index.ts`: Express and Socket.IO entry.
- `turtle-soup-chatroom/server/roomStore.ts`: in-memory room state and pure room actions.
- `turtle-soup-chatroom/server/aiHost.ts`: AI prompt, fetch call, parsing, fallback.
- `turtle-soup-chatroom/server/socketHandlers.ts`: Socket.IO event wiring.
- `turtle-soup-chatroom/tests/puzzleFilters.test.ts`: filter tests.
- `turtle-soup-chatroom/tests/roomStore.test.ts`: room state tests.
- `turtle-soup-chatroom/tests/aiHost.test.ts`: AI parser and fallback tests.

---

### Task 1: Project Scaffold

**Files:**
- Create: `turtle-soup-chatroom/package.json`
- Create: `turtle-soup-chatroom/tsconfig.json`
- Create: `turtle-soup-chatroom/vite.config.ts`
- Create: `turtle-soup-chatroom/index.html`
- Create: `turtle-soup-chatroom/.env.example`
- Create: `turtle-soup-chatroom/src/main.tsx`
- Create: `turtle-soup-chatroom/src/App.tsx`
- Create: `turtle-soup-chatroom/src/styles.css`

**Interfaces:**
- Produces: `npm run dev`, `npm run server`, `npm run test`, `npm run build`.
- Produces: React root element mounted into `#root`.

- [ ] **Step 1: Create package and config files**

Create `turtle-soup-chatroom/package.json`:

```json
{
  "name": "turtle-soup-chatroom",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run server\" \"vite --host 0.0.0.0\"",
    "server": "tsx watch server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc --noEmit && vite build"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "concurrently": "^9.2.0",
    "express": "^5.1.0",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "socket.io": "^4.8.0",
    "socket.io-client": "^4.8.0",
    "tsx": "^4.20.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.8.0",
    "vite": "^7.0.0",
    "vitest": "^3.2.0"
  }
}
```

Create `turtle-soup-chatroom/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "server", "tests", "vite.config.ts"]
}
```

Create `turtle-soup-chatroom/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:8787",
        ws: true
      },
      "/api": "http://localhost:8787"
    }
  },
  test: {
    environment: "node",
    globals: true
  }
});
```

Create `turtle-soup-chatroom/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>出前一汤聊天室</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `turtle-soup-chatroom/.env.example`:

```bash
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace_me
AI_MODEL=gpt-4.1-mini
PORT=8787
```

- [ ] **Step 2: Create minimal React app**

Create `turtle-soup-chatroom/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `turtle-soup-chatroom/src/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">AI HOSTED TURTLE SOUP</span>
          <h1>出前一汤聊天室</h1>
        </div>
        <span className="status-pill">本地原型</span>
      </header>
      <section className="empty-state">
        <h2>线上海龟汤聊天室 MVP</h2>
        <p>项目骨架已就绪。下一步接入题库、房间和 AI 主持人。</p>
      </section>
    </main>
  );
}
```

Create `turtle-soup-chatroom/src/styles.css`:

```css
:root {
  color-scheme: dark;
  --bg: #111827;
  --panel: #1f2937;
  --panel-2: #263241;
  --border: rgba(255, 255, 255, 0.1);
  --text: #f8fafc;
  --muted: #a7b0bf;
  --blue: #3b82f6;
  --green: #22c55e;
  --orange: #f97316;
  --red: #ef4444;
  font-family: Inter, "Noto Sans SC", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
    var(--bg);
  background-size: 24px 24px;
  color: var(--text);
}

button,
input,
textarea,
select {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 16px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 14px;
}

.topbar h1 {
  margin: 4px 0 0;
  font-size: 24px;
  letter-spacing: 0;
}

.eyebrow {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.status-pill {
  border: 1px solid rgba(34, 197, 94, 0.45);
  border-radius: 999px;
  color: #bbf7d0;
  padding: 6px 10px;
  background: rgba(34, 197, 94, 0.1);
}

.empty-state {
  margin: 48px auto 0;
  max-width: 680px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(31, 41, 55, 0.9);
  padding: 24px;
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
cd turtle-soup-chatroom
npm install
```

Expected: dependencies install successfully and `package-lock.json` is created.

- [ ] **Step 4: Run the build**

Run:

```bash
cd turtle-soup-chatroom
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 5: Commit**

Run only if the workspace is a git repository:

```bash
git add turtle-soup-chatroom
git commit -m "chore: scaffold haiguitang chatroom app"
```

Expected: commit records the initial app scaffold.

---

### Task 2: Shared Domain Types and Puzzle Filtering

**Files:**
- Create: `turtle-soup-chatroom/src/shared/types.ts`
- Create: `turtle-soup-chatroom/src/shared/puzzleFilters.ts`
- Create: `turtle-soup-chatroom/src/data/seedPuzzles.ts`
- Create: `turtle-soup-chatroom/tests/puzzleFilters.test.ts`

**Interfaces:**
- Produces: `Difficulty = "easy" | "medium" | "hard"`.
- Produces: `Puzzle`, `PuzzleSort`, `PuzzleFilters`.
- Produces: `filterPuzzles(puzzles: Puzzle[], filters: PuzzleFilters): Puzzle[]`.
- Consumes: no earlier domain code.

- [ ] **Step 1: Write failing puzzle filter tests**

Create `turtle-soup-chatroom/tests/puzzleFilters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Puzzle } from "../src/shared/types";
import { filterPuzzles } from "../src/shared/puzzleFilters";

const puzzles: Puzzle[] = [
  {
    id: "rain-platform",
    title: "雨夜站台",
    surface: "深夜的站台空无一人，女孩却向空气道谢，然后消失了。",
    truth: "女孩正在参加一次沉浸式告别仪式。",
    difficulty: "medium",
    tags: ["悬疑", "温情"],
    author: "Demo",
    rating: 8.2,
    plays: 42,
    createdAt: "2026-06-01"
  },
  {
    id: "cold-cup",
    title: "冷掉的水",
    surface: "男人喝了一口冷水后立刻报警。",
    truth: "水本应是热的，说明屋里有人刚刚替换过杯子。",
    difficulty: "easy",
    tags: ["本格", "生活"],
    author: "Demo",
    rating: 7.1,
    plays: 88,
    createdAt: "2026-06-10"
  }
];

describe("filterPuzzles", () => {
  it("matches title and surface text", () => {
    const result = filterPuzzles(puzzles, { query: "冷水", sort: "latest" });
    expect(result.map((p) => p.id)).toEqual(["cold-cup"]);
  });

  it("filters by difficulty and tag", () => {
    const result = filterPuzzles(puzzles, {
      difficulty: "medium",
      tag: "温情",
      sort: "latest"
    });
    expect(result.map((p) => p.id)).toEqual(["rain-platform"]);
  });

  it("sorts by hot score using plays first", () => {
    const result = filterPuzzles(puzzles, { sort: "hot" });
    expect(result.map((p) => p.id)).toEqual(["cold-cup", "rain-platform"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd turtle-soup-chatroom
npm run test -- tests/puzzleFilters.test.ts
```

Expected: FAIL because `types.ts` and `puzzleFilters.ts` do not exist.

- [ ] **Step 3: Add shared types**

Create `turtle-soup-chatroom/src/shared/types.ts`:

```ts
export type Difficulty = "easy" | "medium" | "hard";

export type RoomStatus = "waiting" | "playing" | "solved" | "closed";

export type HostAnswerType =
  | "yes"
  | "no"
  | "irrelevant"
  | "partial"
  | "solved"
  | "unsolved";

export interface Puzzle {
  id: string;
  title: string;
  surface: string;
  truth: string;
  difficulty: Difficulty;
  tags: string[];
  author: string;
  rating: number;
  plays: number;
  createdAt: string;
}

export type PuzzleSort = "hot" | "latest" | "rating";

export interface PuzzleFilters {
  query?: string;
  difficulty?: Difficulty | "all";
  tag?: string | "all";
  sort: PuzzleSort;
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
}

export interface HostAnswer {
  id: string;
  playerId: string;
  playerName: string;
  question: string;
  answerType: HostAnswerType;
  answer: string;
  pinned: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  body: string;
  createdAt: string;
}

export interface CaseNote {
  id: string;
  sourceAnswerId?: string;
  body: string;
  createdAt: string;
}

export interface RoomState {
  id: string;
  puzzle: Puzzle;
  status: RoomStatus;
  players: Player[];
  hostLog: HostAnswer[];
  chatMessages: ChatMessage[];
  caseNotes: CaseNote[];
  questionLimit: number;
  questionsUsed: number;
  createdAt: string;
}
```

- [ ] **Step 4: Add filter implementation and seed puzzles**

Create `turtle-soup-chatroom/src/shared/puzzleFilters.ts`:

```ts
import type { Puzzle, PuzzleFilters } from "./types";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function filterPuzzles(puzzles: Puzzle[], filters: PuzzleFilters) {
  const query = normalize(filters.query ?? "");

  const filtered = puzzles.filter((puzzle) => {
    const matchesQuery =
      query.length === 0 ||
      normalize(puzzle.title).includes(query) ||
      normalize(puzzle.surface).includes(query) ||
      normalize(puzzle.author).includes(query);

    const matchesDifficulty =
      !filters.difficulty ||
      filters.difficulty === "all" ||
      puzzle.difficulty === filters.difficulty;

    const matchesTag =
      !filters.tag || filters.tag === "all" || puzzle.tags.includes(filters.tag);

    return matchesQuery && matchesDifficulty && matchesTag;
  });

  return filtered.sort((a, b) => {
    if (filters.sort === "latest") {
      return b.createdAt.localeCompare(a.createdAt);
    }
    if (filters.sort === "rating") {
      return b.rating - a.rating;
    }
    return b.plays - a.plays || b.rating - a.rating;
  });
}

export function collectTags(puzzles: Puzzle[]) {
  return Array.from(new Set(puzzles.flatMap((puzzle) => puzzle.tags))).sort();
}
```

Create `turtle-soup-chatroom/src/data/seedPuzzles.ts`:

```ts
import type { Puzzle } from "../shared/types";

export const seedPuzzles: Puzzle[] = [
  {
    id: "rain-platform",
    title: "雨夜站台",
    surface: "深夜的站台空无一人，女孩却向空气道谢，然后消失了。",
    truth: "女孩正在参加一次沉浸式告别仪式。她感谢的是耳机里播放的父亲生前录音，随后进入后台通道离开，并不是真的消失。",
    difficulty: "medium",
    tags: ["悬疑", "温情", "误导"],
    author: "初版题库",
    rating: 8.2,
    plays: 42,
    createdAt: "2026-06-01"
  },
  {
    id: "cold-cup",
    title: "冷掉的水",
    surface: "男人喝了一口冷水后立刻报警。",
    truth: "他离家前倒的是热水。杯子变冷且位置没变，说明有人进入房间并替换了杯中液体，他意识到独居住所被入侵。",
    difficulty: "easy",
    tags: ["本格", "生活", "入门"],
    author: "初版题库",
    rating: 7.1,
    plays: 88,
    createdAt: "2026-06-10"
  },
  {
    id: "silent-elevator",
    title: "安静电梯",
    surface: "电梯里所有人都沉默着，门开后，只有一个人尖叫起来。",
    truth: "那个人是电梯维修员。他刚修好一台本应停运的电梯，却看到里面站满了刚刚失联楼层的人，意识到事故并未结束。",
    difficulty: "hard",
    tags: ["恐怖", "悬疑", "建筑"],
    author: "初版题库",
    rating: 8.6,
    plays: 31,
    createdAt: "2026-06-12"
  }
];
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cd turtle-soup-chatroom
npm run test -- tests/puzzleFilters.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run only if the workspace is a git repository:

```bash
git add turtle-soup-chatroom/src/shared turtle-soup-chatroom/src/data turtle-soup-chatroom/tests/puzzleFilters.test.ts
git commit -m "feat: add puzzle domain and filters"
```

Expected: commit records shared domain and filtering logic.

---

### Task 3: Room Store and Server State

**Files:**
- Create: `turtle-soup-chatroom/server/roomStore.ts`
- Create: `turtle-soup-chatroom/tests/roomStore.test.ts`

**Interfaces:**
- Consumes: `Puzzle`, `RoomState`, `HostAnswer`, `ChatMessage` from `src/shared/types.ts`.
- Produces: `createRoom(puzzle: Puzzle, hostName: string): RoomState`.
- Produces: `joinRoom(roomId: string, playerName: string): RoomState`.
- Produces: `addChatMessage(roomId: string, playerId: string, body: string): ChatMessage`.
- Produces: `addHostAnswer(roomId: string, answer: Omit<HostAnswer, "id" | "createdAt" | "pinned">): HostAnswer`.
- Produces: `pinAnswer(roomId: string, answerId: string): RoomState`.

- [ ] **Step 1: Write failing room store tests**

Create `turtle-soup-chatroom/tests/roomStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { seedPuzzles } from "../src/data/seedPuzzles";
import {
  addChatMessage,
  addHostAnswer,
  createRoom,
  getRoom,
  joinRoom,
  pinAnswer,
  resetRooms
} from "../server/roomStore";

describe("roomStore", () => {
  beforeEach(() => resetRooms());

  it("creates a room with a host player", () => {
    const room = createRoom(seedPuzzles[0], "阿汤");
    expect(room.puzzle.id).toBe("rain-platform");
    expect(room.players).toHaveLength(1);
    expect(room.players[0]).toMatchObject({ name: "阿汤", isHost: true });
    expect(room.questionLimit).toBe(20);
  });

  it("allows up to 10 players and rejects the eleventh", () => {
    const room = createRoom(seedPuzzles[0], "房主");
    for (let i = 0; i < 9; i += 1) {
      joinRoom(room.id, `玩家${i}`);
    }
    expect(() => joinRoom(room.id, "第十一人")).toThrow("房间已满");
  });

  it("adds chat and pinned host answers", () => {
    const room = createRoom(seedPuzzles[0], "房主");
    const playerId = room.players[0].id;
    const chat = addChatMessage(room.id, playerId, "先确认人物关系");
    expect(chat.body).toBe("先确认人物关系");

    const answer = addHostAnswer(room.id, {
      playerId,
      playerName: "房主",
      question: "女孩真的消失了吗？",
      answerType: "no",
      answer: "不是。",
    });
    const updated = pinAnswer(room.id, answer.id);
    expect(updated.caseNotes[0].body).toContain("女孩真的消失了吗？");
    expect(getRoom(room.id)?.hostLog[0].pinned).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd turtle-soup-chatroom
npm run test -- tests/roomStore.test.ts
```

Expected: FAIL because `server/roomStore.ts` does not exist.

- [ ] **Step 3: Implement room store**

Create `turtle-soup-chatroom/server/roomStore.ts`:

```ts
import type {
  CaseNote,
  ChatMessage,
  HostAnswer,
  Player,
  Puzzle,
  RoomState
} from "../src/shared/types";

const rooms = new Map<string, RoomState>();

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function now() {
  return new Date().toISOString();
}

function requireRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error("房间不存在");
  }
  return room;
}

function requirePlayer(room: RoomState, playerId: string) {
  const player = room.players.find((item) => item.id === playerId);
  if (!player) {
    throw new Error("玩家不在房间内");
  }
  return player;
}

export function resetRooms() {
  rooms.clear();
}

export function listRooms() {
  return Array.from(rooms.values());
}

export function getRoom(roomId: string) {
  return rooms.get(roomId);
}

export function createRoom(puzzle: Puzzle, hostName: string): RoomState {
  const host: Player = {
    id: id("player"),
    name: hostName.trim() || "访客",
    isHost: true,
    joinedAt: now()
  };

  const room: RoomState = {
    id: id("room"),
    puzzle,
    status: "playing",
    players: [host],
    hostLog: [],
    chatMessages: [],
    caseNotes: [],
    questionLimit: 20,
    questionsUsed: 0,
    createdAt: now()
  };

  rooms.set(room.id, room);
  return room;
}

export function joinRoom(roomId: string, playerName: string): RoomState {
  const room = requireRoom(roomId);
  if (room.players.length >= 10) {
    throw new Error("房间已满");
  }

  const player: Player = {
    id: id("player"),
    name: playerName.trim() || "访客",
    isHost: false,
    joinedAt: now()
  };

  room.players.push(player);
  return room;
}

export function removePlayer(roomId: string, playerId: string): RoomState {
  const room = requireRoom(roomId);
  room.players = room.players.filter((player) => player.id !== playerId);
  if (room.players.length === 0) {
    rooms.delete(roomId);
  }
  return room;
}

export function addChatMessage(roomId: string, playerId: string, body: string): ChatMessage {
  const room = requireRoom(roomId);
  const player = requirePlayer(room, playerId);
  const message: ChatMessage = {
    id: id("chat"),
    playerId,
    playerName: player.name,
    body: body.slice(0, 500),
    createdAt: now()
  };
  room.chatMessages.push(message);
  return message;
}

export function addHostAnswer(
  roomId: string,
  answer: Omit<HostAnswer, "id" | "createdAt" | "pinned">
): HostAnswer {
  const room = requireRoom(roomId);
  if (room.questionsUsed >= room.questionLimit && answer.answerType !== "solved") {
    throw new Error("提问次数已用完");
  }

  const item: HostAnswer = {
    ...answer,
    id: id("answer"),
    pinned: false,
    createdAt: now()
  };

  room.hostLog.push(item);
  if (answer.answerType !== "solved" && answer.answerType !== "unsolved") {
    room.questionsUsed += 1;
  }
  if (answer.answerType === "solved") {
    room.status = "solved";
  }
  return item;
}

export function pinAnswer(roomId: string, answerId: string): RoomState {
  const room = requireRoom(roomId);
  const answer = room.hostLog.find((item) => item.id === answerId);
  if (!answer) {
    throw new Error("问答不存在");
  }

  answer.pinned = true;
  const note: CaseNote = {
    id: id("note"),
    sourceAnswerId: answerId,
    body: `Q: ${answer.question}\nA: ${answer.answer}`,
    createdAt: now()
  };
  room.caseNotes.push(note);
  return room;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd turtle-soup-chatroom
npm run test -- tests/roomStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run only if the workspace is a git repository:

```bash
git add turtle-soup-chatroom/server/roomStore.ts turtle-soup-chatroom/tests/roomStore.test.ts
git commit -m "feat: add in-memory room store"
```

Expected: commit records room state behavior.

---

### Task 4: AI Host Service

**Files:**
- Create: `turtle-soup-chatroom/server/aiHost.ts`
- Create: `turtle-soup-chatroom/tests/aiHost.test.ts`

**Interfaces:**
- Consumes: `Puzzle`, `HostAnswerType`.
- Produces: `parseHostResponse(raw: string): { answerType: HostAnswerType; answer: string }`.
- Produces: `askHost(input: AskHostInput): Promise<HostDecision>`.
- Produces: `buildHostPrompt(input: AskHostInput): Array<{ role: "system" | "user"; content: string }>`.

- [ ] **Step 1: Write failing AI parser tests**

Create `turtle-soup-chatroom/tests/aiHost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseHostResponse } from "../server/aiHost";

describe("parseHostResponse", () => {
  it("parses structured host JSON", () => {
    const result = parseHostResponse('{"answerType":"yes","answer":"是。这个方向有帮助。"}');
    expect(result).toEqual({
      answerType: "yes",
      answer: "是。这个方向有帮助。"
    });
  });

  it("falls back to partial for non-json model output", () => {
    const result = parseHostResponse("也许有关，但不能直接确认。");
    expect(result.answerType).toBe("partial");
    expect(result.answer).toContain("也许有关");
  });

  it("rejects unknown answer types", () => {
    const result = parseHostResponse('{"answerType":"maybe","answer":"不知道"}');
    expect(result.answerType).toBe("partial");
    expect(result.answer).toBe("不知道");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd turtle-soup-chatroom
npm run test -- tests/aiHost.test.ts
```

Expected: FAIL because `server/aiHost.ts` does not exist.

- [ ] **Step 3: Implement AI host parser and prompt**

Create `turtle-soup-chatroom/server/aiHost.ts`:

```ts
import { z } from "zod";
import type { HostAnswerType, Puzzle } from "../src/shared/types";

const HostDecisionSchema = z.object({
  answerType: z.enum(["yes", "no", "irrelevant", "partial", "solved", "unsolved"]),
  answer: z.string().min(1).max(240)
});

export interface AskHostInput {
  puzzle: Puzzle;
  history: Array<{ question: string; answer: string }>;
  question: string;
  mode: "question" | "guess";
}

export interface HostDecision {
  answerType: HostAnswerType;
  answer: string;
}

export function parseHostResponse(raw: string): HostDecision {
  try {
    const parsed = HostDecisionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }

    const fallback = JSON.parse(raw) as { answer?: unknown };
    return {
      answerType: "partial",
      answer: String(fallback.answer || raw).slice(0, 240)
    };
  } catch {
    return {
      answerType: "partial",
      answer: raw.slice(0, 240)
    };
  }
}

export function buildHostPrompt(input: AskHostInput) {
  const modeRule =
    input.mode === "guess"
      ? "玩家正在提交最终推理。判断是否已经覆盖汤底关键事实。"
      : "玩家正在普通提问。只能回答是、不是、无关或部分相关，不要泄露汤底。";

  return [
    {
      role: "system" as const,
      content: [
        "你是线上海龟汤游戏的 AI 主持人。",
        "你必须严格基于汤底回答，不能编造新事实。",
        "普通提问只允许 answerType 为 yes、no、irrelevant、partial。",
        "最终推理只允许 answerType 为 solved 或 unsolved。",
        "输出必须是 JSON，不要 Markdown，不要额外解释。",
        "JSON 格式：{\"answerType\":\"yes|no|irrelevant|partial|solved|unsolved\",\"answer\":\"一句中文回答\"}"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `汤面：${input.puzzle.surface}`,
        `汤底：${input.puzzle.truth}`,
        `历史问答：${input.history.map((item) => `Q:${item.question} A:${item.answer}`).join("\n") || "暂无"}`,
        `规则：${modeRule}`,
        `玩家输入：${input.question}`
      ].join("\n\n")
    }
  ];
}

export async function askHost(input: AskHostInput): Promise<HostDecision> {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return {
      answerType: "partial",
      answer: "AI 主持人尚未配置。请在服务端设置 AI_BASE_URL、AI_API_KEY 和 AI_MODEL。"
    };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: buildHostPrompt(input)
    })
  });

  if (!response.ok) {
    return {
      answerType: "partial",
      answer: `汤仙人暂时走神了，请稍后重试。（${response.status}）`
    };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseHostResponse(payload.choices?.[0]?.message?.content || "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd turtle-soup-chatroom
npm run test -- tests/aiHost.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run only if the workspace is a git repository:

```bash
git add turtle-soup-chatroom/server/aiHost.ts turtle-soup-chatroom/tests/aiHost.test.ts
git commit -m "feat: add ai host parser and prompt"
```

Expected: commit records AI host behavior.

---

### Task 5: Socket.IO Server

**Files:**
- Create: `turtle-soup-chatroom/server/index.ts`
- Create: `turtle-soup-chatroom/server/socketHandlers.ts`
- Modify: `turtle-soup-chatroom/server/roomStore.ts`

**Interfaces:**
- Consumes: `createRoom`, `joinRoom`, `addChatMessage`, `addHostAnswer`, `pinAnswer`.
- Consumes: `askHost`.
- Produces Socket events:
  - Client emits `room:create` with `{ puzzleId: string; playerName: string }`.
  - Client emits `room:join` with `{ roomId: string; playerName: string }`.
  - Client emits `chat:send` with `{ roomId: string; playerId: string; body: string }`.
  - Client emits `host:ask` with `{ roomId: string; playerId: string; question: string; mode: "question" | "guess" }`.
  - Client emits `case:pin` with `{ roomId: string; answerId: string }`.
  - Server emits `room:state` with `RoomState`.
  - Server emits `server:error` with `{ message: string }`.

- [ ] **Step 1: Add server entry**

Create `turtle-soup-chatroom/server/index.ts`:

```ts
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { registerSocketHandlers } from "./socketHandlers";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true
  }
});

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/puzzles", (_request, response) => {
  response.json(seedPuzzles.map(({ truth, ...publicPuzzle }) => publicPuzzle));
});

registerSocketHandlers(io);

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  console.log(`Haiguitang chatroom server listening on http://localhost:${port}`);
});
```

- [ ] **Step 2: Add socket handlers**

Create `turtle-soup-chatroom/server/socketHandlers.ts`:

```ts
import type { Server, Socket } from "socket.io";
import { seedPuzzles } from "../src/data/seedPuzzles";
import { askHost } from "./aiHost";
import {
  addChatMessage,
  addHostAnswer,
  createRoom,
  getRoom,
  joinRoom,
  pinAnswer,
  removePlayer
} from "./roomStore";

function emitError(socket: Socket, error: unknown) {
  socket.emit("server:error", {
    message: error instanceof Error ? error.message : "未知错误"
  });
}

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    socket.on("room:create", ({ puzzleId, playerName }) => {
      try {
        const puzzle = seedPuzzles.find((item) => item.id === puzzleId);
        if (!puzzle) throw new Error("题目不存在");
        const room = createRoom(puzzle, playerName);
        socket.join(room.id);
        socket.emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:join", ({ roomId, playerName }) => {
      try {
        const room = joinRoom(roomId, playerName);
        socket.join(room.id);
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("chat:send", ({ roomId, playerId, body }) => {
      try {
        addChatMessage(roomId, playerId, body);
        const room = getRoom(roomId);
        if (room) io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("host:ask", async ({ roomId, playerId, question, mode }) => {
      try {
        const room = getRoom(roomId);
        if (!room) throw new Error("房间不存在");
        const player = room.players.find((item) => item.id === playerId);
        if (!player) throw new Error("玩家不在房间内");

        const decision = await askHost({
          puzzle: room.puzzle,
          history: room.hostLog.map((item) => ({
            question: item.question,
            answer: item.answer
          })),
          question,
          mode
        });

        addHostAnswer(roomId, {
          playerId,
          playerName: player.name,
          question,
          answerType: decision.answerType,
          answer: decision.answer
        });

        const updated = getRoom(roomId);
        if (updated) io.to(updated.id).emit("room:state", updated);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("case:pin", ({ roomId, answerId }) => {
      try {
        const room = pinAnswer(roomId, answerId);
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("room:leave", ({ roomId, playerId }) => {
      try {
        const room = removePlayer(roomId, playerId);
        io.to(room.id).emit("room:state", room);
      } catch (error) {
        emitError(socket, error);
      }
    });
  });
}
```

- [ ] **Step 3: Run build**

Run:

```bash
cd turtle-soup-chatroom
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run server smoke check**

Run:

```bash
cd turtle-soup-chatroom
npm run server
```

Expected: console shows `Haiguitang chatroom server listening on http://localhost:8787`.

Stop the server with `Ctrl+C`.

- [ ] **Step 5: Commit**

Run only if the workspace is a git repository:

```bash
git add turtle-soup-chatroom/server
git commit -m "feat: add realtime room server"
```

Expected: commit records Socket.IO server behavior.

---

### Task 6: Client Home and Puzzle Detail

**Files:**
- Modify: `turtle-soup-chatroom/src/App.tsx`
- Modify: `turtle-soup-chatroom/src/styles.css`
- Create: `turtle-soup-chatroom/src/components/HomePage.tsx`
- Create: `turtle-soup-chatroom/src/components/PuzzleCard.tsx`
- Create: `turtle-soup-chatroom/src/components/PuzzleDetail.tsx`
- Create: `turtle-soup-chatroom/src/client/socket.ts`

**Interfaces:**
- Consumes: `seedPuzzles`, `filterPuzzles`, `collectTags`.
- Produces: in-app navigation states `home`, `detail`, `room`.
- Produces: `createSocket()` returning Socket.IO client.

- [ ] **Step 1: Add Socket.IO client factory**

Create `turtle-soup-chatroom/src/client/socket.ts`:

```ts
import { io } from "socket.io-client";

export function createSocket() {
  return io("/", {
    path: "/socket.io",
    autoConnect: true
  });
}
```

- [ ] **Step 2: Add puzzle card**

Create `turtle-soup-chatroom/src/components/PuzzleCard.tsx`:

```tsx
import { Star, Users } from "lucide-react";
import type { Puzzle } from "../shared/types";

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

export function PuzzleCard({
  puzzle,
  onOpen
}: {
  puzzle: Puzzle;
  onOpen: (puzzle: Puzzle) => void;
}) {
  return (
    <button className="puzzle-card" onClick={() => onOpen(puzzle)}>
      <div className="card-head">
        <h3>{puzzle.title}</h3>
        <span className={`difficulty difficulty-${puzzle.difficulty}`}>
          {difficultyLabel[puzzle.difficulty]}
        </span>
      </div>
      <p>{puzzle.surface}</p>
      <div className="tag-row">
        {puzzle.tags.slice(0, 3).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      <div className="card-foot">
        <span>{puzzle.author}</span>
        <span><Star size={14} /> {puzzle.rating.toFixed(1)}</span>
        <span><Users size={14} /> {puzzle.plays}</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Add home page**

Create `turtle-soup-chatroom/src/components/HomePage.tsx`:

```tsx
import { Search, Shuffle, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { seedPuzzles } from "../data/seedPuzzles";
import { collectTags, filterPuzzles } from "../shared/puzzleFilters";
import type { Difficulty, Puzzle, PuzzleSort } from "../shared/types";
import { PuzzleCard } from "./PuzzleCard";

export function HomePage({
  onOpenPuzzle,
  onRandomPuzzle
}: {
  onOpenPuzzle: (puzzle: Puzzle) => void;
  onRandomPuzzle: () => void;
}) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [tag, setTag] = useState<string | "all">("all");
  const [sort, setSort] = useState<PuzzleSort>("hot");

  const tags = useMemo(() => collectTags(seedPuzzles), []);
  const puzzles = useMemo(
    () => filterPuzzles(seedPuzzles, { query, difficulty, tag, sort }),
    [query, difficulty, tag, sort]
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">AI HOSTED TURTLE SOUP</span>
          <h1>出前一汤聊天室</h1>
        </div>
        <div className="top-actions">
          <span className="status-pill">72 今日活跃</span>
          <button className="primary-button" onClick={onRandomPuzzle}>
            <Shuffle size={16} /> 随机一题
          </button>
        </div>
      </header>

      <section className="toolbar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索谜题、作者..."
          />
        </label>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty | "all")}>
          <option value="all">所有难度</option>
          <option value="easy">简单</option>
          <option value="medium">中等</option>
          <option value="hard">困难</option>
        </select>
        <select value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="all">全部标签</option>
          {tags.map((item) => (
            <option value={item} key={item}>{item}</option>
          ))}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as PuzzleSort)}>
          <option value="hot">热门</option>
          <option value="latest">最新</option>
          <option value="rating">评分最高</option>
        </select>
      </section>

      <section className="home-grid">
        <div className="puzzle-list">
          {puzzles.map((puzzle) => (
            <PuzzleCard puzzle={puzzle} onOpen={onOpenPuzzle} key={puzzle.id} />
          ))}
        </div>
        <aside className="activity-panel">
          <h2><Users size={18} /> 茶水间</h2>
          <p>初版先聚焦房间推理。社区动态、排行榜和任务系统会放到后续版本。</p>
        </aside>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Add puzzle detail page**

Create `turtle-soup-chatroom/src/components/PuzzleDetail.tsx`:

```tsx
import { ArrowLeft, Play, Star, Users } from "lucide-react";
import type { Puzzle } from "../shared/types";

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

export function PuzzleDetail({
  puzzle,
  onBack,
  onStart
}: {
  puzzle: Puzzle;
  onBack: () => void;
  onStart: (puzzle: Puzzle) => void;
}) {
  return (
    <main className="app-shell detail-shell">
      <button className="ghost-button" onClick={onBack}>
        <ArrowLeft size={16} /> 返回
      </button>
      <section className="detail-panel">
        <div className="detail-title-row">
          <div>
            <h1>{puzzle.title}</h1>
            <div className="tag-row">
              <span className={`difficulty difficulty-${puzzle.difficulty}`}>
                {difficultyLabel[puzzle.difficulty]}
              </span>
              {puzzle.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          </div>
          <button className="primary-button" onClick={() => onStart(puzzle)}>
            <Play size={16} /> 开始游戏
          </button>
        </div>
        <h2>🍜 汤面</h2>
        <p className="surface-text">{puzzle.surface}</p>
        <div className="stats-grid">
          <span><Star size={16} /> {puzzle.rating.toFixed(1)} / 10</span>
          <span><Users size={16} /> {puzzle.plays} 游玩</span>
          <span>平均提问 12.9 次</span>
          <span>通关率 62%</span>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Wire App navigation**

Replace `turtle-soup-chatroom/src/App.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { HomePage } from "./components/HomePage";
import { PuzzleDetail } from "./components/PuzzleDetail";
import { seedPuzzles } from "./data/seedPuzzles";
import type { Puzzle, RoomState } from "./shared/types";

type View =
  | { name: "home" }
  | { name: "detail"; puzzle: Puzzle }
  | { name: "room"; room: RoomState; playerId: string };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const randomPuzzle = useMemo(
    () => () => {
      const puzzle = seedPuzzles[Math.floor(Math.random() * seedPuzzles.length)];
      setView({ name: "detail", puzzle });
    },
    []
  );

  if (view.name === "detail") {
    return (
      <PuzzleDetail
        puzzle={view.puzzle}
        onBack={() => setView({ name: "home" })}
        onStart={() => alert("房间功能将在下一任务接入")}
      />
    );
  }

  if (view.name === "room") {
    return <div />;
  }

  return (
    <HomePage
      onOpenPuzzle={(puzzle) => setView({ name: "detail", puzzle })}
      onRandomPuzzle={randomPuzzle}
    />
  );
}
```

- [ ] **Step 6: Extend styles**

Append to `turtle-soup-chatroom/src/styles.css`:

```css
.top-actions,
.card-head,
.card-foot,
.detail-title-row,
.stats-grid span,
.ghost-button,
.primary-button {
  display: flex;
  align-items: center;
}

.top-actions {
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.primary-button,
.ghost-button {
  gap: 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
  padding: 10px 12px;
}

.primary-button {
  background: var(--blue);
  border-color: rgba(59, 130, 246, 0.7);
  font-weight: 700;
}

.ghost-button {
  background: rgba(255, 255, 255, 0.04);
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 160px 160px 140px;
  gap: 10px;
  margin: 16px 0;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(31, 41, 55, 0.9);
  padding: 0 10px;
}

.search-box input,
.toolbar select {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  padding: 0 10px;
}

.search-box input {
  border: 0;
  padding: 0;
  outline: 0;
}

.home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
}

.puzzle-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.puzzle-card,
.activity-panel,
.detail-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(31, 41, 55, 0.92);
}

.puzzle-card {
  min-height: 220px;
  padding: 16px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.puzzle-card:hover {
  border-color: rgba(59, 130, 246, 0.55);
}

.card-head {
  justify-content: space-between;
  gap: 10px;
}

.card-head h3 {
  margin: 0;
  font-size: 20px;
}

.puzzle-card p,
.activity-panel p {
  color: var(--muted);
  line-height: 1.7;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0;
}

.tag-row span,
.difficulty {
  border-radius: 999px;
  border: 1px solid var(--border);
  padding: 4px 8px;
  font-size: 12px;
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.12);
}

.difficulty-easy {
  color: #bbf7d0;
  background: rgba(34, 197, 94, 0.12);
}

.difficulty-medium {
  color: #fed7aa;
  background: rgba(249, 115, 22, 0.12);
}

.difficulty-hard {
  color: #fecaca;
  background: rgba(239, 68, 68, 0.12);
}

.card-foot {
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.card-foot span,
.stats-grid span {
  display: inline-flex;
  gap: 5px;
}

.activity-panel {
  padding: 16px;
}

.activity-panel h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 0;
}

.detail-shell {
  max-width: 1100px;
  margin: 0 auto;
}

.detail-panel {
  margin-top: 14px;
  padding: 20px;
}

.detail-title-row {
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.detail-title-row h1 {
  margin: 0;
}

.surface-text {
  color: #e5e7eb;
  line-height: 1.9;
  font-size: 17px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}

.stats-grid span {
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-2);
  padding: 12px;
}

@media (max-width: 900px) {
  .toolbar,
  .home-grid {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 7: Run build**

Run:

```bash
cd turtle-soup-chatroom
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run only if the workspace is a git repository:

```bash
git add turtle-soup-chatroom/src
git commit -m "feat: add puzzle browsing views"
```

Expected: commit records homepage and puzzle detail UI.

---

### Task 7: Client Room Flow

**Files:**
- Modify: `turtle-soup-chatroom/src/App.tsx`
- Create: `turtle-soup-chatroom/src/client/useRoomSocket.ts`
- Create: `turtle-soup-chatroom/src/components/RoomPage.tsx`
- Create: `turtle-soup-chatroom/src/components/HostPanel.tsx`
- Create: `turtle-soup-chatroom/src/components/SidePanel.tsx`
- Modify: `turtle-soup-chatroom/src/styles.css`

**Interfaces:**
- Consumes Socket events from Task 5.
- Produces: `useRoomSocket()` with `createRoom`, `joinRoom`, `sendChat`, `askHost`, `pinAnswer`.
- Produces: room UI that supports host Q&A, final guess, game chat, online users, and case notes.

- [ ] **Step 1: Add room socket hook**

Create `turtle-soup-chatroom/src/client/useRoomSocket.ts`:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import type { Puzzle, RoomState } from "../shared/types";
import { createSocket } from "./socket";

export function useRoomSocket() {
  const socket = useMemo<Socket>(() => createSocket(), []);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket.on("room:state", (nextRoom: RoomState) => {
      setRoom(nextRoom);
      if (!playerId) {
        const newestPlayer = nextRoom.players[nextRoom.players.length - 1];
        setPlayerId(newestPlayer?.id ?? null);
      }
    });
    socket.on("server:error", ({ message }: { message: string }) => setError(message));
    return () => {
      socket.disconnect();
    };
  }, [socket, playerId]);

  return {
    room,
    playerId,
    error,
    createRoom(puzzle: Puzzle, playerName: string) {
      socket.emit("room:create", { puzzleId: puzzle.id, playerName });
    },
    joinRoom(roomId: string, playerName: string) {
      socket.emit("room:join", { roomId, playerName });
    },
    sendChat(body: string) {
      if (room && playerId) socket.emit("chat:send", { roomId: room.id, playerId, body });
    },
    askHost(question: string, mode: "question" | "guess") {
      if (room && playerId) socket.emit("host:ask", { roomId: room.id, playerId, question, mode });
    },
    pinAnswer(answerId: string) {
      if (room) socket.emit("case:pin", { roomId: room.id, answerId });
    }
  };
}
```

- [ ] **Step 2: Add HostPanel**

Create `turtle-soup-chatroom/src/components/HostPanel.tsx`:

```tsx
import { Pin, Send } from "lucide-react";
import { useState } from "react";
import type { RoomState } from "../shared/types";

export function HostPanel({
  room,
  onAsk,
  onPin
}: {
  room: RoomState;
  onAsk: (question: string, mode: "question" | "guess") => void;
  onPin: (answerId: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"question" | "guess">("question");

  function submit() {
    const trimmed = question.trim();
    if (!trimmed) return;
    onAsk(trimmed, mode);
    setQuestion("");
  }

  return (
    <section className="host-panel">
      <div className="panel-title">
        <h2>主持人问答</h2>
        <span>{room.questionsUsed}/{room.questionLimit}</span>
      </div>
      <div className="host-log">
        {room.hostLog.length === 0 ? (
          <p className="muted">暂无问答记录</p>
        ) : (
          room.hostLog.map((item) => (
            <article className={`answer-card answer-${item.answerType}`} key={item.id}>
              <div className="question-line">{item.playerName}：{item.question}</div>
              <div className="answer-line">汤仙人：{item.answer}</div>
              <button className="icon-button" onClick={() => onPin(item.id)} title="收藏到卷宗">
                <Pin size={15} /> {item.pinned ? "已收藏" : "收藏"}
              </button>
            </article>
          ))
        )}
      </div>
      <div className="ask-box">
        <select value={mode} onChange={(event) => setMode(event.target.value as "question" | "guess")}>
          <option value="question">提问</option>
          <option value="guess">最终推理</option>
        </select>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={256}
          placeholder={mode === "question" ? "请提出可以用是/不是/无关回答的问题..." : "提交你的完整推理..."}
        />
        <button className="primary-button" onClick={submit}>
          <Send size={16} /> 发送
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add SidePanel**

Create `turtle-soup-chatroom/src/components/SidePanel.tsx`:

```tsx
import { MessageCircle, NotebookTabs, Send, Users } from "lucide-react";
import { useState } from "react";
import type { RoomState } from "../shared/types";

export function SidePanel({
  room,
  playerId,
  onSendChat
}: {
  room: RoomState;
  playerId: string;
  onSendChat: (body: string) => void;
}) {
  const [chat, setChat] = useState("");

  function submitChat() {
    const trimmed = chat.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setChat("");
  }

  return (
    <aside className="side-panel">
      <section className="side-section">
        <h2><Users size={17} /> 在线用户 ({room.players.length})</h2>
        <div className="player-list">
          {room.players.map((player) => (
            <span className="player-pill" key={player.id}>
              {player.name}{player.id === playerId ? "（你）" : ""}{player.isHost ? " · 发起人" : ""}
            </span>
          ))}
        </div>
      </section>
      <section className="side-section chat-section">
        <h2><MessageCircle size={17} /> 游戏聊天</h2>
        <div className="chat-list">
          {room.chatMessages.length === 0 ? (
            <p className="muted">暂无聊天消息</p>
          ) : (
            room.chatMessages.map((message) => (
              <p key={message.id}><strong>{message.playerName}</strong>：{message.body}</p>
            ))
          )}
        </div>
        <div className="chat-input">
          <input value={chat} onChange={(event) => setChat(event.target.value)} placeholder="输入消息..." />
          <button className="ghost-button" onClick={submitChat}><Send size={15} /></button>
        </div>
      </section>
      <section className="side-section">
        <h2><NotebookTabs size={17} /> 调查卷宗</h2>
        {room.caseNotes.length === 0 ? (
          <p className="muted">点击问答里的“收藏”把关键线索放进这里。</p>
        ) : (
          room.caseNotes.map((note) => <pre key={note.id}>{note.body}</pre>)
        )}
      </section>
    </aside>
  );
}
```

- [ ] **Step 4: Add RoomPage**

Create `turtle-soup-chatroom/src/components/RoomPage.tsx`:

```tsx
import { ArrowLeft, Link } from "lucide-react";
import type { RoomState } from "../shared/types";
import { HostPanel } from "./HostPanel";
import { SidePanel } from "./SidePanel";

export function RoomPage({
  room,
  playerId,
  onBack,
  onAsk,
  onPin,
  onSendChat
}: {
  room: RoomState;
  playerId: string;
  onBack: () => void;
  onAsk: (question: string, mode: "question" | "guess") => void;
  onPin: (answerId: string) => void;
  onSendChat: (body: string) => void;
}) {
  const inviteUrl = `${window.location.origin}?room=${room.id}`;

  return (
    <main className="room-shell">
      <header className="room-topbar">
        <button className="ghost-button" onClick={onBack}><ArrowLeft size={16} /> 离开</button>
        <div>
          <h1>私人房间</h1>
          <span className="status-pill">已连接</span>
        </div>
        <button className="primary-button" onClick={() => navigator.clipboard.writeText(inviteUrl)}>
          <Link size={16} /> 邀请好友
        </button>
      </header>
      <section className="room-grid">
        <aside className="puzzle-panel">
          <h2>{room.puzzle.title}</h2>
          <div className="tag-row">
            <span className={`difficulty difficulty-${room.puzzle.difficulty}`}>{room.puzzle.difficulty}</span>
            {room.puzzle.tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
          <p className="surface-text">{room.puzzle.surface}</p>
        </aside>
        <HostPanel room={room} onAsk={onAsk} onPin={onPin} />
        <SidePanel room={room} playerId={playerId} onSendChat={onSendChat} />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Wire room creation in App**

Replace `turtle-soup-chatroom/src/App.tsx` with:

```tsx
import { useEffect, useMemo, useState } from "react";
import { HomePage } from "./components/HomePage";
import { PuzzleDetail } from "./components/PuzzleDetail";
import { RoomPage } from "./components/RoomPage";
import { useRoomSocket } from "./client/useRoomSocket";
import { seedPuzzles } from "./data/seedPuzzles";
import type { Puzzle } from "./shared/types";

type View = { name: "home" } | { name: "detail"; puzzle: Puzzle } | { name: "room" };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [pendingPuzzle, setPendingPuzzle] = useState<Puzzle | null>(null);
  const roomSocket = useRoomSocket();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    if (roomId) {
      const playerName = window.prompt("输入昵称加入房间") || "访客";
      roomSocket.joinRoom(roomId, playerName);
      setView({ name: "room" });
    }
  }, []);

  useEffect(() => {
    if (roomSocket.room && pendingPuzzle) {
      setPendingPuzzle(null);
      setView({ name: "room" });
    }
  }, [roomSocket.room, pendingPuzzle]);

  const randomPuzzle = useMemo(
    () => () => {
      const puzzle = seedPuzzles[Math.floor(Math.random() * seedPuzzles.length)];
      setView({ name: "detail", puzzle });
    },
    []
  );

  function startRoom(puzzle: Puzzle) {
    const playerName = window.prompt("输入你的昵称") || "访客";
    setPendingPuzzle(puzzle);
    roomSocket.createRoom(puzzle, playerName);
  }

  if (view.name === "detail") {
    return (
      <PuzzleDetail
        puzzle={view.puzzle}
        onBack={() => setView({ name: "home" })}
        onStart={startRoom}
      />
    );
  }

  if (view.name === "room" && roomSocket.room && roomSocket.playerId) {
    return (
      <RoomPage
        room={roomSocket.room}
        playerId={roomSocket.playerId}
        onBack={() => setView({ name: "home" })}
        onAsk={roomSocket.askHost}
        onPin={roomSocket.pinAnswer}
        onSendChat={roomSocket.sendChat}
      />
    );
  }

  return (
    <>
      {roomSocket.error && <div className="toast-error">{roomSocket.error}</div>}
      <HomePage
        onOpenPuzzle={(puzzle) => setView({ name: "detail", puzzle })}
        onRandomPuzzle={randomPuzzle}
      />
    </>
  );
}
```

- [ ] **Step 6: Add room styles**

Append to `turtle-soup-chatroom/src/styles.css`:

```css
.toast-error {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 20;
  border: 1px solid rgba(239, 68, 68, 0.5);
  border-radius: 8px;
  background: rgba(127, 29, 29, 0.95);
  padding: 10px 12px;
}

.room-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
}

.room-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  padding: 12px 16px;
}

.room-topbar h1 {
  margin: 0 0 4px;
  font-size: 20px;
}

.room-grid {
  display: grid;
  grid-template-columns: 30% minmax(0, 1fr) 320px;
  gap: 12px;
  padding: 12px;
  min-height: 0;
}

.puzzle-panel,
.host-panel,
.side-panel,
.side-section {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(31, 41, 55, 0.94);
}

.puzzle-panel,
.host-panel,
.side-section {
  padding: 16px;
}

.host-panel {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 0;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
}

.panel-title h2,
.side-section h2 {
  margin: 0;
  font-size: 17px;
}

.host-log,
.chat-list {
  overflow: auto;
  min-height: 180px;
}

.answer-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-2);
  margin: 10px 0;
  padding: 12px;
}

.question-line {
  color: #dbeafe;
  margin-bottom: 8px;
}

.answer-line {
  color: #f8fafc;
  line-height: 1.6;
}

.answer-yes {
  border-color: rgba(34, 197, 94, 0.45);
}

.answer-no {
  border-color: rgba(239, 68, 68, 0.45);
}

.answer-partial {
  border-color: rgba(249, 115, 22, 0.45);
}

.icon-button {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255,255,255,0.04);
  color: var(--text);
  padding: 6px 8px;
}

.ask-box {
  display: grid;
  grid-template-columns: 110px 1fr auto;
  gap: 8px;
  padding-top: 10px;
}

.ask-box select,
.ask-box textarea,
.chat-input input {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #111827;
  color: var(--text);
  padding: 10px;
}

.ask-box textarea {
  min-height: 44px;
  max-height: 110px;
  resize: vertical;
}

.side-panel {
  display: grid;
  align-content: start;
  gap: 12px;
  background: transparent;
  border: 0;
}

.side-section h2 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
}

.player-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.player-pill {
  border: 1px solid rgba(59, 130, 246, 0.45);
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.13);
  padding: 8px;
}

.chat-input {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-top: 8px;
}

.muted {
  color: var(--muted);
}

pre {
  white-space: pre-wrap;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #111827;
  padding: 10px;
  color: #e5e7eb;
}

@media (max-width: 1100px) {
  .room-grid {
    grid-template-columns: 1fr;
  }

  .ask-box {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run build**

Run:

```bash
cd turtle-soup-chatroom
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run only if the workspace is a git repository:

```bash
git add turtle-soup-chatroom/src
git commit -m "feat: add realtime room client"
```

Expected: commit records playable room UI.

---

### Task 8: Verification and Product Pass

**Files:**
- Modify: `turtle-soup-chatroom/README.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces: local run instructions and MVP verification checklist.

- [ ] **Step 1: Create README**

Create `turtle-soup-chatroom/README.md`:

```md
# 出前一汤聊天室 MVP

线上海龟汤聊天室初版：题库选题、创建房间、好友聊天、AI 主持问答、最终推理和调查卷宗。

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Then open `http://localhost:5173`.

## AI Configuration

Set these values in `.env` before using the real AI host:

```bash
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace_me
AI_MODEL=gpt-4.1-mini
PORT=8787
```

Without these values, the host panel returns a configuration warning instead of calling a model.

## MVP Checks

- Homepage shows seed puzzle cards.
- Search, difficulty, tag, and sort controls filter the list.
- Puzzle detail shows title, tags, surface, stats, and start button.
- Starting a puzzle creates a private room.
- Invite link can be copied from the room.
- Joining with `?room=<id>` asks for a nickname and joins the room.
- Player chat appears for everyone in the room.
- Host questions add AI answers to the host log.
- Pinning an answer adds it to the case notebook.
```

- [ ] **Step 2: Run all tests**

Run:

```bash
cd turtle-soup-chatroom
npm run test
```

Expected: all Vitest tests PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
cd turtle-soup-chatroom
npm run build
```

Expected: TypeScript and Vite build PASS.

- [ ] **Step 4: Run local app**

Run:

```bash
cd turtle-soup-chatroom
npm run dev
```

Expected:

- Express server listens on `http://localhost:8787`.
- Vite serves the app on `http://localhost:5173`.
- Homepage renders puzzle cards.

- [ ] **Step 5: Manual browser verification**

Open `http://localhost:5173` and verify:

- Search for `冷水` narrows the list to `冷掉的水`.
- Open a puzzle detail page.
- Start a room with nickname `房主`.
- Send game chat `先确认人物关系`.
- Ask the host `女孩真的消失了吗？`.
- Pin the host answer to the case notebook.
- Copy the invite link and open it in a second tab.
- Join as `玩家二`.
- Send chat from `玩家二` and confirm the first tab updates.

- [ ] **Step 6: Commit**

Run only if the workspace is a git repository:

```bash
git add turtle-soup-chatroom/README.md
git commit -m "docs: add mvp runbook"
```

Expected: commit records documentation.

---

## Self-Review

Spec coverage:

- Puzzle browsing: Task 2 and Task 6.
- Puzzle detail: Task 6.
- Room creation and invite link: Task 5 and Task 7.
- Multiplayer chat: Task 5 and Task 7.
- AI host Q&A: Task 4, Task 5, and Task 7.
- Final guess checking: Task 4 and Task 7 via `mode: "guess"`.
- Case notebook: Task 3 and Task 7.
- Server-only AI key: Task 4 and `.env.example`.
- Dark detective UI: Task 1, Task 6, and Task 7 CSS.

Placeholder scan:

- No `TBD`, `TODO`, `implement later`, or “similar to” instructions remain.
- Deferred product modules are listed in the design document, not as implementation gaps in this MVP plan.

Type consistency:

- `HostAnswerType`, `Puzzle`, `RoomState`, `ChatMessage`, and `CaseNote` are defined in Task 2 and consumed with the same names later.
- Socket event payload names are consistent between Task 5 and Task 7.
- `askHost(question, mode)` is consistently typed with `mode: "question" | "guess"`.

