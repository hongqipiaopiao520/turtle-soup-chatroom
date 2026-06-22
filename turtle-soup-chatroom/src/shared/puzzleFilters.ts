import type { Puzzle, PuzzleFilters } from "./types";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function filterPuzzles(puzzles: Puzzle[], filters: PuzzleFilters) {
  const query = normalize(filters.query ?? "");

  const filtered = puzzles.filter((puzzle) => {
    const matchesQuery =
      query.length === 0 ||
      normalize(puzzle.title).includes(query) ||
      normalize(puzzle.surface).includes(query) ||
      normalize(puzzle.author).includes(query);

    const matchesDifficulty =
      !filters.difficulty ||
      filters.difficulty === "all" ||
      puzzle.difficulty === filters.difficulty;

    const matchesTag =
      !filters.tag || filters.tag === "all" || puzzle.tags.includes(filters.tag);

    return matchesQuery && matchesDifficulty && matchesTag;
  });

  return filtered.sort((a, b) => {
    if (filters.sort === "latest") {
      return b.createdAt.localeCompare(a.createdAt);
    }
    if (filters.sort === "rating") {
      return b.rating - a.rating;
    }
    return b.plays - a.plays || b.rating - a.rating;
  });
}

export function collectTags(puzzles: Puzzle[]) {
  return Array.from(new Set(puzzles.flatMap((puzzle) => puzzle.tags))).sort();
}
