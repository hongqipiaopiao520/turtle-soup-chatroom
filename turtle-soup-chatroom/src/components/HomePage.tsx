import { Search, Shuffle, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { StoredRoomSession } from "../client/roomSessionMemory";
import { collectTags, filterPuzzles } from "../shared/puzzleFilters";
import type { Difficulty, PublicPuzzle, PuzzleSort } from "../shared/types";
import { PuzzleCard } from "./PuzzleCard";
import { SelectField } from "./ui";

export function HomePage({
  puzzles: availablePuzzles,
  recentRoom,
  onOpenPuzzle,
  onRandomPuzzle,
  onResumeRoom
}: {
  puzzles: PublicPuzzle[];
  recentRoom?: StoredRoomSession | null;
  onOpenPuzzle: (puzzle: PublicPuzzle) => void;
  onRandomPuzzle: () => void;
  onResumeRoom?: (session: StoredRoomSession) => void;
}) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [tag, setTag] = useState<string | "all">("all");
  const [sort, setSort] = useState<PuzzleSort>("hot");

  const tags = useMemo(() => collectTags(availablePuzzles), [availablePuzzles]);
  const visiblePuzzles = useMemo(
    () => filterPuzzles(availablePuzzles, { query, difficulty, tag, sort }),
    [availablePuzzles, query, difficulty, tag, sort]
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">AI HOSTED TURTLE SOUP</span>
          <h1>知心李歪聊天室</h1>
        </div>
        <div className="top-actions">
          <span className="status-pill">72 今日活跃</span>
          <button className="primary-button" onClick={onRandomPuzzle}>
            <Shuffle size={16} /> 随机一题
          </button>
        </div>
      </header>

      <section className="toolbar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索谜题、作者..."
          />
        </label>
        <SelectField
          value={difficulty}
          onChange={setDifficulty}
          ariaLabel="难度筛选"
          options={[
            { value: "all", label: "所有难度" },
            { value: "easy", label: "简单" },
            { value: "medium", label: "中等" },
            { value: "hard", label: "困难" }
          ]}
        />
        <SelectField
          value={tag}
          onChange={setTag}
          ariaLabel="标签筛选"
          options={[
            { value: "all", label: "全部标签" },
            ...tags.map((item) => ({ value: item, label: item }))
          ]}
        />
        <SelectField
          value={sort}
          onChange={setSort}
          ariaLabel="排序方式"
          options={[
            { value: "hot", label: "热门" },
            { value: "latest", label: "最新" },
            { value: "rating", label: "评分最高" }
          ]}
        />
      </section>

      <section className="home-grid">
        <div className="puzzle-list">
          {visiblePuzzles.map((puzzle) => (
            <PuzzleCard puzzle={puzzle} onOpen={onOpenPuzzle} key={puzzle.id} />
          ))}
        </div>
        <aside className="activity-panel">
          {recentRoom && onResumeRoom && (
            <button className="resume-room-card" type="button" onClick={() => onResumeRoom(recentRoom)}>
              <span>继续上次房间</span>
              <strong>{recentRoom.puzzleTitle ?? recentRoom.roomId}</strong>
            </button>
          )}
          <h2><Users size={18} /> 今夜案台</h2>
          <p>先选一碗汤，进房间轮流逼近真相。完成度到 95% 后，会统一弹出汤底和本局结算。</p>
        </aside>
      </section>
    </main>
  );
}
