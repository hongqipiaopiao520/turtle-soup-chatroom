# 海龟汤聊天室 — 改进设计

> 日期：2026-06-25
> 状态：已确认，待实现

## 背景

项目是一个 React + Express + Socket.IO + SQLite 的海龟汤聊天室 MVP。经过代码和产品两轮分析，识别出多个安全、可靠性、玩法、留存方面的缺陷。本设计覆盖用户选定的优先修复点，分三期 + 一个横向改造落地。

## 目标范围

### 第一期：止血（安全 + 可靠性）

1. 汤底不再下发前端（PublicRoomState 脱敏）
2. CORS 配置化
3. AI 主持可靠性（timeout / 重试 / 失败不计数）

### 横向改造：房间持久化

4. `saveAll` 全量保存改为 `saveRoom` 单房间 upsert

### 第二期：玩法体验

5. AI 回答严格化（普通提问只返回标准短答）
6. 取消 95% 自动通关，改为最终推理结算；房主可手动揭晓
7. 房主提示系统

### 第三期：留存与传播

8. 结算复盘增强
9. 邀请链接优化 + OG 分享卡片 + 结算分享文案
10. 首页假数据清理

## 不改的点

- 汤底揭晓的基础逻辑不改：AI 判定 solved 或进度到 95% 仍可作为解锁信号。第二期只是取消"95% 自动通关"，改为必须提交最终推理。房主额外获得手动揭晓能力。
- `truthRevealed` 现有语义保留。

---

## 第一期详细设计

### 1. 汤底脱敏 — PublicRoomState

#### 新增类型（`src/shared/types.ts`）

```ts
export interface PublicPuzzle {
  id: string;
  title: string;
  surface: string;
  difficulty: Difficulty;
  tags: string[];
  author: string;
  rating: number;
  plays: number;
  hintCount: number; // 只告诉有几条，不告诉内容
}

export interface PublicHostAnswer {
  id: string;
  playerId: string;
  playerName: string;
  question: string;
  answerType: HostAnswerType;
  answer: string;
  progress: number;
  progressDelta: number;
  contributionScore: number;
  isBreakthrough: boolean;
  pinned: boolean;
  createdAt: string;
  // 不含 coveredPointIds / coverageConfidence
}

export interface PublicRoomState {
  id: string;
  puzzle: PublicPuzzle;
  status: RoomStatus;
  players: Player[];
  hostLog: PublicHostAnswer[];
  hostPending?: HostPending;
  chatMessages: ChatMessage[];
  caseNotes: CaseNote[];
  questionLimit: number;
  questionsUsed: number;
  progress: number;
  answerUnlocked: boolean;
  truthRevealed: boolean;
  truth?: string; // 仅当 truthRevealed === true 时存在
  settlement?: RoomSettlement;
  createdAt: string;
  // 第二期新增：
  hintsRevealed: number;
  hintRequestedBy: string[];
  revealedHints: string[];
}
```

#### 转换函数（新建 `server/roomSerializer.ts`）

```ts
export function toPublicPuzzle(puzzle: Puzzle): PublicPuzzle { ... }
export function toPublicHostAnswer(answer: HostAnswer): PublicHostAnswer { ... }
export function toPublicRoomState(room: RoomState): PublicRoomState {
  return {
    ...room,
    puzzle: toPublicPuzzle(room.puzzle),
    hostLog: room.hostLog.map(toPublicHostAnswer),
    ...(room.truthRevealed ? { truth: room.puzzle.truth } : {})
  };
}
```

#### Socket 改动（`server/socketHandlers.ts`）

- `room:session` → `{ room: toPublicRoomState(room), playerId }`
- `room:state` → `toPublicRoomState(room)`
- 服务端内部仍用完整 `RoomState`

#### 前端改动

- `src/shared/types.ts` 同步新增 Public 类型
- `src/client/` 和 `src/components/` 中 `RoomState` 引用改为 `PublicRoomState`
- 前端不再访问 `puzzle.truth`，只在 `truthRevealed` 后读 `truth`

#### 风险

前端可能有地方直接读 `room.puzzle.truth`，需全局清理。

### 2. CORS 配置化

#### `.env.example` 新增

```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8787
```

#### `server/index.ts` 改动

```ts
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
};

const io = new Server(server, { cors: corsOptions });
```

Express 侧（`server/app.ts`）共用同一套 cors 中间件。

兼容：`ALLOWED_ORIGINS` 留空时退回 `origin: true`（开发友好）。

### 3. AI 主持可靠性

#### `server/aiHost.ts` 改动

```ts
const AI_TIMEOUT_MS = 15000;
const AI_MAX_RETRIES = 1;
```

- 用 `AbortController` 实现 timeout
- 5xx 重试一次，4xx 不重试
- 失败返回 `{ answerType: "partial", answer: "...", progress: 0 }`
- 日志：`console.warn("[aiHost]", { status, attempt, durationMs, error })`

#### Socket handler 侧判断

如果 `decision` 是失败回答（通过标记或 answerType 判断），不调用 `addHostAnswer`，直接 `clearHostPending` 并提示重试。这样不会消耗提问次数，也不会污染 hostLog。

---

## 横向改造：房间持久化

### 当前问题

`server/socketHandlers.ts` 第 31-33 行：

```ts
function persistRooms(roomRepository: RoomRepository) {
  roomRepository.saveAll(exportRoomsSnapshot());
}
```

每次变更全量保存所有房间。

### 改为

#### `server/storage/roomRepository.ts` 新增方法

```ts
saveRoom(room: RoomState): void {
  const stmt = this.db.prepare(`
    INSERT INTO rooms (id, state_json, updated_at) 
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
  `);
  stmt.run(room.id, JSON.stringify(room), new Date().toISOString());
}
```

#### `server/socketHandlers.ts` 改动

所有 `persistRooms(dependencies.roomRepository)` 替换为 `dependencies.roomRepository.saveRoom(room)`。

#### 保留

- `exportRoomsSnapshot` 保留，仅用于启动迁移
- `server/index.ts` 启动时 `saveAll` 仍用于初次迁移

---

## 第二期详细设计

### 4. AI 回答严格化

#### prompt 改动

```text
普通提问的 answer 字段只能是一个词：是、不是、无关、部分相关、问法不成立。
不要补充解释，不要给出任何额外信息。
推理提交的 answer 可以用一句话说明缺少什么方向，但不要泄露汤底。
```

#### 服务端校验（`server/aiHost.ts` 新增 `sanitizeHostAnswer`）

```ts
const SHORT_ANSWERS: Record<HostAnswerType, string> = {
  yes: "是",
  no: "不是",
  irrelevant: "无关",
  partial: "部分相关",
  invalid: "问法不成立",
  solved: "已解出",
  unsolved: "尚未解出"
};

function sanitizeAnswer(answerType: HostAnswerType, rawAnswer: string): string {
  if (answerType === "solved" || answerType === "unsolved") {
    return rawAnswer.slice(0, 240);
  }
  return SHORT_ANSWERS[answerType] ?? rawAnswer.slice(0, 20);
}
```

普通提问只返回标准短答，推理提交保留 AI 解释。

#### HostAnswerType 新增

```ts
export type HostAnswerType =
  | "yes" | "no" | "irrelevant" | "partial" | "invalid"
  | "solved" | "unsolved";
```

### 5. 取消 95% 自动通关 + 房主揭晓

#### `server/roomStore.ts` 改动

当前（第 283-287 行）：

```ts
if (answer.answerType === "solved" || room.progress >= ANSWER_UNLOCK_PROGRESS) {
  room.answerUnlocked = true;
  room.status = "solved";
  room.settlement = calculateSettlement(room, ...);
}
```

改为：

```ts
if (answer.answerType === "solved") {
  room.answerUnlocked = true;
  room.truthRevealed = true;
  room.status = "solved";
  room.settlement = calculateSettlement(room, answer.playerId);
}
// progress >= 95 不再自动通关
```

#### 新增房主揭晓

```ts
export function revealTruth(roomId: string, playerId: string): RoomState {
  const room = requireRoom(roomId);
  const player = requirePlayer(room, playerId);
  if (!player.isHost) throw new Error("只有房主可以揭晓");
  if (room.status === "solved") throw new Error("本局已结束");
  room.truthRevealed = true;
  room.answerUnlocked = true;
  room.status = "solved";
  room.settlement = calculateSettlement(room);
  return room;
}
```

#### Socket 事件

```ts
socket.on("host:reveal", ({ roomId, playerId }) => { ... });
```

#### 前端改动

- `progress >= 95` 时显示"已接近真相，请提交最终推理"
- `host:ask` 的 `mode: "guess"` 是唯一正常解锁途径
- HostPanel 增加房主"揭晓真相"按钮（二次确认）

### 6. 房主提示系统

#### 数据结构（`RoomState` 新增）

```ts
export interface RoomState {
  // ... 现有字段 ...
  hintsRevealed: number;
  hintRequestedBy: string[];
}
```

#### 新 Socket 事件

| 事件 | 触发者 | 行为 |
|---|---|---|
| `host:revealHint` | 房主 | 揭示下一条 hint，`hintsRevealed++`，清空 `hintRequestedBy` |
| `player:requestHint` | 普通玩家 | 加入 `hintRequestedBy`，通知房主 |

#### 房主 UI（`HostPanel.tsx`）

- 显示"提示 (N/M)"按钮
- 有玩家请求时显示红点
- 点击后揭示下一条
- 揭示后的提示进入 `hostLog` 或单独区域，所有人可见

#### 结算影响

提示不计分，揭示后全局可见，无需处理玩家积分。

#### 边界

- 题目没有 hints → 按钮禁用，显示"本题无提示"
- 提示用完 → 按钮消失

---

## 第三期详细设计

### 7. 结算和复盘增强

#### RoomSettlement 扩展

```ts
export interface RoomSettlement {
  mvpPlayerId?: string;
  bestAnswerId?: string;
  unlockingPlayerId?: string;
  finalGuess?: string;
  finalGuessPlayerId?: string;
  hintsRevealed: number;
  durationMs: number;
  endedAt: string;
  endedBy: "solved" | "host-reveal";
}
```

#### 结算页分区

```text
┌─ 本局复盘 ─────────────────────────┐
│ 题目标题 / 难度 / 时长 / 提问数     │
├─ 汤底 ──────────────────────────── │
│ 完整汤底文本                        │
├─ 最终推理 ─────────────────────── │
│ 提交者 / 推理内容 / AI 判定         │
├─ MVP / 最佳突破 / 解锁者 ──────── │
│ 玩家名 + 贡献分                     │
├─ 关键突破问答 ─────────────────── │
│ progressDelta >= 20 的问题列表      │
├─ 完整问答时间线 ───────────────── │
│ 所有 Q&A 按时间排列，标记类型       │
├─ 使用提示 ────────────────────── │
│ 揭示了 N 条提示                    │
└────────────────────────────────────┘
```

#### 改动文件

- `server/roomStore.ts`：`calculateSettlement` 补充新字段
- `src/components/RoomPage.tsx`：结算面板重构
- `src/shared/types.ts`：`RoomSettlement` 扩展

### 8. 社交传播

#### 8.1 邀请链接优化

- 房间创建后生成完整邀请链接 `https://yourdomain/?room=xxx`
- 首页加入"粘贴邀请链接直接加入"输入框
- 邀请链接带题目名和难度参数（仅展示，不泄露 truth）：
  `?room=xxx&title=冷掉的水&difficulty=medium`

#### 8.2 OG 分享卡片

`server/app.ts` 新增路由：

```ts
app.get("/share/room/:roomId", (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).send("房间不存在");
  
  const html = `
    <meta property="og:title" content="海龟汤：${room.puzzle.title}" />
    <meta property="og:description" content="难度：${room.puzzle.difficulty} | ${room.players.length}人正在玩" />
    <meta name="twitter:card" content="summary" />
    <meta http-equiv="refresh" content="0;url=/?room=${room.id}" />
  `;
  res.send(html);
});
```

#### 8.3 结算分享文案

```ts
function buildShareText(room: PublicRoomState): string {
  const lines = [
    `我玩了海龟汤《${room.puzzle.title}》`,
    `难度：${room.puzzle.difficulty}`,
    `提问 ${room.questionsUsed} 次`,
    `用时 ${formatDuration(room.settlement.durationMs)}`,
  ];
  if (room.hintsRevealed > 0) lines.push(`用了 ${room.hintsRevealed} 条提示`);
  if (isWinner) lines.push("我拿了 MVP！");
  lines.push(`来挑战：${shareUrl}`);
  return lines.join("\n");
}
```

点击后 `navigator.clipboard.writeText(shareText)`，toast 提示"已复制"。

#### 8.4 首页假数据清理

- `HomePage.tsx` 第 41 行 "72 今日活跃" 删掉或改成真实统计
- 改成从 `/api/stats` 获取活跃房间数

---

## 全部落地顺序

```text
第一期（止血）
  1. PublicRoomState 脱敏
  2. CORS 配置化
  3. AI timeout + 重试 + 失败不计数

横向改造
  4. saveRoom 单房间持久化

第二期（玩法）
  5. AI 回答严格化
  6. 取消 95% 自动通关 + 房主揭晓
  7. 房主提示系统

第三期（留存传播）
  8. 结算复盘增强
  9. 邀请链接 + OG + 分享文案
  10. 首页假数据清理
```

## 验证方式

### 第一期

1. 浏览器 DevTools 检查 `room:state` payload 不含 `truth`
2. 非白名单域名跨域请求被拒
3. AI 超时后房间状态正常恢复，提问次数不增加
4. 现有测试通过，新增脱敏相关测试

### 第二期

1. 普通提问 AI 回答只有"是/不是/无关/部分相关/问法不成立"
2. 房主能揭示提示，玩家能请求提示
3. 进度到 95% 不会自动通关
4. 提交最终推理后 AI 判定 solved 才解锁
5. 房主能手动揭晓

### 第三期

1. 结算页展示完整时间线、关键突破、最终推理
2. 邀请链接在社交平台分享有题目名预览
3. 结算页可复制战绩文案
4. 首页活跃数不再硬编码

## 实现顺序

按设计文档的分期顺序实现，不调整优先级。
