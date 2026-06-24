import { describe, expect, it } from "vitest";
import { parseSolutionPointDefinitions } from "../server/puzzleImporter";
import { seedPuzzles } from "../src/data/seedPuzzles";

describe("parseSolutionPointDefinitions", () => {
  it("parses old plain solution points with stable ids", () => {
    expect(parseSolutionPointDefinitions(["有人进入房间"])).toEqual([
      {
        id: "point-1",
        label: "有人进入房间",
        weight: 1,
        aliases: []
      }
    ]);
  });

  it("parses pipe weighted solution point definitions", () => {
    expect(parseSolutionPointDefinitions(["25|intrusion|有人进入房间|有人来过,有人进屋"])).toEqual([
      {
        id: "intrusion",
        label: "有人进入房间",
        weight: 25,
        aliases: ["有人来过", "有人进屋"]
      }
    ]);
  });

  it("parses human readable weighted point definitions", () => {
    expect(parseSolutionPointDefinitions(["有人替换或动过杯中液体 :: 25 :: 换水 / 动过水"])).toEqual([
      {
        id: "point-1",
        label: "有人替换或动过杯中液体",
        weight: 25,
        aliases: ["换水", "动过水"]
      }
    ]);
  });

  it("defines cold cup as weighted non-duplicative solution points", () => {
    const coldCup = seedPuzzles.find((puzzle) => puzzle.id === "cold-cup");
    expect(coldCup?.solutionPoints).toEqual([
      "25|water-state|杯中液体状态异常|水变冷,原本是热水",
      "15|cup-position|杯子位置没有明显变化|杯子没动,位置没变",
      "25|intrusion|有人进入房间|有人来过,有人进屋",
      "25|liquid-tampered|有人替换或动过杯中液体|换水,动过水,替换液体",
      "10|realization|男人意识到住所被入侵|报警原因,发现入侵"
    ]);
  });
});
