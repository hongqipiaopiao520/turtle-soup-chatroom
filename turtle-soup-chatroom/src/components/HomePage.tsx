import { FileSearch, Play, Search, Shuffle, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { StoredRoomSession } from "../client/roomSessionMemory";
import { collectTags, filterPuzzles } from "../shared/puzzleFilters";
import type { Difficulty, PublicPuzzle, PuzzleSort } from "../shared/types";
import { PuzzleCard } from "./PuzzleCard";
import { SelectField } from "./ui";

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

const hostPersonas = [
  {
    id: "xiaowai",
    name: "小歪",
    role: "友好主持",
    line: "轻松控场，偶尔吐槽，把离谱脑洞拉回案台。",
    image: "/assets/host-xiaowai.png"
  },
  {
    id: "dav",
    name: "大V",
    role: "冷面侦探",
    line: "灰衣墨镜，专治绕远推理，回答很短，压迫感很足。",
    image: "/assets/host-dav.png"
  },
  {
    id: "guigui",
    name: "龟龟",
    role: "慢速观察员",
    line: "佛系陪推，慢慢点头，适合把节奏放稳。",
    image: "/assets/host-guigui.png"
  }
] as const;

function pickFeaturedPuzzle(puzzles: PublicPuzzle[]): PublicPuzzle | undefined {
  return [...puzzles].sort((left, right) => {
    const playDelta = right.plays - left.plays;
    if (playDelta !== 0) return playDelta;
    return right.rating - left.rating;
  })[0];
}

function formatFeaturedCaseCode(puzzle?: PublicPuzzle): string {
  return puzzle ? "CASE-001" : "CASE-EMPTY";
}

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
  const featuredPuzzle = useMemo(() => pickFeaturedPuzzle(availablePuzzles), [availablePuzzles]);
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
          <span className="status-pill">{availablePuzzles.length} 题库</span>
          <button className="primary-button" onClick={onRandomPuzzle}>
            <Shuffle size={16} /> 随机一题
          </button>
        </div>
      </header>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="case-hero-panel">
          <div className="case-desk-visual" aria-hidden="true">
            <span className="case-desk-folder case-desk-folder-back" />
            <span className="case-desk-folder case-desk-folder-front" />
            <span className="case-desk-pin case-desk-pin-one" />
            <span className="case-desk-pin case-desk-pin-two" />
            <span className="case-desk-line case-desk-line-one" />
            <span className="case-desk-line case-desk-line-two" />
            <span className="case-desk-scan" />
          </div>
          <div className="case-file-header">
            <span className="panel-kicker"><FileSearch size={14} /> 今日案件桌</span>
            <span className="case-file-code">{formatFeaturedCaseCode(featuredPuzzle)}</span>
          </div>
          <div className="case-file-body">
            <div>
              <h2 id="home-hero-title">{featuredPuzzle?.title ?? "等待新案件"}</h2>
              <p>{featuredPuzzle?.surface ?? "题库为空时，这里会显示下一份可推理的案件档案。"}</p>
            </div>
            <div className="case-meta-grid">
              <span>{featuredPuzzle ? difficultyLabel[featuredPuzzle.difficulty] : "待定"}<small>难度</small></span>
              <span>{featuredPuzzle?.rating.toFixed(1) ?? "—"}<small>评分</small></span>
              <span>{featuredPuzzle?.plays ?? 0}<small>游玩</small></span>
            </div>
          </div>
          <div className="case-hero-actions">
            <button
              className="primary-button"
              disabled={!featuredPuzzle}
              onClick={() => featuredPuzzle && onOpenPuzzle(featuredPuzzle)}
            >
              <Play size={16} /> 开始推理
            </button>
            <button className="ghost-button" onClick={onRandomPuzzle}>
              <Shuffle size={16} /> 随机抽案
            </button>
          </div>
          {recentRoom && onResumeRoom && (
            <button className="resume-room-strip" type="button" onClick={() => onResumeRoom(recentRoom)}>
              <span>继续上次房间</span>
              <strong>{recentRoom.puzzleTitle ?? recentRoom.roomId}</strong>
            </button>
          )}
        </div>

        <aside className="host-persona-showcase" aria-label="AI 主持人形象">
          <div className="host-showcase-head">
            <span className="panel-kicker"><Sparkles size={14} /> AI 主持席</span>
            <strong>三种控场风格</strong>
          </div>
          <div className="host-persona-grid">
            {hostPersonas.map((persona) => (
              <article className={`host-persona-card host-persona-card-${persona.id}`} key={persona.id}>
                <div className={`host-persona-avatar host-persona-${persona.id}`} aria-hidden="true">
                  <img src={persona.image} alt="" />
                </div>
                <div>
                  <span>{persona.role}</span>
                  <h3>{persona.name}</h3>
                  <p>{persona.line}</p>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>

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
          <p>先选一碗汤，进房间轮流逼近真相。线索足够时，切到“推理提交”说出完整答案，命中核心真相后解锁汤底和结算。</p>
        </aside>
      </section>
    </main>
  );
}
