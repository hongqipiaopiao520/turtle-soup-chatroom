import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminPage, formatBatchImportMessage } from "../src/components/AdminPage";
import type { ManagedPuzzle } from "../src/shared/types";

function makePuzzle(): ManagedPuzzle {
  return {
    id: "admin-puzzle",
    title: "雨夜站台",
    surface: "深夜的站台空无一人，女孩却向空气道谢，然后消失了。",
    truth: "女孩正在参加一次沉浸式告别仪式。",
    solutionPoints: ["沉浸式告别仪式", "不是真的消失"],
    difficulty: "medium",
    tags: ["悬疑", "温情"],
    author: "题库导入",
    rating: 0,
    plays: 0,
    createdAt: "2026-06-23T00:00:00.000Z",
    status: "reviewing",
    rawText: "原始题目文本",
    sourceTitle: "来源标题",
    sourceUrl: "https://example.test/source",
    hints: ["注意耳机"],
    estimatedMinutes: 15,
    qualityScore: 86,
    qualityIssues: ["确认汤底是否清晰"],
    qualitySummary: "结构完整，可以人工复核。",
    updatedAt: "2026-06-23T00:01:00.000Z"
  };
}

describe("AdminPage", () => {
  it("renders admin tabs and defaults to the puzzle review workbench", () => {
    const markup = renderToStaticMarkup(
      <AdminPage initialPuzzles={[makePuzzle()]} disableInitialLoad />
    );

    expect(markup).toContain("题库审核台");
    expect(markup).toContain("导入题目");
    expect(markup).toContain("题库审核");
    expect(markup).toContain("AI 主持质检");
    expect(markup).toContain("审核队列");
    expect(markup).toContain("雨夜站台");
    expect(markup).toContain("保存修改");
    expect(markup).toContain("发布");
    expect(markup).not.toContain("粘贴原文导入");
    expect(markup).not.toContain("AI Host Harness");
  });

  it("renders import tools in the import tab", () => {
    const markup = renderToStaticMarkup(
      <AdminPage initialPuzzles={[makePuzzle()]} disableInitialLoad initialTab="import" />
    );

    expect(markup).toContain("文件导入");
    expect(markup).toContain("选择文件");
    expect(markup).toContain("支持 .txt/.md/.csv");
  });

  it("renders image import controls with editable preview flow", () => {
    const markup = renderToStaticMarkup(
      <AdminPage initialPuzzles={[makePuzzle()]} disableInitialLoad initialTab="import" />
    );

    expect(markup).toContain("图片导入");
    expect(markup).toContain("点击这里后直接粘贴网页图片");
    expect(markup).toContain("选择图片");
    expect(markup).toContain("解析图片");
    expect(markup).toContain("导入并发布");
    expect(markup).toContain('accept="image/*"');
    expect(markup).toContain("tabindex=\"0\"");
  });

  it("renders bulk review controls for publishing selected puzzles", () => {
    const markup = renderToStaticMarkup(
      <AdminPage initialPuzzles={[makePuzzle()]} disableInitialLoad />
    );

    expect(markup).toContain("批量发布");
    expect(markup).toContain("重新分析标签");
    expect(markup).toContain("删除导入");
    expect(markup).toContain("全选当前列表");
    expect(markup).toContain("清空选择");
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("选择题目");
  });

  it("uses unified select controls in admin filters and editor fields", () => {
    const markup = renderToStaticMarkup(
      <AdminPage initialPuzzles={[makePuzzle()]} disableInitialLoad />
    );

    expect(markup).toContain("ui-select");
    expect(markup).toContain("全部状态");
    expect(markup).toContain("全部难度");
    expect(markup).toContain("全部标签");
    expect(markup).toContain("筛选标题、汤面、来源、标签");
    expect(markup).toContain("中等");
    expect(markup).not.toContain("<select");
  });

  it("renders AI Host Harness in its own tab", () => {
    const markup = renderToStaticMarkup(
      <AdminPage initialPuzzles={[makePuzzle()]} disableInitialLoad initialTab="ai-host" />
    );

    expect(markup).toContain("AI Host Harness");
    expect(markup).toContain("主持质检");
    expect(markup).toContain("刷新房间");
    expect(markup).not.toContain("审核队列");
    expect(markup).not.toContain("粘贴原文导入");
  });

  it("formats several batch import failures with row-level reasons", () => {
    expect(formatBatchImportMessage({
      imported: 2,
      failed: [
        { index: 0, message: "AI 返回格式不合格：solutionPoints 至少 1 个/字", rawText: "A" },
        { index: 2, message: "AI 增强失败：请求超时", rawText: "B" },
        { index: 4, message: "AI 返回格式不合格：JSON 解析失败", rawText: "C" }
      ]
    })).toBe(
      "已导入 2 条，失败 3 条：第 1 条 AI 返回格式不合格：solutionPoints 至少 1 个/字；第 3 条 AI 增强失败：请求超时；第 5 条 AI 返回格式不合格：JSON 解析失败。失败项已保留，可重试或下载清单。"
    );
  });
});
