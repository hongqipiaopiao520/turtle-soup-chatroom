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
