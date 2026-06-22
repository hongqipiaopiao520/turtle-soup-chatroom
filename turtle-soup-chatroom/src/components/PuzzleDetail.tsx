import { ArrowLeft, Play, Star, Users } from "lucide-react";
import type { Puzzle } from "../shared/types";

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

export function PuzzleDetail({
  puzzle,
  onBack,
  onStart
}: {
  puzzle: Puzzle;
  onBack: () => void;
  onStart: (puzzle: Puzzle) => void;
}) {
  return (
    <main className="app-shell detail-shell">
      <button className="ghost-button" onClick={onBack}>
        <ArrowLeft size={16} /> 返回
      </button>
      <section className="detail-panel">
        <div className="detail-title-row">
          <div>
            <h1>{puzzle.title}</h1>
            <div className="tag-row">
              <span className={`difficulty difficulty-${puzzle.difficulty}`}>
                {difficultyLabel[puzzle.difficulty]}
              </span>
              {puzzle.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          </div>
          <button className="primary-button" onClick={() => onStart(puzzle)}>
            <Play size={16} /> 开始游戏
          </button>
        </div>
        <h2>🍜 汤面</h2>
        <p className="surface-text">{puzzle.surface}</p>
        <div className="stats-grid">
          <span><Star size={16} /> {puzzle.rating.toFixed(1)} / 10</span>
          <span><Users size={16} /> {puzzle.plays} 游玩</span>
          <span>平均提问 12.9 次</span>
          <span>通关率 62%</span>
        </div>
      </section>
    </main>
  );
}
