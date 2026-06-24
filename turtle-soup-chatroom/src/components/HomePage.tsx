import { Search, Shuffle, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { StoredRoomSession } from "../client/roomSessionMemory";
import { collectTags, filterPuzzles } from "../shared/puzzleFilters";
import type { Difficulty, PublicPuzzle, PuzzleSort } from "../shared/types";
import { PuzzleCard } from "./PuzzleCard";

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
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty | "all")}>
          <option value="all">所有难度</option>
          <option value="easy">简单</option>
          <option value="medium">中等</option>
          <option value="hard">困难</option>
        </select>
        <select value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="all">全部标签</option>
          {tags.map((item) => (
            <option value={item} key={item}>{item}</option>
          ))}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as PuzzleSort)}>
          <option value="hot">热门</option>
          <option value="latest">最新</option>
          <option value="rating">评分最高</option>
        </select>
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
