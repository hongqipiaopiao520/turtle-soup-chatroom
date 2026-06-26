# AI 主持人结构化判题与角色设计

## 背景

当前 AI 主持人已经能基于汤底进行结构化判题，并返回 `answerType`、`answer`、`progress`、`coveredPointIds` 和 `coverageConfidence`。下一步希望让主持人更有“活人感”：在保持海龟汤严格判题的前提下，引入不同主持人角色和偶发的角色化闲话。

核心目标不是让 AI 每次都表演，而是让它在绕远、突破、接近真相等关键节点自然露出性格。

## 目标

- 保持判题严谨：普通提问仍以“是 / 不是 / 无关 / 部分相关 / 问法不成立”为核心答案。
- 支持角色化主持人：初版提供小歪、大V、龟龟三个角色。
- 支持可选风格文案：AI 可以返回短句 `styleText`，包含少量 emoji，但不参与判题和计分。
- 控制闲话节奏：不是每个问题都补充角色文案，而是由服务端通过 `stylePolicy` 控制。
- 防止剧透和攻击性表达：服务端对 `styleText` 做二次过滤，不安全时直接丢弃。

## 非目标

- 不做复杂 NPC 成长、好感度或长期记忆。
- 不让风格文案影响分数、进度或结算。
- 不让 AI 自由改变核心判题答案。
- 不为 emoji 建立严格白名单，初版只做基础清洗。

## 角色设计

### 小歪

默认主持人。轻松、俏皮、略带调侃，但整体友好。

示例：

```txt
是。你这一下还挺像那么回事。
部分相关。影子摸到了，但还没摸到人。
不是。你刚刚差点把汤锅端翻。
```

### 大V

毒舌侦探型。理性、冷淡，喜欢嘲讽绕远推理和低质量问题。

示例：

```txt
不是。这个推理大概只感动了你自己。😏
无关。很好，又成功浪费了一个问题。
部分相关。你离答案近了一点，离自信远一点。
问法不成立。先把问题问明白，再装侦探。
```

边界：

- 可以吐槽问题、推理方向、脑洞。
- 不攻击玩家本人。
- 不使用辱骂、歧视、低俗表达。
- 不泄露汤底或新增事实。

### 龟龟

慢悠悠、可爱、佛系，偶尔使用“龟龟”口癖。

示例：

```txt
是。龟龟点头，但你还要慢慢想。🐢
不是。龟龟摇头，这条路有点滑走啦。
无关。龟龟路过，这个不重要。
部分相关。龟龟觉得你摸到一点壳边了。
```

## 数据模型

新增主持人角色类型：

```ts
type HostPersonaId = "xiaowai" | "dav" | "guigui";
```

房间状态增加主持人字段：

```ts
interface RoomState {
  hostPersonaId: HostPersonaId;
}
```

旧房间兼容：缺省时使用 `xiaowai`。

AI 判题结果扩展：

```ts
interface HostDecision {
  answerType: HostAnswerType;
  answer: string;
  styleText?: string;
  progress: number;
  coveredPointIds?: string[];
  coverageConfidence?: number;
}
```

问答记录扩展：

```ts
interface HostAnswer {
  styleText?: string;
}
```

`answer` 是规则答案，由服务端根据 `answerType` 强制归一化。`styleText` 是角色语气补充，可包含 emoji，但不参与判题、计分或进度计算。

## stylePolicy 节奏控制

服务端为每次请求计算：

```ts
type StylePolicy = "none" | "optional" | "encouraged";
```

建议规则：

- AI 错误、重试、兜底：`none`
- 普通低价值问题：`optional`
- 连续普通问答：提高 `none` 概率，避免每句都表演
- 绕远、无关、重复问题：`encouraged`
- 关键突破：`encouraged`
- 接近真相：`encouraged`

Prompt 约束：

```txt
stylePolicy=none 时，styleText 必须为空。
stylePolicy=optional 时，只有自然时才给一句，不要每次都说。
stylePolicy=encouraged 时，可以给一句符合角色的短文案。
```

## AI Prompt 设计

Prompt 输入增加：

- `hostPersonaId`
- 角色名称和性格描述
- 角色边界规则
- `stylePolicy`
- 当前房间进度
- 历史问答
- 玩家输入

Prompt 输出仍必须是 JSON，不允许 Markdown 或额外解释。

示例输出：

```json
{
  "answerType": "no",
  "answer": "不是",
  "styleText": "这个推理大概只感动了你自己。😏",
  "progress": 20,
  "coveredPointIds": [],
  "coverageConfidence": 0
}
```

## 服务端安全过滤

服务端不完全信任 AI 的 `styleText`。

处理规则：

- `answer` 按 `answerType` 强制归一化。
- `styleText` 可选，最长 40 字。
- 移除换行和多余空白。
- 过滤汤底原文、关键点原文、明显剧透词。
- 过滤人身攻击、辱骂、歧视、低俗词。
- `stylePolicy=none` 时直接丢弃 `styleText`。
- 不安全时直接丢弃 `styleText`，但保留判题结果。

这样 AI 可以有性格，但不能破坏主持规则。

## 前端交互

房间创建或房间设置中选择主持人：

```txt
小歪 / 大V / 龟龟
```

房间内展示当前主持人身份：

```txt
主持人：大V · 毒舌侦探
```

问答卡片展示：

```txt
玩家：她是活人吗？
大V：不是。这个推理大概只感动了你自己。😏
```

如果没有 `styleText`：

```txt
大V：不是。
```

## 数据流

```txt
玩家提问
  ↓
服务端读取房间、题目、历史、主持人角色
  ↓
计算 stylePolicy
  ↓
构造 AI Prompt
  ↓
AI 返回结构化 JSON
  ↓
Zod 校验
  ↓
answer 归一化 + styleText 安全过滤
  ↓
写入 hostLog
  ↓
Socket 广播 PublicRoomState
  ↓
前端展示个性化主持回复
```

## 错误处理

- AI 返回非法 JSON：保留现有降级策略，不产生 `styleText`。
- AI 请求失败：不消耗提问次数，不产生 `styleText`。
- `styleText` 不安全：只丢弃 `styleText`，不影响判题。
- 旧房间无 `hostPersonaId`：默认小歪。
- 前端收到无 `styleText` 的问答：只展示规则答案。

## 测试策略

需要覆盖：

- AI schema 能解析 `styleText`。
- 非法 JSON 降级时不保存 `styleText`。
- `answer` 被强制归一化。
- `styleText` 超长会截断。
- `styleText` 包含汤底或关键点时被丢弃。
- 大V不能输出人身攻击。
- `stylePolicy=none` 时不会保存闲话。
- 前端能展示有 / 无 `styleText` 两种状态。
- 旧房间无主持人字段时默认小歪。
- 房间创建时能选择主持人角色。

## 推荐落地顺序

1. 增加共享类型：`HostPersonaId`、`styleText`、`hostPersonaId`。
2. 增加主持人配置表：角色名称、描述、Prompt 规则。
3. 扩展 AI schema 与 Prompt。
4. 实现 `stylePolicy` 计算。
5. 实现 `styleText` 清洗与安全过滤。
6. 保存并序列化 `styleText`。
7. 前端展示角色名称和风格文案。
8. 房间创建增加主持人选择。
9. 补齐测试。
