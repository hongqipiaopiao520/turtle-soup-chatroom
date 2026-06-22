import { Star, Users } from "lucide-react";
import type { Puzzle } from "../shared/types";

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

export function PuzzleCard({
  puzzle,
  onOpen
}: {
  puzzle: Puzzle;
  onOpen: (puzzle: Puzzle) => void;
}) {
  return (
    <button className="puzzle-card" onClick={() => onOpen(puzzle)}>
      <div className="card-head">
        <h3>{puzzle.title}</h3>
        <span className={`difficulty difficulty-${puzzle.difficulty}`}>
          {difficultyLabel[puzzle.difficulty]}
        </span>
      </div>
      <p>{puzzle.surface}</p>
      <div className="tag-row">
        {puzzle.tags.slice(0, 3).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      <div className="card-foot">
        <span>{puzzle.author}</span>
        <span><Star size={14} /> {puzzle.rating.toFixed(1)}</span>
        <span><Users size={14} /> {puzzle.plays}</span>
      </div>
    </button>
  );
}
