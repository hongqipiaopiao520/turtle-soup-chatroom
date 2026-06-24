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
  it("renders the puzzle workbench with import, editor, and actions", () => {
    const markup = renderToStaticMarkup(
      <AdminPage initialPuzzles={[makePuzzle()]} disableInitialLoad />
    );

    expect(markup).toContain("题库审核台");
    expect(markup).toContain("粘贴原文导入");
    expect(markup).toContain("雨夜站台");
    expect(markup).toContain("深夜的站台空无一人");
    expect(markup).toContain("沉浸式告别仪式");
    expect(markup).toContain("保存修改");
    expect(markup).toContain("发布");
    expect(markup).toContain("驳回");
  });

  it("renders file import controls", () => {
    const markup = renderToStaticMarkup(
      <AdminPage initialPuzzles={[makePuzzle()]} disableInitialLoad />
    );

    expect(markup).toContain("文件导入");
    expect(markup).toContain("选择文件");
    expect(markup).toContain("支持 .txt/.md/.csv");
  });

  it("formats several batch import failures with row-level reasons", () => {
    expect(formatBatchImportMessage({
      imported: 2,
      failed: [
        { index: 0, message: "AI 返回格式不合格：solutionPoints 至少 1 个/字" },
        { index: 2, message: "AI 增强失败：请求超时" },
        { index: 4, message: "AI 返回格式不合格：JSON 解析失败" }
      ]
    })).toBe(
      "已导入 2 条，失败 3 条：第 1 条 AI 返回格式不合格：solutionPoints 至少 1 个/字；第 3 条 AI 增强失败：请求超时；第 5 条 AI 返回格式不合格：JSON 解析失败"
    );
  });
});
