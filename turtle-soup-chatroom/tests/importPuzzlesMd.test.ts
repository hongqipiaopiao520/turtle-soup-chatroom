import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  convertMarkdownRowToPuzzle,
  importMarkdownPuzzles,
  parseMarkdownPuzzleTable,
  parseSourceLink
} from "../scripts/import-puzzles-md.mjs";
import { openDatabase } from "../server/storage/database";
import { createPuzzleRepository } from "../server/storage/puzzleRepository";

const sampleTable = `# 海龟汤去重总表

| # | 标题 | 汤面 | 汤底 | 来源 |
|---:|---|---|---|---|
| 1 | 《妹妹的房间》 | 妹妹的房间传来声音<br>我开门看了一眼 | 妹妹的头七。保安担心事情败露。 | [许二木S2-1](https://zhuanlan.zhihu.com/p/1937434215919646614) |
| 2 | 《歌声》 | 男人和女人喝酒，突然听到熟悉的歌声。 | 项羽听见四面楚歌，知道家乡沦陷。 | [许二木S2-1](https://zhuanlan.zhihu.com/p/1937434215919646614) |
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

  it("converts a parsed row into a reviewing managed puzzle", () => {
    const [row] = parseMarkdownPuzzleTable(sampleTable);
    const puzzle = convertMarkdownRowToPuzzle(row);

    expect(puzzle.id).toBe("md-1-mei-mei-de-fang-jian");
    expect(puzzle.title).toBe("妹妹的房间");
    expect(puzzle.status).toBe("reviewing");
    expect(puzzle.rawText).toContain("汤面：妹妹的房间传来声音");
    expect(puzzle.solutionPoints.length).toBeGreaterThanOrEqual(1);
    expect(puzzle.tags).toContain("许二木");
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

    expect(puzzle.solutionPoints).toContain("妹妹已经死亡");
    expect(puzzle.solutionPoints).toContain("棺材被人打开");
    expect(puzzle.solutionPoints).toContain("保安有恋尸癖");
    expect(puzzle.solutionPoints).toContain("叙述者被杀死");
    expect(puzzle.solutionPoints).toHaveLength(8);
    expect(puzzle.solutionPoints.every((point) => point.length <= 18)).toBe(true);
  });

  it("imports parsed rows into a sqlite review queue", () => {
    const db = openDatabase(makeDbPath());
    const repository = createPuzzleRepository(db);

    const result = importMarkdownPuzzles({
      content: sampleTable,
      repository,
      limit: 2
    });

    expect(result).toEqual({ imported: 2, skipped: 0 });
    expect(repository.listManaged("reviewing").map((puzzle) => puzzle.title).sort()).toEqual(["妹妹的房间", "歌声"].sort());
    db.close();
  });
});
