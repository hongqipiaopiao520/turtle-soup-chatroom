# 管理台 Tabs 信息架构设计

## 背景

当前 `/admin` 把题目导入、题库审核、AI Host Harness 主持质检都堆在一个长页面里。功能继续增加后，页面信息密度过高，用户很难判断当前该操作哪个模块。

目标是用一级 tabs 按工作流程拆分管理台，让每个页面只服务一个明确任务。

## 信息架构

采用三个一级 tab：

```txt
导入题目 | 题库审核 | AI 主持质检
```

### 导入题目

包含：

- 粘贴原文导入
- 文件导入
- 图片导入

目标：只处理“把题目放进系统”。

### 题库审核

包含：

- 审核队列
- 搜索、难度、标签、状态筛选
- 批量发布
- 重新分析标签
- 删除导入
- 题目编辑表单
- 保存修改、发布、驳回

目标：只处理“管理、编辑、发布题库”。

### AI 主持质检

包含：

- 房间列表
- 房间详情
- 汤底和关键点 admin-only 展示
- 问答时间线
- 单条审查
- 批量审查
- Critic Agent review 结果

目标：只处理“AI 主持人质量回放和审查”。

## 顶部布局

顶部只保留全局信息：

```txt
题库审核台                         [ADMIN_TOKEN]
[导入题目] [题库审核] [AI 主持质检]
```

调整：

- `ADMIN_TOKEN` 保留全局，所有 tab 共享。
- 当前全局状态筛选移动到 `题库审核` tab 内部。
- 全局刷新按钮不保留，避免不同 tab 语义不一致；各 tab 内保留自己的刷新或操作按钮。
- 顶部 message 仍在 tabs 下方展示。

## 组件结构

`AdminPage.tsx` 作为容器，内部根据 active tab 渲染对应区域。

MVP 可以先用 render 函数隔离 JSX：

```ts
renderImportTab()
renderPuzzleReviewTab()
renderAiHostTab()
```

后续再拆成独立组件：

```tsx
<AdminImportTab />
<AdminPuzzleReviewTab />
<AiHostHarnessPanel />
```

`AiHostHarnessPanel` 当前已经是独立组件，直接放入 `AI 主持质检` tab。

## 状态管理

全局状态：

- `token`
- `message`
- `isBusy`
- `activeTab`

导入 tab 状态保留在当前页面：

- `rawImport`
- `sourceTitle`
- `sourceUrl`
- `fileItems`
- `failedFileItems`
- `fileImportName`
- `imageItems`
- `imageImportResult`
- `imageRawText`

题库审核 tab 状态：

- `status`
- `puzzles`
- `selectedId`
- `draft`
- `selectedIds`
- `adminQuery`
- `adminDifficulty`
- `adminTag`

AI 主持质检状态继续放在 `AiHostHarnessPanel` 内。

## 交互规则

- 默认 tab：`题库审核`。
- 切换 tab 不清空状态。
- 导入成功后自动切到 `题库审核`，并选中新导入题目。
- 文件/图片批量导入成功后也切到 `题库审核`，方便继续编辑和发布。
- `题库审核` tab 内部保留状态筛选和刷新题库按钮。
- `AI 主持质检` tab 内部保留刷新房间按钮。

## 样式

新增样式类：

```css
.admin-tabs
.admin-tab-button
.admin-tab-button-active
.admin-tab-panel
```

视觉要求：

- tabs 位于 topbar 下方。
- active tab 使用现有金色强调色。
- tab panel 只显示当前模块，避免长页面堆叠。
- 移动端 tabs 横向滚动。

## 测试

更新 `tests/adminPageUi.test.tsx`：

- 渲染 tab 按钮：`导入题目`、`题库审核`、`AI 主持质检`。
- 默认显示 `题库审核` 内容。
- 默认不显示导入模块和 AI Host Harness 模块。
- 增加 `initialTab` prop 方便 SSR 测试：
  - `initialTab="import"` 时显示导入模块。
  - `initialTab="ai-host"` 时显示 AI Host Harness。
- 保留现有题库审核、文件导入、图片导入相关断言，但迁移到对应 initialTab 测试中。

## 实施范围

关键文件：

- `src/components/AdminPage.tsx`
- `src/components/AiHostHarnessPanel.tsx`
- `src/styles.css`
- `tests/adminPageUi.test.tsx`

不涉及后端 API 或数据结构。
