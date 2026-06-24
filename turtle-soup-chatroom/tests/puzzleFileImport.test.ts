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

  it("parses markdown heading sections as puzzle items", () => {
    const items = parsePuzzleFileContent({
      filename: "puzzles.md",
      content: [
        "# 许二木海龟汤完整整理",
        "",
        "## 1. 《妹妹的房间》",
        "",
        "**来源：** [许二木S2-1](https://example.test/a)",
        "",
        "**汤面：**",
        "",
        "妹妹的房间传来很多球鞋摩擦地板的声音。",
        "",
        "**汤底：**",
        "",
        "妹妹的棺椁被打开，里面躲着很多老鼠。",
        "",
        "---",
        "",
        "## 2. 《宿舍》",
        "",
        "**来源：** [许二木S2-1](https://example.test/b)",
        "",
        "**汤面：**",
        "",
        "今天天气很热，老大在宿舍门口吃冰棍。",
        "",
        "**汤底：**",
        "",
        "这是雪山循环，帐篷外的人都是过去的自己。"
      ].join("\n")
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      rawText: [
        "标题：妹妹的房间",
        "汤面：妹妹的房间传来很多球鞋摩擦地板的声音。",
        "汤底：妹妹的棺椁被打开，里面躲着很多老鼠。"
      ].join("\n"),
      sourceTitle: "许二木S2-1",
      sourceUrl: "https://example.test/a"
    });
    expect(items[1].rawText).toContain("标题：宿舍");
    expect(items[1].rawText).toContain("汤底：这是雪山循环");
    expect(items[1].sourceUrl).toBe("https://example.test/b");
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
