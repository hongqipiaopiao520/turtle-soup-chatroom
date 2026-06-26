import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  convertMarkdownRowToPuzzle,
  importMarkdownPuzzles,
  parseMarkdownPuzzleSections,
  parseMarkdownPuzzleTable,
  parseSourceLink
} from "../scripts/import-puzzles-md.mjs";
import { parseSolutionPointDefinitions } from "../server/puzzleImporter";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";

const sampleTable = `# 海龟汤去重总表

| # | 标题 | 汤面 | 汤底 | 来源 |
|---:|---|---|---|---|
| 1 | 《妹妹的房间》 | 妹妹的房间传来声音<br>我开门看了一眼 | 妹妹的头七。保安担心事情败露。 | [许二木S2-1](https://zhuanlan.zhihu.com/p/1937434215919646614) |
| 2 | 《歌声》 | 男人和女人喝酒，突然听到熟悉的歌声。 | 项羽听见四面楚歌，知道家乡沦陷。 | [许二木S2-1](https://zhuanlan.zhihu.com/p/1937434215919646614) |
`;

const sampleSections = `# 许二木海龟汤完整整理

## 1. 《妹妹的房间》

**来源：** [许二木S2-1](https://example.test/a)

**汤面：**

妹妹的房间传来很多球鞋摩擦地板的声音。

**汤底：**

妹妹的棺椁被打开，里面躲着很多老鼠。

---

## 2. 《宿舍》

**来源：** [许二木S2-1](https://example.test/b)

**汤面：**

今天天气很热，老大在宿舍门口吃冰棍。

**汤底：**

这是雪山循环，帐篷外的人都是过去的自己。
`;

const tmpRoots: string[] = [];

function makeDbPath() {
  const root = join(tmpdir(), `turtle-md-import-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpRoots.push(root);
  mkdirSync(root, { recursive: true });
  return join(root, "app.sqlite");
}

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tmpRoots.length = 0;
});

describe("markdown puzzle import", () => {
  it("parses markdown table rows", () => {
    const rows = parseMarkdownPuzzleTable(sampleTable);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      index: 1,
      title: "妹妹的房间",
      surface: "妹妹的房间传来声音\n我开门看了一眼",
      truth: "妹妹的头七。保安担心事情败露。",
      sourceTitle: "许二木S2-1",
      sourceUrl: "https://zhuanlan.zhihu.com/p/1937434215919646614"
    });
  });

  it("parses source markdown links", () => {
    expect(parseSourceLink("[许二木S1](https://example.test/a)")).toEqual({
      sourceTitle: "许二木S1",
      sourceUrl: "https://example.test/a"
    });
    expect(parseSourceLink("经典海龟汤")).toEqual({ sourceTitle: "经典海龟汤", sourceUrl: undefined });
  });

  it("parses markdown heading sections", () => {
    const rows = parseMarkdownPuzzleSections(sampleSections);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      index: 1,
      title: "妹妹的房间",
      surface: "妹妹的房间传来很多球鞋摩擦地板的声音。",
      truth: "妹妹的棺椁被打开，里面躲着很多老鼠。",
      sourceTitle: "许二木S2-1",
      sourceUrl: "https://example.test/a"
    });
    expect(rows[1].title).toBe("宿舍");
  });

  it("converts a parsed row into an auto-published managed puzzle", () => {
    const [row] = parseMarkdownPuzzleTable(sampleTable);
    const puzzle = convertMarkdownRowToPuzzle(row);

    expect(puzzle.id).toBe("md-1-mei-mei-de-fang-jian");
    expect(puzzle.title).toBe("妹妹的房间");
    expect(puzzle.status).toBe("published");
    expect(puzzle.publishedAt).toBeTruthy();
    expect(puzzle.rawText).toContain("汤面：妹妹的房间传来声音");
    expect(puzzle.solutionPoints.length).toBeGreaterThanOrEqual(1);
    expect(puzzle.tags).toEqual(["本格", "清汤", "全人类", "入门"]);
    expect(puzzle.tags).not.toContain("许二木");
  });

  it("uses safe taxonomy tags instead of concrete markdown answer facts", () => {
    const puzzle = convertMarkdownRowToPuzzle({
      index: 9,
      title: "镜中人",
      surface: "我在镜子里看见了和爸爸一模一样的人。",
      truth: "爸爸已经被替换，真正的爸爸被杀死藏了起来。",
      sourceTitle: "许二木S1",
      sourceUrl: "https://example.test/source"
    });

    expect(puzzle.tags).toEqual(["本格", "红汤", "全人类", "入门"]);
    expect(puzzle.tags).not.toContain("爸爸被替换");
    expect(puzzle.tags).not.toContain("许二木");
  });

  it("splits long truth text into short atomic solution points", () => {
    const puzzle = convertMarkdownRowToPuzzle({
      index: 1,
      title: "妹妹的房间",
      surface: "妹妹的房间传来很多球鞋摩擦地板的声音，房门虚掩着，我开门看了一眼，妹妹空洞的眼神正望着我，我急忙去叫保安，结果我死了",
      truth: "妹妹的头七，我去坟前扫墓，却听到棺材里传来运动鞋摩擦地板的声音，我感到很奇怪，挖开妹妹的坟墓看了一下，发现妹妹的棺椁被人打开了，里面躲着密密麻麻的老鼠，而妹妹的尸体也被老鼠啃食的面目全非。吓得我急忙去叫保安。原来保安有恋尸癖，他作案之后没有给妹妹的棺材盖好，才导致老鼠顺着缝隙钻进棺材里，保安担心事情败露，便把我也鲨了",
      sourceTitle: "许二木S2-1",
      sourceUrl: "https://example.test/source"
    });

    const labels = parseSolutionPointDefinitions(puzzle.solutionPoints).map((point) => point.label);
    expect(labels).toContain("妹妹已经死亡");
    expect(labels).toContain("棺材被人打开");
    expect(labels).toContain("保安有恋尸癖");
    expect(labels).toContain("叙述者被杀死");
    expect(puzzle.solutionPoints).toHaveLength(8);
    expect(parseSolutionPointDefinitions(puzzle.solutionPoints).every((point) => point.label.length <= 18)).toBe(true);
  });

  it("normalizes cold water facts into weighted non-duplicative solution points", () => {
    const puzzle = convertMarkdownRowToPuzzle({
      index: 3,
      title: "冷掉的水",
      surface: "男人喝了一口冷水后立刻报警。",
      truth: "他离家前倒的是热水。杯子变冷且位置没变，说明有人进入房间并替换了杯中液体，他意识到独居住所被入侵。",
      sourceTitle: "测试来源",
      sourceUrl: "https://example.test/cold-water"
    });

    expect(puzzle.solutionPoints).toEqual([
      "25|water-state|杯中液体状态异常|水变冷,原本是热水",
      "15|cup-position|杯子位置没有明显变化|杯子没动,位置没变",
      "25|intrusion|有人进入房间|有人来过,有人进屋",
      "25|liquid-tampered|有人替换或动过杯中液体|换水,动过水,替换液体",
      "10|realization|男人意识到住所被入侵|报警原因,发现入侵"
    ]);
  });

  it("imports parsed rows into sqlite as published puzzles", () => {
    const db = openDatabase(makeDbPath());
    const repository = createPuzzleRepository(db);

    const result = importMarkdownPuzzles({
      content: sampleTable,
      repository,
      limit: 2
    });

    expect(result).toEqual({ imported: 2, skipped: 0 });
    expect(repository.listManaged("published").map((puzzle) => puzzle.title).sort()).toEqual(["妹妹的房间", "歌声"].sort());
    db.close();
  });

  it("imports markdown heading sections into sqlite as published puzzles", () => {
    const db = openDatabase(makeDbPath());
    const repository = createPuzzleRepository(db);

    const result = importMarkdownPuzzles({
      content: sampleSections,
      repository
    });

    expect(result).toEqual({ imported: 2, skipped: 0 });
    const puzzles = repository.listManaged("published").sort((left, right) => left.title.localeCompare(right.title));
    expect(puzzles.map((puzzle) => puzzle.title)).toEqual(["妹妹的房间", "宿舍"]);
    expect(puzzles[0].surface).toBe("妹妹的房间传来很多球鞋摩擦地板的声音。");
    expect(puzzles[0].truth).toBe("妹妹的棺椁被打开，里面躲着很多老鼠。");
    expect(puzzles[0].sourceUrl).toBe("https://example.test/a");
    db.close();
  });
});
