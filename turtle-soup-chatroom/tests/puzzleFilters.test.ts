import { describe, expect, it } from "vitest";
import type { PublicPuzzle } from "../src/shared/types";
import { filterPuzzles } from "../src/shared/puzzleFilters";

const puzzles: PublicPuzzle[] = [
  {
    id: "rain-platform",
    title: "雨夜站台",
    surface: "深夜的站台空无一人，女孩却向空气道谢，然后消失了。",
    difficulty: "medium",
    tags: ["悬疑", "温情"],
    author: "Demo",
    rating: 8.2,
    plays: 42,
    createdAt: "2026-06-01",
    hintCount: 0
  },
  {
    id: "cold-cup",
    title: "冷掉的水",
    surface: "男人喝了一口冷水后立刻报警。",
    difficulty: "easy",
    tags: ["本格", "生活"],
    author: "Demo",
    rating: 7.1,
    plays: 88,
    createdAt: "2026-06-10",
    hintCount: 0
  }
];

describe("filterPuzzles", () => {
  it("matches title and surface text", () => {
    const result = filterPuzzles(puzzles, { query: "冷水", sort: "latest" });
    expect(result.map((p) => p.id)).toEqual(["cold-cup"]);
  });

  it("filters by difficulty and tag", () => {
    const result = filterPuzzles(puzzles, {
      difficulty: "medium",
      tag: "温情",
      sort: "latest"
    });
    expect(result.map((p) => p.id)).toEqual(["rain-platform"]);
  });

  it("sorts by hot score using plays first", () => {
    const result = filterPuzzles(puzzles, { sort: "hot" });
    expect(result.map((p) => p.id)).toEqual(["cold-cup", "rain-platform"]);
  });
});
